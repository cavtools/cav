// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http, path as stdPath } from "./deps.ts";
import { serveAsset } from "./asset.ts";
import { context } from "./context.ts"
import { noMatch } from "./router.ts";
import { HttpError, packResponse, unpack } from "./serial.ts";
import { cookieJar } from "./cookie.ts";
import { webSocket } from "./ws.ts";
import { normalizeParser } from "./parser.ts";
import { serveBundle } from "./bundle.ts";
import type { EndpointRequest } from "./client.ts";
import type { Parser, ParserInput, ParserOutput } from "./parser.ts";
import type { CookieJar } from "./cookie.ts";
import type { ServeAssetOptions } from "./asset.ts";
import type { WS } from "./ws.ts";
import type { QueryRecord, ParamRecord } from "./context.ts";
import type { ServeBundleOptions } from "./bundle.ts";
import type { PackedResponse } from "./serial.ts";

/** Options for processing requests, used to construct Endpoints. */
export interface EndpointSchema {
  /**
   * URLPattern string to match against the Request's routed path. If the string
   * starts with '^', the full request path will be used instead. The full
   * URLPattern syntax is supported.
   *
   * Any captured path parameters will be merged into the path parameters
   * captured during routing.
   */
  path?: string | null;
  /**
   * Parses any path parameters captured during routing. The result is available
   * as the "param" resolve argument.
   *
   * If an error is thrown during parsing, the endpoint won't match with the
   * request and the router will continue looking for matching handlers.
   */
  param?: Parser<ParamRecord> | null;
  /**
   * Keys to use when signing cookies. The cookies are available as the
   * "cookie" resolve argument.
   */
  keys?: [string, ...string[]] | null;
  /**
   * Factory function endpoints for creating a custom request context, which is
   * available to resolves as the `ctx` argument.
   *
   * Context handling happens after the endpoint matched with the Request but
   * before input validation begins.
   */
  ctx?: ((c: ContextArg) => any) | null;
  /**
   * Parses the query string parameters passed into the URL. Parsed query
   * parameters are available to resolvers as the "query" argument.
   *
   * If parsing fails, `undefined` will be parsed to check for a default value.
   * If that also fails, a 400 bad request error will be sent to the client.
   */
  query?: Parser<QueryRecord> | null;
  /**
   * Limits the size of posted bodies. If a body exceeds the limit, a 413
   * HttpError will be thrown and serialized back to the client.
   *
   * If 0 is specified, body size is unlimited. (Don't do that.) The default is
   * 1024 * 1024 bytes (1 Megabyte).
   */
  maxBodySize?: number | null;
  /**
   * Parses the POSTed body, if there is one. The behavior of this parser
   * determines the methods allowed for this endpoint. The output from parsing
   * is available to resolvers as the "body" argument.
   *
   * If there is no parser, only GET and HEAD requests will be allowed. If there
   * is one and it successfully parses `undefined`, POST will also be allowed.
   * If the parser throws when parsing `undefined`, *only* POST will be allowed. 
   */
  body?: Parser | null;
  /**
   * If specified, an error thrown during request processing will be processed
   * with this function, which can return a value to send back to the client
   * instead of the serialized error.
   */
  error?: ((x: ErrorArg) => any) | null;
}

/** Arguments available to Context functions. */
export interface ContextArg {
  /** The Request being handled. */
  req: Request;
  /**
   * Headers that'll be appended to the returned response after processing has
   * finished.
   */
  headers: Headers;
  /** new URL(req.url) */
  url: URL;
  /** The Deno-provided ConnInfo describing the connection for the request. */
  conn: http.ConnInfo;
  /**
   * The CookieJar for this Request/Response pair, created after the Endpoint
   * matched with the Request.
   */
  cookie: CookieJar;
  /** The path that matched the Endpoint's path schema option. */
  path: string;
  /** The unprocessed query object associated with this request. */
  query: QueryRecord;
  /** The unprocessed path parameters object captured during routing. */
  param: ParamRecord;
  /**
   * When context functions need to run cleanup tasks after the Endpoint has
   * resolved the Response (such as setting cookies, logging performance
   * metrics, etc.), they can use this registration function to do so. Cleanup
   * functions are executed in stack order (last in first out).
   */
  cleanup: (fn: () => Promise<void> | void) => void;
}

/** Arguments available to a ResolveError function. */
export interface ErrorArg {
  /** The Request being processed. */
  req: Request;
  /**
   * Headers that'll be appended to the returned response after processing has
   * finished.
   */
  headers: Headers;
  /** new URL(req.url) */
  url: URL;
  /** Connection information provided by Deno. */
  conn: http.ConnInfo;
  /** The path that matched the Endpoint's path schema option. */
  path: string;
  /** The unprocessed query object associated with this request. */
  query: QueryRecord;
  /** The unprocoessed path parameters object captured during routing. */
  param: ParamRecord;
  /** The offending error. */
  error: unknown;
  /**
   * Packs a given body into a Response before resolving, which can be useful in
   * cases where the deserialized value doesn't match the body type because of
   * explicit content-type headers. Be sure to declare the headers init option
   * `as const`.
   */
  res: typeof packResponse;
  /**
   * Returns a TypeScript/JavaScript bundle as a response. The bundle is cached
   * into memory and, if possible, watched and rebundled whenever updated.
   */
  bundle: (opt: ServeBundleOptions) => Promise<Response>;
  /** Returns a Response created using an asset from an assets directory. */
  asset: (opt?: ServeAssetOptions) => Promise<Response>;
  /**
   * Returns a redirect Response. If the redirect path doesn't specify an
   * origin, the origin of the current request is used. If the path starts with
   * a ".", it is joined with the pathname of the Request url to get the final
   * redirect path. The default status is 302.
   */
  redirect: (to: string, status?: number) => Response;
}

/** Arguments available to the resolve of an endpoint. */
export interface ResolveArg<
  Param extends EndpointSchema["param"],
  Ctx extends EndpointSchema["ctx"],
  Query extends EndpointSchema["query"],
  Body extends EndpointSchema["body"],
> {
  /** The Request being handled. */
  req: Request;
  /**
   * Headers that'll be appended to the returned response after processing has
   * finished.
   */
  headers: Headers;
  /** new URL(req.url) */
  url: URL;
  /** Connection information provided by Deno. */
  conn: http.ConnInfo;
  /** The CookieJar created after the endpoint matched with the Request. */
  cookie: CookieJar;
  /** The path that matched the endpoint's `path` schema option. */
  path: string;
  /** The parsed path parameters captured while routing the request. */
  param: EndpointSchema["param"] extends Param ? ParamRecord : ParserOutput<Param>;
  /** The context created after the endpoint matched the Request. */
  ctx: EndpointSchema["ctx"] extends Ctx ? undefined : ParserOutput<Ctx>;
  /** The parsed query string parameters. */
  query: EndpointSchema["query"] extends Query ? QueryRecord : ParserOutput<Query>;
  /** The parsed Request body, if any. */
  body: EndpointSchema["body"] extends Body ? undefined : ParserOutput<Body>;
  /**
   * Packs a given body into a Response before resolving, which can be useful if
   * you want to set the response status or in cases where the deserialized
   * value doesn't match the body type because of explicit content-type headers.
   * Be sure to declare the headers init option `as const`.
   */
  res: typeof packResponse;
  /**
   * Returns a TypeScript/JavaScript bundle as a response. The bundle is cached
   * into memory and, if possible, watched and rebundled whenever updated.
   */
  bundle: (opt: ServeBundleOptions) => Promise<Response>;
  /** Returns a Response created using an asset from an assets directory. */
  asset: (opt?: ServeAssetOptions) => Promise<Response>;
  /**
   * Returns a redirect Response. If the redirect path doesn't specify an
   * origin, the origin of the current request is used. If the path starts with
   * a ".", it is joined with the pathname of the Request url to get the final
   * redirect path. The default status is 302.
   */
  redirect: (to: string, status?: number) => Response;
}

declare const _endpoint: unique symbol;

/** Cav Endpoint handler, for responding to requests. */
export type Endpoint<
  Schema extends EndpointSchema | null,
  Result,
> = (
  Schema extends null ? {}
  : Schema
) & ((
  req: EndpointRequest<{
    socket?: false;
    query: (
      Schema extends { query: Parser } ? ParserInput<Schema["query"]>
      : QueryRecord | undefined
    );
    body: (
      Schema extends { body: Parser } ? ParserInput<Schema["body"]>
      : undefined
    );
    result: (
      Result extends PackedResponse<any, any, any> ? Result
      : PackedResponse<Result>
    );
  }>,
  conn: http.ConnInfo,
) => Promise<Response>) & {
  // Prevents the type from being shown as a function in the magnifier when the
  // schema is empty
  [_endpoint]?: true;
};

/**
 * Constructs a new Endpoint request handler. The schema properties will be
 * assigned to the returned endpoint function, so that they can be reused on
 * other endpoint schemas.
 */
export function endpoint<
  Schema extends EndpointSchema | null,
  Ctx extends EndpointSchema["ctx"],
  Param extends EndpointSchema["param"],
  Query extends EndpointSchema["query"],
  Body extends EndpointSchema["body"],
  Result = undefined,
>(
  schema: EndpointSchema & Schema & {
    param?: Param;
    ctx?: Ctx;
    query?: Query;
    body?: Body;
  } | null,
  resolve: (
    (x: ResolveArg<Param, Ctx, Query, Body>) => Promise<Result> | Result
  ) | null,
): Endpoint<Schema, Result>;
export function endpoint(
  _schema: EndpointSchema | null,
  _resolve: ((x: ResolveArg<any, any, any, any>) => any) | null,
) {
  const schema = _schema || {};
  const resolve = _resolve || (async () => {});

  const checkMethod = methodChecker(schema.body);
  const matchPath = pathMatcher({
    path: schema.path,
    param: schema.param,
  });
  const parseInput = inputParser({
    query: schema.query,
    body: schema.body,
    maxBodySize: schema.maxBodySize,
  });

  const handler = async (req: Request, conn: http.ConnInfo) => {
    const cavCtx = context(req);
    if (cavCtx.redirect) {
      return cavCtx.redirect;
    }

    // Utilities
    const asset = (opt?: ServeAssetOptions) => serveAsset(req, opt);
    const bundle = (opt: ServeBundleOptions) => serveBundle(req, opt);
    const redirect = (to: string, status?: number) => {
      if (to.startsWith("../") || to.startsWith(".")) {
        to = stdPath.join(url.pathname, to);
      }
      const u = new URL(to, url.origin);
      // NOTE: Don't use Response.redirect. It prevents modifying headers
      // return Response.redirect(u.href, status || 302);
      return new Response(null, {
        status: status || 302,
        headers: { "location": u.href },
      });
    };

    const headers = new Headers();
    const { url } = cavCtx;
    const cleanupTasks: (() => Promise<void> | void)[] = [];
    let output: unknown = undefined;
    let path: string;
    let param: unknown;
    let unparsedParam: ParamRecord;
    let error: unknown = undefined;

    try {
      ({ path, param, unparsedParam } = await matchPath(req));
    } catch {
      return noMatch(new Response("404 not found", { status: 404 }));
    }

    try {
      const options = await checkMethod(req);
      if (options) {
        return options;
      }

      const cookie = await cookieJar(req, schema.keys || undefined);
      cleanupTasks.push(() => cookie.setCookies(headers));

      let ctx: unknown = undefined;
      if (schema.ctx) {
        ctx = await schema.ctx({
          req,
          headers,
          url,
          conn,
          cookie,
          path,
          query: cavCtx.query,
          param: unparsedParam,
          cleanup: (task: () => Promise<void> | void) => {
            cleanupTasks.push(task);
          },
        });
      }

      const { query, body } = await parseInput(req);
      output = await resolve({
        req,
        headers,
        url,
        conn,
        cookie,
        path,
        param: param as any,
        ctx: ctx as any,
        query: query as any,
        body: body as any,
        res: packResponse,
        bundle,
        asset,
        redirect,
      });
    } catch (err) {
      error = err;
      // Check to see if the error function can handle it
      if (schema.error) {
        // If it rethrows, use the newly thrown error instead. If it returns
        // something, that thing should be packed into a Response
        try {
          output = await schema.error({
            req,
            headers,
            url,
            conn,
            error,
            path: cavCtx.path,
            param: cavCtx.param,
            query: cavCtx.query,
            res: packResponse,
            bundle,
            asset: (opt?: ServeAssetOptions) => serveAsset(req, opt),
            redirect,
          });
          error = null;
        } catch (err) {
          error = err;
        }
      }
    }

    // Cleanup
    while (cleanupTasks.length) {
      const task = cleanupTasks.pop()!;
      await task();
    }

    let status: number | undefined = undefined;
    if (error instanceof HttpError) {
      status = error.status;
      output = error.expose ? error : error.message;
    } else if (error) {
      // Triggers a 500 HttpError on the client
      const bugtrace = crypto.randomUUID().slice(0, 5);
      console.error(`ERROR: Uncaught exception [${bugtrace}] -`, error);
      status = 500;
      output = `500 internal server error [${bugtrace}]`;
    }

    const response = packResponse({ status, headers, body: output });
    if (req.method === "HEAD") {
      return new Response(null, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    }
    return response;
  };

  return Object.assign(handler, schema) as any;
}

function methodChecker(
  body?: Parser | null,
): (req: Request) => Promise<Response | null> {
  const parseBody = body && normalizeParser(body);

  let allowed: Set<string> | null = null;
  return async (req: Request) => {
    // On the first request, setup the allowed methods set. Doing it here
    // because the parser can be async, and doing it in a separate async IIFE
    // could lead to a race condition and screw up the tests
    if (!allowed) {
      allowed = new Set(["OPTIONS"]);
      let postRequired = false;
      if (parseBody) {
        try {
          await parseBody(undefined);
        } catch {
          postRequired = true;
        }
      }
      if (postRequired) {
        allowed.add("POST");
      } else {
        allowed.add("GET");
        allowed.add("HEAD");
        if (parseBody) {
          allowed.add("POST");
        }
      }
    }

    if (!allowed.has(req.method)) {
      throw new HttpError("405 method not allowed", { status: 405 });
    }

    return (
      req.method === "OPTIONS" ? new Response(null, {
        headers: {
          allow: Array.from(allowed.values()).join(", "),
        },
      })
      : null
    );
  };
}

function pathMatcher(opt: {
  path?: string | null;
  param?: Parser | null;
}): (req: Request) => Promise<{
  path: string;
  param: unknown;
  unparsedParam: ParamRecord;
}> {
  const useFullPath = opt.path && opt.path.startsWith("^");
  const pattern = new URLPattern(
    useFullPath ? opt.path!.slice(1) : opt.path || "/",
    "http://_",
  );
  const parseParam = (
    typeof opt.param === "function" ? opt.param
    : opt.param ? opt.param.parse
    : null
  );

  return async (req: Request) => {
    const cavCtx = context(req);
    const path = useFullPath ? cavCtx.url.pathname : cavCtx.path;
    const match = pattern.exec(path, "http://_");

    if (!match) {
      throw new HttpError("404 not found", { status: 404 });
    }

    // 0 param should be the path that matched, i.e. the path var already set
    delete match.pathname.groups["0"];

    const unparsedParam = { ...cavCtx.param };
    for (const [k, v] of Object.entries(match.pathname.groups)) {
      unparsedParam[k] = v;
    }

    let param = unparsedParam;
    if (!parseParam) {
      return { path, param, unparsedParam };
    }

    try {
      param = await parseParam(param);
    } catch {
      try {
        param = await parseParam(undefined);
      } catch {
        throw new HttpError("404 not found", { status: 404 });
      }
    }

    return { path, param, unparsedParam };
  };
}

function inputParser(opt: {
  query?: Parser | null;
  body?: Parser | null;
  maxBodySize?: number | null;
}): (req: Request) => Promise<{
  query: unknown;
  body: unknown;
}> {
  const parseQuery = opt.query && normalizeParser(opt.query);
  const parseBody = opt.body && normalizeParser(opt.body);

  return async (req) => {
    const cavCtx = context(req);

    let query: unknown = cavCtx.query;
    if (parseQuery) {
      try {
        query = await parseQuery(query);
      } catch (err) {
        try {
          query = await parseQuery(undefined);
        } catch {
          if (err instanceof HttpError) {
            throw err;
          }
          throw new HttpError((
            err instanceof Error ? err.message
            : "400 bad request"
          ), {
            status: 400,
            detail: { original: err }
          });
        }
      }
    }

    let body: unknown = undefined;
    if (req.body && parseBody) {
      // If the req.body is true, parseBody should also be true due to the
      // method check that happens at the start of request handling. The above
      // conditional is redundant for type purposes
      
      body = await unpack(req, {
        maxBodySize: (
          typeof opt.maxBodySize === "number" ? opt.maxBodySize
          : undefined
        ),
      });

      try {
        body = await parseBody(body);
      } catch (err) {
        if (err instanceof HttpError) {
          throw err;
        }
        throw new HttpError((
          err instanceof Error ? err.message
          : "400 bad request"
        ), {
          status: 400,
          detail: { original: err }
        });
      }
    }

    return { query, body };
  };
}

/** Initializer options for creating an `assets()` endpoint. */
export type AssetsInit = Omit<ServeAssetOptions, "path">;

/**
 * Creates an Endpoint for serving static assets. The routed request path will
 * be used to find the asset to serve from inside the assets directory
 * specified.
 */
export function assets(init?: AssetsInit) {
  return endpoint({ path: "*" as const }, ({ asset }) => asset(init));
}

/** Initializer options for creating a `bundle()` endpoint. */
export type BundleInit = ServeBundleOptions;

/**
 * Creates an endpoint for serving a TypeScript or JavaScript bundle. The bundle
 * is cached into memory and will be watched and rebundled whenever updated, if
 * possible.
 */
export function bundle(init: BundleInit) {
  // Warm up the cache
  serveBundle(new Request("http://_"), init).catch(() => {});
  return endpoint(null, ({ bundle }) => bundle(init));
}

/**
 * Creates an Endpoint that always redirects. The "path" schema option is "/",
 * i.e. the whole request path should have been consumed by the containing
 * router(s) before the request reaches a redirect endpoint. If the redirect
 * path doesn't specify an origin, the origin of the request is used. If the
 * path starts with a "./" or a "../", it's joined with the pathname of the
 * Request url to get the final redirect path. The default status is 302.
 */
export function redirect(to: string, status?: number) {
  return endpoint(null, ({ redirect }) => redirect(to, status || 302));
}

/** Schema options for creating a `socket()` handler. */
export interface SocketSchema extends Omit<
  EndpointSchema,
  "maxBodySize" | "body"
> {
  /**
   * Incoming message parser. Without this, received messages will be typed as
   * `unknown`. When a message fails to parse, an error message will be sent
   * back to the client.
   */
  recv?: Parser | null;
  /**
   * The type of message this Socket expects to send to a connected client. The
   * value of this property doesn't matter, it's only used for the type.
   */
  send?: any;
}

/** Cav endpoint handler for connecting web sockets. */
export type Socket<Schema extends SocketSchema | null> = (
  Schema extends null ? {}
  : Schema
) & ((
  req: EndpointRequest<{
    socket: true;
    query: (
      Schema extends { query: Parser } ? ParserInput<Schema["query"]>
      : QueryRecord | undefined
    );
    body: (
      Schema extends { body: Parser } ? ParserInput<Schema["body"]>
      : undefined
    );
    // This is the result on the client side. What the socket receives on the
    // server should go first in the WS, that's what they'll be able to send
    result: WS<(
      Schema extends { recv: Parser } ? ParserInput<Schema["recv"]>
      : unknown
    ), (
      Schema extends SocketSchema ? (
        null | undefined extends Schema["send"] ? unknown
        : Schema["send"]
      )
      : unknown
    )>;
  }>,
  conn: http.ConnInfo,
) => Promise<Response>);

/** Arguments available to the setup function of a socket endpoint. */
export interface SetupArg<
  Param extends SocketSchema["param"],
  Ctx extends SocketSchema["ctx"],
  Query extends SocketSchema["query"],
  Send extends SocketSchema["send"],
  Recv extends SocketSchema["recv"],
> extends Omit<
  ResolveArg<Param, Ctx, Query, any>,
  "body" | "asset" | "bundle" | "redirect" | "res"
> {
  ws: WS<Send, (
    SocketSchema["recv"] extends Recv ? unknown : ParserOutput<Recv>
  )>;
}

/**
 * Constructs a new Socket request handler using the provided schema and setup
 * function. The schema properties will be assigned to the returned socket
 * endpoint function, with the setup argument available as the "setup" property.
 */
export function socket<
  Schema extends SocketSchema | null,
  Param extends SocketSchema["param"],
  Ctx extends SocketSchema["ctx"],
  Query extends SocketSchema["query"],
  Send extends SocketSchema["send"],
  Recv extends SocketSchema["recv"],
>(
  schema: SocketSchema & Schema & {
    param?: Param;
    ctx?: Ctx;
    query?: Query;
    send?: Send;
    recv?: Recv;
  } | null,
  setup: (
    | ((x: SetupArg<Param, Ctx, Query, Send, Recv>) => Promise<void> | void)
    | null
  ),
): Socket<Schema>;
export function socket(
  _schema: SocketSchema | null,
  _setup: (
    | ((x: SetupArg<any, any, any, any, any>) => Promise<void> | void)
    | null
  ),
) {
  const schema = _schema || {};
  const setup = _setup || (() => {});
  const recv = normalizeParser(schema.recv || ((m) => m));

  return endpoint(schema, async x => {
    let socket: WebSocket;
    let response: Response;
    try {
      ({ socket, response } = Deno.upgradeWebSocket(x.req, {
        protocol: "json",
      }));
    } catch {
      x.headers.set("upgrade", "websocket");
      throw new HttpError("426 upgrade required", { status: 426 });
    }

    const ws = webSocket(socket, { recv });

    if (setup) {
      await setup({ ...x, ws });
    }

    return response;
  });
}
