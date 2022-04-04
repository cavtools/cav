// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is server-only.
// *butter*

// TODO: accept multiple strings for the path init option
// TODO: spa() utiltity function that lets you specify multiple paths
// TODO: files and blobs that flush to disk when a certain memory threshold is
// reached. Using them works the same as regular files and blobs  
// TODO: Incorporate the standard library's multipart reader    
// TODO: CORS  
// TODO: RpcLimits  

import { asset } from "./asset.ts";
import { http, path as stdPath } from "./deps.ts";
import {
  NO_MATCH,
  requestData,
  requestBody,
  response,
  upgradeWebSocket,
  bakeCookie,
} from "./http.ts";
import { HttpError } from "./client.ts";

import type { AssetOptions } from "./asset.ts";
import type { Cookie, SocketResponse } from "./http.ts";
import type { Packers } from "./pack.ts";
import type { Socket } from "./client.ts";

/**
 * An object or function responsible for parsing data or throwing errors if the
 * data isn't shaped as expected. These can either be functions with a single
 * data argument that return the parsed data or an object with a `parse(data):
 * unknown` function property that does the same. Cav is specifically tuned to
 * be compatible with (but not dependent on) Zod, a schema-based data parsing
 * library. However, any parsing library can be used, as long as its parsers
 * satisfy this Parser interface. (Let me know if more shapes should be
 * supported in a github issue.) You can also write strongly-typed parsing
 * functions and objects by hand if you don't want to use a third-party
 * parsing library.
 *
 * To read more about Zod, visit https://github.com/colinhacks/zod.
 */
export type Parser<I = unknown, O = unknown> = (
  | ParserFunction<I, O>
  | ParserObject<I, O>
);

/**
 * A function that parses data. If data is not shaped as expected, an error
 * should be thrown.
 */
export interface ParserFunction<I = unknown, O = unknown> {
  (input: I): Promise<O> | O;
}

/** An object with a ParserFunction as its "parse" property. Zod compatible. */
export interface ParserObject<I = unknown, O = unknown> {
  parse(input: I): Promise<O> | O;
}

/** Extracts the input type of a given Parser. */
export type ParserInput<T> = (
  T extends { _input: infer I } ? I // zod
  : T extends Parser<infer I> ? I
  : never
);

/** Extracts the output type of a given Parser. */
export type ParserOutput<T> = (
  T extends { _output: infer O } ? O // zod
  : T extends Parser<unknown, infer O> ? O
  : never
);

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
  // deno-lint-ignore no-explicit-any
  Resp extends SocketFlag extends true ? SocketResponse<unknown> : any,
  Groups extends GroupsConstraint = null,
  Context extends ContextConstraint = null,
  Query extends QueryConstraint = null,
  Message extends MessageConstraint = null,
  SocketFlag extends SocketFlagConstraint = null,
> {
  (req: Request, conn: http.ConnInfo): Promise<Response>;
  /** The RpcInit options used to construct this Rpc. */
  readonly init: RpcInit<Resp, Groups, Context, Query, Message, SocketFlag>;
}

/**
 * Alias for an Rpc with any resolver or init types. Useful for type
 * constraints.
 */
// deno-lint-ignore no-explicit-any
export type AnyRpc = Rpc<any, any, any, any, any, any>;

type GroupsConstraint = Parser<Record<string, string> | undefined> | null;
type ContextConstraint = Ctx<unknown> | null;
type QueryConstraint = Parser<Record<string, string | string[]> | undefined> | null;
type MessageConstraint = Parser | null;
type SocketFlagConstraint = boolean | null;

/** Initializer options when constructing Rpcs. */
export interface RpcInit<
  // deno-lint-ignore no-explicit-any
  Resp extends SocketFlag extends true ? SocketResponse<unknown> : any,
  Groups extends GroupsConstraint = null,
  Context extends ContextConstraint = null,
  Query extends QueryConstraint = null,
  Message extends MessageConstraint = null,
  SocketFlag extends SocketFlagConstraint = null,
>{
  /**
   * If the routed path of the request doesn't match this URLPattern string, a
   * NO_MATCH error will be thrown and the stack will continue searching for
   * matching routes. If this string starts with "^", the full Request path is
   * used instead of the routed path. (The routed path is determined by the
   * containing stack, the full path comes from `req.url.pathname`.) The default
   * behavior expects that the containing stack(s) consumed the entire path,
   * thus leaving the Rpc path as "/". The full URLPattern syntax is supported,
   * and any captured path groups will be merged with the path groups captured
   * by the containing stacks before undergoing groups parsing. (See the docs
   * for the "groups" property.) The path which matched this string is
   * accessible on the ResolverArg, CtxArg, and OnErrorArg as the "path"
   * property. Default: `"/"`
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
  trailingSlash?: "require" | "allow" | "reject" | "redirect" | null;
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
   * For non-socket Rpcs, this limits the maximum size of the Request body. Note
   * that, currently, the entire Request body is loaded into memory during
   * request processing. Support for large file uploads is in the works. The
   * unit is bytes. Default: `5 * 1024 * 1024` (5 MB)
   */
  maxBodySize?: number | null;
  /**
   * When true, this Rpc is expected to return a SocketResponse resulting from a
   * call to the ResolverArg's "upgrade" utility function. The allowed methods
   * will be limited to "GET" and "HEAD", and the "message" parser will be used
   * for received socket messages instead of request bodies. Default: `false`
   */
  socket?: SocketFlag;
  /**
   * Keys used when creating the "cookie" that's available on the ResolverArg.
   * If this isn't provided, a random fallback key will be used. Default: `null`
   */
  keys?: [string, ...string[]] | null;
  /**
   * Packers used when packing and unpacking request and response bodies as
   * well as socket messages. Default: `null`
   */
  packers?: Packers | null;
  /**
   * Error handler which should return a response whenever an error occurs. This
   * will not receive the NO_MATCH error that may get thrown if a request path
   * doesn't match the Rpcs path pattern. Any error that gets re-thrown will
   * bubble, presumably up to the top-level Server. If this isn't provided, the
   * default behavior is to serialize HttpErrors and re-throw any other kind of
   * error. Default: `null`
   */
  onError?: OnError | null;
  // FIXME
  resolve: Resolver<
    Resp,
    Groups,
    Context,
    Query,
    Message,
    SocketFlag
  >;
}

// FIXME
  // deno-lint-ignore no-explicit-any
export type AnyRpcInit = RpcInit<any, any, any, any, any, any>;

/**
 * In Cav, there is no middleware. To fill the gap, Rpcs can leverage Ctx
 * functions to create context-dependent data related to a request. These
 * functions are where you'd set up databases, create session objects, etc.
 * Anything returnd by this function is available on the ResolverArg as "ctx".
 */
export interface Ctx<C extends unknown = undefined> {
  (x: CtxArg): Promise<C> | C;
}

/** Arguments available to the Ctx function of an Rpc. */
export interface CtxArg {
  /** The incoming Request. */
  req: Request;
  /** The outgoing Headers, applied before a Response is returned. */
  res: Headers;
  /** The WHATWG URL for the current Request. */
  url: URL;
  /** The Deno-provided ConnInfo associated with the request. */
  conn: http.ConnInfo;
  /** The cookie constructed after the Rpc path matched the request. */
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
  whenDone(fn: () => Promise<void> | void): void;
}

/**
 * Handles errors in an Rpc. The value returned from OnError is passed through
 * the response() function, i.e. it undergoes packing. To bypass packing, return
 * a Response object. The res headers associated with the request will still be
 * applied.
 */
export interface OnError {
  (x: OnErrorArg): unknown;
}

/** Arguments available to the OnError function of an Rpc. */
export interface OnErrorArg extends CtxArg {
  /** The offending error. */
  error: unknown;
  /**
   * Searches for an asset on disk and either returns a Response containing that
   * asset or throws a NO_MATCH error if the asset isn't found. See the
   * documentation for the top-level asset() function for more details; this
   * function is the same thing but bound to the Request received by the Rpc.
   */
  asset(opt: AssetOptions): Promise<Response>;
  /** Packs a response to return. Use this if you need to set status/Text. */
  response: typeof response;
}

/**
 * After an Rpc matches with an incoming request, the Resolver is responsible
 * for resolving the request data into a response to send back to the client.
 * The value returned from the Resolver will be packed with the top-level
 * response() function, i.e. it undergoes packing via packBody().
 */
export interface Resolver<
  // deno-lint-ignore no-explicit-any
  Resp extends SocketFlag extends true ? SocketResponse<unknown> : any,
  Groups extends GroupsConstraint,
  Context extends ContextConstraint,
  Query extends QueryConstraint,
  Message extends MessageConstraint,
  SocketFlag extends SocketFlagConstraint
> {
  (x: ResolverArg<
    Groups,
    Context,
    Query,
    Message,
    SocketFlag
  >): Promise<Resp> | Resp;
}

/** Arguments available to a Resolver function. */
export interface ResolverArg<
  Groups extends GroupsConstraint,
  Context extends ContextConstraint,
  Query extends QueryConstraint,
  Message extends MessageConstraint,
  SocketFlag extends SocketFlagConstraint,
> {
  /** The incoming Request this Rpc is handling. */
  req: Request;
  /** Response headers to include when the Response is constructed. */
  res: Headers;
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
  ctx: Context extends Ctx<infer C> ? C : unknown;
  /** The parsed query string parameters object. */
  query: ParserOutput<Query>;
  /** If this isn't a socket-type Rpc, this will be the parsed request body. */
  message: SocketFlag extends true ? undefined : ParserOutput<Message>;
  /**
   * If this is a socket-type Rpc, this function is a bound version of the
   * top-level upgradeWebSocket function. It upgrades the request to be a
   * websocket and returns the socket as well as a SocketResponse which should
   * be returned by the resolver. The type parameter indicates the type of
   * message the socket will send back to the client, so that the client types
   * can know what to expect when the client socket receives messages.
   */
  upgrade: SocketFlag extends true ? (
    <SendType extends unknown = unknown>() => {
      socket: Socket<SendType, Message>;
      response: SocketResponse<SendType>;
    }
  ): undefined;
  /**
   * Searches for an asset on disk and either returns a Response containing that
   * asset or throws a 404 error if the asset isn't found. See the documentation
   * for the top-level asset() function for more details; this function is the
   * same thing but bound to the Request received by the Rpc.
   */
  asset(opt: AssetOptions): Promise<Response>;
  /**
   * Packs a response to return. Because the return value of the resolver is
   * already processed and packed, you should only need this if you want to set
   * status/Text explicitly.
   */
  response: typeof response;
  /**
   * Returns a redirect Response. If the redirect path doesn't specify an
   * origin, the origin of the current request is used. If the path starts with
   * a ".", it is joined with the pathname of the request to get the final
   * redirect path. If the status isn't provided, 302 is used.
   */
  redirect(to: string, status?: number): Response;
  /**
   * The same whenDone registration function available on the CtxArg when
   * constructing the ctx. Typically, this will only be used inside the Ctx
   * function, but there's no reason you can't also use it in the Resolver so
   * here it is.
   */
  whenDone: CtxArg["whenDone"];
}

/**
 * A factory function for creating Rpc handlers. Factories are useful for DRY
 * programming; when a lot of the Rpcs you're creating have the same shape, you
 * can create an RpcFactory that will use a custom set of default RpcInit
 * options. That RpcFactory would then replace each `rpc()` call where you'd
 * like the defaults to be applied. Options provided to the factory on the init
 * argument will still override the factory's default options. The top-level
 * rpc() function is itself an RpcFactory: `export const rpc = rpcFactory({});`.
 * The defaults used to create the factory are available on the `defaults`
 * property.
 */
export interface RpcFactory<
  DGroups extends GroupsConstraint = null,
  DContext extends ContextConstraint = null,
  DQuery extends QueryConstraint = null,
  DMessage extends MessageConstraint = null,
  DSocketFlag extends SocketFlagConstraint = null,
> {
  <
    // deno-lint-ignore no-explicit-any
    Resp extends SocketFlag extends true ? SocketResponse<unknown> : any,
    Groups extends GroupsConstraint = null,
    Context extends ContextConstraint = null,
    Query extends QueryConstraint = null,
    Message extends MessageConstraint = null,
    SocketFlag extends SocketFlagConstraint = null,
  >(
    init: RpcInit<
      Resp,
      Groups,
      Context,
      Query,
      Message,
      SocketFlag
    >,
  ): Rpc<
    Resp,
    Groups extends null ? DGroups : Groups,
    Context extends null ? DContext : Context,
    Query extends null ? DQuery : Query,
    Message extends null ? DMessage : Message,
    SocketFlag extends null ? DSocketFlag : SocketFlag
  >;
  /** The default RpcInit provided when constructing this RpcFactory. */
  readonly defaults: Omit<RpcInit<
    // deno-lint-ignore no-explicit-any
    any,
    DGroups,
    DContext,
    DQuery,
    DMessage,
    DSocketFlag
  >, "resolve">;
}

/**
 * Creates Rpc handlers from the provided RpcInit and Resolver. This function is
 * an RpcFactory with no defaults specified: 
 *
 * ```ts
 * export const rpc = rpcFactory({});
 * ```
 */
export const rpc = rpcFactory({});

/**
 * Creates a factory function for creating Rpc handlers. RpcInit options
 * provided to the created factory will be filtered for null or undefined
 * properties and then shallow-merged with the provided defaults. If an option
 * isn't specified in the defaults or the RpcInit, the library fallback will be
 * used.
 */
export function rpcFactory<
  DGroups extends GroupsConstraint = null,
  DContext extends ContextConstraint = null,
  DQuery extends QueryConstraint = null,
  DMessage extends MessageConstraint = null,
  DSocketFlag extends SocketFlagConstraint = null,
>(
  defaults: Omit<RpcInit<
    // deno-lint-ignore no-explicit-any
    any,
    DGroups,
    DContext,
    DQuery,
    DMessage,
    DSocketFlag
  >, "resolve">,
): RpcFactory<
  DGroups,
  DContext,
  DQuery,
  DMessage,
  DSocketFlag
> {
  const rpcFactory = (
    _init: AnyRpcInit,
  ): AnyRpc => {
    const init: AnyRpcInit = {
      ...defaults,
      resolve: _init.resolve,
    };
    if (_init) {
      for (const [k, v] of Object.entries(_init)) {
        if (v !== null && typeof v !== "undefined") {
          // deno-lint-ignore no-explicit-any
          (init as any)[k] = v;
        }
      }
    }

    const useFullPath = init.path && init.path.startsWith("^");
    const pathPattern = new URLPattern(
      init.path && useFullPath ? init.path.slice(1) : init.path || "/",
      "http://_._", // Doesn't matter, but stay consistent
    );

    const parsers = {
      groups:
        typeof init.groups === "function" ? init.groups
        : init.groups ? (v: unknown) => (init.groups as ParserObject).parse(v)
        : null,
      query:
        typeof init.query === "function" ? init.query
        : init.query ? (v: unknown) => (init.query as ParserObject).parse(v)
        : null,
      message:
        typeof init.message === "function" ? init.message
        : init.message ?
          (v: unknown) => (init.message as ParserObject).parse(v)
        : null,
    };

    const methods = new Set<string>(["OPTIONS"]);
    if (init.socket) {
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
      const { res, url, path: _path } = data;
      const path = useFullPath ? url.pathname : _path;

      const _asset = async (opt: AssetOptions) => {
        return await asset(req, opt);
      };

      const upgrade = (
        init.socket ? () => upgradeWebSocket(req, {
          messageParser: init.message || undefined,
          packers: init.packers || undefined,
        })
        : undefined
      );

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
        switch (init.trailingSlash) {
        case "require":
          if (!url.pathname.endsWith("/")) {
            throw NO_MATCH;
          }
          break;
        case "allow":
          break;
        case "reject":
          if (url.pathname.endsWith("/")) {
            throw NO_MATCH;
          }
          break;
        case "redirect":
        default:
          if (url.pathname.endsWith("/")) {
            const u = new URL(url.href);
            u.pathname = u.pathname.slice(0, u.pathname.length - 1);
            return Response.redirect(u.href, 302);
          }
          break;
        }
      }

      const cookie = await bakeCookie({
        req,
        res,
        keys: init.keys || undefined,
      });

      const whenDones: (() => Promise<void> | void)[] = [];
      const whenDone = (fn: () => Promise<void> | void) => {
        whenDones.push(fn);
      };

      const _response: typeof response = (body, _init) => {
        const resp = response(body, {
          ..._init,
          packers: _init?.packers || init.packers || undefined,
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
          res.append(
            "Allow",
            Array.from(methods.values()).join(", "),
          );
          await cookie.flush();
          return _response(null, {
            status: 204,
            headers: res,
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

        // If this isn't a socket-type Rpc, attempt to parse the request body if
        // there's a body parser. If parsing fails, rethrow if it's a Cav error
        // and wrap in a 400 if not. If there's no body parser or if this is a
        // socket rpc, skip this step (don't touch the body)
        let message: unknown = undefined;
        if (!init.socket && parsers.message) {
          message = await requestBody(req, {
            maxSize: init.maxBodySize || undefined,
            packers: init.packers || undefined,
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
        const r = await init.resolve({
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
          upgrade,
          asset: _asset,
          whenDone,
          redirect,
          response: _response,
        // deno-lint-ignore no-explicit-any
        } as ResolverArg<any, any, any, any, any>);
        await cookie.flush();
        return _response(r, { headers: res });
      } catch (e) {
        let e2: unknown = e;
        if (init.onError) {
          try {
            const r = await init.onError({
              ...ctxArg,
              asset: _asset,
              response: _response,
              error: e,
            });
            await cookie.flush();
            return _response(r, { headers: res });
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
        return _response(e2, { status: e2.status, headers: res });
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

  return Object.assign(rpcFactory, { defaults });
}

/** Initializer options for the assets() utility function. */
export type AssetsOptions = Omit<AssetOptions, "path">;

/**
 * Utility function for creating an Rpc handler specifically for serving static
 * assets. The asset filePath served is equal to the path provided to the
 * resolver for the constructed Rpc. Use the "init" option on the provided
 * AssetsInit to fine-tune the behavior of the created Rpc. Unless overridden,
 * the "path" RpcInit option is set to "*" and the "trailingSlash" RpcInit
 * option is set to "allow".
 */
export function assets(opt?: AssetsOptions) {
  return rpc({
    path: "*",
    trailingSlash: "allow",
    resolve: x => {
      return x.asset({
        ...opt,
        path: x.path,
      });
    },
  });
}

/**
 * Utility function for creating an Rpc handler that always redirects. If an
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
