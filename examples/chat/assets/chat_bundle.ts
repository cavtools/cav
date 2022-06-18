// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { $, client } from "./deps.ts";
import type { MainRouter } from "../main.ts";

const messages = $(".messages")!;
const msgGroupTemplate = $<HTMLTemplateElement>("#msg-group")!.content;
const newMsg = $(".new-msg")!;
setup();

async function setup() {
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

  // If initiating the web socket connection fails because the user hasn't
  // claimed a name, do that
  
}

// messages.appendChild(msgGroupTemplate.cloneNode(true));