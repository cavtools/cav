// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { assertEquals } from "./deps_test.ts";
import { cookieJar } from "../cookies.ts";
import type { CookieJar } from "../cookies.ts";
import { base64 } from "../deps.ts";

// Useful: https://jwt.io
// Note: Signed cookies are just `{"alg":"HS256"}` JWTs with the header removed

const deleted = "Expires=Thu, 01 Jan 1970 00:00:00 GMT";

async function testCookieJar(opt: {
  req?: Request;
  keys?: string | string[];
  op?: (cookie: CookieJar) => Promise<void> | void;
  get?: Record<string, string | undefined>;
  entries?: [string, string][];
  has?: Record<string, boolean>;
  isSigned?: Record<string, boolean>;
  setCookies?: [string, string][];
}): Promise<void> {
  const req = opt.req || new Request("http://localhost/fallback");
  const cookies = await cookieJar(req, opt.keys);

  if (opt.op) {
    await opt.op(cookies);
  }

  if (opt.get) {
    for (const [k, v] of Object.entries(opt.get)) {
      assertEquals(cookies.get(k), v);
    }
  }

  if (opt.entries) {
    assertEquals(cookies.entries(), opt.entries);
  }

  if (opt.has) {
    for (const [k, v] of Object.entries(opt.has)) {
      assertEquals(cookies.has(k), v);
    }
  }

  if (opt.isSigned) {
    for (const [k, v] of Object.entries(opt.isSigned)) {
      assertEquals(cookies.isSigned(k), v);
    }
  }

  if (opt.setCookies) {
    const headers = new Headers();
    await cookies.setCookies(headers);
    assertEquals(Array.from(headers.entries()), opt.setCookies);
  }
}

Deno.test(
  "Initial state of a bare request (no cookies)",
  () =>
    testCookieJar({
      get: { foo: undefined },
      entries: [],
      has: { bar: false },
      isSigned: { baz: false },
      setCookies: [],
    }),
);

Deno.test(
  "Initial state of a request with 1 signed and 1 unsigned cookie",
  () =>
    testCookieJar({
      req: new Request("http://localhost/test", {
        headers: {
          "cookie":
            "a=WyJhIiwiYWJjMTIzIl0.X6o_6Iy1LpDyTx1RYcZAAm6vZMn0ohZD3pP3_ox4fxI; b=hello",
        },
      }),
      keys: "abc123",
      get: { a: "abc123", b: "hello", foo: undefined },
      entries: [["a", "abc123"], ["b", "hello"]],
      has: { a: true, b: true, bar: false },
      isSigned: { a: true, b: false, baz: false },
      setCookies: [],
    }),
);

Deno.test(
  "Switching cookies between signed and unsigned",
  () =>
    testCookieJar({
      req: new Request("http://localhost/test", {
        headers: {
          "cookie":
            "a=WyJhIiwiYWJjMTIzIl0.X6o_6Iy1LpDyTx1RYcZAAm6vZMn0ohZD3pP3_ox4fxI; b=hello",
        },
      }),
      keys: "abc123",
      op: (cookies) => {
        cookies.set("a", "def456");
        cookies.set("b", "world", { signed: true });
      },
      get: { a: "def456", b: "world", foo: undefined },
      entries: [["b", "world"], ["a", "def456"]],
      has: { a: true, b: true, bar: false },
      isSigned: { a: false, b: true, baz: false },
      setCookies: [
        ["set-cookie", "a=def456"],
        [
          "set-cookie",
          "b=WyJiIiwid29ybGQiXQ.V7l9sq0M71XIcSBWK5hW6cnDKsJR5X5aqQvJKlT0nPw",
        ],
      ],
    }),
);

Deno.test(
  "Set cookies with custom path/domain that don't match request",
  () =>
    testCookieJar({
      req: new Request("http://localhost/test", {
        headers: { cookie: "a=hello" },
      }),
      op: (cookies) => {
        cookies.set("a", "world", { domain: "connor.lol" });
        cookies.set("b", "goodbye", { path: "/not-test" });
        cookies.set("c", "foo", { domain: "localhost", path: "/test/a" });
        cookies.set("d", "eh", { domain: "connor.lol", path: "/test" });
      },
      get: { a: "hello" },
      has: { b: false, c: false, d: false },
      setCookies: [
        ["set-cookie", "a=world; Domain=connor.lol"],
        ["set-cookie", "b=goodbye; Path=/not-test"],
        ["set-cookie", "c=foo; Domain=localhost; Path=/test/a"],
        ["set-cookie", "d=eh; Domain=connor.lol; Path=/test"],
      ],
    }),
);

Deno.test(
  "Delete cookies with custom path/domain that don't match request",
  () =>
    testCookieJar({
      req: new Request("http://localhost/test", {
        headers: { cookie: "a=hello" },
      }),
      op: (cookies) => {
        cookies.delete("a", { path: "/not-test" });
        cookies.delete("b", { domain: "connor.lol" });
        cookies.delete("c", { domain: "localhost", path: "/test/b" });
        cookies.delete("d", { domain: "sub.connor.lol", path: "/test" });
      },
      get: { a: "hello" },
      setCookies: [
        ["set-cookie", `a=; Path=/not-test; ${deleted}`],
        ["set-cookie", `b=; Domain=connor.lol; ${deleted}`],
        ["set-cookie", `c=; Domain=localhost; Path=/test/b; ${deleted}`],
        ["set-cookie", `d=; Domain=sub.connor.lol; Path=/test; ${deleted}`],
      ],
    }),
);

Deno.test(
  "Set cookies with custom path/domain that match request",
  () =>
    testCookieJar({
      req: new Request("http://sub.localhost/test/path", {
        headers: { cookie: "a=hello; b=world" },
      }),
      op: (cookies) => {
        cookies.set("a", "foo", { path: "/test" });
        cookies.set("b", "bar", { domain: "sub.localhost" });
        cookies.set("c", "baz", { domain: "localhost", path: "/test/path" });
      },
      get: { a: "foo", b: "bar", c: "baz" },
      setCookies: [
        ["set-cookie", "a=foo; Path=/test"],
        ["set-cookie", "b=bar; Domain=sub.localhost"],
        ["set-cookie", "c=baz; Domain=localhost; Path=/test/path"],
      ],
    }),
);

Deno.test(
  "Delete cookies with custom path/domain that match request",
  () =>
    testCookieJar({
      req: new Request("http://sub.localhost/test/path", {
        headers: { cookie: "a=hello; b=world" },
      }),
      op: (cookies) => {
        cookies.delete("a", { domain: "sub.localhost" });
        cookies.delete("b", { path: "/test" });
        cookies.delete("c", { domain: "localhost", path: "/test/path" });
      },
      has: { a: false, b: false, c: false },
      setCookies: [
        ["set-cookie", `a=; Domain=sub.localhost; ${deleted}`],
        ["set-cookie", `b=; Path=/test; ${deleted}`],
        ["set-cookie", `c=; Domain=localhost; Path=/test/path; ${deleted}`],
      ],
    }),
);

Deno.test(
  "Setting cookies to an expired date deletes them",
  () =>
    testCookieJar({
      req: new Request("http://localhost/test", {
        headers: { cookie: "a=foobar" },
      }),
      op: (cookies) => {
        cookies.set("a", "baz", {
          expires: new Date("Tue, 24 May 2022 02:22:19 GMT"),
        });
        cookies.set("b", "hello", {
          expires: new Date(0),
        });
      },
      has: { a: false, b: false, c: false },
      setCookies: [
        ["set-cookie", "a=baz; Expires=Tue, 24 May 2022 02:22:19 GMT"],
        ["set-cookie", `b=hello; ${deleted}`],
      ],
    }),
);

Deno.test(
  "Setting a signed cookie with an expiration encodes that date",
  () =>
    testCookieJar({
      req: new Request("http://localhost/test", {
        // Payload: ["wholetthe", "catsout"]
        headers: {
          cookie:
            "wholetthe=WyJ3aG9sZXR0aGUiLCJjYXRzb3V0Il0.WH7T_UfH3AoCqCU1j_QQGEEwtxILEaYoG9l3E5UhYy4",
        },
      }),
      keys: ["abc123"],
      op: (cookies) => {
        cookies.set("wholetthe", "dogsout", {
          signed: true,
          expires: new Date("Tue, 23 Jun 2122 04:00:00 GMT"), // Future
        });
        cookies.set("whowhowho", "who", {
          signed: true,
          expires: new Date("Tue, 01 Feb 2000 05:00:00 GMT"), // Past
        });
      },
      get: { wholetthe: "dogsout", whowhowho: undefined },
      setCookies: [
        // Payload: ["wholetthe", "dogsout", 4811630400000]
        [
          "set-cookie",
          "wholetthe=WyJ3aG9sZXR0aGUiLCJkb2dzb3V0Iiw0ODExNjMwNDAwMDAwXQ.RTFIYQRp4_kfEuaVVDrguEL7MD-c54k7FOC2vWrIyxw; Expires=Tue, 23 Jun 2122 04:00:00 GMT",
        ],
        // Payload: ["whowhowho", "who", 949381200000]
        [
          "set-cookie",
          "whowhowho=WyJ3aG93aG93aG8iLCJ3aG8iLDk0OTM4MTIwMDAwMF0.6LVSmFj-0_pknMCM-29oLx8XFCE-04-duykFq31WtY8; Expires=Tue, 01 Feb 2000 05:00:00 GMT",
        ],
      ],
    }),
);

Deno.test(
  "Reading a signed cookie with an expired date causes it to be deleted",
  () =>
    testCookieJar({
      req: new Request("http://localhost/test", {
        // Payload: ["whowhowho", "who", 949381200000]
        headers: {
          cookie:
            "whowhowho=WyJ3aG93aG93aG8iLCJ3aG8iLDk0OTM4MTIwMDAwMF0.6LVSmFj-0_pknMCM-29oLx8XFCE-04-duykFq31WtY8",
        },
      }),
      keys: ["abc123"],
      get: { whowhowho: undefined },
      setCookies: [
        ["set-cookie", `whowhowho=; ${deleted}`],
      ],
    }),
);

Deno.test(
  "Signed cookie with the wrong format never gets decoded",
  () =>
    testCookieJar({
      keys: "abc123",
      req: new Request("http://localhost/test", {
        headers: {
          // fail: a -> ["a"]
          // fail: b -> [123, "foo"]
          // fail: c -> ["c", 123]
          // fail: d -> {}
          // fail: e -> "hello"
          // fail: f -> ["f", "hello", null]
          // success: g -> ["g", "world"]
          // success: h -> ["h", "foobar", 4102376400000]
          cookie:
            `a=WyJhIl0.WmH8py58oVd9-lOM595glDvL3TXcHVMtPQPgo3K8Zxk; b=WzEyMywiZm9vIl0.LfuP_1YLCb17vBDnT5E8gZhTZlFyFZFYDBy0P3Z7qr0; c=WyJjIiwxMjNd.mdLATI5ytYsNR9aiolUMbMbQ16ZwWiARu-a9BjwyJHo; d=e30.C3t1TEHk2YOFbcPPsAyM7Zh7s3yywpUh0xDiXL7iNr0; e=aGVsbG8.-CrsRPB1pKTFRuvCrVASbdkM1_dhn_DpWCo5A--bncU; f=WyJmIiwiaGVsbG8iLG51bGxd.P8P5nhYCl80L0QHSR5H9VPIi_jPk_vICN8JMKqQlJM8; g=WyJnIiwid29ybGQiXQ.kYU3YIq1MzAMKZ1ZIO--84zu3JwHPdifhP2IZ-JYpUk; h=WyJoIiwiZm9vYmFyIiw0MTAyMzc2NDAwMDAwXQ.QNEXQA7PtusPSnBbFWypDRPHYfigeLhfUG6sXqtXc0s`,
        },
      }),
      get: {
        a: "WyJhIl0.WmH8py58oVd9-lOM595glDvL3TXcHVMtPQPgo3K8Zxk",
        b: "WzEyMywiZm9vIl0.LfuP_1YLCb17vBDnT5E8gZhTZlFyFZFYDBy0P3Z7qr0",
        c: "WyJjIiwxMjNd.mdLATI5ytYsNR9aiolUMbMbQ16ZwWiARu-a9BjwyJHo",
        d: "e30.C3t1TEHk2YOFbcPPsAyM7Zh7s3yywpUh0xDiXL7iNr0",
        e: "aGVsbG8.-CrsRPB1pKTFRuvCrVASbdkM1_dhn_DpWCo5A--bncU",
        f: "WyJmIiwiaGVsbG8iLG51bGxd.P8P5nhYCl80L0QHSR5H9VPIi_jPk_vICN8JMKqQlJM8",
        g: "world",
        h: "foobar",
      },
      isSigned: {
        a: false,
        b: false,
        c: false,
        d: false,
        e: false,
        f: false,
        g: true,
        h: true,
      },
    }),
);

Deno.test(
  "Signed cookies aren't decoded without the correct key",
  () =>
    testCookieJar({
      // Correct key: abc123
      keys: "abc124",
      req: new Request("http://localhost/test", {
        // Payload: ["a", "world"]
        headers: {
          cookie:
            "a=WyJhIiwid29ybGQiXQ.PIlTQhOh56MTmcX1c6SFxRzdL3vy_SmOY8ZBSDf7ZrU",
        },
      }),
      get: {
        a: "WyJhIiwid29ybGQiXQ.PIlTQhOh56MTmcX1c6SFxRzdL3vy_SmOY8ZBSDf7ZrU",
      },
    }),
);

Deno.test(
  "Key rollover",
  () =>
    testCookieJar({
      keys: ["no", "no-again", "yes... I mean no", "abc123"],
      req: new Request("http://localhost/test", {
        headers: {
          cookie:
            "a=WyJhIiwid29ybGQiXQ.PIlTQhOh56MTmcX1c6SFxRzdL3vy_SmOY8ZBSDf7ZrU",
        },
      }),
      op: (cookies) => {
        cookies.set("b", "test", { signed: true });
      },
      get: { a: "world", b: "test" },
      setCookies: [
        // Used the "no" key to sign it
        [
          "set-cookie",
          "b=WyJiIiwidGVzdCJd.wqOMI-CKGC2Igr40wbl0uAaxmY-zKHCc9QTWtaVrrOU",
        ],
      ],
    }),
);

Deno.test(
  "Signed cookies with a tampered name are never decoded",
  () =>
    testCookieJar({
      keys: "abc123",
      req: new Request("http://localhost/test", {
        headers: {
          cookie:
            "b=WyJhIiwid29ybGQiXQ.PIlTQhOh56MTmcX1c6SFxRzdL3vy_SmOY8ZBSDf7ZrU",
        },
      }),
      get: {
        b: "WyJhIiwid29ybGQiXQ.PIlTQhOh56MTmcX1c6SFxRzdL3vy_SmOY8ZBSDf7ZrU",
      },
    }),
);

// Helpful: https://mrcoles.com/blog/cookies-max-age-vs-expires/
Deno.test(
  "Max-Age, Expires, and some other options",
  () =>
    testCookieJar({
      keys: "abc123",
      req: new Request("http://localhost/test", {
        headers: {
          cookie:
            "a=hello; b=WyJiIiwid29ybGQiXQ.V7l9sq0M71XIcSBWK5hW6cnDKsJR5X5aqQvJKlT0nPw",
        },
      }),
      op: async (cookies) => {
        cookies.set("a", "world", {
          secure: true,
          maxAge: 24 * 60 * 60, // The unit is seconds, this is 24hr
        });
        cookies.set("b", "foobar", {
          signed: true,
          expires: new Date("Thu, 31 Dec 2099 05:00:00 GMT"),
          httpOnly: true,
          sameSite: "Strict",
          unparsed: ["Test=test"],
          maxAge: 60 * 60 * 24,
        });

        // Need to side step regular checks because maxAge creates dynamic
        // expiration dates, due to maxAge superceding expires when both are
        // specified. Sorry this is so messy

        const headers = new Headers();
        await cookies.setCookies(headers);
        const [[_, ah], [__, bh]] = Array.from(headers.entries());

        const [aVal, aSecure, aMaxAge, aExpires] = ah.split("; ");
        assertEquals(aVal, "a=world");
        assertEquals(aSecure, "Secure");
        assertEquals(aMaxAge, "Max-Age=86400");
        const nowPlus24h = Date.now() + (60 * 60 * 24) * 1000;
        const aExpTime = new Date(aExpires.split("=")[1]).getTime();
        assertEquals(nowPlus24h - aExpTime < 1000, true); // 1 second error margin
        assertEquals(nowPlus24h - aExpTime >= 0, true);

        const [val, httpOnly, maxAge, sameSite, expires, test] = bh.split("; ");
        let val2 = val.split("=")[1].split(".")[0];
        const decoder = new TextDecoder();
        val2 = decoder.decode(base64.decode(val2));
        const [name, value, expiresMsTime] = JSON.parse(val2);
        assertEquals(name, "b");
        assertEquals(value, "foobar");
        assertEquals(httpOnly, "HttpOnly");
        assertEquals(maxAge, "Max-Age=86400");
        assertEquals(sameSite, "SameSite=Strict");
        assertEquals(test, "Test=test");
        assertEquals(nowPlus24h - expiresMsTime < 1000, true);
        assertEquals(nowPlus24h - expiresMsTime >= 0, true);
        const expiresMsTime2 = new Date(expires.split("=")[1]).getTime();

        // Using an error margin of 2 seconds (2000 ms). Converting to GMT time
        // loses a few sigfigs
        assertEquals(expiresMsTime - expiresMsTime > -2000, true);
        assertEquals(expiresMsTime - expiresMsTime2 < 2000, true);
      },
    }),
);
