// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  HttpError,
  serve,
  router,
  assets,
  endpoint,
} from "./deps.ts";

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

  // Creates a new room and redirects to it. Uses a 2 second sleep to keep room
  // creation rate low. (Built-in rate limiting is on the radar)
  create: endpoint(null, async x => {
    await new Promise(r => setTimeout(r, 2000));
    const id = crypto.randomUUID();
    rooms.set(id, new Set<string>());
    return x.redirect(id);
  }),

  // The chat rooms
  ":id": {
    "/": endpoint(roomBase, x => x.asset({ path: ".chat.html" })),

    login: endpoint({
      ...roomBase,
      message: m => {
        if (typeof m === "undefined") { // It's a GET request
          return m;
        }
        if (typeof m !== "string") {
          throw new Error("Only plain-text messages are accepted");
        }
        if (m.length > 20) {
          throw new Error("Names can't be longer than 20 characters");
        }
        if (m.length < 1) {
          throw new Error("Names must be at least 1 character");
        }
        return m;
      },
    }, x => {
      const roomId = x.groups.id;
      const names = rooms.get(roomId)!;
      const cookie = x.cookies.get(roomId);

      // If it's a GET request, the client is checking to see if they're
      // already signed in. If they are, just tell them their name in this room
      if (!x.message && !cookie) {
        throw new HttpError("401 not signed in", { status: 401 });
      }
      if (!x.message) {
        return cookie!;
      }

      // If they're signed in but want to change their name, they can do that
      if (cookie === x.message) {
        return x.message;
      }
      if (cookie && names.has(x.message)) {
        throw new HttpError("409 name taken", { status: 409 });
      }
      if (cookie) {
        names.delete(cookie);
        names.add(x.message);
        x.cookies.set(roomId, x.message);
        return x.message;
      }

      // Otherwise, they're looking to sign in for the first time
      if (names.has(x.message)) {
        throw new HttpError("409 name taken", { status: 409 });
      }
      names.add(x.message);
      x.cookies.set(roomId, x.message);
      return x.message;
    }),
  },
});

serve(mainRouter, { port: 8080 });
console.log("listening on port 8080");