// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { base64 } from "./deps.ts";

// TODO: Allow changing the header (but not alg yet)  
// TODO: This is a very minimal API that doesn't do expiration checks or
// anything like that. Should it?  
// TODO: Make this browser compatible by removing the base64 dependency and
// writing your own version with the help of
// https://developer.mozilla.org.cach3.com/Web/API/WindowBase64/Base64_encoding_and_decoding  
// TODO: Support keygrip?

const header = base64.encode(JSON.stringify({ alg: "HS256" }));
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
  keys: string[],
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

/**
 * Creates a new JWT with the given payload, which is passed into JSON.stringify
 * before encoding. If no key is specified, a securely random transient fallback
 * will be used. The fallback key is only generated once during startup and it's
 * lost when the Deno process quits.
 *
 * If multiple keys are specified, only the first key will be used.
 *
 * JWT header: `{ "alg": "HS256" }`
 */
export async function encodeJwt(
  payload: unknown,
  keys = fallback as string | string[],
): Promise<string> {
  const key = Array.isArray(keys) ? keys[0] : keys;
  const jwt = `${header}.${base64.encode(JSON.stringify(payload))}`;
  const sig = await sign(jwt, key);
  return `${jwt}.${sig}`;
}

/**
 * Verifies the JWT and returns its parsed payload object. If verification
 * fails, an error will be thrown. Verification will fail if:
 *
 * - The header isn't `{ "alg": "HS256" }`
 * - The JWT was signed with an unknown key
 * - The signature doesn't match its header/payload
 *
 * Multiple keys can be provided to handle key rollover. If no keys are
 * provided, the module-level random fallback key will be used.
 */
export async function decodeJwt(
  jwt: string,
  keys = fallback as string | string[],
): Promise<unknown> {
  const parts = jwt.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid JWT - bad format");
  }

  try {
    const header = decoder.decode(base64.decode(parts[0]));
    const h = JSON.parse(header);
    if (h.alg !== "HS256") {
      throw null;
    }
  } catch {
    throw new Error("Invalid JWT - unsupported header");
  }

  keys = Array.isArray(keys) ? keys : [keys];
  if (! await verify(`${parts[0]}.${parts[1]}`, parts[2], keys)) {
    throw new Error("Invalid JWT - bad signature");
  }

  try {
    const payload = decoder.decode(base64.decode(parts[1]));
    return JSON.parse(payload);
  } catch {
    throw new Error("Invalid JWT - bad payload");
  }
}