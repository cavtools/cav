// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import * as api from "./api.ts";
import * as html from "./html.ts";
import {
  router,
  endpoint,
  serve,
  bundle,
  assets,
} from "./deps.ts";
import { roomRouter } from "./room/server.ts";

export * as room from "./room/server.ts";

export function chatRouter() {
  return router({
    "*": assets(),
    "dom.ts": bundle({ url: "./dom.ts" }),
    "/": html.index(),
    ":roomId": roomRouter(),

    "new": endpoint({
      resolve: async ({ redirect }) => {
        await new Promise(r => setTimeout(r, 3000)); // "rate limiting"
        return redirect(api.room.createRoom() + "/auth");
      },
    }),
  });
}

if (import.meta.main) {
  serve(chatRouter(), { port: 8080 });
  console.log("listening on port 8080");
}