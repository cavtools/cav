// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import {
  packBody,
  packJson,
  packer,
  unpack,
  unpackBody,
  usePackers,
} from "./pack.ts";

import type { Packers } from "./pack.ts";
import type { Parser, ParserInput, Rpc, RpcInit } from "./rpc.ts";
import type { Stack } from "./stack.ts";
import type { SocketResponse } from "./http.ts";

/** Initializer arguments for constructing HttpErrors. */
export interface HttpErrorInit {
  /** An HTTP status code describing what kind of error this is. */
  status?: number;
  /** Optional data exposed to the client when this error is serialized. */
  expose?: unknown;
  /** Other details about the error. Omitted during serialization. */
  detail?: Record<string, unknown>;
}

/** An error class for describing exceptions during HTTP processing. */
export class HttpError extends Error {
  /** An HTTP status code describing what kind of error this is. */
  status: number;
  /** Optional data exposed to the client when this error is serialized. */
  expose?: unknown;
  /** Other details about the error. Omitted during serialization. */
  detail: Record<string, unknown>;

  constructor(message: string, init?: HttpErrorInit) {
    super(message);
    this.status = init?.status || 500;
    this.expose = init?.expose;
    this.detail = init?.detail || {};
  }
}

usePackers({
  httpError: packer({
    check: (v) => v instanceof HttpError,
    pack: (v: HttpError) => ({
      status: v.status,
      message: v.message,
      expose: v.expose,
    }),
    unpack: (raw, whenDone) => {
      const u = (raw as { status: number; message: string });
      const err = new HttpError(u.message, { status: u.status });
      whenDone((parsed) => {
        err.expose = parsed.expose;
      });
      return err;
    },
  }),
});

/**
 * Wrapper interface providing WebSocket functionality with support for typed
 * messages.
 */
export interface Socket<
  O extends unknown = unknown,
  I extends unknown = unknown,
> {
  /** The raw underlying WebSocket instance. */
  raw: WebSocket;
  /** Send data to the receiver matching the type it expects to receive. */
  send(data: O): void;
  /** Close the socket connection with an optional code / explanation. */
  close(code?: number, reason?: string): void;
  /** Register a socket event listener and return the passed-in listener. */
  on<
    T extends "open" | "message" | "close" | "error",
    L extends (
      T extends "open" ? (ev: Event) => void | Promise<void>
      : T extends "message" ? (
        message: I,
        ev: MessageEvent,
      ) => void | Promise<void>
      : T extends "close" ? (ev: CloseEvent) => void | Promise<void>
      : T extends "error" ? (
        err: unknown,
        ev: Event | ErrorEvent,
      ) => void | Promise<void>
      : never
    )
  >(
    type: T,
    listener: L,
  ): L;
  /** Turn off a listener for a given event type. */
  off(
    type: "open" | "message" | "close" | "error",
    listener: (...a: unknown[]) => void | Promise<void>,
  ): void;
}

const decoder = new TextDecoder();

type Listener = (...a: unknown[]) => void | Promise<void>;

/** Wraps a regular WebSocket with packing functionality and type support. */
export function wrapWebSocket<
  O extends unknown = unknown,
  I extends unknown = unknown,
>(
  raw: WebSocket,
  init?: {
    /** Optionally parse the message further after unpacking it. */
    parseMessage?: (message: unknown) => I | Promise<I>;
    /** Packers to use when packing and unpacking messages. */
    packers?: Packers;
  },
): Socket<O, I> {
  const listeners = {
    open: new Set<Listener>(),
    message: new Set<Listener>(),
    close: new Set<Listener>(),
    error: new Set<Listener>(),
  };

  raw.addEventListener("open", async ev => {
    for (const l of listeners.open.values()) {
      try {
        await l(ev);
      } catch (e) {
        raw.dispatchEvent(new ErrorEvent("error", { error: e }));
      }
    }
  });

  raw.addEventListener("message", async ev => {
    const data = ev.data;
    if (
      typeof data !== "string" &&
      !ArrayBuffer.isView(data) &&
      !(data instanceof Blob)
    ) {
      // This shouldn't happen unless "they" change what data can be sent over
      // sockets in the browser. As of 2-15-22, it should just be ArrayBuffer
      // views, strings, and blobs
      throw new Error(`Invalid data received: ${data}`);
    }

    let message: unknown;
    try {
      message = unpack((
        typeof data === "string" ? data
        : ArrayBuffer.isView(data) ? decoder.decode(data)
        : await data.text() // Blob
      ), init?.packers);
    } catch (e) {
      raw.dispatchEvent(new ErrorEvent("error", {
        error: new HttpError("400 bad request", {
          status: 400,
          expose: {
            reason: "Failed to deserialize web socket message",
            error: e,
          },
        }),
      }));
      return;
    }

    if (init?.parseMessage) {
      try {
        message = await init.parseMessage(ev.data);
      } catch (e) {
        // When the server-side socket receives a bad message that doesn't
        // parse, the parseMessage call above will take care of sending an error
        // response to the client. Then, it'll throw undefined to indicate the
        // error got handled but also the message should not continue on to any
        // message listeners. When that happens, simply return early
        if (typeof e === "undefined") {
          return;
        }

        // In all other cases, the error is dispatched to the socket error
        // listeners before returning
        raw.dispatchEvent(new ErrorEvent("error", { error: e }));
        return;
      }
    }

    for (const l of listeners.message.values()) {
      try {
        await l(message, ev);
      } catch (e) {
        raw.dispatchEvent(new ErrorEvent("error", { error: e }));
      }
    }
  });

  raw.addEventListener("close", async ev => {
    for (const l of listeners.close.values()) {
      try {
        await l(ev);
      } catch (e) {
        raw.dispatchEvent(new ErrorEvent("error", { error: e }));
      }
    }
  });

  raw.addEventListener("error", async ev => {
    for (const l of listeners.error.values()) {
      try {
        await l((ev as ErrorEvent).error, ev);
      } catch (e) {
        console.error(
          `ERROR: An error was thrown during a web socket error listener:`,
          e,
        );
      }
    }
  });

  return {
    raw,
    send(data) {
      raw.send(packJson(data, init?.packers));
    },
    close(code, reason) {
      raw.close(code, reason);
    },
    on(
      type: "open" | "message" | "close" | "error",
      listener: Listener,
    ) {
      listeners[type].add(listener);
      return listener;
    },
    off(
      type: "open" | "message" | "close" | "error",
      listener: Listener,
    ) {
      listeners[type].delete(listener);
    },
  } as Socket;
}

/**
 * A Proxied function that wraps `fetch()` with a tailored process for making
 * requests to a Cav server. Each property access on the function itself returns
 * a new Client that extends the URL of the original Client. The periods
 * represent slash dividers and the accessed properties are path segments, like
 * this: `client("http://localhost/base").nested["pa.th"]()` will result in a
 * request to "http://localhost/base/nested/pa.th". The type parameter is the
 * type of the handler this client points to, which allows the Client typescript
 * to extract information about what data the Cav server expects to receive and
 * respond with. Special treatment is given to Stacks and Rpcs, the fundamental
 * building blocks of a Cav application. For now, any other type will result in
 * all argument shapes and response types to be `unknown`.
 */
export type Client<T = unknown> = (
  T extends Stack<infer R> ? Client<R>
  : T extends Rpc<infer I, infer R> ? Endpoint<I, R>
  : T extends Record<never, never> ? UnionToIntersection<{
    [K in keyof T]: ExpandPath<K, Client<T[K]>>
  }[keyof T]>
  : unknown
);

/**
 * Client type representing an Rpc endpoint. Uses the Rpc type definition to
 * determine what the expected arguments and response types are.
 */
export interface Endpoint<
  I extends RpcInit,
  R extends unknown,
  E = EndpointArg<I>,
> {
  (x: { [K in keyof E]: E[K] }): Promise<
    R extends SocketResponse<infer M> ?
      I extends RpcInit ?
        I["message"] extends Parser ? Socket<ParserInput<I["message"]>, M>
        : Socket<unknown, M>
      : Socket<unknown, M>
    : R
  >;
}

/**
 * Uses the RpcInit type imported from the server to determine what shape the
 * arguments should be in when making requests to a given Rpc.
 */
export type EndpointArg<
  I extends RpcInit,
> = Clean<{
  /**
   * Additional path segments to use when making a request to this endpoint.
   * Including extra path should only be done if the Rpc expects it. Default:
   * `undefined`
   */
  path?: string;
  /**
   * If the Rpc is socket-type, this value should be set to `true`. The returned
   * value will be the wrapped web socket. Default: `undefined`
   */
  socket: I["socket"] extends true ? true : never;
  /** The query string parameters expected by the Rpc. Default: `undefined` */
  query: ParserInput<I["query"]>;
  /** The message expected by the Rpc. Default: `undefined` */
  message: ParserInput<I["message"]>;
  /**
   * Additional packers that should be used while serializing data. Default:
   * `undefined`
   */
  packers?: Packers;
}>;

interface CustomFetchArg {
  path?: string;
  socket?: boolean;
  query?: Record<string, string | string[]> | null;
  message?: Record<string, unknown>;
  packers?: Packers;
}

/**
 * Constructs a new Client tied to a given base URL. The provided set of packers
 * will be used everywhere that data is packed/unpacked when using this client,
 * including web sockets.
 */
export function client<T extends Stack | Rpc>(
  base = "",
  packers?: Packers,
): Client<T> {
  const proxy = (path: string, packers?: Packers): unknown => {
    return new Proxy((x: CustomFetchArg) => customFetch(path, {
      ...x,
      packers: { ...packers, ...x.packers },
    }), {
      get(_, property) {
        if (typeof property !== "string") {
          throw new TypeError("Symbol segments can't be used on the client");
        }
  
        const append = property.split("/").filter(p => !!p).join("/");
        return proxy(path.endsWith("/") ? path + append : path + "/" + append);
      }
    });
  };
  
  const customFetch = async (path: string, x: CustomFetchArg = {}) => {
    // If there is an explicit origin in the path, it should override the second
    // argument. i.e. the second argument is just a fallback
    const url = new URL(path, window.location.origin);
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
  
      const raw = new WebSocket(url.href, "json");
      return wrapWebSocket(raw, { packers: x.packers });
    }
  
    let body: BodyInit | null = null;
    let mime = "";
    if (x.message) {
      const pb = packBody(x.message, x.packers);
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
      resBody = await unpackBody(res, x.packers);
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
  };

  return proxy(base, packers) as Client<T>;
}

/**
 * Expands the route path from a Stack into an object representing the client
 * property accesses required to make a successful request for the given route.
 * Example: `ExpandPath<"hello/world", true>` becomes `{ hello: { world: true }
 * }`
 */
type ExpandPath<K, T> = (
  K extends `*` | `:${string}` ? { [x: string]: T }
  : K extends `:${string}/${infer P2}` ? { [x: string]: ExpandPath<P2, T> }
  : K extends `/${infer P}` | `${infer P}/` | `${infer P}/*` ? ExpandPath<P, T>
  : K extends `${infer P1}/${infer P2}` ? { [x in P1]: ExpandPath<P2, T> }
  : K extends string ? { [x in K]: T }
  : never
);

type Clean<
  T,
  Required = {
    [K in keyof T as (
      T[K] extends never ? never
      : undefined extends T[K] ? never
      : K
    )]: T[K];
  },
  Optional = {
    [K in keyof T as (
      K extends keyof Required ? never
      : T[K] extends never ? never
      : K
    )]?: T[K];
  },
> = Required & Optional;

/**
 * I really like this one and it's essential for the Client type to work. I'm
 * not sure why it works, but I'm content with my ignorance this time. I first
 * saw it from jcalz on stackoverflow: https://stackoverflow.com/a/50375286. It
 * will convert a type like `{ hello: true } | { world: true }` into `{ hello:
 * true; world: true }`.
 */
type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends ((k: infer I) => void) ? { [K in keyof I]: I[K] } : never