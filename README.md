# Cav

Cav is a collection of powerful primitives for building full-stack web apps with
[Deno](https://deno.land).

**Status:** Ready to play with, but not ready for production. The tests are
currently outdated as of 0.2.0-alpha.*. Most will probably fail.

## Guiding principles

- [Least
  Astonishment](https://en.wikipedia.org/wiki/Principle_of_least_astonishment)
- Modular, maintainable server definitions
- No-fuss data serialization
- Automatic end-to-end typesafety
- Use The Platform

## [Examples](./examples/README.md)

- [Chat](./examples/chat): An ephemeral real-time chat server

## [Docs](./docs/README.md)

- [Getting started](./docs/getting-started.md)
- [Routers](./docs/routers.md)
- [Endpoints](./docs/endpoints.md)
- [Request parsing](./docs/request-parsing.md)
- [Response resolution](./docs/response-resolution.md)
- [Context](./docs/context.md)
- [Error handling](./docs/error-handling.md)
- [Client fetch](./docs/client-fetch.md)
- [Assets](./docs/assets.md)
- [Bundles](./docs/bundles.md)
- [Web sockets](./docs/web-sockets.md)
- [API](./docs/api.md)

## Goals

- It should come with everything a modern web server might need, without relying
  on third-party services (minus the database)
  - [x] Routing
  - [x] Static asset serving
  - [x] Signed cookies and JWTs
  - [x] Web sockets
  - [x] Form and JSON parsing / validation
  - [x] De/serialization of most data types, including Files, Dates, Maps, etc.
  - [x] Runtime bundling for browser-side TypeScript
  - [x] Works with frontend frameworks like [Preact](https://preactjs.com)
- "Hello world" should be as easy as `deno run`ning a tiny `server.ts`
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

Cav's description on GitHub is inspired by the [Weird Wide
Webring](https://weirdwidewebring.net) 🤙