// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { assertEquals } from "./deps.ts";
import { router } from "../router.ts";
import { endpoint } from "../endpoint.ts";
import type { http } from "../deps.ts";

const conn: http.ConnInfo = {
  localAddr: {
    hostname: "_",
    port: 8000,
    transport: "tcp",
  },
  remoteAddr: {
    hostname: "localhost",
    port: 8001,
    transport: "tcp",
  },
}

Deno.test("routing: static string routes path matching (#76)", async () => {
  const testRouter = router({
    "hello": "<h1>hello world</h1>",
  });

  const req1 = new Request("http://_/hello");
  const res1 = await testRouter(req1, conn);
  const text1 = await res1.text();
  if (res1.status !== 200 || text1 !== "<h1>hello world</h1>") {
    throw new Error(`response text didn't match: ${text1}`);
  }

  const req2 = new Request("http://_/hello/world");
  const res2 = await testRouter(req2, conn);
  if (res2.status !== 404) {
    throw new Error(`request matched when it shouldn't have`);
  }
});

Deno.test(
  "routing: path parameters have lower sort priority (fixes #81)",
  async () => {
    const testRouter1 = router({
      ":slug": "post page",
      "about": "about page",
    });

    const res1 = await testRouter1(new Request("http://_/about"), conn);
    assertEquals(await res1.text(), "about page");
    const res2 = await testRouter1(new Request("http://_/some-slug"), conn);
    assertEquals(await res2.text(), "post page");

    const testRouter2 = router({
      ":a/b": "a",
      "a/:b": "b",
      ":a/:b": "c",
      "a/b/c": "d",
    });

    const res3 = await testRouter2(new Request("http://_/a/b/c"), conn);
    assertEquals(await res3.text(), "d");
    const res4 = await testRouter2(new Request("http://_/a/b"), conn);
    assertEquals(await res4.text(), "b");
    const res5 = await testRouter2(new Request("http://_/c/b"), conn);
    assertEquals(await res5.text(), "a");
    const res6 = await testRouter2(new Request("http://_/c/d"), conn);
    assertEquals(await res6.text(), "c");
  },
);

Deno.test("routing: unnamed parameters", async () => {
  let testParam: Record<string, string> | null = null;
  const testRouter = router({
    "a/:/:c/:": endpoint(null, ({ param }) => {
      testParam = param; 
    }),
  });

  await testRouter(new Request("http://_/a/b/c/d"), conn);
  assertEquals(testParam, { "": "d", c: "c" });
});

Deno.test(
  "routing: percent encoded characters in path and/or route",
  async () => {
    throw new Error("TODO");
  },
)
