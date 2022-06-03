// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { assertEquals } from "./test_deps.ts";
import { packResponse, unpack } from "../serial.ts";
import { client } from "../client.ts";
import type {
  EndpointRequest,
  SocketEndpointRequest,
  RouterRequest,
  ClientArg,
  Client,
  GenericClientArg,
} from "../client.ts";
import type { WS } from "../ws.ts";

let nextResponse: unknown = undefined;
let lastRequest: unknown = undefined;
Object.assign(self, {
  fetch: (req: Request) => {
    lastRequest = req;
    return packResponse(nextResponse);
  },
});

async function assertRequestEquals(a: Request, b: {
  url: string;
  method: string;
  headers: [string, string][];
  body: unknown;
}) {
  assertEquals(a.url, b.url);
  assertEquals(a.method, b.method);
  assertEquals(Array.from(a.headers.entries()), b.headers);
  assertEquals(await unpack(a), b.body);
}

Deno.test("query only", async () => {

});

Deno.test("echo", async () => {

});

Deno.test("property accesses -> path segments", async () => {

});

Deno.test("base serializers + added serializers", () => {

});

// Compile-time tests

// No parameter (null)
client() as {
  (x: GenericClientArg): Promise<unknown>;
  [x: string]: Client;
};

type TestRouter = (req: RouterRequest<{
  a: (req: Request) => Response;
}>) => Response;
client<TestRouter>() as {
  a: {
    (x: GenericClientArg): Promise<unknown>;
    [x: string]: Client
  };
};

type TestEndpoint = (req: EndpointRequest<
  { a: "b" },
  { c: "d" },
  { e: "f" }
>) => Response;
client<TestEndpoint>() as (x: ClientArg<
  { a: "b" },
  { c: "d" },
  never
>) => Promise<{ e: "f" }>;

type TestSocketEndpoint = (req: SocketEndpointRequest<
  { a: "b" },
  { c: "d" },
  { e: "f" }
>) => Response;
client<TestSocketEndpoint>() as (x: ClientArg<
  { a: "b" },
  never,
  true
>) => WS<{ e: "f" }, { c: "d" }>;

type TestRouterShape = { g: (req: Request) => Response };
client<TestRouterShape>() as {
  g: Client;
};

type TestClientTypeArray = (
  | null
  | TestRouter
  | TestEndpoint
  | TestSocketEndpoint
  | TestRouterShape
)[];
client<TestClientTypeArray>() as (
  & Client<null>
  & Client<TestRouter>
  & Client<TestEndpoint>
  & Client<TestSocketEndpoint>
  & Client<TestRouterShape>
);

type TestIntegration = (req: RouterRequest<{
  a: {
    "b/c": {
      ":d/:e": TestEndpoint;
      f: TestSocketEndpoint;
    };
  };
  "a/b": TestClientTypeArray;
  g: TestRouterShape;
  h: TestRouter;
  i: null;
}>) => Response;
client<TestIntegration>() as {
  a: {
    b: {
      c: {
        [d: string]: {
          [e: string]: Client<TestEndpoint>;
        };
      } & {
        f: Client<TestSocketEndpoint>;
      };
    } & Client<TestClientTypeArray>;
  };
  g: Client<TestRouterShape>;
  h: Client<TestRouter>;
  i: Client;
} & {
  [x: string]: Client;
};
