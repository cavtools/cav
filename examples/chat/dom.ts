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
  const messages = $(".messages")!;

  // Auto-size text area
  newMsgText.oninput = () => {
    newMsg.dataset.value = newMsgText.value;
    window.scrollTo(0, document.body.scrollHeight);
  };
  newMsgText.dispatchEvent(new Event("input"));

  const msgGroup = $<HTMLTemplateElement>("#msg-group")!.content;
  const appendNewMessage = (arg: { from: string; text: string }) => {
    const lastGroup = $(".msg-group:last-child");
    if (lastGroup && $(".user", lastGroup)!.innerText === arg.from) {
      const p = document.createElement("p");
      p.classList.add("msg");
      p.innerText = arg.text;
      lastGroup.append(p);
      return;
    }

    const newGroup = msgGroup.cloneNode(true) as ParentNode;
    $(".user", newGroup)!.innerText = arg.from;
    $(".msg", newGroup)!.innerText = arg.text;
    messages.append(newGroup);
  };

  const ws = client<ChatRoom>(self.location.pathname).ws({ socket: true });
  ws.onopen = () => {
    newMsgText.onkeydown = ev => {
      if (ev.key === "Enter" && !ev.getModifierState("Shift")) {
        ev.preventDefault();
        ws.send(newMsgText.value);
        newMsgText.value = "";
        newMsg.dataset.value = "";
      }
    };
  };
  ws.onclose = () => {
    console.log("socket closed");
  };
  ws.onmessage = (recv) => {
    console.log("message received", recv);
    appendNewMessage(recv);
  };
  ws.onerror = (err) => {
    console.error("socket error", err);
  };
}