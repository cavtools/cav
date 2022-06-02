// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { serialize, deserialize } from "./serial.ts";
import type { Parser, ParserFunction } from "./parser.ts";
import type { Serializers } from "./serial.ts";

/**
 * Isomorphic WebSocket interface with JSON serialization and typed messages.
 */
 export interface WS<Send = unknown, Receive = unknown> {
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
  onopen?: WSOpenListener;
  /**
   * Listener for the "close" event, triggered when the web socket connection is
   * ended.
   */
  onclose?: WSCloseListener;
  /**
   * Listener for the "message" event, triggered whenever a message is received
   * from the connected party. The message received is deserialized to the
   * event's "message" property.
   */
  onmessage?: WSMessageListener;
  /**
   * Listener for the "error" event, triggered when the connection has been
   * closed due to an error or when received/sent data couldn't be
   * deserialized/parsed.
   */
  onerror?: WSErrorListener;
  /**
   * Register an event listener for the "open" event, triggered when the web
   * socket connection is established. The socket can't send data until the open
   * event occurs.
   */
  on(type: "open", cb: WSOpenListener): void;
  /**
   * Register an event listener for the "close" event, triggered when the
   * web socket connection is ended.
   */
  on(type: "close", cb: WSCloseListener): void;
  /**
   * Register an event listener for the "message" event, triggered whenever a
   * message is received from the connected party. The message received is
   * deserialized to the event's "message" property.
   */
  on(type: "message", cb: WSMessageListener<Receive>): void;
  /**
   * Register an event listener for the "error" event, triggered when the
   * connection has been closed due to an error or when an error is thrown
   * inside one of the event listeners.
   */
  on(type: "error", cb: WSErrorListener): void;
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
export type WSOpenListener = (ev: Event) => void;

/** Listener for a Socket's "close" event. */
export type WSCloseListener = (ev: CloseEvent) => void;

/**
 * Listener for a web socket's "message" event. The message is deserialized from
 * the event data.
 */
export type WSMessageListener<Message = unknown> = (
  (message: Message, ev: MessageEvent) => void
);

/** Listener for a web socket's "error" event. */
export type WSErrorListener = (
  err: Error | null,
  ev: Event | ErrorEvent,
) => void;

/**
 * Type that matches any socket. Useful for type constraints.
 */
// deno-lint-ignore no-explicit-any
export type AnySocket = WS<any, any>;

/** Initializer options for the `webSocket()` function. */
export interface WSInit<Receive = unknown> {
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
  init?: WSInit<Receive>,
): WS<Send, Receive> {
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
    if (ws[`on${type}`]) {
      (async () => {
        try {
          await (ws[`on${type}`] as AnyListener)(...args);
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
  
  const ws: WS<Send, Receive> = {
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
    if (!ws.onmessage && !listeners.message.size) {
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
    const err = evt.message ? new Error(evt.message) : null;
    trigger("error", err, ev);
  });

  return ws;
}