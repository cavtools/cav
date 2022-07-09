// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import * as model from "../model/mod.ts";
import * as view from "../view/mod.ts";
import {
  HttpError,
  router,
  endpoint,
  socket,
  bundle,
  assets,
} from "./deps.ts";

export function mainRouter() {
  return router({
    // The cwd isn't really necessary. I'm setting it because a project like
    // this could reasonably be mounted in the router of a different
    // application, in which case the Deno process cwd wouldn't be correct
    "*": assets({ cwd: import.meta.url }),
    "dom.ts": bundle({ url: "./dom.ts" }),
    "/": view.indexPage(),
    ":roomId": roomRouter(),

    "new": endpoint(null, async ({ redirect }) => {
      await new Promise(r => setTimeout(r, 3000)); // "rate limiting"
      return redirect(model.createRoom() + "/auth");
    }),
  });
}

export type RoomRouter = ReturnType<typeof roomRouter>;

function roomRouter() {
  const base = endpoint({
    param: ({ roomId }) => {
      if (typeof roomId !== "string") {
        throw new Error("invalid routing setup: roomId required");
      }
      if (!model.roomExists(roomId)) {
        throw new Error("room not found");
      }
      return { roomId };
    },
    ctx: ({ param, cookie }) => ({
      name: cookie.get(param.roomId, { signed: true }),
    }),
  }, null);

  return router({
    "/": endpoint(base, ({ res, ctx, redirect }) => {
      if (!ctx.name) {
        return redirect("./auth");
      }
      return res({
        headers: { "content-type": "text/html" },
        body: view.chatPage(),
      });
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
    }, ({ res, cookie, param, ctx, body, redirect }) => {
      // If they're already signed in, redirect them
      if (ctx.name) {
        return redirect("..");
      }

      // If it's a GET request, serve the auth page
      if (!body) {
        return res({
          headers: { "content-type": "text/html" },
          body: view.authPage(),
        });
      }

      // If it's a POST request, try to reserve the name
      if (model.nameTaken(param.roomId, body.name)) {
        throw new HttpError("409 name taken", { status: 409 });
      }
      model.newUser(param.roomId, body.name);
      cookie.set(param.roomId, body.name, { signed: true });
      return redirect("..");
    }),

    "ws": socket({
      ...base,
      send: {} as model.Message,
    }, ({ param, ctx, ws }) => {
      const name = ctx.name;
      if (!name) {
        throw new HttpError("401 unauthorized", { status: 401 });
      }

      ws.onopen = () => {
        model.connect(param.roomId, { name, ws });
      };
      ws.onclose = () => {
        model.disconnect(param.roomId, { name, ws });
      };
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
    }, ({ param, ctx, body }) => {
      const name = ctx.name;
      if (!name) {
        throw new HttpError("401 unauthorized", { status: 401 });
      }

      model.broadcast(param.roomId, {
        from: name,
        text: body,
      });
    }),
  });
}