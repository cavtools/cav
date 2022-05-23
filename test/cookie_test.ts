// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { assertEquals } from "./deps_test.ts";
import { cookieJar } from "../cookie.ts";
import type { CookieJar } from "../cookie.ts";

// Useful: https://jwt.io  
// Remember that signed cookies are just `{"alg":"HS256"}` JWTs with the header
// removed

function runTest(
  desc: string,
  opt: {
    req: Request;
    keys?: string | string[];
    op: (cookie: CookieJar) => void,
    get: Record<string, string | undefined>;
    entries: [string, string][];
    has: Record<string, boolean>;
    isSigned: Record<string, boolean>;
    applyUpdates: [string, string][];
  },
): void {
  Deno.test(desc, async () => {
    const cookie = await cookieJar(opt.req, opt.keys);
    opt.op(cookie);

    for (const [k, v] of Object.entries(opt.get)) {
      assertEquals(cookie.get(k), v);
    }

    assertEquals(cookie.entries(), opt.entries);

    for (const [k, v] of Object.entries(opt.has)) {
      assertEquals(cookie.has(k), v);
    }

    const headers = new Headers();
    await cookie.applyUpdates(headers);
    assertEquals(Array.from(headers.entries()), opt.applyUpdates);
  });
}

runTest("Initial state of a bare request", {
  req: new Request("http://localhost/test"),
  op: () => {},
  get: { foo: undefined },
  entries: [],
  has: { bar: false },
  isSigned: { baz: false },
  applyUpdates: [],
});

runTest("Initial state of a request with 1 signed and 1 unsigned cookie", {
  req: new Request("http://localhost/test", {
    headers: {
      "cookie": "a=WyJhIiwiYWJjMTIzIl0.X6o_6Iy1LpDyTx1RYcZAAm6vZMn0ohZD3pP3_ox4fxI; b=hello"
    },
  }),
  keys: "abc123",
  op: () => {},
  get: { a: "abc123", b: "hello", foo: undefined },
  entries: [["a", "abc123"], ["b", "hello"]],
  has: { a: true, b: true, bar: false },
  isSigned: { a: true, b: false, baz: false },
  applyUpdates: [],
});

// Deno.test("Switching cookies between signed and unsigned", async () => {

// });

// Deno.test("Updating cookies on a different path/domain", async () => {

// });

// Deno.test("Getting a signed cookie with the wrong format", async () => {

// });

// Deno.test("Getting an expired signed cookie", async () => {

// });

// Deno.test("Getting a signed cookie with the wrong key", async () => {

// });

// Deno.test("Changing the name of a signed cookie invalidates it", async () => {

// });

// Deno.test("Signed cookies are JWTs with the header omitted", async () => {

// });

// Deno.test("Various options besides domain/path", async () => {
//   // No need to test them all since they're all just forwarded to std functions
// });

// Deno.test("Key rollover", async () => {

// });