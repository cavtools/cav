// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is server-only.

import { base64, http, path, fileServer, graph } from "./deps.ts";
import { packBody, unpackBody } from "./pack.ts";
import { HttpError, SocketInit, wrapWebSocket } from "./client.ts";

import type { Packers } from "./pack.ts";
import type { Parser } from "./parser.ts";

// TODO: Ability to turn bundle watching off

/**
 * A special 404 HttpError that should be thrown whenever a handler is refusing
 * to respond to a request due to the path not matching constraints. This is
 * thrown by Rpcs when path matching fails. If a Stack catches this error, it
 * will continue looking for matching routes.
 */
export const NO_MATCH = new HttpError("404 not found", { status: 404 });

/** A metadata object generated once for every request. */
export interface RequestData {
  /**
   * Response headers that should be applied to whatever Response ends up being
   * sent back to the client.
   */
  res: Headers;
  /** WHATWG URL object generated from the request.url. */
  url: URL;
  /**
   * The request path. This is intended to be modified by a Stack. When the
   * RequestData is initially generated, this is equal to the url.pathname. As
   * the request gets processed, the Stack matches this path against registered
   * routes. When a route matches and has a forwarded-wildcard (ends in "/*"),
   * this path will be the value of that wildcard inside the next handler
   * (either an Rpc or Stack). When a route matches and doesn't have that
   * wildcard, the Stack will modify this path to be "/" inside the next
   * handler.
   */
  path: string;
  /**
   * As Stacks process a request, they can capture path groups. The path groups
   * are stored in this object. Old groups will be overwritten by groups
   * captured further down the handler tree.
   */
  groups: Record<string, string>;
  /**
   * An object created from the url.searchParams. This is what gets processed
   * when an Rpc has a "query" parser.
   */
  query: Record<string, string | string[]>;
}

const _requestData = Symbol("_requestData");

/**
 * Generates or returns a previously generated RequestData for a given request.
 * If this is the first time requestData is being called for the given request,
 * the RequestData object is generated and returned. Every other time the
 * request passes through this function, the same object generated on the first
 * call is returned without further modification.
 */
export function requestData(request: Request): RequestData {
  const req = request as Request & Record<typeof _requestData, RequestData>;
  if (req[_requestData]) {
    return req[_requestData];
  }

  const url = new URL(req.url);
  const query: Record<string, string | string[]> = {};
  url.searchParams.forEach((v, k) => {
    const old = query[k];
    if (Array.isArray(old)) {
      query[k] = [...old, v];
    } else if (typeof old === "string") {
      query[k] = [old, v];
    } else {
      query[k] = v;
    }
  });

  const data: RequestData = {
    res: new Headers(),
    url,
    path: url.pathname,
    groups: {},
    query,
  };
  Object.assign(req, { [_requestData]: data });
  return data;
}

const methodsWithBodies = new Set([
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
]);

/**
 * Returns a parsed body from a given request after checking size constraints.
 * Uses unpackBody to unpack the request body.
 */
export async function requestBody(req: Request, opt?: {
  maxSize?: number;
  packers?: Packers;
}): Promise<unknown> {
  if (
    !req.body ||
    req.bodyUsed ||
    !methodsWithBodies.has(req.method)
  ) {
    return undefined;
  }

  const maxSize = (
    typeof opt?.maxSize === "number" ? opt.maxSize
    : 5 * 1024 * 1024 // 5mb
  );

  // TODO: With HTTP/2, it's possible to have a streamed body that has no
  // content-length. Cav doesn't use these on the client side, but they should
  // still be supported. Enforcing the maxBodySize in that case would require
  // buffering and reading the body manually, I think?
  const length = parseInt(req.headers.get("content-length") || "", 10);
  if (isNaN(length)) {
    throw new HttpError("411 length required", { status: 411 });
  }
  if (maxSize && length > maxSize) {
    throw new HttpError("413 payload too large", { status: 413 });
  }
  return await unpackBody(req, opt?.packers);
}

/**
 * Cookie interface. This interface provides synchronous access to cookie
 * values. The actual signing of signed cookies needs to be asynchronous,
 * however. In order to compensate for this, once you are done accessing and
 * modifying the cookie, you need to call the async "flush()" in order to sync
 * cookie updates to the response headers that were provided when the cookie was
 * initialized.
 */
export interface Cookie {
  /** The original cookie keys and values, before modifications were made. */
  readonly original: { readonly [x: string]: string };
  /** Gets an optionally signed cookie value by its key name. */
  get(name: string, opt?: { signed?: boolean }): string | undefined;
  /**
   * Sets a cookie value using the Deno std http module's cookie options. To
   * accomadate signed cookies, the options type is extended to include the
   * "signed" flag.
   */
  set(name: string, value: string, opt?: CookieSetOptions): void;
  /**
   * Unsets a cookie value by key. Path and domain can be specified to limit how
   * the cookie is deleted. When deleting cookies for paths/domains that don't
   * match the request URL, the cookie value will not be removed from the cookie
   * object but the set-cookie header will still be sent on the response.
   */
  delete(name: string, opt?: CookieDeleteOptions): void;
  /** Returns the signed cookie entries as an array. */
  signed(): [string, string][];
  /** Returns the unsigned cookie entries as an array. */
  unsigned(): [string, string][];
  /**
   * Asynchronously flushes cookie updates to the response headers that were
   * baked into the cookie.
   */
  flush(): Promise<void>;
}

/** Extends the Deno default cookie set options to include the "signed" flag. */
export interface CookieSetOptions extends Omit<http.Cookie, "name" | "value"> {
  /** Whether or not this cookie should be signed. Default: false */
  signed?: boolean;
}

/** Limits what paths/domains a cookie should be deleted for. */
export interface CookieDeleteOptions {
  /** Limits the deleted cookie to the given path. */
  path?: string;
  /** Limits the deleted cookie to the given domain. */
  domain?: string;
}

const random = new Uint8Array(32);
crypto.getRandomValues(random);
const decoder = new TextDecoder();
const rand = decoder.decode(random);
const fallbackKeys: [string, ...string[]] = [base64.encode(rand)];

/**
 * Creates a cookie tied to the given request and response headers. The keys
 * provided will be used for cookie signing; if no keys are provided, a random
 * fallback key will be used. Keys need to be provided in an array, making key
 * rotation easier.
 */
export async function bakeCookie(init: { // Using just "cookie" was annoying
  req: Request;
  res: Headers;
  keys?: [string, ...string[]];
}): Promise<Cookie> {
  const keys = init.keys || fallbackKeys;
  const original = http.getCookies(init.req.headers);
  const unsigned = { ...original };
  const signed: Record<string, string> = {};

  for (const [k, v] of Object.entries(unsigned)) {
    const sig = unsigned[`${k}.sig`];
    if (sig) {
      delete unsigned[`${k}.sig`];
      delete unsigned[k];
      if (await verify(v, sig, keys)) {
        signed[k] = v;
      }
    }
  }

  const updates: (
    | { op: "set", name: string, value: string, opt?: CookieSetOptions }
    | { op: "delete", name: string, opt?: CookieDeleteOptions }
  )[] = [];

  const cookie: Cookie = {
    original,
    get(name, opt) {
      return opt?.signed ? signed[name] : unsigned[name];
    },
    set(name, value, opt) {
      updates.push({ op: "set", name, value, opt });

      // If the current request doesn't match the path and domain for the set
      // cookie, don't set our cookie since the client's cookie for this path
      // and domain won't be set either
      if (opt?.path || opt?.domain) {
        const p = new URLPattern({
          hostname: opt.domain ? `{*.}?${opt.domain}` : "*",
          pathname: opt.path ? `${opt.path}/*?` : "*",
        });
        if (!p.exec(init.req.url)) {
          return;
        }
      }

      // Update our copy if the cookie path and domain matched the current
      // request or weren't specified
      if (opt?.signed) {
        signed[name] = value;
      } else {
        unsigned[name] = value;
      }
    },
    delete(name, opt) {
      updates.push({ op: "delete", name, opt });
      if (signed[name]) {
        updates.push({ op: "delete", name: `${name}.sig`, opt });
      }
      
      // If the current request doesn't match the path and domain for the
      // deleted cookie, don't delete our cookie since the client's cookie for
      // this path and domain won't be deleted either
      if (opt?.path || opt?.domain) {
        const p = new URLPattern({
          hostname: opt.domain ? `{*.}?${opt.domain}` : "*",
          pathname: opt.path ? `${opt.path}/*?` : "*",
        });
        if (!p.exec(init.req.url)) {
          return;
        }
      }

      // Delete our copy if the cookie path and domain matched the current
      // request or weren't specified
      delete signed[name];
      delete unsigned[name];
    },
    signed() {
      return Object.entries(signed);
    },
    unsigned() {
      return Object.entries(unsigned);
    },
    async flush() {
      // TODO: Apply sensible default cookie options based on the request
      // information, like secure if the request is https etc.
      let u = updates.shift();
      while (u) {
        if (u.op === "delete") {
          http.deleteCookie(init.res, u.name, u.opt);
        }

        if (u.op === "set") {
          http.setCookie(init.res, {
            ...u.opt,
            name: u.name,
            value: u.value,
          });
          if (u.opt?.signed) {
            http.setCookie(init.res, {
              ...u.opt,
              name: `${u.name}.sig`,
              value: await sign(u.value, keys[0]),
            });
          }
        }

        u = updates.shift();
      }
    },
  };

  return cookie;
}

// I'm caching keys because I don't know the overhead of crypto.subtle.importKey
const keyCache = new Map<string, CryptoKey>();
const encoder = new TextEncoder();
const signingAlg = { name: "HMAC", hash: "SHA-256" } as const;

async function importKey(key: string): Promise<CryptoKey> {
  let k = keyCache.get(key);
  if (k) {
    return k;
  }

  k = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    signingAlg,
    false,
    ["sign", "verify"],
  );
  keyCache.set(key, k);
  return k;
}

async function verify(
  data: string,
  sig: string,
  keys: [string, ...string[]],
): Promise<boolean> {
  for (const key of keys) {
    const k = await importKey(key);
    if (
      await crypto.subtle.verify(
        signingAlg,
        k,
        base64.decode(sig),
        encoder.encode(data),
      )
    ) {
      return true;
    }
  }
  return false;
}

async function sign(data: string, key: string): Promise<string> {
  const k = await importKey(key);
  return base64.encode(
    await crypto.subtle.sign(
      signingAlg,
      k,
      encoder.encode(data),
    ),
  );
}

const _typedResponse = Symbol("_typedResponse");

/**
 * A Response, but with an unused type parameter indicating the type of the
 * response body.
 */
export interface TypedResponse<T = unknown> extends Response {
  [_typedResponse]?: T; // Imaginary
}

/** Extracts the response body type from a TypedResponse. */
export type ResponseType<R extends Response> = (
  R extends TypedResponse<infer T> ? T
  : unknown
);

/** Initializer options for a TypedResponse. Adds packers to ResponseInit. */
export interface TypedResponseInit extends ResponseInit {
  /** Additional packers to use when packing the response body. */
  packers?: Packers;
}

/**
 * Creates a TypedResponse from the provided body, which undergoes packing via
 * packBody. Extra packers can be provided using the "packers" option on the
 * init argument. If a Response is passed in as the body, its body will be used
 * without re-packing; headers and status/text will still be updated to match
 * the provided init.
 */
export function response<T = unknown>(
  body: T,
  init?: TypedResponseInit,
): TypedResponse<
  T extends TypedResponse<infer T2> ? T2
  : T extends Response ? unknown
  : T
> {
  const headers = new Headers(init?.headers);

  if (body instanceof Response) {
    for (const [k, v] of body.headers.entries()) {
      headers.append(k, v);
    }
    const statusText = (
      !init?.status || body.status === init.status ? body.statusText
      : init?.statusText
    );
    return new Response(body.body, {
      status: init?.status || body.status,
      statusText,
      headers,
    })
  }

  const { body: b, mime: m } = packBody(body, init?.packers);
  if (!headers.has("content-type")) {
    headers.append("content-type", m);
  }
  return new Response(b, {
    ...init,
    headers,
  });
}

const _socketResponse = Symbol("_socketResponse");

/**
 * A regular response that gets returned when a socket connection is
 * established. The type parameter indicates the type of message the client can
 * expect to receive from the server.
 */
export interface SocketResponse<Send> extends Response {
  [_socketResponse]?: Send; // Imaginary
}

/**
 * The server-side equivalent of the wrapWebSocket function in the client
 * module. Returns a Response which should be returned by the handler for the
 * socket upgrade to complete successfully.
 */
export function upgradeWebSocket<
  Send = unknown,
  Message extends Parser | null = null,
>(
  req: Request,
  init?: SocketInit<Send, Message>,
): Response {
  let raw: WebSocket;
  let response: SocketResponse<Send>;
  try {
    const upgrade = Deno.upgradeWebSocket(req, { protocol: "json" });
    raw = upgrade.socket;
    response = upgrade.response as SocketResponse<Send>;
  } catch (e) {
    throw new HttpError("400 bad request", {
      status: 400,
      expose: {
        upgradeError: "Failed to upgrade web socket",
        reason: e instanceof Error ? e.message : "unknown",
      },
    });
  }

  wrapWebSocket(raw, init);
  return response;
}

const _server = Symbol("_server");

/**
 * The standard http.Server type, but with a type parameter indicating the type
 * of the handler that was passed in. The handler will usually be a Stack but
 * could be any other type of Handler.
 */
export interface Server<H extends http.Handler> extends http.Server {
  [_server]?: H; // Imaginary
}

/**
 * The standard http.ServerInit type with a type parameter indicating the type
 * of the handler this server is serving. Additionally, the "onError" property
 * has been omitted; errors in Cav should be handled at the Rpc level, as close
 * as possible to where the error occurred. When an error bubbles up to the
 * Server level, it will be logged and a 500 Response will be sent to the
 * client.
 */
export interface ServerInit<
  H extends http.Handler = http.Handler,
> extends Omit<http.ServerInit, "onError"> {
  /** The port to bind to. Default: `8000` */
  port?: number;
  handler: H;
}

/**
 * Creates a Server using the provided ServerInit. Note that there is no
 * "onError" init option; errors that bubble up to the Server level are logged
 * and a 500 Response is sent back to the client. You should handle errors as
 * close as possible to where the error occurred, for example using the Rpc
 * "onError" init option.
 */
export function server<H extends http.Handler>(
  init: ServerInit<H>,
): Server<H> {
  return new http.Server({
    port: 8000,
    ...init,
    handler: async (req, conn) => {
      const data = requestData(req)
      
      let err: unknown = null;
      try {
        return await init.handler(req, conn);
      } catch (e) {
        err = e;
      }

      // Only three kinds of error should bubble up to this point legitimately:
      // the NO_MATCH error, a 500+ HttpError, or an error of some other class.
      // If it's a NO_MATCH, manually serialize it. If it's any other kind of
      // error, continue to bugtracing below.
      if (err === NO_MATCH) {
        const e = err as HttpError;
        const headers = data.res;
        headers.append("content-length", e.message.length.toString());
        headers.append("content-type", "text/plain");
        return new Response(req.method === "HEAD" ? null : e.message, {
          status: e.status, // 404
          headers: data.res,
        });
      }

      // Add a bugtrace code, log the error stack, and send a 500 with the
      // code appended
      const bugtrace = crypto.randomUUID().slice(0, 8);
      console.error(
        `Error [${bugtrace}]: Uncaught exception during "${req.method} ${req.url}" -`,
        err, // REVIEW
      );
      const body = `500 internal server error [${bugtrace}]`;
      data.res.append("content-length", body.length.toString());
      return new Response(req.method === "HEAD" ? null : body, {
        status: (
          err instanceof HttpError && err.status >= 500 ? err.status
          : 500
        ),
        headers: data.res,
      });
    },
  });
}

/**
 * Shorthand function for quickly serving a Handler. This function is a
 * one-liner:
 *
 * ```ts
 * return await server({ ...init, handler }).listenAndServe();
 * ```
 */
export async function serve(
  handler: http.Handler,
  init?: Omit<ServerInit<http.Handler>, "handler">,
): Promise<void> {
  return await server({ ...init, handler }).listenAndServe();
}

/** Options controlling how assets are found and served. */
export interface ServeAssetOptions {
  /**
   * Sets the current working directory when looking for assets. If a file://
   * path is provided, the parent folder of the path is used. This is useful if
   * you want to serve assets relative to the current file using
   * `import.meta.url`. Default: `"."`
   */
  cwd?: string;
  /** The directory to serve assets from inside the cwd. Default: `"assets"` */
  dir?: string;
  /**
   * Path of the file to serve relative to the dir (which is relative to the
   * cwd). The full path of the file on disk can be conceptualized as
   * `denoPath.join(cwd, dir, path)`. This option is required, and should
   * typically be equal to the "path" property on the ResolverArg of an Rpc's
   * Resolver function or on the OnErrorArg inside an error handler.
   */
  path: string;
  /**
   * When a requested path resolves to a directory and one of these files is
   * found inside that directory, that file will be served instead of a 404
   * error. Default: `["index.html"]`
   */
  indexes?: string[];
  /**
   * When a requested file isn't found, each of these extensions will be
   * appended to the request path and checked for existence. If the request path
   * plus one of these extensions is found, that file will be served instead of
   * a 404 error. Default: `["html"]`
   */
  tryExtensions?: string[];
  /**
   * Path to use when the provided path results in a 404 error. Use this to
   * serve a 404 page. If this isn't specified, 404 errors will bubble. Default:
   * `undefined`
   */
  path404?: string;
  /**
   * Once a request's on-disk file path is calculated, the file path will be
   * passed through each of these provided bundlers. If a bundler returns a
   * Response, that Response will be served instead of the on-disk file and the
   * bundling process is halted. Bundlers are responsible for their own caching
   * techniques. If no array is specified, files are served as-is from disk.
   * Default: `undefined`
   */
  bundlers?: Bundler[];
}

/**
 * Response factory for serving static assets. Asset resolution uses the
 * provided ServeAssetOptions, the Request is only used for caching headers like ETag
 * etc.
 */
export async function serveAsset(
  req: Request,
  opt: ServeAssetOptions,
): Promise<Response> {
  let cwd = opt.cwd || ".";
  const dir = opt.dir || "assets";
  const filePath = opt.path;
  const indexes = opt.indexes || ["index.html"];
  const tryExtensions = opt.tryExtensions || ["html"];
  const path404 = opt.path404;

  // This allows you to, for example, specify import.meta.url as a cwd. If cwd
  // is a file:// url, the last path segment (the basename of the "current"
  // typescript file) will be excluded
  if (cwd.startsWith("file://")) {
    cwd = path.join(path.fromFileUrl(cwd), "..");
  }

  // Wrap the processing procedure because it gets used multiple times when
  // there's a 404
  const process = async (filePath: string) => {
    // Get the full file path by joining the cwd, dir, and resolved path
    filePath = path.join(
      cwd,
      dir,
      path.resolve(path.join("/", filePath)),
    );
  
    // Look for the file to serve
    let fileInfo: Deno.FileInfo | null = null;
    try {
      fileInfo = await Deno.stat(filePath);
    } catch {
      // It didn't exist, try the extensions
      for (const ext of tryExtensions) {
        try {
          const p = `${filePath}.${ext}`;
          const info = await Deno.stat(p);
          if (info.isFile) {
            filePath = p;
            fileInfo = info;
            break;
          }
        } catch {
          continue;
        }
      }
    }
    if (fileInfo && fileInfo.isDirectory) {
      // It was a directory, look for index files
      for (const index of indexes) {
        try {
          const p = path.join(filePath, index);
          const info = await Deno.stat(p);
          if (info.isFile) {
            filePath = p;
            fileInfo = info;
            break;
          }
        } catch {
          continue;
        }
      }
    }
    if (fileInfo === null) {
      throw new HttpError("404 not found", { status: 404 });
    }
    
    // Bundling procedure
    if (opt.bundlers) {
      for (const b of opt.bundlers) {
        const resp = await b(req, filePath);
        if (resp) {
          return resp;
        }
      }
    }

    // Just serve the file if no bundlers took care of it
    try {
      return await fileServer.serveFile(req, filePath);
    } catch (e) {
      if (e.message === "404 not found") {
        throw new HttpError("404 not found", { status: 404 });
      }
      throw e;
    }
  };

  // Serve the asset. If the asset wasn't found and an error page was specified,
  // serve that instead. If that also wasn't found, throw a 500 error with
  // details
  try {
    return await process(filePath);
  } catch (e1) {
    if (e1 instanceof HttpError && e1.status === 404) {
      if (path404) {
        try {
          return await process(path404);
        } catch (e2) {
          throw new HttpError("Couldn't serve 404 error page", {
            status: 500,
            detail: { e1, e2 },
          });
        }
      }
      throw NO_MATCH;
    }
    throw e1;
  }
}

/**
 * Bundlers, when provided to the assets() function, will receive the on-disk
 * path of a requested file. The bundler can then return null if it doesn't
 * apply to the requested file, or it can return a Response to serve instead of
 * using the standard library's fileServer to serve the file from disk. Bundlers
 * are responsible for handling their own caching techniques.
 */
export interface Bundler {
  (req: Request, filePath: string): Promise<Response | null> | Response | null;
}

// Used below to cache the location of compiled typescript bundles, which are
// stored on disk as temporary files
const tsBundles = new Map<string, string>();
self.addEventListener("unload", () => {
  for (const [_, v] of tsBundles.entries()) {
    try {
      Deno.removeSync(v);
    } catch {
      // continue
    }
  }
});

/**
 * Constructs an asset Bundler for .ts and .tsx files. This uses Deno's runtime
 * compiler API under the hood, which requires the --unstable flag.
 * (https://deno.land/manual/typescript/runtime)
 *
 * Bundles are cached into temporary files on disk, which requires the
 * --allow-write flag. The temporary files are removed from disk when the server
 * process is asked to shut down gracefully.
 *
 * Files that get bundled will have themselves and their dependencies watched
 * for file changes using Deno.watchFs(). If changes are made and the file is
 * still present, its cached bundle will be rebuilt. If problems occur during
 * re-bundling, the cached bundle will be evicted and the bundle will be rebuilt
 * the next time it's requested.
 *
 * Bundled typescript can be imported with module script tags in HTML, like
 * this: `<script type="module" src="/bundle.ts"></script>`. The mime type will
 * be correctly served as "application/javascript", despite the extension. The
 * "lib" typescript option while bundling is equivalent to using the following
 * deno.json config:
 *
 * ```json
 * {
 *   "compilerOptions": {
 *     "lib": [
 *      "dom",
 *      "dom.iterable",
 *      "dom.asynciterable",
 *      "esnext"
 *     ]
 *   }
 * }
 * ```
 *
 * The typescript assets can be thought of as "gateways" into your client-side
 * application code. They can import from anywhere, not just the assets folder,
 * and all dependencies will be bundled into the served file. Take this into
 * account when thinking about code splitting; having multiple typescript asset
 * files include the same dependency means that dependency will be served
 * multiple times to the client, which will waste bandwidth. A good standard
 * practice would be to have just one bundle.ts file in your assets folder which
 * imports/exports everything the browser application needs.
 *
 * To avoid bundling a dependency, you can import it asynchronously using the
 * import() function. Dependencies imported this way will not be bundled in the
 * served file, but remember the importing happens inside the browser, which
 * follows different resolution rules; you won't be able to import files from
 * outside the assets folder like you can with regular imports. Tip: Top-level
 * await works in Deno, making it easy to import non-bundled dependencies in the
 * same place you import bundled dependencies. Like this:
 *
 * ```ts
 * // <root>/assets/bundle.ts
 * import { bundled1 } from "../outside/assets.ts";
 * import { bundled2 } from "https://null1.localhost/remote.ts";
 * const { notBundled1 } = await import("./inside/assets.ts");
 * const { notBundled2 } = await import("https://null2.localhost/remote.js");
 * // ... the rest of your browser code ...
 * ```
 *
 * Here's a list of every flag required for this to work:
 * - `--unstable` (required for Deno.emit(), which does the bundling)
 * - `--allow-net` (required by all of Cav)
 * - `--allow-read` (required whenever assets are served)
 * - `--allow-write` (required for writing the bundles to temporary files)
 */
export function tsBundler(): Bundler {
  return async (req: Request, filePath: string) => {
    const ext = path.extname(filePath);
    if (ext !== ".ts" && ext !== ".tsx") {
      return null;
    }

    let bundle = tsBundles.get(filePath) || "";
    if (bundle) {
      return await fileServer.serveFile(req, bundle);
    }

    const emit = async (filePath: string, overwrite?: string) => {
      const js = (await Deno.emit(filePath, {
        bundle: "module",
        check: false,
        compilerOptions: {
          // https://deno.land/manual@v1.19.2/typescript/configuration#using-the-lib-property
          lib: [
            "dom",
            "dom.iterable",
            "dom.asynciterable",
            "esnext",
          ],
        },
      })).files["deno:///bundle.js"];
      bundle = overwrite || await Deno.makeTempFile({ suffix: ".js" });
      await Deno.writeTextFile(bundle, js);
      tsBundles.set(filePath, bundle);

      // Watch for changes in any of the dependencies for the requested file. If
      // changes occur, re-create the bundle
      const fp = path.toFileUrl(filePath).href;
      const g = await graph.createGraph(fp);
      const depsList: string[] = g.modules
        .filter(m => m.specifier.startsWith("file://"))
        .map(m => path.fromFileUrl(m.specifier));

      const respondToUpdates = async () => {
        try {
          for await (const _ of Deno.watchFs(depsList)) {
            break;
          }
          console.log(
            `INFO: ${filePath} - Module updated, rebundling...`,
          );

          try {
            const info = await Deno.stat(filePath);
            if (!info.isFile) {
              throw new Error("Original path is no longer a file");
            }
          } catch (e) {
            console.log(`INFO: ${filePath} - Failed to stat:`, e);
            tsBundles.delete(filePath);
            try {
              await Deno.remove(bundle);
            } catch {
              // No need to do anything
            }
            console.log(`INFO: ${filePath} - Bundle evicted`);
            return;
          }

          try {
            await emit(filePath, bundle);
          } catch (e) {
            console.log(`INFO: ${filePath} - Failed to bundle:`, e);
            console.log(`INFO: ${filePath} - Waiting for updates...`);
            respondToUpdates(); // DON'T await this
            return;
          }

          console.log(
            `INFO: ${filePath} - Rebundled successfully`,
          );
          // Don't call respondToUpdates() here
        } catch (e) {
          console.error(
            `ERROR: ${filePath} - File watcher threw an error:`,
            e
          );
        }
      };

      respondToUpdates(); // DON'T await this
      return bundle;
    };
    
    return await fileServer.serveFile(req, await emit(filePath));
  };
}
