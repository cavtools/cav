// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="esnext" />

export * from "./client.ts";
export * from "./parser.ts";
export * from "./serial.ts";
export * from "./ws.ts";

/** Creates a new DocumentFragment using the provided HTML. */
export function make(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

/**
 * Shorthand for `document.querySelector`. If a second `parent` node is
 * provided, it will be searched instead of the document.
 */
export function $<T extends Element = HTMLElement>(
  selector: string,
  parent: ParentNode = document,
): T | null {
  return parent.querySelector(selector);
}

/**
 * Shorthand for `document.querySelectorAll`. If a second `parent` node is
 * provided, it will be searched instead of the document.
 */
export function $$<T extends Element = HTMLElement>(
  selector: string,
  parent: ParentNode = document,
): NodeListOf<T> {
  return parent.querySelectorAll(selector);
}