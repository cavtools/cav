# Cav

TODO: This is a placeholder readme until I'm done writing docs

Cav is an experimental TypeScript web framework built on
[Deno](https://deno.land). It provides a declarative and functional approach for
writing elegant full-stack web applications.

A quick demo of the framework in action can be seen at [cav.bar](https://cav.bar). The demo runs on Deno Deploy. It'll be replaced by the docs website soon.

Cav is inspired by many modern JavaScript/TypeScript patterns, techniques, and modules. Here's a few of those modules:

- [Next.js](https://nextjs.org/) / [Aleph.js](https://alephjs.org/)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) / [Oak](https://oakserver.github.io/oak/)
- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [superjson](https://github.com/blitz-js/superjson) / [serialize-javascript](https://github.com/yahoo/serialize-javascript)

## Usage

- On the server: [`deno.land/x/cav/mod.ts`](https://deno.land/x/cav/mod.ts)
- In the browser:
  [`deno.land/x/cav/browser/mod.ts`](https://deno.land/x/cav/browser/mod.ts)

## Features 

- Zero third-party dependencies
  - This wouldn't be possible without Deno and its excellent [standard library](https://deno.land/std)
- Built-in bundling of TypeScript assets
  - Also [thanks to Deno](https://deno.land/manual/typescript/runtime.md)
- End-to-end type safety (inspired by trpc)
- Compatibility with Zod-style data parsers
- "Any-body" data serialization (like superjson and others, but with added support for Files and Blobs. See [`pack.ts`](./pack.ts) for more info; look at the `packBody` and `unpackBody` functions.)
- Declarative routing ([`stack.ts`](./stack.ts))
- Declarative endpoint definitions ([`rpc.ts`](./rpc.ts))
- Unopinionated about project structure
- Highly opinionated about behind-the-scenes HTTP procedures
- Carefully chosen defaults
- Easy-to-use web sockets
- Zero-config (the code is the config)
- Cookies (ofc)
- Custom context support
- ...

## Status

Pre-alpha. Documentation and tests are in the works.

## Dedication

Cav is dedicated to the bar it was named after.
