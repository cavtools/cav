// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http } from "./deps.ts";
import type {
  RouterShape,
  RouterRequest,
  Handler,
} from "./client.ts";

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
  /** The path groups captured during the routing process so far. */
  groups: Record<string, string | string[]>;
  /**
   * If this isn't null, this Response should be returned as soon as possible in
   * the routing process. It means the path requested wasn't canonical, and this
   * 302 Response will redirect the client to the canonical URL instead.
   */
  redirect: Response | null;
}

const _routerContext = Symbol("_routerContext");

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
    redirect = Response.redirect(url.href, 302);
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
    groups: {},
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
    if (!v) {
      continue;
    }

    k = k.split("/").filter(k2 => !!k2).join("/");
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

      // The empty route "" isn't allowed either
      if (s === "") {
        throw new SyntaxError(
          "The empty route '' isn't allowed (it would never match)",
        );
      }

      if (
        // If it doesn't match the path capture regex
        !s.match(/^:[a-zA-Z_$]+[a-zA-Z_$0-9]*$/) &&
        // And it has at least one unescaped URLPattern character
        s.match(/[^\\][:*?(){}]/)
      ) {
        throw new SyntaxError(
          `"${k}" isn't a valid Router route. The Router only supports basic path segments and named path segments (groups). Wildcards, RegExp, optionals, and other advanced URLPattern syntax isn't supported, with the exception of the solo wildcard "*"`,
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
    const pattern = p === "*" ? `/:__nextPath*/*?` : `${p}/:__nextPath*/*?`;
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
      
      const groups = { ...ctx.groups };
      for (const [k, v] of Object.entries(match.pathname.groups)) {
        const old = groups[k];
        if (Array.isArray(old)) {
          groups[k] = [...old, v];
        } else if (typeof old === "string") {
          groups[k] = [old, v];
        } else {
          groups[k] = v;
        }
      }

      // REVIEW: I don't think this delete will ever cause a bug but it might?
      // The 0 group is always empty I think.
      // https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API#unnamed_and_named_groups
      delete groups["0"];

      // const groups = { ...ctx.groups, ...match.pathname.groups };
      const path = `/${groups.__nextPath || ""}`;
      delete groups.__nextPath;

      const oPath = ctx.path;
      const oGroups = ctx.groups;

      // The context object is only created once for every request, so
      // modifications to the data object will be preserved across handling
      // contexts
      Object.assign(ctx, { path, groups });

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
        // Before moving on, put the path and groups back to their original
        // state
        Object.assign(ctx, { path: oPath, groups: oGroups });
      }
    }

    // When nothing matches, return the last 404
    if (lastNoMatch) {
      return lastNoMatch;
    }
    return noMatch(new Response("404 not found", { status: 404 }));
  };

  return Object.assign(handler, { ...routes });
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