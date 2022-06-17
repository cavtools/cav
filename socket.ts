// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { endpoint } from "./endpoint.ts";
import { normalizeParser } from "./parser.ts";
import { webSocket } from "./ws.ts";
import { HttpError } from "./serial.ts";
import type { http } from "./deps.ts";
import type { EndpointSchema, ResolveArg } from "./endpoint.ts";
import type { Parser, ParserInput, ParserOutput } from "./parser.ts";
import type { EndpointRequest } from "./client.ts";
import type { QueryRecord, ParamRecord } from "./context.ts";
import type { WS } from "./ws.ts";

/** Schema options for creating a `socket()` handler. */
export interface SocketSchema extends Omit<
  EndpointSchema,
  "maxBodySize" | "body"
> {
  /**
   * Incoming message parser. Without this, received messages will be typed as
   * `unknown`. When a message fails to parse, an error message will be sent
   * back to the client.
   */
  recv?: Parser | null;
  /**
   * The type of message this Socket expects to send to a connected client. The
   * value of this property doesn't matter, it's only used for the type.
   */
  send?: any;
}

/** Cav endpoint handler for connecting web sockets. */
export type Socket<Schema extends SocketSchema | null> = (
  Schema extends null ? {}
  : Schema
) & ((
  req: EndpointRequest<{
    socket: true;
    query: (
      Schema extends { query: Parser } ? ParserInput<Schema["query"]>
      : QueryRecord | undefined
    );
    body: (
      Schema extends { body: Parser } ? ParserInput<Schema["body"]>
      : undefined
    );
    // This is the result on the client side. What the socket receives on the
    // server should go first in the WS, that's what they'll be able to send
    result: WS<(
      Schema extends { recv: Parser } ? ParserInput<Schema["recv"]>
      : unknown
    ), (
      Schema extends SocketSchema ? (
        "send" extends keyof Schema ? Schema["send"]
        : unknown
      )
      : unknown
    )>;
  }>,
  conn: http.ConnInfo,
) => Promise<Response>);

/** Arguments available to the setup function of a socket endpoint. */
export interface SetupArg<
  Param extends ParamRecord = ParamRecord,
  Ctx extends SocketSchema["ctx"] = null,
  Query extends QueryRecord = QueryRecord,
  Recv = unknown,
  Send = unknown,
> extends Omit<
  ResolveArg<Param, Ctx, Query, any>,
  "body" | "asset" | "bundle" | "redirect" | "res"
> {
  ws: WS<Send, Recv extends null ? unknown : ParserOutput<Recv>>;
}

/**
 * Constructs a new Socket request handler using the provided schema and setup
 * function. The schema properties will be assigned to the returned socket
 * endpoint function, with the setup argument available as the "setup" property.
 */
export function socket<
  Schema extends SocketSchema | null,
  Param extends ParamRecord = ParamRecord,
  Ctx extends SocketSchema["ctx"] = null,
  Query extends QueryRecord = QueryRecord,
  Recv = unknown,
  Send = unknown,
>(
  schema?: SocketSchema & Schema & {
    param?: Parser<Param> | null;
    ctx?: Ctx;
    query?: Parser<Query> | null;
    recv?: Parser<Recv> | null;
    send?: Send;
  } | null,
  setup?: (
    | ((x: SetupArg<Param, Ctx, Query, Recv, Send>) => Promise<void> | void)
    | null
  ),
): Socket<Schema>;
export function socket(
  _schema?: SocketSchema | null,
  _setup?: (
    | ((x: SetupArg<any, any, any, any, any>) => Promise<void> | void)
    | null
  ),
) {
  const schema = _schema || {};
  const setup = _setup || (() => {});
  const recv = normalizeParser(schema.recv || ((m) => m));

  return endpoint(schema, async x => {
    let socket: WebSocket;
    let response: Response;
    try {
      ({ socket, response } = Deno.upgradeWebSocket(x.req, {
        protocol: "json",
      }));
    } catch {
      x.headers.set("upgrade", "websocket");
      throw new HttpError("426 upgrade required", { status: 426 });
    }

    const ws = webSocket(socket, { recv });

    if (setup) {
      await setup({ ...x, ws });
    }

    return response;
  });
}
