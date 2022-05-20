// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { rpc } from "../rpc.ts";
import { stack } from "../stack.ts";
import { assertEquals } from "./deps_test.ts";
import type { StackRoutes } from "../stack.ts";

// These values don't matter, it just needs to match http.ConnInfo
const conn = {
  localAddr: {
    transport: "tcp" as const,
    hostname: "localhost",
    port: 8080,
  },
  remoteAddr: {
    transport: "tcp" as const,
    hostname: "localhost",
    port: 8081,
  },
};

interface ResponseSchema {
  status?: number,
  body?: string | null,
  headers?: Record<string, string>;
}

async function checkResponse(check: Response, schema: ResponseSchema) {
  if (schema.status) {
    assertEquals(check.status, schema.status);
  }

  if (typeof schema.body !== "undefined") {
    assertEquals(check.body && await check.text(), schema.body);
  }
  
  if (!schema.headers) {
    return;
  }
  const unchecked: [string, string][] = [];
  for (const [k, v] of check.headers) {
    if (schema.headers[k]) {
      assertEquals(v, schema.headers[k]);
    } else {
      unchecked.push([k, v]);
    }
  }
  if (unchecked.length) {
    console.log("Unchecked headers:");
    for (const [k, v] of unchecked) {
      console.log(` -> ${k}: ${v}`);
    }
  }
}

Deno.test("Non-canonical redirects", async () => {
  const testRpc = rpc({ path: "*" });
  const badPaths = [
    { from: "//hello", to: "/hello" },
    { from: "/goodbye/", to: "/goodbye" },
    { from: "/hello//world//", to: "/hello/world" },
    { from: "/hello world/", to: "/hello%20world" },
  ];

  for (const p of badPaths) {
    const res = await testRpc(new Request(`http://localhost${p.from}`), conn);
    await checkResponse(res, {
      status: 302,
      body: null,
      headers: { "location": `http://localhost${p.to}` },
    });
  }
});

Deno.test("Path option", async t => {
  const cases = {
    default: {
      req: new Request("http://localhost/default"),
      handler: rpc({
        resolve: x => x.path,
      }),
      status: 200,
      body: "/",
    },
    basic: {
      req: new Request("http://localhost/basic/foo/bar"),
      handler: rpc({
        path: "/foo/bar",
        resolve: x => x.path,
      }),
      status: 200,
      body: "/foo/bar",
    },
    basicFull: {
      req: new Request("http://localhost/basicFull/foo/bar"),
      handler: rpc({
        path: "^/basicFull/foo/bar",
        resolve: x => x.path,
      }),
      status: 200,
      body: "/basicFull/foo/bar",
    },
    anyPath: {
      req: new Request("http://localhost/anyPath/hello/world"),
      handler: rpc({
        path: "*",
        resolve: x => x.path,
      }),
      status: 200,
      body: "/hello/world",
    },
    anyPathFull: {
      req: new Request("http://localhost/anyPathFull/hello/world"),
      handler: rpc({
        path: "^*",
        resolve: x => x.path,
      }),
      status: 200,
      body: "/anyPathFull/hello/world",
    },
    pathGroups: {
      req: new Request("http://localhost/pathGroups/1234/test"),
      handler: rpc({
        path: "/:numbers/test",
        resolve: x => x.groups["numbers"],
      }),
      status: 200,
      body: "1234",
    },
    pathGroupsConflict: {
      req: new Request("http://localhost/pathGroupsConflict/1234/5678"),
      handler: stack({
        ":numbers": rpc({
          path: "/:numbers",
          resolve: x => x.groups["numbers"],
        }),
      }),
      status: 200,
      body: "5678",
    },
  };

  const routes: StackRoutes = {};
  for (const [k, v] of Object.entries(cases)) {
    routes[k] = v.handler;
  }
  
  const testStack = stack(routes);
  for (const [k, v] of Object.entries(cases)) {
    await t.step(k, async () => {
      const res = await testStack(v.req, conn);
      await checkResponse(res, v);
    });
  }
});

Deno.test("Bare rpc({})", async t => {
  const testRpc = rpc({});

  await t.step("Returns 204 with GET /", async () => {
    const res = await testRpc(new Request("http://localhost/"), conn);
    await checkResponse(res, {
      status: 204,
      body: null,
      headers: {},
    });
  });
  
  await t.step("Returns 404 when request path isn't /", async () => {
    const res = await testRpc(new Request("http://localhost/404"), conn);
    await checkResponse(res, {
      status: 404,
      body: "404 not found",
      headers: {
        "content-type": "text/plain",
      },
    });
  });

  await t.step("Returns 405 when request method is POST", async () => {
    const res = await testRpc(
      new Request("http://localhost/", { method: "POST", body: "test" }),
      conn,
    );
    await checkResponse(res, {
      status: 405, 
      body: "405 method not allowed",
      headers: {
        "content-type": "text/plain",
      },
    });
  });
});