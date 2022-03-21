// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { endpoint, assets, redirect, socket } from "../endpoints.ts";
import { assertEquals } from "./test_deps.ts";
import { router } from "../router.ts";
import { unwatchAssets } from "../assets.ts";
import { chdir, cleanAssets } from "./assets_test.ts";
import type { http } from "../deps.ts";
import type { Router } from "../router.ts";
import type { Endpoint, Socket, ResolveArg, SetupArg } from "../endpoints.ts";

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
    const _check: AssertEquals<typeof end, Endpoint<{}>> = true;

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
    }, async x => x.message); // i hate this syntax. see #32
    const _check: AssertEquals<typeof end, Endpoint<{
      message: (m: string) => string,
      resolve: (
        x: ResolveArg<{ message: (m: string) => string }>,
      ) => Promise<string>;
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

  // Integration test
});

Deno.test("assets()", async t => {
  await t.step("args: no options", async () => {
    chdir("test");
    await cleanAssets();

    // assets() with no options starts an asset watcher by default. The assets
    // dir needs to be unwatched when this test is over or it'll fail. Do that
    // at the end
    const ass = assets();    
    const _check: AssertEquals<typeof ass, Endpoint<{
      path: "*";
      resolve: (
        x: ResolveArg<{ path: "*" }>,
      ) => Promise<Response>;
    }>> = true;

    // This delay is needed because watchAssets() does an initial prep loop
    // before watching the file system, and the promise it returns isn't awaited
    // when its called inside assets()
    await new Promise(r => setTimeout(r, 100));

    const res1 = await ass(new Request("http://_"), conn);
    assertEquals(res1.status, 200);
    assertEquals(res1.headers.get("content-type"), "text/html");
    assertEquals(await res1.text(), "<h1>assets/index.html</h1>");

    const res2 = await ass(new Request("http://_/root_bundle.tsx.js"), conn);
    assertEquals(res2.status, 200);
    await res2.text();

    unwatchAssets();
    await cleanAssets();
  });

  await t.step("args: cwd set to directory", async () => {
    chdir("test");
    const ass = assets({
      cwd: "./assets",
      noPrep: true, // no need to cleanAssets when this is specified
    });
    const res1 = await ass(new Request("http://_"), conn);
    assertEquals(res1.status, 200);
    assertEquals(await res1.text(), "<h1>assets/assets/index.html</h1>");
  });

  await t.step("args: cwd set to current file", async () => {
    chdir("root");
    const ass = assets({
      cwd: import.meta.url,
      noPrep: true,
    });
    const res1 = await ass(new Request("http://_"), conn);
    assertEquals(await res1.text(), "<h1>assets/index.html</h1>");
  });

  await t.step("args: dir", async () => {
    chdir("test");
    const ass = assets({
      dir: "./assets/assets",
      noPrep: true,
    });
    const res1 = await ass(new Request("http://_"), conn);
    assertEquals(await res1.text(), "<h1>assets/assets/index.html</h1>");
  });

  await t.step("args: cwd + dir", async () => {
    chdir("root");
    const ass = assets({
      cwd: import.meta.url,
      dir: "./assets/assets",
      noPrep: true,
    });
    const res1 = await ass(new Request("http://_"), conn);
    assertEquals(await res1.text(), "<h1>assets/assets/index.html</h1>");
  });

  // TODO: Each of the endpoint options, individually
  // TODO: 404s
  // TODO: Non-index file
  // TODO: File with assumed .html extension
  // TODO: Rebased index from inside directory
  // TODO: Empty directories
  // TODO: mime-type for non-html files
  // TODO: http ranges for retrieving partial content
  // TODO: noPrep: false
});

Deno.test("redirect()", async t => {
  await t.step("args: local redirect with ../", async () => {
    const redir = redirect("../hello/world");
    const _check: AssertEquals<typeof redir, Endpoint<{
      resolve: (x: ResolveArg<{}>) => Response;
    }>> = true;

    // The redirect utility for endpoints uses the full url path when joining
    // for local redirects, but the path schema option for redirects is always
    // "/". So, we need to put the redirect endpoint into a router to make sure
    // the routed path is "/" without having the actual path be "/"
    const rtr = router({
      foo: {
        bar: redir,
      },
    });

    const res1 = await rtr(new Request("http://_/foo/bar"), conn);
    assertEquals(res1.status, 302);
    assertEquals(res1.headers.get("location"), "http://_/hello/world");

    const res2 = await redir(new Request("http://_/foo/bar"), conn);
    assertEquals(res2.status, 404);
  });

  await t.step("args: local redirect with ./ + non-302 status", async () => {
    const redir = redirect("./hello/world", 301);
    const rtr = router({
      foo: {
        bar: redir,
      },
    });

    const res1 = await rtr(new Request("http://_/foo/bar"), conn);
    assertEquals(res1.status, 301);
    assertEquals(res1.headers.get("location"), "http://_/foo/hello/world");
    
    const res2 = await redir(new Request("http://_/foo/bar"), conn);
    assertEquals(res2.status, 404);
  });

  await t.step("args: global redirect", async () => {
    const redir = redirect("https://cav.bar");
    const res1 = await redir(new Request("http://_"), conn);
    assertEquals(res1.status, 302);

    // Fun note: If you go to "https://cav.bar/" in your url bar, Firefox will
    // automatically remove the trailing slash. However, the URL constructor
    // automatically adds the root trailing slash. I'm more of a no-slash
    // person, which is why Cav takes a few extra steps to remove trailing
    // slashes from URLs, including rebasing index files from non-root
    // asset directories
    assertEquals(res1.headers.get("location"), "https://cav.bar/");
  });

  await t.step("args: local redirect with no leading ./ or ../", async () => {
    // A leading "/" is assumed
    const redir = redirect("hello/world");
    const rtr = router({
      foo: {
        bar: redir,
      }
    });

    const res1 = await rtr(new Request("http://_/foo/bar"), conn);
    assertEquals(res1.status, 302);
    assertEquals(res1.headers.get("location"), "http://_/hello/world");
  });

  await t.step("args: local redirect with /", async () => {
    const redir = redirect("/hello/world", 301);
    const rtr = router({
      foo: {
        bar: redir,
      },
    });

    const res1 = await rtr(new Request("http://_/foo/bar"), conn);
    assertEquals(res1.status, 301);
    assertEquals(res1.headers.get("location"), "http://_/hello/world");
  });
});

// Helpful:
// https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers
Deno.test("socket()", async t => {
  const clientHeaders = {
    upgrade: "websocket",
    connection: "Upgrade",
    "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
    "sec-websocket-version": "13",
    "sec-websocket-protocol": "json",
  };

  const assertSocketResponse = (res: Response) => {
    assertEquals(res.status, 101);
    assertEquals(res.headers.get("upgrade"), "websocket");
    assertEquals(res.headers.get("connection"), "Upgrade");
    assertEquals(res.headers.get("sec-websocket-protocol"), "json");
    assertEquals(res.body, null);
  };

  await t.step("args: none", async () => {
    const sock = socket();
    const _check: AssertEquals<typeof sock, Socket<{}>> = true;

    const res1 = await sock(new Request("http://_", {
      headers: clientHeaders,
    }), conn);
    assertSocketResponse(res1);
  });

  await t.step("args: schema only", async () => {
    const sock = socket({ path: "/test" });
    const _check: AssertEquals<typeof sock, Socket<{ path: string }>> = true;

    const res1 = await sock(new Request("http://_/test", {
      headers: clientHeaders,
    }), conn);
    assertSocketResponse(res1);

    const res2 = await sock(new Request("http://_", {
      headers: clientHeaders,
    }), conn);
    assertEquals(res2.status, 404);
  });

  await t.step("args: setup only", async () => {
    const sock = socket(({ ws }) => {
      ws.onopen = () => {};
      ws.on("close", () => {});
    });
    const _check: AssertEquals<typeof sock, Socket<{
      setup: (x: SetupArg<{}>) => void;
    }>> = true;

    const res1 = await sock(new Request("http://_", {
      headers: clientHeaders,
    }), conn);
    assertSocketResponse(res1);
  });

  await t.step("args: schema + setup", async () => {
    let lastTest = "";
    const sock = socket({
      query: (q) => {
        if (typeof q.test !== "string") {
          throw new Error("missing test query");
        }
        return { test: q.test };
      },
    }, x => {
      lastTest = x.query.test;
      x.ws.on("open", () => {});
      x.ws.onclose = () => {};
    });

    const res1 = await sock(new Request("http://_/?test=hello", {
      headers: clientHeaders,
    }), conn);
    assertSocketResponse(res1);
    assertEquals(lastTest, "hello");

    const res2 = await sock(new Request("http://_", {
      headers: clientHeaders,
    }), conn);
    assertEquals(res2.status, 400);
    assertEquals(lastTest, "hello");
  });

  await t.step("nested inside a router", async () => {
    const sock = socket();
    const rtr = router({
      nested: sock,
    });
    const _check: AssertEquals<typeof rtr, Router<{
      nested: Socket<{}>;
    }>> = true;

    const res1 = await rtr(new Request("http://_/nested", {
      headers: clientHeaders,
    }), conn);
    assertSocketResponse(res1);

    const res2 = await rtr(new Request("http://_/nested/again", {
      headers: clientHeaders,
    }), conn);
    assertEquals(res2.status, 404);
  });

  await t.step("426 without upgrade header", async () => {
    const sock = socket();
    const res1 = await sock(new Request("http://_"), conn);
    assertEquals(res1.status, 426);
    assertEquals(await res1.text(), "426 upgrade required");
  });

  // TODO: Integration test with client
});