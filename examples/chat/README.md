# Chat

An ephemeral real-time chat application.

Deps:

- Deno (+stdlib)
- Cav

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
development, the `--allow-env` variable is used to check for the DEV env. If
it's present, the "/dev" chat room is active.

## Architecture

The structure of this example is meant to serve as a starting point when
creating any new Cav project, regardless of complexity. Everything in this app
was typed manually; no CLI commands or boilerplate were created or used.

Module names were chosen to be memorized. Here's the purpose of every module in
this project given its filename:

- `api.ts`: Business logic. These should only be imported on the server
- `deps_dom.ts`: Browser-side dependencies for the `dom.ts` modules. These
  shouldn't be imported on the server
- `deps.ts`: Server-side dependencies. Don't import these in the `dom.ts`
  modules
- `dom.ts`: Browser-side code. Server code shouldn't be imported here, except
  for `import type`, which is allowed and encouraged. These imports are stripped
  and don't affect bundle output
- `html.ts`: HTML templates. These are browser-compatible, i.e. can be imported
  on both the server and the browser
- `server.ts`: Server-side code. The top-level `server.ts` also has an
  entrypoint conditional which starts the server if the file is run directly

The `assets/` directory is served with an `assets()` endpoint on the
`chatRouter` in the root `server.ts`. This is where the CSS goes. We could put
the CSS as strings on the `chatRouter` if we wanted, but this would cause the
server to reload on every CSS change, which is unnecessary work.

Initially, all the TS code was squeezed into just the top-level modules. Once it
got messy enough, the code specific to the chat room pages was split off into
the `room/` folder with the same module structure as the top-level modules. i.e.
a "sub-app" with the same structure as the root app.

The `base/` sub-app was also created to hold code shared between the sub-apps
and root app. This process of peeling away pieces of the top-level modules and
sticking them into sub-app folders can be repeated an arbitrary number of times
to keep the code organized, predictable, and easy to skim through.

Note: Cav is just a collection of functions. You can more or less use any folder
structure or design pattern you want. If this example doesn't work for you, Deno
and TypeScript give you endless possible approaches to choose from. Have fun
with it 🦄

## Development

To start the server in development mode, run `deno task dev`. It'll bind to port
8080.

Any updates made to the server-side code will trigger a server reload. The old
server state will be lost.

In development mode, the "/dev" chat room is enabled, providing a stable room ID
for testing changes. This is a lot faster than creating a new room every time
the CSS changes.

When updates are made to the `dom.ts` code, the cached bundle will be evicted
and regenerated. The changes will take effect when the browser window is
reloaded.

## Production

To start the server in production mode, run `deno task prod`.

In production, the "/dev" chat room is disabled. Another difference between
development mode and production mode is the absence of the `--watch` Deno flag
in production, which disables server module watching / reloading. Updates to the
`dom.ts` bundle will still take effect, but on-the-fly updates to server code
won't. A restart would be required.

Note: This app doesn't work well with Deno Deploy because it requires temporary
server state that isn't synced between every Deploy data center. Each chat room
would only be accessible for users connecting to the Deploy server instance that
created it. (Something like [Supabase](https://supabase.com) could fill the gap
here. Supabase API calls would get along well in `room/api.ts`.)
