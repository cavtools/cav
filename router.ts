// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http, path } from "./deps.ts";
import { packResponse } from "./serial.ts";
import type {
  RouterShape,
  RouterRequest,
  Handler,
} from "./client.ts";

// TODO: Optimization idea: For nested objects, instead of creating a new
// router, create multiple URL patterns so that fewer functions get called when
// routing a request. i.e. "/foo/bar" is fewer functions than foo: { bar: end }

/**
 * Metadata object for caching and tracking information about how a Request has
 * been routed so far in the handling process.
 */
export interface RouterContext {
  /** new URL(req.url) */
  url: URL;
  /** The current, unrouted portion of the requested path. */
  path: string;
  /** The raw query string parameters, as an object. */
  query: Record<string, string | string[]>;
  /** The path parameters captured during the routing process so far. */
  param: Record<string, string>;
  /**
   * If this isn't null, this Response should be returned as soon as possible in
   * the routing process. It means the path requested wasn't canonical, and this
   * 302 Response will redirect the client to the canonical URL instead.
   */
  redirect: Response | null;
}

const _routerContext = Symbol("_routerContext");

/** Record representing query string parameters. */
export type QueryRecord = Record<string, string | string[]>;

/** Record representing path parameters captured during routing. */
export type ParamRecord = Record<string, string>;

/**
 * Hook for getting routing metadata from a Request. If there isn't already a
 * RouterContext associated with the Request, a new one will be generated. The
 * same RouterContext object is returned on every subsequent call to
 * `routerContext()` with this Request.
 *
 * Use this to get information about how the Request has been routed so far, if
 * at all. Routers read and modify this context internally and Endpoints read
 * from it when determining whether to respond to the Request or not (404).
 */
export function routerContext(request: Request): RouterContext {
  const req = request as Request & { [_routerContext]?: RouterContext };
  if (req[_routerContext]) {
    return req[_routerContext]!;
  }

  const url = new URL(req.url);
  const path = `/${url.pathname.split("/").filter((p) => !!p).join("/")}`;
  let redirect: Response | null = null;
  if (path !== url.pathname) {
    url.pathname = path;
    // NOTE: Don't use Response.redirect. It prevents modifying headers
    // redirect = Response.redirect(url.href, 302);
    redirect = new Response(null, {
      status: 302,
      headers: { "location": url.href },
    });
  }

  const query: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams.entries()) {
    const old = query[k];
    if (typeof old === "string") {
      query[k] = [old, v];
    } else if (Array.isArray(old)) {
      query[k] = [...old, v];
    } else {
      query[k] = v;
    }
  }

  const ctx: RouterContext = {
    url,
    path,
    param: {},
    query,
    redirect,
  };
  Object.assign(req, { [_routerContext]: ctx });
  return ctx;
}

/** Cav Router handlers, for routing requests. */
// deno-lint-ignore ban-types
export type Router<S extends RouterShape = {}>  = S & ((
  req: RouterRequest<S>,
  conn: http.ConnInfo,
) => Promise<Response>);

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
        case ".html": type = "text/html;charset=utf-8"; break;
        case ".css": type = "text/css;charset=utf-8"; break;
        case ".js": type = "application/javascript"; break;
        case ".json": type = "application/json"; break;
        case ".svg": type = "image/svg+xml"; break;
        case ".rss": type = "application/rss+xml"; break;
        case ".xml": type = "application/xml"; break;
        case ".txt": type = "text/plain;charset=utf-8"; break;
        default: type = "text/html;charset=utf-8";
      }

      v = (req: Request) => {
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
        
        const res = new Response(staticStr, {
          headers: { "content-type": type },
        });
        if (req.method === "HEAD") {
          return new Response(null, { headers: res.headers });
        }
        return res;
      };
    }

    const old = shape[k];

    if (!old) {
      if (typeof v === "function" || Array.isArray(v)) {
        shape[k] = v;
      } else {
        shape[k] = router(v);
      }
    } else if (Array.isArray(old)) {
      if (typeof v === "function") {
        shape[k] = [...old, v];
      } else if (Array.isArray(v)) {
        shape[k] = [...old, ...v];
      } else {
        shape[k] = [...old, router(v)];
      }
    } else {
      if (typeof v === "function") {
        shape[k] = [old, v];
      } else if (Array.isArray(v)) {
        shape[k] = [old, ...v];
      } else {
        shape[k] = [old, router(v)];
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
      // "." and ".." aren't allowed
      if (s === "." || s === "..") {
        throw new SyntaxError(
          "'.' and '..' aren't allowed in route path segments",
        );
      }

      if (
        // If it doesn't match the path capture regex
        !s.match(/^:[a-zA-Z_$]+[a-zA-Z_$0-9]*$/) &&
        // And it has at least one unescaped URLPattern character
        s.match(/[^\\][:*?(){}]/)
      ) {
        throw new SyntaxError(
          `"${k}" isn't a valid Router route. The Router only supports basic path segments and named path segments (param). Wildcards, RegExp, optionals, and other advanced URLPattern syntax isn't supported, with the exception of the solo wildcard "*"`,
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
    const ctx = routerContext(req);
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