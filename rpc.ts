// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is server-only.

// TODO: What happens when you try to upgrade for an assets request?
// TODO: accept multiple strings for the path init option
// TODO: spa() utiltity function that lets you specify multiple paths
// TODO: files and blobs that flush to disk when a certain memory threshold is
// reached. Using them works the same as regular files and blobs  
// TODO: Incorporate the standard library's multipart reader    
// TODO: CORS  
// TODO: RpcLimits  

import { http, path as stdPath } from "./deps.ts";
import {
  NO_MATCH,
  requestData,
  requestBody,
  response,
  bakeCookie,
  serveAsset,
  upgradeWebSocket,
} from "./http.ts";
import { HttpError, Socket } from "./client.ts";

import type {
  Cookie,
  ServeAssetOptions,
  Res,
} from "./http.ts";
import type { Serializers } from "./serial.ts";
import type {
  Parser,
  ParserFunction,
  ParserObject,
  ParserOutput,
} from "./parser.ts";

export type GroupsParser = Parser<Record<string, string> | undefined>;
export type QueryParser = Parser<
  Record<string, string | string[]> | undefined
>;

/**
 * An http.Handler constructed by an RpcFactory. Rpcs are one of two fundamental
 * building blocks of Cav server applications, the other being Stacks. Rpcs are
 * responsible for handling a request, and Stacks are responsible for routing a
 * request to the appropriate Rpc. Once a Request reaches an Rpc and the Rpc's
 * path matches the request, the Rpc is expected to handle all errors and return
 * a Response. If the path doesn't match the Rpc's path, the special NO_MATCH
 * error will be thrown. Uncaught errors bubble up to and are handled by the
 * top-level Server, which will log them and respond with a 500 Response.
 */
export interface Rpc<
  Resp = unknown,
  Groups extends GroupsParser | null = null,
  Context extends Ctx<unknown> | null = null,
  Query extends QueryParser | null = null,
  Message extends Parser | null = null,
  Upgrade extends boolean | null = null,
> {
  (req: Request, conn: http.ConnInfo): Promise<Response>;
  /** The RpcInit options used to construct this Rpc. */
  readonly init: RpcInit<Resp, Groups, Context, Query, Message, Upgrade>;
}

/**
 * Alias for an Rpc with any resolver or init types. Useful for type
 * constraints.
 */
export type AnyRpc = Rpc<
  // deno-lint-ignore no-explicit-any
  any,
  // deno-lint-ignore no-explicit-any
  Parser<Record<string, string> | undefined, any> | null,
  // deno-lint-ignore no-explicit-any
  Ctx<any> | null,
  // deno-lint-ignore no-explicit-any
  Parser<Record<string, string | string[]> | undefined, any> | null,
  // deno-lint-ignore no-explicit-any
  Parser<any, any> | null
>;

/** Initializer options when constructing Rpcs. */
export interface RpcInit<
  Resp = unknown,
  Groups extends GroupsParser | null = null,
  Context extends Ctx<unknown> | null = null,
  Query extends QueryParser | null = null,
  Message extends Parser | null = null,
  Upgrade extends boolean | null = null,
>{
  /**
   * If the routed path of the request doesn't match this URLPattern string, the
   * NO_MATCH error will be thrown and the stack will continue searching for
   * matching routes. If this string starts with "^", the full Request path is
   * used instead of the routed path. (The routed path is determined by the
   * containing stack, the full path comes from `req.url.pathname`.) The default
   * behavior expects that the containing stack(s) consumed the entire path,
   * thus leaving the Rpc path as "/". The full URLPattern syntax is supported,
   * and any captured path groups will be merged with the path groups captured
   * by the containing stack(s) before undergoing groups parsing. (See the docs
   * for the "groups" property.) The path that matched this string is available
   * on the ResolveArg, CtxArg, and ResolveErrorArg as the "path" property.
   * Default: `"/"`
   */
  path?: string | null;
  /**
   * When a Request matches the path for this Rpc, all captured groups from the
   * Rpc and the Stack will be parsed using this Parser. If the Parser throws an
   * error, the error will be converted into a NO_MATCH and the containing stack
   * will continue looking for matching routes to handle the request. The result
   * of parsing is available on the ResolverArg as the "groups" property. If the
   * parser is "optional" (i.e. it successfully parses `undefined`), all parsing
   * errors will be suppressed and that fallback value will be used for the
   * ResolverArg whenever an error is thrown. Default: `null`
   */
  groups?: Groups;
  /**
   * Controls what to do when a matching path does or does not have a trailing
   * slash at the end of it. "require" will cause paths to not match if there's
   * no trailing slash. "allow" will allow but not require trailing slashes
   * (note that this may have negative SEO implications if multiple paths lead
   * to the same page being served). "reject" will cause paths with a trailing
   * slash to not match. "redirect" will cause otherwise matching requests with
   * a trailing slash to be redirected to the same path without the trailing
   * slash. This setting is ignored if the requested path is the root path "/".
   * Default: `"redirect"`
   */
  // REVIEW: I decided to remove the ability to change this behavior. I like the
  // consistency and aesthetic of "no trailing slashes", and there's code in
  // http.ts to account for re-based index files. There may be edge cases and it
  // might still be true that banning trailing slashes is a mistake, so I'm just
  // commenting the code out for now instead of removing it.  
  // trailingSlash?: TrailingSlashOpt | null;
  /**
   * This limits the maximum size of the Request body. Note that, currently, the
   * entire Request body is loaded into memory during request processing.
   * Support for large file uploads is in the works. The unit is bytes. Default:
   * `5 * 1024 * 1024` (5 MB)
   */
  maxBodySize?: number | null;
  /**
   * Keys used when creating the "cookie" that's available on the ResolverArg.
   * If this isn't provided, a random fallback key will be used. Default: `null`
   */
  keys?: [string, ...string[]] | null;
  /**
   * Serializers used when serializing and deserializing request and response
   * bodies as well as socket messages. Default: `null`
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
   * A Ctx function responsible for constructing the "ctx" property available on
   * the ResolverArg. This is only run if the requested path matched. Default:
   * `null`
   */
  ctx?: Context;
  /**
   * A parser used to parse the "query" object from the RequestData associated
   * with a Request. This data comes from the query string in the url of the
   * request. Default: `null`
   */
  query?: Query;
  /**
   * A parser used to either (1) parse the Request body after it's unpacked
   * using unpackBody or (2) parse the message received if this Rpc results in a
   * webSocket connection via the "upgrade" utility function available on the
   * ResolverArg. If this Rpc is not a socket-type Rpc and this parser does not
   * successfully parse `undefined`, the allowed methods for this Rpc will only
   * include "POST", not "GET" or "HEAD". If this Parser is omitted, the only
   * allowed methods are "GET" and "HEAD". If it does parse `undefined`, all
   * three methods are allowed. Default: `null`
   */
  message?: Message;
  /**
   * This function is called to resolve the parsed request into a response to
   * pack and send back to the client.
   */
  resolve: Resolve<
    Resp,
    Groups,
    Context,
    Query,
    Message,
    Upgrade
  >;
  /**
   * When an error is thrown during processing, this function is meant to handle
   * the error. The return value will be packed into a Response to send back to
   * the client.  Re-throwing the error will cause that error to be packed as
   * the response. Default: `null`
   */
  resolveError?: ResolveError | null;
}

/**
 * Constructs a new RpcInit. This simply returns the first argument, it's only
 * provided for typing purposes so that you don't need to manually specify the
 * type parameters.
 */
export function rpcInit<
  Resp = unknown,
  Groups extends GroupsParser | null = null,
  Context extends Ctx<unknown> | null = null,
  Query extends QueryParser | null = null,
  Message extends Parser | null = null,
  Upgrade extends boolean | null = null,
>(
  init: RpcInit<Resp, Groups, Context, Query, Message, Upgrade>,
): RpcInit<Resp, Groups, Context, Query, Message, Upgrade> {
  return init;
}

/**
 * Matches any given RpcInit. Useful for type constraints.
 */
export type AnyRpcInit = RpcInit<
  // deno-lint-ignore no-explicit-any
  any,
  // deno-lint-ignore no-explicit-any
  Parser<Record<string, string> | undefined, any> | null,
  // deno-lint-ignore no-explicit-any
  Ctx<any> | null,
  // deno-lint-ignore no-explicit-any
  Parser<Record<string, string | string[]> | undefined, any> | null,
  // deno-lint-ignore no-explicit-any
  Parser<any, any> | null,
  boolean | null
>;

/**
 * Controls whether an Rpc redirects, allows, requires, or rejects paths with trailing slashes.
 */
// export type TrailingSlashOpt = "redirect" | "allow" | "require" | "reject";

/**
 * In Cav, there is no middleware. To fill the gap, Rpcs can leverage Ctx
 * functions to create context-dependent data related to a request. These
 * functions are where you'd set up databases, create session objects, etc. The
 * value returned from this function is available as the `ctx` property for the
 * various Rpc event handler functions.
 */
export interface Ctx<Val = unknown> {
  (x: CtxArg): Promise<Val> | Val;
}

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
  res: Res;
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
   * to send back to the client. Functions registered with "whenDone" will be
   * added to a stack structure, and just before the Rpc returns a response,
   * each cleanup function will be popped from the stack and executed.
   */
  whenDone: (fn: () => Promise<void> | void) => void;
}

/**
 * After an Rpc matches with an incoming request, the Resolve function is
 * responsible for resolving the request data into a response to send back to
 * the client. The value returned from the Resolver will be packed with the
 * top-level response() function, i.e. it undergoes packing via packBody().
 */
export interface Resolve<
  Resp = unknown,
  Groups extends GroupsParser | null = null,
  Context extends Ctx<unknown> | null = null,
  Query extends QueryParser | null = null,
  Message extends Parser | null = null,
  Upgrade extends boolean | null = null,
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
  Groups extends GroupsParser | null = null,
  Context extends Ctx<unknown> | null = null,
  Query extends QueryParser | null = null,
  Message extends Parser | null = null,
  Upgrade extends boolean | null = null,
> {
  /** The incoming Request this Rpc is handling. */
  req: Request;
  /**
   * A ResponseInit applied to the Rpc response after resolving and packing the
   * value to send to the client. The Headers object is always available. If the
   * resolved value is a Response object already, the status and statusText will
   * be ignored but the headers will still be applied.
   */
  res: Res;
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
   * asset or throws a 404 error if the asset isn't found. See the documentation
   * for the top-level asset() function for more details; this function is the
   * same thing but bound to the Request received by the Rpc.
   */
  asset: (opt: ServeAssetOptions) => Promise<Response>;
  /**
   * Packs a response to return. 
   */
  // response: typeof response; // REVIEW: I don't think this is needed now
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
    Message extends Parser ? ParserOutput<Message> : unknown
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

/** Arguments available to the OnError function of an Rpc. */
export interface ResolveErrorArg extends CtxArg {
  /** The thrown error. */
  error: unknown;
  /**
   * If the error happened after context creation, this will be the returned
   * context object. Otherwise, it'll be undefined.
   */
  ctx?: unknown;
  /**
   * If the error happened after message parsing, this will be the parsed
   * message. Otherwise, it'll be undefined.
   */
  message?: unknown;
  /**
   * Only provided if this is a non-socket Rpc. Searches for an asset on disk
   * and either returns a Response containing that asset or throws a NO_MATCH
   * error if the asset isn't found. See the documentation for the top-level
   * asset() function for more details; this function is the same thing but
   * bound to the Request received by the Rpc.
   */
  asset: (opt: ServeAssetOptions) => Promise<Response>;
  /**
   * Only provided if this is a non-socket Rpc. Packs a response to return. Use
   * this if you need to set status/Text.
   */
  // response: typeof response;
}

/**
 * Creates an endpoint handler for resolving Requests into Responses.
 */
export function rpc<
  Resp = unknown,
  Groups extends GroupsParser | null = null,
  Context extends Ctx<unknown> | null = null,
  Query extends QueryParser | null = null,
  Message extends Parser | null = null,
  Upgrade extends boolean | null = null,
>(
  init: RpcInit<
    Resp,
    Groups,
    Context,
    Query,
    Message,
    Upgrade
  >,
): Rpc<Resp, Groups, Context, Query, Message, Upgrade> {
  const useFullPath = init.path && init.path.startsWith("^");
  const pathPattern = new URLPattern(
    init.path && useFullPath ? init.path.slice(1) : init.path || "/",
    "http://_._", // Doesn't matter, but stay consistent
  );

  const parsers: Record<
    "groups" | "query" | "message",
    // deno-lint-ignore no-explicit-any
    ParserFunction<any, any> | null
  > = {
    groups: (
      typeof init.groups === "function" ? init.groups
      : init.groups ? (v: unknown) => (init.groups as ParserObject).parse(v)
      : null
    ),
    query: (
      typeof init.query === "function" ? init.query
      : init.query ? (v: unknown) => (init.query as ParserObject).parse(v)
      : null
    ),
    message: (
      typeof init.message === "function" ? init.message
      : init.message ?
        (v: unknown) => (init.message as ParserObject).parse(v)
      : null
    ),
  };

  // Calculate the allowed methods based on the schema behavior
  const methods = new Set<string>(["OPTIONS"]);
  if (init.upgrade) {
    methods.add("GET");
    methods.add("HEAD");
  } else {
    (async function () {
      const postAllowed = !!parsers.message;
      let postRequired = false;
      if (parsers.message) {
        try {
          await parsers.message(undefined);
        } catch {
          postRequired = true;
        }
      }
      if (postAllowed) {
        methods.add("POST");
      }
      if (!postRequired) {
        methods.add("GET");
        methods.add("HEAD");
      }
    })();
  }

  const handler = async (req: Request, conn: http.ConnInfo) => {
    const data = requestData(req);
    if (data instanceof Response) { // Handle malformed path redirect
      return data;
    }
    
    const { res, url, path: _path } = data;
    const path = useFullPath ? url.pathname : _path;

    const asset = async (opt: ServeAssetOptions) => {
      return await serveAsset(req, opt);
    };

    let socket: Socket | null = null;
    let socketResponse: Response | null = null;
    // deno-lint-ignore no-explicit-any
    const upgrade: ResolveArg<any, any, any, any, true>["upgrade"] = () => {
      if (socket) {
        throw new Error(
          "upgrade() should only be called once for every upgraded request"
        );
      }
      const u = upgradeWebSocket(req, {
        message: async (m: unknown) => {
          if (!init.message) {
            return m;
          }
          try {
            return (
              typeof init.message === "function" ? await init.message(m)
              : typeof init.message === "object" ? await init.message.parse(m)
              : m
            );
          } catch (e) {
            socket!.send(new HttpError("400 bad request", {
              status: 400,
              expose: e,
            }));
          }
        },
        serializers: init.serializers,
      });
      socket = u.socket;
      socketResponse = u.response;
      return u.socket;
    }

    const redirect = (to: string, status?: number) => {
      if (to.startsWith(".")) {
        to = stdPath.join(url.pathname, to);
      }
      const u = new URL(to, url.origin);
      return Response.redirect(u.href, status || 302);
    };

    // Path matching. If there's no match, throw next to indicate to the
    // containing stack that it should continue searching for matches
    const match = pathPattern.exec(path, "http://_._");
    if (!match) {
      throw NO_MATCH;
    }

    // Merge the matching path groups with the path groups on the
    // request, then parse it. If the parse fails, try to parse
    // undefined. If that also fails, throw next
    let groups: unknown = undefined;
    if (parsers.groups) {
      groups = { ...data.groups, ...match.pathname.groups };
      const pg = groups as Record<string | number, string>;
      try {
        groups = await parsers.groups(pg);
      } catch {
        try {
          groups = await parsers.groups(undefined);
        } catch {
          throw NO_MATCH;
        }
      }
    }

    // Now that there's for sure a match, handle trailing slashes
    if (url.pathname !== "/") {
      if (url.pathname.endsWith("/")) {
        const u = new URL(url.href);
        u.pathname = u.pathname.slice(0, u.pathname.length - 1);
        return Response.redirect(u.href, 302);
      }

      // REVIEW: See the other REVIEW up top regarding trailingSlash
      // switch (init.trailingSlash) {
      // case "require":
      //   if (!url.pathname.endsWith("/")) {
      //     throw NO_MATCH;
      //   }
      //   break;
      // case "allow":
      //   break;
      // case "reject":
      //   if (url.pathname.endsWith("/")) {
      //     throw NO_MATCH;
      //   }
      //   break;d
      // case "redirect":
      // default:
      //   if (url.pathname.endsWith("/")) {
      //     const u = new URL(url.href);
      //     u.pathname = u.pathname.slice(0, u.pathname.length - 1);
      //     return Response.redirect(u.href, 302);
      //   }
      //   break;
      // }
    }

    const cookie = await bakeCookie({
      req,
      headers: res.headers,
      keys: init.keys || undefined,
    });

    const whenDones: (() => Promise<void> | void)[] = [];
    const whenDone = (fn: () => Promise<void> | void) => {
      whenDones.push(fn);
    };

    const _response: typeof response = (body, _init) => {
      const resp = response(body, {
        ..._init,
        headers: res.headers,
        serializers: init.serializers || undefined,
      });
      if (req.method === "HEAD") {
        return new Response(null, { headers: resp.headers });
      }
      return resp;
    };

    const ctxArg = {
      req,
      res,
      url,
      conn,
      cookie,
      query: data.query,
      path,
      groups: data.groups,
      whenDone,
    };

    try {
      // Get the custom context and merge its contents into the rpc context.
      // Errors thrown inside the custom context are allowed to bubble up to
      // the error catcher (no error wrapping)
      let ctx: unknown = undefined;
      if (init.ctx) {
        ctx = await init.ctx(ctxArg);
      }

      // Check the method against the allowed methods
      if (!methods.has(req.method)) {
        throw new HttpError("405 method not allowed", { status: 405 });
      }

      // If it's an OPTIONS request, handle it and return early  
      if (req.method === "OPTIONS") {
        res.headers.append(
          "Allow",
          Array.from(methods.values()).join(", "),
        );
        await cookie.flush();
        return _response(null, {
          status: 204,
          headers: res.headers,
        });
      }

      // Parse the query. If parsing fails, try to parse undefined instead. If
      // that also fails, rethrow the first error if it was a HttpError, or
      // wrap it in a HttpError if not
      let query: unknown = undefined;
      if (parsers.query) {
        try {
          query = await parsers.query(data.query);
        } catch (e) {
          try {
            query = await parsers.query(undefined);
          } catch (_trashed) {
            if (e instanceof HttpError) {
              throw e;
            }
            throw new HttpError("400 bad request", {
              status: 400,
              expose: { reason: "Query failed to parse", error: e },
            });
          }
        }
      }

      // Attempt to parse the request body if there's a body parser. If
      // parsing fails, rethrow if it's an HttpError and wrap in a 400 if not.
      // If there's no body parser or if this is a socket rpc, skip this step
      // (don't touch the body)
      let message: unknown = undefined;
      if (!init.upgrade && parsers.message) {
        message = await requestBody(req, {
          maxSize: init.maxBodySize || undefined,
          serializers: init.serializers || undefined,
        });

        try {
          message = await parsers.message(message);
        } catch (e) {
          if (e instanceof HttpError) {
            throw e;
          }
          throw new HttpError("400 bad request", {
            status: 400,
            expose: { reason: "Message failed to parse", error: e },
          });
        }
      }

      // Resolve to the response body and return the final response
      const r = !init.resolve ? undefined : await init.resolve({
        req,
        res,
        url,
        conn,
        cookie,
        path,
        groups,
        ctx,
        query,
        message,
        asset,
        redirect,
        // response: _response,
        upgrade: init.upgrade ? upgrade : undefined,
      // deno-lint-ignore no-explicit-any
      } as ResolveArg<any, any, any, any, any>);

      if (init.upgrade && (!socket || r !== socket)) {
        throw new Error("Upgraded Rpcs must resolve to the Socket returned by the upgrade() utility");
      }

      await cookie.flush();
      return _response(init.upgrade ? socketResponse : r);
    } catch (e) {
      let e2: unknown = e;
      if (init.resolveError) {
        try {
          const r = await init.resolveError({
            ...ctxArg,
            asset,
            // response: _response,
            error: e,
          });
          await cookie.flush();
          return _response(r);
        } catch (e3) {
          e2 = e3;
        }
      }

      // Every next branch leads to a return before the cookie is ever
      // modified again, so flush here instead of further down
      await cookie.flush();

      // If it's the NO_MATCH error, 500+ HttpError, or if it's any error
      // besides an HttpError, let it bubble without serializing. The Server
      // will catch it
      if (
        e2 === NO_MATCH ||
        !(e2 instanceof HttpError) ||
        e2.status >= 500
      ) {
        throw e2;
      }

      // If it's an HttpError, send it back as a response
      return _response(e2, { status: e2.status });
    } finally {
      let fn = whenDones.pop();
      while (fn) {
        await fn();
        fn = whenDones.pop();
      }
    }
  };

  return Object.assign(handler, { init });
}

// TODO: Add ctx and keys
/** Initializer options for the assets() utility function. */
export type AssetsInit = Omit<ServeAssetOptions, "path">;

// TODO: Add ctx and keys
/**
 * Utility for creating an Rpc handler specifically for serving static assets.
 * The resolver's path argument is used as the asset path.
 */
export function assets(init?: AssetsInit) {
  return rpc({
    path: "*",
    // REVIEW: See the other REVIEW up top regarding trailingSlash
    // trailingSlash: "allow",
    resolve: x => x.asset({
      ...init,
      path: x.path,
    }),
  });
}

/**
 * Utility for creating an Rpc handler that always redirects. If an
 * origin isn't provided in the redirect url, the origin of the request will be
 * used. Paths can also be relative; if the path starts with a ".", the path
 * will be joined with the pathname of the request using the std path.join()
 * function. If the status isn't provided, 302 is used. Note that paths with
 * trailing slashes will be redirected first to the path without the trailing
 * slash before being redirect to the specified destination. (2 hops)
 */
export function redirect(to: string, status?: number) {
  return rpc({
    path: "*",
    resolve: x => {
      return x.redirect(to, status || 302);
    },
  });
}
