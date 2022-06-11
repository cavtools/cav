// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http } from "../deps.ts";
import { endpoint } from "../endpoints.ts";
import { assertEquals } from "./test_deps.ts";
import type { Endpoint, ResolveArg } from "../endpoints.ts";
import type { QueryRecord, GroupsRecord } from "../router.ts";

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

// https://2ality.com/2019/07/testing-static-types.html
type AssertEquals<Check, Correct> = (
  Check extends Correct ? (
    Correct extends Check ? true : never
  )
  : never
);

Deno.test("endpoint()", async t => {
  await t.step("args: none", async () => {
    const end = endpoint();
    const _check: AssertEquals<typeof end, Endpoint<{
      resolve: () => undefined;
    }>> = true;

    const res1 = await end(new Request("http://localhost"), conn);
    assertEquals(res1.status, 204);
    assertEquals(res1.body, null);

    const res2 = await end(new Request("http://localhost/test"), conn);
    assertEquals(res2.status, 404);
    assertEquals(await res2.text(), "404 not found");

    const res3 = await end(
      new Request("http://localhost/", { method: "POST" }),
      conn,
    );
    assertEquals(res3.status, 405);
    assertEquals(await res3.text(), "405 method not allowed");
  });

  await t.step("args: schema only", async () => {
    const end = endpoint({ message: (m: string) => m });
    const _check: AssertEquals<typeof end, Endpoint<{
      message: (m: string) => string;
      resolve: () => undefined;
    }>> = true;

    const res1 = await end(new Request("http://localhost"), conn);
    assertEquals(res1.status, 204);
    assertEquals(res1.body, null);

    const res2 = await end(
      new Request("http://localhost", { method: "POST" }),
      conn,
    );
    assertEquals(res2.status, 204);
    assertEquals(res2.body, null);

    const res3 = await end(
      new Request("http://localhost", {
        method: "POST",
        body: "hello world",
      }),
      conn,
    );
    assertEquals(res3.status, 204);
    assertEquals(res3.body, null);
  });

  await t.step("args: resolve only", async () => {
    const end = endpoint(() => "hello world");
    const _check: AssertEquals<typeof end, Endpoint<{
      resolve: () => string;
    }>> = true;

    const res1 = await end(new Request("http://localhost"), conn);
    assertEquals(res1.status, 200);
    assertEquals(await res1.text(), "hello world");

    const res2 = await end(
      new Request("http://localhost", { method: "POST" }),
      conn,
    );
    assertEquals(res2.status, 405);
    assertEquals(await res2.text(), "405 method not allowed");
  });

  await t.step("args: schema + resolve", async () => {
    const end = endpoint({
      message: (m: string) => m,
    }, async x => x.message); // god i hate this syntax
    const _check: AssertEquals<typeof end, Endpoint<{
      message: (m: string) => string,
      resolve: (x: ResolveArg<
        { message: (m: string) => string },
        GroupsRecord,
        undefined,
        QueryRecord,
        string
      >) => Promise<string>;
    }>> = true;

    const res1 = await end(new Request("http://localhost"), conn);
    assertEquals(res1.status, 204);
    assertEquals(res1.body, null);

    const res2 = await end(new Request("http://localhost/test"), conn);
    assertEquals(res2.status, 404);
    assertEquals(await res2.text(), "404 not found");

    const res3 = await end(
      new Request("http://localhost", {
        method: "POST",
        body: "foo bar",
      }),
      conn,
    );
    assertEquals(res3.status, 200);
    assertEquals(await res3.text(), "foo bar");
  });
});
