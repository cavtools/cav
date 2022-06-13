// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http, path as stdPath } from "./deps.ts";
import { prepareAssets, serveAsset } from "./assets.ts";
import { routerContext, noMatch } from "./router.ts";
import { HttpError, packResponse, unpack } from "./serial.ts";
import { cookieJar } from "./cookies.ts";
import { webSocket } from "./ws.ts";
import { normalizeParser } from "./parser.ts";
import type { EndpointRequest, SocketRequest } from "./client.ts";
import type { Parser, ParserInput, ParserOutput } from "./parser.ts";
import type { CookieJar } from "./cookies.ts";
import type { Serializers } from "./serial.ts";
import type { ServeAssetOptions } from "./assets.ts";
import type { WS } from "./ws.ts";
import type { QueryRecord, GroupsRecord } from "./router.ts";

/** Options for processing requests, used to construct Endpoints. */
export interface EndpointSchema {
  /**
   * URLPattern string to match against the Request's routed path. If the
   * string starts with '^', the full request path will be used instead. The
   * full URLPattern syntax is supported. Any captured path groups will be
   * merged into the path groups captured during routing. The matched path is
   * available as the "path" resolver argument.
   */
  path?: string | null;
  /**
   * Parses any path groups captured during routing. The result is available
   * as the "groups" resolver argument. If an error is thrown during parsing,
   * the endpoint won't match with the request and the router will continue
   * looking for matching handlers.
   */
  groups?: Parser<GroupsRecord, any> | null;
  /**
   * Keys to use when signing cookies. The cookies are available as the
   * "cookies" resolver argument.
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
  query?: Parser<QueryRecord, any> | null;
  // TODO: Maybe split maxBodySize into two options: "memory" and "disk", which
  // specify the maximum space a request can use in memory and on disk.
  // "bodySize" wouldn't be general enough to cover both cases
  /**
   * Limits the size of posted messages. If a message exceeds the limit, a 413
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
   * from parsing is available as the "message" resolver argument.
   */
  message?: Parser<any, any> | null;
  // TODO: When you do the "memory" and "disk" options, change the name of this
  // option to just "error". That way all keys on the schema are a single word
  /**
   * If specified, an error thrown during request processing will be passed into
   * this function, which can return a value to send back to the client instead
   * of the error. If an error is re-thrown, that error will be serialized to
   * the client instead of the original error.
   */
  resolveError?: ((x: ResolveErrorArg) => any) | null;
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
  cookies: CookieJar;
  /** The path that matched the Endpoint's path schema option. */
  path: string;
  /** The unprocessed query object associated with this request. */
  query: QueryRecord;
  /** The unprocessed path groups object captured during routing. */
  groups: GroupsRecord;
  /**
   * When context functions need to run cleanup tasks after the Endpoint has
   * resolved the Response (such as setting cookies, logging performance
   * metrics, etc.), they can use this registration function to do so. Cleanup
   * functions are executed in stack order (last in first out).
   */
  cleanup: (fn: () => Promise<void> | void) => void;
}

/** Arguments available to a ResolveError function. */
export interface ResolveErrorArg {
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
  /** The unprocoessed path groups object captured during routing. */
  groups: GroupsRecord;
  /** The offending error. */
  error: unknown;
  /** Returns a Response created using an asset from an assets directory. */
  asset: (opt: ServeAssetOptions) => Promise<Response>;
  /**
   * Returns a redirect Response. If the redirect path doesn't specify an
   * origin, the origin of the current request is used. If the path starts with
   * a ".", it is joined with the pathname of the Request url to get the final
   * redirect path. The default status is 302.
   */
  redirect: (to: string, status?: number) => Response;
}

/**
 * Type utility for extracting the output of a "groups" parser on an
 * EndpointSchema or SocketSchema.
 */
export type GroupsOutput<Schema> = (
  "groups" extends keyof Schema ? (
    Schema extends { groups: Parser } ? (
      ParserOutput<Schema["groups"]>
    )
    : Schema extends { groups?: undefined | null } ? GroupsRecord
    : never
  )
  : Schema extends Record<string, unknown> ? GroupsRecord
  : unknown
);

/**
 * Type utility for extracting the output of a "ctx" function on an
 * EndpointSchema or SocketSchema.
 */
 export type CtxOutput<Schema> = (
  "ctx" extends keyof Schema ? (
    Schema extends { ctx: (x: any) => infer C } ? Awaited<C>
    : Schema extends { ctx?: undefined | null } ? undefined
    : never
  )
  : Schema extends Record<string, unknown> ? undefined
  : unknown
);

/**
 * Type utility for extracting the output of a "query" parser on an
 * EndpointSchema or SocketSchema.
 */
export type QueryOutput<Schema> = (
  "query" extends keyof Schema ? (
    Schema extends { query: Parser } ? (
      ParserOutput<Schema["query"]>
    )
    : Schema extends { query?: undefined | null; } ? QueryRecord
    : never
  )
  : Schema extends Record<string, unknown> ? QueryRecord
  : unknown
);

/**
 * Type utility for extracting the output of a "message" parser on an
 * EndpointSchema or SocketSchema.
 */
export type MessageOutput<Schema> = (
  "message" extends keyof Schema ? (
    Schema extends { message: Parser } ? (
      ParserOutput<Schema["message"]>
    )
    : Schema extends { message?: undefined | null } ? undefined
    : never
  )
  : Schema extends Record<string, unknown> ? undefined
  : unknown
);

/** Arguments available to the resolve function of an endpoint. */
export interface ResolveArg<Schema = unknown> {
  /**
   * The schema used to create this resolver's endpoint. If no schema was used,
   * this will be an empty object.
   */
  schema: Schema;
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
  cookies: CookieJar;
  /** The path that matched the endpoint's `path` schema option. */
  path: string;
  /** The parsed path groups captured while routing the request. */
  groups: GroupsOutput<Schema>;
  /** The context created after the endpoint matched the Request. */
  ctx: CtxOutput<Schema>;
  /** The parsed query string parameters. */
  query: QueryOutput<Schema>;
  /** The parsed Request body, if any. */
  message: MessageOutput<Schema>;
  /** Returns a Response created using an asset from an assets directory. */
  asset: (opt: ServeAssetOptions) => Promise<Response>;
  /**
   * Returns a redirect Response. If the redirect path doesn't specify an
   * origin, the origin of the current request is used. If the path starts with
   * a ".", it is joined with the pathname of the Request url to get the final
   * redirect path. The default status is 302.
   */
  redirect: (to: string, status?: number) => Response;
}

/** Cav Endpoint handler, for responding to requests. */
export type Endpoint<Schema = unknown> = Schema & ((
  req: EndpointRequest<(
    Schema extends { query: Parser } ? ParserInput<Schema["query"]>
    : QueryRecord
  ), (
    Schema extends { message: Parser } ? ParserInput<Schema["message"]>
    : Schema extends Record<string, unknown> ? undefined
    : unknown
  ), (
    Schema extends { resolve: (x: any) => infer R } ? Awaited<R>
    : Schema extends Record<string, unknown> ? undefined
    : unknown
  )>,
  conn: http.ConnInfo,
) => Promise<Response>);

// I'm using this type to know when the resolve/setup function wasn't specified,
// so that the output doesn't include it on the schema. I tried a few different
// methods and this was the first one that worked without problems
declare const _omitted: unique symbol;
type Omitted = typeof _omitted;

const test: unknown = null;
if (test instanceof HttpError) {
  const err = test;
}

/**
 * Constructs a new Endpoint request handler using the provided schema and
 * resolver function. The schema properties will be assigned to the returned
 * endpoint function, with the resolve argument available as the "resolve"
 * property.
 */
export function endpoint<
  Schema extends EndpointSchema = {},
  Resolve extends (x: ResolveArg<Schema>) => any = () => Omitted,
>(
  schema?: (Schema & EndpointSchema) | null,
  resolve?: Resolve & ((x: ResolveArg<Schema>) => any),
): Endpoint<{
  [K in keyof Schema | "resolve" as (
    K extends "resolve" ? (Resolve extends () => Omitted ? never : K)
    : K
  )]: (
    K extends "resolve" ? Resolve
    : K extends keyof Schema ? Schema[K]
    : never
  );
}>;
export function endpoint<
  Resolve extends (x: ResolveArg<{}>, ...a: any[]) => any = () => Omitted,
>(resolve?: Resolve & ((x: ResolveArg<{}>) => any)): Endpoint<
  Resolve extends () => Omitted ? {} : { resolve: Resolve }
>;
export function endpoint(
  schemaOrResolve?: (
    | EndpointSchema
    | ((x: ResolveArg) => any)
    | null
  ),
  maybeResolve?: (x: ResolveArg) => any,
) {
  // TODO: Throw SyntaxErrors on invalid input
  const schema: EndpointSchema = (
    schemaOrResolve && typeof schemaOrResolve === "object" ? schemaOrResolve
    : {}
  );
  const resolve: (x: ResolveArg) => any = (
    typeof schemaOrResolve === "function" ? schemaOrResolve
    : typeof maybeResolve === "function" ? maybeResolve
    : () => {}
  );

  const checkMethod = methodChecker(schema.message);
  const matchPath = pathMatcher({
    path: schema.path,
    groups: schema.groups,
  });
  const parseInput = inputParser({
    query: schema.query,
    message: schema.message,
    maxBodySize: schema.maxBodySize,
    serializers: schema.serializers,
  });

  const handler = async (req: Request, conn: http.ConnInfo) => {
    const routerCtx = routerContext(req);
    if (routerCtx.redirect) {
      return routerCtx.redirect;
    }

    // Utilities
    const asset = (opt: ServeAssetOptions) => serveAsset(req, opt);
    const redirect = (to: string, status?: number) => {
      if (to.startsWith(".")) {
        to = stdPath.join(url.pathname, to);
      }
      const u = new URL(to, url.origin);
      return Response.redirect(u.href, status || 302);
    };

    const res: ResponseInit & { headers: Headers } = { headers: new Headers() };
    const { url } = routerCtx;
    const cleanupTasks: (() => Promise<void> | void)[] = [];
    let output: unknown = undefined;
    let path: string;
    let groups: unknown;
    let unparsedGroups: Record<string, string | string[]>;
    let error: unknown = undefined;

    try {
      ({ path, groups, unparsedGroups } = await matchPath(req));
    } catch {
      return noMatch(new Response("404 not found", { status: 404 }));
    }

    try {
      const options = await checkMethod(req);
      if (options) {
        return options;
      }

      const cookies = await cookieJar(req, schema.keys || undefined);
      cleanupTasks.push(() => cookies.setCookies(res.headers));

      let ctx: unknown = undefined;
      if (schema.ctx) {
        ctx = await schema.ctx({
          req,
          res,
          url,
          conn,
          cookies,
          path,
          query: routerCtx.query,
          groups: unparsedGroups,
          cleanup: (task: () => Promise<void> | void) => {
            cleanupTasks.push(task);
          },
        });
      }

      const { query, message } = await parseInput(req);
      output = await resolve({
        schema: schema as any,
        req,
        res,
        url,
        conn,
        cookies,
        path,
        groups: groups as any,
        ctx: ctx as any,
        query: query as any,
        message: message as any,
        asset,
        redirect,
      });
    } catch (err) {
      error = err;
      // Check to see if the resolveError function can handle it
      if (schema.resolveError) {
        // If it rethrows, use the newly thrown error instead. If it returns
        // something, that thing should be packed into a Response
        try {
          output = await schema.resolveError({
            req,
            res,
            url,
            conn,
            error,
            path: routerCtx.path,
            query: routerCtx.query,
            groups: routerCtx.groups,
            asset: (opt: ServeAssetOptions) => serveAsset(req, opt),
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

  return Object.assign(handler, { ...schema, resolve }) as any;
}

/**
 * Given an Endpoint's "message" option, this returns a function that checks
 * whether a Request's method is allowed or not during handling. When a
 * request's method isn't in the calculated set of allowed methods, a 405
 * HttpError will be thrown. If the returned value is a Response, it should be
 * returned to the client right away. It means the request is an OPTIONS
 * request, and the Response returned is meant to handle it.
 *
 * OPTIONS is always an allowed method. If the message parser is `null` or
 * `undefined`, GET and HEAD will be allowed. If there's a message parser and it
 * successfully parses `undefined`, GET, HEAD, and POST will be allowed. If the
 * message parser throws an error while parsing `undefined`, only POST will be
 * allowed.
 */
function methodChecker(
  message?: Parser | null,
): (req: Request) => Promise<Response | null> {
  const parseMessage = (
    typeof message === "function"
      ? message
      : message
      ? message.parse
      : null
  );
  let allowed: Set<string> | null = null;
  return async (req: Request) => {
    // On the first request, setup the allowed methods set. Doing it here
    // because the parser can be async, and doing it in a separate async IIFE
    // could lead to a race condition and screw up the tests
    if (!allowed) {
      allowed = new Set(["OPTIONS"]);
      let postRequired = false;
      if (parseMessage) {
        try {
          await parseMessage(undefined);
        } catch {
          postRequired = true;
        }
      }
      if (postRequired) {
        allowed.add("POST");
      } else {
        allowed.add("GET");
        allowed.add("HEAD");
        if (parseMessage) {
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
 * When calling the returned function, if the request path matches, the groups
 * on the RequestContext (captured by the containing Router(s)) will be merged
 * with the groups captured during path matching and then parsed with the groups
 * parser, if any. The path and parsed groups will be returned on success, a 404
 * HttpError will be thrown on failure.
 */
function pathMatcher(opt: {
  path?: string | null;
  groups?: Parser | null;
}): (req: Request) => Promise<{
  path: string;
  groups: unknown;
  unparsedGroups: Record<string, string | string[]>;
}> {
  const useFullPath = opt.path && opt.path.startsWith("^");
  const pattern = new URLPattern(
    useFullPath ? opt.path!.slice(1) : opt.path || "/",
    "http://_",
  );
  const parseGroups = (
    typeof opt.groups === "function" ? opt.groups
    : opt.groups ? opt.groups.parse
    : null
  );

  return async (req: Request) => {
    const routerCtx = routerContext(req);
    const path = useFullPath ? routerCtx.url.pathname : routerCtx.path;
    const match = pattern.exec(path, "http://_");

    if (!match) {
      throw new HttpError("404 not found", { status: 404 });
    }

    // 0 group should be the path that matched, i.e. the path var already set
    delete match.pathname.groups["0"];

    const unparsedGroups = { ...routerCtx.groups };
    for (const [k, v] of Object.entries(match.pathname.groups)) {
      if (!v) {
        continue;
      }
      
      const old = unparsedGroups[k];
      if (Array.isArray(old)) {
        unparsedGroups[k] = [...old, v];
      } else if (typeof old === "string") {
        unparsedGroups[k] = [old, v];
      } else {
        unparsedGroups[k] = v;
      }
    }

    let groups = unparsedGroups;
    if (!parseGroups) {
      return { path, groups, unparsedGroups };
    }

    try {
      groups = await parseGroups(groups);
    } catch {
      try {
        groups = await parseGroups(undefined);
      } catch {
        throw new HttpError("404 not found", { status: 404 });
      }
    }

    return { path, groups, unparsedGroups };
  };
}

/**
 * Creates an input parser that processes the Endpoint input using the relevant
 * EndpointSchema options. If parsing fails, a 400 HttpError will be thrown with
 * the offending error exposed on the "expose" property. If it succeeds, the
 * parsed query and message will be returned.
 */
function inputParser(opt: {
  query?: Parser | null;
  message?: Parser | null;
  maxBodySize?: number | null;
  serializers?: Serializers | null;
}): (req: Request) => Promise<{
  query: unknown;
  message: unknown;
}> {
  const parseQuery = opt.query && normalizeParser(opt.query);
  const parseMessage = opt.message && normalizeParser(opt.message);

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
          throw new HttpError("400 bad request", {
            status: 400,
            expose: err,
          });
        }
      }
    }

    let message: unknown = undefined;
    if (req.body && parseMessage) {
      // If the req.body is true, parseMessage should also be true due to the
      // method check that happens at the start of request handling. The above
      // conditional is redundant for type purposes
      
      message = await unpack(req, {
        maxBodySize: (
          typeof opt.maxBodySize === "number" ? opt.maxBodySize
          : undefined
        ),
        serializers: opt.serializers || undefined,
      });

      try {
        message = await parseMessage(message);
      } catch (err) {
        throw new HttpError("400 bad request", {
          status: 400,
          expose: err,
        });
      }
    }

    return { query, message };
  };
}

/** Initializer options for creating an `assets()` endpoint. */
export type AssetsInit = Omit<ServeAssetOptions, "path">;

/**
 * Creates an Endpoint for serving static assets. The routed path is used to
 * find the asset to serve from inside the assets directory specified.
 */
export function assets(init?: AssetsInit) {
  // Note that this is a no-op in production
  prepareAssets({
    cwd: init?.cwd,
    dir: init?.dir,
    watch: true,
  });

  return endpoint({ path: "*" as const }, x => {
    return x.asset({ ...init, path: x.path });
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
  return endpoint(x => x.redirect(to, status || 302));
}

/** Schema options for creating a `socket()` handler. */
export interface SocketSchema extends Omit<EndpointSchema, "maxBodySize"> {
  /**
   * The type of message this Socket expects to send to a connected client. The
   * value of this property doesn't matter, it's only used for the type.
   */
  send?: any;
}

/** Cav endpoint handler for connecting web sockets. */
export type Socket<Schema = null> = (
  Schema extends null ? {} : Schema
) & ((
  req: SocketRequest<(
    Schema extends { query: Parser } ? ParserInput<Schema["query"]>
    : Record<string, string | string[]>
  ), (
    "send" extends keyof Schema ? Schema["send"] : unknown
  ), (
    Schema extends { message: Parser } ? ParserInput<Schema["message"]>
    : Schema extends { message?: undefined | null } ? undefined
    : unknown
  )>,
  conn: http.ConnInfo,
) => Promise<Response>);

/**
 * Type utility for extracting the type of message a socket expects to send from
 * a SocketSchema.
 */
export type SendType<Schema extends SocketSchema | null> = (
  Schema extends { send: infer S } ? S
  : unknown
);

/** Arguments available to the setup function of a socket endpoint. */
export interface SocketSetupArg<
  Schema extends SocketSchema | null = SocketSchema | null,
> extends Omit<ResolveArg<Schema>, "message" | "asset" | "redirect"> {
  ws: WS<SendType<Schema>, MessageOutput<Schema>>;
}

/**
 * Constructs a new Socket request handler using the provided schema and setup
 * function. The schema properties will be assigned to the returned socket
 * endpoint function, with the setup argument available as the "setup" property.
 */
export function socket<
  Schema extends SocketSchema | null,
  Setup extends ((x: SocketSetupArg<Schema>) => any) = () => Omitted,
>(
  schema?: (Schema & SocketSchema) | null,
  setup?: Setup & ((x: SocketSetupArg<Schema>) => Promise<void> | void),
): Socket<{
  [K in keyof Schema | "setup" as (
    K extends "setup" ? (Setup extends () => Omitted ? never : K)
    : K
  )]: (
    K extends "setup" ? Setup
    : K extends keyof Schema ? Schema[K]
    : never
  );
}>;
export function socket<
  Setup extends ((x: SocketSetupArg<{}>) => any) = () => Omitted,
>(setup?: Setup): Socket<
  Setup extends () => Omitted ? {}
  : { setup: Setup }
>;
export function socket(
  schemaOrSetup?: (
    | SocketSchema
    | ((x: SocketSetupArg) => Promise<void> | void)
    | null
  ),
  maybeSetup?: (x: SocketSetupArg) => Promise<void> | void,
) {
  const schema: SocketSchema = (
    schemaOrSetup && typeof schemaOrSetup === "object" ? schemaOrSetup
    : {}
  );
  const setup: (x: SocketSetupArg) => Promise<void> | void = (
    typeof schemaOrSetup === "function" ? schemaOrSetup
    : typeof maybeSetup === "function" ? maybeSetup
    : () => {}
  );

  const parseMessage = normalizeParser(schema.message || ((m) => m));

  const handler = endpoint({
    ...schema,
    message: null, // !important
  }, async x => {
    let socket: WebSocket;
    let response: Response;
    try {
      ({ socket, response } = Deno.upgradeWebSocket(x.req));
    } catch {
      x.res.headers.set("upgrade", "websocket");
      throw new HttpError("426 upgrade required", { status: 426 });
    }

    const ws = webSocket(socket, {
      message: async (input: unknown) => {
        // This is wrapped so that incoming message parsing errors get
        // serialized back to the client, which will trigger an 
        try {
          return await parseMessage(input);
        } catch (err) {
          ws.send(new HttpError("400 bad request", {
            status: 400,
            expose: err,
          }));
        }
      },
      serializers: schema.serializers,
    });
    
    if (setup) {
      await setup({ ...x, schema, ws });
    }

    return response;
  });

  // Don't forget that the message parser won't be set on the handler yet
  // because we overwrote it when constructing the endpoint, so it needs to be
  // manually re-assigned after construction
  return Object.assign(handler, { message: schema.message }) as Socket;
}
