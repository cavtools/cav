# Cav

Cav is a collection of powerful functions for building full-stack web apps with
[Deno](https://deno.land).

**Status:** Ready to play with, but not ready for production.

## Guiding principles

- [Least
  Astonishment](https://en.wikipedia.org/wiki/Principle_of_least_astonishment)
- Modular, maintainable server definitions
- No-fuss data serialization
- Automatic end-to-end typesafety
- Developer freedom
- Use the platform
- Have [fun](https://www.youtube.com/watch?v=g_y15ozNchY) 🌈

## Nav

- 📍 [Home](https://cav.bar)
- [Docs](https://cav.bar/docs)
  - [Getting started](https://cav.bar/docs/getting-started)
  - [Routers](https://cav.bar/docs/routers)
  - [Endpoints](https://cav.bar/docs/endpoints)
  - [Request parsing](https://cav.bar/docs/request-parsing)
  - [Response resolution](https://cav.bar/docs/response-resolution)
  - [Context](https://cav.bar/docs/context)
  - [Error handling](https://cav.bar/docs/error-handling)
  - [Client fetch](https://cav.bar/docs/client-fetch)
  - [Assets](https://cav.bar/docs/assets)
  - [Bundles](https://cav.bar/docs/bundles)
  - [Web sockets](https://cav.bar/docs/web-sockets)
  - [API](https://cav.bar/docs/api)
- [Examples](https://cav.bar/examples/README)
  - [Blog](https://cav.bar/examples/blog): Markdown blogging
  - [Chat](https://cav.bar/examples/chat): Ephemeral chat rooms
  - [Shortcuts](https://cav.bar/examples/shortcuts): URL Shortening

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
  - [x] Functions all the way down
- Production deployments should be a simple git-commit-push
  - [x] [Deno Deploy](https://deno.com) without a build step
- It should stand on its own
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