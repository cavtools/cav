// Copyright 2022 Connor Logan. All rights reserved. MIT License.

// TODO: Don't throw errors when using advanced URLPattern syntax (just use the
// unknown type on the client when they use it instead)

import { http } from "./deps.ts";
import { requestContext } from "./http.ts";

import type { Handler, RouterRequest, RouterShape } from "./client.ts";

/** A valid routes object for initializing a Stack. */
export type StackRoutes = RouterShape;

/**
 * Handler that routes requests to Rpcs (endpoints) or other Stacks (routers).
 */
export interface Stack<S extends StackRoutes = StackRoutes> {
  (req: RouterRequest<S>, connInfo: http.ConnInfo): Promise<Response>;
  /**
   * The routes specified when this Stack was constructed.
   */
  readonly routes: S;
}

const nextPathGroupName = "__nextPath";

/**
 * Constructs a new Stack handler using the provided routes object. Keys can be
 * a subset of the URLPattern syntax when group capturing is desired. See the
 * documentation for more information about how Stack routing works. TODO: the
 * documentation about how Stack routing works
 */
export function stack<R extends StackRoutes>(routes: R): Stack<R> {
  // TODO: clean the routes here, before moving ahead

  // Stack routes can only use one of the features of URLPattern. If attempts
  // are made to use features that aren't supported, throw an error
  for (const [k, _] of Object.entries(routes)) {

    const split = k.split("/").filter((v) => !!v);
    const joined = split.join("/");

    // The solo wildcard is acceptable. Wildcards don't work anywhere else
    // because they are greedy, which isn't compatible with this routing process
    if (joined === "*") {
      continue;
    }

    // Make sure the stack route is simple by banning complicated URLPattern
    // syntax. Only path groups without regex are supported currently
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

  const handlers: Record<string, Handler | Handler[]> = {};
  for (const k of Object.keys(routes)) {
    const v = routes[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      handlers[k] = stack(v);
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
    if (a === "*" || a === "/*") { // TODO: Remove the second condition
      return 1;
    }
    if (b === "*" || b === "/*") { // TODO: Remove the second condition
      return -1;
    }

    // #2
    if (a.endsWith("/*")) { // TODO: Remove this block (not possible)
      a = a.slice(0, a.length - 2);
    }
    if (b.endsWith("/*")) { // TODO: Remove this block (not possible)
      b = b.slice(0, b.length - 2);
    }
    const la = a.split("/").filter((v) => !!v).length;
    const lb = b.split("/").filter((v) => !!v).length;
    if (la !== lb) {
      return lb - la;
    }

    // #3
    return paths.indexOf(a) - paths.indexOf(b);
  });

  const patterns = new Map<URLPattern, Handler | Handler[]>();
  for (const op of sortedPaths) {
    // TODO: Don't filter them here
    let p = "/" + op.split("/").filter((v) => !!v).join("/");
    if (p === "*") {
      p = `/:${nextPathGroupName}*/*?`;
    } else {
      p = `${p}/:${nextPathGroupName}*/*?`;
    }
    patterns.set(new URLPattern(p, "http://_._"), handlers[op]);
  }

  const handler = async (
    req: Request,
    conn: http.ConnInfo,
  ): Promise<Response> => {
    // Check for redirect
    const reqCtx = requestContext(req);
    if (reqCtx.redirect) {
      return reqCtx.redirect;
    }

    // When nothing matches, the last seen plaintext 404 error is returned,
    // defaulting to this one
    let last404 = new Response("404 not found", { status: 404 });

    for (const [pattern, handler] of patterns.entries()) {
      const match = pattern.exec(reqCtx.path, "http://_._");
      if (!match) {
        continue;
      }

      const groups = { ...reqCtx.groups, ...match.pathname.groups };
      const path = `/${groups[nextPathGroupName] || ""}`;
      delete groups[nextPathGroupName];

      const oPath = reqCtx.path;
      const oGroups = reqCtx.groups;

      // The context object is only created once for every request, so
      // modifications to the data object will be preserved across handling
      // contexts
      Object.assign(reqCtx, { path, groups });

      try {
        if (Array.isArray(handler)) {
          for (const h of handler) {
            const response = await h(req, conn);
            if (didMatch(response)) {
              return response;
            } else {
              last404 = response;
            }
          }
        } else {
          const response = await handler(req, conn);
          if (didMatch(response)) {
            return response;
          } else {
            last404 = response;
          }
        }
      } finally {
        // Before moving on, put the path and groups back to their original
        // state
        Object.assign(req, { path: oPath, groups: oGroups });
      }
    }

    // When nothing matches, return the last 404
    return last404;
  };

  return Object.assign(handler, { routes });
}

// REVIEW: Idk if this is specific enough to not piss someone off at some point.
// Might need one more differentiator, like a Symbol assigned to the response or
// something like that
/**
 * Checks if a Response should be considered a "no match" response, indicating
 * to the stack if it should continue looking for matches or not. Currently, a
 * "no match" response is a 404 Response with a plaintext body. 
 */
function didMatch(response: Response): boolean {
  if (response.status === 404) {
    const mime = response.headers.get("content-type");
    if (mime === "text/plain") {
      return false;
    }
  }
  return true;
}
