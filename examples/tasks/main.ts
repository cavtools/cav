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
} from "../../mod.ts";

export interface Task {
  id: string;
  title: string;
  finished: boolean;
}

// These functions model a database. (Database integration is explored in the
// "Context" section of the server docs)
const tasks = new Map<string, Task>();
function createTask(title: string): Task {
  const id = crypto.randomUUID();
  const task = { id, title, finished: false };
  tasks.set(id, task);
  return task;
}
function readTasks(ids?: string | string[]): Task[] {
  if (!ids) {
    return Array.from(tasks.values());
  }
  const res: Task[] = [];
  const loop = typeof ids === "string" ? [ids] : ids;
  for (const id of loop) {
    const task = tasks.get(id);
    if (task) {
      res.push(task);
    }
  }
  return res;
}
function updateTask(update: Task): Task | null {
  const task = tasks.get(update.id);
  if (!task) {
    return null;
  }
  Object.assign(task, update);
  return task;
}
function deleteTask(id: string): Task | null {
  const task = tasks.get(id);
  if (!task) {
    return null;
  }
  tasks.delete(id);
  return task;
}

export type TaskStack = typeof taskStack;

const taskStack = stack({
  // (The first route below is the fallback route. Route ordering goes by path
  // depth, with the fallback coming last. Key order on the stack is only used
  // when two routes have the same path depth)

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