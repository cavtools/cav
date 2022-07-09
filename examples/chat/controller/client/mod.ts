// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import type * as controller from "../mod.ts";
import { client } from "./deps.ts";

export function roomConnect() {
  return client<controller.RoomRouter>(self.location.pathname)({
    path: "ws",
    socket: true,
  });
}

export async function roomSend(msg: string) {
  return await client<controller.RoomRouter>(self.location.pathname)({
    path: "send",
    body: msg,
  });
}