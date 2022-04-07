// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

// TODO: The ability to monitor request progress (XMLHttpRequest)

import {
  packBody,
  packJson,
  packer,
  unpackBody,
  usePackers,
  unpackJson,
} from "./pack.ts";

import type { Packers } from "./pack.ts";
import type { AnyRpc, Rpc } from "./rpc.ts";
import type { Stack } from "./stack.ts";
import type {
  Parser,
  ParserFunction,
  ParserInput,
  ParserOutput,
} from "./parser.ts";
import type { SocketResponse, TypedResponse } from "./http.ts";

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
 * Cav's WebSocket wrapper interface.
 */
export interface Socket<Send = unknown> {
  raw: WebSocket;
  send: (data: Send) => void;
  close: (code?: number, reason?: string) => void;
}

/**
 * Initializer options to use when upgrading a request into a web socket using
 * the `upgradeWebSocket` function.
 */
export interface SocketInit<
  Send = unknown,
  Message extends Parser | null = null,
> {
  message?: Message;
  packers?: Packers | null;
  onOpen?: SocketHandler<"open", Send>;
  onClose?: SocketHandler<"close", Send>;
  onMessage?: SocketHandler<"message", Send, Message>;
  onError?: SocketHandler<"error", Send>;
}

/**
 * Handler type for the various socket event listeners on the SocketInit.
 */
export type SocketHandler<
  Type extends "open" | "close" | "message" | "error",
  Send = unknown,
  Message extends Parser | null = null,
> = (x: SocketHandlerArg<Type, Send, Message>) => void | Promise<void>;

/**
* Arguments provided to a SocketHandler. There
* are four event types: "open", "close", "message", "error". Which properties
* are available depends on the event type.
*/
export interface SocketHandlerArg<
  Type extends "open" | "close" | "message" | "error",
  Send = unknown,
  Message extends Parser | null = null,
> {
  type: Type;
  socket: Socket<Send>;
  message: Type extends "message" ? (
    Message extends Parser ? ParserOutput<Message>
    // deno-lint-ignore no-explicit-any
    : any
  ) : undefined;
  error: Type extends "error" ? unknown : undefined;
  event: (
    Type extends "open" ? Event
    : Type extends "close" ? CloseEvent
    : Type extends "message" ? MessageEvent
    : Type extends "error" ? Event | ErrorEvent
    : never
  );
}

const decoder = new TextDecoder();

/** Wraps a regular WebSocket with packing functionality and type support. */
export function wrapWebSocket<
  Send = unknown,
  Message extends Parser | null = null,
>(
  raw: WebSocket,
  init?: SocketInit<Send, Message>,
): void {
  const socket: Socket<Send> = {
    raw,
    send: data => {
      raw.send(packJson(data, init?.packers));
    },
    close: (code, reason) => {
      raw.close(code, reason);
    },
  };

  raw.addEventListener("open", async ev => {
    if (!init?.onOpen) {
      return;
    }
    try {
      await init.onOpen({
        type: "open",
        socket,
        event: ev,
        message: undefined,
        error: undefined,
      });
    } catch (e) {
      raw.dispatchEvent(new ErrorEvent("error", { error: e }));
    }
  });
  raw.addEventListener("close", async ev => {
    if (!init?.onClose) {
      return;
    }
    try {
      await init.onClose({
        type: "close",
        socket,
        event: ev,
        message: undefined,
        error: undefined,
      });
    } catch (e) {
      raw.dispatchEvent(new ErrorEvent("error", { error: e }));
    }
  });
  raw.addEventListener("message", async ev => {
    try {
      const data = ev.data;
      if (
        typeof data !== "string" &&
        !ArrayBuffer.isView(data) &&
        !(data instanceof Blob)
      ) {
        throw new Error(`Invalid data received: ${data}`);
      }

      // deno-lint-ignore no-explicit-any
      let message: any = unpackJson((
        typeof data === "string" ? data
        : ArrayBuffer.isView(data) ? decoder.decode(data)
        : await data.text() // Blob
      ));

      if (init?.message) {
        const parse: ParserFunction = (
          typeof init.message === "function" ? init.message
          : init.message.parse
        );
        try {
          message = await parse(message);
        } catch (e) {
          throw new HttpError("Failed to parse message", {
            status: 400,
            detail: {
              messageParseFailed: true,
            },
            expose: e,
          });
        }
      }

      if (message instanceof Error) {
        throw message;
      }

      if (init?.onMessage) {
        await init.onMessage({
          type: "message",
          socket,
          event: ev,
          message,
          error: undefined,
        });
      }
    } catch (e) {
      raw.dispatchEvent(new ErrorEvent("error", { error: e }));
    }
  });
  raw.addEventListener("error", async ev => {
    if (!init?.onError) {
      console.error(`Unhandled socket error:`, (ev as ErrorEvent).error);
      return;
    }
    try {
      await init.onError({
        type: "error",
        socket,
        event: ev,
        message: undefined,
        error: (ev as ErrorEvent).error,
      });
    } catch (e) {
      // TODO: Something other than just logging?
      console.error(`Socket error handler threw an error:`, e);
    }
  });
}

/**
 * A Proxied function that wraps `fetch()` with a tailored process for making
 * requests to a Cav server. Each property access on the function itself returns
 * a new Client that extends the URL of the original Client. The periods
 * represent path dividers and the accessed properties are path segments, like
 * this: `client("http://localhost/base").nested["pa.th"]()` will result in a
 * request to "http://localhost/base/nested/pa.th".
 *
 * The type parameter is the type of the handler this client points to, which
 * allows the Client typescript to extract information about what data the Cav
 * server expects to receive and respond with. Special treatment is given to
 * Stacks and Rpcs. For now, any other type will result in all argument shapes
 * and response types to be `unknown`.
 */
export type Client<T = unknown> = (
  T extends Stack<infer R> ? Client<R>
  : T extends Rpc<
    infer R,
    // deno-lint-ignore no-explicit-any
    any,
    // deno-lint-ignore no-explicit-any
    any,
    infer Q,
    infer M,
    infer U
  > ? Endpoint<R, Q, M, U>
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
  Resp,
  Query,
  Message,
  Upgrade,
> {
  (x: EndpointArg<Resp, Query, Message, Upgrade>): Promise<
    Upgrade extends true ? void
    : Resp extends TypedResponse<infer T> ? T
    : Resp extends Response ? unknown
    : Resp
  >;
}

/**
 * Uses the RpcInit type imported from the server to determine what shape the
 * arguments should be in when making requests to a given Rpc.
 */
export type EndpointArg<
  Resp,
  Query,
  Message,
  Upgrade,
  Send = Message extends Parser ? ParserInput<Message> : unknown,
  Receive = Resp extends SocketResponse<infer R> ? R : unknown,
> = Clean<{
  /**
   * Additional path segments to use when making a request to this endpoint.
   * Including extra path segments should only be done if the Rpc expects it.
   * Default: `undefined`
   */
  path?: string;
  /** The query string parameters expected by the Rpc. Default: `undefined` */
  query: ParserInput<Query>;
  /**
   * If this is not an upgraded request, this is the posted message expected by
   * the Rpc. Default: `undefined`
   */
  message: Upgrade extends true ? never : ParserInput<Message>;
  /**
   * Additional packers that should be used while serializing data. Default:
   * `undefined`
   */
  packers?: Packers;
  /**
   * If the Rpc requires upgrading for web sockets, this value should be set to
   * `true`. Default: `undefined`
   */
  upgrade: Upgrade extends true ? true : never;
  /**
   * For upgraded requests only. Called when the socket is opened.
   */
  onOpen?: Upgrade extends true ? SocketHandler<"open", Send> : never;
  /**
   * For upgraded requests only. Called when the socket is closed.
   */
  onClose?: Upgrade extends true ? SocketHandler<"close", Send> : never;
  /**
   * For upgraded requests only. Called when the socket receives a message.
   */
  onMessage?: Upgrade extends true ? SocketHandler<"message", Send, Parser<unknown, Receive>> : never; // REVIEW: Hacky
  /**
   * For upgraded requests only. Called when an error occurs during socket
   * processing or when the socket receives a message that unpacks into an
   * Error.
   */
  onError?: Upgrade extends true ? SocketHandler<"error", Send> : never;
}>;

interface CustomFetchArg {
  path?: string;
  query?: Record<string, string | string[]>;
  message?: unknown;
  packers?: Packers;
  upgrade?: boolean;
  onOpen?: SocketHandler<"open">;
  onClose?: SocketHandler<"close">;
  onMessage?: SocketHandler<"message">;
  onError?: SocketHandler<"error">;
}

/**
 * Constructs a new Client tied to a given base URL. The provided set of packers
 * will be used everywhere that data is packed/unpacked when using this client,
 * including web sockets.
 */
export function client<T extends Stack | AnyRpc>(
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
  
    if (x.upgrade) {
      if (url.protocol === "http:") {
        url.protocol = "ws:";
      } else {
        url.protocol = "wss:";
      }
  
      const raw = new WebSocket(url.href, "json");
      return wrapWebSocket(raw, {
        packers: x.packers,
        onOpen: x.onOpen,
        onClose: x.onClose,
        onMessage: x.onMessage,
        onError: x.onError,
      });
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
 * https://fettblog.eu/typescript-union-to-intersection/
 */
type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends ((k: infer I) => void) ? { [K in keyof I]: I[K] } : never
