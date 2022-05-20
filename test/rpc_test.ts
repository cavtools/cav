// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { rpc } from "../rpc.ts";
// import { stack } from "../stack.ts";
import type { http } from "../deps.ts";
import { assertEquals } from "./deps_test.ts";

const conn: http.ConnInfo = {
  localAddr: {
    transport: "tcp",
    hostname: "localhost",
    port: 8080,
  },
  remoteAddr: {
    transport: "tcp",
    hostname: "localhost",
    port: 8081,
  }
}

Deno.test("Redirects for non-canonical paths", async t => {
  const shouldRedirect = [
    { from: "//", to: "/" },
    { from: "/hello//world", to: "/hello/world" },
    { from: "/hello/world//", to: "/hello/world" },
    { from: "/hello/world/", to: "/hello/world" },
    { from: "//hello", to: "/hello" },
  ];
  const shouldNotRedirect = [
    "/",
    "/hello",
    "/hello/world",
  ];
  const testRpc = rpc({ path: "*" });

  for (const test of shouldRedirect) {
    await t.step(`"${test.from}" redirects to ${test.to}`, async () => {
      const res = await testRpc(new Request(test.from), conn);
      assertEquals(res.status, 302);
      assertEquals(res.headers.get("location"), test.to);
    });
  }

  for (const test of shouldNotRedirect) {
    await t.step(`"${test}" should not redirect`, async () => {
      const res = await testRpc(new Request(test), conn);
      assertEquals(res.status, 200);
    });
  }
});