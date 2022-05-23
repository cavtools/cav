// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { base64 as b64, http } from "./deps.ts";
import { encodeJwt, decodeJwt } from "./jwt.ts";

/**
 * Signed cookies are just HS256 JWTs with the header omitted to save bandwidth.
 * To inspect the cookies as regular JWTs, this header will need to be prepended
 * to the cookie value with a period separator. Like this:
 *
 * ```ts
 * const token = await decodeJwt(COOKIE_JWT_HEADER + "." + value, secretKey);
 * // === ["cookie-name", "cookie-value", <ms after epoch of cookie expiration>]
 * ```
 * 
 * The header JSON is `{ "alg": "HS256" }`.
 */
export const COOKIE_JWT_HEADER = b64.encode(JSON.stringify({ alg: "HS256" }));

function matchesDomainPath(req: Request, domain?: string, path?: string) {
  if (path || domain) {
    const p = new URLPattern({
      hostname: domain ? `{*.}?${domain}` : "*",
      pathname: path ? `${path}/*?` : "*",
    });
    if (!p.exec(req.url)) {
      return false;
    }
  }
  return true;
}

export interface CookieJar {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, opt?: CookieSetOptions) => void;
  delete: (name: string, opt?: CookieDeleteOptions) => void;
  entries: () => [string, string][];
  has: (name: string) => boolean;
  isSigned: (name: string) => boolean;
  applyUpdates: (headers: Headers) => Promise<void>;
}

export interface CookieSetOptions extends Omit<http.Cookie, "name" | "value"> {
  signed?: boolean;
}

export interface CookieDeleteOptions {
  path?: string;
  domain?: string;
}

export async function cookieJar(
  req: Request,
  keys?: string | string[],
): Promise<CookieJar> {
  const unsigned = new Map(Object.entries(http.getCookies(req.headers)));
  const signed = new Map<string, string>();

  const updates: (
    | { op: "set", name: string, value: string, opt?: CookieSetOptions }
    | { op: "delete", name: string, opt?: CookieDeleteOptions }
  )[] = [];

  for (const [k, v] of unsigned.entries()) {
    try {
      const jwt = await decodeJwt(COOKIE_JWT_HEADER + "." + v, keys);
      const [name, value, exp] = jwt as [string, string, number | undefined];
      if (
        name !== k ||
        typeof value !== "string" ||
        (typeof exp !== "number" && typeof exp !== "undefined")
      ) {
        // Leave it alone
        continue;
      }

      if (exp && Date.now() > exp) {
        // DON'T leave it alone. It was valid but it expired, so it should get
        // deleted
        updates.push({ op: "delete", name });
        unsigned.delete(k);
        continue;
      }

      // Valid and not expired, move it over to signed
      signed.set(k, value);
      unsigned.delete(k);
    } catch {
      // Leave it alone
    }
  }

  return {
    get: (name) => {
      return signed.has(name) ? signed.get(name) : unsigned.get(name);
    },
    set: (name, value, opt) => {
      updates.push({ op: "set", name, value, opt });

      // If the current request doesn't match the path and domain for the set
      // options, don't update our copy since the client browser would still
      // send the same cookie if they repeated the current request
      if (!matchesDomainPath(req, opt?.domain, opt?.path)) {
        return;
      }

      if (opt?.signed) {
        signed.set(name, value);
        unsigned.delete(name);
      } else {
        unsigned.set(name, value);
        signed.delete(name);
      }
    },
    delete: (name, opt) => {
      updates.push({ op: "delete", name, opt });

      // See the comment in set()
      if (!matchesDomainPath(req, opt?.domain, opt?.path)) {
        return;
      }

      signed.delete(name);
      unsigned.delete(name);
    },
    entries: () => {
      return [
        ...signed.entries(),
        ...unsigned.entries(),
      ];
    },
    has: (name) => {
      return signed.has(name) || unsigned.has(name);
    },
    isSigned: (name) => {
      return signed.has(name);
    },
    applyUpdates: async (headers) => {
      for (const u of updates) {
        if (u.op === "delete") {
          http.deleteCookie(headers, u.name, u.opt);
          continue;
        }

        // u.op === "set"
        if (u.opt?.signed) {
          const val = (
            u.opt?.expires ? [u.name, u.value, u.opt.expires.getTime()]
            : [u.name, u.value]
          );

          // Chop off the jwt header to save space
          const jwt = (await encodeJwt(val, keys))
            .split(".").slice(1).join(".");

          http.setCookie(headers, { ...u.opt, name: u.name, value: jwt });
        } else {
          http.setCookie(headers, { ...u.opt, name: u.name, value: u.value });
        }
      }
    },
  };
}