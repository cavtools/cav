# Cav

TODO: This is a placeholder readme until I'm done writing docs

Cav is an experimental TypeScript web framework built on
[Deno](https://deno.land). It provides a declarative and functional approach for
writing elegant full-stack web applications.

A quick demo of the framework in action can be seen at [cav.bar](https://cav.bar). The demo runs on Deno Deploy. It'll be replaced by the docs website soon.

Cav is inspired by many modern JavaScript/TypeScript patterns, techniques, and modules. Here's a few of those modules:

- [Next.js](https://nextjs.org/) / [Aleph.js](https://alephjs.org/)
- [Express](https://expressjs.com/) / [Koa](https://koajs.com/) / [Oak](https://oakserver.github.io/oak/)
- [Zod](https://github.com/colinhacks/zod) / [tRPC](https://trpc.io)
- [superjson](https://github.com/blitz-js/superjson) / [serialize-javascript](https://github.com/yahoo/serialize-javascript)

## Usage

- On the server: [`deno.land/x/cav/mod.ts`](https://deno.land/x/cav/mod.ts)
- In the browser:
  [`deno.land/x/cav/browser/mod.ts`](https://deno.land/x/cav/browser/mod.ts)

## Features 

- Zero third-party dependencies
  - This wouldn't be possible without Deno and its excellent [standard library](https://deno.land/std)
- Built-in bundling of TypeScript assets
  - Also [thanks to Deno](https://deno.land/manual/typescript/runtime.md)
- End-to-end type safety (inspired by trpc)
- Compatibility with Zod-style data parsers
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

## Status

Pre-alpha. Documentation and tests are in the works.

## Dedication

Cav is dedicated to the bar it was named after.

---

### Footnotes

[^1]: This is like superjson and similar libraries that let you serialize most
JavaScript data types into JSON and back again while maintaining references. Cav
does this and also adds support for Files and Blobs, meaning the client can send
arbitrary JavaScript objects that contain Files and Blobs anywhere on the
object, and the sent object will still come out on the other end in the same
shape, with the same data.<br><br>This is done by separating the Files and Blobs from the JSON-only data during
serialization and then packing the files and the JSON into a multipart form with
a unique shape. When the form is received, it'll be deserialized back into the
original object, with the attached files being placed into their original
locations on the output object. See [`pack.ts`](./pack.ts) for more info; look
at the `packBody` and `unpackBody` functions to see where Files and Blobs come
into play.
