// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  HttpError,
  serve,
  router,
  assets,
  endpoint,
} from "./deps.ts";
import * as auth from "./auth/mod.ts";
import * as chat from "./chat/mod.ts";
import * as landing from "./landing/mod.ts";

// The server only stores room IDs and the names claimed in those rooms.
// Everything else is transient and GCed after a request/message is handled
const rooms = new Map<string, Set<string>>();
if (Deno.env.get("DEV")) {
  rooms.set("dev", new Set<string>());
}

const roomBase = endpoint({
  groups: g => {
    let id = g.id;
    if (Array.isArray(id)) {
      id = id[0];
    }
    if (!rooms.has(id)) {
      throw new Error("room not found");
    }
    return { id };
  },
}, null);

export type MainRouter = typeof mainRouter;

export const mainRouter = router({
  // Serve static assets when nothing else matches
  "*": assets({ cwd: import.meta.url }),

  // Landing page
  "/": endpoint(null, landing.html),

  // Creates a new room and redirects to it. Uses a 2 second sleep to keep room
  // creation rate low. (Built-in rate limiting is on the radar)
  create: endpoint(null, async x => {
    await new Promise(r => setTimeout(r, 2000));
    const id = crypto.randomUUID();
    rooms.set(id, new Set<string>());
    return x.redirect(id + "/auth");
  }),

  // The chat rooms
  ":id": {
    "/": endpoint(roomBase, chat.html),

    auth: endpoint({
      ...roomBase,
      message: m => {
        if (typeof m === "undefined") { // It's a GET request
          return m;
        }
        let name = m.name;
        if (typeof name !== "string") {
          name = name[0];
        }
        if (name.length > 20) {
          throw new Error("Names can't be longer than 20 characters");
        }
        if (name.length < 1) {
          throw new Error("Names must be at least 1 character");
        }
        return { name };
      },
    }, x => {
      const roomId = x.groups.id;
      const names = rooms.get(roomId)!;
      const cookie = x.cookies.get(roomId, { signed: true });

      // If it's a GET request, redirect them if they're already signed in or
      // show them the login form if not
      if (!x.message && !cookie) {
        return auth.html();
      }
      if (!x.message) {
        return x.redirect("..");
      }

      const name = x.message.name;

      // If they're signed in but want to change their name, they can do that
      if (cookie === name) {
        return x.redirect("..");
      }
      if (cookie && names.has(name)) {
        throw new HttpError("409 name taken", { status: 409 });
      }
      if (cookie) {
        names.delete(cookie);
        names.add(name);
        x.cookies.set(roomId, name, { signed: true });
        return x.redirect("..");
      }

      // Otherwise, they're looking to sign in for the first time
      if (names.has(name)) {
        throw new HttpError("409 name taken", { status: 409 });
      }
      names.add(name);
      x.cookies.set(roomId, name, { signed: true });
      return x.redirect("..");
    }),
  },
});

serve(mainRouter, { port: 8080 });
console.log("listening on port 8080");