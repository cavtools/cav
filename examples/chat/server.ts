// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import * as roomApi from "./room/api.ts";
import * as roomServer from "./room/server.ts";
import * as html from "./html.ts";
import {
  router,
  assets,
  bundle,
  endpoint,
  serve,
} from "./deps.ts";

export function app() {
  return router({
    "*": assets({ cwd: import.meta.url }),
    "dom.ts": bundle({ url: "./dom.ts" }),
    "/": html.index(),
    ":roomId": roomServer.app(),

    "new": endpoint({
      resolve: async ({ redirect }) => {
        await new Promise(r => setTimeout(r, 3000)); // "rate limiting"
        return redirect(roomApi.createRoom() + "/auth");
      },
    }),
  });
}

if (import.meta.main) {
  serve(app(), { port: 8080 });
}