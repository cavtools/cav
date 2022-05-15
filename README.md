# Cav

NOTE: This is new and probably broken somehow, don't use it in production.
(Unless you're [me](https://connor.lol) lol)

Cav is an experimental full stack web framework for [Deno](https://deno.land).
Here's some notable features:

- Compatible with [Zod](https://github.com/colinhacks/zod) parsers, enabling
  [end-to-end type safety](https://colinhacks.com/essays/painless-typesafety)
- Routers and endpoints that are functional, declarative, and modular
- Signed cookies, static assets, custom context, multipart form processing
- Built-in de/serialization of nearly any JavaScript value
- Web socket support
- Dev-time bundling for frontend TypeScript assets
- Compatible with frontend frameworks like [Preact](https://preactjs.com)
- Zero config (good defaults)
- Zero third-party dependencies
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

## Introduction

Cav requires [Deno](https://deno.land) v1.21.3 or higher. If you're new to Deno,
read [the manual](https://deno.land/manual/introduction) to get up to speed.

A simple "hello world" app in Cav looks like this:

TODO: Start with the smallest hello world possible, introduce other features
step by step, building it out into a full blown app