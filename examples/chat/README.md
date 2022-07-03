# [Cav](https://cav.bar) / [Examples](../README.md) / Chat

Anonymous, disposable real-time chat rooms using web sockets.

Deps:
  - https://deno.land/std
  - https://deno.land/x/cav

## Setup

Install the latest version of [Deno](https://deno.land). This app was created
with v1.23.2.

Recommended:

- [VSCode Deno
extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)
- [VSCode es6-string-html extension](https://marketplace.visualstudio.com/items?itemName=Tobermory.es6-string-html)

## Development

To start the server in development mode, run `deno task dev`. It'll bind to port
8000.

Notes:

- Updates to server-side code will trigger a server reload
- The "/dev" chat room is active, providing a stable room ID for testing changes
- Updates to browser-side code will cause the cached `/dom.ts`
  bundle to be evicted and regenerated. Changes will take effect when the
  browser window is reloaded. (Live-reload is on the radar.)

## Production

To start the server in production mode, run `deno task prod`.

Notes:

- Updates to server-side code will NOT trigger a server reload
- The "/dev" chat room is disabled
- Updates to browser-side code will still trigger cache eviction
- This app doesn't work well with Deno Deploy because it requires temporary
  server state. (Something like [Supabase](https://supabase.com) could fill the
  gap here. Supabase API calls would get along well in `room/api.ts`.)

## Architecture

The structure of this example is meant to serve as a starting point when
creating any moderately complex project, such as a chat server.

### Assets

The `assets/` directory is served with an `assets()` endpoint on the main app.
We could serve the CSS as static strings on the main app if we wanted but that
would cause the server to reload on every CSS change, which is annoying.

Assets aren't served on the room app because, if they were, users who log into
multiple rooms would need to download multiple copies of the same asset. The
room CSS would be served at `/:roomId/room.css`, therefore each room would get
its own copy of the same stylesheet. Serving the CSS at `/room.css` (on the main
app) requires only a single cached stylesheet shared between every room.

### Modules

- `deps.ts`: Server-only dependencies
- `deps_dom.ts`: Browser-only dependencies
- `deps_iso.ts`: Isormorphic dependencies. (Browser-compatible)
- `server.ts`: Server-side code, where handlers are defined.
- `api.ts`: Business logic. (Server-only)
- `html.ts`: HTML templates. (Browser-compatible)
- `rpc.ts`: For triggering server routines on the client. (Browser-compatible)
- `dom.ts`: Browser-side code, where DOM manipulation happens. While these
  shouldn't import server code directly, they are allowed and encouraged to
  `import type` from server-only modules. Type imports are stripped during
  bundling.

### Process

Initially, everything was squeezed into just the top-level modules. When it got
messy enough, the code specific to the chat rooms was split off into the `room/`
folder with the same module structure as the top-level modules. i.e. a "sub-app"
was created with the same structure as the main app.

The internal `base/` sub-app was also created to hold code shared between the
new sub-app and main app. This process of peeling away pieces of the top-level
modules and sticking them into sub-app folders can be repeated an arbitrary
number of times to keep the code organized, predictable, and easy to skim
through.