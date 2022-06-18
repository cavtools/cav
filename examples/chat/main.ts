// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  serve,
  router,
  assets,
  endpoint,
  zod as z,
} from "./deps.ts";

const rooms = new Set<string>(["dev"]);

export const mainRouter = router({
  // Serve static assets when nothing else matches
  "*": assets(),

  // The chat rooms
  ":id": endpoint({
    groups: ({ id }) => {
      if (typeof id !== "string" || !rooms.has(id)) {
        throw new Error("room not found");
      }
      return { id };
    },
  }, x => x.asset({ path: ".chat.html" })),

  // Creates a new room and redirects to it
  chat: endpoint(x => {
    const id = crypto.randomUUID();
    rooms.add(id);
    return x.redirect(id);
  }),
});

serve(mainRouter, { port: 8080 });
console.log("listening on port 8080");