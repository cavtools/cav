# Cav

Cav is a freelancer's web framework, made for [Deno](https://deno.land). It
provides a craft brewed development experience, leveraging many powerful
TypeScript features to streamline the creation of full-stack web applications.

**Core principles:**

- Modularity
- Declarative server definitions
- Automatic end-to-end typesafety
- Use The Platform

**Status:** New, active, and not yet ready for production.

## Goals

- Learn as much as possible about backend web frameworks by writing one, from
  ~~scratch~~ Deno
  - [x] Zero third-party dependencies
- It should come with everything a solo developer would need to build a modern
  web app (minus the database)
  - [x] Built-in request routing
  - [x] Easy static asset serving
  - [x] (Signed) cookies and JWTs
  - [x] Web socket support
  - [x] Dev-time bundling for TypeScript assets
  - [x] Works with JSX frameworks like [Preact](https://preactjs.com)
  - [x] Form parsing and file uploads
  - [x] Automatic de/serialization of most data types, including Maps, Sets,
        etc.
- "Hello world" should be as easy as `deno run`ning a tiny `main.ts`
  - [x] Zero config
  - [x] Zero CLI commands
- The client should use types imported from the server to catch API mistakes at
  the IDE level automatically
  - [x] [End-to-end type safety](https://colinhacks.com/essays/painless-typesafety)
  - [x] Compatible with [Zod](https://github.com/colinhacks/zod) data parsers
- Most tasks should be typesafe without needing to write TypeScript
  - [x] Uses inferencing and generics behind-the-scenes
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

## Dedication

Cav is dedicated to the bar it was named after.