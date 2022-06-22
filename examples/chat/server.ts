// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import * as api from "./api.ts";
import * as html from "./html.ts";
import {
  router,
  endpoint,
  serve,
  bundle,
} from "./deps.ts";
import { roomRouter } from "./room/server.ts";

export function chatRouter() {
  return router({
    "/": html.index(),
    "index.css": html.indexCss(),
    "chat.css": html.room.chatCss(),
    "auth.css": html.room.authCss(),
    "dom.ts": bundle({
      cwd: import.meta.url,
      url: "dom.ts",
    }),

    "chat": endpoint(null, async ({ redirect }) => {
      await new Promise(r => setTimeout(r, 2000)); // "rate limiting"
      return redirect(api.room.createRoom() + "/auth");
    }),
    ":roomId": roomRouter(),
  });
}

if (import.meta.main) {
  serve(chatRouter(), { port: 8080 });
  console.log("listening on port 8080");
}