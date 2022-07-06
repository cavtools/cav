# Cav

Full stack web primitives for [Deno](https://deno.land).

**Guiding principles:**

- [Least
  Astonishment](https://en.wikipedia.org/wiki/Principle_of_least_astonishment)
- Modular, schema-like server definitions
- No-fuss data serialization
- End-to-end typesafety
- Developer independence
- Use the platform
- Have fun [🌈](https://www.youtube.com/watch?v=g_y15ozNchY)

**Status:** Ready to play with, but not ready for production.

**Index:**

- [Goals](#goals)
- [Inspirations](#inspirations)
- [Setup](#setup)
- [Getting started](#getting-started)
- [Examples](#examples)
- [Docs](#docs)

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
- It shouldn't require special configs, setups, or tooling
  - [x] No CLI or config files
  - [x] No dictated project structures
- The client function should use types imported from the server to fully type
  requests and responses
  - [x] [End-to-end typesafety](https://colinhacks.com/essays/painless-typesafety)
  - [x] Compatible with [Zod](https://github.com/colinhacks/zod)
- Its syntax should be functional and declarative
  - [x] Immutable, schema-like Router and Endpoint definitions
  - [x] No middleware patterns
  - [x] Functions all the way down
- It should be as independent as possible
  - [x] No third-party dependencies
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

## Setup

TODO

## Getting started

TODO

## Examples

TODO

## Docs

TODO