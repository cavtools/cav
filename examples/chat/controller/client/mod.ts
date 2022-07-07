// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

import type * as controller from "../mod.ts";
import { client } from "./deps.ts";

const roomClient = client<controller.RoomRouter>(self.location.pathname);

export function connect() {
  return roomClient({
    path: "ws",
    socket: true,
  });
}

export async function send(msg: string) {
  return await roomClient({
    path: "send",
    body: msg,
  });
}