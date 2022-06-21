// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

import { $, make, client } from "./deps_dom.ts";
import { chatMsg, chatGroup } from "./chat_html.ts";
import type { ChatRoom } from "./app.ts";

export async function chatInit() {
  const inputLabel = $<HTMLLabelElement>(".input")!;
  const inputText = $<HTMLTextAreaElement>("textarea", inputLabel)!;
  const messages = $(".messages")!;

  const renderMessage = (x: { from: string; text: string; self: boolean }) => {
    const lastGroup = $(".group:last-child", messages);
    if (lastGroup && $(".user", lastGroup)!.innerText === x.from) {
      lastGroup.append(make(chatMsg(x.text)));
      return;
    }
    messages.append(make(chatGroup(x)));
  };

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

  // Setup the chat messages web socket
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