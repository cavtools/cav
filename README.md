# Cav

NOTE: This is new and probably broken, don't use it in production.

Cav is an experimental web framework for [Deno](https://deno.land). Here's some
notable features:

- The Basics: Signed cookies, static assets, custom context, multipart form
  processing
- Dev-time bundling for frontend TypeScript assets
- Compatible with frontend frameworks like [Preact](https://preactjs.com)
- RPC-centric syntax that's declarative, functional, and modular
- Automatic de/serialization of nearly any JavaScript value
- Compatible with [Zod](https://github.com/colinhacks/zod) parsers, enabling
  [end-to-end type safety](https://colinhacks.com/essays/painless-typesafety)
- Web socket support
- Zero third-party dependencies
- Zero config (good defaults)
- Zero magic
- [Deno Deploy](https://deno.com) without a build step

<!-- ## Status -->

<!-- Although Cav has 100% line coverage, it's still very new and not yet adequately tested in production. For now, it's recommended to only use Cav for small scale low-risk projects such as local businesses, personal sites, etc. -->

## Inspirations

- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [superjson](https://github.com/blitz-js/superjson) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [json-dry](https://github.com/11ways/json-dry)
- [Next.js](https://nextjs.org/) / [Aleph.js](https://alephjs.org/)