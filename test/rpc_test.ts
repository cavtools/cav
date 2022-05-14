// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { rpc } from "../rpc.ts";
import { assertEquals } from "./deps_test.ts";

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

Deno.test({
  name: "Behavior of a bare rpc({})",
  fn: async t => {
    const testRpc = rpc({});

    await t.step("Returns 204 with GET /", async () => {
      const res = await testRpc(new Request("http://localhost/"), conn);
      assertEquals(res.status, 204);
      assertEquals(res.body, null);
    });
    
    await t.step("Returns 404 when request path isn't /", async () => {
      const res = await testRpc(new Request("http://localhost/404"), conn);
      assertEquals(res.status, 404);
      assertEquals(await res.text(), "404 not found");
    });

    await t.step("Returns 405 when request method is POST", async () => {
      const res = await testRpc(
        new Request("http://localhost/", { method: "POST", body: "test" }),
        conn,
      );
      assertEquals(res.status, 405);
      assertEquals(await res.text(), "405 method not allowed");
    });
  },
});