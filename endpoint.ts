// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http, path as stdPath } from "./deps.ts";
import { serveAsset } from "./asset.ts";
import { routerContext, noMatch } from "./router.ts";
import { HttpError, packResponse, unpack } from "./serial.ts";
import { cookieJar } from "./cookie.ts";
import { webSocket } from "./ws.ts";
import { normalizeParser } from "./parser.ts";
import { serveBundle } from "./bundle.ts";
import type { EndpointRequest, SocketRequest } from "./client.ts";
import type { Parser, ParserInput, ParserOutput } from "./parser.ts";
import type { CookieJar } from "./cookie.ts";
import type { Serializers } from "./serial.ts";
import type { ServeAssetOptions } from "./asset.ts";
import type { WS } from "./ws.ts";
import type { QueryRecord, ParamRecord } from "./router.ts";
import type { ServeBundleOptions } from "./bundle.ts";

// TODO: Test what happens when sending huge amounts of data to a server with a
// websocket. AFAIK, there's no way to prevent processing super large web socket
// messages

/** Options for processing requests, used to construct Endpoints. */
export interface EndpointSchema {
  /**
   * URLPattern string to match against the Request's routed path. If the string
   * starts with '^', the full request path will be used instead. The full
   * URLPattern syntax is supported. Any captured path parameters will be merged
   * into the path parameters captured during routing. The matched path is
   * available as the "path" resolver argument.
   */
  path?: string | null;
  /**
   * Parses any path parameters captured during routing. The result is available
   * as the "param" resolver argument. If an error is thrown during parsing,
   * the endpoint won't match with the request and the router will continue
   * looking for matching handlers.
   */
  param?: Parser<ParamRecord> | null;
  /**
   * Keys to use when signing cookies. The cookies are available as the
   * "cookie" resolver argument.
   */
  keys?: [string, ...string[]] | null;
  /**
   * Factory function endpoints can use to create a custom context, which is
   * made available to resolvers as the `ctx` property on the resolver
   * arguments. Context handling happens after the endpoint matched with the
   * Request but before input validation begins.
   */
  ctx?: ((c: ContextArg) => any) | null;
  /**
   * Parses the query string parameters passed into the URL. If parsing fails,
   * `undefined` will be parsed to check for a default value. If that also
   * fails, a 400 bad request error will be sent to the client. The output is
   * available as the "query" resolver argument.
   */
  query?: Parser<QueryRecord> | null;
  /**
   * Limits the size of posted bodies. If a body exceeds the limit, a 413
   * HttpError will be thrown and serialized back to the client. If 0 is
   * specified, body size is unlimited. (Don't do that.) The default max body
   * size is 1024 * 1024 bytes (1 Megabyte).
   */
  maxBodySize?: number | null;
  /**
   * Serializers to use when serializing and deserializing Request and
   * Response bodies.
   */
  serializers?: Serializers | null;
  /**
   * Parses the POSTed body, if there is one. The behavior of this parser
   * determines the methods allowed for this endpoint. If there is no parser,
   * only GET and HEAD requests will be allowed. If there is one and it
   * successfully parses `undefined`, POST will also be allowed. If the parser
   * throws when parsing `undefined`, *only* POST will be allowed. The output
   * from parsing is available as the "body" resolver argument.
   */
  body?: Parser | null;
  /**
   * Resolves a successfully matching request into an output to send to the
   * client.
   */
  // resolve?: ((x: ResolveArg<any, any, any, any>) => any) | null;
  /**
   * Overrides the type returned by the resolver. The value of this property
   * doesn't matter, it's only used for its type.
   */
  result?: unknown;
  /**
   * If specified, an error thrown during request processing will be passed into
   * this function, which can return a value to send back to the client instead
   * of the error. If an error is re-thrown, that error will be serialized to
   * the client instead of the original error.
   */
  error?: ((x: ErrorArg) => any) | null;
}

/** Arguments available to Context functions. */
export interface ContextArg {
  /** The Request being handled. */
  req: Request;
  /**
   * A ResponseInit applied to the Endpoint's resolved value when packing it
   * into a Response. The Headers are always available.
   */
  res: ResponseInit & { headers: Headers };
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
   * A ResponseInit applied to the Endpoint response after resolving and packing
   * the value to send to the client. The Headers object is always available.
   */
  res: ResponseInit & { headers: Headers };
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

/**
 * Type utility for extracting the output of a "param" parser on an
 * EndpointSchema or SocketSchema.
 */
// export type ParamOutput<Schema> = (
//   "param" extends keyof Schema ? (
//     Schema extends { param: Parser } ? (
//       ParserOutput<Schema["param"]>
//     )
//     : Schema extends { param?: undefined | null } ? ParamRecord
//     : never
//   )
//   : Schema extends Record<string, unknown> ? ParamRecord
//   : unknown
// );

/**
 * Type utility for extracting the output of a "ctx" function on an
 * EndpointSchema or SocketSchema.
 */
//  export type CtxOutput<Schema> = (
//   "ctx" extends keyof Schema ? (
//     Schema extends { ctx: (x: any) => infer C } ? Awaited<C>
//     : Schema extends { ctx?: undefined | null } ? undefined
//     : never
//   )
//   : Schema extends Record<string, unknown> ? undefined
//   : unknown
// );

/**
 * Type utility for extracting the output of a "query" parser on an
 * EndpointSchema or SocketSchema.
 */
// export type QueryOutput<Schema> = (
//   "query" extends keyof Schema ? (
//     Schema extends { query: Parser } ? (
//       ParserOutput<Schema["query"]>
//     )
//     : Schema extends { query?: undefined | null; } ? QueryRecord
//     : never
//   )
//   : Schema extends Record<string, unknown> ? QueryRecord
//   : unknown
// );

/**
 * Type utility for extracting the output of a "body" parser on an
 * EndpointSchema or SocketSchema.
 */
// export type BodyOutput<Schema> = (
//   "body" extends keyof Schema ? (
//     Schema extends { body: Parser } ? (
//       ParserOutput<Schema["body"]>
//     )
//     : Schema extends { body?: undefined | null } ? undefined
//     : never
//   )
//   : Schema extends Record<string, unknown> ? undefined
//   : unknown
// );

/** Arguments available to the resolver of an endpoint. */
export interface ResolveArg<
  Param extends EndpointSchema["param"],
  Ctx extends EndpointSchema["ctx"],
  Query extends EndpointSchema["query"],
  Body extends EndpointSchema["body"],
> {
  /** The Request being handled. */
  req: Request;
  /**
   * A ResponseInit applied to the endpoint response after resolving and packing
   * the value to send to the client. The Headers object is always available.
   */
  res: ResponseInit & { headers: Headers };
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

/** Cav Endpoint handler, for responding to requests. */
export type Endpoint<Schema extends EndpointSchema> = Schema & ((
  req: EndpointRequest<(
    Schema extends { query: Parser } ? ParserInput<Schema["query"]>
    : QueryRecord | undefined
  ), (
    Schema extends { body: Parser } ? ParserInput<Schema["body"]>
    : Schema extends { body?: null } ? undefined
    : unknown
  ), (
    unknown extends Schema["result"] ? (
      Schema extends { resolve: (x: any) => infer R } ? (
        Awaited<R> extends Response ? unknown : R
      )
      : Schema extends { resolve?: null } ? undefined
      : unknown
    )
    : Schema["result"]
  )>,
  conn: http.ConnInfo,
) => Promise<Response>);

/**
 * Constructs a new Endpoint request handler using the provided schema and
 * resolver function. The schema properties will be assigned to the returned
 * endpoint function, so that they can be reused on other endpoint schemas.
 */
export function endpoint<
  Schema extends EndpointSchema,
  Param extends EndpointSchema["param"],
  Ctx extends EndpointSchema["ctx"],
  Query extends EndpointSchema["query"],
  Body extends EndpointSchema["body"],
  Result = undefined,
>(
  schema: Schema & EndpointSchema & {
    param?: Param;
    ctx?: Ctx;
    query?: Query;
    body?: Body;
    resolve?: ((x: ResolveArg<Param, Ctx, Query, Body>) => Result) | null;
  },
): Endpoint<Schema>;
// ): Endpoint<(
//   EndpointSchema extends Schema ? {}
//   : Schema
// ), (
//   unknown extends Schema["result"] ? (
//     Awaited<Result> extends Response ? unknown : Awaited<Result>
//   )
//   : Schema["result"]
// )>;
export function endpoint(
  _schema: EndpointSchema & {
    resolve?: ((x: ResolveArg<any, any, any, any>) => void) | null;
  },
) {
  const schema = _schema || {};
  const resolver = _schema.resolve || (() => {});

  const checkMethod = methodChecker(schema.body);
  const matchPath = pathMatcher({
    path: schema.path,
    param: schema.param,
  });
  const parseInput = inputParser({
    query: schema.query,
    body: schema.body,
    maxBodySize: schema.maxBodySize,
    serializers: schema.serializers,
  });

  const handler = async (req: Request, conn: http.ConnInfo) => {
    const routerCtx = routerContext(req);
    if (routerCtx.redirect) {
      return routerCtx.redirect;
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

    const res: ResponseInit & { headers: Headers } = { headers: new Headers() };
    const { url } = routerCtx;
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
      cleanupTasks.push(() => cookie.setCookies(res.headers));

      let ctx: unknown = undefined;
      if (schema.ctx) {
        ctx = await schema.ctx({
          req,
          res,
          url,
          conn,
          cookie,
          path,
          query: routerCtx.query,
          param: unparsedParam,
          cleanup: (task: () => Promise<void> | void) => {
            cleanupTasks.push(task);
          },
        });
      }

      const { query, body } = await parseInput(req);
      output = await resolver({
        req,
        res,
        url,
        conn,
        cookie,
        path,
        param: param as any,
        ctx: ctx as any,
        query: query as any,
        body: body as any,
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
            res,
            url,
            conn,
            error,
            path: routerCtx.path,
            param: routerCtx.param,
            query: routerCtx.query,
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

    if (error instanceof HttpError) {
      res.status = error.status;
      output = error.expose ? error : error.message;
    } else if (error) {
      // Triggers a 500 HttpError on the client
      const bugtrace = crypto.randomUUID().slice(0, 5);
      console.error(`ERROR: Uncaught exception [${bugtrace}] -`, error);
      res.status = 500;
      output = `500 internal server error [${bugtrace}]`;
    }

    const response = packResponse(output, {
      ...res,
      serializers: schema.serializers || undefined,
    });
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

/**
 * Given an Endpoint's "body" option, this returns a function that checks
 * whether a Request's method is allowed or not during handling. When a
 * request's method isn't in the calculated set of allowed methods, a 405
 * HttpError will be thrown. If the returned value is a Response, it should be
 * returned to the client right away. It means the request is an OPTIONS
 * request, and the Response returned is meant to handle it.
 *
 * OPTIONS is always an allowed method. If the body parser is `null` or
 * `undefined`, GET and HEAD will be allowed. If there's a body parser and it
 * successfully parses `undefined`, GET, HEAD, and POST will be allowed. If the
 * body parser throws an error while parsing `undefined`, only POST will be
 * allowed.
 */
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

/**
 * Returns a function that checks whether or not a Request matches with the
 * Endpoint using its "path" pattern option. If the path pattern starts with
 * '^', the full pathname on the Request url will be used. Otherwise, the
 * "routed" path will be used, which may not be the same as the full path if
 * this Endpoint is nested inside a Router. If no "path" option is specified,
 * "/" is the default meaning the containing Router(s) should have routed (i.e.
 * consumed) the entire request path before reaching the called Endpoint.
 *
 * When calling the returned function, if the request path matches, the
 * parameters on the RequestContext (captured by the containing Router(s)) will
 * be merged with the parameters captured during path matching and then parsed
 * with the parameters parser, if any. The path and parsed parameters will be
 * returned on success, a 404 HttpError will be thrown on failure.
 */
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
    const routerCtx = routerContext(req);
    const path = useFullPath ? routerCtx.url.pathname : routerCtx.path;
    const match = pattern.exec(path, "http://_");

    if (!match) {
      throw new HttpError("404 not found", { status: 404 });
    }

    // 0 param should be the path that matched, i.e. the path var already set
    delete match.pathname.groups["0"];

    const unparsedParam = { ...routerCtx.param };
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

/**
 * Creates an input parser that processes the Endpoint input using the relevant
 * EndpointSchema options. If parsing fails, a 400 HttpError will be thrown with
 * the offending error exposed on the "expose" property. If it succeeds, the
 * parsed query and body will be returned.
 */
function inputParser(opt: {
  query?: Parser | null;
  body?: Parser | null;
  maxBodySize?: number | null;
  serializers?: Serializers | null;
}): (req: Request) => Promise<{
  query: unknown;
  body: unknown;
}> {
  const parseQuery = opt.query && normalizeParser(opt.query);
  const parseBody = opt.body && normalizeParser(opt.body);

  return async (req) => {
    const routerCtx = routerContext(req);

    let query: unknown = routerCtx.query;
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
        serializers: opt.serializers || undefined,
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
  return endpoint({
    path: "*" as const,
    param: ({ id }: ParamRecord) => id,
    resolve: x => x.asset(init),
  });
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

  return endpoint({
    resolve: x => {
      return x.bundle(init);
    },
  });
}

/**
 * Creates an Endpoint that always redirects. The "path" schema option is "/",
 * i.e. the whole request path should have been consumed by the containing
 * router(s) before the request reaches a redirect endpoint. If the redirect
 * path doesn't specify an origin, the origin of the request is used. If the
 * path starts with a ".", it's joined with the pathname of the Request url to
 * get the final redirect path. The default status is 302.
 */
export function redirect(to: string, status?: number) {
  return endpoint({ resolve: x => x.redirect(to, status || 302) });
}

/** Schema options for creating a `socket()` handler. */
export interface SocketSchema extends Omit<
  EndpointSchema,
  "maxBodySize" | "body" | "result"
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
export type Socket<Schema extends SocketSchema> = (
  Schema extends null ? {} : Schema
) & ((
  req: SocketRequest<(
    Schema extends { query: Parser } ? ParserInput<Schema["query"]>
    : QueryRecord | undefined
  ), (
    "send" extends keyof Schema ? Schema["send"] : unknown
  ), (
    Schema extends { recv: Parser } ? ParserInput<Schema["recv"]>
    : unknown
  )>,
  conn: http.ConnInfo,
) => Promise<Response>);

/**
 * Type utility for extracting the type of message a socket expects to send from
 * its SocketSchema.
 */
// export type SendType<Schema extends SocketSchema | null> = (
//   Schema extends { send: infer S } ? S
//   : unknown
// );

/**
 * Type utility for extracting the type of message a socket expects to receive
 * from its SocketSchema.
 */
// export type RecvType<Schema extends SocketSchema | null> = (
//   Schema extends { recv: Parser<infer R> } ? R
//   : unknown
// );

/** Arguments available to the setup function of a socket endpoint. */
export interface SetupArg<
  Param extends SocketSchema["param"],
  Ctx extends SocketSchema["ctx"],
  Query extends SocketSchema["query"],
  Send extends SocketSchema["send"],
  Recv extends SocketSchema["recv"],
> extends Omit<
  ResolveArg<Param, Ctx, Query, any>,
  "body" | "asset" | "redirect"
> {
  ws: WS<
    Send,
    SocketSchema["recv"] extends Recv ? unknown : ParserOutput<Recv>
  >;
}

/**
 * Constructs a new Socket request handler using the provided schema and setup
 * function. The schema properties will be assigned to the returned socket
 * endpoint function, with the setup argument available as the "setup" property.
 */
export function socket<
  Schema extends SocketSchema,
  Param extends SocketSchema["param"],
  Ctx extends SocketSchema["ctx"],
  Query extends SocketSchema["query"],
  Send extends SocketSchema["send"],
  Recv extends SocketSchema["recv"],
>(
  schema: Schema & SocketSchema & {
    param?: Param;
    ctx?: Ctx;
    query?: Query;
    send?: Send;
    recv?: Recv;
    setup?: ((x: SetupArg<Param, Ctx, Query, Send, Recv>) => Promise<void> | void),
  },
): Socket<Schema>;
export function socket(
  _schema: SocketSchema & {
    setup?: ((x: SetupArg<any, any, any, any, any>) => Promise<void> | void)
  },
  // _setup: ((x: SetupArg) => Promise<void> | void) | null,
) {
  const schema = _schema || {};
  const setup = _schema.setup || (() => {});
  const recv = normalizeParser(schema.recv || ((m) => m));

  return endpoint({
    ...schema,
    resolve: async x => {
      let socket: WebSocket;
      let response: Response;
      try {
        ({ socket, response } = Deno.upgradeWebSocket(x.req, {
          protocol: "json"
        }));
      } catch {
        x.res.headers.set("upgrade", "websocket");
        throw new HttpError("426 upgrade required", { status: 426 });
      }
  
      const ws = webSocket(socket, {
        recv,
        serializers: schema.serializers,
      });
      
      // TODO: It would be nice if the onsetup can return a response to serialize
      // in case of a problem. Don't merge socket with endpoint, even though it
      // seems like that would be the right thing to do here; they function
      // differently and don't use the exact same schema structure
      if (setup) {
        await setup({ ...x, ws });
      }
  
      return response;
    }
  });
}
