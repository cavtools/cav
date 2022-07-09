// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

import { $, make } from "./deps.ts";
import { message, messageGroup } from "../mod.ts";

export * from "./room.ts";

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

export function authInit() {
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

function scrolledToBottom() {
  const bottomPos = Math.round(window.innerHeight + window.scrollY);
  return bottomPos >= document.body.offsetHeight;
}

export async function chatInit() {
  const inputLabel = $<HTMLLabelElement>(".input")!;
  const inputText = $<HTMLTextAreaElement>("textarea", inputLabel)!;
  const messages = $(".messages")!;
  const body = document.body;

  const renderMessage = (x: { from: string; text: string; self: boolean }) => {
    const wasAtBottom = scrolledToBottom();
    const lastGroup = $(".group:last-child", messages);
    if (lastGroup && $(".user", lastGroup)!.innerText === x.from) {
      lastGroup.append(make(message(x.text)));
    } else {
      messages.append(make(messageGroup(x)));
    }
    if (wasAtBottom) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  };

  // Feature: Messages received on the web socket are escaped and rendered to
  // the message list
  const ws = rpc.connect();
  ws.onopen = () => {
    console.log("socket opened");
  };
  ws.onclose = () => {
    throw new Error("TODO: socket closed");
  };
  ws.onmessage = (recv) => {
    // TODO: Escape the received text
    renderMessage(recv);
  };

  // Feature: Pressing enter selects the textarea if it's not already
  self.onkeydown = (ev) => {
    if (ev.key === "Enter" && document.activeElement !== inputText) {
      ev.preventDefault();
      inputText.select();
    }
  };

  // Feature: Auto-size the textarea when text is input
  inputText.oninput = () => {
    // https://css-tricks.com/the-cleanest-trick-for-autogrowing-textareas/
    inputLabel.dataset.value = inputText.value;
    window.scrollTo(0, document.body.scrollHeight);
  };

  // Feature: Auto-size and focus the textarea on page load
  inputText.dispatchEvent(new Event("input")); 
  inputText.focus();

  // Feature: Send messages when enter is pressed while the input is focused.
  // Pressing enter while holding shift inputs a newline instead
  inputText.onkeydown = async ev => {
    if (ev.key === "Enter" && !ev.getModifierState("Shift")) {
      ev.preventDefault();
      inputText.disabled = true;
      try {
        await rpc.send(inputText.value);
        inputText.value = "";
        inputLabel.dataset.value = "";
      } catch (err) {
        console.error(err);
      }
      inputText.disabled = false;
    }
  };

  // Feature: Clicking on a non-message area focuses the input
  body.onclick = ev => {
    if (ev.target === messages || ev.target === body) {
      inputText.select();
    }
  };
}