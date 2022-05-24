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

/** Interface for reading and updating the cookies for a Request. */
export interface CookieJar {
  /** Gets an up-to-date cookie value. */
  get: (name: string) => string | undefined;
  /**
   * Updates a cookie's value. Cookies with the `signed` option set to true will
   * be stored as a JWT with the header removed, signed using the keys provided
   * when the CookieJar was created.
   */
  set: (name: string, value: string, opt?: CookieSetOptions) => void;
  /** Removes a cookie by clearing and expiring any previous value. */
  delete: (name: string, opt?: CookieDeleteOptions) => void;
  /**
   * Returns an array of all cookie [name, value] pairs. `[...signed,
   * ...unsigned]`
   */
  entries: () => [string, string][];
  /** Checks if a cookie is set. */
  has: (name: string) => boolean;
  /** Checks if a cookie is signed or not. Non-existent cookies return false. */
  isSigned: (name: string) => boolean;
  /**
   * Calculates the set-cookie headers for all updates applied to this CookieJar
   * and appends them to the given Headers instance. Note that this operation is
   * asynchronous while all other operations are synchronous.
   */
  setCookies: (headers: Headers) => Promise<void>;
}

/** Options for setting a cookie in a CookieJar. */
export interface CookieSetOptions extends Omit<http.Cookie, "name" | "value"> {
  signed?: boolean;
}

/** Options for deleting a cookie from a CookieJar. */
export interface CookieDeleteOptions {
  path?: string;
  domain?: string;
}

/** Creates a new CookieJar instance for managing a Request's cookies. */
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

      if (typeof exp === "number" && Date.now() > exp) {
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

      // If there was an expiration date and it's expired, the cookie is deleted
      if (opt?.expires && opt.expires.getTime() < Date.now()) {
        signed.delete(name);
        unsigned.delete(name);
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
    setCookies: async (headers) => {
      for (const u of updates) {
        if (u.op === "delete") {
          http.deleteCookie(headers, u.name, u.opt);
          continue;
        }

        // u.op === "set"
        if (u.opt?.signed) {
          // If both expires and max age are specified, only max age will be
          // used and the expires date will be overwritten
          if (u.opt.maxAge) {
            u.opt.expires = new Date(Date.now() + 1000 * u.opt.maxAge);
          }

          const val = (
            u.opt?.expires ? [u.name, u.value, u.opt.expires.getTime()]
            : [u.name, u.value]
          );

          // Chop off the jwt header to save space
          const jwt = (await encodeJwt(val, keys))
            .split(".").slice(1).join(".");

          http.setCookie(headers, { ...u.opt, name: u.name, value: jwt });
          continue;
        }

        http.setCookie(headers, { ...u.opt, name: u.name, value: u.value });
      }
    },
  };
}