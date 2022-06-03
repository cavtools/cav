// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

// TODO: The ability to monitor request progress (XMLHttpRequest)
// TODO: The ability to specify custom headers

import {
  deserialize,
  deserializeBody,
  HttpError,
  serialize,
  serializeBody,
} from "./serial.ts";
import type { Serializers } from "./serial.ts";
import type { Parser, ParserFunction, ParserOutput } from "./parser.ts";

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
 * to the client about what argument types are acceptable.
 */
export interface EndpointRequest<
  Query = never,
  Message = never,
  Upgrade = never,
> extends Request {
  __cav?: { // imaginary
    endpointRequest: {
      query: Query;
      message: Message;
      upgrade: Upgrade;
    };
    routerRequest?: never;
  };
}

/**
 * Response type used to ferry the type of the deserialized response to the
 * client from the server. If a server handler doesn't return this type, the
 * response type of the corresponding client call will be "unknown".
 */
export interface EndpointResponse<T = unknown> extends Response {
  __cav?: { // imaginary
    endpointResponse: T;
  };
}

/**
 * A server router handler can use this Request type to ferry type information
 * to the client about valid routes. The client uses the RouterShape to infer
 * which property accesses are valid and what their response type will be when
 * called.
 */
export interface RouterRequest<
  Shape extends RouterShape = Record<never, never>,
> extends Request {
  __cav?: { // imaginary
    endpointRequest?: never;
    routerRequest: Shape;
  };
}

/**
 * Type constraint for the Shape parameter of a RouterRequest. The shape
 * describes the client property accesses that would result in a valid endpoint
 * call.
 */
export interface RouterShape {
  [x: string]: (
    | Handler
    | Handler[]
    | RouterShape
    | null
  );
}

/**
 * Expands a route path from a RouterRequest into an object representing the
 * client property accesses required to trigger a request for that route. (Sorry
 * for the mouthful.) Example: `ExpandPath<"hello/world", true>` becomes `{
 * hello: { world: true } }`
 */
 type ExpandPath<K, T> = (
  K extends `*` | `:${string}` ? { [x: string]: T }
    : K extends `:${string}/${infer P2}` ? { [x: string]: ExpandPath<P2, T> }
    : K extends `/${infer P}` | `${infer P}/` | `${infer P}/*`
      ? ExpandPath<P, T>
    : K extends `${infer P1}/${infer P2}` ? { [x in P1]: ExpandPath<P2, T> }
    : K extends string ? { [x in K]: T }
    : never
);

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
          : T[K] extends never ? never
          : K
      )
    ]?: T[K];
  },
> = Required & Optional;

/**
 * https://fettblog.eu/typescript-union-to-intersection/
 */
type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends ((k: infer I) => void) ? { [K in keyof I]: I[K] } : never;

/**
 * A function that wraps `fetch()` with a tailored process for making requests
 * to a Cav server. Each property access on the function itself returns a new
 * Client that extends the URL of the original Client. The periods represent
 * path dividers and the accessed properties are path segments, like this:
 * `client("http://localhost/base").nested["pa.th"]()` will result in a request
 * to "http://localhost/base/nested/pa.th".
 *
 * The type parameter is the type of the handler this client points to, which
 * allows the client TypeScript to extract information about what data the
 * server expects to receive and respond with.
 */
export type Client<
  T extends Handler | Handler[] | RouterShape | null = null,
> = (
  // Handler[]
  T extends Handler[] ? Client<T[number]>
    : // Stack
    T extends (
      req: RouterRequest<infer S>,
      // deno-lint-ignore no-explicit-any
      ...a: any[]
    ) => Response | Promise<Response> ? Client<S>
    : // Rpc
    T extends (
      req: EndpointRequest<infer Q, infer M, infer U>,
      // deno-lint-ignore no-explicit-any
      ...a: any[]
    ) => EndpointResponse<infer R> | Promise<EndpointResponse<infer R>> ? (
      x: ClientArg<Q, M, U>,
    ) => Promise<R extends Socket<infer S, infer M2> ? Socket<M2, S> : R>
    : // Handler
    /// deno-lint-ignore no-explicit-any
    // : T extends (req: Request, ...a: any[]) => Response | Promise<Response> ? (
    //   (x: ClientArg<unknown, unknown, unknown>) => Promise<unknown>
    // )
    // When a router's type is specified, the router's shape is passed into the
    // client and gets handled here
    T extends RouterShape ? UnionToIntersection<
      {
        [K in keyof T]: ExpandPath<K, Client<T[K]>>;
      }[keyof T]
    >
    : // Any other type results in an unknown response
    // deno-lint-ignore no-explicit-any
    (x: ClientArg<any, any, any>) => Promise<unknown>
);

/**
 * Arguments for the client function when its internal path points to an
 * endpoint.
 */
export type ClientArg<
  Query = never,
  Message = never,
  Upgrade = never,
> = Clean<{
  /**
   * Additional path segments to use when making a request to this endpoint.
   * Including extra path segments should only be done if the endpoint expects
   * it. Default: `undefined`
   */
  path?: string;
  /**
   * The query string parameters expected by the endpoint. Default: `undefined`
   */
  query: Query;
  /**
   * If this isn't an upgraded endpoint, this is the posted message expected by
   * the Rpc. Default: `undefined`
   */
  message: true extends Upgrade ? never : Message;
  /**
   * Additional serializers to use while serializing data. Default: `undefined`
   */
  serializers?: Serializers;
  /**
   * If the endpoint requires upgrading for web sockets, this value should be
   * set to `true`. Default: `undefined`
   */
  upgrade: true extends Upgrade ? true : never;
}>;

interface CustomFetchArg {
  path?: string;
  query?: Record<string, string | string[]>;
  message?: unknown;
  serializers?: Serializers;
  upgrade?: boolean;
}

/**
 * Constructs a new Client tied to a given base URL. The provided set of
 * serializers will be used everywhere that data is de/serialized when using
 * this client, including any created web sockets.
 *
 * If the type parameter provided is a Router, Endpoint, or SocketEndpoint the
 * returned client function's type will be tailored to match the inputs and
 * outputs expected by that handler.
 *
 * The returned client function is wrapped in a Proxy that will translate
 * property accesses into path segments appended to the internal URL of the
 * request. Once the client function is called, the fetch uses that internal
 * URL.
 */
export function client<T extends Handler | RouterShape | null = null>(
  base = "",
  serializers?: Serializers,
): Client<T> {
  const customFetch = (path: string, x: CustomFetchArg = {}) => {
    // If there is an explicit origin in the path, it should override the second
    // argument. i.e. the second argument is just a fallback
    const url = new URL(path, self.location?.origin);
    if (x.query) {
      for (const [k, v] of Object.entries(x.query)) {
        if (Array.isArray(v)) {
          for (const v2 of v) {
            url.searchParams.append(k, v2);
          }
        } else {
          url.searchParams.append(k, v);
        }
      }
    }

    if (x.upgrade) {
      if (url.protocol === "http:") {
        url.protocol = "ws:";
      } else {
        url.protocol = "wss:";
      }

      const raw = new WebSocket(url.href, "json");
      return wrapWebSocket(raw, { serializers: x.serializers });
    }

    return (async () => {
      let body: BodyInit | null = null;
      let mime = "";
      if (x.message) {
        const pb = serializeBody(x.message, x.serializers);
        body = pb.body;
        mime = pb.mime;
      }

      const method = body === null ? "GET" : "POST";
      const res = await fetch(url.href, {
        method,
        headers: mime ? { "content-type": mime } : {},
        body,
      });

      let resBody: unknown = undefined;
      if (res.body) {
        resBody = await deserializeBody(res, x.serializers);
      }

      if (!res.ok) {
        const detail = { body: resBody };
        let message: string;
        let status: number;
        let expose: unknown;
        if (resBody instanceof HttpError) {
          message = resBody.message;
          status = resBody.status;
          expose = resBody.expose;
        } else if (typeof resBody === "string") {
          message = resBody;
          status = res.status;
          expose = undefined;
        } else {
          message = res.statusText;
          status = res.status;
          expose = undefined;
        }
        throw new HttpError(message, { status, expose, detail });
      }

      return resBody;
    })();
  };

  const proxy = (path: string, serializers?: Serializers): unknown => {
    return new Proxy((x: CustomFetchArg) =>
      customFetch(path, {
        ...x,
        serializers: { ...serializers, ...x.serializers },
      }), {
      get(_, property) {
        if (typeof property !== "string") {
          throw new TypeError("Symbol segments can't be used on the client");
        }

        const append = property.split("/").filter((p) => !!p).join("/");
        return proxy(
          path.endsWith("/") ? path + append : path + "/" + append,
          serializers,
        );
      },
    });
  };

  return proxy(base, serializers) as Client<T>;
}
