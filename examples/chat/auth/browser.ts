// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

import { $ } from "../browser_deps.ts";

export function loginInit() {
  const input = $<HTMLInputElement>(".input")!;
  const submit = $<HTMLButtonElement>(".submit")!;

  input.oninput = () => {
    submit.disabled = !input.value;
  };
  input.dispatchEvent(new Event("input"));

  input.onfocus = () => {
    input.select();
  };
}