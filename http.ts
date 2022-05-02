// Copyright 2022 Connor Logan. All rights reserved. MIT License.

// TODO: Make it so that any object shape can be passed in as the query

import { base64, http } from "./deps.ts";
import { serializeBody, deserializeBody } from "./serial.ts";
import { HttpError, wrapWebSocket } from "./client.ts";

import type { Serializers } from "./serial.ts";
import type {
  Socket,
  SocketInit,
  EndpointResponse,
} from "./client.ts";
import type { Parser, ParserOutput } from "./parser.ts";

/**
 * A special 404 HttpError that should be thrown whenever a handler is refusing
 * to respond to a request due to the path not matching constraints. This is
 * thrown by Rpcs when path matching fails. If a Stack catches this error, it
 * will continue looking for matching routes.
 */
export const NO_MATCH = new HttpError("404 not found", { status: 404 });

/**
 * A ResponseInit applied to the Rpc response after resolving and packing the
 * value to send to the client. The Headers object is always available. If the
 * resolved value is a Response object already, the status and statusText will
 * be ignored but the headers will still be applied.
 */
export interface Res extends ResponseInit {
  headers: Headers;
  // Note the extends already covers status and statusText
}

/** A metadata object generated once for every request. */
export interface RequestData {
  /**
   * A ResponseInit applied to the Rpc response after resolving and packing the
   * value to send to the client. The Headers object is always available. If the
   * resolved value is a Response object already, the status and statusText will
   * be ignored but the headers will still be applied.
   */
  res: Res;
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
 *
 * If the request should be redirected before being processed, a Response will
 * be returned instead.
 */
export function requestData(request: Request): RequestData | Response {
  const req = request as Request & Record<typeof _requestData, RequestData>;
  if (req[_requestData]) {
    return req[_requestData];
  }

  const url = new URL(req.url);
  const path = `/${url.pathname.split("/").filter(p => !!p).join("/")}`;
  if (path !== url.pathname) {
    url.pathname = path;
    return Response.redirect(url.href, 302);
  }

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
    res: { headers: new Headers() },
    url,
    path,
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
 * Uses deserializeBody to deserialize the request body.
 */
export async function requestBody(req: Request, opt?: {
  maxSize?: number;
  serializers?: Serializers;
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
  // content-length. Cav doesn't use streamed bodies on the client side, but
  // they should still be supported. Enforcing the maxBodySize in that case
  // would require buffering and reading the body manually, I think? And
  // throwing an error when the max size has been met? Seems like a pain but not
  // sure what else to do
  const length = parseInt(req.headers.get("content-length") || "", 10);
  if (isNaN(length)) {
    throw new HttpError("411 length required", { status: 411 });
  }
  if (maxSize && length > maxSize) {
    throw new HttpError("413 payload too large", { status: 413 });
  }
  return await deserializeBody(req, opt?.serializers);
}

/**
 * Cav's cookie interface. This interface provides synchronous access to cookie
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
  headers: Headers;
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
          http.deleteCookie(init.headers, u.name, u.opt);
        }

        if (u.op === "set") {
          http.setCookie(init.headers, {
            ...u.opt,
            name: u.name,
            value: u.value,
          });
          if (u.opt?.signed) {
            http.setCookie(init.headers, {
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
// REVIEW: I don't know if this is the right thing to do security-wise
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

/**
 * Initializer options for an EndpointResponse.
 */
export interface EndpointResponseInit extends ResponseInit {
  /**
   * Additional packers to use when packing the response body.
   */
  serializers?: Serializers;
}

/**
 * Creates an EndpointResponse from the provided body, which is serialized using
 * the top-level serializeBody function. If the provided body is already a
 * Response object, it will be returned with the headers provided on the init
 * argument applied (if there are any). Extra serializers can be provided on the
 * init argument to extend the data types that can be serialized.
 */
export function response<T = unknown>(
  body: T,
  init?: EndpointResponseInit,
): EndpointResponse<
  T extends EndpointResponse<infer T2> ? T2
  : T extends Response ? unknown
  : T
> {
  const headers = new Headers(init?.headers);

  if (body instanceof Response) {
    for (const [k, v] of headers.entries()) {
      body.headers.append(k, v);
    }
    return body;
  }

  const { body: b, mime: m } = serializeBody(body, init?.serializers);
  if (!headers.has("content-type")) {
    headers.append("content-type", m);
  }
  return new Response(b, {
    ...init,
    headers,
  });
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
  init?: SocketInit<Message>,
): {
  socket: Socket<Send, (
    Message extends Parser ? ParserOutput<Message> : unknown
  )>;
  response: Response;
} {
  try {
    const { socket, response } = Deno.upgradeWebSocket(req, {
      protocol: "json"
    });
    return {
      socket: wrapWebSocket(socket, init),
      response,
    }
  } catch (e) {
    throw new HttpError("400 bad request", {
      status: 400,
      expose: {
        upgradeError: "Failed to upgrade web socket",
        reason: e instanceof Error ? e.message : "unknown",
      },
    });
  }
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
  H extends http.Handler,
> extends Omit<http.ServerInit, "onError"> {
  /**
   * The port to bind to. Default: `80`
   */
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
    ...init,
    handler: async (req, conn) => {
      const data = requestData(req);
      if (data instanceof Response) { // Handle malformed path redirect
        return data;
      }
      
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
        const headers = data.res.headers;
        headers.append("content-length", e.message.length.toString());
        headers.append("content-type", "text/plain");
        return new Response(req.method === "HEAD" ? null : e.message, {
          status: e.status, // 404
          headers: data.res.headers,
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
      data.res.headers.append("content-length", body.length.toString());
      return new Response(req.method === "HEAD" ? null : body, {
        status: (
          err instanceof HttpError && err.status >= 500 ? err.status
          : 500
        ),
        headers: data.res.headers,
      });
    },
  });
}

/**
 * The ServerInit options available when using the serve() shorthand function.
 */
export type ServeOpt = Omit<ServerInit<http.Handler>, "handler">;

/**
 * Shorthand function for quickly serving a Handler. The default bind is
 * localhost:80. This function is a one-liner:
 *
 * ```ts
 * return await server({ ...opt, handler }).listenAndServe();
 * ```
 */
export async function serve(
  handler: http.Handler,
  opt?: ServeOpt,
): Promise<void> {
  return await server({ ...opt, handler }).listenAndServe();
}
