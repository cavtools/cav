// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http } from "./deps.ts";

// TODO: Make every signed cookie a JWT, no separate signatures
// TODO: A way to access cookies that have been set for a different path/domain
// TODO: Edge case: The unsigned signatures don't update until the .sync(),
// it's probably better to make all valid signatures inaccessible

/**
 * A (mostly) synchronous interface for accessing HTTP cookies tied to a Request
 * and response Headers instance. Supports signed cookies.
 */
export interface CookieJar {
  /**
   * Gets a cookie. Returns `null` if the cookie isn't set or the signed cookie
   * JWT was invalid or expired.
   */
  get: (name: string, opt?: { signed?: boolean }) => string | undefined;
  /**
   * Sets a cookie. If the signed option is true, the cookie will be stored as a
   * JWT. See https://deno.land/std@0.140.0/http/cookie.ts#L9 for a list
   * of other cookie options.
   */
  set: (name: string, value: string, opt?: (
    Omit<http.Cookie, "name" | "value"> & { signed?: boolean; }
  )) => void;
  /**
   * Deletes a cookie. The scope of the deletion can be limited using the
   * provided path and domain options.
   */
  delete: (name: string, opt?: {
    path?: string;
    domain?: string;
  }) => void;
  /** Returns a copy of the current unsigned cookies. */
  unsigned: () => Record<string, string>;
  /** Returns a copy of the current signed cookies. */
  signed: () => Record<string, string>;
  /** Syncs updates to the response Headers provided during initialization. */
  sync: () => Promise<void>;
}

/**
 * Creates a new CookieJar interface tied to the given . Keys can be provided for cookie signing. If no
 * keys are provided, a library-wide random fallback key will be used. The
 * fallback key is lost when the server shuts down.
 *
 * The Cookie interface provides synchronous access to its key-value pairs, but
 * it needs to be asynchronously `.sync()`-ed before updates are reflected in
 * the given response Headers.
 *
 * ```ts
 * import { bakeCookie } from "https://deno.land/x/cav/cookie.ts";
 * import { serve } from "https://deno.land/std/http/mod.ts";
 *
 * async function handler(req: Request) {
 *   const headers = new Headers();
 *   const cookie = await bakeCookie({
 *     req, 
 *     headers,
 *     keys: ["secret-key"],
 *   });
 *
 *   // Ex: Get a previously set cookie
 *   const session = cookie.get("session", { signed: true });
 *
 *   // Ex: Set a new cookie
 *   cookie.set("session", "1234", { signed: true, secure: true });
 *
 *   // Ex: Delete an old cookie
 *   cookie.delete("session");
 *
 *   // Ex: Get a record of all current cookies
 *   const signedCookies: Record<string, string> = cookie.signed();
 *   const unsignedCookies: Record<string, string> = cookie.unsigned();
 *
 *   // Required: Sync cookie updates before constructing the Response
 *   await cookie.sync();
 *   return new Response("hello", { headers });
 * }
 *
 * serve(handler);
 * ```
 */
export async function bakeCookie(init: {
  req: Request;
  headers: Headers;
  keys?: [string, ...string[]];
}): Promise<Cookie> {
  const keys = init.keys || fallbackKeys;
  const unsigned = http.getCookies(init.req.headers);
  const signed: Record<string, string> = {};

  for (const [k, v] of Object.entries(unsigned)) {
    const sig = unsigned[`${k}_sig`];
    if (sig) {
      if (await verify(`${k}=${v}`, sig, keys)) {
        signed[k] = v;
        delete unsigned[k];
      }
    }
  }

  const updates: (
    | {
      op: "set",
      name: string,
      value: string,
      opt?: Omit<http.Cookie, "name" | "value"> & { signed?: boolean; };
    }
    | { op: "delete", name: string, opt?: { path?: string; domain?: string } }
  )[] = [];

  const cookie: Cookie = {
    get(name, opt) {
      return opt?.signed ? signed[name] : unsigned[name];
    },
    set(name, value, opt) {
      updates.push({ op: "set", name, value, opt });

      // If the current request doesn't match the path and domain for the set
      // cookie, don't set our cookie since the client's cookie for this path
      // and domain won't be set either
      if (opt?.path || opt?.domain) {
        const p = new URLPattern({
          hostname: opt.domain ? `{*.}?${opt.domain}` : "*",
          pathname: opt.path ? `${opt.path}/*?` : "*",
        });
        if (!p.exec(init.req.url)) {
          return;
        }
      }

      // Update our copy if the cookie path and domain matched the current
      // request or weren't specified.
      if (opt?.signed) {
        signed[name] = value;
      } else {
        unsigned[name] = value;
      }
    },
    delete(name, opt) {
      updates.push({ op: "delete", name, opt });
      
      // If the current request doesn't match the path and domain for the
      // deleted cookie, don't delete our cookie since the client's cookie for
      // this path and domain won't be deleted either
      if (opt?.path || opt?.domain) {
        const p = new URLPattern({
          hostname: opt.domain ? `{*.}?${opt.domain}` : "*",
          pathname: opt.path ? `${opt.path}/*?` : "*",
        });
        if (!p.exec(init.req.url)) {
          return;
        }
      }

      delete signed[name];
      delete unsigned[name];
    },
    signed() {
      return { ...signed };
    },
    unsigned() {
      return { ...unsigned };
    },
    async sync() {
      let u = updates.shift();
      while (u) {
        if (u.op === "delete") {
          http.deleteCookie(init.headers, u.name, u.opt);
        }

        if (u.op === "set") {
          http.setCookie(init.headers, {
            ...u.opt,
            name: u.name,
            value: u.value,
          });
          if (u.opt?.signed) {
            http.setCookie(init.headers, {
              ...u.opt,
              name: `${u.name}_sig`,
              value: await sign(`${u.name}=${u.value}`, keys[0]),
            });
          }
        }

        u = updates.shift();
      }
    },
  };

  return cookie;
}

