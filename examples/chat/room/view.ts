// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import * as base from "../base/html.ts";
import { cx } from "../deps_iso.ts";

export function authPage() {
  return base.page({
    head: /*html*/`
      <link rel="stylesheet" href="/auth.css">
      <script type="module">
        import * as dom from "/dom.ts";
        dom.room.authInit();
      </script>
    `,
    body: /*html*/`
      <form class="form" method="POST">
        <input
          class="name"
          type="text"
          name="name"
          placeholder="What's your name?"
        >
        <button type="submit" class="submit" disabled>Join</button>
      </form>
    `,
  });
}

export function chatPage() {
  return base.page({
    head: /*html*/`
      <link rel="stylesheet" href="/chat.css">
      <script type="module">
        import * as dom from "/dom.ts";
        dom.room.chatInit();
      </script>
    `,
    body: /*html*/`
      <main class="room">
        <div class="messages">
          <!-- messageGroup() -->
        </div>
        <label class="input">
          <textarea
            rows="1"
            placeholder="Say something"
          ></textarea>
        </label>
      </main>
    `,
  });
}

export function messageGroup(x: {
  from: string;
  text: string;
  self: boolean;
}) {
  return /*html*/`
    <section class="${cx("group", x.self && "right")}">
      <header class="user">${x.from}</header>
      ${message(x.text)}
    </section>
  `;
}

export function message(text: string) {
  return /*html*/`
    <p class="msg">${text}</p>
  `;
}