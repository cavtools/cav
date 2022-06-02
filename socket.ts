// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { serialize, deserialize } from "./serial.ts";
import type { Parser, ParserFunction } from "./parser.ts";
import type { Serializers } from "./serial.ts";

/**
 * Isomorphic WebSocket interface with JSON serialization and typed messages.
 */
 export interface Socket<Send = unknown, Receive = unknown> {
  /**
   * The raw WebSocket instance.
   */
  raw: WebSocket;
  /**
   * Send data to the connected party. The data provided is serialized to JSON
   * before being sent.
   */
  send: (data: Send) => void;
  /**
   * Closes the web socket connection. An optional code and reason may be
   * provided, and will be available to all "close" event listeners.
   */
  close: (code?: number, reason?: string) => void;
  /**
   * Listener for the "open" event, triggered when the web socket connection is
   * established. The socket can't send data until the open event occurs.
   */
  onopen?: SocketOpenListener;
  /**
   * Listener for the "close" event, triggered when the web socket connection is
   * ended.
   */
  onclose?: SocketCloseListener;
  /**
   * Listener for the "message" event, triggered whenever a message is received
   * from the connected party. The message received is deserialized to the
   * event's "message" property.
   */
  onmessage?: SocketMessageListener;
  /**
   * Listener for the "error" event, triggered when the connection has been
   * closed due to an error or when received/sent data couldn't be
   * deserialized/parsed.
   */
  onerror?: SocketErrorListener;
  /**
   * Register an event listener for the "open" event, triggered when the web
   * socket connection is established. The socket can't send data until the open
   * event occurs.
   */
  on(type: "open", cb: SocketOpenListener): void;
  /**
   * Register an event listener for the "close" event, triggered when the
   * web socket connection is ended.
   */
  on(type: "close", cb: SocketCloseListener): void;
  /**
   * Register an event listener for the "message" event, triggered whenever a
   * message is received from the connected party. The message received is
   * deserialized to the event's "message" property.
   */
  on(type: "message", cb: SocketMessageListener<Receive>): void;
  /**
   * Register an event listener for the "error" event, triggered when the
   * connection has been closed due to an error or when an error is thrown
   * inside one of the event listeners.
   */
  on(type: "error", cb: SocketErrorListener): void;
  /**
   * Unregister an event listener for a particular event type. If no listener is
   * provided, all listeners for that event type will be unregistered. If the
   * event type is also omitted, all listeners for the web socket will be
   * unregistered.
   */
  off(
    type?: "open" | "close" | "message" | "error",
    // deno-lint-ignore no-explicit-any
    cb?: (...a: any[]) => any,
  ): void;
}

/** Listener for a Socket's "open" event. */
export type SocketOpenListener = (ev: Event) => void;

/** Listener for a Socket's "close" event. */
export type SocketCloseListener = (ev: CloseEvent) => void;

/**
 * Listener for a Socket's "message" event. The message is deserialized from the
 * event data.
 */
export type SocketMessageListener<Message = unknown> = (
  (message: Message, ev: MessageEvent) => void
);

/** Listener for a Socket's "error" event. */
export type SocketErrorListener = (
  err: Error,
  ev: Event | ErrorEvent | null,
) => void;

/**
 * Type that matches any socket. Useful for type constraints.
 */
// deno-lint-ignore no-explicit-any
export type AnySocket = Socket<any, any>;

/**
 * Initializer options to use when upgrading a request into a web socket using
 * the `upgradeWebSocket` function.
 */
export interface SocketInit<Receive = unknown> {
  /**
   * For parsing received messages before calling any registered message
   * listeners. If this is ommitted, messages will be passed through to
   * listeners without parsing, typed as `unknown`.
   */
  message?: Parser<unknown, Receive>;
  /**
   * Additional serializers to use when serializing and deserializing
   * sent/received messages.
   */
  serializers?: Serializers | null;
}

/**
 * Wraps a WebSocket instance with added serialization functionality and E2E
 * type support. If the input is a string, the wrapped WebSocket will be created
 * with the given URL.
 */
export function webSocket<
  Send = unknown,
  Receive = unknown,
>(
  input: WebSocket | string,
  init?: SocketInit<Receive>,
): Socket<Send, Receive> {
  type AnyListener = (...a: unknown[]) => unknown;

  const raw = typeof input === "string" ? new WebSocket(input) : input;

  const listeners = {
    open: new Set<AnyListener>(),
    close: new Set<AnyListener>(),
    message: new Set<AnyListener>(),
    error: new Set<AnyListener>(),
  };

  // REVIEW: Currently, the listeners are executed in an async try/catch in
  // order to catch errors that occur in the listeners themselves and log them
  // instead of letting them bubble. I remember there being a global error
  // handler in the works for cases like this, maybe this isn't necessary?
  const trigger = (type: keyof typeof listeners, ...args: unknown[]) => {
    if (socket[`on${type}`]) {
      (async () => {
        try {
          await (socket[`on${type}`] as AnyListener)(...args);
        } catch (err) {
          console.error(err);
        }
      })();
    }
    for (const v of listeners[type].values()) {
      (async () => {
        try {
          await (v as AnyListener)(...args);
        } catch (err) {
          console.error(err);
        }
      })();
    }
  };
  
  const socket: Socket<Send, Receive> = {
    raw,
    send: (data) => {
      try {
        raw.send(JSON.stringify(serialize(data, init?.serializers)));
      } catch (err) {
        trigger("error", err);
      }
    },
    close: (code, reason) => {
      raw.close(code, reason);
    },
    on: (type, cb) => {
      listeners[type].add(cb as (...a: unknown[]) => unknown);
    },
    off: (type, cb: (ev: Event | Error) => void) => {
      if (!type && !cb) {
        // Remove all listeners
        for (const k of Object.keys(listeners) as (keyof typeof listeners)[]) {
          listeners[k].clear();
        }
      } else if (type && !cb) {
        // Remove all listeners for a specific type
        listeners[type].clear();
      } else if (type && cb) {
        // Remove a specific listener from a specific type
        listeners[type].delete(cb as AnyListener);
      }
    },
  };

  raw.addEventListener("open", ev => trigger("open", ev));
  raw.addEventListener("close", ev => trigger("close", ev));

  const decoder = new TextDecoder();
  raw.addEventListener("message", async ev => {
    if (!socket.onmessage && !listeners.message.size) {
      return;
    }

    let message: Receive;
    try {
      if (
        typeof ev.data !== "string" &&
        !ArrayBuffer.isView(ev.data) &&
        !(ev.data instanceof Blob)
      ) {
        throw new Error(`Invalid data received: ${ev.data}`);
      }
  
      message = deserialize(
        JSON.parse(
          typeof ev.data === "string"
            ? ev.data
            : ArrayBuffer.isView(ev.data)
            ? decoder.decode(ev.data)
            : await ev.data.text(), // Blob
        ),
        init?.serializers,
      );
  
      if (init?.message) {
        const parse: ParserFunction = (
          typeof init.message === "function"
            ? init.message
            : init.message.parse
        );
        message = await parse(message) as Receive;
      }
    } catch (err) {
      trigger("error", err, null);
      return;
    }

    trigger("message", message, ev);
  });

  raw.addEventListener("error", (ev) => {
    const evt = ev as ErrorEvent;
    const err = new Error(evt.message || "unknown error");
    trigger("error", err, ev);
  });

  return socket;
}