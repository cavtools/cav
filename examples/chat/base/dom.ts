// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

import "../deps_dom.ts";

export function isVisible(elt: HTMLElement) {
  const { top, bottom } = elt.getBoundingClientRect();
  return (top >= 0) && (bottom <= window.innerHeight);
}

export function scrolledToBottom() {
  const bottomPos = Math.round(window.innerHeight + window.scrollY);
  return bottomPos >= document.body.offsetHeight;
}