// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { path, emit, graph } from "./deps.ts";
import { createEtagHash, should304 } from "./_etag.ts";

// TODO: Add option for source maps for prepared bundles  
// TODO: ETag calculation

function parseCwd(cwd: string): string {
  if (cwd.startsWith("https://") || cwd.startsWith("http://")) {
    cwd = path.join(cwd, "..");
  } else if (cwd.startsWith("file://")) {
    cwd = path.join(path.fromFileUrl(cwd), "..");
  }
  return cwd;
}

export interface ServeBundleOptions {
  /**
   * If provided, this sets the current working directory when looking for the
   * bundle. If a file://, http://, or https:// path is provided, the parent
   * folder of the path is used. This is useful if you want to serve assets
   * relative to the current file using `import.meta.url`. If the `url` option
   * is also a file://, http://, or https:// url, this option is ignored.
   * Default: `"."`
   */
  cwd?: string;
  /**
   * The path of the file to bundle. If this is an absolute URL (starts with
   * file://, http://, or https://), the `cwd` option is ignored. This option is
   * required.
   */
  url: string;
}

interface BundleCache {
  code: string;
  headers: Headers;
  etag: string;
  modified: Date;
}

const bundleCache = new Map<string, Promise<BundleCache>>();

async function bundle(url: string): Promise<string> {
  const code = (await emit.bundle(path.fromFileUrl(url), {
    allowRemote: true,
    type: "module",
    compilerOptions: {
      inlineSources: false,
      inlineSourceMap: false,
      sourceMap: false,
    },
    load: async (specifier) => {
      const res = await fetch(specifier);
      const headers: Record<string, string> = {};
      for (const [k, v] of res.headers.entries()) {
        if (!headers[k]) {
          headers[k] = v;
        }
      }
      return {
        kind: "module",
        specifier: res.url,
        headers: headers,
        content: await res.text(),
      };
    },
  })).code;

  // TODO: Currently, the source map options are ignored by deno_emit.
  // (deno_emit is still new and v0). We need to manually remove the inline
  // source maps until those options get implemented
  return code.split("//# sourceMappingURL=")[0];
}

/**
 * Response factory for bundling and serving TypeScript and JavaScript files.
 * Bundled files are cached into memory and watched for changes, if possible.
 * When a change occurs, the cached bundle is invalidated. The request is only
 * used for caching headers.
 */
export async function serveBundle(
  req: Request,
  opt: ServeBundleOptions,
): Promise<Response> {
  const cwd = opt.cwd ? parseCwd(opt.cwd) : Deno.cwd();
  let url = opt.url;
  if (
    !url.startsWith("file://") &&
    !url.startsWith("https://") &&
    !url.startsWith("http://")
  ) {
    url = path.toFileUrl(path.resolve(cwd, url)).href;
  }

  let cache = bundleCache.get(url);
  if (cache) {
    const { code, headers, etag, modified } = await cache;
    if (should304({ req, etag, modified })) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(code, { headers });
  }

  const createCache = async (): Promise<BundleCache> => {
    try {
      const code = await bundle(url);
      const etag = await createEtagHash(code); // TODO: Use the modified date + file size?
      const modified = new Date(); // TODO: Use the real modified date?
    
      const headers = new Headers();
      headers.set("content-type", "application/javascript");
      headers.set("etag", etag);
      headers.set("last-modified", modified.toUTCString());
  
      return { code, headers, etag, modified };
    } catch (err) {
      bundleCache.delete(url);
      throw err;
    }
  };

  cache = createCache();
  bundleCache.set(url, cache);

  // If possible, start an async fs watcher loop that regenerates the cached
  // bundle whenever the file or its dependencies change
  (async () => {
    try {
      while (true) {
        // Wait for the last bundle to finish first. If it failed, the loop
        // should break
        await cache;

        const deps = (await graph.createGraph(url)).modules
          .filter(m => m.specifier.startsWith("file://"))
          .map(m => path.fromFileUrl(m.specifier));
        for await (const _ of Deno.watchFs(deps)) {
          break;
        }

        cache = createCache();
        bundleCache.set(url, cache);
      }
    } catch {
      // Errors during file watching are silently dropped
      return;
    }
  })();

  const { code, headers } = await cache;
  return new Response(code, { headers });
}