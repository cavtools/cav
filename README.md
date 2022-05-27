# Cav

NOTE: This is an MVP. Nothing has been properly battle tested. You probably
shouldn't use this in production yet.

Cav is an experimental web framework for [Deno](https://deno.land).

## Goals

- Learn everything I can about backend web frameworks, by creating one
  - [x] Zero third-party dependencies
- It should have everything I need to build a modern web app without
  third-party services
  - [x] Built-in request routing
  - [x] Easy static asset serving
  - [x] (Signed) cookies and JWTs
  - [x] Web socket support
  - [x] Dev-time bundling for TypeScript assets
  - [x] Support frontend frameworks like [Preact](https://preactjs.com)
  - [x] Automatic de/serialization of most data types, including Maps, Sets, etc.
- "Hello world" should be as easy as `deno run`ning a tiny `main.ts`
  - [x] Zero config
  - [x] Zero CLI commands
- The client should use the server types to catch input and output type errors
  at the IDE level
  - [x] [End-to-end type safety](https://colinhacks.com/essays/painless-typesafety)
  - [x] Compatible with [Zod](https://github.com/colinhacks/zod) data parsers
  - [x] Maximal TypeScript benefits, minimal TypeScript (via type inference)
- It should be functional and declarative
  - [x] Schema-like router and endpoint definitions
  - [x] No hidden context
  - [x] No middleware
  - [x] ~~No magic~~ Yes magic 🧙‍♂️
- Production deployments should be easy
  - [x] [Deno Deploy](https://deno.com) without a build step

## Non-goals

- [ ] Made for 1) enterprises and 2) solo developers alike
- [ ] React-first frontend development
- [ ] Built-in SSR and hydration
- [ ] SSG
- [ ] Strict, well-defined project structures
- [ ] File-system based routing
- [ ] Official plugins for many popular libraries
- [ ] Make everyone happy
- [ ] Make lotsa money

## Inspirations

- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [superjson](https://github.com/blitz-js/superjson) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [json-dry](https://github.com/11ways/json-dry)
- [Next.js](https://nextjs.org/) / [Aleph.js](https://alephjs.org/)