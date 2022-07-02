#!/usr/bin/env deno run --watch --allow-net
// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  endpoint,
  router,
  redirect,
  serve,
} from "../../mod.ts";

const app = router({
  "docs": redirect(
    "https://github.com/connorlogin/cav/blob/main/docs/README.md",
  ),
  "examples": redirect(
    "https://github.com/connorlogin/cav/blob/main/examples/README.md",
  ),
  // GitHub:
  // - Issues -> /issues
  // - Discussions -> /discussions
  // - Pull requests -> /pulls
  // - etc.
  "*": endpoint({ path: "*" }, ({ path, redirect }) => redirect(
    "https://github.com/connorlogin/cav" + path,
  )),
});

serve(app);