// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

export * as room from "./room/html.ts";

import { base } from "./base/html.ts";

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
      <a class="chat" href="/new">Chat</a>
    `,
  });
}