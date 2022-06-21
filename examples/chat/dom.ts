// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

import { $, client } from "./deps_dom.ts";
import * as html from "./html.ts";
import type { ChatRoom } from "./app.ts";

function make(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

export function indexPage() {
  const newChat = $<HTMLAnchorElement>(".new-chat")!;
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

export function authPage() {
  const name = $<HTMLInputElement>(".name")!;
  const submit = $<HTMLButtonElement>(".submit")!;

  name.oninput = () => {
    submit.disabled = !name.value;
  };
  name.onfocus = () => {
    name.select();
  };
  name.dispatchEvent(new Event("input"));
  name.focus();
}

export async function chatPage() {
  const inputLabel = $<HTMLLabelElement>(".input")!;
  const inputText = $<HTMLTextAreaElement>("textarea", inputLabel)!;
  const messages = $(".messages")!;

  self.onkeydown = (ev) => {
    if (ev.key === "Enter" && document.activeElement !== inputText) {
      ev.preventDefault();
      inputText.select();
    }
  };

  // Auto-sizing for the textarea
  inputText.oninput = () => {
    inputLabel.dataset.value = inputText.value;
    window.scrollTo(0, document.body.scrollHeight);
  };
  inputText.dispatchEvent(new Event("input")); // Size on page load
  inputText.focus();

  const renderMessage = (x: { from: string; text: string; self: boolean }) => {
    const lastGroup = $(".group:last-child", messages);
    if (lastGroup && $(".user", lastGroup)!.innerText === x.from) {
      lastGroup.append(make(html.chatMsg(x.text)));
      return;
    }

    const msg = make(html.chatGroup(x));
    messages.append(msg);
  };

  const ws = client<ChatRoom>(self.location.pathname).ws({ socket: true });
  ws.onopen = () => {
    inputText.onkeydown = ev => {
      if (ev.key === "Enter" && !ev.getModifierState("Shift")) {
        ev.preventDefault();
        ws.send(inputText.value);
        inputText.value = "";
        inputLabel.dataset.value = "";
      }
    };
  };
  ws.onclose = () => {
    console.log("socket closed");
  };
  ws.onmessage = (recv) => {
    console.log("message received", recv);
    renderMessage(recv);
  };
  ws.onerror = (err) => {
    console.error("socket error", err);
  };
}