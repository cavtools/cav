// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

export * as room from "./room/dom.ts";

import { $ } from "./deps_dom.ts";

export function indexInit() {
  const newChat = $<HTMLAnchorElement>(".chat")!;
  newChat.onclick = () => {
    newChat.classList.add("disabled");
    newChat.innerText = "Take a deep breath...";
  };
  self.onunload = () => {
    // If you didn't do this, they'd see the unloading state when they hit the
    // back button from a chat room they just opened
    newChat.innerText = "Chat";
    newChat.classList.remove("disabled");
  };
}