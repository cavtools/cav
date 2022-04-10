# Cav

Cav is an experimental TypeScript web framework for [Deno](https://deno.land).
It approaches web development with a declarative, backend-first mindset. It was
written with developers and DX top-of-mind.

Here's some of its quirks (TODO: Elaborate and provide examples):

- Zero (!) third-party dependencies
  - It still boggles my mind that this was possible
  - It wouldn't be possible without Deno and its excellent [standard library](https://deno.land/std)
- Automatic bundling of TypeScript assets
  - Also insane, also [thanks to Deno](https://deno.land/manual/typescript/runtime.md). If you haven't used it yet, go use it! 🦕
- End-to-end type safety (like [trpc](https://trpc.io))
- Compatibility with [Zod](https://github.com/colinhacks/zod) data parsers
- "Any-body" data serialization (like [superjson](https://github.com/blitzjs/superjson), with added support for Files and Blobs)
- Declarative routing (Stacks)
- Declarative endpoint definitions (Rpcs)
- Unopinionated about project structure
- Highly opinionated about behind-the-scenes HTTP procedures
- Carefully chosen defaults
- Easy-to-use web sockets
- Zero-config (the code is the config)
- TODO: there's more, I'm just exhausted

## Status

Alpha.

Although many months have been spent on this project, Cav is still just a baby. There's a ton of work to do before it reaches Beta (v0.1).

The only documentation so far is the documentation in the code itself, and fair
warning, the code is still a bit of a mess. I'm cruising as fast as I can to get
this project out the door, but apparently good documentation and good tests are *super* hard to
write. (Who knew?)

Also, on that note, only one of the modules is tested so far. **DO NOT use this
in production.** (Unless you're me and the site is [cav.bar](https://cav.bar),
in which case "rules are made to be broken.")

If you want progress updates, you can follow me on
[GitHub](https://github.com/connorlogin) or
[Twitter](https://twitter.com/connorlogin). (Mind the tumbleweeds.) I'll work on
adding more ways to stay up-to-date after some decent docs/tests have made it
out of my system.

Please come again soon. If you're reading this, the journey has only just begun.
