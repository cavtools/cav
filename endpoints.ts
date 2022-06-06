// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http, path as stdPath } from "./deps.ts";
import { prepareAssets, serveAsset } from "./assets.ts";
import { routerContext, noMatch } from "./router.ts";
import { HttpError, packResponse, unpack } from "./serial.ts";
import { cookieJar } from "./cookies.ts";
import { webSocket } from "./ws.ts";
import type { EndpointRequest, SocketRequest } from "./client.ts";
import type {
  Parser,
  AnyParser,
  ParserInput,
  ParserOutput,
} from "./parser.ts";
import type { CookieJar } from "./cookies.ts";
import type { Serializers } from "./serial.ts";
import type { ServeAssetOptions } from "./assets.ts";
import type { WS } from "./ws.ts";

/** Cav Endpoint handler, for responding to requests. */
export type Endpoint<S extends EndpointSchema = EndpointSchema> = S & ((
  req: EndpointRequest<
    "query" extends keyof S ? ParserInput<S["query"]> : unknown,
    "message" extends keyof S ? ParserInput<S["message"]> : unknown,
    (
      // deno-lint-ignore no-explicit-any
      S["resolve"] extends (...a: any[]) => Promise<infer R> | infer R ? R
      : undefined
    )
  >,
  conn: http.ConnInfo,
) => Promise<Response>);

/** Schema options for constructing Endpoints. */
export interface EndpointSchema<
  Groups extends AnyParser | null = AnyParser | null,
  Ctx extends AnyContext | null = AnyContext | null,
  Query extends AnyParser | null = AnyParser | null,
  Message extends AnyParser | null = AnyParser | null,
  Resp = unknown,
> {
  /**
   * URLPattern string to match against the Request's routed path. If the string
   * starts with '^', the full request path will be used instead. The full
   * URLPattern syntax is supported. Any captured path groups will be merged
   * into the path groups captured during routing. The matched path is available
   * as the "path" resolver argument.
   */
  path?: string | null;
  /**
   * Parses any path groups captured during routing. The result is available as
   * the "groups" resolver argument. If an error is thrown during parsing, the
   * Endpoint won't match with the request and the router will continue looking
   * for matching handlers.
   */
  groups?: Groups;
  /**
   * Keys to use when signing cookies. The cookies are available as the
   * "cookies" resolver argument.
   */
  keys?: [string, ...string[]] | null;
  /**
   * Factory function Endpoints can use to create a custom context,
   * which is made available to resolvers as the `ctx` property on the resolver
   * arguments. Context handling happens after the Endpoint matched with the
   * Request but before input validation begins.
   *
   * TODO: Example use case
   */
  ctx?: Ctx;
  /**
   * Parses the query string parameters passed into the URL. If parsing fails,
   * `undefined` will be parsed to check for a default value. If that also
   * fails, a 400 bad request error will be sent to the client. The output is
   * available as the "query" resolver argument.
   */
  query?: Query;
  /**
   * Limits the size of posted messages. If a message exceeds the limit, a 413
   * HttpError will be thrown and serialized back to the client.
   */
  maxBodySize?: number | null;
  /**
   * Serializers to use when serializing and deserializing Request and Response
   * bodies.
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
  message?: Message;
  /**
   * Responsible for resolving a Request received by an Endpoint into a value
   * that will be serialized into a Response. The types of the arguments
   * available are determined by the rest of the EndpointSchema.
   */
  resolve?: Resolve<Groups, Ctx, Query, Message, Resp> | null;
  /**
   * Resolves an error thrown during Endpoint processing into a Response to
   * serve to the client. If no Response is returned, the error will be
   * serialized if it's an HttpError, or a 500 error will be serialized instead
   * if it isn't. If a different error is re-thrown, that error will be
   * serialized instead.
   */
  resolveError?: ResolveError | null;
}

// TODO: I added these Any types when I thought I needed them but things have
// changed. I wonder what would happen if I remove them now?
/** Matches any EndpointSchema. Useful for type constraints. */
export type AnyEndpointSchema = EndpointSchema<
  AnyParser | null,
  AnyContext | null,
  AnyParser | null,
  AnyParser | null,
  // deno-lint-ignore no-explicit-any
  any
>;

/**
 * Factory function Endpoints can use to create a custom context instance, which
 * is made available to resolvers as the `ctx` property on the resolver
 * arguments. Context handling happens after the Endpoint matched with the
 * Request but before input validation begins.
 */
export type Context<Ctx = unknown> = (
  (x: ContextArg) => Promise<Ctx> | Ctx
);

/** Matches any Context. Useful for type constraints. */
// deno-lint-ignore no-explicit-any
export type AnyContext = Context<any>;

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
  query: Record<string, string | string[]>;
  /** The unprocoessed path groups object captured during routing. */
  groups: Record<string, string>;
  /**
   * When context functions need to run cleanup tasks after the Endpoint has
   * resolved the Response (such as setting cookies, logging performance
   * metrics, etc.), they can use this registration function to do so. Cleanup
   * functions are executed in stack order (last in first out).
   */
  cleanup: (fn: () => Promise<void> | void) => void;
}

/**
 * Function responsible for resolving a Request received by an Endpoint into a
 * value that will be serialized into a Response.
 */
export type Resolve<
  Groups extends AnyParser | null = AnyParser,
  Ctx extends AnyContext | null = AnyContext,
  Query extends AnyParser | null = AnyParser,
  Message extends AnyParser | null = AnyParser,
  Resp = unknown,
> = (x: ResolveArg<
  Groups,
  Ctx,
  Query,
  Message
>) => Promise<Resp> | Resp;

/** Arguments available to the Resolve function. */
export interface ResolveArg<
  Groups extends AnyParser | null = AnyParser,
  Ctx extends AnyContext | null = AnyContext,
  Query extends AnyParser | null = AnyParser,
  Message extends AnyParser | null = AnyParser,
> {
  /** The Request being handled. */
  req: Request;
  /**
   * A ResponseInit applied to the Rpc response after resolving and packing the
   * value to send to the client. The Headers object is always available.
   */
  res: ResponseInit & { headers: Headers };
  /** new URL(req.url) */
  url: URL;
  /** Connection information provided by Deno. */
  conn: http.ConnInfo;
  /** The CookieJar created after the Endpoint matched with the Request. */
  cookies: CookieJar;
  /** The path that matched the Endpoint's `path` schema option. */
  path: string;
  /** The parsed path groups captured while routing the request. */
  groups: (
    Groups extends AnyParser ? ParserOutput<Groups>
    : Record<string, string>
  );
  /** The Context created after the Endpoint matched the Request. */
  ctx: Ctx extends Context<infer C> ? C : undefined;
  /** The parsed query string parameters. */
  query: (
    Query extends AnyParser ? ParserOutput<Query>
    : Record<string, string | string[]>
  );
  /** The parsed Request body, if any. */
  message: (
    Message extends AnyParser ? ParserOutput<Message>
    : undefined
  );
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
 * Resolves an Error thrown during Endpoint processing into a Response to serve
 * to the client. If no Response is returned, the Error will be serialized if
 * it's an HttpError, or a 500 error will be serialized instead if it isn't. If
 * a different error is re-thrown, that error will be serialized instead of the
 * original error.
 */
export type ResolveError = (x: ResolveErrorArg) => unknown;

/** Arguments available to a ResolveError function. */
export interface ResolveErrorArg {
  /** The Request being processed. */
  req: Request;
  /**
   * A ResponseInit applied to the Rpc response after resolving and packing the
   * value to send to the client. The Headers object is always available.
   */
  res: ResponseInit & { headers: Headers };
  /** new URL(req.url) */
  url: URL;
  /** Connection information provided by Deno. */
  conn: http.ConnInfo;
  /** The path that matched the Endpoint's path schema option. */
  path: string;
  /** The unprocessed query object associated with this request. */
  query: Record<string, string | string[]>;
  /** The unprocoessed path groups object captured during routing. */
  groups: Record<string, string>;
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
 * Constructs a new Endpoint handler using the provided schema. The schema
 * properties are also available on the returned Endpoint function.
 */
export function endpoint<
  Schema extends EndpointSchema<Groups, Ctx, Query, Message, Resp>,
  Groups extends AnyParser | null = null,
  Ctx extends AnyContext | null = null,
  Query extends AnyParser | null = null,
  Message extends AnyParser | null = null,
  Resp = void,
>(
  schema: Schema & EndpointSchema<Groups, Ctx, Query, Message, Resp>,
): Endpoint<Schema>;
export function endpoint<
  Res extends Resolve<null, null, null, null, Resp>,
  Resp = void,
>(
  resolve: Res & Resolve<null, null, null, null, Resp>,
): Endpoint<{ resolve: Res }>
export function endpoint(
  schemaOrFn: (
    EndpointSchema | Resolve<AnyParser, null, AnyParser, null, unknown>
  ),
): Endpoint {
  const schema = (
    typeof schemaOrFn === "function" ? { resolve: schemaOrFn }
    : schemaOrFn
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
    let unparsedGroups: Record<string, string>;
    let error: unknown = undefined;

    try {
      ({ path, groups, unparsedGroups } = await matchPath(req));
    } catch {
      return noMatch(new Response("404 not found", { status: 404 }));
    }
    const options = await checkMethod(req);
    if (options) {
      return options;
    }

    try {
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
      output = !schema.resolve ? undefined : await schema.resolve({
        req,
        res,
        url,
        conn,
        cookies,
        path,
        // deno-lint-ignore no-explicit-any
        groups: groups as any,
        // deno-lint-ignore no-explicit-any
        ctx: ctx as any,
        // deno-lint-ignore no-explicit-any
        query: query as any,
        // deno-lint-ignore no-explicit-any
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

    if (typeof error !== "undefined" && typeof output === "undefined") {
      if (error instanceof HttpError && !error.expose) {
        res.status = error.status;
        output = error.message;
      } else if (error instanceof HttpError) {
        res.status = error.status;
        output = error;
      } else {
        const bugtrace = crypto.randomUUID().slice(0, 5);
        console.error(`ERROR: Uncaught exception [${bugtrace}] -`, error);
        res.status = 500;
        output = new HttpError(`500 internal server error [${bugtrace}]`, {
          status: 500,
        });
      }
    }

    if (typeof output === "undefined" && !res.status) {
      res.status = 204;
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

  return Object.assign(handler, { ...schema });
}

// I'm pulling these functions out and explaining them because they're
// significant chunks of the request handling process
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
  message?: AnyParser | null,
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
  groups?: AnyParser | null;
}): (req: Request) => Promise<{
  path: string;
  groups: unknown;
  unparsedGroups: Record<string, string>;
}> {
  const useFullPath = opt.path && opt.path.startsWith("^");
  const pattern = new URLPattern(
    useFullPath ? opt.path!.slice(1) : opt.path || "/",
    "http://_._",
  );
  const parseGroups = (
    typeof opt.groups === "function" ? opt.groups
    : opt.groups ? opt.groups.parse
    : null
  );

  return async (req: Request) => {
    const routerCtx = routerContext(req);
    const path = useFullPath ? routerCtx.url.pathname : routerCtx.path;
    const match = pattern.exec(path, "http://_._");

    if (!match) {
      throw new HttpError("404 not found", { status: 404 });
    }

    const unparsedGroups = { ...routerCtx.groups, ...match.pathname.groups };
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
  query?: AnyParser | null;
  message?: AnyParser | null;
  maxBodySize?: number | null;
  serializers?: Serializers | null;
}): (req: Request) => Promise<{
  query: unknown;
  message: unknown;
}> {
  const parseQuery = (
    typeof opt.query === "function" ? opt.query
    : opt.query ? opt.query.parse
    : null
  );
  const parseMessage = (
    typeof opt.message === "function" ? opt.message
    : opt.message ? opt.message.parse
    : null
  );

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
 * find the asset to serve inside the assets directory.
 */
export function assets(init?: AssetsInit) {
  // Note that this is a no-op in production
  prepareAssets({
    cwd: init?.cwd,
    dir: init?.dir,
    watch: true,
  });

  return endpoint({
    path: "*" as const,
    resolve: x => x.asset({
      ...init,
      path: x.path,
    }),
  });
}

/**
 * Creates an Endpoint that always redirects. If the redirect path doesn't
 * specify an origin, the origin of the current request is used. If the path
 * starts with a ".", it's joined with the pathname of the Request url to get
 * the final redirect path. The default status is 302.
 */
export function redirect(to: string, status?: number) {
  return endpoint({
    path: "*" as const,
    resolve: x => x.redirect(to, status || 302),
  });
}

/** Cav endpoint handler for connecting web sockets. */
export type Socket<S extends SocketSchema = SocketSchema> = S & ((
  req: SocketRequest<
    "query" extends keyof S ? ParserInput<S["query"]> : unknown,
    "send" extends keyof S ? S["send"] : unknown,
    "message" extends keyof S ? ParserInput<S["message"]> : unknown
  >,
  conn: http.ConnInfo,
) => Promise<Response>);

/** Schema options for creating a `socket()` handler. */
export interface SocketSchema<
  Groups extends AnyParser | null = AnyParser | null,
  Ctx extends AnyContext | null = AnyContext | null,
  Query extends AnyParser | null = AnyParser | null,
  Message extends AnyParser | null = AnyParser | null,
  Send = unknown,
> {
  /**
   * URLPattern string to match against the Request's routed path. If the string
   * starts with '^', the full request path will be used instead. The full
   * URLPattern syntax is supported. Any captured path groups will be merged
   * into the path groups captured during routing. The matched path is available
   * as the "path" setup argument.
   */
  path?: string | null;
  /**
   * Parses any path groups captured during routing. The result is available as
   * the "groups" setup argument. If an error is thrown during parsing, the
   * Endpoint won't match with the request and the router will continue looking
   * for matching handlers.
   */
  groups?: Groups;
  /**
   * Keys to use when signing cookies. The cookies are available as the
   * "cookies" setup argument.
   */
  keys?: [string, ...string[]] | null;
  /**
   * Serializers to use when serializing and deserializing socket messages.
   */
  serializers?: Serializers | null;
  /**
   * Factory function Sockets can use to create a custom context, which
   * is made available to socket setups as the `ctx` property on the resolver
   * arguments. Context handling happens after the Socket matched with the
   * Request but before query validation begins.
   *
   * TODO: Example use case
   */
  ctx?: Ctx;
  /**
   * Parses the query string parameters passed into the URL. If parsing fails,
   * `undefined` will be parsed to check for a default value. If that also
   * fails, a 400 bad request error will be sent to the client. The output is
   * available as the "query" setup argument.
   */
  query?: Query;
  /**
   * The type of message this Socket expects to send to a connected client. The
   * value of this property doesn't matter, it's only used for the type.
   */
  send?: Send;
  /**
   * Parses received messages. If an error occurs during parsing, the error will
   * be serialized back to the client who will receive it as an error event.
   */
  message?: Message;
  /**
   * Function responsible for setting up the WS instance after matching with the
   * Request.
   */
  setup?: SocketSetup<Groups, Ctx, Query, Message, Send>;
  /**
   * Resolves an error thrown during request processing into a Response to serve
   * to the client. If no Response is returned, the error will be serialized if
   * it's an HttpError, or a 500 error will be serialized instead if it isn't.
   * If a different error is re-thrown, that error will be serialized instead.
   */
  resolveError?: ResolveError | null;
}

/** Matches any SocketSchema. Useful for type constraints. */
export type AnySocketSchema = SocketSchema<
  AnyParser | null,
  AnyContext | null,
  AnyParser | null,
  AnyParser | null,
  // deno-lint-ignore no-explicit-any
  any
>;

/**
 * Function responsible for setting up the WS instance after matching with the
 * Request.
 */
export type SocketSetup<
  Groups extends AnyParser | null = AnyParser,
  Ctx extends AnyContext | null = AnyContext,
  Query extends AnyParser | null = AnyParser,
  Message extends AnyParser | null = AnyParser,
  Send = unknown,
> = (x: SocketSetupArg<
  Groups,
  Ctx,
  Query,
  Message,
  Send
>) => Promise<void> | void;

/** Arguments available for the SocketSetup function. */
export interface SocketSetupArg<
  Groups extends AnyParser | null = AnyParser,
  Ctx extends AnyContext | null = AnyContext,
  Query extends AnyParser | null = AnyParser,
  Message extends AnyParser | null = AnyParser,
  Send = unknown,
> {
  /** The Request being handled. */
  req: Request;
  /**
   * A ResponseInit applied to the Rpc response after resolving and packing the
   * value to send to the client. The Headers object is always available.
   */
  res: ResponseInit & { headers: Headers };
  /** new URL(req.url) */
  url: URL;
  /** Connection information provided by Deno. */
  conn: http.ConnInfo;
  /** The CookieJar created after the Endpoint matched with the Request. */
  cookies: CookieJar;
  /** The path that matched the Endpoint's `path` schema option. */
  path: string;
  /** The parsed path groups captured while routing the request. */
  groups: (
    Groups extends AnyParser ? ParserOutput<Groups>
    : Record<string, string>
  );
  /** The Context created after the Endpoint matched the Request. */
  ctx: Ctx extends Context<infer C> ? C : undefined;
  /** The parsed query string parameters. */
  query: (
    Query extends AnyParser ? ParserOutput<Query>
    : Record<string, string | string[]>
  );
  /** The web socket instance. Use this to set up the event listeners. */
  ws: WS<Send, Message extends Parser ? ParserOutput<Message> : unknown>;
}

/**
 * Creates an Endpoint for connecting web sockets. There is no Resolve function,
 * the socket Response object is returned automatically. Use the `setup`
 * function to set up the socket.
 */
export function socket<
  Schema extends SocketSchema<Groups, Ctx, Query, Message>,//, Send>,
  Groups extends AnyParser | null = null,
  Ctx extends AnyContext | null = null,
  Query extends AnyParser | null = null,
  Message extends AnyParser | null = null,
  Send = unknown,
>(
  schema: Schema & SocketSchema<Groups, Ctx, Query, Message, Send>,
): Socket<Schema>;
// Unfortunately, this shortened syntax that's available when there's only a
// setup function doesn't alleviate the need for the "send" property on a
// SocketSchema. Without partial type inference, there would be no easy way to
// specify the type of the send without an extra (unused) send property  
// There's a ticket tracking the progress of the partial type inference that
// might fix this problem, but it doesn't look like the solutions would
// necessarily be as easy as this shortened syntax  
// https://github.com/microsoft/TypeScript/issues/26242
export function socket<Send = unknown>(
  setup: SocketSetup<AnyParser, null, AnyParser, AnyParser, Send>,
): Socket<{ setup: SocketSetup<AnyParser, null, AnyParser, AnyParser, Send> }>;
export function socket(
  schemaOrFn: (
    SocketSchema | SocketSetup<AnyParser, null, AnyParser, AnyParser, unknown>
  ),
): Socket {
  const schema = (
    typeof schemaOrFn === "function" ? { setup: schemaOrFn }
    : schemaOrFn
  );

  // Pull the message parser out before forwarding the schema to the endpoint
  // factory, it doesn't work the same way. Then remember to re-assign the
  // message to the returned handler
  const { message } = schema;
  delete schema.message;

  const parseMessage = (
    typeof message === "function" ? message
    : message ? message.parse
    : undefined
  );

  const handler = endpoint({
    ...schema,
    resolve: async x => {
      const { socket, response } = Deno.upgradeWebSocket(x.req);

      const ws = webSocket(socket, {
        message: parseMessage && (async (input: unknown) => {
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
        }),
        serializers: schema.serializers,
      });
      
      if (schema.setup) {
        await schema.setup({ ...x, ws });
      }

      return response;
    },
  });

  return Object.assign(handler, { message }) as Socket;
}
