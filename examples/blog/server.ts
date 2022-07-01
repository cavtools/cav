// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  assets,
  router,
  endpoint,
  serve,
} from "../../mod.ts";
import { CSS, render } from "https://deno.land/x/gfm@0.1.22/mod.ts";
import { extract } from "https://deno.land/std@0.146.0/encoding/front_matter.ts";

export function app() {
  return router({
    "/": endpoint(null, async ({ res }) => {
      const { attrs, body } = extract(await Deno.readTextFile("./header.md"));
      
    }),
  });
}

if (import.meta.main) {
  serve(app(), { port: 8080 });
}