// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { base64, http } from "./deps.ts";
import { HttpError, serializeBody, deserializeBody } from "./serial.ts";
import { wrapWebSocket } from "./client.ts";
import type { Serializers } from "./serial.ts";
import type {
  Socket,
  SocketInit,
  EndpointResponse,
} from "./client.ts";
import type { Parser, ParserOutput } from "./parser.ts";

/**
 * A metadata cache object generated once for every Request handled with a Cav
 * handler (Stacks and Rpcs).
 */
export interface RequestContext {
  /**
   * A ResponseInit applied to the Rpc response after resolving and packing the
   * value to send to the client. The Headers object is always available.
   */
  res: ResponseInit & { headers: Headers; };
  /**
   * new URL(req.url)
   */
  url: URL;
  /**
   * The request path. This is intended to be modified by a Stack during request
   * routing. When the RequestContext is initially generated, this is set to the
   * url.pathname. As the request gets processed, the Stack matches this path
   * against registered routes. When a route matches, this path will be set to
   * the unmatched portion of the requested path before calling the matching
   * route handler.
   */
  path: string;
  /**
   * As Stacks process a request, they can capture path groups. The path groups
   * are stored in this object. During name conflicts, old groups will be
   * overwritten by groups captured further down the handler tree.
   */
  groups: Record<string, string>;
  /**
   * An object created from the url.searchParams. This is what gets processed
   * when an Rpc has a "query" parser.
   */
  query: Record<string, string | string[]>;
  /**
   * If this property isn't null, it's a redirect Response that should be
   * returned as soon as possible. It means the client requested a non-canonical
   * path that either ends in a trailing slash or contains empty path segments.
   * Cav requires redirects all non-canonical paths to their canonical version.
   */
  redirect: Response | null;
}

// The RequestContext is tied to the lifetime of the Request by storing a
// reference to the context on the Request itself using this symbol
const _requestContext = Symbol("cav_requestContext");

/**
 * Generates or returns a previously generated RequestContext for a given
 * request. If this is the first time requestContext is being called for the
 * given request, the RequestContext object is generated and returned. Every
 * other time the request passes through this function, the same object
 * generated on the first call is returned without further modification.
 */
export function requestContext(request: Request): RequestContext {
  const req = request as Request & Record<typeof _requestContext, RequestContext>;
  if (req[_requestContext]) {
    return req[_requestContext];
  }

  const url = new URL(req.url);
  const path = `/${url.pathname.split("/").filter(p => !!p).join("/")}`;
  const redirect = (
    path !== url.pathname ? Response.redirect(url.href, 302)
    : null
  );

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

  const ctx: RequestContext = {
    redirect,
    res: { headers: new Headers() },
    url,
    path,
    groups: {},
    query,
  };
  Object.assign(req, { [_requestContext]: ctx });
  return ctx;
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
  // they should still be supported on the server side. Enforcing the
  // maxBodySize in that case would require buffering and reading the body
  // manually, I think? And throwing an error when the max size has been met?
  // Seems like a pain but not sure what else to do
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
 * however. Once you are done accessing and modifying the cookie, you need to
 * call the async "flush()" to sync cookie updates to the response headers that
 * were provided when the cookie was initialized.
 */
export interface Cookie {
  /**
   * The original cookie keys and values, before modifications were made.
   */
  readonly original: { readonly [x: string]: string };
  /**
   * Gets an optionally signed cookie value by its key name.
   */
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
  /**
   * Returns the signed cookie entries as an array.
   */
  signed(): [string, string][];
  /**
   * Returns the unsigned cookie entries as an array.
   */
  unsigned(): [string, string][];
  /**
   * Flushes cookie updates to the response headers that were baked into the
   * cookie.
   */
  flush(): Promise<void>;
}

/**
 * Extends the Deno default cookie set options to include the "signed" flag.
 */
export interface CookieSetOptions extends Omit<http.Cookie, "name" | "value"> {
  /**
   * Whether or not this cookie should be signed. Default: false
   */
  signed?: boolean;
}

/**
 * Limits what paths/domains a cookie should be deleted for.
 */
export interface CookieDeleteOptions {
  /**
   * Limits the deleted cookie to the given path.
   */
  path?: string;
  /**
   * Limits the deleted cookie to the given domain.
   */
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

/** Initializer options for the endpointResponse() function. */
export interface EndpointResponseInit extends ResponseInit {
  /** Additional packers to use when packing the response body. */
  serializers?: Serializers;
}

// TODO: This might be better if it was in serial.ts instead
/**
 * Creates an EndpointResponse from the provided body, which is serialized using
 * the top-level serializeBody function. If the provided body is already a
 * Response object, it will be returned with the init headers applied (if there
 * are any). In that case, the status and statusText init options will be
 * ignored. Extra serializers can be used to extend the data types that can be
 * serialized.
 */
export function endpointResponse<T = unknown>(
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

  if (typeof body === "undefined") {
    return new Response(null, { status: 204, ...init, headers });
  }

  if (body instanceof HttpError && !body.expose) {
    headers.append("content-type", "text/plain");
    return new Response(body.message, {
      status: body.status,
      headers,
    });
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
 * module. Returns the Socket instance and a Response which should be returned
 * by the handler for the socket upgrade to complete successfully.
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

/**
 * Options for running an http server. This is a re-export of the ServerInit
 * type from https://deno.land/std/http/server.ts.
 */
export type ServerInit = http.ServerInit;

/**
 * An http server. This is a re-export of the Server type from
 * https://deno.land/std/http/server.ts.
 */
export type Server = http.Server;

/**
 * Constructs a new server instance. This is a simple function wrapper around
 * the Server constructor from https://deno.land/std/http/server.ts.
 */
export function server(init: ServerInit): Server {
  return new http.Server(init);
}

/**
 * Options for serving an http handler. This is a re-export of the ServeInit
 * type from https://deno.land/std/server.ts.
 */
export type ServeInit = http.ServeInit;

/**
 * Serves HTTP requests with the given handler. (Stacks and Rpcs are handlers.)
 * You can specify an object with a port and hostname option, which is the
 * address to listen on. The default is port 8000 on hostname "0.0.0.0". This is
 * a re-export of the serve() function from
 * https://deno.land/std/http/server.ts.
 */
export const serve = http.serve;
