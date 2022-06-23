// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { base } from "../base/html.ts";

export function auth() {
  return base({
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

export function chat() {
  return base({
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
    <section class="${[
      "group",
      x.self && "right",
    ].filter(c => !!c).join(" ")}">
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