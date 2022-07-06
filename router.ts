// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http, path } from "./deps.ts";
import { createEtagHash, should304 } from "./_etag.ts";
import { context } from "./context.ts";
import type {
  RouterShape,
  RouterRequest,
  Handler,
} from "./client.ts";

// TODO: Optimization idea: For nested objects, instead of creating a new
// router, create multiple URL patterns so that fewer functions get called when
// routing a request. i.e. "/foo/bar" is fewer functions than foo: { bar: end }

declare const _router: unique symbol;

/** Cav Router handlers, for routing requests. */
// deno-lint-ignore ban-types
export type Router<S extends RouterShape = {}> = S & ((
  req: RouterRequest<S>,
  conn: http.ConnInfo,
) => Promise<Response>) & {
  // Prevents the type from being shown as a function in the magnifier when the
  // schema is empty
  [_router]?: true;
};

/**
 * Constructs a new Router handler using the provided routes. The route
 * properties are also available on the returned Router function.
 */
export function router<S extends RouterShape>(routes: S): Router<S> {
  const shape: Record<string, Handler | Handler[]> = {};
  for (let [k, v] of Object.entries(routes)) {
    if (typeof v === "undefined" || v === null) {
      continue;
    }

    k = k.split("/").filter(k2 => !!k2).join("/");

    if (typeof v === "string") {
      const staticStr = v;

      // When serving static strings, content-type is determined by the
      // extension in the route. If there isn't one, fallback to HTML. Only some
      // extensions are supported for now. It's important that content-type
      // detection isn't run based on the content of a dynamic string (in an
      // endpoint) because it'd open an XSS vuln
      const ext = path.extname(k);
      let type: string;
      switch(ext) {
        case ".html": type = "text/html; charset=UTF-8"; break;
        case ".md": type = "text/markdown; charset=UTF-8"; break;
        case ".css": type = "text/css; charset=UTF-8"; break;
        case ".txt": type = "text/plain; charset=UTF-8"; break;
        case ".js": type = "text/javascript; charset=UTF-8"; break;
        case ".json": type = "application/json; charset=UTF-8"; break;
        case ".svg": type = "image/svg+xml; charset=UTF-8"; break;
        case ".rss": type = "application/rss+xml; charset=UTF-8"; break;
        case ".xml": type = "application/xml; charset=UTF-8"; break;
        default: type = "text/html; charset=UTF-8";
      }

      // Because there's no file info to work with, we generate the etag using
      // the entire string. It's a static string, therefore we only have to do
      // this once
      const etag = createEtagHash(staticStr);
      const modified = new Date();

      v = async (req: Request) => {
        if (req.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: { "allow": "OPTIONS, GET, HEAD" },
          });
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
          return new Response("405 method not allowed", {
            status: 405,
            headers: { "allow": "OPTIONS, GET, HEAD" },
          });
        }

        const headers = new Headers();
        headers.set("etag", await etag);
        headers.set("last-modified", modified.toUTCString());
        headers.set("content-type", type);

        // This works similarly to how the std lib does it in their file server
        if (should304({
          req,
          etag: await etag,
          modified,
        })) {
          return new Response(null, { status: 304, headers });
        }
        
        const res = new Response(staticStr, { headers });
        if (req.method === "HEAD") {
          return new Response(null, { headers: res.headers });
        }
        return res;
      };
    }

    const old = shape[k];
    if (!old) {
      shape[k] = v;
    } else if (Array.isArray(old)) {
      if (typeof v === "function") {
        shape[k] = [...old, v];
      } else {
        shape[k] = [...old, ...v];
      }
    } else {
      if (typeof v === "function") {
        shape[k] = [old, v];
      } else {
        shape[k] = [old, ...v];
      }
    }
  }

  // Check that routes are valid
  for (const k of Object.keys(shape)) {
    // The wildcard route is allowed
    if (k === "*") {
      continue;
    }

    const split = k.split("/");
    for (const s of split) {
      // Empty path segments aren't allowed, unless it's the root path
      if (k !== "/" && !s) {
        throw new SyntaxError("Route path segments aren't allowed to be empty");
      }
      
      // "." and ".." aren't allowed
      if (s === "." || s === "..") {
        throw new SyntaxError(
          "'.' and '..' aren't allowed in route path segments",
        );
      }
    }
  }

  // Sort the handlers like this:
  //   1. Solo wildcards are always last
  //   2. By path depth. Paths with more path segments get tested sooner.
  //   3. For two paths that have the same depth, index order is used (lower
  //      index === higher priority)
  const paths = Object.keys(shape);
  const sortedPaths: string[] = paths.sort((a, b) => {
    if (a === b) {
      return 0;
    }

    // #1
    if (a === "*") {
      return 1;
    }
    if (b === "*") {
      return -1;
    }

    // #2
    const la = a.split("/").length;
    const lb = b.split("/").length;
    if (la !== lb) {
      return lb - la;
    }

    // #3
    return paths.indexOf(b) - paths.indexOf(a);
  });

  const patterns = new Map<URLPattern, Handler | Handler[]>();
  for (const p of sortedPaths) {
    const pattern = (
      p === "*" ? `/:__nextPath*/*?`
      : !p ? "/"
      : `/${p}/:__nextPath*/*?`
    );
    patterns.set(new URLPattern(pattern, "http://_._"), shape[p]);
  }
  
  const handler = async (
    req: Request,
    conn: http.ConnInfo,
  ): Promise<Response> => {
    // Check for redirect
    const ctx = context(req);
    if (ctx.redirect) {
      return ctx.redirect;
    }

    let lastNoMatch: Response | null = null;

    for (const [pattern, fn] of patterns.entries()) {
      const match = pattern.exec(ctx.path, "http://_._");
      if (!match) {
        continue;
      }
      
      const param = { ...ctx.param };
      for (const [k, v] of Object.entries(match.pathname.groups)) {
        param[k] = v;
      }

      // REVIEW: I don't think this delete will ever cause a bug but it might?
      // The 0 group is always empty I think.
      // https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API#unnamed_and_named_groups
      delete param["0"];

      const path = `/${param.__nextPath || ""}`;
      delete param.__nextPath;

      const oPath = ctx.path;
      const oParam = ctx.param;

      // The context object is only created once for every request, so
      // modifications to the data object will be preserved across handling
      // contexts
      Object.assign(ctx, { path, param });

      try {
        if (Array.isArray(fn)) {
          for (const f of fn) {
            const response = await f(req, conn);
            if (didMatch(response)) {
              return response;
            } else {
              lastNoMatch = response;
            }
          }
        } else {
          const response = await fn(req, conn);
          if (didMatch(response)) {
            return response;
          } else {
            lastNoMatch = response;
          }
        }
      } finally {
        // Before moving on, put the path and param back to their original
        // state
        Object.assign(ctx, { path: oPath, param: oParam });
      }
    }

    // When nothing matches, return the last 404
    if (lastNoMatch) {
      return lastNoMatch;
    }
    return noMatch(new Response("404 not found", { status: 404 }));
  };

  return Object.assign(handler, routes);
}

const _noMatch = Symbol("_noMatch");

/**
 * Adds a Symbol to the Response to indicate to any containing Routers that the
 * handler didn't match with the Request. The Router will continue looking for
 * matches.
 */
export function noMatch(res: Response): Response {
  return Object.assign(res, { [_noMatch]: true });
}

/**
 * Checks if the Response is a "did match" Response, i.e. the handler it came
 * from wants this Response to be returned to the client.
 */
export function didMatch(res: Response): boolean {
  return !(res as Response & Record<symbol, boolean>)[_noMatch];
}