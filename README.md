# Cav

NOTE: This is new and probably broken, don't use it in production.

Cav is an experimental web framework for [Deno](https://deno.land). Here's some
notable features:

- The Basics:
  - Request routing & URL parsing via URLPatterns
  - Query string parsing
  - Body parsing (JSON, forms, etc.)
  - Signed cookies and JWTs
  - Static assets
  - Custom context (for sessions, db, etc.)
  - Web sockets
- Modern syntax that's declarative, functional, and modular
- Dev-time bundling for frontend TypeScript assets
  - Works with frontend frameworks like [Preact](https://preactjs.com)
- Automatic de/serialization of nearly any JavaScript value
- Tuned for [Zod](https://github.com/colinhacks/zod) parsers
- [End-to-end type safety](https://colinhacks.com/essays/painless-typesafety)
- Zero:
  - Third-party dependencies
  - Config (i.e. solid defaults)
  - CLI commands
  - Magic
- [Deno Deploy](https://deno.com) without a build step

## Inspirations

- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [superjson](https://github.com/blitz-js/superjson) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [json-dry](https://github.com/11ways/json-dry)
- [Next.js](https://nextjs.org/) / [Aleph.js](https://alephjs.org/)