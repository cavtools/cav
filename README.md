# Cav

NOTE: This is an MVP. Nothing has been properly battle tested. You probably
shouldn't use this in production yet.

Cav is a web framework for [Deno](https://deno.land).

## Inspirations

- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [superjson](https://github.com/blitz-js/superjson) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [json-dry](https://github.com/11ways/json-dry)

## Goals

- Learn everything I can about backend web frameworks, by writing one (?)
  - [x] Zero third-party dependencies
- It should come with everything I need to build any modern web app (minus the
  database)
  - [x] Built-in request routing
  - [x] Easy static asset serving
  - [x] (Signed) cookies and JWTs
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
- [ ] Well-defined project layouts
- [ ] File-system based routing
- [ ] Official plugins for popular libraries
- [ ] Make everyone happy
- [ ] Money

## Current limitations

- Large file uploads: Currently, file uploads are completely loaded into memory
  on the server. Be mindful when changing the `maxBodySize` option on an
  Endpoint, which defaults to 5mb. Automatic disk-backed file uploads are a WIP
- The Router is URLPattern based, but only supports a small subset of the
  URLPattern syntax: Non-repeating path groups (w/o regex) and the solo wildcard
  route "*". For example, this is the most complicated kind of route the Router
  can handle: "/api/:company/users/:id". This limitation is purposeful, it's
  there because of the way end-to-end typesafety works in Cav. The Routers are
  mostly for namespacing purposes on the client-side with their routes working
  like properties on an object, while the Endpoints do the work of actually
  handling a request and thus translate into client-side methods. Endpoints DO
  support the full URLPattern syntax if you need more complicated url matching,
  and the Endpoint `groups` parser can parse groups captured by path groups in
  the Router. i.e. There's ways around this limitation. Tip: Keep Router routes
  as simple as possible. They're really only there for organizing Endpoints into
  logical units.