# Cav

Cav is a web framework for [Deno](https://deno.land).

**Status:** New, active, and not yet ready for production.

## Goals

- Learn everything I can about backend web frameworks, by writing one (?)
  - [x] Zero third-party dependencies
- It should come with everything I need to build any modern web app (minus the
  database)
  - [x] Built-in request routing
  - [x] Easy static asset serving
  - [x] (Signed) cookies and JWTs (WIP)
  - [x] Web socket support
  - [x] Dev-time bundling for TypeScript assets
  - [x] Works with JSX frameworks like [Preact](https://preactjs.com)
  - [x] Automatic de/serialization of most data types, including Maps, Sets,
        etc.
- "Hello world" should be as easy as `deno run`ning a tiny `main.ts`
  - [x] Zero config
  - [x] Zero CLI commands
- The client API should use types imported from the server to catch I/O type
  errors at the IDE level
  - [x] [End-to-end type safety](https://colinhacks.com/essays/painless-typesafety)
  - [x] Compatible with [Zod](https://github.com/colinhacks/zod) data parsers
  - [x] Maximal TypeScript benefits, minimal TypeScript
- Its syntax should be functional and declarative
  - [x] Schema-like Router and Endpoint definitions
  - [x] No hidden context
  - [x] No middleware
  - [x] ~~No magic~~ Yes magic 🧙‍♂️
- Production deployments should be a simple git-commit-push
  - [x] [Deno Deploy](https://deno.com) without a build step

## Non-goals

- [ ] React-first
- [ ] Built-in SSR and hydration
- [ ] SSG
- [ ] Strict file/folder structure
- [ ] File-system based routing
- [ ] Official plugins for popular libraries
- [ ] Make everyone happy
- [ ] Money

## Inspirations

- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [superjson](https://github.com/blitz-js/superjson) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [json-dry](https://github.com/11ways/json-dry)
