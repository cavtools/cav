// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http, base64 } from "./deps.ts";

/**
 * A (mostly) synchronous interface for accessing HTTP cookies tied to a Request
 * and response Headers instance.
 */
export interface Cookie {
  /**
   * Gets a cookie. Returns `undefined` if the cookie isn't set or the cookie's
   * signature didn't match its value.
   */
  get: (name: string, opt?: { signed?: boolean }) => string | undefined;
  /**
   * Sets a cookie. If the cookie is signed, a corresponding signature cookie
   * will be set as well. See https://deno.land/std@0.140.0/http/cookie.ts#L9
   * for a list of other cookie options.
   */
  set: (name: string, value: string, opt?: http.Cookie & {
    signed?: boolean;
  }) => void;
  /**
   * Deletes a cookie. If the cookie was signed, its signature cookie will also
   * be deleted. The scope of the deletion can be limited using the provided
   * path and domain options.
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

const random = new Uint8Array(32);
crypto.getRandomValues(random);
const decoder = new TextDecoder();
const rand = decoder.decode(random);
const fallbackKeys: [string, ...string[]] = [base64.encode(rand)];

/**
 * Creates a new Cookie interface that's "baked" with the given Request and
 * response Headers instance. Keys can be provided for cookie signing. If no
 * keys are provided, a library-level random fallback key will be used. The
 * fallback key is lost when the server shuts down.
 *
 * The Cookie instance provides synchronous access to its key-value pairs, but
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
    const sig = unsigned[`${k}.sig`];
    if (sig) {
      delete unsigned[`${k}.sig`];
      delete unsigned[k];
      if (await verify(v, sig, keys)) {
        signed[k] = v;
      }
    }
  }

  const updates: (
    | {
      op: "set",
      name: string,
      value: string,
      opt?: http.Cookie & { signed?: boolean; };
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
      // request or weren't specified
      if (opt?.signed) {
        signed[name] = value;
      } else {
        unsigned[name] = value;
      }
    },
    delete(name, opt) {
      updates.push({ op: "delete", name, opt });
      if (signed[name]) {
        updates.push({ op: "delete", name: `${name}.sig`, opt });
      }
      
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
              name: `${u.name}.sig`,
              value: await sign(u.value, keys[0]),
            });
          }
        }

        u = updates.shift();
      }
    },
  };

  return cookie;
}

// I'm caching keys because I don't know the overhead of crypto.subtle.importKey
// REVIEW: I don't know if this is the right thing to do security-wise
const keyCache = new Map<string, CryptoKey>();
const encoder = new TextEncoder();
const signingAlg = { name: "HMAC", hash: "SHA-256" } as const;

async function importKey(key: string): Promise<CryptoKey> {
  let k = keyCache.get(key);
  if (k) {
    return k;
  }

  k = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    signingAlg,
    false,
    ["sign", "verify"],
  );
  keyCache.set(key, k);
  return k;
}

async function verify(
  data: string,
  sig: string,
  keys: [string, ...string[]],
): Promise<boolean> {
  for (const key of keys) {
    const k = await importKey(key);
    if (
      await crypto.subtle.verify(
        signingAlg,
        k,
        base64.decode(sig),
        encoder.encode(data),
      )
    ) {
      return true;
    }
  }
  return false;
}

async function sign(data: string, key: string): Promise<string> {
  const k = await importKey(key);
  return base64.encode(
    await crypto.subtle.sign(
      signingAlg,
      k,
      encoder.encode(data),
    ),
  );
}