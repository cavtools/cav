# Chat

Anonymous, disposable chat room service using web sockets.

Deps:
  - https://deno.land/std
  - https://deno.land/x/cav

<details><summary>Nav</summary>

- [Home](https://cav.bar)
- [Docs](../../docs/README.md)
  - [Getting started](../../docs/getting-started.md)
  - [Routers](../../docs/routers.md)
  - [Endpoints](../../docs/endpoints.md)
  - [Request parsing](../../docs/request-parsing.md)
  - [Response resolution](../../docs/response-resolution.md)
  - [Context](../../docs/context.md)
  - [Error handling](../../docs/error-handling.md)
  - [Client fetch](../../docs/client-fetch.md)
  - [Assets](../../docs/assets.md)
  - [Bundles](../../docs/bundles.md)
  - [Web sockets](../../docs/web-sockets.md)
  - [API](../../docs/api.md)
- [Examples](../README.md)
  - [Blog](../blog): Markdown blogging
  - 📍 [Chat](../chat): Ephemeral chat rooms
  - [Shortcuts](../shortcuts): URL Shortening

</details>

## Setup

Install the latest version of [Deno](https://deno.land). This app was created
with v1.22.2.

If you're using VSCode, install the [Deno
extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno).
It's also recommended to install the
[es6-string-html](https://marketplace.visualstudio.com/items?itemName=Tobermory.es6-string-html)
extension, which provides syntax highlighting for the templates in the `html.ts`
modules.

## Permissions

This app requires the `--allow-net` and `--allow-read`
[permissions](https://deno.land/manual/getting_started/permissions). During
development, the `--allow-env` permission is used to check for the DEV env. If
it's present, the "/dev" chat room is active.

## Architecture

The structure of this example is meant to serve as a starting point when
creating any moderately complex project, such as a chat server.

### Assets

The `assets/` directory is served with an `assets()` endpoint on the main app.
We could serve the CSS as static strings on the main app if we wanted, but this
would cause the server to reload on every CSS change, which is annoying.

Assets aren't served on the room app because, if they were, users who log into
multiple rooms would need to download multiple copies of the same asset. The
room CSS would be served at `/:roomId/room.css`, therefore each room would get
its own copy of the same stylesheet. Serving the CSS at `/room.css` (on the main
app) requires only a single cached stylesheet shared between every room.

### Modules

Module names were chosen to be memorized. Here's the purpose of every module in
this project given its filename:

- `deps.ts`: Server-only dependencies
- `deps_dom.ts`: Browser-only dependencies
- `deps_iso.ts`: Isormorphic dependencies. (Browser-compatible)
- `server.ts`: Server-side code, where handlers are defined. (Server-only)
- `api.ts`: Business logic. (Server-only)
- `html.ts`: HTML templates. (Browser-compatible)
- `rpc.ts`: For triggering server routines on the client. (Browser-compatible)
- `dom.ts`: Browser-side code, where DOM manipulation happens. While these
  shouldn't import server code directly, they are allowed and encouraged to
  `import type` from server-only modules. Type imports are stripped during
  bundling. (Browser-only)

Initially, everything was squeezed into just the top-level modules. When it got
messy enough, the code specific to the chat rooms was split off into the `room/`
folder with the same module structure as the top-level modules. i.e. a "sub-app"
was created with the same structure as the main app.

The internal `base/` sub-app was also created to hold code shared between the
new sub-app and main app. This process of peeling away pieces of the top-level
modules and sticking them into sub-app folders can be repeated an arbitrary
number of times to keep the code organized, predictable, and easy to skim
through.

Note: Cav is just a collection of functions. You can more or less use any folder
structure or design pattern you want. If this example doesn't work for you,
TypeScript and Deno give you endless possible approaches to choose from. Have
fun with it 🦄

## Development

To start the server in development mode, run `deno task dev`. It'll bind to port
8080.

Any updates made to the server-side code will trigger a server reload. The old
server state will be lost.

In development mode, the "/dev" chat room is enabled, providing a stable room ID
for testing changes. This is a lot faster than creating a new room every time
the HTML changes.

When updates are made to the `dom.ts` code, the cached bundle will be evicted
and regenerated. The changes will take effect when the browser window is
reloaded. (Live-reload is on the feature radar.)

## Production

To start the server in production mode, run `deno task prod`.

In production, the "/dev" chat room is disabled. The only other difference
between development and production is the absence of the `--watch` Deno flag in
production, which disables server module watching / reloading. Updates to the
`dom.ts` bundles will still take effect, but on-the-fly updates to server code
won't. A manual restart would be required.

Note: This app doesn't work well with Deno Deploy because it requires temporary
server state that isn't synced between every Deploy data center. Each chat room
would only be accessible for users connecting to the Deploy server instance that
created it. (Something like [Supabase](https://supabase.com) could fill the gap
here. Supabase API calls would get along well in `room/api.ts`.)