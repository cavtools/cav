// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

import * as html from "./html.ts";
import { $, make, client } from "../deps_dom.ts";
import type { RoomRouter } from "./server.ts";

const roomClient = client<RoomRouter>(self.location.pathname);

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

export async function chatInit() {
  const inputLabel = $<HTMLLabelElement>(".input")!;
  const inputText = $<HTMLTextAreaElement>("textarea", inputLabel)!;
  const messages = $(".messages")!;

  const renderMessage = (x: { from: string; text: string; self: boolean }) => {
    const lastGroup = $(".group:last-child", messages);
    if (lastGroup && $(".user", lastGroup)!.innerText === x.from) {
      lastGroup.append(make(html.message(x.text)));
      return;
    }
    messages.append(make(html.messageGroup(x)));
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
  const ws = roomClient.ws({ socket: true });
  ws.onopen = () => {
    console.log("socket opened");
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
}