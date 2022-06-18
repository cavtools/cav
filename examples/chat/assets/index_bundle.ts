// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { $ } from "./deps.ts";

const newChat = $<HTMLButtonElement>(".new-chat")!;
newChat.onclick = (e) => {
  e.preventDefault();
  newChat.disabled = true;
  newChat.innerText = "Take a deep breath...";
  self.location.href = "/chat";
};