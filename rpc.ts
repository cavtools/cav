// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http } from "./deps.ts";

export type Rpc<S> = S & http.Handler;

export interface RpcSchema<
  // C = unknown, // Context
  R = unknown, // Deserialized response
> {
  path?: string | null;
  // ctx?: ((x: CtxArg) => C) | null;
  // resolve?: ((x: ResolveArg<C>) => R) | null;
  resolve?: ((x: ResolveArg) => R) | null;
}

export interface CtxArg {
  path: string;
}

// export interface ResolveArg<
//   C = unknown, // Context
// > {
//   ctx: C;
// }

export interface ResolveArg {
  path: string;
}

export function rpc<
  // deno-lint-ignore ban-types
  S = {},
  R = undefined,
>(
  schema?: S & RpcSchema<R>,
): Rpc<S> {
  const handler = async (_req: Request, _conn: http.ConnInfo) => {
    return await new Promise<Response>(res => res(new Response("")));
  };

  return Object.assign(handler, schema);
}