// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { basePage } from "./base_html.ts";

export function indexPage() {
  return basePage({
    pageId: "index",
    body: /*html*/`
      <a class="new-chat" href="/chat">Chat</a>
    `,
  });
}

export function indexCss() {
  return /*css*/`
    /* !DOCTYPE css */
    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .new-chat {
      display: block;
      cursor: pointer;
      background: #444;
      color: #eee;
      padding: 0.5em 0.75em;
      border-top: 4px solid transparent; /* fix */
      border: 0;
      font-size: 2em;
      border-radius: 1rem;
    }
    .new-chat.disabled {
      cursor: default !important;
      opacity: 0.75;
    }
  `;
}