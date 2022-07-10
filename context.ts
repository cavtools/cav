// Copyright 2022 Connor Logan. All rights reserved. MIT License.

/**
 * Metadata object for caching and tracking information about how a Request has
 * been routed so far in the handling process.
 */
 export interface Context {
  /** new URL(req.url) */
  url: URL;
  /** The current, unrouted portion of the requested path. */
  path: string;
  /** The raw query string parameters, as an object. */
  query: QueryRecord;
  /** The path parameters captured during the routing process so far. */
  param: ParamRecord;
  /**
   * If this isn't null, this Response should be returned as soon as possible in
   * the routing process. It means the path requested wasn't canonical, and this
   * 302 Response will redirect the client to the canonical URL instead.
   */
  redirect: Response | null;
}

const _context = Symbol("_context");

/** Record representing query string parameters. */
export type QueryRecord = Record<string, string | string[]>;

/** Record representing path parameters captured during routing. */
export type ParamRecord = Record<string, string>;

/**
 * Hook for getting routing metadata from a Request. If there isn't already a
 * Context associated with the Request, a new one will be generated. The same
 * Context object is returned on every subsequent call to `context()` with this
 * Request.
 *
 * Use this to get information about how the Request has been routed so far, if
 * at all. Routers read and modify this context internally and Endpoints read
 * from it when determining whether to respond to the Request or not (404).
 */
export function context(request: Request): Context {
  const req = request as Request & { [_context]?: Context };
  if (req[_context]) {
    return req[_context]!;
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").filter((p) => !!p).join("/");
  let redirect: Response | null = null;
  if (path !== url.pathname.slice(1)) {
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

  const ctx: Context = {
    url,
    path,
    param: {},
    query,
    redirect,
  };
  Object.assign(req, { [_context]: ctx });
  return ctx;
}