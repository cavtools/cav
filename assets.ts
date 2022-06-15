// Copyright 2022 Connor Logan. All rights reserved. MIT License.

// TODO: Add option for source maps for prepared bundles

import { fileServer, graph, path, emit } from "./deps.ts";
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
    if (
      !p.wasAutoIndexed || // It wasn't an index file from a nested directory
      !originalResponse.body || // It was a 304 response
      url.pathname.endsWith("/") // It didn't come from a router
    ) {
      return originalResponse;
    }

    // This is where nested folder index.html relative link rebasing happens

    const basename = path.basename(url.pathname);
    let content = await originalResponse.text();

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

async function findModules(dir: string) {
  const modules: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && (
      entry.name === "bundle.ts" ||
      entry.name === "bundle.tsx" ||
      entry.name.endsWith("_bundle.ts") ||
      entry.name.endsWith("_bundle.tsx")
    )) {
      modules.push(path.join(dir, entry.name));
    } else if (entry.isDirectory) {
      modules.push(...(await findModules(path.join(dir, entry.name))));
    }
  }

  return modules;
}

/** Writes the output to `${input}.js`. */
async function bundle(input: string) {
  const output = input + ".js";

  const js = (await emit.bundle(input, {
    allowRemote: true,
    type: "module",
  })).code;

  await Deno.writeTextFile(output, js);
}

/** Options for `prepareAssets()` and `watchAssets()`. */
export interface PrepareAssetsOptions {
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
    * If this is true, any errors that occur will be silently suppressed.
    */
   ignoreErrors?: boolean;
   /**
    * If this is true, any console warnings that would've occurred will be
    * suppressed.
    */
   // ignoreWarnings?: boolean;
}

/**
 * Bundles every bundle.ts(x) or *_bundle.ts(x) file in the folder into an
 * adjacent file with the same name plus a .js suffix, recursively. The bundles
 * will be compiled with `lib`s targeting the browser.
 *
 * The path to the assets directory is specified with the optional `cwd` and
 * `dir` options. The default is `{ cwd: ".", dir: "assets" }`. (Tip:
 * `import.meta.url` can be specified as a `cwd`.)
 *
 * If the --unstable or --allow-write permissions are not available, an error
 * will be thrown. If the `ignoreErrors` option is true, the error will be
 * suppressed.
 */
export async function prepareAssets(opt?: PrepareAssetsOptions) {
  const cwd = parseCwd(opt?.cwd || ".");
  const dir = opt?.dir || "assets";
  const assets = path.join(cwd, dir);

  try {
    const check = await Deno.stat(assets);
    if (!check.isDirectory) {
      throw new Error(`path given is not a directory: ${assets}`);
    }

    const modules = await findModules(assets);
    for (const m of modules) {
      await bundle(m);
    }
  } catch (err) {
    if (!opt?.ignoreErrors) {
      throw err;
    }
  }
}

const watchingAssets = new Set<string>();

/**
 * Prepares the assets directory using `prepareAssets()` and watches it for
 * changes to the ts(x) bundles or their dependencies. When a change occurs, the
 * bundles will be rebuilt. 
 *
 * The path to the assets directory is specified with the optional `cwd` and
 * `dir` options. The default is `{ cwd: ".", dir: "assets" }`. (Tip:
 * `import.meta.url` can be specified as a `cwd`.)
 *
 * If the --unstable or --allow-write permissions are not available, an error
 * will be thrown. If the `ignoreErrors` option is true, the error will be
 * suppressed.
 */
 export async function watchAssets(opt?: PrepareAssetsOptions) {
  const cwd = parseCwd(opt?.cwd || ".");
  const dir = opt?.dir || "assets";
  const assets = path.join(cwd, dir);
  if (watchingAssets.has(assets)) {
    return;
  }

  const isFile = async (path: string) => {
    try {
      const check = await Deno.stat(path);
      return check.isFile;
    } catch {
      return false;
    }
  };

  const watching = new Set<string>();
  const watch = async (input: string, skipBundle?: boolean) => {
    input = path.resolve(input);
    if (!await isFile(input)) {
      watching.delete(input);
      return;
    }
    if (watching.has(input)) {
      return;
    }
    watching.add(input);

    if (!skipBundle) {
      try {
        await bundle(input);
      } catch (e) {
        console.warn("Failed to bundle", input, "-", e);
        watching.delete(input);
        return;
      }
    }

    let inputGraph: graph.ModuleGraph;
    try {
      inputGraph = await graph.createGraph(
        path.toFileUrl(input).href,
      );
    } catch (e) {
      console.warn("Failed to graph", input, "-", e);
      watching.delete(input);
      return;
    }

    // Wait for a change in the module or one of its dependencies
    const deps = inputGraph.modules
      .filter((m) => m.specifier.startsWith("file://"))
      .map((m) => path.fromFileUrl(m.specifier));
    for await (const _ of Deno.watchFs(deps)) {
      break;
    }

    // Delete it first to skip the redundancy check at the beginning and force a
    // rebundle
    watching.delete(input);

    // Keep watching if it's still a file
    if (await isFile(input)) {
      watch(input); // Don't await
    }
  };

  try {
    await prepareAssets({ ...opt, ignoreErrors: false });
  } catch (err) {
    if (!opt?.ignoreErrors) {
      throw err;
    }
    return;
  }

  watchingAssets.add(assets);
  const modules = await findModules(assets);
  for (const m of modules) {
    // The true skips the initial bundling since prepareAssets just did it
    watch(m, true); // Don't await
  }

  // The disjoint fsevent loop that watches for new files being added. Wrapped
  // in an IIFE so it doesn't block
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