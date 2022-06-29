// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import * as baseHtml from "./base/html.ts";

export function index() {
  return baseHtml.page({
    head: /*html*/`
      <link rel="stylesheet" href="/index.css">
      <script type="module">
        import * as dom from "/dom.ts";
        dom.indexInit();
      </script>
    `,
    body: /*html*/`
      <a class="chat" href="/new">Chat</a>
    `,
  });
}