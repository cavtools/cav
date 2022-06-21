// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  HttpError,
  router,
  assets,
  endpoint,
  serve,
  socket,
} from "./deps.ts";
import * as api from "./api.ts";
import * as parse from "./parse.ts";
import { baseCss } from "./base_html.ts";
import { authPage, authCss } from "./auth_html.ts";
import { chatPage, chatCss } from "./chat_html.ts";
import { indexPage, indexCss } from "./index_html.ts";

export function app() {
  return router({
    "*": assets({ cwd: import.meta.url }),
    "base.css": endpoint(null, () => baseCss()),
    "index.css": endpoint(null, () => indexCss()),
    "chat.css": endpoint(null, () => chatCss()),
    "auth.css": endpoint(null, () => authCss()),
    "/": endpoint(null, () => indexPage()),
    "chat": endpoint(null, async x => {
      await new Promise(r => setTimeout(r, 2000)); // "rate limiting"
      return x.redirect(api.createRoom() + "/auth");
    }),
    ":roomId": chatRoom(),
  });
}

export type ChatRoom = ReturnType<typeof chatRoom>;

function chatRoom() {
  const base = endpoint({
    groups: parse.authGroups,
  }, null);

  return router({
    "/": endpoint(base, x => {
      const name = x.cookies.get(x.groups.roomId, { signed: true });
      if (!name) {
        return x.redirect("./auth");
      }
      return chatPage();
    }),
    "auth": endpoint({
      ...base,
      body: parse.authBody,
    }, x => {
      const { roomId } = x.groups;
      const oldName = x.cookies.get(roomId, { signed: true });
      const newName = x.body?.name;
    
      // If it's a GET request, redirect them if they're already signed in or
      // show them the login form if not
      if (!oldName && !newName) {
        return authPage();
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
      api.newUser(roomId, newName);
      x.cookies.set(roomId, newName, { signed: true });
      return x.redirect("..");
    }),
    "ws": socket({
      ...base,
      send: {} as api.Message,
      recv: parse.sendMessage,
    }, x => {
      const roomId = x.groups.roomId;
      const name = x.cookies.get(roomId, { signed: true });
      const ws = x.ws;

      if (!name) {
        throw new HttpError("401 unauthorized", { status: 401 });
      }

      ws.onopen = () => {
        api.connect(roomId, { name, ws });
      };
      ws.onclose = () => {
        api.disconnect(roomId, { name, ws });
      };
      ws.onmessage = (recv) => {
        api.broadcast(roomId, { from: name, text: recv });
      };
      ws.onerror = (err) => {
        console.error("socket error:", err);
      };
    }),
  });
}

if (import.meta.main) {
  serve(app(), { port: 8080 });
  console.log("listening on port 8080");
}