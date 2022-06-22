# Cav

Cav is a collection of powerful primitives for building full stack web apps with
[Deno](https://deno.land). Guiding principles:

- Modular, maintainable server definitions
- No-fuss data serialization
- Automatic end-to-end typesafety
- Clarity > brevity
- Use The Platform

**Status:** Ready to play with, but not ready for production.

## Goals

- It should come with everything a modern web server might need, without relying
  on third-party services (minus the database)
  - [x] Routing
  - [x] Static asset serving
  - [x] Signed cookies and JWTs
  - [x] Web sockets
  - [x] Form and JSON parsing / validation
  - [x] De/serialization of most data types, including Files, Dates, Maps, etc.
  - [x] Dev-time bundling for TypeScript assets
  - [x] Works with frontend frameworks like [Preact](https://preactjs.com)
- "Hello world" should be as easy as `deno run`ning a tiny `main.ts`
  - [x] Zero config
  - [x] Zero CLI commands
- The client-side API should use types imported from the server to fully type
  requests and responses
  - [x] End-to-end typesafety
  - [x] Compatible with [Zod](https://github.com/colinhacks/zod) data parsers
- Its syntax should be functional and declarative
  - [x] Immutable, schema-like Router and Endpoint definitions
  - [x] No hidden context
  - [x] No middleware
  - [x] ~~No magic~~ Yes magic 🧙‍♂️
- Production deployments should be a simple git-commit-push
  - [x] [Deno Deploy](https://deno.com) without a build step
- It should minimize the threat of supply chain attacks
  - [x] Zero third-party dependencies

## Inspirations

- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [superjson](https://github.com/blitz-js/superjson) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [json-dry](https://github.com/11ways/json-dry)