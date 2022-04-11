# Cav

Cav is an experimental TypeScript web framework for [Deno](https://deno.land).
It approaches web development with a declarative, backend-first mindset. It was
written with developers and DX top-of-mind. The source can be imported from
[`https://deno.land/x/cav`](https://deno.land/x/cav).

plz feel free to [hack this site](https://cav.bar). (and report back what you find, if you're feeling generous)

## Features 

TODO: Elaborate and provide examples

- Zero third-party dependencies
  - This wouldn't be possible without Deno and its excellent [standard library](https://deno.land/std)
- Built-in bundling of TypeScript assets
  - Also [thanks to Deno](https://deno.land/manual/typescript/runtime.md). If
    you haven't used it yet, go use it! 🦕
- End-to-end type safety (inspired by [trpc](https://trpc.io))
- Compatibility with [Zod](https://github.com/colinhacks/zod) data parsers
- "Any-body" data serialization (like [superjson](https://github.com/blitzjs/superjson) and friends, but with added support for Files and Blobs. See [`pack.ts`](./pack.ts) for more info; look at the `packBody` and `unpackBody` functions.)
- Declarative routing ([`stack.ts`](./stack.ts))
- Declarative endpoint definitions ([`rpc.ts`](./rpc.ts))
- Unopinionated about project structure
- Highly opinionated about behind-the-scenes HTTP procedures
- Carefully chosen defaults
- Easy-to-use web sockets
- Zero-config (the code is the config)
- Cookies (ofc)
- Custom context support
- TODO: there's more, I'm just exhausted

## Status

Alpha.

Although many months have been spent on this project, Cav is still just a baby. There's a ton of work to do before v0.1 (Beta).

The only documentation so far is the documentation in the code itself, and fair
warning, it's a bit cluttered in some spots. Code quality is on the to-do list,
but the focus is currently good documentation and good tests. Which, apparently,
are *super* hard to write if you decided not to write them first. (Who knew?)

Also, on that note, only one of the modules is tested at this point. **DO NOT
use this in production.** (Unless you're me and the site is
[cav.bar](https://cav.bar), in which case "rules are made to be broken.")

If you want progress updates, you can follow me on
[GitHub](https://github.com/connorlogin) or
[Twitter](https://twitter.com/connorlogin). I'll work on adding more ways to
stay up-to-date after some decent docs/tests have made it out of my system.

Please come again soon. If you're reading this, the journey has only just begun.

## Dedication

Cav is dedicated to the bar it was named after.
