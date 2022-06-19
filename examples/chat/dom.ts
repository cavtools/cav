// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

import { $ } from "../../dom.ts";

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
  const input = $<HTMLInputElement>(".input")!;
  const submit = $<HTMLButtonElement>(".submit")!;

  input.oninput = () => {
    submit.disabled = !input.value;
  };
  input.dispatchEvent(new Event("input"));

  input.onfocus = () => {
    input.select();
  };
}

export async function chat() {
  const newMsg = $(".new-msg")!;

  // The css needs the value of the textarea to be synced with the data-value
  // attribute on its parent <label>. In case the user goes to a different page
  // and hit the back button, the data-value should be set on startup as well as
  // keypress so the text displays correctly on initial page load
  const textarea = $<HTMLTextAreaElement>(".new-msg__text")!;
  textarea.oninput = () => {
    newMsg.dataset.value = textarea.value;
    window.scrollTo(0, document.body.scrollHeight);
  };
  textarea.dispatchEvent(new Event("input"));
}