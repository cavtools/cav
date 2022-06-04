// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  http,
  assertEquals,
  assertStrictEquals,
} from "./test_deps.ts";
import { webSocket } from "../ws.ts";
import type { WSMessageListener } from "../ws.ts";

const echoServer = new http.Server({
  port: 8080,
  handler: (req) => {
    const { socket, response } = Deno.upgradeWebSocket(req);
    // I need the URL to be sent back in one of the tests for client_test.ts
    if (req.url.indexOf("send-back-url=true") !== -1) {
      socket.onopen = () => {
        // This is the raw socket, no serialization is done. Wrap the url in
        // quotes so it gets deserialized as a string
        socket.send('"' + req.url + '"');
      };
    }
    socket.onmessage = (ev) => {
      // Sockets need to be closed from the server or async processes will leak.
      // The socket will be closed when a "close" string is sent as a message;
      // that message isn't echoed. The extra quotes are needed because the data
      // is sent as JSON
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
  const message = await new Promise((resolve) => {
    let message: unknown = null;
    const socket = webSocket("ws://localhost:8080", {
      message: (msg) => {
        if (typeof msg !== "number") {
          throw new Error("not a number");
        }
        return msg;
      },
    });

    socket.onopen = () => {
      socket.send({ echo: "foo-bar" });
      socket.send("close");
    };
    socket.onmessage = (msg) => { message = msg };
    socket.onclose = () => resolve(message);
    socket.onerror = (err) => { message = err };
  });
  assertEquals(message, new Error("not a number"));
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
    const msg1: WSMessageListener = () => { result = 1 };
    const msg2: WSMessageListener = () => { result = 2 };
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

Deno.test("turning off all listeners for one event", async () => {
  const message = await new Promise((resolve, reject) => {
    const socket = webSocket("ws://localhost:8080");
    let m: unknown = null;
    socket.on("close", () => reject(null));
    socket.on("close", () => reject(null)); // Included on purpose
    socket.on("message", (msg) => { m = msg });
    socket.on("open", () => {
      socket.off("close");
      socket.on("close", () => resolve(m));
      socket.send({});
      socket.send("close");
    });
  });
  assertEquals(message, {});
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