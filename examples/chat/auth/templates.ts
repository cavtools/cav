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
        import { loginInit } from "/bundle.ts";
        loginInit();
      </script>

    </head><body class="center">

      <noscript>This real-time chat application requires JavaScript.</noscript>

      <form class="form" method="POST">
        <input
          class="input"
          type="text"
          name="name"
          placeholder="What's your name?"
        >
        <button type="submit" class="submit">join</button>
      </form>
      
    </body></html>
  `;
}

const css = /*css*/`
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

