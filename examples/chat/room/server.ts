// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  HttpError,
  router,
  endpoint,
  socket,
} from "../deps.ts";
import * as api from "./api.ts";
import * as html from "./html.ts";

export type RoomRouter = ReturnType<typeof roomRouter>;

export function roomRouter() {
  const base = endpoint({
    param: ({ roomId }) => {
      if (typeof roomId !== "string") {
        throw new Error("invalid routing setup: roomId required");
      }
      if (!api.roomExists(roomId)) {
        throw new Error("room not found");
      }
      return { roomId };
    },
    ctx: ({ param, cookie }) => ({
      name: cookie.get(param.roomId, { signed: true }),
    }),
  });

  return router({
    "/": endpoint({
      ...base,
      resolve: ({ res, ctx, redirect }) => {
        if (!ctx.name) {
          return redirect("./auth");
        }
        res.headers.set("content-type", "text/html; charset=UTF-8");
        return html.chat();
      }
    }),

    "auth": endpoint({
      ...base,
      body: (body?: { name: string }) => {
        if (typeof body === "undefined") {
          return; // GET is allowed
        }
        if (!body || typeof body !== "object") {
          throw new Error("invalid body type");
        }
        let { name } = body;
        if (typeof name === "undefined") {
          throw new Error("name required");
        }
        if (typeof name !== "string") {
          throw new Error("invalid body type");
        }
        name = name.trim();
        if (name.length > 20) {
          throw new Error("name length > 20");
        }
        if (name.length < 1) {
          throw new Error("name length < 1");
        }
        return { name };
      },
      resolve: ({ res, cookie, param, ctx, body, redirect }) => {
        // If they're already signed in, redirect them
        if (ctx.name) {
          return redirect("..");
        }
  
        // If it's a GET request, serve the auth page
        if (!body) {
          res.headers.set("content-type", "text/html; charset=UTF-8");
          return html.auth();
        }
  
        // If it's a POST request, try to reserve the name
        if (api.nameTaken(param.roomId, body.name)) {
          throw new HttpError("409 name taken", { status: 409 });
        }
        api.newUser(param.roomId, body.name);
        cookie.set(param.roomId, body.name, { signed: true });
        return redirect("..");
      },
    }),

    "ws": socket({
      ...base,
      send: {} as api.Message,
      setup: ({ param, ctx, ws }) => {
        const name = ctx.name;
        if (!name) {
          throw new HttpError("401 unauthorized", { status: 401 });
        }
  
        ws.onopen = () => {
          api.connect(param.roomId, { name, ws });
        };
        ws.onclose = () => {
          api.disconnect(param.roomId, { name, ws });
        };
      },
    }),

    "send": endpoint({
      ...base,
      maxBodySize: 1000,
      body: (body: string) => {
        if (typeof body !== "string") {
          throw new Error("body must be a string");
        }
        body = body.trim();
        if (!body) {
          throw new Error("can't send empty messages");
        }
        return body;
      },
      resolve: ({ param, ctx, query, body }) => {
        const name = ctx.name;
        if (!name) {
          throw new HttpError("401 unauthorized", { status: 401 });
        }
  
        api.broadcast(param.roomId, {
          from: name,
          text: body,
        });
      },
    }),
  });
}