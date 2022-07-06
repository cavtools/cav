# Cav

A collection of primitives for building full-stack web apps with
[Deno](https://deno.land).

**Status:** Ready to play with, but not ready for production.

- [Cav](#cav)
  - [Guiding principles](#guiding-principles)
  - [Goals](#goals)
  - [Inspirations](#inspirations)

## Guiding principles

- [Least
  Astonishment](https://en.wikipedia.org/wiki/Principle_of_least_astonishment)
- Modular, schema-like server definitions
- No-fuss data serialization
- End-to-end typesafety
- Developer independence
- Use the platform
- Have fun [🌈](https://www.youtube.com/watch?v=g_y15ozNchY)

## Goals

- It should do the basics
  - [x] Routing
  - [x] Static asset serving
  - [x] Signed cookies
  - [x] Web sockets
  - [x] Form and JSON parsing
  - [x] De/serialization of most JS data types, including Dates, Maps, Files...
  - [x] Runtime bundling for browser-side TypeScript
  - [x] Works with frontend frameworks like [Preact](https://preactjs.com)
- It shouldn't require any special tooling
  - [x] No config files
  - [x] No CLI commands
- The client-side API should use types imported from the server to fully type
  requests and responses
  - [x] [End-to-end typesafety](https://colinhacks.com/essays/painless-typesafety)
  - [x] Compatible with [Zod](https://github.com/colinhacks/zod)
- Its syntax should be functional and declarative
  - [x] Immutable, schema-like Router and Endpoint definitions
  - [x] No middleware patterns
  - [x] Functions all the way down
- It should be as independent as possible
  - [x] Zero third-party dependencies (just Deno)
- Production deployments should be a simple git-commit-push
  - [x] [Deno Deploy](https://deno.com) without a build step

## Inspirations

- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [superjson](https://github.com/blitz-js/superjson) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [json-dry](https://github.com/11ways/json-dry)

Cav's description on GitHub is inspired by the [Weird Wide
Webring](https://weirdwidewebring.net) 🤙