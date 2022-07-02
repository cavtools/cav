#!/usr/bin/env deno run --watch --allow-env --allow-net --allow-read
// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import * as gfm from "https://deno.land/x/gfm@0.1.22/mod.ts";
import * as fm from "https://deno.land/std@0.146.0/encoding/front_matter.ts";
import {
  router,
  endpoint,
  serve,
} from "../../mod.ts";

const app = router({
  "gfm.css": gfm.CSS,
  "/": endpoint(null, async ({ res }) => res({
    headers: { "content-type": "text/html" } as const,
    body: markdown(await Deno.readTextFile("./header.md")),
  })),
});

serve(app);

function markdown(content: string) {
  let { attrs, body } = fm.extract<Record<string, string>>(content);

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

      <main>${gfm.render(body)}</main>

    </body></html>
  `;
}