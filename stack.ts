// Copyright 2022 Connor Logan. All rights reserved. MIT License.

// TODO: Add support for arrays of handlers  
// TODO: Don't throw errors when using advanced URLPattern syntax (just use the
// unknown type on the client when they use it instead)  

import { http } from "./deps.ts";
import { requestData, NO_MATCH } from "./http.ts";

import type { StackShape } from "./client.ts";

/**
 * An http.Handler that routes requests to Rpcs or other Handlers. Stacks are
 * one of two fundamental building blocks of Cav server applications, the other
 * being Rpcs. If a matching handler or Rpc throws the special NO_MATCH error,
 * the stack continues looking for matching handlers to process the request into
 * a response. Stacks can capture path groups while routing the request; the
 * captured groups will become the basis for the ResolverArg's `groups` property
 * inside a matching Rpc (before parsing).
 */
export interface Stack<
  S extends StackRoutes = StackRoutes,
> {
  (req: Request & StackShape<S>, connInfo: http.ConnInfo): Promise<Response>;
  /** The StackRoutes object used to construct this stack. */
  readonly routes: S;
}

/** Type alias that matches any Stack. Useful for type constraints. */
// deno-lint-ignore no-explicit-any
export type AnyStack = Stack<any>;

/**
 * A routing map used by the constructed Stack to find matching handlers to
 * handle an incoming request.
 */
export interface StackRoutes {
  [x: string]: http.Handler | StackRoutes | null;
}

const nextPathGroupName = "__nextPath";

/**
 * Constructs a StackHandler using the given StackRoutes object. The first
 * matching handler in the provided routes to either return a Response or throw
 * an unknown error halts the matching process. If a handler throws the special
 * NO_MATCH error, the error is suppressed and matching continues. See the
 * documentation for more details about StackRoutes and how routing inside a
 * Stack works.
 *
 * TODO: the referenced documentation lol
 */
export function stack<R extends StackRoutes>(routes: R): Stack<R> {
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

  const handlers: Record<string, http.Handler> = {};
  for (const k of Object.keys(routes)) {
    const v = routes[k];
    if (v && typeof v === "object") {
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

  const patterns = new Map<URLPattern, http.Handler>();
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
    const data = requestData(req);
    if (data instanceof Response) { // Handle malformed path redirect
      return data;
    }

    for (const [pattern, handler] of patterns.entries()) {
      const match = pattern.exec(data.path, "http://_._");
      if (!match) {
        continue;
      }

      const groups = { ...data.groups, ...match.pathname.groups };
      const path = `/${groups[nextPathGroupName] || ""}`;
      delete groups[nextPathGroupName];

      const oPath = data.path;
      const oGroups = data.groups;

      // The data object is only created once for every request, therefore
      // modifications to the data object will be preserved across handling
      // contexts
      Object.assign(data, { path, groups });

      try {
        return await handler(req, conn);
      } catch (e) {
        // Keep looking for matches if it's the NO_MATCH error. All other errors
        // bubble
        if (e === NO_MATCH) {
          continue;
        }
        throw e;
      } finally {
        // Before moving on, put the path and groups back to their original
        // state
        Object.assign(req, { path: oPath, groups: oGroups });
      }
    }

    // When nothing matches, throw NO_MATCH
    throw NO_MATCH;
  };

  return Object.assign(handler, { routes });
}
