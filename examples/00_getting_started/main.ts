#!/usr/bin/env deno run --watch --allow-net --allow-read

// <root>/main.ts
import {
  assets,
  serve,
  stack,
} from "https://deno.land/x/cav/mod.ts";

const mainStack = stack({
  "*": assets({
    cwd: import.meta.url,
  }),
});

serve(mainStack);
console.log("Listening on port 8000");