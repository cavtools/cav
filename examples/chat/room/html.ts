// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import { base, baseCss } from "../_html.ts";

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

export function authCss() {
  return /*css*/`
    ${baseCss()}

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
          <textarea rows="1" placeholder="Type to say something"></textarea>
        </label>
      </main>
    `,
  });
}

export function chatCss() {
  return /*css*/`
    ${baseCss()}
    
    .room {
      width: 100%;
      max-width: 35em;
      flex: 1 0;
      display: flex;
      flex-direction: column;
      padding: 1.5em;
    }
    
    .messages {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    
    .input {
      display: grid;
      align-items: stretch;
      position: relative;
      margin: 2em 0 0.5em 0;
      border-radius: 1.5em;
    }
    .input::after {
      content: attr(data-value) " ";
      white-space: pre-wrap;
      visibility: hidden;
      grid-area: 1 / 1;
      padding: 0.75em 1em;
    }
    .input textarea {
      grid-area: 1 / 1;
      resize: none;
      border-radius: 1.5em;
      padding: 0.75em 1em;
      overflow: hidden;
    }
    .input textarea:focus {
      border-color: transparent;
    }
    .input textarea:focus::placeholder {
      color: transparent;
    }

    ${messageGroupCss()}
    ${messageCss()}
  `;
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

function messageGroupCss() {
  return /*css*/`
    .group {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      max-width: 60%;
      margin: 0.5em 0;
    }
    .group.right {
      align-items: flex-end;
      align-self: flex-end;
    }
    
    .user {
      color: #9A9A9A;
      font-size: 0.9em;
      margin: 0.25em;
    }
  `;
}

export function message(text: string) {
  return /*html*/`
    <p class="msg">${text}</p>
  `;
}

function messageCss() {
  return /*css*/`
    .msg {
      background: #3B3B3D;
      color: white;
      padding: 0.6em 0.8em 0.5em 0.8em;
      text-align: left;
      margin: 0.15em 0.75em;
      border-radius: 1.25em;
    }
    .right .user + .msg {
      border-radius: 1.25em 0.25em 1.25em 1.25em;
    }
    .user + .msg {
      border-radius: 0.25em 1.25em 1.25em 1.25em;
    }
  `;
}