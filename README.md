# Cav

WARNING: This is currently broken, I'm in the middle of a refactor. Tagged
versions at https://deno.land/x/cav still work but are full of bugs.

NOTE: This is new, don't use it in production.

Cav is an experimental full stack web framework for [Deno](https://deno.land).
Here's notable features:

- Compatible with [Zod](https://github.com/colinhacks/zod) parsers, enabling
  [end-to-end type safety](https://colinhacks.com/essays/painless-typesafety)
- Serves static assets and serializes (nearly) any JavaScript type to JSON
- Web socket support
- Zero config (i.e. good defaults), and zero third-party dependencies
- Dev-time bundling for frontend TypeScript assets
- Compatible with frontend frameworks like [Preact](https://preactjs.com)
- [Deno Deploy](https://deno.com) without a build step

## Inspirations

- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [superjson](https://github.com/blitz-js/superjson) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [json-dry](https://github.com/11ways/json-dry)
- [Next.js](https://nextjs.org/) / [Aleph.js](https://alephjs.org/)

## Resources

...

## Getting started

Cav requires [Deno](https://deno.land) v1.21.2 or higher. If you're new to Deno, peruse [the manual](https://deno.land/manual/introduction) to get up to speed.

A simple "hello world" app in Cav looks like this:

```ts
import { rpc, serve } from "https://deno.land/x/cav/mod.ts";

const helloRpc = rpc({
  resolve: x => "Hello, world!",
});

serve(helloRpc, { port: 8000 });
console.log("listening on port 8000");
```

This will start an HTTP server on localhost:8000 with a single RPC endpoint.
When the root path is requested ("GET /"), the text "Hello, world!" will be
returned with a "text/plain" content-type. Any other request method will result
in a 405 error, and any other request path will result in a 404 error.

Assuming the above code is in `./main.ts`, the server can be started with the
following:

```
> deno run --allow-net main.ts
listening on port 8000
```

## RPC endpoints

Let's break down the example from the previous section block-by-block:

### Block 1

```ts
import { rpc, serve } from "https://deno.land/x/cav/mod.ts";
```

This block imports two functions from the most recent Cav release: `rpc()`, for
creating HTTP endpoints; and `serve()`, for binding HTTP handlers (such as RPC
endpoints) to the host and starting the server event loop.

In production, you'll usually want to pin your dependencies to a specific version, like this:

```ts
// deps.ts
export * as cav from "https://deno.land/x/cav@0.0.20/mod.ts";

// NOTE: 0.0.20 is probably not the most recent version, and you shouldn't be
// using this in production until at least 0.1.0
```

For the sake of maintaining this guide, the `https://deno.land/x/cav/mod.ts`
shortcut is being used instead. This links to the latest Cav release, which you
shouldn't do in production. 

### Block 2

```ts
const helloRpc = rpc({
  resolve: x => "Hello, world!",
});
```

Here, a new <span style="text-decoration-style:dash;" title="Remote procedure
call">RPC</span> endpoint is created. The endpoint only responds to "GET /"
requests, and will always reply with "Hello, world!" as a plaintext response.
When it receives any other kind of request, it will throw an appropriate
HttpError.

TODO: Brief introduction to the `rpc()` function and link to the `rpc.md` doc for more information

TODO: Several complex examples of RPCs labeled and collapsed with
details/summary blocks

TODO: Brief introduction to the `serve()` and `server()` functions and link to
the `http.md` doc for more information

## Routing

