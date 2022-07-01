// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { webSocket } from "./ws.ts";
import { HttpError, packRequest, unpack } from "./serial.ts";
import type { WS } from "./ws.ts";
import type { QueryRecord, ParamRecord } from "./router.ts";
import type { Unpack } from "./serial.ts";

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
  result: WS<any, any>;
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
  T extends (req: RouterRequest<infer RS>, ...a: any[]) => any ? {
    [K in keyof RS]: ExpandPath<K, Expand<RS[K]>>;
  }[keyof RS]
  : T
);

type Paths<T> = (
  T extends (...a: any[]) => any ? string
  : T extends Record<string, unknown> ? {
    [K in keyof T & string]: (
      T[K] extends Record<string, unknown> ? `${K}/${Paths<T[K]>}`
      : K
    )
  }[keyof T & string]
  : string
);

type KeyInto<T, K extends string> = (
  K extends "/" | "" ? K extends keyof T ? T[K] : never
  : K extends `/${infer K0}` | `${infer K0}/` ? KeyInto<T, K0>
  : K extends `${infer K1}/${infer K2}` ? (
      K1 extends keyof T ? KeyInto<T[K1], K2>
      : never
  )
  : K extends keyof T ? T[K]
  : never
);

// When a property on an object is allowed to be undefined, it's key shouldn't
// be required (I wish typescript did this by default, but javascript
// differentiates between the two so I get it)
type FixOptionals<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: T[K];
}

// TODO: Include any others supported by `fetch()`, example: CORS
/** Arguments for the Client functions. */
export interface ClientArg {
  /**
   * Request path. Joined with the client's baseUrl to form the final request
   * URL.
   */
  path?: string;
  /**
   * Parameters to place into the path. Each `:pathParam` in the request path
   * will be replaced with its parameter string in this record.
   */
  param?: ParamRecord;
  /**
   * For opening web sockets. If true, a web socket will be returned instead of
   * a `[Result, Response]` pair. 
   */
  socket?: boolean;
  /** Query string parameters to append to the request URL. */
  query?: QueryRecord;
  /**
   * Body to send with the request. If this is defined, the request method will
   * be POST.
   */
  body?: unknown;
  /** Extra headers to include when making the request. */
  headers?: HeadersInit;
}

/** Client function for making RPC requests to a Cav server. */
export type Client<T extends Handler = never> = (
  // T is a Router
  T extends (req: RouterRequest<infer RS>, ...a: any[]) => any ? <
    P extends Paths<Expand<RS>>,
    E = KeyInto<Expand<RS>, P>,
  >(x: (
    & ClientArg
    & { path: P }
    & (
      E extends (req: EndpointRequest<infer ES>, ...a: any[]) => any ? (
        Omit<FixOptionals<ES>, "result">
      )
      : E extends string ? {
        socket?: false;
        query?: QueryRecord;
        body?: undefined;
      }
      : never
    )
  )) => (
    E extends (req: EndpointRequest<infer ES>, ...a: any[]) => any ? (
      ES extends { socket?: infer S; result: infer R } ? (
        S extends true ? R // Assuming R is a WS
        : Promise<[Unpack<R>, Response]>
      )
      : never
    )
    : E extends string ? (
      P extends `${string}.txt` ? Promise<[string, Response]>
      : P extends `${string}.json` ? Promise<[unknown, Response]>
      : Promise<[Blob, Response]>
    )
    : unknown
  )

  // T is an Endpoint
  : T extends (req: EndpointRequest<infer ES>, ...a: any[]) => any ? (x: (
    & ClientArg
    & Omit<FixOptionals<ES>, "result">
  )) => (
    ES extends { socket?: infer S; result: infer R } ? (
      S extends true ? R // Assuming R is a WS
      : Promise<[Unpack<R>, Response]>
    )
    : never
  )

  // T is something else. Generic fallback
  : <S extends boolean = false>(x: (
    & ClientArg
    & { socket?: S }
  )) => (
    S extends true ? WS<unknown, unknown>
    : Promise<[unknown, Response]>
  )
);

/**
 * Creates a new Client function tied to a base URL, for triggering RPCs on a
 * Cav server and deserializing the response. If the type parameter is a Cav
 * Router or Endpoint, end-to-end type safety kicks in.
 */
export function client<T extends Handler = never>(base = "/"): Client<T> {
  const baseUrl = new URL(base, self.location?.origin);
  baseUrl.pathname = baseUrl.pathname.split("/").filter(p => !!p).join("/");

  return ((x: ClientArg) => {
    const url = new URL(baseUrl.href);

    let path = x.path || "";
    if (path && x.param) {
      for (const [k, v] of Object.entries(x)) {
        path = path.replaceAll(new RegExp(`(\/?):${k}(\/?)`, "g"), "$1" + v + "$2");
      }
    }
    path = path.split("/").filter(p => !!p).join("/");
    url.pathname += url.pathname.endsWith("/") ? path : "/" + path;

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

    if (x.socket) {
      if (url.protocol === "http:") {
        url.protocol = "ws:";
      } else {
        url.protocol = "wss:";
      }
      return webSocket(url.href);
    }

    return (async () => {
      const req = packRequest(url.href, {
        headers: x.headers,
        body: x.body,
      });
      const res = await fetch(req);
      const body = await unpack(res);
      if (!res.ok && body instanceof HttpError) {
        body.detail.res = res;
        body.detail.body = body;
        throw body;
      } else if (!res.ok) {
        throw new HttpError((
          typeof body === "string" ? body
          : res.statusText
        ), {
          status: res.status,
          detail: { body, res },
        });
      }
      return [body, res];
    })();
  }) as Client<T>;
}