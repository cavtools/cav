// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

function page({ pageId, body }: {
  pageId: string;
  body: string;
}) {
  return /*html*/`
    <!DOCTYPE html><html lang="en"><head>

      <title>Chat</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="/base.css">
      <link rel="stylesheet" href="/${pageId}.css">
      <script type="module">
        import { ${pageId}Page } from "/bundle.ts";
        ${pageId}Page();
      </script>

    </head><body class="center">

      <noscript>This real-time chat application requires JavaScript.</noscript>

      ${body}

    </body></html>
  `;
}

export function indexPage() {
  return page({
    pageId: "index",
    body: /*html*/`
      <a class="new-chat" href="/chat">Chat</a>
    `,
  });
}

export function authPage() {
  return  page({
    pageId: "auth",
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
  return page({
    pageId: "chat",
    body: /*html*/`
      <main class="room">
        <div class="messages"></div>
        <label class="input">
          <textarea rows="1" placeholder="Type to say something"></textarea>
        </label>
      </main>
    `,
  });
}

export function chatMsg(text: string) {
  return /*html*/`
    <p class="msg">${text}</p>
  `;
}

export function chatGroup(x: {
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
      ${chatMsg(x.text)}
    </section>
  `;
}