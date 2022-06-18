// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="esnext" />

/**
 * Shorthand for `document.querySelector`. If a second `parent` node is
 * provided, it will be searched instead of the document.
 */
export function $(selector: string, parent: ParentNode = document) {
  return parent.querySelector(selector);
}

/**
 * Shorthand for `document.querySelectorAll`. If a second `parent` node is
 * provided, it will be searched instead of the document.
 */
export function $$(selector: string, parent: ParentNode = document) {
  return parent.querySelectorAll(selector);
}