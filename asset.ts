// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is server-only.

/// <reference lib="deno.unstable" />
 
// TODO: htmlBundler that supports snippets with <!-- @snip ../snippet.html -->
// TODO: Add an option to turn bundle watching off

import { fileServer, path, graph } from "./deps.ts";
import { NO_MATCH } from "./http.ts";
import { HttpError } from "./client.ts";

/** Options controlling how assets are found and served. */
export interface AssetOptions {
  /**
   * Sets the current working directory when looking for assets. If a file://
   * path is provided, the parent folder of the path is used. This is useful if
   * you want to serve assets relative to the current file using
   * `import.meta.url`. Default: `"."`
   */
  cwd?: string;
  /** The directory to serve assets from inside the cwd. Default: `"assets"` */
  dir?: string;
  /**
   * Path of the file to serve relative to the dir (which is relative to the
   * cwd). The full path of the file on disk can be conceptualized as
   * `denoPath.join(cwd, dir, path)`. This option is required, and should
   * typically be equal to the "path" property on the ResolverArg of an Rpc's
   * Resolver function or on the OnErrorArg inside an error handler.
   */
  path: string;
  /**
   * When a requested path resolves to a directory and one of these files is
   * found inside that directory, that file will be served instead of a 404
   * error. Default: `["index.html"]`
   */
  indexes?: string[];
  /**
   * When a requested file isn't found, each of these extensions will be
   * appended to the request path and checked for existence. If the request path
   * plus one of these extensions is found, that file will be served instead of
   * a 404 error. Default: `["html"]`
   */
  tryExtensions?: string[];
  /**
   * Path to use when the provided path results in a 404 error. Use this to
   * serve a 404 page. If this isn't specified, 404 errors will bubble. Default:
   * `undefined`
   */
  path404?: string;
  /**
   * Once a request's on-disk file path is calculated, the file path will be
   * passed through each of these provided bundlers. If a bundler returns a
   * Response, that Response will be served instead of the on-disk file and the
   * bundling process is halted. Bundlers are responsible for their own caching
   * techniques. If no array is specified, files are served as-is from disk.
   * Default: `undefined`
   */
  bundlers?: Bundler[];
}

/**
 * Bundlers, when provided to the assets() function, will receive the on-disk
 * path of a requested file. The bundler can then return null if it doesn't
 * apply to the requested file, or it can return a Response to serve instead of
 * using the standard library's fileServer to serve the file from disk. Bundlers
 * are responsible for handling their own caching techniques.
 */
export interface Bundler {
  (req: Request, filePath: string): Promise<Response | null> | Response | null;
}

/**
 * Response factory for serving static assets. Asset resolution uses the
 * provided AssetOptions, the Request is only used for caching headers like ETag
 * etc.
 */
export async function asset(
  req: Request,
  opt: AssetOptions,
): Promise<Response> {
  let cwd = opt.cwd || ".";
  const dir = opt.dir || "assets";
  const filePath = opt.path;
  const indexes = opt.indexes || ["index.html"];
  const tryExtensions = opt.tryExtensions || ["html"];
  const path404 = opt.path404;

  // This allows you to, for example, specify import.meta.url as a cwd. If cwd
  // is a file:// url, the last path segment (the basename of the "current"
  // typescript file) will be excluded
  if (cwd.startsWith("file://")) {
    cwd = path.join(path.fromFileUrl(cwd), "..");
  }

  // Wrap the processing procedure because it gets used multiple times when
  // there's a 404
  const process = async (filePath: string) => {
    // Get the full file path by joining the cwd, dir, and resolved path
    filePath = path.join(
      cwd,
      dir,
      path.resolve(path.join("/", filePath)),
    );
  
    // Look for the file to serve
    let fileInfo: Deno.FileInfo | null = null;
    try {
      fileInfo = await Deno.stat(filePath);
    } catch {
      // It didn't exist, try the extensions
      for (const ext of tryExtensions) {
        try {
          const p = `${filePath}.${ext}`;
          const info = await Deno.stat(p);
          if (info.isFile) {
            filePath = p;
            fileInfo = info;
            break;
          }
        } catch {
          continue;
        }
      }
    }
    if (fileInfo && fileInfo.isDirectory) {
      // It was a directory, look for index files
      for (const index of indexes) {
        try {
          const p = path.join(filePath, index);
          const info = await Deno.stat(p);
          if (info.isFile) {
            filePath = p;
            fileInfo = info;
            break;
          }
        } catch {
          continue;
        }
      }
    }
    if (fileInfo === null) {
      throw new HttpError("404 not found", { status: 404 });
    }
    
    // Bundling procedure
    if (opt.bundlers) {
      for (const b of opt.bundlers) {
        const resp = await b(req, filePath);
        if (resp) {
          return resp;
        }
      }
    }

    // Just serve the file if no bundlers took care of it
    try {
      return await fileServer.serveFile(req, filePath);
    } catch (e) {
      if (e.message === "404 not found") {
        throw new HttpError("404 not found", { status: 404 });
      }
      throw e;
    }
  };

  // Serve the asset. If the asset wasn't found and an error page was specified,
  // serve that instead. If that also wasn't found, throw a 500 error with
  // details
  try {
    return await process(filePath);
  } catch (e1) {
    if (e1 instanceof HttpError && e1.status === 404) {
      if (path404) {
        try {
          return await process(path404);
        } catch (e2) {
          throw new HttpError("Couldn't serve 404 error page", {
            status: 500,
            detail: { e1, e2 },
          });
        }
      }
      throw NO_MATCH;
    }
    throw e1;
  }
}

// Used below to cache the location of compiled typescript bundles, which are
// stored on disk as temporary files
const tsBundles = new Map<string, string>();
self.addEventListener("unload", () => {
  for (const [_, v] of tsBundles.entries()) {
    try {
      Deno.removeSync(v);
    } catch {
      // continue
    }
  }
});

/**
 * Constructs an asset Bundler for .ts and .tsx files. This uses Deno's runtime
 * compiler API under the hood, which requires the --unstable flag.
 * (https://deno.land/manual/typescript/runtime)
 *
 * Bundles are cached into temporary files on disk, which requires the
 * --allow-write flag. The temporary files are removed from disk when the server
 * process is asked to shut down gracefully.
 *
 * Files that get bundled will have themselves and their dependencies watched
 * for file changes using Deno.watchFs(). If changes are made and the file is
 * still present, its cached bundle will be rebuilt. If problems occur during
 * re-bundling, the cached bundle will be evicted and the bundle will be rebuilt
 * the next time it's requested.
 *
 * Bundled typescript can be imported with module script tags in HTML, like
 * this: `<script type="module" src="/bundle.ts"></script>`. The mime type will
 * be correctly served as "application/javascript", despite the extension. The
 * "lib" typescript option while bundling is equivalent to using the following
 * deno.json config:
 *
 * ```json
 * {
 *   "compilerOptions": {
 *     "lib": [
 *      "dom",
 *      "dom.iterable",
 *      "dom.asynciterable",
 *      "esnext"
 *     ]
 *   }
 * }
 * ```
 *
 * The typescript assets can be thought of as "gateways" into your client-side
 * application code. They can import from anywhere, not just the assets folder,
 * and all dependencies will be bundled into the served file. Take this into
 * account when thinking about code splitting; having multiple typescript asset
 * files include the same dependency means that dependency will be served
 * multiple times to the client, which will waste bandwidth. A good standard
 * practice would be to have just one bundle.ts file in your assets folder which
 * imports/exports everything the browser application needs.
 *
 * To avoid bundling a dependency, you can import it asynchronously using the
 * import() function. Dependencies imported this way will not be bundled in the
 * served file, but remember the importing happens inside the browser, which
 * follows different resolution rules; you won't be able to import files from
 * outside the assets folder like you can with regular imports. Tip: Top-level
 * await works in Deno, making it easy to import non-bundled dependencies in the
 * same place you import bundled dependencies. Like this:
 *
 * ```ts
 * // <root>/assets/bundle.ts
 * import { bundled1 } from "../outside/assets.ts";
 * import { bundled2 } from "https://null1.localhost/remote.ts";
 * const { notBundled1 } = await import("./inside/assets.ts");
 * const { notBundled2 } = await import("https://null2.localhost/remote.js");
 * // ... the rest of your browser code ...
 * ```
 *
 * Here's a list of every flag required for this to work:
 * - `--unstable` (required for Deno.emit(), which does the bundling)
 * - `--allow-net` (required by all of Cav)
 * - `--allow-read` (required whenever assets are served)
 * - `--allow-write` (required for writing the bundles to temporary files)
 */
export function tsBundler(): Bundler {
  return async (req: Request, filePath: string) => {
    const ext = path.extname(filePath);
    if (ext !== ".ts" && ext !== ".tsx") {
      return null;
    }

    let bundle = tsBundles.get(filePath) || "";
    if (bundle) {
      return await fileServer.serveFile(req, bundle);
    }

    const emit = async (filePath: string, overwrite?: string) => {
      const js = (await Deno.emit(filePath, {
        bundle: "module",
        check: false,
        compilerOptions: {
          // https://deno.land/manual@v1.19.2/typescript/configuration#using-the-lib-property
          lib: [
            "dom",
            "dom.iterable",
            "dom.asynciterable",
            "esnext",
          ],
        },
      })).files["deno:///bundle.js"];
      bundle = overwrite || await Deno.makeTempFile({ suffix: ".js" });
      await Deno.writeTextFile(bundle, js);
      tsBundles.set(filePath, bundle);

      // Watch for changes in any of the dependencies for the requested file. If
      // changes occur, re-create the bundle
      const fp = path.toFileUrl(filePath).href;
      const g = await graph.createGraph(fp);
      const depsList: string[] = g.modules
        .filter(m => m.specifier.startsWith("file://"))
        .map(m => path.fromFileUrl(m.specifier));

      (async () => {
        try {
          for await (const _ of Deno.watchFs(depsList)) {
            break;
          }
          console.log(
            `INFO: ${filePath} - Module updated, rebundling...`,
          );

          const evict = async () => {
            tsBundles.delete(filePath);
            try {
              await Deno.remove(bundle);
            } catch {
              // No need to do anything
            }
            console.log(`INFO: ${filePath} - Bundle evicted`);
          };

          try {
            const info = await Deno.stat(filePath);
            if (!info.isFile) {
              throw new Error("Original path is no longer a file");
            }
          } catch (e) {
            console.log(`INFO: ${filePath} - Failed to stat:`, e);
            await evict();
            return;
          }

          try {
            await emit(filePath, bundle);
          } catch (e) {
            console.log(`INFO: ${filePath} - Failed to bundle:`, e);
            await evict();
            return;
          }

          console.log(
            `INFO: ${filePath} - Rebundled successfully`,
          );
        } catch (e) {
          console.error(
            `ERROR: ${filePath} - File watcher threw an error:`,
            e
          );
        }
      })();

      return bundle;
    };
    
    return await fileServer.serveFile(req, await emit(filePath));
  };
}