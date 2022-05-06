// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

// TODO: The ability to monitor request progress (XMLHttpRequest)
// TODO: The ability to specify custom headers

import {
  HttpError,
  serialize,
  serializeBody,
  deserialize,
  deserializeBody,
} from "./serial.ts";

import type { Serializers } from "./serial.ts";
import type {
  Parser,
  ParserFunction,
  ParserOutput,
} from "./parser.ts";

/**
 * Cav's WebSocket wrapper interface.
 */
export interface Socket<Send = unknown, Message = unknown> {
  /**
   * The raw WebSocket instance.
   */
  raw: WebSocket;
  /**
   * Send data to the connected party. The data provided is serialized using the
   * top-level `serialize()` function.
   */
  send: (data: Send) => void;
  /**
   * Closes the web socket connection. An optional code and reason may be
   * provided, and will be available to all "close" event listeners.
   */
  close: (code?: number, reason?: string) => void;
  /**
   * Register an event listener for the "open" event, which is fired when the web
   * socket connection is established. The socket must be opened before any data
   * can be sent.
   */
  on(type: "open", cb: SocketListener<"open">): void;
  /**
   * Register an event listener for the "close" event, which is fired when the
   * web socket connection is ended.
   */
  on(type: "close", cb: SocketListener<"close">): void;
  /**
   * Register an event listener for the "message" event, which is fired every
   * time a message is received from the connected party. The message received
   * is deserialized and made available on the "message" property assigned to
   * the event.
   */
  on(type: "message", cb: SocketListener<"message", Message>): void;
  /**
   * Register an event listener for the "error" event, which is fired when the
   * connection has been closed due to an error.
   */
  on(type: "error", cb: SocketListener<"error">): void;
  /**
   * Unregister an event listener for a particular event type. If no listener is
   * provided, all listeners for that event type will be unregistered. If the
   * event type is also omitted, all listeners for the web socket will be
   * unregistered.
   */
  off(
    type?: "open" | "close" | "message" | "error",
    cb?: (ev: Event) => void | Promise<void>,
  ): void;
}

/**
 * Type that matches any socket. Useful for type constraints.
 */
// deno-lint-ignore no-explicit-any
export type AnySocket = Socket<any, any>;

/**
 * Type for a web socket event listener. The shape of the listener depends on
 * the event type. For the "message" event, the message type may be provided as
 * the second type parameter.
 */
export type SocketListener<
  Type extends "open" | "close" | "message" | "error",
  Message = unknown,
> = (ev: (
  Type extends "open" ? Event
  : Type extends "close" ? CloseEvent
  : Type extends "message" ? MessageEvent & { message: Message }
  : Type extends "error" ? Event | ErrorEvent
  : never
)) => void | Promise<void>;

/**
 * Initializer options to use when upgrading a request into a web socket using
 * the `upgradeWebSocket` function.
 */
export interface SocketInit<Message extends Parser | null = null> {
  /**
   * Message parser, for parsing incoming messages. If this is ommitted,
   * messages won't be parsed and will be typed as "unknown".
   */
  message?: Message;
  /**
   * Additional serializers to use when serializing and deserializing message
   * data.
   */
  serializers?: Serializers | null;
}

/**
 * Wraps a regular WebSocket with serializer functionality and type support.
 */
export function wrapWebSocket<
  Send = unknown,
  Message extends Parser | null = null,
>(
  raw: WebSocket,
  init?: SocketInit<Message>,
): Socket<Send, Message extends Parser ? ParserOutput<Message> : unknown> {
  const listeners = {
    open: new Set<(ev: Event) => unknown>(),
    close: new Set<(ev: CloseEvent) => unknown>(),
    message: new Map<unknown, (ev: MessageEvent) => unknown>(),
    error: new Set<(ev: Event | ErrorEvent) => unknown>(),
  };

  return {
    raw,
    send: data => {
      raw.send(JSON.stringify(serialize(data, init?.serializers)));
    },
    close: (code, reason) => {
      raw.close(code, reason);
    },
    on: (type, cb) => {
      const decoder = new TextDecoder();

      // Only message gets a special process
      if (type !== "message") {
        listeners[type].add(cb as (ev: Event) => unknown);
        raw.addEventListener(type, cb as (ev: Event) => unknown);
        return;
      }

      const messageListener = async (ev: MessageEvent) => {
        const data = ev.data;
        if (
          typeof data !== "string" &&
          !ArrayBuffer.isView(data) &&
          !(data instanceof Blob)
        ) {
          throw new Error(`Invalid data received: ${data}`);
        }
  
        // deno-lint-ignore no-explicit-any
        let message: any = deserialize(JSON.parse(
          typeof data === "string" ? data
          : ArrayBuffer.isView(data) ? decoder.decode(data)
          : await data.text() // Blob
        ), init?.serializers);
  
        if (init?.message) {
          const parse: ParserFunction = (
            typeof init.message === "function" ? init.message
            : init.message.parse
          );
          message = await parse(message);
        }

        Object.assign(ev, { message });
        (cb as (ev: Event) => void)(ev);
      };

      listeners.message.set(cb, messageListener);
      raw.addEventListener(type, messageListener);
    },
    off: (type, cb) => {
      // If the callback isn't defined, turn off everything for the given type.
      // If the given type also isn't defined, turn off everything
      if (!cb) {
        const turnOff = (t: Exclude<typeof type, undefined>) => {
          for (const listener of listeners[t].values()) {
            raw.removeEventListener(t, listener as (ev: Event) => unknown);
          }
          listeners[t].clear();
        };
        if (!type) {
          for (const k of Object.keys(listeners)) {
            turnOff(k as keyof typeof listeners);
          }
          return;
        }
        turnOff(type);
        return;
      }

      if (!type) {
        throw new Error("If a callback is specified, the event type must also be specified");
      }

      // Otherwise, only turn off the listener if it was registered with this
      // interface. Don't forget to remove it from the listeners, and that
      // message listeners are stored in a map instead of a set
      const listener = (
        type === "message" ? listeners[type].get(cb) as (ev: Event) => unknown
        : listeners[type].has(cb) ? cb
        : undefined
      );
      if (listener) {
        listeners[type].delete(cb);
        raw.removeEventListener(type, listener);
      }
    },
  };
}

/**
 * Generic handler type for server-defined Request handlers.
 */
export type Handler = (
  req: Request,
  // deno-lint-ignore no-explicit-any
  ...a: any[]
) => Promise<Response> | Response;

/**
 * An endpoint handler can use this Request type to ferry type information to
 * the client from the server about what client arguments are acceptable.
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
    }
    routerRequest?: never;
  }
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
 * A router handler on the server can use this Request type to ferry type
 * information about valid routes to the client. The client uses the provided
 * RouterShape to infer which property accesses are valid.
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
  // Stack
  : T extends (
    req: RouterRequest<infer S>,
    // deno-lint-ignore no-explicit-any
    ...a: any[]
  ) => Response | Promise<Response> ? Client<S>
  // Rpc
  : T extends (
    req: EndpointRequest<infer Q, infer M, infer U>,
    // deno-lint-ignore no-explicit-any
    ...a: any[]
  ) => EndpointResponse<infer R> | Promise<EndpointResponse<infer R>> ? (
    x: ClientArg<Q, M, U>,
  ) => Promise<R extends Socket<infer S, infer M2> ? Socket<M2, S> : R>
  // Handler
  /// deno-lint-ignore no-explicit-any
  // : T extends (req: Request, ...a: any[]) => Response | Promise<Response> ? (
  //   (x: ClientArg<unknown, unknown, unknown>) => Promise<unknown>
  // )
  // When a router's type is specified, the router's shape is passed into the
  // client and gets handled here
  : T extends RouterShape ? UnionToIntersection<{
    [K in keyof T]: ExpandPath<K, Client<T[K]>>;
  }[keyof T]>
  // Any other type results in an unknown response
  // deno-lint-ignore no-explicit-any
  : (x: ClientArg<any, any, any>) => Promise<unknown>
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
 * Constructs a new Client tied to a given base URL. The provided set of packers
 * will be used everywhere that data is packed/unpacked when using this client,
 * including web sockets.
 *
 * If the type parameter provided is a Stack or an Rpc, the returned client
 * function's type will be tailored to match the inputs and outputs expected on
 * the Stack/Rpc. In the case of Stacks, the returned client function is wrapped
 * in a Proxy that will translate property accesses into path segments to append
 * to the internal URL of the request. Once the client function is called (as
 * opposed to keyed into), the fetch process uses that internal URL. The generic
 * types are imaginary; they're used only to keep the server setup and the
 * client-side api accesses in sync with each other. When they get out of sync,
 * there will be a typescript error in the IDE but the bundleScript() process
 * will ignore the error.
 *
 * For example:
 *
 * ```ts
 * // On the server... (server.ts)
 * import { cav as c, zod as z } from "./deps.ts";
 *
 * export type MyRpc = typeof myRpc;
 *
 * const myRpc = c.rpc({
 *   query: z.object({
 *     hi: z.string(),
 *   }),
 *   resolve: x => {
 *     return `Hello, ${x.query.hi}!`;
 *   },
 * });
 *
 * export type MyStack = typeof myStack;
 *
 * export const myStack = c.stack({
 *   // There's multiple ways to divide up stack routes. Here's two of those
 *   // ways:
 *   path: {
 *     "to/rpc": myRpc,
 *   },
 * });
 *
 * // On the client... (browser/app.tsx)
 * import type { MyStack, MyRpc } from "../server.ts"; // Discarded upon build
 *
 * // Each of these equates to the same request. The a/b/c variables below are
 * // all of type `Promise<string>`, which is automatically determined by the
 * // passed in type parameter. The final request will be: `GET
 * // /path/to/rpc?hi=world`. When the promises resolve, the strings will be
 * // "Hello, world!"
 * const a = client<MyStack>("/").path.to.rpc({ query: { hi: "world" } });
 * const b = client<MyStack>("/")["path/to/rpc"]({ query: { hi: "world" } });
 * const c = client<MyRpc>("/path/to/rpc")({ query: { hi: "world" } });
 * ```
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
    return new Proxy((x: CustomFetchArg) => customFetch(path, {
      ...x,
      serializers: { ...serializers, ...x.serializers },
    }), {
      get(_, property) {
        if (typeof property !== "string") {
          throw new TypeError("Symbol segments can't be used on the client");
        }
  
        const append = property.split("/").filter(p => !!p).join("/");
        return proxy(
          path.endsWith("/") ? path + append : path + "/" + append,
          serializers,
        );
      }
    });
  };

  return proxy(base, serializers) as Client<T>;
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
