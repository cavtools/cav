// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { fileServer, path } from "./deps.ts";
import { HttpError } from "./serial.ts";
import { noMatch } from "./router.ts";
import { context } from "./context.ts";

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
   * provided, the routed path from the Context associated with the request will
   * be used.
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
  const ctx = context(req);
  const url = ctx.url;
  let pathname = opt?.path ?? ctx.path.join("/");

  // Special rules for serving files. To opt out, specify the path directly on
  // the options
  if (typeof opt?.path === "undefined") {
    const parts = pathname.split("/");
    for (const p of parts) {
      if (p.startsWith(".")) {
        return noMatch(new Response("404 not found", { status: 404 }));
      }
    }
  }

  const cwd = parseCwd(opt?.cwd ?? ".");
  const dir = opt?.dir ?? "assets";

  try {
    let filePath = (
      dir.startsWith("/") ? path.join(dir, path.join("/", pathname))
      : path.join(cwd, dir, path.join("/", pathname))
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
