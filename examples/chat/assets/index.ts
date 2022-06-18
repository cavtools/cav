// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

import { $ } from "../browser_deps.ts";

export function initLanding() {
  const newChat = $<HTMLAnchorElement>(".new-chat")!;
  newChat.onclick = (e) => {
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
