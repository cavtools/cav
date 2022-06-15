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

Deno.test("serveAsset()", async t => {
  await t.step("path (root index file)", async () => {
    chdir("test");
    const req = new Request("http://_");
    const res1 = await serveAsset(req, { path: "/" });
    assertEquals(res1.status, 200);
    assertEquals(await res1.text(), "<h1>assets/index.html</h1>");
  });

  await t.step("path + cwd", async () => {
    chdir("root");
    const req = new Request("http://_");
    const res1 = await serveAsset(req, {
      path: "/",
      cwd: import.meta.url,
    });
    assertEquals(await res1.text(), "<h1>assets/index.html</h1>");
  });

  await t.step("path + dir (non-root index)", async () => {
    chdir("test");
    const req = new Request("http://_/assets");
    const res1 = await serveAsset(req, {
      path: "/assets",
      dir: "./assets",
    });
    assertEquals(await res1.text(), "<h1>assets/assets/index.html</h1>");
  });

  await t.step("path + cwd + dir", async () => {
    chdir("root");
    const req = new Request("http://_/blah/test.txt");
    const res1 = await serveAsset(req, {
      path: "/test.txt",
      cwd: import.meta.url,
      dir: "./assets/nested",
    });
    assertEquals(await res1.text(), "test");
  });

  await t.step("404 not found", async () => {
    chdir("test");
    const req = new Request("http://_/hello");
    const res1 = await serveAsset(req, { path: "/hello" });
    assertEquals(res1.status, 404);
    assertEquals(didMatch(res1), false);
  });

  await t.step("404 for empty directory", async () => {
    chdir("test");
    const req = new Request("http://_/blah/blah/empty");
    const res1 = await serveAsset(req, { path: "/empty" });
    assertEquals(res1.status, 404);
  });

  await t.step("redirect /index.html requests", async () => {
    chdir("test");
    const req = new Request("http://_/index.html");
    const res1 = await serveAsset(req, { path: "/index.html" });
    assertEquals(res1.status, 302);
    assertEquals(res1.headers.get("location"), "http://_/");
  });

  await t.step("always 404 for .ts and .tsx files", async () => {
    chdir("test");
    let req = new Request("http://_/ts.ts");
    const res1 = await serveAsset(req, { path: "/ts.ts" });
    assertEquals(res1.status, 404);

    req = new Request("http://_/tsx.tsx");
    const res2 = await serveAsset(req, { path: "/tsx.tsx" });
    assertEquals(res2.status, 404);
  });

  await t.step("mimetypes", async () => {
    // Content-type determination is done by the std module, so I'm not going to
    // check all of them
    chdir("test");

    let req = new Request("http://_");
    const res1 = await serveAsset(req, { path: "/" });
    await res1.text(); // The bodies need to be consumed or the test will fail
    assertEquals(res1.headers.get("content-type"), "text/html");

    req = new Request("http://_/cool-plant.jpg");
    const res2 = await serveAsset(req, { path: "/cool-plant.jpg" });
    await res2.text();
    assertEquals(res2.headers.get("content-type"), "image/jpeg");

    req = new Request("http://_/css.css");
    const res3 = await serveAsset(req, { path: "/css.css" });
    await res3.text();
    assertEquals(res3.headers.get("content-type"), "text/css");

    req = new Request("http://_/js.js");
    const res4 = await serveAsset(req, { path: "/js.js" });
    await res4.text();
    assertEquals(res4.headers.get("content-type"), "application/javascript");
  });

  await t.step("etag", async () => {
    let req = new Request("http://_/cool-plant.jpg");
    const res1 = await serveAsset(req, { path: "/cool-plant.jpg" });
    await res1.text();
    const etag = res1.headers.get("etag")!;
    assertEquals(typeof etag, "string");

    req = new Request("http://_/cool-plant.jpg", {
      headers: { "if-none-match": etag },
    });
    const res2 = await serveAsset(req, { path: "/cool-plant.jpg" });
    assertEquals(res2.status, 304);
  });

  // TODO: https://github.com/connorlogin/cav/issues/36
});