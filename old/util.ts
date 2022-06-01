// Copyright 2022 Connor Logan. All rights reserved.

import { rpc } from "./rpc.ts";
import { prepareAssets } from "./assets.ts";
import type { ServeAssetOptions } from "./assets.ts";

// TODO: Add RpcInit options
/** Initializer options for the assets() utility function. */
export type AssetsInit = Omit<ServeAssetOptions, "path">;

// TODO: Add RpcInit options
/**
 * Utility for creating an Rpc handler specifically for serving static assets.
 * The resolver's path argument is used as the asset path.
 */
export function assets(init?: AssetsInit) {
  // Note that this is a no-op in production
  prepareAssets({
    cwd: init?.cwd,
    dir: init?.dir,
    watch: true,
  });

  return rpc({
    path: "*",
    resolve: (x) =>
      x.asset({
        ...init,
        path: x.path,
      }),
  });
}

/**
 * Utility for creating an Rpc handler that always redirects. If an
 * origin isn't provided in the redirect url, the origin of the request will be
 * used. Paths can also be relative; if the path starts with a ".", the path
 * will be joined with the pathname of the request using the std path.join()
 * function. If the status isn't provided, 302 is used. Note that paths with
 * trailing slashes will be redirected first to the path without the trailing
 * slash before being redirect to the specified destination. (2 hops)
 */
export function redirect(to: string, status?: number) {
  return rpc({
    path: "*",
    resolve: (x) => {
      return x.redirect(to, status || 302);
    },
  });
}
