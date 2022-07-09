// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { webSocket } from "./ws.ts";
import { HttpError, packRequest, unpack } from "./serial.ts";
import type { WS } from "./ws.ts";
import type { QueryRecord, ParamRecord } from "./context.ts";
import type { Unpack } from "./serial.ts";

declare const _client: unique symbol;

/**
 * Generic handler type for server-defined Request handlers.
 */
export type Handler<R extends Request = Request> = (
  req: R,
  ...a: any[]
) => Promise<Response> | Response;

/**
 * The shape of an EndpointRequest, holding the type information needed to
 * calculate the allowable ClientArgs.
 */
export type EndpointShape = {
  socket?: false;
  query?: QueryRecord;
  body?: unknown;
  result: unknown;
} | {
  socket?: true;
  query?: QueryRecord;
  body?: never;
  result: WS<unknown, unknown>;
};

/**
 * A server endpoint handler can use this Request type to ferry type information
 * to the client about what argument types are acceptable and what the result
 * will be into.
 */
export interface EndpointRequest<Shape = never> extends Request {
  [_client]?: {
    endpoint: Shape;
  };
}

/** The shape of a RouterRequest, mapping allowed routes to their handlers. */
export type RouterShape = {
  /** Duplicate slashes aren't allowed. */
  [x: string]: (
    | Handler
    | Handler[]
    | string // static string routes
    | null
  );
};

/**
 * A server router handler can use this Request type to ferry type information
 * to the client about what routes exist and what data they accept/return. The
 * client uses the RouterShape to infer which property accesses are valid and
 * what their response type will be.
 */
export interface RouterRequest<Shape = never> extends Request {
  [_client]?: {
    router: Shape;
  };
}

// TODO: Include any others supported by `fetch()`, example: CORS
/** Arguments for the Client functions. */
export interface ClientArg {
  /**
   * Extra URL path to include before the request is made. This should only be
   * used if the endpoint expects it.
   */
  path?: string;
  /**
   * For opening web sockets. If true, a web socket will be returned instead of
   * a `[Result, Response]` pair. 
   */
  socket?: boolean;
  /** Query string parameters to append to the request URL. */
  query?: QueryRecord;
  /** Extra headers to include when making the request. */
  headers?: HeadersInit;
  /**
   * Body to send with the request. If this isn't undefined, the request method
   * will be POST.
   */
  body?: unknown;
}

/**
 * Client function for making requests to a remote Cav handler. If the handler
 * type is a Router or Endpoint, end-to-end type safety kicks in.
 */
export type Client<
  T = null,
  Req = T extends Handler<infer R> ? R : null,
> = (
  Req extends RouterRequest<infer RS> & EndpointRequest<infer ES> ? (
    Client<Handler<RouterRequest<RS>>> & Client<Handler<EndpointRequest<ES>>>
  )
  : Req extends RouterRequest<infer RS> ? (
    RS extends RouterShape ? RouterClient<RS>
    : UnknownClient
  )
  : Req extends EndpointRequest<infer ES> ? (
    ES extends EndpointShape ? EndpointClient<ES>
    : UnknownClient
  )
  : UnknownClient
);

/** Type of a Client when the handler isn't a Router or Endpoint. */
export type UnknownClient = (<Socket extends boolean = false>(x: (
  & ClientArg
  & { socket?: Socket }
)) => (
  Socket extends true ? WS<unknown, unknown>
  : Promise<[unknown, Response]>
)) & {
  [x: string]: UnknownClient;
};

type ExpandPath<K, T> = (
  K extends `${infer P1}/${infer P2}` ? (
    P1 extends `:${string}` ? { [x: string]: ExpandPath<P2, T> }
    : { [x in P1]: ExpandPath<P2, T> }
  )
  : K extends `:${string}` ? { [x: string]: T }
  : K extends string ? { [x in K]: T }
  : never
);

/** https://fettblog.eu/typescript-union-to-intersection/ */
type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends ((k: infer I) => void) ? I : never;

/** Type of a Client when the handler is a Router. */
export type RouterClient<
  Shape extends RouterShape,
  // The fallback route is the only route that's special. It can't be relied on
  // for e2e typesafety, the client ignores it
  _Shape = Omit<Shape, "*">,
> = (UnionToIntersection<{
  [K in keyof _Shape]: (
    _Shape[K] extends infer S ? (
      S extends Handler ? ExpandPath<K, Client<S>>
      : S extends string ? ExpandPath<K, Client>
      : S extends Handler[] ? ExpandPath<K, UnionToIntersection<
        Client<S[number]>
      >>
      : S // null | undefined, cleaned later
    )
    : never
  );
}[keyof _Shape]> extends infer U ? {
  [K in keyof U as U[K] extends null | undefined ? never : K]: U[K];
} : never);

// When a property on an object is allowed to be undefined, it's key shouldn't
// be required (I wish typescript did this by default, but javascript
// differentiates between the two so I get it)
type FixOptionals<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: T[K];
};

/** Type of a Client when the handler is an Endpoint. */
export type EndpointClient<
  S extends EndpointShape,
> = (x: ClientArg & FixOptionals<Omit<S, "result">>) => (
  S extends { socket: true } ? (
    S extends { result: infer R } ? R : never // Assumes Result is a WS
  )
  : Promise<[S extends { result: infer R } ? R : never, Response]>
);

// TODO: Other fetch options
/** Arguments for the Client function. */
export interface ClientArg {
  /**
   * Base URL. Replaces the base URL provided during client construction, if
   * any.
   */
  base?: string;
  /**
   * Request path joined with the base URL to form the final request URL. When
   * end-to-end type safety is activated, this should only be used if the final
   * endpoint expects it.
   */
  path?: string;
  /** Extra headers to include when making the request. */
  headers?: HeadersInit;
  /**
   * For opening web sockets. If `true`, a web socket will be synchronously
   * returned instead of a `[Result, Response]` pair.
   */
  socket?: boolean;
  /** Query string parameters to append to the request URL. */
  query?: QueryRecord;
  /**
   * Body to send with the request. If this is defined, the request method will
   * be POST.
   */
  body?: unknown;
}

/** Settings used to initialize a `client()`. */
export interface ClientInit {
  /**
   * Base URL, the location of the handler provided in the type parameter.
   * Default: `"/"`
   */
  base?: string;
  /** Extra headers to include on all client requests. */
  headers?: HeadersInit;
}

/**
 * Creates a new client function for making requests to remote Cav handlers. If
 * the type of the handler is provided and it's a Cav handler, the client will
 * have end-to-end typesafety turned on.
 */
export function client<T extends Handler = never>(init: ClientInit): Client<T> {
  // TODO
  return null! as any;
}