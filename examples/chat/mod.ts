// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  HttpError,
  router,
  assets,
  endpoint,
  serve,
} from "./deps.ts";
import * as api from "./api.ts";
import * as html from "./html.ts";

export type App = ReturnType<typeof app>;

export const app = () => router({
  "*": assets({ cwd: import.meta.url }),
  "index.css": endpoint(null, html.indexCss),
  "auth.css": endpoint(null, html.authCss),
  "chat.css": endpoint(null, html.chatCss),

  "/": endpoint(null, html.index),

  chat: endpoint(null, async x => {
    await new Promise(r => setTimeout(r, 2000)); // "rate limiting"
    return x.redirect("../" + api.createRoom() + "/auth");
  }),

  ":roomId": chatRoom(),
});

const chatSchema = endpoint({
  groups: ({ roomId }) => {
    if (Array.isArray(roomId)) {
      throw new Error("invalid routing setup: only 1 roomId allowed");
    }
    if (!api.roomExists(roomId)) {
      throw new Error("room not found");
    }
    return { roomId };
  },
}, null);

export type ChatRoom = ReturnType<typeof chatRoom>;

const chatRoom = () => router({
  "/": endpoint(chatSchema, html.chat),
  
  auth: endpoint({
    ...chatSchema,
    message: msg => {
      // Allow GET
      if (typeof msg === "undefined") {
        return msg;
      }
      if (!msg || typeof msg !== "object") {
        throw new Error("message must be a Record<string, string>")
      }
      
      const { name } = msg;
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
    },
  }, x => {
    const { roomId } = x.groups;
    const oldName = x.cookies.get(roomId, { signed: true });
    const newName = x.message?.name;
  
    // If it's a GET request, redirect them if they're already signed in or
    // show them the login form if not
    if (!oldName && !newName) {
      return html.auth();
    }
    if (!newName) {
      return x.redirect("..");
    }
  
    // If they're signed in but want to change their name, they can do that
    if (oldName === newName) {
      return x.redirect("..");
    }
    if (oldName && api.nameTaken(roomId, newName)) {
      throw new HttpError("409 name taken", { status: 409 });
    }
    if (oldName) {
      api.changeName(roomId, {
        old: oldName,
        new: newName,
      });
      x.cookies.set(roomId, newName, { signed: true });
      return x.redirect("..");
    }
  
    // Otherwise, they're looking to sign in for the first time
    if (api.nameTaken(roomId, newName)) {
      throw new HttpError("409 name taken", { status: 409 });
    }
    api.addUser(roomId, newName);
    x.cookies.set(roomId, newName, { signed: true });
    return x.redirect("..");
  }),
});

if (import.meta.main) {
  serve(app(), { port: 8080 });
  console.log("listening on port 8080");
}