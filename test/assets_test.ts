// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { path } from "../deps.ts";
import {
  serveAsset,
  prepareAssets,
  watchAssets,
  unwatchAssets,
} from "../assets.ts";
import { assertEquals } from "./deps.ts";
import { didMatch } from "../router.ts";

// Used in endpoints_test.ts
export function chdir(which: "root" | "test") {
  const testDir = path.dirname(path.fromFileUrl(import.meta.url));
  if (which === "test") {
    Deno.chdir(testDir);
    return;
  }
  Deno.chdir(path.join(testDir, ".."));
}

// Used in endpoints_test.ts
export async function cleanAssets() {
  chdir("test");
  const files = [
    "root_bundle.tsx.js",
    "assets/bundle.ts.js",
    "assets/bundle.tsx.js",
  ];
  for (const f of files) {
    try {
      await Deno.remove(path.join("./assets", f));
    } catch {
      // continue
    }
  }
}

Deno.test("serveAsset()", async t => {
  await t.step("always 404s for files that start with .", async () => {
    chdir("test");
    const req1 = new Request("http://_/.template.html");
    const res1 = await serveAsset(req1);
    assertEquals(res1.status, 404);
  });

  await t.step("skips special serving rules with explicit path", async () => {
    chdir("test");
    const req1 = new Request("http://_/.template.html");
    const res1 = await serveAsset(req1, { path: "/.template.html" });
    assertEquals(res1.status, 200);
  });

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

  await t.step("requests to .ts(x) files without explicit path", async () => {
    chdir("test");
    let req = new Request("http://_/ts.ts");
    const res1 = await serveAsset(req);
    assertEquals(res1.status, 404);

    req = new Request("http://_/tsx.tsx");
    const res2 = await serveAsset(req);
    assertEquals(res2.status, 404);
  });

  await t.step("mimetypes", async () => {
    // Content-type determination is done by the std module, so I'm not going to
    // check all of them
    chdir("test");

    let req = new Request("http://_");
    const res1 = await serveAsset(req);
    await res1.text(); // The bodies need to be consumed or the test will fail
    assertEquals(res1.headers.get("content-type"), "text/html; charset=UTF-8");

    req = new Request("http://_/cool-plant.jpg");
    const res2 = await serveAsset(req);
    await res2.text();
    assertEquals(res2.headers.get("content-type"), "image/jpeg");

    req = new Request("http://_/css.css");
    const res3 = await serveAsset(req);
    await res3.text();
    assertEquals(res3.headers.get("content-type"), "text/css; charset=UTF-8");

    req = new Request("http://_/js.js");
    const res4 = await serveAsset(req);
    await res4.text();
    assertEquals(res4.headers.get("content-type"), "application/javascript");
  });

  await t.step("etag", async () => {
    let req = new Request("http://_/cool-plant.jpg");
    const res1 = await serveAsset(req);
    await res1.text();
    const etag = res1.headers.get("etag")!;
    assertEquals(typeof etag, "string");

    req = new Request("http://_/cool-plant.jpg", {
      headers: { "if-none-match": etag },
    });
    const res2 = await serveAsset(req);
    assertEquals(res2.status, 304);
  });

  // TODO: https://github.com/connorlogin/cav/issues/36
});

Deno.test("prepareAssets()", async t => {
  await t.step("no arguments", async () => {
    chdir("test");
    await cleanAssets();

    await prepareAssets();
    await Deno.stat("./assets/root_bundle.tsx.js");
    await Deno.stat("./assets/assets/bundle.ts.js");
    await Deno.stat("./assets/assets/bundle.tsx.js");

    await cleanAssets();
  });

  await t.step("cwd", async () => {
    chdir("root");
    await cleanAssets();

    await prepareAssets({ cwd: import.meta.url });
    await Deno.stat("./assets/root_bundle.tsx.js");
    await Deno.stat("./assets/assets/bundle.ts.js");
    await Deno.stat("./assets/assets/bundle.tsx.js");

    await cleanAssets();
  });

  await t.step("doesn't bundle unsuffixed ts(x) files", async () => {
    chdir("test");
    await cleanAssets();

    await prepareAssets();
    const check = [
      "./assets/ts.ts.js",
      "./assets/tsx.tsx.js",
    ];
    for (const c of check) {
      try {
        await Deno.stat(c);
      } catch {
        continue;
      }
      throw new Error(`It bundled ${c} when it shouldn't have`);
    }

    await cleanAssets();
  });
});