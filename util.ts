// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

/**
 * Filters out any non-string or empty string arguments and joins them together
 * to create a class list for an HTML element.
 */
export function cx(...args: unknown[]): string {
  return args.filter(a => a && typeof a === "string").join(" ");
}