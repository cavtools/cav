<!--

I don't like this one. I feel like I'm absorbing and spewing marketing tactics.

Not how I want this to go.

-->

# Introduction

```ts
#!/usr/bin/env deno run --allow-net

import { rpc, serve } from "https://deno.land/x/cav/mod.ts";

const hi = rpc({ path: "*" }, () => "hello world!");
serve(hi);
console.log("Say 👋 to Cav at port 8000");
```

Cav is a web framework made for [Deno](https://deno.land), a modern runtime for
TypeScript applications. It helps you create scalable full-stack web
applications that are simple to understand and easy to maintain. It's comparable
to these popular alternatives:

- [NextJS](https://nextjs.org)
- [SvelteKit](https://kit.svelte.dev)
- [Aleph.js](https://alephjs.org)
- [NuxtJS](https://nuxtjs.org)
<!-- TODO: more -->

## Backend

Auto-typed, declarative API development is Cav's cornerstone. It approaches web
development with a backend-first philosophy, and it shares many features and
capabilities with these popular backend frameworks (while adding a few tricks of
its own):

- [oak](https://oakserver.github.io/oak/)
- [Express](https://expressjs.com)
- [Koa](https://koajs.com)
- [Fastify](https://www.fastify.io)
- [hapi](https://hapi.dev/)
<!-- TODO: more -->

There is one recommended "peer dependency" for backend development with Cav:
[Zod](https://github.com/colinhacks/zod). When Cav is combined with Zod,
end-to-end type safety can be achieved effortlessly. End-to-end type safety is a
pattern in TypeScript where types from the server are imported client-side to
ensure API usage stays in-sync with server-side data expectations.

Data validation is a required step for any web application that accepts data
from remote clients. Zod fills this niche with some handy features built-in,
such as the ability to infer data types from crafted schemas. With Zod, instead
of needing to write data types and schemas separately and keeping them in sync
with each other, you only need to write the schema and both the input and output
TypeScript types are automatically inferred. Cav builds upon this ability
substantially, and it takes great inspiration from the Zod-adjacent
[trpc](https://trpc.io) library, which accomplishes a similar goal.

Here's an example backend API for a Tasks (To-Dos) app:

```ts
#!/usr/bin/env deno run --watch --unstable --allow-net --allow-read --allow-write
// Path: <root>/main.ts
// This module is server-only

import { z } from "https://deno.land/x/zod@v3.14.2/mod.ts";
import {
  stack,     // Router composition
  rpc,       // Endpoint composition
  assets,    // Serving static asset files
  HttpError, // Exposing errors
  tsBundler, // Bundling TypeScript assets
  serve,     // Connecting everything to the internet
} from "https://deno.land/x/cav/mod.ts";

export interface Task {
  id: string;
  title: string;
  finished: boolean;
}

// These functions model a database. (Database integration is explored in the
// "Context" section of the server docs)
const tasks = new Map<string, Task>();
function createTask(title: string): Task {
  // ...
}
function readTasks(ids?: string | string[]): Task[] {
  // ...
}
function updateTask(update: Task): Task | null {
  // ...
}
function deleteTask(id: string): Task | null {
  // ...
}

export type TaskStack = typeof taskStack;

const taskStack = stack({
  // (The first route below is the fallback route. Route ordering goes by path
  // depth; deeper paths are tried first, with the fallback always coming last.
  // Key order on the stack is only used when two routes have the same path
  // depth)

  // GET /*: Serve static assets from the <root>/assets folder
  "*": assets({
    cwd: import.meta.url,
    // dir: "assets", // "assets" is the default, like "public" in NextJS
    bundlers: [tsBundler()],
  }),

  // Nesting API routes under "/api" is optional, unlike NextJS. The routes
  // defined below could just as easily be defined up here, at the same nesting
  // level as the fallback route. Nesting is useful for separation-of-concerns,
  // however, so here's how you'd do it:
  "api/*": {
    // POST /api/create: Create a new task
    create: rpc({
      // RPCs that expect a message are automatically POST instead of GET
      message: z.object({
        title: z.string(),
      }),
    }, ({ message }) => {
      return createTask(message.title);
    }),

    // GET /api/read(?id=...&id=...): Read specific tasks, or the full list
    read: rpc({
      query: z.object({
        id: z.union([
          z.string(),
          z.string().array(),
        ]),
      }).optional(),
    }, ({ query }) => {
      return readTasks(query?.id);
    }),

    // POST /api/update?id=...: Update a specific task
    update: rpc({
      query: z.object({
        id: z.string(),
      }),
      message: z.object({
        title: z.string(),
        finished: z.boolean(),
      }),
    }, ({ message, query }) => {
      const updated = updateTask({
        id: query.id,
        ...message,
      });
      if (!updated) {
        throw new HttpError("task not found", {
          status: 404,
          expose: { id: query.id },
        });
      }
      return updated;
    }),

    // POST /api/delete?id=...: Delete a specific task
    delete: rpc({
      query: z.object({
        id: z.string(),
      }),
      message: z.object({
        id: z.string(),
      }),
    }, ({ message, query }) => {
      // The "Are you sure?" of backend APIs
      if (message.id !== query.id) {
        throw new HttpError("query id doesn't match message id", {
          status: 400,
          expose: { queryId: query.id, messageId: message.id },
        });
      }

      const deleted = deleteTask(message.id);
      if (!deleted) {
        throw new HttpError("task not found", {
          status: 404,
          expose: { id: message.id },
        });
      }
      return deleted;
    }),
  },
});

if (import.meta.main) {
  serve(taskStack);
  console.log("Listening on port 8000");
}
```

## Frontend

The ability to bundle and serve frontend TypeScript files is included, thanks to
Deno's [runtime compiler API](https://deno.land/manual@main/typescript/runtime).
This lets you create your frontend and backend side-by-side in the same place,
served by the same framework. Cav can work with several popular frontend
frameworks, for example [Preact](https://preactjs.com). Apps built with Cav and
Preact can be compared to those made with NextJS.

Additionally, Cav includes a browser-compatible `fetch()` wrapper that you can
plug server-side types into. This is where end-to-end TypeScript comes in handy.

Here's a Preact example building on the Tasks API created in the previous
section (CSS and error handling omitted for brevity):

```html
<!-- Path: <root>/assets/index.html -->
<!DOCTYPE html><html lang="en"><head>
  <title>Tasks</title>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/base.css">
  <script type="module" src="/bundle.ts"></script>
</head><body></body></html>
```

```ts
// Path: <root>/assets/bundle.ts
// This module is browser-only

// The module imported below will be bundled along with all of its dependencies,
// and it'll be served with the correct "application/javascript" mime type. Note
// how the app.tsx file isn't located in the assets folder
import "../app.tsx";
```

```tsx
// Path: <root>/app.tsx
// This module is browser-only

/** @jsxImportSource https://esm.sh/preact */
import { render } from "https://esm.sh/preact";
import { useState, useEffect } from "https://esm.sh/preact/hooks";
import { client } from "https://deno.land/x/cav/browser.ts";

// Type imports are removed during bundling. This won't bundle server code
import type { Task, TaskStack } from "./main.ts";

// `api` is automatically typed to match the TaskStack defined in server code
const api = client<TaskStack>().api;

function App() {
  const [tasks, setTasks] = useState([] as Task[]);
  const [loaded, setLoaded] = useState(false);

  const createTask = async () => {
    const task = await api.create({ message: { title: "" } });
    setTasks([ ...tasks, task ]);
  };

  const readTasks = async () => {
    setTasks(await api.read({}));
    setLoaded(true);
  };

  const updateTask = async (update: Task) => {
    const updated = await api.update({
      query: { id: update.id },
      message: update,
    });
    setTasks(tasks.map(t => t.id === update.id ? updated : t));
  };

  const deleteTask = async (id: string) => {
    await api.delete({
      query: { id },
      message: { id },
    });
    setTasks(tasks.filter(t => t.id !== id));
  };

  useEffect(() => { readTasks() }, []);

  return (
    <main style={`display:${loaded ? "block" : "none"}`}>
      <ul>
        {tasks.map(t => (
          <li key={t.id}><label>
            <input
              type="checkbox"
              checked={t.finished}
              onClick={() => updateTask({ ...t, finished: !t.finished })}
            />
            <input
              type="text"
              placeholder="Empty task"
              value={t.title}
              onInput={(e) => {
                updateTask({
                  ...t,
                  title: (e.target as HTMLInputElement).value,
                });
              }}
            />
            <button onClick={() => deleteTask(t.id)}>&times;</button>
          </label></li>
        ))}
      </ul>
      <button onClick={createTask}>Add task</button>
    </main>
  );
}

render(<App />, document.body);
```

The complete Tasks app created here is located in the
[`examples/tasks`](../examples/tasks/) folder.

## Dependencies

Cav doesn't have any third-party dependencies. That is, the only dependencies it
relies on are maintained by the makers of Deno. Here's a complete list:

- [`https://deno.land/std/encoding/base64.ts`]()
- [`https://deno.land/std/http/mod.ts`]()
- [`https://deno.land/std/http/file_server.ts`]()
- [`https://deno.land/std/path/mod.ts`]()
- [`https://deno.land/x/deno_graph/mod.ts`]()

## Status

Cav isn't ready for production. Its first bytes of code were written in
September 2021 and though it's nearly reached viable status, an unknown amount
of work still needs to be done before v1 lands. Because time is needed for Cav
to stabilize its API and ensure its security is up-to-snuff, most
medium-to-large sized organizations would not be willing to adopt something so
new, and that's the right call on their part.

But if you're a solo freelancer designing for yourself or small businesses, you
are Cav's target audience. Your feedback is essential for Cav moving forward,
and you can contribute to the project by voicing your thoughts and opinions on
GitHub, Twitter, or by emailing [hey@cav.bar](mailto:hey@cav.bar). Constructive
feedback and feature requests will be given top-priority, but if you want to
show appreciation, positive feedback is always welcome too. 😊