// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import * as api from "./api.ts";
import * as room from "./room/server.ts";
import * as html from "./html.ts";
import {
  router,
  assets,
  bundle,
  endpoint,
  serve,
} from "./deps.ts";

export * as room from "./room/server.ts";

export function app() {
  return router({
    "*": assets({ cwd: import.meta.url }),
    "dom.ts": bundle({ url: "./dom.ts" }),
    "/": html.index(),
    ":roomId": room.app(),

    "new": endpoint(null, async ({ redirect }) => {
      await new Promise(r => setTimeout(r, 3000)); // "rate limiting"
      return redirect(api.room.createRoom() + "/auth");
    }),
  });
}

if (import.meta.main) {
  serve(app(), { port: 8080 });
}