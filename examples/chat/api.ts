// Copyright 2022 Connor Logan. All rights reserved. MIT License.

const rooms = new Map<string, Set<string>>();
if (Deno.env.get("DEV")) {
  rooms.set("dev", new Set<string>());
}

export function getUsers(roomId: string) {
  const users = rooms.get(roomId);
  if (!users) {
    throw new Error("room not found");
  }
  return users;
}

export function createRoom() {
  const id = crypto.randomUUID();
  rooms.set(id, new Set<string>());
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
  if (!users.has(arg.old)) {
    throw new Error("old name not found");
  }
  if (users.has(arg.new)) {
    throw new Error("new name already taken");
  }
  users.delete(arg.old);
  users.add(arg.new);
}

function addUser(roomId: string, name: string) {
  const users = getUsers(roomId);
  if (users.has(name)) {
    throw new Error("name already taken");
  }
  users.add(name);
}