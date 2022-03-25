# Getting started with Cav

These docs assume you're a TypeScript developer with some experience using Deno
and Preact.

I suggest leaving your right-click menu at home. Typing everything manually aids
the learning process, and it's how Cav is intended to be used. You can expand
the "⚡️ Breakdown" drop-downs to get a closer look at what's happening.

To start, we're going to do To-Dos. (It's tradition.)

- [Getting started with Cav](#getting-started-with-cav)
  - [0. Install Deno](#0-install-deno)
  - [1. Greet the world](#1-greet-the-world)
  - [2. Design the interface](#2-design-the-interface)
  - [3. Build the interface](#3-build-the-interface)
  - [4. API the business logic](#4-api-the-business-logic)
  - [5. Pipe the data](#5-pipe-the-data)
  - [6. Attach a database](#6-attach-a-database)
  - [7. Authenticate users](#7-authenticate-users)
  - [8. Push to production](#8-push-to-production)

## 0. Install Deno

Before we begin, take a big long sip of water. You need it to, like, live and
stuff.

Now *you* may need water, but *Cav* needs [Deno](https://deno.land). Install
v1.20 or higher.

If you're using [Visual Studio Code](https://code.visualstudio.com/) as your IDE, install the [vscode_deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno).

## 1. Greet the world

Create a new folder for the project. (This folder will be referred to as
`<root>/` moving forward.)

If you're using Visual Studio Code, create a `.vscode/` folder in `<root>/` and
put a `settings.json` file in there with the following JSON. (Why? [Click
here.](https://deno.land/manual@v1.20.1/vscode_deno#deno-enabling-a-workspace))

```jsonc
{
  // <root>/.vscode/settings.json (don't include this line)
  "deno.enable": true,
  "deno.lint": true
}
```

Create a `main.ts` file in the project `<root>/`, which will be the entrypoint
for the server. Pop this code in there:

```ts
#!/usr/bin/env deno run --watch --allow-net --allow-read
// <root>/main.ts
// This module is server-only.

import {
  assets,
  serve,
  stack,
} from "https://deno.land/x/cav/mod.ts";

const mainStack = stack({
  "*": assets({
    cwd: import.meta.url,
  }),
});

serve(mainStack);
console.log("Listening on port 8000");
```

<details><summary>⚡️ Breakdown</summary>

TODO 🥚

</details>

Now go to your terminal and make that file executable. This lets you easily
start the server with the command `./main.ts`.

```sh
> chmod +x main.ts
```

Next, create an `assets/` folder in `<root>/`, and put an `index.html` file in
it. This will be the landing page. Keep it minimal for now:

```html
<!DOCTYPE html> <!-- <root>/assets/index.html -->
<html lang="en"><head>

  <meta charset="utf-8">
  <title>🥚 To-Dos</title>

</head><body>

  <h1>Hello, world!</h1>

</body></html>
```

Drink some water and let your baby gestate for a few minutes. When you're good
and ready, start the server from the terminal and point your browser to
http://localhost:8000.

```sh
> ./main.ts
# ... Deno stuff ...
Listening on port 8000
```

![Screenshot of http://localhost:8000 in a browser window. The text "Hello,
world!" is in the top left corner. It's in that stupid serif font you get when
you fail to properly link the font CSS. (Is it rude to say stuff like that in an
alt text?)](./assets/00_getting_started_hello.png)

Pat yourself on the back for surviving a gestating-baby joke. You did it! 🥳

## 2. Design the interface

(If you're like me, this is the hardest step to get through. Have yourself a
good cry and psych up for the brutal cost-to-benefit ratio that's barrelling
your way. Don't let it catch you off guard... *it can smell fear.*)

Create a wireframe for the interface using your favorite design software. I'm no
designer, but [Figma](https://figma.com) doesn't care. Here's a "good enough"
outline that I struggled through. The font is [Inter](https://rsms.me/inter/).

![Prototype of the interface we'll be making. It has three to-dos on it, each
demonstrating the different styles for the three different states of to-dos: 🥚
unstarted, 🐥 in-progress, and 🐓
finished.](./assets/00_getting_started_prototype.png)

<details><summary>Take a deep breath, a gulp of water, and let that negative energy leave your body. The rest
of this is super fun, I promise. 😇</summary>

🤞

</details>

## 3. Build the interface

Cav is capable of working with many frontend libraries, thanks to [Deno's
runtime compiler API](https://deno.land/manual@main/typescript/runtime). For
this project, we're going to use [Preact](https://preactjs.com).

Export the Preact dependency from a standalone module. If you're familiar with
Deno, then you're familiar with the [`deps.ts`
pattern](https://deno.land/manual/examples/manage_dependencies). This is like
that, but we'll call it `<root>/preact.ts`:

```ts
// <root>/preact.ts
// This module is browser-only.

export * from "https://esm.sh/preact";
export * from "https://esm.sh/preact/hooks";
export type { Ref } from "https://esm.sh/preact"; // Fixes a conflict
```

Before working on the actual interface, let's migrate the current landing page
to Preact instead of vanilla HTML. Create an `app.tsx` file in the project
`<root>/`. In it, type this:

```tsx
// <root>/app.tsx
// This module is browser-only.

/** @jsxImportSource https://esm.sh/preact */

export function App() {
  return (
    <h1>Hello from Preact!</h1>
  );
}
```

<details><summary>⚡️ Breakdown</summary>

To learn more about the `@jsxImportSource` pragma, [click
here](https://deno.land/manual/jsx_dom/jsx).

It's important that this module doesn't get imported by server code, and
vice-versa. I like to keep my project structure as flat as possible, though,
with all the files more or less mixed together. To delineate between server and
browser modules, you may have noticed that I include a comment at the top of
each module which states where the module is intended to be used. Following the
example set by [Deno's contributor style
guide](https://deno.land/manual/contributing/style_guide), I use three
variations:

```ts
// This module is browser-only.
```

```ts
// This module is browser-compatible.
```

```ts
// This module is server-only.
```

You don't have to do what I do. With Cav, you can organize your code however you
like. Just remember to keep your browser-only code and server-only code away
from each other on the dependency graph.

</details>

Let's render the `App` to the page using a `<root>/assets/bundle.tsx` file:

```ts
// <root>/assets/bundle.tsx
// This module is browser-only.

/** @jsxImportSource https://esm.sh/preact */
import { App } from "../app.tsx";
import { render } from "../preact.ts";

render(<App />, document.body);
```

<details><summary>⚡️ Breakdown</summary>

Cav's TypeScript bundling will bundle all dependencies when serving the
`bundle.tsx` file. The served file will have the correct
`application/javascript` content-type header.

Bundled dependencies don't need to be located inside the `assets/` folder. They
can be imported from anywhere, following Deno's module resolution algorithm.

You should pay close attention to the dependency graph when leveraging
TypeScript bundling. If you have multiple TypeScript assets that import the same
dependency, that dependency will be served to the client multiple times, which
is a waste of bandwidth. A good standard practice would be to have just one
bundle in your `assets/` folder that imports everything needed by the
client-side application, as well as taking care of application setup like
rendering and whatnot.

To avoid bundling a dependency, you can use the `await import()` feature
provided by the browser. Dependencies imported with `await import()` will not be
included in the served bundle. However, these dependencies must come from a
location that is accessible to the browser, such as a remote URL or from inside
the assets folder.

Note that Deno allows for top-level await, so you can do something like this if
you want:

```ts
import { bundled } from "../outside/assets/mod.ts";
const { notBundled } = await import("./inside/assets/mod.ts");
```

Pretty cool, eh? (God, I love Deno.)

</details>

Next, link the bundle in the `index.html` with a `<script type="module">` tag:

```html
<!DOCTYPE html> <!-- <root>/assets/index.html -->
<html lang="en"><head>

  <meta charset="utf-8">
  <title>🐣 To-Dos</title>
  <script type="module" src="./bundle.tsx"></script> <!-- + -->

</head><body>

  <!-- <h1>Hello, world!</h1> -->
  <noscript>This app requires JavaScript.</noscript> <!-- + -->

</body></html>
```

One more thing before Preact is good to go: Because Cav's TypeScript bundling
relies on an unstable Deno API as well as temporary files stored on disk, it
needs to be explicitly enabled using a `tsBundler()` and the `--unstable` and
`--allow-write` flags. Modify the `<root>/main.ts` file to look like this:

```ts
#!/usr/bin/env deno run --watch --allow-net --allow-read --allow-write --unstable
// <root>/main.ts
// This module is server-only.

// Don't forget to add the --allow-write and --unstable flags to the shebang!

import {
  assets,
  serve,
  stack,
  tsBundler, // +
} from "https://deno.land/x/cav/mod.ts";

const mainStack = stack({
  "*": assets({
    cwd: import.meta.url,
    bundlers: [tsBundler()], // +
  }),
});

serve(mainStack);
console.log("Listening on port 8000");
```

After saving your modifications, the server should've reloaded automatically
thanks to the `--watch` flag. But we added some new flags, so you'll need to
manually restart the server this time.

Condemn that old hag to death-by-hangup with a `ctrl-c` and start it up again
with `./main.ts`. Now reload the page in your browser. You should see a "Hello
from Preact!" header.

Great job! You've earned yourself a water break. (And maybe a cookie or
something idk.)

## 4. API the business logic

## 5. Pipe the data

## 6. Attach a database

## 7. Authenticate users

## 8. Push to production