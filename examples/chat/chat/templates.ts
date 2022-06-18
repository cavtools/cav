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
        import { initChat } from "/bundle.ts";
        initChat();
      </script>

    </head><body>

      <noscript>This real-time chat application requires JavaScript.</noscript>
      
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
      
    </body></html>
  `;
}

const css = /*css*/`
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
