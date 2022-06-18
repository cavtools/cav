// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { http } from "./deps.ts";

/**
 * Options for running an http server. This is a re-export of the ServerInit
 * type from https://deno.land/std/http/server.ts.
 */
export type ServerInit = http.ServerInit;

/**
 * An http server. This is a re-export of the Server type from
 * https://deno.land/std/http/server.ts.
 */
export type Server = http.Server;
 
/**
 * Constructs a new server instance. This is a simple function wrapper around
 * the Server constructor from https://deno.land/std/http/server.ts.
 */
export function server(init: ServerInit): Server {
   return new http.Server(init);
 }
 
/**
 * Options for serving an http handler. This is a re-export of the ServeInit
 * type from https://deno.land/std/server.ts.
 */
export type ServeInit = http.ServeInit;
 
/**
 * Serves HTTP requests with the given handler. (Stacks and Rpcs are handlers.)
 * You can specify an object with a port and hostname option, which is the
 * address to listen on. The default is port 8000 on hostname "0.0.0.0". This is
 * a re-export of the serve() function from
 * https://deno.land/std/http/server.ts.
 */
export async function serve(handler: http.Handler, init?: ServeInit) {
  return await http.serve(handler, init);
}
 