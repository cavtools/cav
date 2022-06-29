// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

import * as html from "./html.ts";
import type * as server from "./server.ts";
import { $, make, client } from "../deps_dom.ts";

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

// function isVisible(elt: HTMLElement) {
//   const { top, bottom } = elt.getBoundingClientRect();
//   return (top >= 0) && (bottom <= window.innerHeight);
// }

const appClient = client<server.App>(self.location.pathname);

export async function chatInit() {
  const inputLabel = $<HTMLLabelElement>(".input")!;
  const inputText = $<HTMLTextAreaElement>("textarea", inputLabel)!;
  const messages = $(".messages")!;
  const body = document.body;

  const renderMessage = (x: { from: string; text: string; self: boolean }) => {
    const wasAtBottom = scrolledToBottom();
    const lastGroup = $(".group:last-child", messages);
    if (lastGroup && $(".user", lastGroup)!.innerText === x.from) {
      lastGroup.append(make(html.message(x.text)));
    } else {
      messages.append(make(html.messageGroup(x)));
    }
    if (wasAtBottom) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  };

  // Feature: Messages received on the web socket are escaped and rendered to
  // the message list
  const ws = appClient.ws({ socket: true });
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
        await appClient.send({ body: inputText.value });
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