# Cav

NOTE: This is a placeholder readme. Cav is still in its early days.

Cav is an experimental suite of TypeScript tools for web development with
[Deno](https://deno.land). It takes a declarative and functional approach to
writing full-stack websites and applications with the Deno ecosystem.

A quick demo of the Cav in action can be seen at [cav.bar](https://cav.bar). The
demo runs on Deno Deploy.

Cav is inspired by many modern web development patterns, techniques, and
modules. Here's a list of its heroes:

- [Next.js](https://nextjs.org/) / [Aleph.js](https://alephjs.org/)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) / [Oak](https://oakserver.github.io/oak/)
- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [json-dry](https://github.com/11ways/json-dry) / [superjson](https://github.com/blitz-js/superjson)

## Usage

- On the server: [`deno.land/x/cav/mod.ts`](https://deno.land/x/cav/mod.ts)
- In the browser:
  [`deno.land/x/cav/browser.ts`](https://deno.land/x/cav/browser.ts)

## Guiding principles

- Declarative and functional (no classes)
- Composable API
- No third-party dependencies
- Offer solutions but don't force them
- Play nice with others
- Isomorphic client function
- Client-side HTTP looks like a regular function call, regardless of body format
- Server-side HTTP looks like markup, with minimal/no TypeScript required
- Deeply integrated data parsing that's compatible with Zod
- Server types can be used client-side for end-to-end type safety
- Serialize most data types seamlessly
- Cookie signing for secure sessions
- Real-time capabilities (web sockets)
- Unopinionated about project organization (no enforced folder structure)
- Carefully chosen defaults

## Features so far

- Zero third-party dependencies
  - This wouldn't be possible without Deno and its amazing [standard
    library](https://deno.land/std)
- Built-in bundling of TypeScript assets
  - Also [thanks to Deno](https://deno.land/manual/typescript/runtime.md). This
    feature requires the `--unstable` flag
- Compatibility with many frontend libraries (e.g. Preact and React)
- Compatibility with Zod-style data parsers
- End-to-end type safety (inspired by trpc)
- "Any-body" data serialization [^1]
- Declarative routing ([`stack.ts`](./stack.ts))
- Declarative endpoint definitions ([`rpc.ts`](./rpc.ts))
- Easy-to-use web sockets
- Zero-config
- Signed and unsigned cookies
- Custom context support
- ...

[^1]: This is like superjson and similar libraries that let you serialize most
JavaScript data types into JSON and back again while maintaining references. Cav
does this and also adds support for Files and Blobs, meaning the client can send
arbitrary JavaScript objects that contain Files and Blobs anywhere on the
object, and the sent object will still come out on the other end in the same
shape, with the same data.

## Status

Pre-alpha. Documentation and tests are in the works.

## Dedication

Cav is dedicated to the bar it was named after.
