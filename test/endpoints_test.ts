// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http, path } from "../deps.ts";
import { endpoint, assets, redirect, socket } from "../endpoints.ts";
import { assertEquals } from "./test_deps.ts";
import { router } from "../router.ts";
import type { Endpoint, ResolveArg, Socket } from "../endpoints.ts";

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
});

Deno.test("assets()", async t => {
  const originalCwd = Deno.cwd();

  await t.step("args: no options", async () => {
    Deno.chdir(path.dirname(path.fromFileUrl(import.meta.url))); // test
    const ass = assets(); // can't help myself
    const _check: AssertEquals<typeof ass, Endpoint<{
      path: "*";
      resolve: (
        x: ResolveArg<{ path: "*" }>,
      ) => Promise<Response>;
    }>> = true;
    const res1 = await ass(new Request("http://_"), conn);
    assertEquals(res1.status, 200);
    assertEquals(res1.headers.get("content-type"), "text/html");
    assertEquals(await res1.text(), "<h1>assets/index.html</h1>");
    Deno.chdir(originalCwd);
  });

  await t.step("args: cwd set to directory", async () => {
    Deno.chdir(path.dirname(path.fromFileUrl(import.meta.url))); // test
    const ass = assets({ cwd: "./assets"});
    const res1 = await ass(new Request("http://_"), conn);
    assertEquals(res1.status, 200);
    assertEquals(await res1.text(), "<h1>assets/assets/index.html</h1>");
    Deno.chdir(originalCwd);
  });

  await t.step("args: cwd set to current file", async () => {
    Deno.chdir(path.join(path.fromFileUrl(import.meta.url), "../..")); // root
    const ass = assets({ cwd: import.meta.url });
    const res1 = await ass(new Request("http://_"), conn);
    assertEquals(await res1.text(), "<h1>assets/index.html</h1>");
    Deno.chdir(originalCwd);
  });

  await t.step("args: dir", async () => {
    Deno.chdir(path.dirname(path.fromFileUrl(import.meta.url))); // test
    const ass = assets({ dir: "./assets/assets" });
    const res1 = await ass(new Request("http://_"), conn);
    assertEquals(await res1.text(), "<h1>assets/assets/index.html</h1>");
    Deno.chdir(originalCwd);
  });

  await t.step("args: cwd + dir", async () => {
    Deno.chdir(path.join(path.fromFileUrl(import.meta.url), "../..")); // root
    const ass = assets({ cwd: import.meta.url, dir: "./assets/assets" });
    const res1 = await ass(new Request("http://_"), conn);
    assertEquals(await res1.text(), "<h1>assets/assets/index.html</h1>");
    Deno.chdir(originalCwd);
  });

  // 404s
  // Non-index file
  // File with assumed .html extension
  // Rebased index from inside directory
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
    assertEquals(res1.headers.get("location"), "http://_/foo/hello/world");

    const res2 = await redir(new Request("http://_/foo/bar"), conn);
    assertEquals(res2.status, 404);
  });

  await t.step("args: local redirect with ./ + non-302 status", async () => {
    const redir = redirect("./hello/world", 301);
    const rtr = router({
      foo: {
        bar: redir,
      }
    });

    const res1 = await rtr(new Request("http://_/foo/bar"), conn);
    assertEquals(res1.status, 301);
    assertEquals(res1.headers.get("location"), "http://_/foo/bar/hello/world");
    
    const res2 = await redir(new Request("http://_/foo/bar"), conn);
    assertEquals(res2.status, 404);
  });

  await t.step("args: global redirect", async () => {
    const redir = redirect("https://cav.bar");
    const res1 = await redir(new Request("http://_"), conn);
    assertEquals(res1.status, 302);

    // Fun note: If you go to "https://cav.bar/" in your url bar, Firefox will
    // automatically remove the trailing slash. However, the URL constructor
    // automatically adds the root trailing slash. Fun how everyone has a
    // different opinion about this lol. I'm more of a no-slash person (it's
    // just another thing to remember and think about, better off without them
    // imo), which is why Cav takes a few extra steps to remove trailing slashes
    // from URLs, including rebasing index files from non-root directories
    assertEquals(res1.headers.get("location"), "https://cav.bar/");
  });

  await t.step("args: local redirect with no leading ./ or ../", async () => {
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

Deno.test("socket()", async t => {
  t.step("args: none", async () => {
    const sock = socket();
    const _check: AssertEquals<typeof sock, Socket<{}>> = true;
  });

  t.step("args: schema only", async () => {

  });

  t.step("args: setup only", async () => {

  });

  t.step("args: schema + setup", async () => {

  });

  t.step("426 without upgrade header", async () => {
    
  });
});