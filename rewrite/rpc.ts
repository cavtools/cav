// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http } from "../deps.ts";

export type Rpc<S> = S & ((
  req: Request,
  conn: http.ConnInfo,
) => Promise<Response>);

export function rpc<S, C, R>(schema: S & {
  ctx: (x: {
    path: string;
  }) => Promise<C> | C;
  resolve: (x: {
    path: string;
    ctx: C;
  }) => Promise<R> | R;
}): Rpc<S> {
  const handler = (_req: Request, _conn: http.ConnInfo) => {
    return new Promise<Response>(res => res(new Response("")));
  };

  return Object.assign(handler, schema);
}

// This is broken, see the "Cav needs TypeScript 4.7" issue on github
const test = rpc({
  ctx: x => x.path,
  resolve: x => x.ctx,
});