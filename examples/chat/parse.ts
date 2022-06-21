// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import * as api from "./api.ts";
import type { GroupsRecord } from "./deps.ts";

export function authBody(body?: { name: string }) {
  // Allow GET
  if (typeof body === "undefined") {
    return body;
  }
  if (!body || typeof body !== "object") {
    throw new Error("message must be a Record<string, string>")
  }
  const { name } = body;
  if (typeof name === "undefined") {
    throw new Error("name required");
  }
  if (typeof name !== "string") {
    throw new Error("message must be a Record<string, string>")
  }
  if (name.length > 20) {
    throw new Error("names can't be longer than 20 characters");
  }
  if (name.length < 1) {
    throw new Error("names must be at least 1 character");
  }
  return { name };
}

export function authGroups(groups: GroupsRecord) {
  const { roomId } = groups;
  if (!roomId || typeof roomId !== "string") {
    throw new Error("invalid routing setup: one roomId required");
  }
  if (!api.roomExists(roomId)) {
    throw new Error("room not found");
  }
  return { roomId };
}

export function socketMessage(msg: string) {
  if (typeof msg !== "string") {
    throw new Error("invalid message");
  }
  return msg;
}