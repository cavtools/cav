// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import type { WS } from "../deps.ts";

export interface Message {
  from: string;
  text: string;
  self: boolean;
}

type Users = Map<string, WS<Message>[]>;

type Rooms = Map<string, Users>;

const rooms: Rooms = new Map();
if (Deno.env.get("DEV")) {
  rooms.set("dev", new Map());
}

function getUsers(roomId: string) {
  const users = rooms.get(roomId);
  if (!users) {
    throw new Error("room not found");
  }
  return users;
}

export function createRoom() {
  const id = crypto.randomUUID();
  rooms.set(id, new Map());
  return id;
}

export function roomExists(roomId: string) {
  return rooms.has(roomId);
}

export function nameTaken(roomId: string, name: string) {
  const users = getUsers(roomId);
  return users.has(name);
}

export function changeName(roomId: string, arg: {
  old: string;
  new: string;
}) {
  const users = getUsers(roomId);
  const ws = users.get(arg.old);
  if (!ws) {
    throw new Error("old name not found");
  }
  if (users.has(arg.new)) {
    throw new Error("new name already taken");
  }
  users.delete(arg.old);
  users.set(arg.new, ws);
}

export function newUser(roomId: string, name: string) {
  const users = getUsers(roomId);
  if (users.has(name)) {
    throw new Error("name already taken");
  }
  users.set(name, []);
}

export function connect(roomId: string, arg: {
  name: string;
  ws: WS<Message>;
}) {
  const users = getUsers(roomId);
  const ws = users.get(arg.name);
  if (!ws) {
    throw new Error("user not found");
  }
  ws.push(arg.ws);
}

export function disconnect(roomId: string, arg: {
  name: string;
  ws: WS<Message>;
}) {
  const users = getUsers(roomId);
  const ws = users.get(arg.name);
  if (!ws) {
    throw new Error("user not found");
  }
  users.set(arg.name, ws.filter(w => w !== arg.ws));
}

export function broadcast(roomId: string, arg: {
  from: string;
  text: string;
}) {
  const users = getUsers(roomId);
  for (const [name, sockets] of users.entries())  {
    for (const ws of sockets) {
      ws.send({ ...arg, self: name === arg.from });
    }
  }
}