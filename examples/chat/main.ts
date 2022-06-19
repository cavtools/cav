// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  HttpError,
  serve,
  router,
  assets,
  endpoint,
} from "../../mod.ts";
import * as chat from "./chat.ts";
import * as html from "./html.ts";

const roomSchema = endpoint({
  groups: ({ roomId }) => {
    if (Array.isArray(roomId)) {
      throw new Error("invalid routing setup: only 1 roomId allowed");
    }
    if (!chat.roomExists(roomId)) {
      throw new Error("room not found");
    }
    return { roomId };
  },
}, null);

const mainRouter = router({
  "*": assets({ cwd: import.meta.url }),
  "/": endpoint(null, html.index),
  "index.css": endpoint(null, html.indexCss),
  "auth.css": endpoint(null, html.authCss),
  "chat.css": endpoint(null, html.chatCss),

  chat: endpoint(null, async x => {
    await new Promise(r => setTimeout(r, 2000)); // "rate limiting"
    return x.redirect(chat.createRoom() + "/auth");
  }),

  ":roomId": {
    "/": endpoint(roomSchema, html.chat),

    auth: endpoint({
      ...roomSchema,
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
      if (oldName && chat.nameTaken(roomId, newName)) {
        throw new HttpError("409 name taken", { status: 409 });
      }
      if (oldName) {
        chat.changeName(roomId, {
          old: oldName,
          new: newName,
        });
        x.cookies.set(roomId, newName, { signed: true });
        return x.redirect("..");
      }
    
      // Otherwise, they're looking to sign in for the first time
      if (chat.nameTaken(roomId, newName)) {
        throw new HttpError("409 name taken", { status: 409 });
      }
      chat.addUser(roomId, newName);
      x.cookies.set(roomId, newName, { signed: true });
      return x.redirect("..");
    }),
  },
});

export type MainRouter = typeof mainRouter;

serve(mainRouter, { port: 8080 });
console.log("listening on port 8080");