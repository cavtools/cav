// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { fileServer, path } from "./deps.ts";
import { HttpError } from "./serial.ts";
import { routerContext, noMatch } from "./router.ts";

function parseCwd(cwd: string): string {
  if (cwd.startsWith("https://") || cwd.startsWith("http://")) {
    cwd = path.join(cwd, "..");
  } else if (cwd.startsWith("file://")) {
    cwd = path.join(path.fromFileUrl(cwd), "..");
  }
  return cwd;
}

/** Object denoting the location of an assets directory. */
export interface AssetsLocation {
  /**
   * Sets the current working directory when looking for the assets folder. If a
   * file://, http://, or https:// path is provided, the parent folder of the
   * path is used. This is useful if you want to serve assets relative to the
   * current file using `import.meta.url`. Default: `"."`
   */
   cwd?: string;
   /**
    * The path of the assets directory relative to the cwd. This pattern
    * encourages keeping public asset files separated from application source
    * code, so that code isn't processed by mistake. Default: `"assets"`
    */
   dir?: string;
}

/** Options controlling how assets are found and served. */
export interface ServeAssetOptions extends AssetsLocation {
  /**
   * The path of the file to serve inside the assets directory. If this isn't
   * provided, the routed path from the RouterContext associated with the
   * request will be used.
   */
  path?: string;
}

// When a requested path without a trailing slash resolves to a directory and
// that directory has an index file in it, relative links in the html need to be
// rewritten to account for the lack of trailing slash. This regex is used to
// rewrite them.
const htmlRelativeLinks =
  /<[a-z\-]+(?:\s+[a-z\-]+(?:(?:=".*")|(?:='.*'))?\s*)*\s+((?:href|src)=(?:"\.\.?\/.*?"|'\.\.?\/.*?'))(?:\s+[a-z\-]+(?:(?:=".*")|(?:='.*'))?\s*)*\/?>/g;

/**
 * Response factory for serving static assets. Asset resolution uses the
 * provided ServeAssetOptions, the Request is only used for caching headers like
 * ETag etc.
 */
export async function serveAsset(
  req: Request,
  opt?: ServeAssetOptions,
): Promise<Response> {
  const ctx = routerContext(req);
  const url = ctx.url;
  let pathname = opt?.path || ctx.path;

  // Special rules for serving files. To opt out, specify the path directly on
  // the options
  if (!opt?.path) {
    const parts = pathname.split("/");
    for (const p of parts) {
      if (p.startsWith(".")) {
        return noMatch(new Response("404 not found", { status: 404 }));
      }
    }
  }

  const cwd = parseCwd(opt?.cwd || ".");
  const dir = opt?.dir || "assets";

  try {
    let filePath = path.join(
      cwd,
      dir,
      path.join("/", pathname),
    );

    let fileInfo: Deno.FileInfo | null = null;
    try {
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

    const res = await fileServer.serveFile(req, filePath);

    // FIXME: The media_types module the file_server uses is behind a little, it
    // uses application/javascript but that's no longer the standard:
    // https://2ality.com/2022/05/rfc-9239.html. Deno relies on a vendored copy
    // of https://github.com/jshttp/mime-db to determine the correct type, and
    // Doug Wilson hasn't been able to update it because nginx and apache are
    // being slow to update. There's an issue open about this, when it closes
    // and Deno pulls the updates it should be safe to remove this next
    // conditional (not that it's really needed in the first place):
    // https://github.com/jshttp/mime-db/issues/266
    if (res.headers.get("content-type")?.startsWith("application/javascript")) {
      res.headers.set("content-type", "text/javascript; charset=UTF-8");
    }

    if (
      !wasAutoIndexed || // It wasn't an index file from a nested directory
      !res.body // It was a 304 response
    ) {
      return res;
    }

    // Index relative link rebasing for index.html files inside nested folders

    const basename = path.basename(url.pathname);
    let content = await res.text();

    content = content.replaceAll(htmlRelativeLinks, (match, group) => {
      const newGroup = group.replace(
        /^(?:src|href)=(?:"|')(\..*)(?:"|')$/g,
        (m: string, g: string) =>
          m.replace(
            g,
            (
              // TODO: This isn't complete. Make a note in the docs about
              // trailing slashes
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

    res.headers.delete("content-length");
    return new Response(content, { headers: res.headers });
  } catch (e1) {
    if (e1 instanceof HttpError && e1.status === 404) {
      return noMatch(new Response("404 not found", { status: 404 }));
    }
    throw e1;
  }
}

// // async function findModules(dir: string) {
// //   const modules: string[] = [];
// //   for await (const entry of Deno.readDir(dir)) {
// //     if (entry.isFile && (
// //       entry.name.endsWith(".ts") ||
// //       entry.name.endsWith(".tsx")
// //     )) {
// //       modules.push(path.join(dir, entry.name));
// //     } else if (entry.isDirectory) {
// //       modules.push(...(await findModules(path.join(dir, entry.name))));
// //     }
// //   }
// //   return modules;
// // }

// /** Writes the output to `${input}.js`. */
// async function bundle(input: string) {
//   const output = input + ".js";

//   const js = (await emit.bundle(input, {
//     allowRemote: true,
//     type: "module",
//     compilerOptions: {
//       inlineSources: false,
//       inlineSourceMap: false,
//       sourceMap: false,
//     },
//   })).code;

//   await Deno.writeTextFile(output, js);
// }

// /**
//  * Bundles every bundle.ts(x) or *_bundle.ts(x) file in the folder into an
//  * adjacent file with the same name plus a .js suffix, recursively.
//  *
//  * The path to the assets directory is specified with the optional `cwd` and
//  * `dir` options. The default is `{ cwd: ".", dir: "assets" }`. (Tip:
//  * `import.meta.url` can be specified as a `cwd`.)
//  *
//  * If the --unstable or --allow-write permissions are not available, an error
//  * will be thrown. If the `ignoreErrors` option is true, the error will be
//  * suppressed.
//  */
// export async function prepareAssets(loc?: AssetsLocation) {
//   const cwd = parseCwd(loc?.cwd || ".");
//   const dir = loc?.dir || "assets";
//   const assets = path.join(cwd, dir);

//   const check = await Deno.stat(assets);
//   if (!check.isDirectory) {
//     throw new Error(`path given is not a directory: ${assets}`);
//   }

//   const modules = await findModules(assets);
//   for (const m of modules) {
//     await bundle(m);
//   }
// }

// interface CloseableFsWatcher extends AsyncIterable<Deno.FsEvent | "close"> {
//   close: () => void;
// }

// function closableFsWatcher(paths: string | string[]) {
//   const fsWatcher = Deno.watchFs(paths);
//   const fsIter = fsWatcher[Symbol.asyncIterator]();
//   let closeWatcher = () => {};
//   const closeWatcherPromise = new Promise<{ value: "close" }>(res => {
//     closeWatcher = () => res({ value: "close" });
//   });
  
//   return {
//     [Symbol.asyncIterator]: () => ({
//       next: () => Promise.race([fsIter.next(), closeWatcherPromise]),
//     }),
//     close: () => {
//       fsWatcher.close();
//       closeWatcher();
//     },
//   };
// }

// interface Watcher {
//   root: CloseableFsWatcher;
//   files: Map<string, CloseableFsWatcher>;
// }

// const watching = new Map<string, Watcher>();

// /** Options for the `watchAssets()` function. */
// export interface WatchAssetsOptions extends AssetsLocation {
//   /**
//    * If this is true and an error occurs during the initial asset preparation
//    * loop (due to insufficient permissions, for example), the error will be
//    * suppressed and asset watching will fail silently.
//    */
//   failSilently?: boolean;
// }

// /**
//  * Prepares the assets directory and watches it for changes to the ts(x) bundles
//  * or their dependencies. When a change occurs, the bundles will be rebuilt. 
//  *
//  * The path to the assets directory is specified with the optional `cwd` and
//  * `dir` options. The default is `{ cwd: ".", dir: "assets" }`. (Tip:
//  * `import.meta.url` can be specified as a `cwd`.)
//  *
//  * If the --unstable or --allow-write permissions are not available, an error
//  * will be thrown. If the `ignoreErrors` option is true, the error will be
//  * suppressed.
//  */
//  export async function watchAssets(opt?: WatchAssetsOptions) {
//   const cwd = parseCwd(opt?.cwd || ".");
//   const dir = opt?.dir || "assets";
//   const assets = path.join(cwd, dir);
//   if (watching.has(assets)) {
//     return;
//   }

//   const watcher: Watcher = {
//     root: closableFsWatcher(assets),
//     files: new Map<string, CloseableFsWatcher>(),
//   };
//   watching.set(assets, watcher);

//   const watch = async (input: string, skipBundle?: boolean) => {
//     input = path.resolve(input);
//     if (watcher.files.has(input)) {
//       return;
//     }

//     if (!skipBundle) {
//       try {
//         await bundle(input);
//       } catch (e) {
//         console.warn("Failed to bundle", input, "-", e.message);
//         return;
//       }
//     }

//     let inputGraph: graph.ModuleGraph;
//     try {
//       inputGraph = await graph.createGraph(
//         path.toFileUrl(input).href,
//       );
//     } catch (e) {
//       console.warn("Failed to graph", input, "-", e);
//       return;
//     }

//     const deps = inputGraph.modules
//       .filter((m) => m.specifier.startsWith("file://"))
//       .map((m) => path.fromFileUrl(m.specifier));

//     const fsw = closableFsWatcher(deps);
//     watcher.files.set(input, fsw);

//     let closed = false;
//     for await (const evt of fsw) {
//       if (evt === "close") {
//         closed = true;
//       }
//       break;
//     }
//     watcher.files.delete(input);
//     if (!closed) {
//       watch(input); // Don't await
//     }
//   };

//   try {
//     await prepareAssets({ ...opt });
//     const modules = await findModules(assets);
//     for (const m of modules) {
//       // The true skips the initial bundling since prepareAssets just did it
//       watch(m, true); // Don't await
//     }
//   } catch (err) {
//     watcher.root.close();
//     watching.delete(assets);
//     if (opt?.failSilently) {
//       return;
//     } else {
//       throw err;
//     }
//   }

//   // Disjoint fs event loop. When the watchAssets function is awaited, the
//   // promise it returns will be resolved after the initial preparation is
//   // complete
//   (async () => {
//     for await (const event of watcher.root) {
//       if (event === "close") {
//         break;
//       }
//       if (event.kind === "create" || event.kind === "modify") {
//         for (const p of event.paths) {
//           if (p.endsWith(".ts") || p.endsWith(".tsx")) {
//             watch(p); // Don't await
//           }
//         }
//       }
//     }
//   })();
// }

// /**
//  * Stops watching an assets directory that was prepared with `watchAssets()`. If
//  * the directory wasn't being watched, this is a no-op. If no location object is
//  * provided, all watched directories will be unwatched. If an empty object is
//  * provided, "./assets" will be unwatched.
//  */
// export function unwatchAssets(loc?: AssetsLocation) {
//   if (!loc) {
//     for (const [k, v] of watching.entries()) {
//       v.root.close();
//       for (const [k2, v2] of v.files.entries()) {
//         v2.close();
//         v.files.delete(k2);
//       }
//       watching.delete(k);
//     }
//     return;
//   }

//   const cwd = parseCwd(loc.cwd || ".");
//   const dir = loc.dir || "assets";
//   const assets = path.join(cwd, dir);
//   const watcher = watching.get(assets);
//   if (watcher) {
//     watcher.root.close();
//     for (const [k, v] of watcher.files.entries()) {
//       v.close();
//       watcher.files.delete(k);
//     }
//     watching.delete(assets);
//   }
// }