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

## Current Goals

- Declarative and functional (no classes)
- Composable, take-your-pick API
- Offer solutions but don't force them
- Play nice with others
- Isomorphic fetch-based client function
- Calling a function on the server looks like calling a function on the client
- Server-side HTTP looks like markup, with minimal/no TypeScript required
- Markup-like data parsing compatible with Zod
- Use server types client-side for end-to-end type safety
- Serialize most data types seemlessly
- Signed cookies for secure sessions
- Real-time capabilities (web sockets)

## Future goals

- SPA-style routing and asset serving
- SSR
- Hydration
- Web component tools
- Scoped styles
- ?

## Features so far

- Zero third-party dependencies
  - This wouldn't be possible without Deno and its amazing [standard library](https://deno.land/std)
- Built-in bundling of TypeScript assets
  - Also [thanks to Deno](https://deno.land/manual/typescript/runtime.md). This feature requires the `--unstable` flag
- Compatibility with many frontend libraries (e.g. Preact and React)
- Compatibility with Zod-style data parsers
- End-to-end type safety (inspired by trpc)
- "Any-body" data serialization [^1]
- Declarative routing ([`stack.ts`](./stack.ts))
- Declarative endpoint definitions ([`rpc.ts`](./rpc.ts))
- Unopinionated project structures
- Opinionated HTTP procedures
- Carefully chosen defaults
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
shape, with the same data.<br><br>It works by separating the Files and Blobs
from the JSON-only data during serialization and then packing the files and the
JSON into a multipart form with a unique shape. When the form is received, it'll
be deserialized back into the original object, with the attached files being
placed into their original locations on the output object. See
[`pack.ts`](./pack.ts) for more info; look at the `packBody` and `unpackBody`
functions to see where Files and Blobs come into play.

## Status

Pre-alpha. Documentation and tests are in the works.

## Dedication

Cav is dedicated to the bar it was named after.
