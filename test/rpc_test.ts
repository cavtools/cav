// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  rpc,
  assets,
  redirect,
  rpcInit,
} from "../rpc.ts";
import { assertEquals, assertRejects } from "./deps_test.ts";
import { HttpError } from "../serial.ts";
import { NO_MATCH } from "../http.ts";

// These values don't matter
const connInfo = {
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
      const res = await testRpc(new Request(
        "http://localhost/",
      ), connInfo);

      assertEquals(res.status, 204);
      assertEquals(res.body, null);
    });
    
    // TODO: Maybe it shouldn't throw? Maybe it should just return a 404
    // response with a special symbol property "noMatch" present. In the stack,
    // if it has that symbol, keep looking for matches
    await t.step("Throws NO_MATCH when request path isn't /", async () => {
      await assertRejects(async () => {
        await testRpc(new Request("http://localhost/hello"), connInfo);
      }, (err: Error) => assertEquals(err, NO_MATCH));
    });

    await t.step("Returns a serialized 405 HttpError with POST", async () => {
      const res =  await testRpc(
        new Request("http://localhost/", { method: "POST", body: "test" }),
        connInfo,
      );
      
      assertEquals(res.status, 405);
      assertEquals(await res.json(), { // TODO: This should just be text
        $httpError: {
          status: 405,
          message: "405 method not allowed",
          expose: { "$undefined": null }, // TODO: This is lame
        },
      });
    });
  },
});