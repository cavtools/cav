// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

export function page({ head, body }: {
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
      <link rel="stylesheet" href="/base.css">
      
      ${head}

    </head>
    <body class="center">

      <noscript>This real-time chat application requires JavaScript.</noscript>

      ${body}

    </body>
    </html>
  `;
}