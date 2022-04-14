// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is server-only.

// TODO: Consider adding esbuild or some other deno-compatible bundler as a
// dependency

import { path, graph } from "./deps.ts";

/**  Options for bundling TypeScript and JavaScript browser assets. */
export interface BundleScriptOptions {
  /**
   * Sets the current working directory when resolving the path of the
   * file to bundle. If a "file://" path is specified (e.g. when using
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
   * If true, sets up a Deno.watchFs() file watcher that will rebundle the input
   * whenever the file or its dependencies have been modified. Default: "false"
   */
  watch?: boolean;
}

// TODO: Allow modifying the compilerOptions, bundle type, checkJs, and import
// maps  
/**
 * Bundles browser-only JavaScript and TypeScript files into a single JavaScript
 * output, with the ability to watch the module graph for changes to trigger a
 * re-bundle. The input file and all of its dependencies will be included in the
 * bundle. Bundling uses Deno's [runtime compiler
 * API](https://deno.land/manual@main/typescript/runtime) behind-the-scenes,
 * which requires the --unstable flag.
 *
 * Note that dependencies imported using the async `import()` API will not be
 * bundled, they will need to be available to the script at runtime.
 */
export async function bundleScript(opt: BundleScriptOptions): Promise<void> {
  if (!Deno.emit) {
    console.log(
      `INFO: Refusing to bundle ${opt.input} - Deno.emit() is not available. Restart the Deno process with the --unstable flag to enable bundling`,
    );
    return;
  }

  opt.cwd = (
    opt.cwd?.startsWith("file://") ? (
      path.resolve(path.fromFileUrl(opt.cwd), "..")
    )
    : opt.cwd || "."
  );
  opt = {
    ...opt,
    input: path.resolve(opt.cwd, opt.input),
    output: path.resolve(opt.cwd, opt.output),
  };

  const rebundleOnUpdate = async () => {
    let g: graph.ModuleGraph | null = null;
    try {
      g = await graph.createGraph(path.toFileUrl(opt.input).href);
    } catch {
      // continue
    }
    
    const deps = !g ? [opt.input] : g.modules
      .filter(m => m.specifier.startsWith("file://"))
      .map(m => path.fromFileUrl(m.specifier));

    try {
      for await (const _ of Deno.watchFs(deps)) {
        break;
      }
    } catch (e) {
      console.error(
        `ERROR: Fatal error while watching for bundle updates (bundling will not be re-attempted):`,
        e,
      );
      return;
    }

    console.log(
      `INFO: ${opt.input} - Module updated, rebundling...`,
    );
    bundleScript(opt);
  };

  try {
    const js = (await Deno.emit(opt.input, {
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

    await Deno.writeTextFile(opt.output, js);
    console.log(`INFO: ${opt.input} - Bundled`);
  } catch (e) {
    if (!opt.watch) {
      console.error(`ERROR: ${opt.input} - Bundle error:`, e);
    } else {
      console.error(`ERROR: ${opt.input} - Bundle error (waiting for updates):`, e);
    }
  }

  if (opt.watch) {
    rebundleOnUpdate();
  }
}
