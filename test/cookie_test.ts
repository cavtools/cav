// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { assertEquals } from "./deps_test.ts";
import { bakeCookie } from "../cookie.ts";

// Only aiming for coverage here, no real need to check every possible cookie
// option

// The signature was generated with a third party tool:
// https://www.devglan.com/online-tools/hmac-sha256-online
const req = new Request("http://localhost/test", {
  headers: {
    "cookie": "signed=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXkiOiJzaWduZWQiLCJ2YWwiOiJoZWxsbyJ9.ksRla4FxNY73MtLG57WQCbpljR3IL4KHLnsGvuazUdE; unsigned=world",
  }
});
const keys: [string, ...string[]] = ["super-secret-test-key"];

Deno.test("Accessing previously set cookies", async () => {
  const cookie = await bakeCookie({ keys, req, headers: new Headers() });
  assertEquals(cookie.get("signed", { signed: true }), "hello");
  assertEquals(cookie.get("signed"), undefined);
  assertEquals(cookie.get("unsigned"), "world");
  assertEquals(cookie.get("unsigned", { signed: true }), undefined);
});

Deno.test("Changing the name of a signed cookie invalidates it", async () => {
  const req = new Request("http://localhost/test", {
    headers: {
      "cookie": "_signed=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXkiOiJzaWduZWQiLCJ2YWwiOiJoZWxsbyJ9.ksRla4FxNY73MtLG57WQCbpljR3IL4KHLnsGvuazUdE; unsigned=world",
    },
  });
  const cookie = await bakeCookie({ keys, req, headers: new Headers() });
  assertEquals(cookie.get("_signed", { signed: true }), undefined);
});

Deno.test("Changing the value of a signed cookie invalidates it", async () => {
  const req = new Request("http://localhost/test", {
    headers: {
      "cookie": "signed=EyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXkiOiJzaWduZWQiLCJ2YWwiOiJoZWxsbyJ9.ksRla4FxNY73MtLG57WQCbpljR3IL4KHLnsGvuazUdE; unsigned=world",
    },
  });
  const cookie = await bakeCookie({ keys, req, headers: new Headers() });
  assertEquals(cookie.get("signed", { signed: true }), undefined);
});

Deno.test("Updates don't flush to headers until .sync()", async () => {
  const headers = new Headers();
  const cookie = await bakeCookie({ keys, req, headers });
  cookie.set("test", "test");
  assertEquals(Array.from(headers.values()).length, 0);
  await cookie.sync();
  assertEquals(Array.from(headers.values()).length, 1);
});

Deno.test("Random fallback key is used if no key specified", async () => {
  const headers = new Headers();
  const cookie = await bakeCookie({ req, headers });
  
  // Shouldn't work with a cookie it didn't sign, but should be able to access
  // unsigned cookies
  assertEquals(cookie.get("signed", { signed: true }), undefined);
  assertEquals(cookie.get("unsigned"), "world");

  // Should be able to access the cookies it did sign
  cookie.set("signed", "hello", { signed: true });
  await cookie.sync();
  const pair = headers.get("set-cookie")!;
  const cookie2 = await bakeCookie({
    req: new Request("http://localhost/test", { headers: { "cookie": pair } }),
    headers: new Headers(),
  });
  assertEquals(cookie2.get("signed", { signed: true }), "hello");
});

Deno.test("Overwriting old values", async () => {
  const cookie = await bakeCookie({ keys, req, headers: new Headers() });
  cookie.set("signed", "foo", { signed: true });
  assertEquals(cookie.get("signed", { signed: true }), "foo");
  cookie.set("unsigned", "bar");
  assertEquals(cookie.get("unsigned"), "bar");
});

Deno.test("Setting then getting", async () => {
  const headers = new Headers();
  const cookie = await bakeCookie({ keys, req, headers });
  cookie.set("signed2", "goodbye", { signed: true });
  assertEquals(cookie.get("signed2", { signed: true }), "goodbye");
  cookie.set("unsigned2", "world");
  assertEquals(cookie.get("unsigned2"), "world");

  await cookie.sync();
  const updates = headers.get("set-cookie")!.split(", ");
  assertEquals(updates[0].startsWith("signed2="), true); // FIXME
  assertEquals(updates[1], "unsigned2=world");
});

Deno.test("Setting then getting with different path/domain", async () => {
  const headers = new Headers();
  const cookie = await bakeCookie({ keys, req, headers });
  cookie.set("signed2", "goodbye", { signed: true, domain: "google.com" });
  assertEquals(cookie.get("signed2", { signed: true }), undefined);
  cookie.set("unsigned2", "world", { path: "/hello/world" });
  assertEquals(cookie.get("unsigned2"), undefined);

  await cookie.sync();
  const updates = headers.get("set-cookie")!.split(", ");
  // FIXME
  assertEquals(updates[0], "signed2=goodbye; Domain=google.com");
  assertEquals(updates[1].startsWith("signed2_sig"), true);
  assertEquals(updates[1].endsWith("; Domain=google.com"), true);
  assertEquals(updates[2], "unsigned2=world; Path=/hello/world");
});

Deno.test("Deleting then getting", async () => {
  const headers = new Headers();
  const cookie = await bakeCookie({ keys, req, headers });
  cookie.delete("signed");
  assertEquals(cookie.get("signed", { signed: true }), undefined);
  assertEquals(cookie.get("signed"), undefined);
  cookie.delete("unsigned");
  assertEquals(cookie.get("unsigned"), undefined);

  await cookie.sync();
  const expires = "Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  assertEquals(
    headers.get("set-cookie"),
    `signed=; ${expires}, unsigned=; ${expires}`,
  );
});

Deno.test("Deleting then getting with different path/domain", async () => {
  const headers = new Headers();
  const cookie = await bakeCookie({ keys, req, headers });
  cookie.delete("signed", { domain: "google.com" });
  assertEquals(cookie.get("signed", { signed: true }), "hello");
  cookie.delete("unsigned", { path: "/hello/world" });
  assertEquals(cookie.get("unsigned"), "world");
  
  await cookie.sync();
  const expires = "Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  assertEquals(
    headers.get("set-cookie"),
    `signed=; Domain=google.com; ${expires}, unsigned=; Path=/hello/world; ${expires}`,
  );
});

Deno.test("signed() and unsigned()", async () => {
  const cookie = await bakeCookie({ keys, req, headers: new Headers() });
  assertEquals(cookie.signed(), {
    signed: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXkiOiJzaWduZWQiLCJ2YWwiOiJoZWxsbyJ9.ksRla4FxNY73MtLG57WQCbpljR3IL4KHLnsGvuazUdE",
  });
  assertEquals(cookie.unsigned(), {
    unsigned: "world",
  });
  cookie.delete("signed");
  cookie.set("unsigned", "goodbye");
  assertEquals(cookie.signed(), {});
  assertEquals(cookie.unsigned(), { unsigned: "goodbye" });
  cookie.set("signed", "goodbye");
  cookie.delete("unsigned");
  assertEquals(cookie.signed(), { signed: "goodbye" });
  assertEquals(cookie.unsigned(), {});
});

Deno.test("Setting cookie to expired date should delete it", () => {
  // FIXME
  throw new Error("TODO");
});