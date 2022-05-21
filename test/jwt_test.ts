// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { encodeJwt, decodeJwt } from "../jwt.ts";
import { assertEquals, assertRejects } from "./deps_test.ts";

// The correct JWTs were created with https://jwt.io

Deno.test("Encoding / decoding without exp", async () => {
  const payload = { some: "payload" };
  const key = "super-secret-test-key";
  const correct = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzb21lIjoicGF5bG9hZCJ9.zkACJgmttxpXyWwHoL3smVhkSetrwhlpBrT_rl9JdKs";

  const encoded = await encodeJwt(payload, key);
  const decoded = await decodeJwt(encoded, key);
  assertEquals(encoded, correct);
  assertEquals(decoded, payload);
});

Deno.test("Encoding / decoding with unexpired exp", async () => {
  const payload = { exp: "2100-01-01T00:00:00.000Z" };
  const key = "different-secret-key";
  const correct = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOiIyMTAwLTAxLTAxVDAwOjAwOjAwLjAwMFoifQ.NMT6oYe4oK2kNliUkhIXBMz0i5NSZVs3LZDl6rqKDUw";

  const encoded = await encodeJwt(payload, key);
  const decoded = await decodeJwt(encoded, key);
  assertEquals(encoded, correct);
  assertEquals(decoded, payload);
});

Deno.test("Encoding / decoding with expired exp", async () => {
  const payload = { exp: "2000-01-01T00:00:00.000Z" };
  const key = "secret-key";
  const correct = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOiIyMDAwLTAxLTAxVDAwOjAwOjAwLjAwMFoifQ.exu--Brg9xKE6mDtOSUtpmUwfxYbgo2U1Sw5E51N2-s";

  const encoded = await encodeJwt(payload, key);
  assertEquals(encoded, correct);
  await assertRejects(() => decodeJwt(encoded, key), Error, "expired");
});

Deno.test("Encoding / decoding with the fallback key", async () => {
  const payload = { hello: "world" }
  const encoded = await encodeJwt(payload);
  const decoded = await decodeJwt(encoded);
  assertEquals(await encodeJwt(payload), encoded);
  assertEquals(decoded, payload);
  await assertRejects(() => decodeJwt(encoded + "1"), Error, "bad signature");
});

Deno.test("Key rollover", async () => {
  const payload = { foo: "bar" };
  const keys = ["bad", "bad2", "good"];
  const encoded = await encodeJwt(payload, keys[2]);
  const decoded = await decodeJwt(encoded, keys);
  assertEquals(decoded, payload);
});

Deno.test("Key rollover with correct key missing", async () => {
  const payload = { foo: "bar" };
  const keys = ["bad", "bad2", "bad3"];
  const encoded = await encodeJwt(payload, "good");
  await assertRejects(() => decodeJwt(encoded, keys), Error, "bad signature");
});

Deno.test("Decoding with empty key array throws", async () => {
  const payload = { foo: "bar" };
  const keys = [] as string[];
  const encoded = await encodeJwt(payload, "hello");
  await assertRejects(() => decodeJwt(encoded, keys), Error, "bad signature");
});

Deno.test("Decoding with a tampered header throws", async () => {
  const encoded = await encodeJwt({ hello: "world" }, "hello");
  await assertRejects(
    () => decodeJwt(encoded.slice(1), "hello"),
    Error,
    "unsupported header",
  );
});

Deno.test("Decoding with an unknown algorithm / type throws", async () => {
  const key = "hello"
  const hs384 = "eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJoZWxsbyI6IndvcmxkIn0.0CZlyh-v9s4LyF3ozAif1piY6pBKUwzl6sjtE79BbsGdQq52cY8MnsYXL3YEsIX4";
  await assertRejects(
    () => decodeJwt(hs384, key),
    Error,
    "unsupported header",
  );
});

Deno.test("Decoding with a tampered payload throws", async () => {
  let encoded = await encodeJwt({ hello: "world" }, "hello");
  encoded = encoded
    .split(".")
    .map((v, i) => i === 1 ? v.slice(1) : v)
    .join(".");
  await assertRejects(
    () => decodeJwt(encoded, "hello"), 
    Error,
    "bad signature",
  );
});

Deno.test("Decoding with a tampered signature throws", async () => {
  const encoded = await encodeJwt({ hello: "world" }, "hello");
  await assertRejects(
    () => decodeJwt(encoded.slice(0, -5), "hello"),
    Error,
    "bad signature",
  );
});

Deno.test("Decoding a non-json payload throws", async () => {
  // The invalid payload is the following string without quotes: "hello world"
  const test = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aGVsbG8gd29ybGQ.fHbXBJ2034_dPy7WdMYka0PG0bpoBsDGcfsefxYTbFw";
  const key = "hello";
  await assertRejects(
    () => decodeJwt(test, key),
    Error,
    "bad payload",
  );
})

Deno.test("Zero-length key", async () => {
  await assertRejects(
    () => encodeJwt({ hello: "world" }, ""),
    Error,
    "Key length is zero",
  );
});

Deno.test("Not enough or too many jwt parts", async () => {
  await assertRejects(
    () => decodeJwt("hello.world", "hello"),
    Error,
    "bad format",
  );
  await assertRejects(
    () => decodeJwt("hello.world.goodbye.world", "hello"),
    Error,
    "bad format",
  );
});