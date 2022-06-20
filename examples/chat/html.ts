// Copyright 2022 Connor Logan. All rights reserved. MIT License.

function base({ pageId, body }: {
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
        import { ${pageId} } from "/bundle.ts";
        ${pageId}();
      </script>

    </head><body class="center">

      <noscript>This real-time chat application requires JavaScript.</noscript>

      ${body}

    </body></html>
  `;
}

export function index() {
  return base({
    pageId: "index",
    body: /*html*/`
      <a class="new-chat" href="/chat">Chat</a>
    `,
  });
}

export function auth() {
  return  base({
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

export function chat() {
  return base({
    pageId: "chat",
    body: /*html*/`
      <main class="room">
        <div class="messages">
          <template id="msg-group">
            <section class="msg-group">
              <header class="user"></header>
              <p class="msg"></p>
            </section>
          </template>
        </div>
  
        <label class="new-msg">
          <textarea rows="1" placeholder="Type to say something"></textarea>
        </label>
      </main>
    `,
  });
}