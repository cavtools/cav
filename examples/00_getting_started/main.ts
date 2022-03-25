#!/usr/bin/env deno run --watch --allow-net --allow-read --allow-write --unstable
// <root>/main.ts
// This module is server-only.

import {
  assets,
  serve,
  stack,
  tsBundler,
} from "https://deno.land/x/cav/mod.ts";

const mainStack = stack({
  "*": assets({
    cwd: import.meta.url,
    bundlers: [tsBundler()],
  }),
});

serve(mainStack);
console.log("Listening on port 8000");