// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is server-only.

import { path, graph } from "./deps.ts";

// TODO: Add the ability to modify the lib used during bundling
// TODO: Add the "unsafeInput" and "unsafeOutput" options, see the todo above
// serveAsset in http.ts
/**  Options for bundling TypeScript and JavaScript browser assets. */
export interface BundleScriptOptions {
  /**
   * Sets the current working directory when resolving the path of the
   * TypeScript file. If a "file://" path is specified (e.g. when using
   * import.meta.url), the cwd will be the parent folder of that path.  
   * Default: "."
   */
  cwd?: string;
  /**
   * The path to the input TypeScript or JavaScript file, relative to the cwd.
   */
  input: string;
  /** The path to the output JavaScript, relative to the cwd. */
  output: string;
  /**
   * If true, sets up a Deno.watchFs() file watcher that will rebundle whenever
   * the file or its dependencies have been modified. Default: "false"
   */
  watch?: boolean;
  /**
   * If this is true, errors will not be logged to the console and will instead
   * be ignored silently. Default: `false`
   */
  silent?: boolean;
}

/**
 * Bundles JavaScript and TypeScript files into a single JavaScript file, with
 * the ability to watch for file changes to trigger a re-bundle. The file and
 * all of its dependencies will be included in the bundle. Bundling uses Deno's
 * [runtime compiler API](https://deno.land/manual@main/typescript/runtime)
 * behind-the-scenes. There is no checking of types (they are simply discarded),
 * and the "lib" typescript option while bundling is equivalent to the following
 * deno.json config:
 *
 * ```json
 * {
 *   "compilerOptions": {
 *     "lib": [
 *       "dom",
 *       "dom.iterable",
 *       "dom.asynciterable",
 *       "esnext"
 *     ]
 *   }
 * }
 * ```
 *
 * Note that dependencies imported using the async `import()` API will not be
 * bundled. Like this:
 *
 * ```ts
 * // Input (this file): <root>/browser/main.ts</root>
 * // Output: <root>/assets/bundle.js
 * import { bundled1 } from "./deps.ts";
 * import { bundled2 } from "https://null1.localhost/remote.ts";
 * const { notBundled1 } = await import("./vendor/some-lib.js");
 * const { notBundled2 } = await import("https://null2.localhost/remote.js");
 * // ... the rest of your browser code ...
 * ```
 *
 * Errors during bundling will be logged to the console unless the `silent`
 * option is true. Despite the return value, the bundling procedure is
 * asynchronous.
 */
export function bundleScript(opt: BundleScriptOptions): void {
  const cwd = (
    opt.cwd?.startsWith("file://") ? (
      path.resolve(path.fromFileUrl(opt.cwd), "..")
    )
    : opt.cwd || "."
  );
  const i = path.resolve(cwd, opt.input);
  const o = path.resolve(cwd, opt.output);

  const rebundleOnUpdate = async () => {
    let g: graph.ModuleGraph | null = null;
    try {
      g = await graph.createGraph(path.toFileUrl(i).href);
    } catch {
      // continue;
    }
    
    const deps = !g ? [i] : g.modules
      .filter(m => m.specifier.startsWith("file://"))
      .map(m => path.fromFileUrl(m.specifier));

    try {
      for await (const _ of Deno.watchFs(deps)) {
        break;
      }
    } catch (e) {
      if (!opt.silent) {
        console.error(
          `ERROR: Fatal error while watching for bundle updates (bundling will not be re-attempted):`,
          e,
        );
      }
      return;
    }

    if (!opt.silent) {
      console.log(
        `INFO: ${i} - Module updated, rebundling...`,
      );
    }
    bundleScript(opt);
  };

  (async () => {
    try {
      const js = (await Deno.emit(i, {
        bundle: "module",
        check: false,
        // https://deno.land/manual@v1.19.2/typescript/configuration#using-the-lib-property
        compilerOptions: {
          lib: [
            "dom",
            "dom.iterable",
            "dom.asynciterable",
            "esnext",
          ],
        },
      })).files["deno:///bundle.js"];

      await Deno.writeTextFile(o, js);
      if (!opt.silent) {
        console.log(`INFO: ${i} - Bundled`);
      }
    } catch (e) {
      if (!opt.silent && !opt.watch) {
        console.error(`ERROR: ${i} - Bundle error:`, e);
      } else if (!opt.silent) {
        console.error(`ERROR: ${i} - Bundle error (waiting for updates):`, e);
      }
    }

    if (opt.watch) {
      rebundleOnUpdate();
    }
  })();
}
