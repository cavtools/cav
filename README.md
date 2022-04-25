# Cav

NOTE: This is new, don't use it in production.

Cav is a full stack web framework for [Deno](https://deno.land). It's heavily
inspired by these innovators in the JavaScript and TypeScript ecosystems:

- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [Next.js](https://nextjs.org/) / [Aleph.js](https://alephjs.org/)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) /
  [Oak](https://oakserver.github.io/oak/)
- [json-dry](https://github.com/11ways/json-dry) /
  [devalue](https://github.com/Rich-Harris/devalue) /
  [superjson](https://github.com/blitz-js/superjson)
- ...

## Goals

- Zero third-party dependencies
- Declarative and functional, no classes
- (De)composable API
- Routing using
  [URLPatterns](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API)
- [End-to-end typesafety](https://colinhacks.com/essays/painless-typesafety),
  à la tRPC
- Maximal TypeScript benefits, minimal TypeScript
- Serialize (almost) any JavaScript value
- [Isomorphic](https://en.wikipedia.org/wiki/Isomorphic_JavaScript) client
- Signed cookies
- Web sockets
- Compatible with [Preact](https://preactjs.com) et. al.
- Frontend TypeScript bundling
- Excellent defaults
- "The code is the config"
- Unopinionated code organization
- ...

## Non-goals

- Money
- Popularity
- Server-side generation
- Server-side rendering
  - SSR is still possible, but it's not something Cav facilitates directly yet
- ...

## Usage

- On the server: [`deno.land/x/cav/mod.ts`](https://deno.land/x/cav/mod.ts)
- In the browser:
  [`deno.land/x/cav/browser.ts`](https://deno.land/x/cav/browser.ts)
