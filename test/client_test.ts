// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { assertStrictEquals, assertEquals } from "./deps.ts";
import { HttpError, packResponse, unpack, serializer } from "../serial.ts";
import { client } from "../client.ts";
import type {
  EndpointRequest,
  SocketRequest,
  RouterRequest,
  ClientArg,
  Client,
  UnknownClient,
  UnknownClientArg,
} from "../client.ts";
import type { WS } from "../ws.ts";
import type { PackResponseInit, Serializers } from "../serial.ts";

// This import starts the web socket server that's defined in ws_test.ts. Using
// it to test the client socket functionality
import "./ws_test.ts";

const nextRes: {
  body?: unknown;
  init?: PackResponseInit;
} = {};
let lastReq: Request = new Request("http://null.void");

Object.assign(self, {
  fetch: (req: Request) => {
    lastReq = req;
    return packResponse(nextRes.body, nextRes.init);
  },
});

async function assertRequestEquals(a: Request, b: {
  url: string;
  method: string;
  headers: [string, string][];
  body: unknown;
  serializers?: Serializers;
}) {
  assertEquals(a.url, b.url);
  assertEquals(a.method, b.method);
  assertEquals(Array.from(a.headers.entries()), b.headers);
  assertEquals(await unpack(a, { serializers: b.serializers }), b.body);
}

function assertResponseEquals(a: Response, b: {
  status: number;
  headers: [string, string][];
}) {
  assertEquals(a.status, b.status);
  assertEquals(Array.from(a.headers.entries()), b.headers);
}

Deno.test("GET request", async () => {
  nextRes.body = new Map([[undefined, new Date(0)]]);
  nextRes.init = {
    status: 200,
    headers: { "x-custom-output-header": "hey" },
  };
  const [body, res] = await client("http://localhost/base").ball({
    path: "/extra/vagant?extra=ordinary",
    socket: false,
    headers: { "x-custom-input-header": "ho" },
    query: {
      hello: "world",
      foo: ["bar", "baz"],
    },
    message: undefined,
    serializers: undefined,
  }) as [unknown, Response];

  await assertRequestEquals(lastReq, {
    url: "http://localhost/base/ball/extra/vagant?extra=ordinary&hello=world&foo=bar&foo=baz",
    method: "GET",
    headers: [
      ["x-custom-input-header", "ho"],
    ],
    body: undefined,
  });
  assertEquals(body, nextRes.body);
  assertResponseEquals(res, {
    status: 200,
    headers: [
      ["content-type", "application/json"],
      ["x-custom-output-header", "hey"],
    ],
  });
});

class Custom1 {}
class Custom2 {}
const custom1 = serializer({
  check: (v: unknown) => {
    return v instanceof Custom1;
  },
  serialize: () => null,
  deserialize: () => new Custom1(),
});
const custom2 = serializer({
  check: (v: unknown) => {
    return v instanceof Custom2;
  },
  serialize: () => null,
  deserialize: () => new Custom2(),
});

Deno.test("POST request", async () => {
  nextRes.body = { b: new Custom1(), a: new Custom2() };
  nextRes.init = { serializers: { custom1, custom2 } };
  const message = { a: new Custom1(), b: new Custom2() };

  const [body, res] = await client(
    "http://localhost///",
    { custom1 },
  )["/test //me"]({
    query: { q: "yes" },
    message,
    serializers: { custom2 },
  }) as [unknown, Response];

  await assertRequestEquals(lastReq, {
    url: "http://localhost/test%20/me?q=yes",
    method: "POST",
    headers: [
      ["content-type", "application/json"],
    ],
    body: message,
    serializers: { custom1, custom2 },
  });
  assertEquals(body, nextRes.body);
  assertResponseEquals(res, {
    status: 200,
    headers: [
      ["content-type", "application/json"],
    ],
  });
});

Deno.test("socket request", async () => {
  const ws = client(
    "http://localhost:8080/does/not/matter",
    { custom1 },
    // The "send-back-url" part causes the web socket server to send the url
    // back as a message when the socket is opened
  )["/this either/%20?send-back-url=true"]({
    socket: true,
    query: { q: "hello" },
    serializers: { custom2 },
  }) as WS;

  const message = { a: new Custom1(), b: new Custom2() }
  let url = "";
  let receive: unknown = undefined;
  await new Promise((resolve, reject) => {
    ws.onopen = () => {
      ws.send(message);
      ws.send("close"); // not sent back to us
    };
    ws.onmessage = (message) => {
      // If a string comes back, it's the url requested
      if (typeof message === "string") {
        url = message;
      } else {
        receive = message;
      }
    };
    ws.onclose = () => resolve(null);
    ws.onerror = (err) => reject(err);
  });

  assertEquals(url, "http://localhost:8080/does/not/matter/this%20either/%20?send-back-url=true&q=hello");
  assertEquals(receive, message);
});

Deno.test("rejects whenever there's a non-2xx status code", async () => {
  nextRes.body = new HttpError("500 internal server error", {
    status: 500,
    detail: { hidden: true },
    expose: { visible: true },
  });
  nextRes.init = {
    status: 400, // Note how the status differs
    headers: { "x-custom-header": "swag" },
  };
  try {
    await client("http://localhost")({});
    throw new Error("the request didn't throw");
  } catch (err) {
    if (!(err instanceof HttpError)) {
      throw err;
    }

    assertEquals(err.message, "500 internal server error");
    assertEquals(err.status, 500);

    const { body, res } = err.detail;
    assertStrictEquals(body, err);
    assertEquals((res as Response).status, 400);
    assertEquals((res as Response).headers.get("x-custom-header"), "swag");
  }

  nextRes.body = "hello";
  nextRes.init = { status: 401 }
  try {
    await client("http://localhost")({});
    throw new Error("the request didn't throw");
  } catch (err) {
    if (!(err instanceof HttpError)) {
      throw err;
    }

    assertEquals(err.message, "hello");
    assertEquals(err.status, 401);
    
    const { body, res } = err.detail;
    assertEquals(body, "hello");
    assertEquals((res as Response).status, 401);
  }
});

Deno.test("null value for a base serializer key at call site", async () => {
  nextRes.body = { a: new Custom1(), b: new Custom2() };
  nextRes.init = { serializers: { custom1, custom2 }}
  const [body] = await client("http://localhost", { custom1 })({
    // Doesn't turn off custom1, that's now how they work. Allowing it to be
    // null means you can spread a different set of serializers in here while
    // being able to omit specific keys from that spread. Both custom1 and
    // custom2 should be enabled
    serializers: { custom2, custom1: null } as Serializers,
  });
  assertEquals(body, nextRes.body);
});

// Compile-time tests

// REVIEW: I'm sure there's a better ways to write these, I'm just too in the
// zone to search for them rn. When I wrote them by casting them to the correct
// type, they didn't catch everything, so do this without writing "as".

// No parameter (null) === UnknownClient
const _null: (Client<null> extends {
  (x: UnknownClientArg<boolean>): unknown;
  [x: string]: Client & UnknownClient; // Client<null> === UnknownClient
} ? true : never) = true;

// Router
type TestRouter = (req: RouterRequest<{
  a: (req: Request) => Response;
}>) => Response;
type TestRouterClient = Client<TestRouter>;
const _tr: (TestRouterClient extends {
  a: UnknownClient;
} ? true : never) = true;

// Endpoint
type TestEndpoint = (req: EndpointRequest<
  { a: "b" },
  { c: "d" },
  { e: "f" }
>) => Response;
const _te: (Client<TestEndpoint> extends (x: ClientArg<
  { a: "b" },
  { c: "d" },
  never
>) => Promise<[{ e: "f" }, Response]> ? true : never) = true;

// SocketEndpoint
type TestSocketEndpoint = (req: SocketRequest<
  { a: "b" },
  { c: "d" },
  { e: "f" }
>) => Response;
const _tse: (Client<TestSocketEndpoint> extends (x: ClientArg<
  { a: "b" },
  never,
  true
>) => WS<{ e: "f" }, { c: "d" }> ? true : never) = true;

// RouterShape
type TestRouterShape = { g: (req: Request) => Response };
const _trs: (Client<TestRouterShape> extends {
  g: UnknownClient;
} ? true : never) = true;

// Handler[]
type TestHandlerArray = (
  | TestRouter
  | TestEndpoint
  | TestSocketEndpoint
  | (() => Response)
)[];
const _tha: (Client<TestHandlerArray> extends (
  & Client<TestRouter>
  & Client<TestEndpoint>
  & Client<TestSocketEndpoint>
  & Client<() => Response>
) ? true : never) = true;

// Everything
type TestIntegration = (req: RouterRequest<{
  a: {
    "b/c": {
      ":d/:e": TestEndpoint;
      f: TestSocketEndpoint;
    };
  };
  "a/b": TestHandlerArray; // tests route collisions
  g: TestRouterShape;
  h: TestRouter;
  i: null;
}>) => Response;
const _ti: (Client<TestIntegration> extends {
  a: {
    b: Client<TestHandlerArray> & {
      c: {
        [d: string]: {
          [e: string]: Client<TestEndpoint>;
        };
      } & {
        f: Client<TestSocketEndpoint>;
      };
    };
  };
  g: Client<TestRouterShape>;
  h: Client<TestRouter>;
  i: Client;
} ? true : never) = true;
