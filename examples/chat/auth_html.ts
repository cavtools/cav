// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { basePage } from "./base_html.ts";

export function authPage() {
  return basePage({
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

export function authCss() {
  return /*css*/`
    /* !DOCTYPE css */
    body {
      justify-content: center;
    }
    
    .form {
      display: flex;
      flex-direction: column;
      color: white;
      position: relative;
    }
    
    .name {
      font-size: 2em;
      border-radius: 0.5em;
      align-self: stretch;
    }
    
    .submit {
      margin: 1.5em 0 0 0;
      font-weight: 700;
      font-size: 1.25em;
      background: transparent;
      padding: 0;
      position: absolute;
      top: calc(50% + 3.5em);
      left: 50%;
      transform: translate(-50%, -50%);
    }
    .submit:disabled {
      visibility: hidden;
    }
  `;
}