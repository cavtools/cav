# Cav

NOTE: This is new and probably broken somehow, don't use it in production.

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

## Status

Cav is currently broken, but just barely. Many features are working but everything is still in flux and the types aren't 100% yet.

Also, I (shamefully) didn't write tests or docs in the beginning so now I'm trying to catch up. Once tests are done, I'll focus on docs/walkthroughs/etc. When v0.1 happens, I'll [toot](https://fosstodon.org/@connorlogin) and [tweet](https://twitter.com/connorlogin) about it.

To get a hint of the syntax Cav is aiming for, read this code: https://github.com/connorlogin/connor-lol