// Copyright 2022 Connor Logan. All rights reserved. MIT License.

// TODO: html, css, js template tag utilities

// TODO: What happens when you try to upgrade for an assets request?  
// TODO: accept multiple strings for the path init option  
// TODO: files and blobs that flush to disk when a certain memory threshold is
// reached. Using them works the same as regular files and blobs. They get
// deleted at the end of the request  
// TODO: Incorporate the standard library's multipart reader    
// TODO: CORS  
// TODO: RpcLimits  

import { http, path as stdPath } from "./deps.ts";
import {
  requestContext,
  requestBody,
  endpointResponse,
  bakeCookie,
  upgradeWebSocket,
} from "./http.ts";
import { serveAsset } from "./assets.ts";
import { HttpError } from "./serial.ts";
import type {
  Socket,
  EndpointRequest,
  EndpointResponse,
} from "./client.ts";
import type { Cookie } from "./http.ts";
import type {
  AnyParser,
  ParserOutput,
  ParserInput,
} from "./parser.ts";
import type { Serializers } from "./serial.ts";
import type { ServeAssetOptions } from "./assets.ts";

/**
 * Cav's endpoint HTTP handler. Rpcs are one of two fundamental building blocks
 * of Cav server applications, the other being Stacks. Stacks are responsible
 * for routing a request, Rpcs are responsible for handling them.
 */
export interface Rpc<I extends AnyRpcInit = Record<never, never>> {
  (
    req: EndpointRequest<
      ParserInput<I["query"]>,
      ParserInput<I["message"]>,
      I["upgrade"] extends true ? true : never
    >,
    conn: http.ConnInfo,
  ): Promise<EndpointResponse<
    // deno-lint-ignore no-explicit-any
    I["resolve"] extends (...a: any[]) => Promise<infer R> | infer R ? R
    : "resolve" extends keyof I ? never
    : undefined
  >>;
  /** The RpcInit options used to construct this Rpc. */
  readonly init: I;
}

/** Alias for an Rpc with any init type. Useful for type constraints. */
export type AnyRpc = Rpc<AnyRpcInit>;

/** Initializer options for constructing Rpcs. */
export interface RpcInit<
  Resp = unknown,
  Groups extends AnyParser | null = null,
  Context extends AnyCtx | null = null,
  Query extends AnyParser | null = null,
  Message extends AnyParser | null = null,
  Upgrade extends boolean | null = null,
>{
  /**
   * If the path of the request doesn't match this URLPattern string, a 404
   * Response will be returned before resolution starts. If this string starts
   * with "^", the full Request path is used instead of the Stack routed path.
   * The fallback behavior expects that the containing Stack(s) consumed the
   * entire path, equivalent to specifying `path: "/"`. The full URLPattern
   * syntax is supported, and any captured path groups will be merged with the
   * path groups captured by the containing stack(s) before groups parsing. The
   * path that matched this string is available on the ResolveArg, CtxArg, and
   * ResolveErrorArg as the "path" property. Default: `"/"`
   */
  path?: string | null;
  /**
   * When a Request matches the path for this Rpc, all captured groups from the
   * Rpc and the Stack will be parsed using this Parser. If the Parser throws an
   * error, the Rpc will suppress the error and return a 404 Response. The
   * result of parsing is available on the ResolverArg as the "groups" property.
   * If the parser is "optional" (i.e. it successfully parses `undefined`), all
   * parsing errors will be suppressed and that fallback value will be used for
   * the ResolveArg whenever an error is thrown. Default: `null`
   */
  groups?: Groups;
  /**
   * This limits the maximum size of the Request body. Note that, currently, the
   * entire Request body is loaded into memory during request processing.
   * Support for large file uploads is in the works. Unit: bytes. Default: `5 *
   * 1024 * 1024` (5 MB)
   */
  maxBodySize?: number | null;
  /**
   * Keys used when creating the "cookie" that's available to the ctx, resolve,
   * and resolveError functions. If this isn't provided, a random fallback key
   * will be used. Default: `null`
   */
  keys?: [string, ...string[]] | null;
  /**
   * Additional serializers to use when serializing and deserializing request
   * and response bodies and web socket messages. Default: `null`
   */
  serializers?: Serializers | null;
  /**
   * If true, this causes requests to be upgraded into web sockets. Requests
   * that don't request an upgrade will be rejected. The resolve function should
   * return the response from the `upgrade()` utility available on the
   * ResolveArg. Default: `null`
   */
  upgrade?: Upgrade;
  /**
   * A function responsible for constructing the "ctx" property available to the
   * resolve function. This is only run if the requested path matched. Default:
   * `null`
   */
  ctx?: Context;
  /**
   * A parser used to parse the "query" object created from the Request's query
   * string parameters. This data comes from the query string in the url of the
   * request. Default: `null`
   */
  query?: Query;
  /**
   * A parser used to either (1) parse the Request body after it's deserialized
   * using deserializeBody or (2) parse the message received if this Rpc results
   * in a web socket connection via the "upgrade" option. Default: `null`
   */
  message?: Message;
  /**
   * This function is called to resolve the parsed request into a response to
   * serialize and send back to the client. If nothing is provided, the response
   * will be a 204 no content.
   */
  resolve?: Resolve<
    Resp,
    Groups,
    Context,
    Query,
    Message,
    Upgrade
  > | null;
  /**
   * When an error is thrown during processing, this function can handle the
   * error. The return value will be serialized into a Response to send back to
   * the client. Returning undefined or re-throwing the error will cause that
   * error to be serialized as the response, which is the default behavior.
   * Default: `null`
   */
  resolveError?: ResolveError | null;
}

/**
 * Constructs a new RpcInit. This simply returns the first argument, it's only
 * provided for typing purposes so that you don't need to manually specify the
 * types when extracting out an spreadable RpcInit object. Use this to stay DRY.
 */
export function rpcInit<
  Resp,
  Groups extends AnyParser | null,
  Context extends AnyCtx | null,
  Query extends AnyParser | null,
  Message extends AnyParser | null,
  Upgrade extends boolean | null,
  I,
>(
  init: I & RpcInit<Resp, Groups, Context, Query, Message, Upgrade>,
): I {
  return init;
}

/** Matches any RpcInit. Useful for type constraints. */
export type AnyRpcInit = RpcInit<
  // deno-lint-ignore no-explicit-any
  any,
  AnyParser | null,
  AnyCtx | null,
  AnyParser | null,
  AnyParser | null,
  boolean | null
>;

/**
 * In Cav, there is no middleware. To fill the gap, Rpcs can leverage Ctx
 * functions to create context-dependent data related to a request. These
 * functions are where you'd set up databases, create session objects, etc. The
 * value returned from this function is available as the `ctx` property for an
 * Rpc's resolve and resolveError functions.
 */
export interface Ctx<Val = unknown> {
  (x: CtxArg): Promise<Val> | Val;
}

/** Matches any valid context function. Useful for type constraints. */
// deno-lint-ignore no-explicit-any
export type AnyCtx = Ctx<any>;

/** Arguments available to the Ctx function of an Rpc. */
export interface CtxArg {
  /** The incoming Request. */
  req: Request;
  /**
   * A ResponseInit applied to the Rpc response after resolving and packing the
   * value to send to the client. The Headers object is always available. If the
   * resolved value is a Response object already, the status and statusText will
   * be ignored but the headers will still be applied.
   */
  res: ResponseInit & { headers: Headers; };
  /** The WHATWG URL for the current Request. */
  url: URL;
  /** The Deno-provided ConnInfo associated with the request. */
  conn: http.ConnInfo;
  /**
   * The cookie constructed after the Rpc path matched the request. For socket
   * Rpcs, the cookies can only be altered inside the Ctx function. Alterations
   * inside the other event handlers won't be synced with the client because the
   * Response object was already sent.
   */
  cookie: Cookie;
  /** The path that matched the Rpc's path init option. */
  path: string;
  /** The raw query object associated with this request. */
  query: Record<string, string | string[]>;
  /** The raw path groups object associated with this request. */
  groups: Record<string, string>;
  /**
   * Some Ctx functions may need to run cleanup tasks once a Response is ready
   * to send back to the client. Functions registered with cleanup() will be
   * added to a stack structure, and just before the Rpc returns a response, the
   * registered tasks will be executed in stack order (Last In First Out).
   */
  cleanup: (fn: () => Promise<void> | void) => void;
}

/**
 * After an Rpc matches with an incoming request, the Resolve function is
 * responsible for resolving the request data into a response to send back to
 * the client. The value returned from the Resolver will be packed with the
 * top-level response() function, i.e. it undergoes packing via packBody().
 */
export interface Resolve<
  Resp,
  Groups extends AnyParser | null,
  Context extends AnyCtx | null,
  Query extends AnyParser | null,
  Message extends AnyParser | null,
  Upgrade extends boolean | null,
> {
  (x: ResolveArg<
    Groups,
    Context,
    Query,
    Message,
    Upgrade
  >): Promise<Resp> | Resp;
}

/** Arguments available to a Resolver function. */
export interface ResolveArg<
  Groups extends AnyParser | null,
  Context extends AnyCtx | null,
  Query extends AnyParser | null,
  Message extends AnyParser | null,
  Upgrade extends boolean | null,
> {
  /** The incoming Request this Rpc is handling. */
  req: Request;
  /**
   * A ResponseInit applied to the Rpc response after resolving and packing the
   * value to send to the client. The Headers object is always available. If the
   * resolved value is a Response object already, the status and statusText will
   * be ignored but the headers will still be applied.
   */
  res: ResponseInit & { headers: Headers; };
  /** The WHATWG URL for this request. */
  url: URL;
  /** Connection information provided by Deno. */
  conn: http.ConnInfo;
  /** A Cookie baked with the req and res headers. */
  cookie: Cookie;
  /** The path that matched this Rpc's path init option. */
  path: string;
  /** The parsed path groups object captured while routing the request. */
  groups: ParserOutput<Groups>;
  /** The context created by this Rpc's Ctx function. */
  ctx: Context extends Ctx<infer C> ? C : undefined;
  /** The parsed query string parameters object. */
  query: ParserOutput<Query>;
  /** If this isn't a socket-type Rpc, this will be the parsed request body. */
  message: Upgrade extends true ? undefined : ParserOutput<Message>;
  /**
   * Searches for an asset on disk and either returns a Response containing that
   * asset or throws a 404 HttpError if the asset isn't found. See the
   * documentation for the top-level asset() function for more details; this
   * function is the same thing but bound to the Request received by the Rpc.
   */
  asset: (opt: ServeAssetOptions) => Promise<Response>;
  /**
   * Returns a redirect Response. If the redirect path doesn't specify an
   * origin, the origin of the current request is used. If the path starts with
   * a ".", it is joined with the pathname of the request to get the final
   * redirect path. If the status isn't provided, 302 is used.
   */
  redirect: (to: string, status?: number) => Response;
  /**
   * Upgrades the request to become a web socket. This is only available if the
   * `upgrade` init option is `true`. The Response returned by this function
   * should be returned by the Rpc's resolve function.
   */
  upgrade: Upgrade extends true ? <Send = unknown>() => Socket<Send, (
    Message extends AnyParser ? ParserOutput<Message> : unknown
  )> : undefined;
}

/**
 * Handler for handling errors that occur during response resolution. Meant to
 * turn the errors into responses to send back to the client, using the same
 * serialization process and utilties available in the resolve function. If an
 * error is re-thrown, that error will be serialized as the response.
 */
 export interface ResolveError {
  (x: ResolveErrorArg): unknown;
}

/** Arguments available to the resolveError() function of an Rpc. */
export interface ResolveErrorArg {
  /** The incoming Request. */
  req: Request;
  /**
   * A ResponseInit applied to the Rpc response after resolving and packing the
   * value to send to the client. The Headers object is always available. If the
   * resolved value is a Response object already, the status and statusText will
   * be ignored but the headers will still be applied.
   */
  res: ResponseInit & { headers: Headers; };
  /** The WHATWG URL for the current Request. */
  url: URL;
  /** The Deno-provided ConnInfo associated with the request. */
  conn: http.ConnInfo;
  /** The Stack routed path of the request. */
  path: string;
  /** The raw query object associated with this request. */
  query: Record<string, string | string[]>;
  /** The path groups captured by the containing Stack(s). */
  groups: Record<string, string>;
  /** The thrown error. */
  error: unknown;
  /**
   * Searches for an asset on disk and either returns a Response containing that
   * asset or throws a 404 HttpError if the asset isn't found. See the
   * documentation for the top-level serveAsset() function for more details; this
   * function is the same thing but bound to the Request received by the Rpc.
   */
  asset: (opt: ServeAssetOptions) => Promise<Response>;
}

/** Creates an endpoint handler for resolving Requests into Responses. */
export function rpc<
  I,
  Resp = undefined,
  Groups extends AnyParser | null = null,
  Context extends AnyCtx | null = null,
  Query extends AnyParser | null = null,
  Message extends AnyParser | null = null,
  Upgrade extends boolean | null = null,
>(
  init: I & RpcInit<
    Resp,
    Groups,
    Context,
    Query,
    Message,
    Upgrade
  >,
): Rpc<I> {
  const checkMethod = methodChecker({
    message: init.message,
    upgrade: init.upgrade,
  });
  const matchPath = pathMatcher({
    path: init.path,
    groups: init.groups,
  });
  const parseInput = inputParser({
    query: init.query,
    message: init.message,
    maxBodySize: init.maxBodySize,
    serializers: init.serializers,
  });
  const upgradeSocket = init.upgrade && socketUpgrader({
    message: init.message,
    serializers: init.serializers,
  });

  const handler = async (req: Request, conn: http.ConnInfo) => {
    // Check for redirect
    const reqCtx = requestContext(req);
    if (reqCtx.redirect) {
      return reqCtx.redirect;
    }

    const { res, url } = reqCtx;
    const cleanupTasks: (() => Promise<void> | void)[] = [];
    let output: unknown = undefined;

    try {
      // Make sure the path matches, then check the method
      const { path, groups, unparsedGroups } = await matchPath(req);
      const options = await checkMethod(req);
      if (options) {
        return options;
      }

      // Set up the cookie
      const cookie = await bakeCookie({
        req,
        headers: res.headers,
        keys: init.keys || undefined,
      });
      cleanupTasks.push(() => cookie.flush());

      // Create the custom context, if there is one
      const url = reqCtx.url;
      let ctx: unknown = undefined;
      if (init.ctx) {
        ctx = await init.ctx({
          req, res, url, conn, cookie, path,
          query: reqCtx.query,
          groups: unparsedGroups,
          cleanup: (task: () => Promise<void> | void) => {
            cleanupTasks.push(task);
          },
        });
      }

      // Parse the input, i.e. the (query) string parameters and the request
      // body (message)
      const { query, message } = await parseInput(req);

      // Resolve to the output
      let socket: Socket | null = null;
      let socketResponse: Response | null = null;
      output = !init.resolve ? undefined : await init.resolve({
        req, res, url,
        conn, cookie, path,
        groups: groups as ParserOutput<Groups>,
        ctx: ctx as Context extends Ctx<infer C> ? C : undefined,
        query: query as ParserOutput<Query>,
        message: message as ParserOutput<Message>,
        asset: (opt: ServeAssetOptions) => serveAsset(req, opt),
        redirect: (to: string, status?: number) => {
          if (to.startsWith(".")) {
            to = stdPath.join(url.pathname, to);
          }
          const u = new URL(to, url.origin);
          return Response.redirect(u.href, status || 302);
        },
        // This next block is overly verbose. Don't dwell on it
        upgrade: (
          !init.upgrade ? undefined
          : () => {
            if (socket) {
              throw new Error(
                "upgrade() should only be called once per request",
              );
            }

            const u = upgradeSocket!(req);
            socket = u.socket;
            socketResponse = u.response;
            return socket;
          }
        ) as (
          Upgrade extends true ? <Send = unknown>() => Socket<Send, (
            Message extends AnyParser ? ParserOutput<Message>
            : undefined
          )>
          : undefined
        ),
      });

      // Make sure the socket got returned if this is an upgraded Rpc (this
      // restriction is to make the constructed Socket type available to the
      // client() function)
      if (init.upgrade && (!socket || output !== socket)) {
        throw new Error(
          "Upgraded Rpcs must resolve to the Socket returned by the upgrade() utility",
        );
      } else if (init.upgrade) {
        output = socketResponse;
      }
    } catch (err) {
      // Check to see if the resolveError function can handle it
      let error = err;
      let errorHandled = false;
      if (init.resolveError) {
        try {
          output = await init.resolveError({
            req, res, url,
            conn, error,
            path: reqCtx.path,
            query: reqCtx.query,
            groups: reqCtx.groups,
            asset: (opt: ServeAssetOptions) => serveAsset(req, opt),
          });
          if (typeof output !== "undefined") {
            errorHandled = true;
          }
        } catch (err2) {
          error = err2;
        }
      }

      // If it's an error but it's not an HttpError, mask it with a 500 error
      // and a bugtrace code
      if (!errorHandled && error instanceof HttpError) {
        output = error;
      } else if (!errorHandled) {
        const bugtrace = crypto.randomUUID().slice(0, 8);
        console.error(`ERROR: Uncaught exception [${bugtrace}] -`, err);
        output = new HttpError(`500 internal server error [${bugtrace}]`, {
          status: 500,
        });
      }
    }

    // Cleanup
    while (cleanupTasks.length) {
      const task = cleanupTasks.pop()!;
      await task();
    }

    // Serialize the response, and handle HEAD requests appropriately
    const response = endpointResponse(output, {
      ...res,
      serializers: init.serializers || undefined,
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

  return Object.assign(handler, { init });
}

/**
 * Given an Rpc's "message" and "upgrade" options, this returns a function that
 * checks whether a Request's method is allowed or not during Rpc handling. When
 * a request's method isn't in the calculated set of allowed methods, a 405
 * HttpError will be thrown. If the returned value is a Response, it should be
 * returned to the client right away. It means the request is an OPTIONS
 * request, and the Response returned is meant to handle it.
 *
 * OPTIONS is always an allowed method. If the "upgrade" option is `true` or if
 * the message parser is `null` or `undefined`, GET and HEAD will be allowed. If
 * there's a message parser and it successfully parses `undefined`, GET, HEAD,
 * and POST will be allowed. If the message parser throws an error while parsing
 * `undefined`, only POST will be allowed.
 */
function methodChecker(opt: {
  message?: AnyParser | null;
  upgrade?: boolean | null;
}): (req: Request) => Promise<Response | null> {
  const parseMessage = (
    typeof opt.message === "function" ? opt.message
    : opt.message ? opt.message.parse
    : null
  );
  let allowed: Set<string> | null = null;
  return async (req: Request) => {
    if (!allowed) {
      allowed = new Set(["OPTIONS"]);

      if (opt.upgrade) {
        allowed.add("GET");
        allowed.add("HEAD");
      } else {
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
 * Returns a function that checks whether or not a Request matches with the Rpc
 * using its "path" pattern option. If the path pattern starts with '^', the
 * full pathname on the Request url will be used. Otherwise, the "routed" path
 * will be used, which may not be the same as the full path if this Rpc is
 * nested inside a Stack. If no "path" option is specified, "/" is the default
 * meaning the containing Stack(s) should have routed (i.e. consumed) the entire
 * request path before reaching the called Rpc.
 *
 * When calling the returned function, if the request path matches, the groups
 * on the RequestContext (captured by the containing Stack(s)) will be merged
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
    const reqCtx = requestContext(req);
    const path = useFullPath ? reqCtx.url.pathname : reqCtx.path;

    const match = pattern.exec(path, "http://_._");
    if (!match) {
      throw new HttpError("404 not found", { status: 404 });
    }

    const unparsedGroups = { ...reqCtx.groups, ...match.pathname.groups };
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
 * Creates an input parser that processes the Rpc input using the relevant
 * RpcInit options. If parsing fails, a 400 HttpError will be thrown with the
 * offending error exposed on the "expose" property. If it succeeds, the parsed
 * query and message will be returned.
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
    const reqCtx = requestContext(req);

    let query: unknown = reqCtx.query;
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

      message = await requestBody(req, {
        maxSize: opt.maxBodySize || undefined,
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

/**
 * Returns a function that upgrades the request into a web socket, returning the
 * Response to return to the client as well as the socket instance. The relevant
 * RpcInit options, like the message parser, should be provided. This should
 * only be used for upgraded Rpcs.
 */
function socketUpgrader(opt: {
  message?: AnyParser | null;
  serializers?: Serializers | null;
}): (req: Request) => {
  response: Response;
  socket: Socket<unknown, unknown>;
} {
  const parseMessage = (
    typeof opt.message === "function" ? opt.message
    : opt.message ? opt.message.parse
    : null
  );

  return (req) => {
    const { socket, response } = upgradeWebSocket(req, {
      serializers: opt.serializers,
      message: async (m: unknown) => {
        if (!parseMessage) {
          return m;
        }
        try {
          return await parseMessage(m);
        } catch (err) {
          socket.send(new HttpError("400 bad request", {
            status: 400,
            expose: err,
          }));
        }
      },
    });

    return { socket, response };
  };
}