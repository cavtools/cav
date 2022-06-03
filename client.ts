// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { webSocket } from "./ws.ts";
import { HttpError, packRequest, unpack } from "./serial.ts";
import type { WS } from "./ws.ts";
import type { Serializers } from "./serial.ts";

// TODO: Support most/all of the regexes supported by NextJS's fs-based router  
// TODO: The ability to specify a Key parameter when constructing the client
// that pre-keys into the given handler if its a Router  
// TODO: Constrain Query to Record<string, string | string[]>

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
  // REVIEW: I wanted to use a Symbol() instead of "__cav" so that this property
  // wouldn't show up in intellisense. However, doing that creates a rogue
  // Symbol() call in the asset bundles any time this file is imported, even if
  // nothing from it is used. I didn't really like that, so I switch it to this.
  // Should I go back?
  __cav?: { // imaginary
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
export interface SocketEndpointRequest<
  Query = unknown,
  Send = unknown,
  Receive = unknown,
> extends Request {
  __cav?: { // imaginary
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
  __cav?: { // imaginary
    endpointRequest?: never;
    socketEndpointRequest?: never;
    routerRequest: Shape;
  };
}

/** Type constraint for the Client's type parameter. */
export type ClientType = (
  | Handler
  | { [x: number]: ClientType }
  | RouterShape
  | null
);

/**
 * Type constraint for the Shape parameter of a RouterRequest. The shape
 * describes the client property accesses that would result in a valid endpoint
 * call. The endpoints are specified by their handler definitions.
 */
export interface RouterShape {
  [x: string]: ClientType;
}

// REVIEW: I originally was going to try two methods to approach the e2e client
// types problem. One that expanded router paths like I do below, and another
// that flattened the router object into a 2D array of acceptable paths which
// would eliminate the need for a Proxy around the client function. I ended up
// going with the former because it seemed easier at the time and better aligns
// with how routers get defined. But now I'm not so sure about using this method
// since it's not very intuitive and requires the use of a Proxy to pull it off
// with typescript. I may experiment with alternatives to this approach if the
// current method gets hairy. In the meantime, please excuse all the
// conditionals and submit bug reports if you come across unhandled edge cases
// (there's a lot)

/**
 * Expands a route path from a RouterRequest into an object representing the
 * client property accesses required to trigger a request for that route.
 * Example: `ExpandPath<"hello/world", true>` becomes `{ hello: { world: true }
 * }`
 */
type ExpandPath<K, T> = (
  K extends `:${string}/${infer P2}` ? { [x: string]: ExpandPath<P2, T> }
  : K extends `*` | `:${string}` ? { [x: string]: T }
  : K extends `/${infer P}` | `${infer P}/` | `${infer P}/*` ? ExpandPath<P, T>
  : K extends `${infer P1}/${infer P2}` ? { [x in P1]: ExpandPath<P2, T> }
  : K extends string ? { [x in K]: T }
  : never
);

// Generates a type from the input with any strictly undefined/never properties
// removed. Preserves optional properties.
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

// https://fettblog.eu/typescript-union-to-intersection/
type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends ((k: infer I) => void) ? I : never;

// good luck understanding this type lol  
// i'm sorry
/**
 * A function that wraps `fetch()` with a tailored process for making requests
 * to a Cav server. Each property access on the function itself returns a new
 * Client that extends the URL of the original Client. The periods represent
 * path dividers and the accessed properties are path segments, like this:
 * `client("http://localhost/base").nested["pa.th"]()` will result in a request
 * to "http://localhost/base/nested/pa.th".
 *
 * The type parameter is the type of the handler this client points to, which
 * allows the client TypeScript to extract information about what property
 * accesses are allowed and what data the server expects to receive and respond
 * with.
 */
export type Client<T extends ClientType = null> = {
  (x: ClientArg): Promise<unknown>;
  [x: string]: Client;
} & (
  // Non-Cav handlers get the fallback treatment  
  // This only works if T comes after the extends
  ((
    req: Request & { __cav?: never },
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
  ) => Promise<R>
  // SocketEndpoint
  : T extends (
    req: SocketEndpointRequest<infer Q, infer S, infer R>,
  ) => Response | Promise<Response> ? (
    x: ClientArg<Q, never, true>
  ) => WS<R, S> // NOTE: Not wrapped in a Promise
  // RouterShape  
  // When a router's type is specified, the router's shape is passed back into
  // the client and gets handled here
  : T extends RouterShape ? UnionToIntersection<{
    [K in keyof T]: ExpandPath<K, Client<T[K]>>;
  }[keyof T]>
  // ClientType[]
  : T extends ClientType[] ? UnionToIntersection<Client<T[number]>>
  // Any other type results in an unknown request / response shape
  : Record<never, never>
);

// TODO: CORS
/**
 * Arguments for the client function when its internal path points to an
 * endpoint.
 */
export type ClientArg<
  Query = unknown,
  Message = unknown,
  Socket = unknown,
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
  // June 2, 2022: I wanted to do this progress feature, but the Fetch API
  // doesn't support request streams and the initial spec for that feature may
  // be dropped altogether if Chrome decides to bow out. They've already
  // declared that they won't try to tackle full-duplex streams or streams
  // supporting HTTP/1.1. Often with stuff like this, if chrome doesn't want to
  // do it there's a high probability it just won't get done. To follow along:
  // https://github.com/whatwg/fetch/issues/1438
  //
  // A feature like this has been on the docket for a long time, since at least
  // 2015 with https://github.com/whatwg/fetch/issues/65. We shouldn't expect
  // any immediate remedies :(
  /**
   * If provided, this function will be called whenever the request progress
   * changes. The argument is the progress as a fraction, i.e. 50% upload
   * progress === 0.5
   */
  // onProgress?: (progress: number) => void | Promise<void>;
}>;

/**
 * ClientArg but without any type information. These are the arguments when the
 * type for the client function isn't known.
 */
export interface GenericClientArg {
  path?: string;
  socket?: boolean;
  headers?: HeadersInit;
  query?: unknown;
  message?: unknown;
  serializers?: Serializers;
  // onProgress?: (progress: number) => void | Promise<void>; // :(
}

/**
 * Constructs a new Client tied to the base URL. The provided set of serializers
 * will be used everywhere that data is de/serialized when using this client,
 * including web sockets.
 *
 * If the type parameter provided is a Router, Endpoint, or SocketEndpoint, the
 * returned client's type will be tailored to match the inputs and outputs
 * expected by that handler.
 */
export function client<T extends ClientType = null>(
  baseUrl = "",
  baseSerializers?: Serializers,
): Client<T> {
  const clientFn = (path: string, x: GenericClientArg = {}) => {
    // REVIEW: Check that there's no conflicting serializer names (should I
    // allow overriding?)
    if (x.serializers && baseSerializers) {
      for (const [k, v] of Object.entries(x.serializers)) {
        if (v && k in baseSerializers) {
          throw new Error(
            `Conflict: The serializer key "${k}" is already used by one of the client's base serializers`,
          );
        }
      }
    }
    const serializers = { ...baseSerializers, ...x.serializers };

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

      // Client-side sockets don't parse incoming socket messages. Note that
      // this is returned synchronously. It's pretty anti-pattern to sometimes
      // return promises but not all the time. I'm doing this consciously; I
      // don't want to have to async/await just to use web sockets, whose API is
      // already asynchronous with event listeners
      return webSocket(url.href, { serializers });
    }

    return (async () => {
      const req = packRequest(url.href, {
        headers: x.headers,
        message: x.message,
        serializers: x.serializers,
      });

      const res = await fetch(req);
      const resBody = await unpack(res);
      if (!res.ok) {
        throw new HttpError((
          resBody instanceof HttpError ? resBody.message
          : typeof resBody === "string" ? resBody
          : res.statusText
        ), {
          status: (
            resBody instanceof HttpError ? resBody.status
            : res.status
          ),
          detail: { body: resBody },
          expose: resBody instanceof HttpError ? resBody.expose : null,
        });
      }

      return resBody;
    })();
  };

  const proxy = (path: string): unknown => {
    return new Proxy((x: GenericClientArg) => clientFn(path, x), {
      get(_, property) {
        const prop = property as string;
        const append = prop.split("/").filter((p) => !!p).join("/");
        return proxy(path.endsWith("/") ? path + append : path + "/" + append);
      },
    });
  };

  return proxy(baseUrl) as Client<T>;
}