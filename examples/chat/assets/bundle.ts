// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { $ } from "../../../browser.ts";

const newMsg = $(".new-msg") as HTMLElement;
const newMsgText = $(".new-msg__text") as HTMLTextAreaElement;

newMsgText.oninput = () => {
  newMsg.dataset.value = newMsgText.value;
  window.scrollTo(0, document.body.scrollHeight);
};
newMsgText.dispatchEvent(new Event("input"));