// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { assertEquals } from "./test_deps.ts";
import { normalizeParser } from "../parser.ts";

Deno.test("normalizes parser", () => {
  const parserFn = normalizeParser(() => "yes");
  assertEquals(parserFn(null), "yes");

  const parserObj = normalizeParser({ parse: () => "yes" });
  assertEquals(parserObj(null), "yes");
});