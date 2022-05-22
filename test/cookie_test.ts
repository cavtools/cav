// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { assertEquals } from "./deps_test.ts";
import { cookieJar } from "../cookie.ts";

Deno.test("Basic functionality", async t => {
  // This was made with https://jwt.io  
  // Signed cookie JWT value / key: ["signed", "abc123"] / "abc123"
  const req = new Request("http://localhost/test", {
    headers: {
      "cookie": "unsigned=hello; signed=WyJzaWduZWQiLCJhYmMxMjMiXQ.J-qThUqE0APQBF3fldtGKMSkIsha_L3qe_mLe4U3q1U"
    },
  });
  const cookie = await cookieJar(req, "abc123");

  const check = async (
    desc: string,
    state: {
      get: Record<string, string | undefined>;
      entries: [string, string][];
      has: Record<string, boolean>;
      isSigned: Record<string, boolean>;
      applyUpdates: [string, string][];
    },
  ) => {
    await t.step(desc, async () => {
      for (const [k, v] of Object.entries(state.get)) {
        assertEquals(cookie.get(k), v);
      }

      assertEquals(cookie.entries(), state.entries);

      for (const [k, v] of Object.entries(state.has)) {
        assertEquals(cookie.has(k), v);
      }

      const headers = new Headers();
      await cookie.applyUpdates(headers);
      assertEquals(Array.from(headers.entries()), state.applyUpdates);
    });
  };

  await check("Initial state", {
    get: {
      unsigned: "hello",
      signed: "abc123",
      unsigned2: undefined,
      signed2: undefined,
    },
    entries: [
      ["signed", "abc123"],
      ["unsigned", "hello"],
    ],
    has: {
      unsigned: true,
      signed: true,
      unsigned2: false,
      signed2: false,
    },
    isSigned: {
      unsigned: false,
      signed: true,
      unsigned2: false,
      signed2: false,
    },
    applyUpdates: [],
  });

  cookie.set("unsigned", "world");
  await check("Updated old unsigned cookie", {
    get: {
      unsigned: "world",
      signed: "abc123",
      unsigned2: undefined,
      signed2: undefined,
    },
    entries: [
      ["signed", "abc123"],
      ["unsigned", "world"],
    ],
    has: {
      unsigned: true,
      signed: true,
      unsigned2: false,
      signed2: false,
    },
    isSigned: {
      unsigned: false,
      signed: true,
      unsigned2: false,
      signed2: false,
    },
    applyUpdates: [
      ["set-cookie", "unsigned=world"]
    ],
  });

  cookie.set("signed", "def456", { signed: true });
  await check("Updated old signed cookie", {
    get: {
      unsigned: "world",
      signed: "def456",
      unsigned2: undefined,
      signed2: undefined,
    },
    entries: [
      ["signed", "def456"],
      ["unsigned", "world"],
    ],
    has: {
      unsigned: true,
      signed: true,
      unsigned2: false,
      signed2: false,
    },
    isSigned: {
      unsigned: false,
      signed: true,
      unsigned2: false,
      signed2: false,
    },
    applyUpdates: [
      ["set-cookie", "unsigned=world"],
      ["set-cookie", "signed=WyJzaWduZWQiLCJkZWY0NTYiXQ.XM0LAwc4_uZfP_hc-mhs1y-z9AAVdDSILUjKyHJkYpw"],
    ],
  });

  // TODO: Keep going
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