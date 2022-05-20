// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { base64 } from "./deps.ts";

const header = base64.encode(JSON.stringify({
  alg: "HS256",
  typ: "JWT",
}));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const random = new Uint8Array(32);
crypto.getRandomValues(random);
const rand = decoder.decode(random);
const fallback = base64.encode(rand);
const signingAlg = { name: "HMAC", hash: "SHA-256" } as const;

// I'm caching keys because I don't know the overhead of crypto.subtle.importKey
// REVIEW: I don't know for sure if any of this is correct security-wise
const keyCache = new Map<string, CryptoKey>();

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

async function verify(
  data: string,
  sig: string,
  keys: [string, ...string[]],
): Promise<boolean> {
  try {
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
  } catch {
    // continue
  }
  return false;
}

/**
 * Creates a new JWT with the given payload. If no key is specified, a securely
 * random fallback will be used. The fallback key is only generated once during
 * startup and it's lost when the Deno process quits.
 *
 * JWT header: `{ "alg": "HS256", "typ": "JWT" }`
 */
export async function encodeJwt(
  payload: Record<string, unknown>,
  key = fallback,
): Promise<string> {
  const jwt = `${header}.${base64.encode(JSON.stringify(payload))}`;
  const sig = await sign(jwt, key);
  return `${jwt}.${sig}`;
}

/**
 * Verifies the JWT and returns its parsed payload object. If verification
 * fails, an error will be thrown. Verification will fail if:
 *
 * - The header isn't `{ "alg": "HS256", "typ": "JWT" }`
 * - The JWT was signed with an unknown key
 * - The signature doesn't match its header/payload
 * - The "exp" claim exists on the payload and it's set to a date in the past
 *
 * Multiple keys can be provided to handle key rollover. If no keys are
 * provided, the module-level random fallback key will be used.
 */
export async function decodeJwt(
  jwt: string,
  keys = [fallback] as [string, ...string[]],
): Promise<Record<string, unknown>> {
  const parts = jwt.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid JWT - bad format");
  }
  
  if (! await verify(`${parts[0]}.${parts[1]}`, parts[2], keys)) {
    throw new Error("Invalid JWT - invalid signature");
  }

  try {
    const header = JSON.parse(decoder.decode(base64.decode(parts[0])));
    if (
      Object.keys(header).length !== 2 ||
      header.alg !== "HS256" ||
      header.typ !== "JWT"
    ) {
      throw null;
    }
  } catch {
    throw new Error("Invalid JWT - bad header");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(decoder.decode(base64.decode(parts[1])));
  } catch {
    throw new Error("Invalid JWT - bad payload");
  }

  try {
    const exp = payload.exp;
    if (typeof exp === "string" && new Date(exp).getTime() < Date.now()) {
      throw null;
    }
  } catch {
    throw new Error("Invalid JWT - expired");
  }

  return payload;
}