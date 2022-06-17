/**
 * These functions are copied over from the Deno standard library, with possible
 * minor/negligible adaptations. The license for the standard library is as
 * follows:
 *
 * MIT License Copyright 2018-2022 the Deno authors.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { hex } from "./deps.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// These next three definitions come from
// https://deno.land/std@0.145.0/http/file_server.ts

/** Algorithm used to determine etag */
export type EtagAlgorithm =
  | "fnv1a"
  | "sha-1"
  | "sha-256"
  | "sha-384"
  | "sha-512";

// The fnv-1a hash function.
function fnv1a(buf: string): string {
  let hash = 2166136261; // 32-bit FNV offset basis
  for (let i = 0; i < buf.length; i++) {
    hash ^= buf.charCodeAt(i);
    // Equivalent to `hash *= 16777619` without using BigInt
    // 32-bit FNV prime
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) +
      (hash << 24);
  }
  // 32-bit hex string
  return (hash >>> 0).toString(16);
}

// Generates a hash for the provided string
export async function createEtagHash(
  message: string,
  algorithm: EtagAlgorithm = "fnv1a",
): Promise<string> {
  if (algorithm === "fnv1a") {
    return fnv1a(message);
  }
  const msgUint8 = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest(algorithm, msgUint8);
  return decoder.decode(hex.encode(new Uint8Array(hashBuffer)));
}

// This next function comes from https://deno.land/std@0.145.0/http/util.ts

/** Returns true if the etags match. Weak etag comparisons are handled. */
export function compareEtag(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  if (a.startsWith("W/") && !b.startsWith("W/")) {
    return a.slice(2) === b;
  }
  if (!a.startsWith("W/") && b.startsWith("W/")) {
    return a === b.slice(2);
  }
  return false;
}

// This function is adapted from
// https://deno.land/std@0.145.0/http/file_server.ts

/** Checks if a response to a request should 304 based on etag headers. */
export function should304({ req, etag, modified }: {
  req: Request,
  etag: string,
  modified: Date,
}): boolean {
  const noneMatch = req.headers.get("if-none-match");
  const modifiedSince = req.headers.get("if-modified-since");
  return !!(
    (noneMatch && compareEtag(noneMatch, etag)) ||
    (noneMatch === null && modifiedSince && (
      modified.getTime() < new Date(modifiedSince).getTime() + 1000
    ))
  )
}

