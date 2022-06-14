// Copyright 2022 Connor Logan. All rights reserved. MIT License.

// TODO: Add option for source maps for prepared bundles

import { fileServer, graph, path } from "./deps.ts";
import { HttpError } from "./serial.ts";
import { noMatch } from "./router.ts";

/** Options controlling how assets are found and served. */
export interface ServeAssetOptions {
  /**
   * Sets the current working directory when looking for the asset directory. If
   * a file:// path is provided, the parent folder of the path is used. This is
   * useful if you want to serve assets relative to the current file using
   * `import.meta.url`. Default: `"."`
   */
  cwd?: string;
  /**
   * The directory to serve assets from inside the cwd. This pattern encourages
   * keeping public asset files separated from source code, so that code isn't
   * served by mistake. Default: `"assets"`
   */
  dir?: string;
  /**
   * Path of the file to serve relative to the assets folder. (Required)
   */
  path: string;
}

// When a requested path without a trailing slash resolves to a directory and
// that directory has an index file in it, relative links in the html need to be
// rewritten to account for the lack of trailing slash. This regex is used to
// rewrite them.
const htmlRelativeLinks =
  /<[a-z\-]+(?:\s+[a-z\-]+(?:(?:=".*")|(?:='.*'))?\s*)*\s+((?:href|src)=(?:"\.\.?\/.*?"|'\.\.?\/.*?'))(?:\s+[a-z\-]+(?:(?:=".*")|(?:='.*'))?\s*)*\/?>/g;

function parseCwd(cwd: string): string {
  // REVIEW: What about /https?:/// ?
  if (cwd.startsWith("file://")) {
    return path.join(path.fromFileUrl(cwd), "..");
  }
  return cwd;
}

/**
 * Response factory for serving static assets. Asset resolution uses the
 * provided ServeAssetOptions, the Request is only used for caching headers like
 * ETag etc.
 *
 * TypeScript (ts & tsx) assets will not be served. They will be treated as if
 * they don't exist.
 *
 * If the --unstable and --allow-write permissions are granted, the asset
 * preparation procedure will be started for the given assets directory, if it
 * hasn't already been started by a previous request. See the `prepareAssets()`
 * function for more information.
 */
export async function serveAsset(
  req: Request,
  opt: ServeAssetOptions,
): Promise<Response> {
  // If the request path ends in /index.html, redirect to the version without
  // the /index.html  
  // REVIEW: I feel like I might be missing some edge cases where this behavior
  // is undesireable, due to the fact the path option and the requested path
  // might not be the same
  const url = new URL(req.url);
  if (url.pathname.endsWith("/index.html")) {
    url.pathname = path.dirname(url.pathname);
    return Response.redirect(url.href, 302);
  }

  const cwd = parseCwd(opt.cwd || ".");
  const dir = opt.dir || "assets";
  const filePath = opt.path;

  // NOTE: This is a no-op in production, and calling it multiple times with the
  // watch option should be safe. Slight overhead  
  // TODO: Benchmark the overhead to see if it's worth rethinking this (doubt
  // it)
  prepareAssets({
    cwd,
    dir,
    watch: true,
  });

  const process = async (filePath: string) => {
    filePath = path.join(
      cwd,
      dir,
      path.join("/", filePath),
    );

    let fileInfo: Deno.FileInfo | null = null;
    try {
      if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
        throw new Error(".ts and .tsx files are always ignored");
      }

      fileInfo = await Deno.stat(filePath);
    } catch {
      try {
        const p = `${filePath}.html`;
        const info = await Deno.stat(p);
        if (info.isFile) {
          filePath = p;
          fileInfo = info;
        }
      } catch {
        // continue
      }
    }

    let wasAutoIndexed = false;
    if (fileInfo && fileInfo.isDirectory) {
      fileInfo = null;
      try {
        const p = path.join(filePath, "index.html");
        const info = await Deno.stat(p);
        if (info.isFile) {
          filePath = p;
          fileInfo = info;
          wasAutoIndexed = true;
        }
      } catch {
        // continue
      }
    }

    if (fileInfo === null) {
      throw new HttpError("404 not found", { status: 404 });
    }

    return { servePath: filePath, wasAutoIndexed };
  };

  let servePath = "";
  try {
    const p = await process(filePath);
    servePath = p.servePath;
    const originalResponse = await fileServer.serveFile(req, servePath);

    // REVIEW: Still not sure if rebasing index files is a good idea or not

    const url = new URL(req.url);
    if (!p.wasAutoIndexed || url.pathname.endsWith("/")) {
      return originalResponse;
    }

    const basename = path.basename(url.pathname);
    let content = await Deno.readTextFile(servePath);

    content = content.replaceAll(htmlRelativeLinks, (match, group) => {
      const newGroup = group.replace(
        /^(?:src|href)=(?:"|')(\..*)(?:"|')$/g,
        (m: string, g: string) =>
          m.replace(
            g,
            (
              // TODO: This isn't complete. Make a note in the docs about trailing
              // slashes
              g.startsWith("./")
                ? `./${basename}/${g.slice(2)}`
                : g.startsWith("../")
                ? `./${g.slice(3)}`
                : g
            ),
          ),
      );
      return match.replace(group, newGroup);
    });

    originalResponse.headers.delete("content-length");
    return new Response(content, { headers: originalResponse.headers });
  } catch (e1) {
    if (e1 instanceof HttpError && e1.status === 404) {
      return noMatch(new Response("404 not found", { status: 404 }));
    }
    throw e1;
  }
}

const watchingAssets = new Set<string>();

/**
 * Asset preparation procedure that does the following:
 *
 * - Bundles every bundle.ts(x) or *_bundle.ts(x) file in the folder (recursive)
 *   into an adjacent file with the same name plus a .js suffix
 * - Optionally uses a filesystem watcher to rebundle whenever a change is made
 *   to a _bundle file or one of its local dependencies.
 *
 * When the watch option is `true`, any errors encountered during bundling will
 * be logged and suppressed, and the `prepareAssets()` call will start a file
 * system watching event loop that re-triggers asset preparation whenever a file
 * changes inside the assets directory. It will return immediately after the
 * initial prep.
 *
 * If the --unstable or --allow-write permissions are not available, this
 * function silently does nothing. i.e. In production, you can safely omit those
 * flags and still call this function; no errors will be thrown.
 */
export async function prepareAssets(opt: {
  /**
   * Sets the current working directory when looking for the assets folder. If a
   * file:// path is provided, the parent folder of the path is used. This is
   * useful if you want to serve assets relative to the current file using
   * `import.meta.url`. Default: `"."`
   */
  cwd?: string;
  /**
   * The path of the assets directory relative to the cwd. This pattern
   * encourages keeping public asset files separated from application source
   * code, so that code isn't processed by mistake. Default: `"assets"`
   */
  dir?: string;
  /**
   * By default, any errors encountered during bundling will bubble up and the
   * preparation procedure will only happen one time. If this option is `true`,
   * errors will be logged and then suppressed, and a file system watcher will
   * be set up to re-prepare the assets directory any time its contents are
   * modified. The `prepareAssets()` function will return immediately after the
   * initial loop, and the watcher will continue running in a disjoint event
   * loop. It's safe to `prepareAssets({ watch: true })` multiple times for the
   * same assets directory; subsequent calls will be no-ops.
   */
  watch?: boolean;
}) {
  const cwd = parseCwd(opt.cwd || ".");
  const dir = opt.dir || "assets";
  const assets = path.join(cwd, dir);

  if (
    // @ts-ignore: emit won't compile without "--unstable"
    typeof Deno.emit === "undefined" ||
    (opt.watch && watchingAssets.has(assets)) ||
    (await Deno.permissions.query({
      name: "write",
      path: assets,
    })).state !== "granted"
  ) {
    return;
  }

  const check = await Deno.stat(assets);
  if (!check.isDirectory) {
    throw new Error(`path given is not a directory: ${assets}`);
  }

  const modules: string[] = [];
  const findModules = async (dir: string) => {
    for await (const entry of Deno.readDir(dir)) {
      if (
        entry.isFile &&
          (
            entry.name.endsWith("_bundle.ts") ||
            entry.name.endsWith("_bundle.tsx")
          ) ||
        (
          entry.name === "bundle.ts" ||
          entry.name === "bundle.tsx"
        )
      ) {
        modules.push(path.join(dir, entry.name));
      } else if (entry.isDirectory) {
        await findModules(path.join(dir, entry.name));
      }
    }
  };
  await findModules(dir);

  const bundle = async (input: string) => {
    const output = input + ".js";

    // @ts-ignore: Bypass error when --unstable isn't specified
    const js = (await Deno.emit(input, {
      bundle: "module",
      check: false,
      compilerOptions: {
        lib: [
          "dom",
          "dom.iterable",
          "dom.asynciterable",
          "esnext",
        ],
      },
    })).files["deno:///bundle.js"];

    await Deno.writeTextFile(output, js);
  };

  const isFile = async (path: string) => {
    try {
      const check = await Deno.stat(path);
      return check.isFile;
    } catch {
      return false;
    }
  };

  const watching = new Set<string>();
  const watch = async (input: string) => {
    input = path.resolve(input);
    if (watching.has(input)) {
      return;
    }

    if (!await isFile(input)) {
      watching.delete(input);
      return;
    }
    watching.add(input);

    let inputGraph: graph.ModuleGraph;
    try {
      inputGraph = await graph.createGraph(
        path.toFileUrl(input).href,
      );
    } catch (e) {
      console.error("Failed to graph", input, "-", e);
      watching.delete(input);
      return;
    }

    const deps = inputGraph.modules
      .filter((m) => m.specifier.startsWith("file://"))
      .map((m) => path.fromFileUrl(m.specifier));

    try {
      await bundle(input);
    } catch (e) {
      console.error("Failed to bundle", input, "-", e);
    }

    for await (const _ of Deno.watchFs(deps)) {
      break;
    }

    if (!await isFile(input)) {
      watching.delete(input);
      return;
    }

    watching.delete(input);
    watch(input); // Don't await
  };

  if (opt.watch) {
    watchingAssets.add(dir);
  }

  for (const m of modules) {
    if (!opt.watch) {
      await bundle(m);
    } else {
      watch(m); // Don't await
    }
  }

  if (!opt.watch) {
    return;
  }

  // The disjoint fsevent loop. Wrapped in an IIFE so it doesn't block
  (async () => {
    for await (const event of Deno.watchFs(dir)) {
      if (event.kind === "create" || event.kind === "modify") {
        for (const p of event.paths) {
          if (p.endsWith("_bundle.ts") || p.endsWith("_bundle.tsx")) {
            watch(p); // Don't await
          }
        }
      }
    }
  })();
}