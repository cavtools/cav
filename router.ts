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
  /** The path groups captured during the routing process so far. */
  groups: Record<string, string>;
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

  const ctx: RouterContext = {
    url,
    path,
    groups: {},
    redirect,
  };
  Object.assign(req, { [_routerContext]: ctx });
  return ctx;
}

/**
 * A Handler that routes Requests to Endpoints and other Routers.
 */
// deno-lint-ignore ban-types
export type Router<S extends RouterShape = {}>  = S & ((
  req: RouterRequest<S>,
  conn: http.ConnInfo,
) => Promise<Response>);

/**
 * Constructs a new Router handler using the provided routes.
 */
export function router<S extends RouterShape>(routes: S): Router<S> {
  const shape: RouterShape = {};
  for (let [k, v] of Object.entries(routes)) {
    k = k.split("/").filter(k2 => !!k2).join("/");
    shape[k] = v;
  }

  // Check that routes are valid
  for (const k of Object.keys(shape)) {
    // The wildcard route is allowed
    if (k === "*") {
      continue;
    }

    const split = k.split("/");
    for (const s of split) {
      if (
        // If it doesn't match the path capture regex
        !s.match(/^:[a-zA-Z_$]+[a-zA-Z_$0-9]*$/) &&
        // And it has at least one unescaped URLPattern character
        s.match(/[^\\][:*?(){}]/)
      ) {
        throw new SyntaxError(
          `"${k}" isn't a valid Router route. The Router only supports basic path segments and named path segments (groups). Wildcards, RegExp, optionals, and other advanced URLPattern syntax isn't supported, with the exception of the solo wildcard route "*"`,
        );
      }
    }
  }

  const handlers: Record<string, Handler | Handler[]> = {}
  for (const [k, v] of Object.entries(shape)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      handlers[k] = router(v);
    } else if (v) {
      handlers[k] = v;
    }
  }

  // Sort the handlers like this:
  //   1. Solo wildcards are always last
  //   2. By path depth. Paths with more path segments get tested sooner.
  //   3. For two paths that have the same depth, index order is used (lower
  //      index === higher priority)
  const paths = Object.keys(handlers);
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
    return paths.indexOf(a) - paths.indexOf(b);
  });

  const patterns = new Map<URLPattern, Handler | Handler[]>();
  for (let p of sortedPaths) {
    if (p === "*") {
      p = `/:__nextPath*/*?`;
    } else {
      p = `${p}/:__nextPath*/?`;
    }
    patterns.set(new URLPattern(p, "http://_._"), handlers[p]);
  }
  
  const handler = async (req: Request, conn: http.ConnInfo): Promise<Response> => {
    // Check for redirect
    const ctx = routerContext(req);
    if (ctx.redirect) {
      return ctx.redirect;
    }

    for (const [pattern, handler] of patterns.entries()) {
      const match = pattern.exec(ctx.path, "http://_._");
      if (!match) {
        continue;
      }

      const groups = { ...ctx.groups, ...match.pathname.groups };
      const path = `/${groups.__nextPath || ""}`;
      delete groups.__nextPath;

      const oPath = ctx.path;
      const oGroups = ctx.groups;

      // The context object is only created once for every request, so
      // modifications to the data object will be preserved across handling
      // contexts
      Object.assign(ctx, { path, groups });

      try {
        if (Array.isArray(handler)) {
          for (const h of handler) {
            const response = await h(req, conn);
            if (didMatch(response)) {
              return response;
            }
          }
        } else {
          const response = await handler(req, conn);
          if (didMatch(response)) {
            return response;
          }
        }
      } finally {
        // Before moving on, put the path and groups back to their original
        // state
        Object.assign(req, { path: oPath, groups: oGroups });
      }
    }

    // When nothing matches, return the last 404
    return Object.assign(new Response("404 not found", { status: 404 }), { [noMatch]: true });
  };

  return Object.assign(handler, { ...routes });
}

/**
 * A symbol assigned to Responses to indicate a "no match", i.e. the containing
 * Router should continue looking for matching handlers and disregard this
 * Response.
 */
export const noMatch = Symbol("noMatch");

/**
 * Checks if the Response is a "did match" Response, i.e. the handler it came
 * from wants this Response to be returned to the client.
 */
export function didMatch(res: Response): boolean {
  return !(res as Response & Record<symbol, boolean>)[noMatch];
}