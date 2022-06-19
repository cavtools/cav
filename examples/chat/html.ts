// Copyright 2022 Connor Logan. All rights reserved. MIT License.

// The initial <!DOCTYPE html> declaration triggers html content-type detection
const base = ({ pageId, content }: {
  pageId: "index" | "auth" | "chat";
  content: string;
}) => /*html*/`
  <!DOCTYPE html><html lang="en"><head>

    <title>Chat</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/${pageId}.css">

    <script type="module">
      import { ${pageId} } from "/bundle.ts";
      ${pageId}();
    </script>

  </head><body class="center">

    <noscript>This real-time chat application requires JavaScript.</noscript>
    
    ${content}

  </body></html>
`;

// The initial "/* !DOCTYPE css */" comment triggers css content-type detection
const baseCss = () => /*css*/`
  /* !DOCTYPE css */

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    text-rendering: optimizeLegibility;
    letter-spacing: 0.01em;
  }

  :root {
    width: 100%;
    height: 100%;
    font-size: 16px;
    font-family: sans-serif;
  }

  body {
    display: flex;
    align-items: center;
    flex-direction: column;
    width: 100%;
    min-height: 100%;
    background: #333;
    line-height: 1.35;
    letter-spacing: 0.01em;
    position: relative;
  }

  a {
    text-decoration: none;
    font: inherit;
  }
`;

export const index = () => base({
  pageId: "index",
  content: /*html*/`
    <a class="new-chat" href="/chat">Chat</a>
  `,
});

export const indexCss = () => /*css*/`
  ${baseCss()}

  body {
    display: flex;
    align-items: center;
    justify-content: center;
  }

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

export const auth = () => base({
  pageId: "auth",
  content: /*html*/`
    <form class="form" method="POST">
      <input
        class="input"
        type="text"
        name="name"
        placeholder="What's your name?"
      >
      <button type="submit" class="submit">join</button>
    </form>
  `,
});

export const authCss = () => /*css*/`
  ${baseCss()}

  .form {
    display: flex;
    align-items: stretch;
    color: white;
    position: relative;
  }

  .input {
    padding: 0.75em 6em 0.75em 1em;
    display: block;
    flex: 1;
    appearance: none;
    font: inherit;
    font-size: 1.25em;
    border: 0;
    background: transparent;
    color: inherit;
    border-radius: 100px;
    background: #555;
  }

  .submit {
    appearance: none;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    color: #eee;
    border: 0;
    background: rgba(0,0,0,0.1);
    border-radius: 0 100px 100px 0;
    width: 5em;
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    overflow: hidden;
    z-index: 1;
  }
  .submit:disabled {
    visibility: hidden;
  }

  .center {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }
`;

export const chat = () => base({
  pageId: "chat",
  content: /*html*/`
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
        <textarea
          class="new-msg__text"
          rows="1"
          placeholder="Say something"
        ></textarea>
      </label>
    </main>
  `,
});

export const chatCss = () => /*css*/`
  ${baseCss()}
  
  .room {
    width: 100%;
    max-width: 45em;
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

  .new-msg {
    display: grid;
    align-items: stretch;
    position: relative;
    margin: 3em 0 1em 0;
    overflow: hidden;
    max-height: 15em;
    border-radius: 1.5em;
    background: #444;
  }
  .new-msg::after {
    content: attr(data-value) ' ';
    white-space: pre-wrap;
    visibility: hidden;
    grid-area: 1 / 1;
    padding: 0.75em 1em;
  }
  .new-msg__text {
    grid-area: 1 / 1;
    background: transparent;
    border: 0;
    resize: none;
    font: inherit;
    color: white;
    padding: 0.75em 1em;
    appearance: none;
    overflow-x: hidden;
    max-height: 15em;
    overflow-y: auto;
  }

  .right {
    align-self: flex-end;
    align-items: flex-end;
    text-align: right;
  }

  .msg-group {
    display: flex;
    flex-direction: column;
    max-width: 60%;
    margin: 0.5em 0;
  }

  .user {
    color: #efefef;
    font-weight: bold;
  }

  .msg {
    background: #666;
    color: white;
    padding: 0.9em;
    text-align: left;
    border-radius: 0 0.75em 0.75em 0.75em;
    margin: 0.4em 0;
  }
  .right .msg {
    border-radius: 0.75em 0 0.75em 0.75em;
  }
  .room .msg + .msg,
  .room .right .msg + .msg {
    border-radius: 0.75em;
  }
`;
