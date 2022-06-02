// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  http,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "./test_deps.ts";
import { webSocket } from "../ws.ts";
import type { WSMessageListener } from "../ws.ts";

// Echo: ws://localhost:8080
const echoServer = new http.Server({
  port: 8080,
  handler: (req) => {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onmessage = (ev) => {
      // REVIEW: Sockets need to be closed on the server or async processes will
      // leak for some reason?  
      // The extra quotes are needed because the data is sent as JSON
      if (ev.data === "\"close\"") {
        socket.close();
        return;
      }
      socket.send(ev.data);
    };
    return response;
  },
});
echoServer.listenAndServe();

Deno.test("echo", async () =>  {
  const message = await new Promise((resolve, reject) => {
    let message: unknown = null;
    const socket = webSocket("ws://localhost:8080");
    socket.onopen = () => {
      socket.send({ echo: "foo-bar" });
      socket.send("close");
    };
    socket.onmessage = (msg) => { message = msg };
    socket.onclose = () => resolve(message);
    socket.onerror = (err) => reject(err);
  });
  assertEquals(message, { echo: "foo-bar" });
});

Deno.test("echo with WebSocket as input", async () => {
  const input = new WebSocket("ws://localhost:8080");
  const message = await new Promise((resolve, reject) => {
    let message: unknown = null;
    const socket = webSocket(input);
    socket.onopen = () => {
      socket.send({ echo: "foo-bar" });
      socket.send("close");
    };
    socket.onmessage = (msg) => { message = msg };
    socket.onclose = () => resolve(message);
    socket.onerror = (err) => reject(err);
  });
  assertEquals(message, { echo: "foo-bar" });
});

Deno.test("echo with send type and parser", async () => {
  let message: unknown = null;
  await new Promise((resolve, reject) => {
    // REVIEW: Someday, typescript might be able to do inference on optional
    // type parameters. Until then, we have to either specify no parameters to
    // get inference or specify both parameters explicitly with no inference.
    // Note that when using the `client()` to create a typed socket connection,
    // you won't have to specify either of these parameters; they're carried
    // over from the server schema
    const socket = webSocket<
      { hey: number } | string,
      number
    >("ws://localhost:8080", {
      // REVIEW: Idk if I like how the msg needs to be casted before being used,
      // but I can't think of anything better rn
      message: (msg) => {
        return (msg as Record<string, number>).hey;
      },
    });
    socket.onopen = () => {
      socket.send({ hey: 123 });
      socket.send("close");
    };
    socket.onmessage = (msg) => { message = msg };
    socket.onclose = () => resolve(message);
    socket.onerror = (err) => reject(err);
  });
  assertEquals(message, 123);
});

Deno.test("echo with parser that throws", async () => {
  await assertRejects(() => new Promise((resolve, reject) => {
    const socket = webSocket("ws://localhost:8080", {
      message: (msg) => {
        if (typeof msg !== "number") {
          throw new Error("not a number");
        }
        return msg;
      },
    });

    socket.onopen = () => {
      socket.send({ hey: 123 });
      socket.send("close");
    };
    socket.onmessage = () => {}; // Needed or messages won't get parsed
    socket.onclose = () => resolve(null);
    socket.onerror = (err) => reject(err);
  }), Error, "not a number");
});

Deno.test("echo with complex data and custom serializers", async () => {
  class Custom {}
  const ref = new Custom();
  const fix = {
    a: new Map([[ref, ref]]),
    b: new Date(0),
    c: Symbol.for("testing sockets"),
  };

  const message: typeof fix | null = await new Promise((resolve, reject) => {
    let message: typeof fix | null = null;
    const socket = webSocket("ws://localhost:8080", {
      serializers: {
        custom: {
          check: (v: unknown) => v instanceof Custom,
          serialize: () => null,
          deserialize: () => new Custom(),
        },
      },
    });
    socket.onopen = () => socket.send(fix);
    socket.onmessage = (msg) => {
      message = msg as typeof fix;
      socket.send("close");
    };
    socket.onclose = () => resolve(message);
    socket.onerror = (err) => reject(err);
  });

  assertEquals(message, fix);
  const refs = Array.from(message!.a.entries())[0];
  assertStrictEquals(refs[0], refs[1]);
});

Deno.test("errors inside listeners are logged and suppressed", async () => {
  await new Promise((resolve, reject) => {
    const socket = webSocket("ws://localhost:8080");
    socket.onopen = () => {
      socket.send("close");
      throw new Error("this error is supposed to be logged");
    };
    socket.onclose = () => resolve(null);
    socket.onerror = (err) => reject(err);
  });
});

Deno.test("turning off a specific listener", async () => {
  const result = await new Promise((resolve, reject) => {
    const socket = webSocket("ws://localhost:8080");

    let result: unknown = null;
    const msg1: WSMessageListener = () => { result = 1; }
    const msg2: WSMessageListener = () => { result = 2; }
    socket.on("message", msg1);
    socket.on("message", msg2);

    socket.on("open", () => {
      socket.off("message", msg1);
      socket.send({});
      socket.send("close");
    });
    socket.on("close", () => resolve(result));
    socket.on("error", (err) => reject(err));
  });
  assertEquals(result, 2);
});

Deno.test("turning off all listeners for an event", async () => {
  await new Promise((resolve, reject) => {
    const socket = webSocket("ws://localhost:8080", {
      message: () => { throw new Error("always triggered") },
    });

    // Messages are discarded without parsing if there's no message listener. We
    // need the message parser to trigger the error listeners, so this listener
    // is necessary
    socket.on("message", () => {});

    socket.on("error", () => reject(null));
    socket.on("open", () => {
      socket.off("error");
      socket.on("error", () => resolve(null));
      socket.send({});
      socket.send("close");
    });
  });

  // Because the promise above might be resolved before the socket is closed,
  // async operations might leak and fail the test. This line fixes that problem
  await new Promise(r => setTimeout(r, 0));
});

Deno.test("turning off all listeners for all events", async () => {
  await new Promise((resolve, reject) => {
    const socket = webSocket("ws://localhost:8080");
    socket.on("open", () => {
      socket.off();
      socket.on("close", () => resolve(null));
      socket.send({});
      socket.send("close");
    });
    socket.on("message", () => reject(null));
    socket.on("message", () => reject(null)); // Included on purpose
    socket.on("error", () => reject(null));
    socket.on("close", () => reject(null));
  });
});