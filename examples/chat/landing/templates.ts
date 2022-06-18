// Copyright 2022 Connor Logan. All rights reserved. MIT License.

export function html() {
  return /*html*/`
    <!DOCTYPE html>
    <html lang="en"><head>

      <title>Chat</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="/base.css">
      <style>${css}</style>

      <script type="module">
        import { landingInit } from "/bundle.ts";
        landingInit();
      </script>

    </head><body class="center">

      <noscript>This real-time chat application requires JavaScript.</noscript>
      
      <a class="new-chat" href="/create">Chat</a>

    </body></html>
  `;
}

const css = /*css*/`
  .new-chat {
    cursor: pointer;
    background: #444;
    color: #eee;
    height: 2em;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.75em;
    border: 0;
    border-radius: 0.5em;
    font-size: 2em;
    /* For some reason, the text moves up slightly when buttons are anchors */
    padding-top: 0.1em;
  }
  .new-chat.disabled {
    cursor: default !important;
    opacity: 0.75;
  }

  .center {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }
`;