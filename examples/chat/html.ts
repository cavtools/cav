// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { base, baseCss } from "./_html.ts";

export * as room from "./room/html.ts";

export function index() {
  return base({
    head: /*html*/`
      <link rel="stylesheet" href="/index.css">
      <script type="module">
        import * as dom from "/dom.ts";
        dom.indexInit();
      </script>
    `,
    body: /*html*/`
      <a class="chat" href="/chat">Chat</a>
    `,
  });
}

export function indexCss() {
  return /*css*/`
    ${baseCss()}
    
    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .chat {
      display: block;
      cursor: pointer;
      background: #444;
      color: #eee;
      padding: 0.5em 0.75em;
      border: 0;
      border-top: 5px solid transparent; /* fix */
      font-size: 2em;
      border-radius: 1rem;
    }
    .chat.disabled {
      cursor: default !important;
      opacity: 0.75;
    }
  `;
}