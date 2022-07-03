#!/usr/bin/env deno run --watch --allow-net
// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  endpoint,
  router,
  serve,
} from "../../mod.ts";

if (import.meta.main) {
  serve(app());
}

const base = "https://github.com/connorlogin/cav";

export function app() {
  return router({
    "docs": endpoint({ path: "*" }, ({ path, redirect }) => redirect(
      path === "/" ? base + "/blob/main/docs/README.md"
      : base + `/blob/main/docs${path}.md`
    )),
    "examples": endpoint({ path: "*" }, ({ path, redirect }) => redirect(
      path === "/" ? base + "/blob/main/examples/README.md"
      : base + `/blob/main/examples${path}`
    )),
    "*": endpoint({ path: "*" }, ({ path, redirect }) => redirect(
      base + path
    )),
  });
}