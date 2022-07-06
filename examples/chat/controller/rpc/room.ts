// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import type * as controller from "../controller/mod.ts";
import { client } from "./deps.ts";

const rpc = client<controller.App>(self.location.pathname);

export function connect() {
  return rpc({
    path: "ws",
    socket: true,
  });
}

export async function send(msg: string) {
  return await rpc({
    path: "send",
    body: msg,
  });
}