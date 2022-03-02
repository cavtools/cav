// Path: <root>/app.tsx
// This module is browser-only

/** @jsxImportSource https://esm.sh/preact */
import { render } from "https://esm.sh/preact";
import { useState, useEffect } from "https://esm.sh/preact/hooks";
import { client } from "../../browser.ts";

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