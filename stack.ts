// Copyright 2022 Connor Logan. All rights reserved. MIT License.

// TODO: Add support for arrays of handlers  
// TODO: Don't throw errors when using advanced URLPattern syntax (just use the
// unknown type on the client when they use it instead)  

import { http } from "./deps.ts";
import { requestContext } from "./http.ts";

import type { RouterRequest, RouterShape, Handler } from "./client.ts";

/**
 * Handler that routes requests to Rpcs (endpoints) or other Stacks (routers).
 */
export interface Stack<S extends RouterShape = RouterShape> {
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
export function stack<S extends RouterShape>(routes: S): Stack<S> {
  // Stack routes can only use some of the features of URLPattern. If attempts
  // are made to use features that aren't supported, throw an error
  for (const [k, _] of Object.entries(routes)) {
    const split = k.split("/").filter(v => !!v);

    // Trailing wildcard needs to be let through
    if (split[split.length-1] === "*") {
      split.pop();
    }

    // Make sure the stack route is simple
    for (const s of split) {
      if (
        !s.match(/^:[a-zA-Z_$][a-zA-Z_$0-9]$/) &&
        !s.match(/^[^:*?(){}]*$/) // TODO: I don't think this is fully correct
      ) {
        throw new SyntaxError(
          `"${k}" isn't a valid stack route. Stack routes only support basic path segments and named path segments (groups). Non-trailing wildcards, RegExp, optionals, and other advanced URLPattern syntax is not supported`,
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
  //      (Trailing wildcards don't affect path depth)
  //   3. For two paths that have the same depth, index order is used (lower
  //      index === higher priority)
  const paths = Object.keys(handlers);
  const sortedPaths: string[] = paths.sort((a, b) => {
    if (a === b) {
      return 0;
    }
    
    // #1
    if (a === "*" || a === "/*") {
      return 1;
    }
    if (b === "*" || b === "/*") {
      return -1;
    }

    // #2
    if (a.endsWith("/*")) {
      a = a.slice(0, a.length - 2);
    }
    if (b.endsWith("/*")) {
      b = b.slice(0, b.length - 2);
    }
    const la = a.split("/").filter(v => !!v).length;
    const lb = b.split("/").filter(v => !!v).length;
    if (la !== lb) {
      return lb - la;
    }

    // #3
    return paths.indexOf(a) - paths.indexOf(b);
  });

  const patterns = new Map<URLPattern, Handler | Handler[]>();
  for (const op of sortedPaths) {
    let p = "/" + op.split("/").filter(v => !!v).join("/");

    // Sometimes the path might already end in a wildcard. If it does, remove it
    // before adding the path capture wildcard
    if (p.endsWith("/*")) {
      p = p.slice(0, p.length - 2);
    }
    p = `${p}/:${nextPathGroupName}*/*?`;
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

/**
 * Checks if a Response should be considered a "no match" response, indicating
 * to the stack if it should continue looking for matches or not. Currently, a
 * "no match" response is a 404 Reponse with a plaintext body.
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