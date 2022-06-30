// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { webSocket } from "./ws.ts";
import { HttpError, packRequest, unpack } from "./serial.ts";
import type { WS } from "./ws.ts";
import type { Serializers } from "./serial.ts";
import type { QueryRecord, ParamRecord } from "./router.ts";

// TODO: Several type constraints are more permissive than they should be, for
// example query parsers should constrain to Parser<Record<string, string |
// string[]>>. Further, the Any types (like AnyParser, AnyEndpointSchema, etc.)
// probably don't need to exist, but I'm not positive. I should get everything
// tested before I try to fix these things

/**
 * Generic handler type for server-defined Request handlers.
 */
export type Handler<R extends Request = Request> = (
  req: R,
  ...a: any[]
) => Promise<Response> | Response;

/**
 * The shape of an EndpointRequest, specifying the type information needed to
 * calculate the allowable ClientArgs.
 */
export type EndpointShape = {
  socket?: false;
  query?: QueryRecord;
  body?: unknown;
  result?: unknown;
} | {
  socket: true;
  query?: QueryRecord;
  body?: never;
  result?: WS<any, any>;
};

declare const _endpoint: unique symbol;

/**
 * A server endpoint handler can use this Request type to ferry type information
 * to the client about what argument types are acceptable and what the result
 * will be into.
 */
export interface EndpointRequest<S extends EndpointShape> extends Request {
  [_endpoint]?: S; // imaginary
}

/** The shape of a RouterRequest, mapping allowed routes to their handlers. */
export interface RouterShape {
  [x: string]: (
    | Handler
    | Handler[]
    | RouterShape
    | string
    | null
  );
}

declare const _router: unique symbol;

/**
 * A server router handler can use this Request type to ferry type information
 * to the client about what routes exist and what data they accept/return. The
 * client uses the RouterShape to infer which property accesses are valid and
 * what their response type will be.
 */
export interface RouterRequest<S extends RouterShape> extends Request {
  [_router]?: S;
}

type ExpandPath<K, T> = (
  // The "*" route can't be used with the client
  K extends `*` ? never
  : K extends `/${infer P}` | `${infer P}/` ? ExpandPath<P, T>
  : K extends `${infer P1}/${infer P2}` ? { [x in P1]: ExpandPath<P2, T> }
  : K extends string ? { [x in K]: T }
  : never
);

type Expand<T> = (
  T extends Record<string, unknown> ? {
    [K in keyof T]: ExpandPath<K, Expand<T[K]>>;
  }[keyof T]
  : T
);

type Paths<T> = (
  T extends Record<string, unknown> ? {
    [K in keyof T & string]: (
      T[K] extends Record<string, unknown> ? `${K}/${Paths<T[K]>}`
      : K
    )
  }[keyof T & string]
  : string
);

type KeyInto<T, K extends string> = (
  K extends `/${infer K0}` | `${infer K0}/` ? KeyInto<T, K0>
  : K extends `${infer K1}/${infer K2}` ? (
      K1 extends keyof T ? KeyInto<T[K1], K2>
      : never
  )
  : K extends keyof T ? T[K]
  : never
);

// Each of these intersected mapped types is required or stuff will break
// type Clean<T> = {
//   [K in keyof T as (
//     T[K] extends never ? never
//     : undefined extends T[K] ? never
//     : K
//   )]: T[K];
// } & {
//   [K in keyof T as T[K] extends never ? K : never]?: never;
// } & {
//   [K in keyof T as undefined extends T[K] ? K : never]?: T[K];
// };

export interface ClientArg {
  path?: string;
  param?: ParamRecord;
  socket?: boolean;
  query?: QueryRecord;
  body?: unknown;
}

export type Client<T extends Handler> = (
  // Routers
  T extends (req: RouterRequest<infer RS>, ...a: any[]) => any ? (
    <
      P extends Paths<Expand<RS>>,
      H = KeyInto<Expand<RS>, P>,
    >(x: (
      & ClientArg
      & { path: P }
      & (
        H extends (req: EndpointRequest<infer S>, ...a: any[]) => any ? (
          Omit<S, "result">
        )
        : never
      )
    )) => Promise<[unknown, Response]>
  )

  // Endpoints

  // Anything else
  : never
);

type Test = Client<(
  (req: RouterRequest<{
    "a/b": (req: EndpointRequest<{
      socket?: false;
      query?: { a: "b" };
      body: true;
      result: number;
    }>) => Response;
    a: {
      b: (req: EndpointRequest<{
        socket: true;
        query: { b: "c" };
        result: WS<true, false>;
      }>) => Response;
    }
  }>) => Response
)>;

const rpc = {} as Test;

rpc({
  path: "a/b",
  socket: true,
  query: { b: "c" },
  body: false,
})

// export interface RouterShape {
//   [x: string]: ClientType;
// }

// /** Type constraint for the Client's type parameter. */
// export type ClientType = (
//   | Handler
//   | Handler[]
//   | RouterShape
//   | string
//   | null
// );

/**
 * Expands a route path from a RouterRequest into an object representing the
 * Client property accesses required to trigger a request for that route.
 * Example: `ExpandPath<"hello/world", true>` becomes `{ hello: { world: true }
 * }`
 *
 * This is needed because routes are allowed to have slashes and/or path groups
 * in them.
 */
// type ExpandPath<K, T> = (
//   K extends `*` ? T
//   : K extends `:${string}/${infer P2}` ? { [x: string]: ExpandPath<P2, T> }
//   : K extends `:${string}` ? { [x: string]: T }
//   : K extends `/${infer P}` | `${infer P}/` ? ExpandPath<P, T>
//   : K extends `${infer P1}/${infer P2}` ? { [x in P1]: ExpandPath<P2, T> }
//   : K extends string ? { [x in K]: T }
//   : never
// );

/**
 * Generates a type from the input with any strictly undefined/never properties
 * removed. Preserves optional properties.
 */
// type Clean<
//   T,
//   Required = {
//     [
//       K in keyof T as (
//         T[K] extends never ? never
//           : undefined extends T[K] ? never
//           : K
//       )
//     ]: T[K];
//   },
//   Optional = {
//     [
//       K in keyof T as (
//         K extends keyof Required ? never
//           : T[K] extends never ? never // ParserInput can return never
//           : K
//       )
//     ]?: T[K];
//   },
// > = Required & Optional;

/**
 * Client function that wraps a `fetch()` process tailored for making requests
 * to a Cav handler, complete with serialization and socket support.
 */
// export type Client<T = null> = (
//   T extends string ? (
//     (x: ClientArg<Record<string, string | string[]> | undefined, never, false>) => Promise<[unknown, Response]>
//   )

//   : T extends Handler ? (
//     Parameters<T>[0] extends RouterRequest<infer S> ? Client<S>
//     : Parameters<T>[0] extends EndpointRequest<infer Q, infer M, infer R> ? (
//       (x: ClientArg<Q, M, false>) => Promise<[R, Response]>
//     )
//     : Parameters<T>[0] extends SocketRequest<infer Q, infer S, infer R> ? (
//       (x: ClientArg<Q, never, true>) => WS<R, S>
//     )
//     : UnknownClient
//   )

//   : T extends RouterShape ? UnionToIntersection<{
//     [K in keyof T]: ExpandPath<K, Client<T[K]>>;
//   }[keyof T]>

//   : T extends ClientType[] ? UnionToIntersection<Client<T[number]>>

//   : UnknownClient
// );

/** A version of the Client type without E2E type safety. */
// export interface UnknownClient {
//   <Socket extends boolean = false>(x: UnknownClientArg<Socket>): (
//     true extends Socket ? WS<unknown, unknown> : Promise<[unknown, Response]>
//   );
//   [x: string]: UnknownClient;
// }

// TODO: Any other fetch options that can be forwarded (example: CORS)
/**
 * Arguments for the client function when its internal path points to an
 * endpoint.
 */
// export type ClientArg<Query, Body, Socket> = {
//   /**
//    * Additional path segments to use when making a request to this endpoint.
//    * Including extra path segments should only be done if the endpoint expects
//    * it. Default: `undefined`
//    */
//   path?: string;
//   /**
//    * Additional headers to include when making this request.
//    */
//   headers?: HeadersInit;
//   /**
//    * Additional serializers to use while serializing data for this specific
//    * request. Default: `undefined`
//    */
//   serializers?: Serializers;
//   // onProgress?: (progress: number) => void | Promise<void>; // :(
// } & Clean<{
//   /**
//    * If the endpoint requires upgrading for web sockets (socket endpoint), this
//    * value should be set to `true`. Default: `undefined`
//    */
//   socket: Socket extends true ? true : never;
//   /**
//    * The query string parameters expected by the endpoint. Default: `undefined`
//    */
//   query: Query;
//   /**
//    * This is the type of body the endpoint expects to be POSTed. Ignored if
//    * the `socket` option is `true`. Default: `undefined`
//    */
//   body: true extends Socket ? never : Body;
// }>;

/**
 * ClientArg but without any type information. These are the arguments when the
 * type for the client function isn't known.
 */
// export interface UnknownClientArg<Socket extends boolean = boolean> {
//   path?: string;
//   socket?: Socket;
//   headers?: HeadersInit;
//   query?: unknown;
//   body?: Socket extends true ? never : unknown;
//   serializers?: Serializers;
//   // onProgress?: (progress: number) => void | Promise<void>; // :(
// }

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
// export function client<T extends ClientType = null>(
//   baseUrl = "",
//   baseSerializers?: Serializers,
// ): Client<T> {
//   const burl = new URL(baseUrl, self.location?.origin);
//   burl.pathname = burl.pathname.split("/").filter(p => !!p).join("/");

//   const clientFn = (path: string, x: UnknownClientArg = {}) => {
//     // Calculate the final request path
//     let xp = x.path || "";
//     xp = xp.split("/").filter(v => !!v).join("/");
//     path = burl.href + (path ? "/" + path : "") + (xp ? "/" + xp : "");

//     // Check that there's no conflicting serializer names
//     let serializers: Serializers = { ...(x.serializers || {}) };
//     for (const [k, v] of Object.entries(serializers)) {
//       if (v && baseSerializers && baseSerializers[k]) {
//         throw new Error(
//           `Conflict: The serializer key "${k}" is already used by one of the client's base serializers`,
//         );
//       } else if (!v) {
//         delete serializers[k];
//       }
//     }
//     serializers = { ...baseSerializers, ...serializers };

//     // If there is an explicit origin in the path, it should override the second
//     // argument. i.e. the second argument is just a fallback
//     const url = new URL(path, self.location?.origin);
//     if (x.query) {
//       const q = x.query as Record<string, string | string[]>;
//       for (const [k, v] of Object.entries(q)) {
//         if (Array.isArray(v)) {
//           for (const v2 of v) {
//             url.searchParams.append(k, v2);
//           }
//         } else {
//           url.searchParams.append(k, v);
//         }
//       }
//     }

//     if (x.socket) {
//       if (url.protocol === "http:") {
//         url.protocol = "ws:";
//       } else {
//         url.protocol = "wss:";
//       }

//       // Note that this is returned synchronously. It's anti-pattern to
//       // sometimes return promises but not all the time. I'm doing this
//       // consciously; I don't want to need async/await just to use web sockets,
//       // whose API is already asynchronous b/c event listeners
//       return webSocket(url.href, { serializers });
//     }

//     return (async () => {
//       const req = packRequest(url.href, {
//         headers: x.headers,
//         body: x.body,
//         serializers,
//       });

//       const res = await fetch(req);
//       const body = await unpack(res, { serializers });
//       if (!res.ok && !(body instanceof HttpError)) {
//         throw new HttpError((
//           typeof body === "string" ? body
//           : res.statusText
//         ), {
//           status: res.status,
//           detail: { body, res },
//         });
//       } else if (!res.ok && body instanceof HttpError) {
//         body.detail.res = res;
//         body.detail.body = body;
//         throw body;
//       }
//       return [body, res];
//     })();
//   };

//   const proxy = (path: string): unknown => {
//     return new Proxy((x: UnknownClientArg) => clientFn(path, x), {
//       get(_, property) {
//         const append = (property as string)
//           .split("/").filter(p => !!p).join("/");
//         return proxy(path && append ? path + "/" + append : path + append);
//       },
//     });
//   };

//   return proxy("") as Client<T>;
// }