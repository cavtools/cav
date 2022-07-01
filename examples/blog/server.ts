#!/usr/bin/env deno run --no-check --watch --allow-env --allow-net --allow-read
// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  router,
  endpoint,
  serve,
} from "../../mod.ts";
import { CSS, render } from "https://deno.land/x/gfm@0.1.22/mod.ts";
import {
  extract
} from "https://deno.land/std@0.146.0/encoding/front_matter.ts";

serve(router({
  "gfm.css": CSS,
  "/": endpoint(null, async ({ res }) => res({
    headers: { "content-type": "text/html" } as const,
    body: markdown(await Deno.readTextFile("./header.md")),
  })),
}));

function markdown(content: string) {
  let { attrs, body } = extract<Record<string, string>>(content);

  return /*html*/`
    <!DOCTYPE html><html lang="en"><head>

    <title>${attrs.title || "Untitled"}</title>
    <meta charset="utf-8">
    <link rel="stylesheet" href="/gfm.css">
    <style>
      main {
        max-width: 40em;
        margin: 0 auto;
      }
    </style>

    </head><body>

      <main>${render(body)}</main>

    </body></html>
  `;
}