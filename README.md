# Cav

NOTE: This is new and probably broken, don't use it in production.

Cav is an experimental web framework for [Deno](https://deno.land).

## Goals

- Modern server-side essentials
- [End-to-end type safety](https://colinhacks.com/essays/painless-typesafety)
- Functional, with a declarative syntax
- Dev-time bundling for frontend TypeScript modules
- Automatic de/serialization of (nearly) any JavaScript value
- [Deno Deploy](https://deno.com) without a build step
- Zero:
  - Third-party dependencies
  - Config
  - CLI commands
  - Magic

## Inspirations

- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [superjson](https://github.com/blitz-js/superjson) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [json-dry](https://github.com/11ways/json-dry)
- [Next.js](https://nextjs.org/) / [Aleph.js](https://alephjs.org/)