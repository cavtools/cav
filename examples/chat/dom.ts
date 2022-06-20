// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

import { $, client } from "../../dom.ts";
import type { ChatRoom } from "./app.ts";

export function index() {
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

export function auth() {
  const name = $<HTMLInputElement>(".name")!;
  const submit = $<HTMLButtonElement>(".submit")!;

  name.oninput = () => {
    submit.disabled = !name.value;
  };
  name.dispatchEvent(new Event("input"));

  name.onfocus = () => {
    name.select();
  };
  name.focus();
}

export async function chat() {
  const newMsg = $<HTMLLabelElement>(".new-msg")!;
  const newMsgText = $<HTMLTextAreaElement>(".new-msg textarea")!;

  // Auto-sizing text area
  newMsgText.oninput = () => {
    newMsg.dataset.value = newMsgText.value;
    window.scrollTo(0, document.body.scrollHeight);
  };
  newMsgText.dispatchEvent(new Event("input")); // Auto-size on load

  const ws = client<ChatRoom>(self.location.pathname).ws({ socket: true });
}