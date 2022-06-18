// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { router, routerContext, noMatch, didMatch } from "../router.ts";
import { assert, assertEquals, assertThrows } from "./test_deps.ts";
import type { http } from "../deps.ts";

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

Deno.test("allows the '/' route", async () => {
  const rtr = router({ "/": () => new Response("hi") });
  const res = await rtr(new Request("http://_"), conn);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "hi");
});

Deno.test("deeper routes are checked first", async () => {
  const req1 = new Request("http://localhost/a/b");
  const req2 = new Request("http://localhost/a");

  const rtr = router({
    a: req => {
      assertEquals(req, req2);
      return new Response("2");
    },
    "a/b": req => {
      assertEquals(req, req1);
      return new Response("1");
    },
  });

  const res1 = await rtr(req1, conn);
  const res2 = await rtr(req2, conn);
  assertEquals(await res1.text(), "1");
  assertEquals(await res2.text(), "2");
});

Deno.test("extra slashes doesn't change symantic meaning", async () => {
  const req1 = new Request("http://localhost/a/b");
  const req2 = new Request("http://localhost/a");
  const req3 = new Request("http://localhost/a/b/c");

  const rtr = router({
    "//////a/////": req => {
      assertEquals(req, req2);
      return new Response("2");
    },
    "a///b": req => {
      assertEquals(req, req1);
      return new Response("1");
    },
    "a/b//c": req => {
      assertEquals(req, req3);
      return new Response("3");
    }
  });

  const res1 = await rtr(req1, conn);
  const res2 = await rtr(req2, conn);
  const res3 = await rtr(req3, conn);
  assertEquals(await res1.text(), "1");
  assertEquals(await res2.text(), "2");
  assertEquals(await res3.text(), "3");
});

Deno.test("path cleaning doesn't affect router properties", () => {
  const fn = () => new Response("");
  const rtr = router({ "//a//": fn });
  assertEquals(rtr["//a//"], fn);
});

Deno.test("canonical redirects", async () => {
  const rtr = router({});
  const res1 = await rtr(new Request("http://localhost/a/"), conn);
  const res2 = await rtr(new Request("http://localhost//a"), conn);
  const res3 = await rtr(new Request("http://localhost/a//b///c////"), conn);
  
  assertEquals([res1.status, res2.status, res3.status], [302,302,302]);
  assertEquals(res1.headers.get("location"), "http://localhost/a");
  assertEquals(res2.headers.get("location"), "http://localhost/a");
  assertEquals(res3.headers.get("location"), "http://localhost/a/b/c");
});

Deno.test("route nesting is prioritized over object nesting", async () => {
  // NOTE: This behavior might be counter-intuitive in some cases, like this one
  const rtr = router({
    a: {
      "b/c/d": () => new Response("1"),
    },
    "a/b/c": () => new Response("2"),
  });
  const res = await rtr(new Request("http://localhost/a/b/c/d"), conn);
  assertEquals(await res.text(), "2"); // didn't match inside "a"
});

Deno.test("noMatch + handler arrays", async () => {
  const rtr = router({
    a: [
      router({
        b: () => new Response("/a/b"),
        c: () => noMatch(new Response("no match /a/c")),
      }),
      router({
        c: () => new Response("/a/c"),
      }),
      () => new Response("/a"),
    ],
  });

  const res1 = await rtr(new Request("http://localhost/a"), conn);
  const res2 = await rtr(new Request("http://localhost/a/b"), conn);
  const res3 = await rtr(new Request("http://localhost/a/c"), conn);
  assertEquals(await res1.text(), "/a");
  assertEquals(await res2.text(), "/a/b");
  assertEquals(await res3.text(), "/a/c");
});

Deno.test("noMatch with no routes", async () => {
  const rtr = router({});
  const res = await rtr(new Request("http://localhost/a"), conn);
  assert(!didMatch(res), "request matched when it shouldn't have");
  assertEquals(await res.text(), "404 not found");
  assertEquals(res.status, 404);
});

// REVIEW: I can't tell if this feature is useful or confusing
Deno.test("returns last noMatch response when nothing matches", async () => {
  const rtr = router({
    a: () => noMatch(new Response("hello")),
  });
  const res = await rtr(new Request("http://localhost/a/b"), conn);
  assertEquals(await res.text(), "hello");
});

Deno.test("null routes are skipped", async () => {
  const rtr = router({
    a: {
      "/b/c": null,
      "/b": () => new Response("yep"),
    },
    "a/b/c": null,
  });
  const res = await rtr(new Request("http://localhost/a/b/c"), conn);
  assertEquals(await res.text(), "yep");
});

Deno.test("equally deep routes use index order to resolve", async () => {
  const res1 = new Response("yes");
  const res2 = new Response("no");
  const rtr = router({
    "///a/b": () => res1,
    "a/b///////": () => res2,
    // This caught a bug where I was discarding the previously collected router
    // Handler[] by accident while normalizing the router shape. This nested
    // router definition replaced the previous two when it shouldn't have
    "a/b": {
      "*": () => res2,
    },
  });
  const res = await rtr(new Request("http://localhost/a/b/c"), conn);
  assertEquals(await res.text(), "yes");
});

Deno.test("wildcard + router context + path + groups + query", async () => {
  const handler = (req: Request) => {
    const ctx = routerContext(req);
    return new Response(JSON.stringify({
      path: ctx.path,
      groups: ctx.groups,
      query: ctx.query,
    }));
  };

  const rtr = router({
    ":a": {
      "b/:c/:a": handler, // #1
      "b/:c/:d/:e": handler, // #2, #5
      // this pair of routes checks that the groups get put back correctly after
      // a route matches but the handler throws a no match
      "/b/:shouldntBeInGroups": () => noMatch(new Response()),
      "b/:c": handler, // #3
      "*": handler, // #4
    },
  });

  // #1
  const res1 = await rtr(new Request("http://localhost/1/b/2/3?4=5&4=6"), conn);
  assertEquals(await res1.json(), { 
    path: "/",
    groups: { a: ["1", "3"], c: "2" },
    query: { "4": ["5", "6"] },
  });

  // #2
  const res2 = await rtr(new Request("http://localhost/1/b/2/3/4?5=6"), conn);
  assertEquals(await res2.json(), {
    path: "/",
    groups: { a: "1", c: "2", d: "3", e: "4" },
    query: { 5: "6" },
  });

  // #3
  const res3 = await rtr(new Request("http://localhost/1/b/2"), conn);
  assertEquals(await res3.json(), {
    path: "/",
    groups: { a: "1", c: "2" },
    query: {},
  });

  // #4
  const res4 = await rtr(new Request("http://localhost/1/2/3/4"), conn);
  assertEquals(await res4.json(), {
    path: "/2/3/4",
    groups: { a: "1" },
    query: {},
  });

  // #5
  const res5 = await rtr(new Request("http://localhost/1/b/2/3/4/5"), conn);
  assertEquals(await res5.json(), {
    path: "/5",
    groups: { a: "1", c: "2", d: "3", e: "4" },
    query: {},
  });
});

Deno.test("bad routes", () => {
  const h = () => new Response();
  assertThrows(() => router({ ".": h }), SyntaxError);
  assertThrows(() => router({ "..": h }), SyntaxError);
  assertThrows(() => router({ "": h }), SyntaxError);
  assertThrows(() => router({ ":id([0-9]+)": h }), SyntaxError);
});