#!/usr/bin/env deno run --watch --allow-net
// Copyright 2022 Connor Logan. All rights reserved. MIT License.

/**
 * https://cav.bar: Shortcuts for Cav's repo.
 * 
 * - "/"           -> "https://github.com/connorlogin/cav"
 * - "/issues"     -> "https://github.com/connorlogin/cav/issues"
 * - "/issues/new" -> "https://github.com/connorlogin/cav/issues/new"
 * - ...
 */

import { serve, endpoint } from "../../mod.ts";

serve(
  endpoint({ path: "*" }, ({ path, redirect }) => redirect(
    "https://github.com/connorlogin/cav" + path
  )),
);