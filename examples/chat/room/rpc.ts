// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import type * as server from "./server.ts";
import { client } from "../deps_iso.ts";

const appClient = client<server.App>(self.location.pathname);

export function connect() {
  return appClient({
    path: "ws",
    socket: true,
  });
}

export async function send(msg: string) {
  return appClient({
    path: "send",
    body: msg,
  });
}