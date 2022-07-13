// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { router } from "../mod.ts";
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

Deno.test("fix: static string routes path matching (#76)", async () => {
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