// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { webSocket } from "./ws.ts";
import { HttpError, packRequest, unpack } from "./serial.ts";
import type { WS } from "./ws.ts";
import type { Serializers } from "./serial.ts";

// TODO: Constrain Query to Record<string, string | string[]>
// TODO: Support most/all of the regexes supported by NextJS's fs-based router  
// TODO: The ability to specify a Key parameter when constructing the client
// that pre-keys into the given handler if its a Router  

/**
 * Generic handler type for server-defined Request handlers.
 */
export type Handler = (
  req: Request,
  // deno-lint-ignore no-explicit-any
  ...a: any[]
) => Promise<Response> | Response;

/**
 * A server endpoint handler can use this Request type to ferry type information
 * to the client about what argument types are acceptable and what the Response
 * will deserialize into.
 */
export interface EndpointRequest<
  Query = unknown,
  Message = unknown,
  Resp = unknown,
> extends Request {
  // REVIEW: I wanted to use a Symbol() instead of string key so that this
  // property wouldn't show up in intellisense. However, doing that creates a
  // rogue Symbol() call in the asset bundles anytime this file is imported,
  // even if nothing from it is used. (Side-effect.) I didn't really like that,
  // so I switch it to zzz_cav (no side-effect), named so that it would come
  // last in the intellisense suggestions. Should I go back? Having something
  // like `Symbol("cav")` in the bundles would be arrogant but not that terrible
  // if it means this imaginary property never shows up
  /** @internal organs */
  zzz_cav?: { // imaginary
    socketEndpointRequest?: never;
    routerRequest?: never;
    endpointRequest: {
      query: Query;
      message: Message;
      resp: Resp;
    };
  };
}

/**
 * A server socket handler can use this Request type to ferry type information
 * to the client about valid the socket send/receive message types and
 * acceptable query string parameters for the initial request.
 */
export interface SocketRequest<
  Query = unknown,
  Send = unknown,
  Receive = unknown,
> extends Request {
  /** @internal organs */
  zzz_cav?: { // imaginary
    endpointRequest?: never;
    routerRequest?: never;
    socketEndpointRequest?: {
      query: Query;
      send: Send;
      receive: Receive;
    };
  };
}

/**
 * A server router handler can use this Request type to ferry type information
 * to the client about what routes exist and what data they accept/return. The
 * client uses the RouterShape to infer which property accesses are valid and
 * what their response type will be when called.
 */
export interface RouterRequest<
  Shape extends RouterShape = Record<never, never>,
> extends Request {
  /** @internal organs */
  zzz_cav?: { // imaginary
    endpointRequest?: never;
    socketEndpointRequest?: never;
    routerRequest: Shape;
  };
}

/**
 * Type constraint for the type parameter of a RouterRequest. The shape
 * describes the client property accesses that would result in a valid endpoint
 * call. The endpoints are specified by their handler definitions.
 */
 export interface RouterShape {
  [x: string]: ClientType;
}

/** Type constraint for the Client's type parameter. */
export type ClientType = (
  | Handler
  | { [x: number]: ClientType } // same thing as ClientType[]
  | RouterShape
  | null
);

// REVIEW: I was going to try two implementation ideas when approaching the e2e
// type safety problem re: how routers are handled on the client. One that
// expanded router paths into objects that resembled the router shape, and
// another that flattened the router shape into a 2D array of all acceptable
// paths. The former requires using a Proxy, the latter doesn't. I ended up
// going with the former because it seemed easier at the time given how
// typescript template strings work, and it better aligns with how routers get
// defined (like methods on objects). But now I'm not so sure since it isn't
// super intuitive and requires Proxies to pull it off (magic), which is
// generally discouraged in the community. I think time will tell me if I need
// to change it to the other idea. I kinda like it rn tho... magic is fun

/**
 * Expands a route path from a RouterRequest into an object representing the
 * Client property accesses required to trigger a request for that route.
 * Example: `ExpandPath<"hello/world", true>` becomes `{ hello: { world: true }
 * }`
 *
 * This is needed because routes are allowed to have slashes and/or path groups
 * in them.
 */
type ExpandPath<K, T> = (
  K extends `:${string}/${infer P2}` ? { [x: string]: ExpandPath<P2, T> }
  : K extends `*` | `:${string}` ? { [x: string]: T }
  : K extends `/${infer P}` | `${infer P}/` | `${infer P}/*` ? ExpandPath<P, T>
  : K extends `${infer P1}/${infer P2}` ? { [x in P1]: ExpandPath<P2, T> }
  : K extends string ? { [x in K]: T }
  : never
);

/**
 * Generates a type from the input with any strictly undefined/never properties
 * removed. Preserves optional properties.
 */
type Clean<
  T,
  Required = {
    [
      K in keyof T as (
        T[K] extends never ? never
          : undefined extends T[K] ? never
          : K
      )
    ]: T[K];
  },
  Optional = {
    [
      K in keyof T as (
        K extends keyof Required ? never
          : T[K] extends never ? never // ParserInput can return never
          : K
      )
    ]?: T[K];
  },
> = Required & Optional;

/** https://fettblog.eu/typescript-union-to-intersection/ */
type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends ((k: infer I) => void) ? I : never;

/**
 * A (Proxied) client function that wraps a `fetch()` process tailored for
 * making requests to a Cav handler.
 */
// i'm sorry
export type Client<T extends ClientType = null> = {
  <Socket extends boolean = false>(x: AnyClientArg<Socket>): (
    Socket extends true ? WS : Promise<[unknown, Response]>
  );
  [x: string]: Client;
} & (
  // Non-Cav handlers get the fallback treatment  
  // NOTE: This only works if T comes after the extends
  ((
    req: Request & { zzz_cav?: never },
    // deno-lint-ignore no-explicit-any
    ...a: any[]
  ) => Promise<Response> | Response) extends T ? Client

  // Router
  : T extends (
    req: RouterRequest<infer S>,
    // deno-lint-ignore no-explicit-any
    ...a: any[]
  ) => Response | Promise<Response> ? Client<S>

  // Endpoint
  : T extends (
    req: EndpointRequest<infer Q, infer M, infer R>,
    // deno-lint-ignore no-explicit-any
    ...a: any[]
  ) => Response | Promise<Response> ? (
    x: ClientArg<Q, M>,
  ) => Promise<[R, Response]>

  // SocketEndpoint
  : T extends (
    req: SocketRequest<infer Q, infer S, infer R>,
  ) => Response | Promise<Response> ? (
    x: ClientArg<Q, never, true>
  ) => WS<R, S> // NOTE: Not a Promise

  // RouterShape  
  // When a router's type is specified, the router's shape is passed back into
  // the client and gets handled here
  : T extends RouterShape ? UnionToIntersection<{
    [K in keyof T]: ExpandPath<K, Client<T[K]>>;
  }[keyof T]>

  // ClientType[]
  : T extends ClientType[] ? UnionToIntersection<Client<T[number]>>

  // no-op for anything else (see up top)
  // deno-lint-ignore ban-types
  : {}
);

// TODO: Any other fetch options that can be forwarded (example: CORS)
/**
 * Arguments for the client function when its internal path points to an
 * endpoint.
 */
export type ClientArg<
  Query = never,
  Message = never,
  Socket = never,
> = Clean<{
  /**
   * Additional path segments to use when making a request to this endpoint.
   * Including extra path segments should only be done if the endpoint expects
   * it. Default: `undefined`
   */
  path?: string;
  /**
   * Additional headers to include when making this request.
   */
  headers?: HeadersInit;
  /**
   * If the endpoint requires upgrading for web sockets (socket endpoint), this
   * value should be set to `true`. Default: `undefined`
   */
  socket: Socket extends true ? true : never;
  /**
   * The query string parameters expected by the endpoint. Default: `undefined`
   */
  query: Query;
  /**
   * This is the type of message the endpoint expects to be POSTed. Ignored if
   * the `socket` option is `true`. Default: `undefined`
   */
  message: Socket extends true ? never : Message;
  /**
   * Additional serializers to use while serializing data for this specific
   * request. Default: `undefined`
   */
  serializers?: Serializers;
  // onProgress?: (progress: number) => void | Promise<void>; // TODO
}>;

/**
 * ClientArg but without any type information. These are the arguments when the
 * type for the client function isn't known.
 */
export interface AnyClientArg<Socket extends boolean = false> {
  path?: string;
  socket?: Socket;
  headers?: HeadersInit;
  query?: unknown;
  message?: Socket extends true ? null | undefined : unknown;
  serializers?: Serializers;
  // onProgress?: (progress: number) => void | Promise<void>; // TODO
}

/**
 * Constructs a new Client function tied to the base URL. The provided set of
 * serializers will be used everywhere that data is de/serialized when using
 * this client, including web sockets.
 *
 * If the type parameter provided is a Router, Endpoint, or SocketEndpoint, the
 * returned Client's type will be tailored to match the inputs and outputs
 * expected by that handler.
 *
 * The Client is a function wrapped in a getter Proxy. Each property access will
 * return a new Client, extending the URL of the original Client; the periods
 * translate to path dividers and the property keys are path segments.
 * 
 * Extended example:
 *
 * ```ts
 * // server.ts -------------------------------------------
 *
 * import {
 *   router,
 *   endpoint,
 *   serve,
 * } from "https://deno.land/x/cav/mod.ts";
 *
 * export type Main = typeof main;
 *
 * const main = router({
 *   api: {
 *     v1: {
 *       // GET /api/v1/hello -> `123` (application/json)
 *       hello: endpoint(() => 123),
 *     },
 *     v2: {
 *       // GET /api/v2/hello?name=$name -> `$name` (text/plain)
 *       hello: endpoint({
 *         query: (q: { name: string }) => q,
 *         resolve: (x) => x.query.name,
 *       }),
 *     },
 *   },
 * });
 *
 * serve(main, { port: 8080 });
 *
 * // client.ts ---------------------------------------------
 *
 * import { client } from "https://deno.land/x/cav/mod.ts";
 * import type { Main } from "../server.ts";
 *
 * const main = client<Main>("http://localhost:8080");
 *
 * const v1 = main.api.v1.hello;
 * // Type: (x: ClientArg) => Promise<number>
 *
 * const v2 = main.api.v2.hello;
 * // Type: (x: ClientArg<{ name: string }>) => Promise<string>
 *
 * console.log(await v1());
 * console.log(await main.api.v1.hello());
 * // Output: [123, Response] (for both)
 *
 * console.log(await v2({ query: { name: "world" } }))
 * // Output: ["world", Response]
 *
 * console.log(await v2({ query: {} }));
 * // IDE error: Missing "name: string" on query
 * // Output: [undefined, Response]
 *
 * await main.not.found();
 * // Throws: HttpError("404 not found", { status: 404 })
 * ```
 */
export function client<T extends ClientType = null>(
  baseUrl = "",
  baseSerializers?: Serializers,
): Client<T> {
  // Remove duplicate/trailing slashes from the base url
  let [proto, ...others] = baseUrl.split("://");
  others = others.map(v => v.split("/").filter(v2 => !!v2).join("/"));
  baseUrl = proto + "://" + others.join("/");

  const clientFn = (path: string, x: AnyClientArg = {}) => {
    // Calculate the final request path
    let xp = x.path || "";
    xp = xp.split("/").filter(v => !!v).join("/");
    path = baseUrl + (path ? "/" + path : "") + (xp ? "/" + xp : "");

    // Check that there's no conflicting serializer names
    let serializers: Serializers = { ...(x.serializers || {}) };
    for (const [k, v] of Object.entries(serializers)) {
      if (v && baseSerializers && baseSerializers[k]) {
        throw new Error(
          `Conflict: The serializer key "${k}" is already used by one of the client's base serializers`,
        );
      } else if (!v) {
        delete serializers[k];
      }
    }
    serializers = { ...baseSerializers, ...serializers };

    // If there is an explicit origin in the path, it should override the second
    // argument. i.e. the second argument is just a fallback
    const url = new URL(path, self.location?.origin);
    if (x.query) {
      const q = x.query as Record<string, string | string[]>;
      for (const [k, v] of Object.entries(q)) {
        if (Array.isArray(v)) {
          for (const v2 of v) {
            url.searchParams.append(k, v2);
          }
        } else {
          url.searchParams.append(k, v);
        }
      }
    }

    if (x.socket) {
      if (url.protocol === "http:") {
        url.protocol = "ws:";
      } else {
        url.protocol = "wss:";
      }

      // Note that this is returned synchronously. It's anti-pattern to
      // sometimes return promises but not all the time. I'm doing this
      // consciously; I don't want to need async/await just to use web sockets,
      // whose API is already asynchronous b/c event listeners
      return webSocket(url.href, { serializers });
    }

    return (async () => {
      const req = packRequest(url.href, {
        headers: x.headers,
        message: x.message,
        serializers,
      });

      const res = await fetch(req);
      const body = await unpack(res, { serializers });
      if (!res.ok) {
        throw new HttpError((
          body instanceof HttpError ? body.message
          : typeof body === "string" ? body
          : res.statusText
        ), {
          status: res.status, // Note that HTTP status is always used
          detail: { body, res },
          expose: body instanceof HttpError ? body.expose : null,
        });
      }
      return [body, res];
    })();
  };

  const proxy = (path: string): unknown => {
    return new Proxy((x: AnyClientArg) => clientFn(path, x), {
      get(_, property) {
        const append = (property as string)
          .split("/").filter(p => !!p).join("/");
        return proxy(path && append ? path + "/" + append : path + append);
      },
    });
  };

  return proxy("") as Client<T>;
}