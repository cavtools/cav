// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { serialize, deserialize } from "./serial.ts";
import { normalizeParser } from "./parser.ts";
import type { Parser } from "./parser.ts";

// TODO: When a socket event is cancelled, stop calling listeners

/**
 * Isomorphic WebSocket interface with JSON serialization and typed messages.
 */
 export interface WS<Send = any, Recv = any> {
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
  onmessage?: WSMessageListener<Recv>;
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
   * deserialized before the listener is called.
   */
  on(type: "message", cb: WSMessageListener<Recv>): void;
  /**
   * Register an event listener for the "error" event, triggered when the
   * connection has been closed due to an error or when an error is thrown
   * inside one of the event listeners. This is also the event triggered when
   * the server sends back an HttpError due to invalid input.
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
export type WSMessageListener<Recv = any> = (
  (recv: Recv, ev: MessageEvent) => void
);

/** Listener for a web socket's "error" event. */
export type WSErrorListener = (ev: Event | ErrorEvent) => void;

/**
 * Type that matches any socket. Useful for type constraints.
 */
// deno-lint-ignore no-explicit-any
// export type AnySocket = WS<any, any>;

/** Initializer options for the `webSocket()` function. */
export interface WSInit<Recv = any> {
  /**
   * For parsing received messages before calling any registered message
   * listeners. If this is omitted, messages will be passed through to listeners
   * without parsing, typed as `any`. If this parser returns undefined, no
   * message event will be triggered.
   */
  recv?: Parser<any, Recv> | null;
}

/**
 * Wraps a WebSocket instance with added serialization functionality and E2E
 * type support. If the input is a string, the wrapped WebSocket will be created
 * with the given URL.
 */
export function webSocket<
  Send = any,
  Recv = any,
>(
  input: WebSocket | string,
  init?: WSInit<Recv>,
): WS<Send, Recv> {
  type AnyListener = (...a: any[]) => any;

  const raw = typeof input === "string" ? new WebSocket(input, "json") : input;

  const listeners = {
    open: new Set<AnyListener>(),
    close: new Set<AnyListener>(),
    message: new Set<AnyListener>(),
    error: new Set<AnyListener>(),
  };

  const trigger = (type: keyof typeof listeners, ...args: any[]) => {
    if (ws[`on${type}`]) {
      (ws[`on${type}`] as AnyListener)(...args);
    }
    for (const v of listeners[type].values()) {
      (v as AnyListener)(...args);
    }
  };
  
  const ws: WS<Send, Recv> = {
    raw,
    send: (data) => {
      try {
        raw.send(JSON.stringify(serialize(data)));
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    },
    close: (code, reason) => {
      raw.close(code, reason);
    },
    on: (type, cb) => {
      listeners[type].add(cb as (...a: any[]) => any);
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
  raw.addEventListener("error", ev => trigger("error", ev));

  const decoder = new TextDecoder();
  raw.addEventListener("message", async ev => {
    if (!ws.onmessage && !listeners.message.size) {
      return;
    }

    let recv: Recv;
    try {
      if (
        typeof ev.data !== "string" &&
        !ArrayBuffer.isView(ev.data) &&
        !(ev.data instanceof Blob)
      ) {
        throw new Error(`Invalid data received: ${ev.data}`);
      }

      recv = deserialize(JSON.parse(
        typeof ev.data === "string" ? ev.data
        : ArrayBuffer.isView(ev.data) ? decoder.decode(ev.data)
        : await ev.data.text() // Blob
      ));

      if (init?.recv) {
        const parseRecv = normalizeParser(init.recv);
        recv = await parseRecv(recv) as Recv;
      }
    } catch (err) {
      console.error("Socket message failed to parse:", err);
      return;
    }
    trigger("message", recv, ev);
  });

  return ws;
}