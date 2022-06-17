// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

// This should've been called iso.ts, and it should've re-exported all
// browser-compatible code in addition to the utilities below. See
// https://github.com/connorlogin/cav/issues/57 for more info on why it doesn't

/**
 * Filters out any non-string or empty string arguments and joins the rest to
 * create a class list for an HTML element.
 */
export function cx(...args: unknown[]): string {
  return args.filter(a => a && typeof a === "string").join(" ");
}