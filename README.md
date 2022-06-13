# Cav

Cav is a freelancer's web framework, made for [Deno](https://deno.land). Guiding
principles:

- Modular, maintainable server definitions
- Isomorphic client integration
- Automatic end-to-end typesafety
- Use The Platform

**Status:** WIP, active, almost fully tested, and definitely not ready for
production.

## Goals

- Learn as much as possible about backend web frameworks, by writing one from
  ~~scratch~~ Deno
  - [x] Zero third-party dependencies
- It should come with everything a solo developer would need to build a modern
  web app (minus the database)
  - [x] Routing
  - [x] Static asset serving
  - [x] (Signed) cookies and JWTs
  - [x] Web sockets
  - [x] Form and JSON parsing / validation
  - [x] De/serialization of most data types, including Files, Dates, Maps, etc.
  - [x] Dev-time bundling for TypeScript assets
  - [x] Works with frontend frameworks like [Preact](https://preactjs.com)
- "Hello world" should be as easy as `deno run`ning a tiny `main.ts`
  - [x] Zero config
  - [x] Zero CLI commands
- The client should use types imported from the server to catch API mistakes at
  the IDE level automatically
  - [x] End-to-end typesafety
  - [x] Compatible with [Zod](https://github.com/colinhacks/zod) data parsers
- Most tasks should be typesafe without needing to write TypeScript
  - [x] Uses inferencing and generics behind-the-scenes
  - [x] Maximal TypeScript benefits, minimal TypeScript
- Its syntax should be functional and declarative
  - [x] Immutable, schema-like Router and Endpoint definitions
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
- [ ] Make everyone happy
- [ ] Money

## Inspirations

- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [superjson](https://github.com/blitz-js/superjson) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [json-dry](https://github.com/11ways/json-dry)

## Notes

Links and thoughts related to Cav's architecture.

- [HackerNews](https://news.ycombinator.com/item?id=31285827): **TRPC: End-to-end typesafe APIs made easy (trpc.io)**
  - Cav and tRPC scratch a similar itch, but Cav wanders a little further into
    Express territory.
    
    When I started writing what would become Cav, tRPC couldn't (on its own)
    accept posted bodies that weren't JSON, which led to a craving for an input
    normalization step before the parsing step that could accept both JSON and
    regular HTML forms. i.e. an endpoint with a single input parser could use it
    to parse both FormData and JSON request bodies. This would be useful in
    simple static sites that only need a contact or subscription form, for
    example.
    
    I was also toying around with Deno's bundler in my spare time, and superjson
    was something I was using at work. I loved the thought of a comprehensive,
    full-stack solution that combined these ideas into a unified module, built
    on this standards-compliant runtime I was rapidly falling for. It seemed
    like writing such a framework myself would be a fun learning project.

    Lessons so far: Web frameworks are hard, Deno is awesome, and making your
    own tools is a great way to learn things you never knew you never knew [🍃](https://www.youtube.com/watch?v=O9MvdMqKvpU)
  - End-to-end typesafety is fairly straightforward TypeScript witchcraft. Short
    summary: TypeScript strips type imports at build time, making it possible to
    import server-side type definitions into client-side code without runtime
    consequences. The client can then use those types to keep API inputs/outputs
    in-sync with what the server expects, triggering TS errors when something
    isn't right. This works without requiring code generation, which is a
    limitation of the venerable [gRPC](https://grpc.io/). Add TypeScript's
    inferencing and generics to the mix, and a new world of developer tools is
    born.
    
    This is a really cool pattern to work with. A great resource to learn more
    is [this essay](https://colinhacks.com/essays/painless-typesafety) written
    by Colin McDonnell, the creator of Zod and tRPC.
    
    It seems like there's some convergent evolution going on in the community
    regarding this pattern, and there's several projects mentioned in the HN
    comments on this post that work with similar concepts. TypeScript makes
    implementing this pretty simple, and Cav is just one person's subjective
    take on what it can look like.

## Dedication

Cav is dedicated to the bar it's named after. 🍻