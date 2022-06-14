// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { path } from "../deps.ts";
import { serveAsset, prepareAssets } from "../assets.ts";
import { assertEquals } from "./test_deps.ts";
import { didMatch } from "../router.ts";

function chdir(which: "root" | "test") {
  const testDir = path.dirname(path.fromFileUrl(import.meta.url));
  if (which === "test") {
    Deno.chdir(testDir);
    return;
  }
  Deno.chdir(path.join(testDir, ".."));
}

// Note: The path on the request doesn't matter, only the path on the options is
// used.
const req = new Request("http://_");

Deno.test("serveAsset()", async t => {
  await t.step("path (root index file)", async () => {
    chdir("test");
    const res1 = await serveAsset(req, { path: "/" });
    assertEquals(res1.status, 200);
    assertEquals(await res1.text(), "<h1>assets/index.html</h1>");
  });

  await t.step("path + cwd", async () => {
    chdir("root");
    const res1 = await serveAsset(req, {
      path: "/",
      cwd: import.meta.url,
    });
    assertEquals(await res1.text(), "<h1>assets/index.html</h1>");
  });

  await t.step("path + dir (non-root index)", async () => {
    chdir("test");
    const res1 = await serveAsset(req, {
      path: "/assets",
      dir: "./assets",
    });
    assertEquals(await res1.text(), "<h1>assets/assets/index.html</h1>");
  });

  await t.step("path + cwd + dir", async () => {
    chdir("root");
    const res1 = await serveAsset(req, {
      path: "/test.txt",
      cwd: import.meta.url,
      dir: "./assets/nested",
    });
    assertEquals(await res1.text(), "test");
  });

  await t.step("404 not found", async () => {
    chdir("test");
    const res1 = await serveAsset(req, { path: "/hello" });
    assertEquals(res1.status, 404);
    assertEquals(didMatch(res1), false);
  });

  await t.step("404 for empty directory", async () => {
    chdir("test");
    const res1 = await serveAsset(req, { path: "/empty" });
    assertEquals(res1.status, 404);
  });

  await t.step("redirect /index.html requests", async () => {
    // This check (unlike the others) operates on the request itself, since the
    // redirect needs the full URL
    chdir("test");
    const res1 = await serveAsset(new Request("http://_/index.html"), { path: "/index.html" });
    assertEquals(res1.status, 302);
    assertEquals(res1.headers.get("location"), "http://_/");
  });

  await t.step("always 404 for .ts and .tsx files", async () => {
    chdir("test");

    const res1 = await serveAsset(req, { path: "/ts.ts" });
    assertEquals(res1.status, 404);

    const res2 = await serveAsset(req, { path: "/tsx.tsx" });
    assertEquals(res2.status, 404);
  });

  await t.step("mimetypes", async () => {
    // Content-type determination is done by the std module, so I'm not going to
    // check all of them
    chdir("test");

    const res1 = await serveAsset(req, { path: "/" });
    await res1.text(); // The bodies need to be consumed or the test will fail
    assertEquals(res1.headers.get("content-type"), "text/html");

    const res2 = await serveAsset(req, { path: "/cool-plant.jpg" });
    await res2.text();
    assertEquals(res2.headers.get("content-type"), "image/jpeg");

    const res3 = await serveAsset(req, { path: "/css.css" });
    await res3.text();
    assertEquals(res3.headers.get("content-type"), "text/css");

    const res4 = await serveAsset(req, { path: "/js.js" });
    await res4.text();
    assertEquals(res4.headers.get("content-type"), "application/javascript");
  });

  await t.step("etag", async () => {
    const res1 = await serveAsset(req, { path: "/cool-plant.jpg" });
    await res1.text();
    const etag = res1.headers.get("etag")!;
    assertEquals(typeof etag, "string");

    const res2 = await serveAsset(new Request("http://_", {
      headers: { "if-none-match": etag },
    }), { path: "/cool-plant.jpg" });
    assertEquals(res2.status, 304);
  });

  // TODO: https://github.com/connorlogin/cav/issues/36
});