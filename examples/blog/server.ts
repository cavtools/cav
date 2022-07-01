// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  router,
  endpoint,
  serve,
} from "../../mod.ts";
import { CSS, render } from "https://deno.land/x/gfm@0.1.22/mod.ts";
import { extract } from "https://deno.land/std@0.146.0/encoding/front_matter.ts";

const app = router({
  "gfm.css": CSS,
  "/": endpoint(null, async ({ res }) => res({
    headers: { "content-type": "text/html" } as const,
    body: await markdown("./header.md"),
  })),
});

// TODO: Caching
async function markdown(file: string) {
  const { attrs, body } = extract<Record<string, string>>(
    await Deno.readTextFile(file),
  );
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

if (import.meta.main) {
  serve(app, { port: 8080 });
}