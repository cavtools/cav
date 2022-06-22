// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

export function base({ head, body }: {
  head: string;
  body: string;
}) {
  return /*html*/`
    <!DOCTYPE html>
    <html lang="en">
    <head>

      <title>Chat</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
      ${head}

    </head>
    <body class="center">

      <noscript>This real-time chat application requires JavaScript.</noscript>

      ${body}

    </body>
    </html>
  `;
}

export function baseCss() {
  return /*css*/`
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
      background: #1E1E1E;
      line-height: 1.1;
      letter-spacing: 0.01em;
      position: relative;
    }
    
    a {
      text-decoration: none;
      font: inherit;
    }
    
    button {
      font: inherit;
      background: black;
      color: white;
      border: 0;
      border-radius: 0.5em;
      padding: 0.5em 0.75em;
      cursor: pointer;
    }
    button:disabled {
      cursor: default;
    }
    
    input,
    textarea {
      appearance: none;
      background: #2b2b2d;
      color: #eee;
      padding: 0.55em 0.75em 0.5em 0.75em;
      border-radius: 1rem;
      font: inherit;
      outline: none;
      border: 0;
    }
  `;
}