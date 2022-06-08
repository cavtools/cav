// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http } from "../deps.ts";
import { endpoint } from "../endpoints.ts";
import {
  assert,
  assertEquals,
  assertStrictEquals,
  zod as z,
} from "./test_deps.ts";
import { router } from "../router.ts";
import { HttpError, unpack } from "../serial.ts";
import type { Serializers } from "../serial.ts";
import type { Endpoint } from "../endpoints.ts";

// Doesn't matter
const conn: http.ConnInfo = {
  localAddr: {
    hostname: "localhost",
    port: 8080,
    transport: "tcp",
  },
  remoteAddr: {
    hostname: "localhost",
    port: 8081,
    transport: "tcp",
  },
};

async function assertResponseEquals(res: Response, correct: {
  status?: number;
  headers?: [string, string][];
  body?: unknown;
  serializers?: Serializers;
}) {
  if ("status" in correct) {
    assertEquals(res.status, correct.status);
  }
  if ("headers" in correct) {
    assertEquals(Array.from(res.headers.entries()), correct.headers);
  }
  if ("body" in correct) {
    const unpacked = await unpack(res, { serializers: correct.serializers });
    assertEquals(unpacked, correct.body);
  }
}

Deno.test("endpoint: request matching", async t => {
  await t.step("fallback path", async () => {
    const end = endpoint();
    const req1 = new Request("http://_/test");
    const req2 = new Request("http://_");
    await assertResponseEquals(await end(req1, conn), {
      status: 404,
      body: "404 not found",
    });
    await assertResponseEquals(await end(req2, conn), {
      status: 204,
      body: undefined,
    });

    const end2 = endpoint(x => x.path);
    const req3 = new Request("http://_");
    await assertResponseEquals(await end2(req3, conn), { body: "/" });
  });

  await t.step("root path (=== fallback)", async () => {
    // Same thing as fallback
    const end = endpoint({ path: "/", resolve: x => x.path });
    const req1 = new Request("http://_/test");
    const req2 = new Request("http://_");
    await assertResponseEquals(await end(req1, conn), {
      status: 404,
      body: "404 not found",
    });
    await assertResponseEquals(await end(req2, conn), {
      status: 200,
      body: "/",
    });
  });

  await t.step("simple path", async () => {
    const end = endpoint({ path: "/hello/world" });
    const req1 = new Request("http://_/?yo=whatsup");
    const req2 = new Request("http://_/hello/world?hey=ho");
    const req3 = new Request("http://_/hello/world/goodbye");
    const req4 = new Request("http://_/hello/:world");
    await assertResponseEquals(await end(req1, conn), { status: 404 });
    await assertResponseEquals(await end(req2, conn), { status: 204 });
    await assertResponseEquals(await end(req3, conn), { status: 404 });
    await assertResponseEquals(await end(req4, conn), { status: 404 });
  });

  await t.step("complex path", async () => {
    const end = endpoint({
      path: "/:ids([0-9]+)+/hello",
      resolve: x => ({ path: x.path, groups: x.groups }),
    });
    const req1 = new Request("http://_/1/2/3/hello");
    await assertResponseEquals(await end(req1, conn), {
      status: 200,
      body: { path: "/1/2/3/hello", groups: { ids: "1/2/3" } },
    });
  });

  await t.step("wildcard path", async () => {
    const end = endpoint({
      path: "*",
      resolve: x => ({ path: x.path, groups: x.groups }),
    });
    const req = new Request("http://_/hello/world/1/2?3=4");
    await assertResponseEquals(await end(req, conn), {
      status: 200,
      body: { path: "/hello/world/1/2", groups: {} },
    });
  });

  await t.step("^ to use full url", async () => {
    const end = endpoint({
      path: "^/hello/world",
      resolve: x => ({ path: x.path, groups: x.groups }),
    });
    const rtr = router({
      hello: {
        world: end,
      },
    });
    const noMatch = new Request("http://_/hello/world/hello/world");
    const match = new Request("http://-/hello/world");
    await assertResponseEquals(await rtr(noMatch, conn), { status: 404 });
    await assertResponseEquals(await rtr(match, conn), {
      status: 200,
      body: { path: "/hello/world", groups: {} },
    });
  });

  await t.step("groups merge with previously captured groups", async () => {
    const end = endpoint({
      path: "/:a",
      resolve: x => x.groups,
    });
    const rtr = router({
      ":a": {
        ":b": end,
      }
    });
    const req = new Request("http://-/a/b/c");
    await assertResponseEquals(await rtr(req, conn), {
      status: 200,
      body: { a: ["a", "c"], b: "b" },
    });
  });

  await t.step("groups parsing", async () => {
    const end = endpoint({
      path: "/:a/:c?",
      groups: z.object({
        a: z.string().array().transform(v => v.map(v2 => parseInt(v2, 10))),
        b: z.string().transform(v => parseInt(v, 10)),
        c: z.number().optional(),
      }).passthrough(),
      resolve: x => x.groups,
    });
    const rtr = router({
      ":a": {
        ":b": end,
      }
    });

    const success = new Request("http://-/1/2/3");
    await assertResponseEquals(await rtr(success, conn), {
      body: { a: [1, 3], b: 2 },
    });

    // This fails because the captured groups is always a string, the "c" group
    // is equal to "4" as a string
    const fail = new Request("http://-/1/2/3/4");
    await assertResponseEquals(await rtr(fail, conn), { status: 404 });
  });
});

Deno.test("endpoint: cookies", async t => {
  await t.step("cookies are still set on a request that throws", async () => {
    const end = endpoint(x => {
      x.cookies.set("hello", "world");
      throw new Error();
    });
    const req = new Request("http://-");
    await assertResponseEquals(await end(req, conn), {
      status: 500,
      headers: [
        ["content-type", "text/plain;charset=UTF-8"],
        ["set-cookie", "hello=world"],
      ],
    });
  });

  await t.step("cookies work in ctx", () => {
    const end = endpoint({
      // ctx: x => {
      //   return true;
      // },
      // query: q => { return true; },
      // resolve: x => {
        
      // }
      resolve: x => {},
    })
  });
});

Deno.test("endpoint: context", async t => {
  // basic example
  // cleanups
  // resolveError
});

Deno.test("endpoint: query", async t => {
  // none
  // success
  // failure
  // resolveError
});

Deno.test("endpoint: message", async t => {
  // maxBodySize
  // custom serializers
  // HttpErrors
});

Deno.test("endpoint: response serialization", async t => {

});

Deno.test("endpoint: error handling", async t => {

});

Deno.test("endpoint: canonical redirects", async t => {

});

Deno.test("endpoint: schema is assigned to created endpoint", async t => {

});