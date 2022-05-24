// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  assert,
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "./deps_test.ts";
import {
  HttpError,
  serialize,
  deserialize,
  serializer,
  serializeBody,
  deserializeBody,
} from "../serial.ts";
import type { Serializers, Serializer } from "../serial.ts";

Deno.test("de/serialize()", async t => {
  // Many of the following tests are modeled after superjson's tests as of March
  // 28, 2022: https://github.com/blitz-js/superjson/blob/main/src/index.test.ts
  const fixtures: Record<string, {
    input: unknown;
    output: unknown;
    custom?: (x: {
      // deno-lint-ignore no-explicit-any
      input: any; output: any; serialized: any; deserialized: any;
    }) => void;
    serializers?: Serializers | null;
  }> = {
    "class with toJSON method": {
      input: {
        a: new (class {
          constructor(){}
          toJSON(key: string) {
            return { key };
          }
        }),
      },
      output: {
        a: { key: "a" },
      },
      custom: x => {
        assertEquals(x.serialized, x.output);
        assertEquals(x.deserialized, x.output);
      },
    },
    "conflict": {
      input: {
        $conflict: "hello",
      },
      output: {
        $conflict: ["$conflict", "hello"],
      },
    },
    "HttpError": {
      input: {
        a: new HttpError("400 bad request", {
          status: 400,
          detail: { hello: "world" },
          expose: { goodbye: "world" },
        }),
        b: new HttpError("500 internal server error"),
      },
      output: {
        a: {
          $httpError: {
            status: 400,
            message: "400 bad request",
            expose: { goodbye: "world" },
          },
        },
        b: {
          $httpError: {
            status: 500,
            message: "500 internal server error",
            expose: null,
          },
        },
      },
      custom: x => {
        assertEquals(x.serialized, x.output);
        assert(x.deserialized.a instanceof HttpError);
        assert(x.deserialized.b instanceof HttpError);
        assertEquals(
          { ...x.deserialized.a, stack: null },
          { ...x.input.a, stack: null, detail: {} },
        );
        assertEquals(
          { ...x.deserialized.b, stack: null },
          { ...x.input.b, stack: null, detail: {} },
        );
      },
    },
    "objects": {
      input: {
        a: { 1: 5, 2: { 3: 'c' } },
        b: null,
      },
      output: {
        a: { 1: 5, 2: { 3: 'c' } },
        b: null,
      },
      // This block is for covering the case where one of the serializers is
      // null, i.e. ignored / turned off
      serializers: {
        null: null,
      },
    },
    "special case: objects with array-like keys": {
      input: {
        a: { 0: 3, 1: 5, 2: { 3: "c" } },
        b: null,
      },
      output: {
        a: { 0: 3, 1: 5, 2: { 3: "c" } },
        b: null,
      },
      // This line is for covering the case where the serializers obj is null
      serializers: null,
    },
    "arrays": {
      input: {
        a: [1, undefined, 2],
      },
      output: {
        a: [1, { $undefined: null }, 2],
      },
    },
    "Sets": {
      input: {
        a: new Set([1, undefined, 2]),
      },
      output: {
        a: { $set: [1, { $undefined: null }, 2] },
      },
    },
    "top-level Sets": {
      input: new Set([1, undefined, 2]),
      output: { $set: [1, { $undefined: null }, 2] },
    },
    "Maps": {
      input: {
        a: new Map([[1, "a"], [NaN, "b"]]),
        b: new Map([["2", "b"]]),
        d: new Map([[true, "true key"]]),
      },
      output: {
        a: { $map: [[1, "a"], [{ $number: "nan" }, "b"]] },
        b: { $map: [["2", "b"]] },
        d: { $map: [[true, "true key"]] },
      },
    },
    "preserves object identity": {
      input: () => {
        const a = { id: "a" };
        const b = { id: "b" };
        return {
          options: [a, b],
          selected: a,
        };
      },
      output: {
        options: [{ id: "a" }, { id: "b" }],
        selected: { $ref: ".options.0" },
      },
      custom: (x) => {
        assertEquals(x.serialized, x.output);
        assertEquals(x.deserialized, x.input);
        assertStrictEquals(x.deserialized.options[0], x.deserialized.selected);
      },
    },
    "paths containing dots": {
      input: {
        "a.1": {
          b: new Set([1, 2]),
        },
      },
      output: {
        "a.1": {
          b: { $set: [1, 2] },
        },
      },
    },
    "paths containing backslashes": {
      input: () => {
        const set = new Set([1, 2]);
        return {
          "a\\.1": set,
          ref: set,
        };
      },
      output: {
        "a\\.1": { $set: [1, 2] },
        ref: { $ref: ".a\\\\.1" },
      },
      custom: (x) => {
        assertEquals(x.serialized, x.output);
        assertEquals(x.deserialized, x.input);
        assertStrictEquals(x.deserialized["a\\.1"], x.deserialized.ref);
      },
    },
    "dates": {
      input: {
        meeting: {
          date: new Date(2022, 2, 28),
        },
      },
      output: {
        meeting: {
          date: { $date: new Date(2022, 2, 28).toISOString() },
        },
      },
    },
    "errors": {
      input: {
        e: new Error("epic fail"),
      },
      output: {
        e: { $error: "epic fail" },
      },
    },
    "regex": {
      input: {
        a: /hello/g,
      },
      output: {
        a: { $regexp: "/hello/g" },
      },
    },
    "Infinity": {
      input: {
        a: Number.POSITIVE_INFINITY,
      },
      output: {
        a: { $number: "+infinity" },
      },
    },
    "-Infinity": {
      input: {
        a: Number.NEGATIVE_INFINITY,
      },
      output: {
        a: { $number: "-infinity" },
      },
    },
    "-zero": {
      input: {
        a: -0,
      },
      output: {
        a: { $number: "-zero" },
      },
    },
    "NaN": {
      input: {
        a: NaN,
      },
      output: {
        a: { $number: "nan" },
      },
    },
    "bigint": {
      input: {
        a: BigInt("4206942069420694206942069"),
      },
      output: {
        a: { $bigint: "4206942069420694206942069" },
      },
    },
    "unknown": {
      input: () => {
        type WarCriminal = {
          name: string;
          age: unknown;
        };
        const person: WarCriminal = {
          name: "Vladimir Putin",
          age: "hell is forever",
        };
        return person;
      },
      output: {
        name: "Vladimir Putin",
        age: "hell is forever",
      },
    },
    "self-referencing objects": {
      input: () => {
        const a = { role: "parent", children: [] as unknown[] };
        const b = { role: "child", parents: [a] };
        a.children.push(b);
        return a;
      },
      output: {
        role: "parent",
        children: [{
          role: "child",
          parents: [{ $ref: "" }],
        }],
      },
      custom: (x) => {
        assertEquals(x.serialized, x.output);
        assertEquals({
          role: x.deserialized.role,
          children: [{
            role: x.deserialized.children[0].role,
          }],
        }, {
          role: "parent",
          children: [{
            role: "child",
          }],
        });
        assertStrictEquals(x.deserialized, x.deserialized.children[0].parents[0]);
      },
    },
    "Maps with two keys that serialize to the same string but have a different reference": {
      input: new Map([
        [/a/g, "cav"],
        [/a/g, "bar"],
      ]),
      output: {
        $map: [
          [{ $regexp: "/a/g" }, "cav"],
          [{ $regexp: "/a/g" }, "bar"],
        ],
      },
    },
    "Maps with a key that's referentially equal to another field": {
      input: () => {
        const robbyBubble = { id: 5 };
        const highscores = new Map([
          [robbyBubble, 5000],
        ]);
        return {
          highscores,
          topScorer: robbyBubble,
        };
      },
      output: {
        highscores: {
          $map: [[{ id: 5 }, 5000]],
        },
        topScorer: { $ref: ".highscores.$map.0.0" },
      },
    },
    "referentially equal maps": {
      input: () => {
        const map = new Map([[1, 1]]);
        return { a: map, b: map };
      },
      output: {
        a: { $map: [[1, 1]] },
        b: { $ref: ".a" },
      },
      custom: (x) => {
        assertEquals(x.serialized, x.output);
        assertEquals(x.deserialized, x.input);
        assertStrictEquals(x.deserialized.a, x.deserialized.b);
      },
    },
    "maps with non-uniform keys": {
      input: {
        map: new Map<string | number, number>([[1, 1], ["1", 1]]),
      },
      output: {
        map: { $map: [[1, 1], ["1", 1]] },
      },
    },
    "referentially equal values inside a set": {
      input: () => {
        const user = { id: 2 };
        return {
          users: new Set([user]),
          userOfTheMonth: user,
        };
      },
      output: {
        users: { $set: [{ id: 2 }] },
        userOfTheMonth: { $ref: ".users.$set.0" },
      },
      custom: (x) => {
        assertEquals(x.serialized, x.output);
        assertEquals(x.deserialized, x.input);
        const vals = Array.from(x.deserialized.users);
        assertStrictEquals(x.deserialized.userOfTheMonth, vals[0]);
      },
    },
    "symbols": {
      // I'm testing something different this time. Symbols don't have a lot of
      // use in pack.ts when compared with superjson. I might adopt their symbol
      // registry idea in the future but I don't have a use-case in mind right
      // now so I'm just going to leave it on the table and do referential
      // equality only
      input: () => {
        const sym = Symbol("description");
        return { a: sym, b: sym };
      },
      output: {
        a: { $symbol: "description" },
        b: { $ref: ".a" },
      },
      custom: (x) => {
        assertEquals(x.serialized, x.output);
        assertEquals(Object.keys(x.deserialized), ["a", "b"]);
        assertEquals(typeof x.deserialized.a, "symbol");
        assertEquals(x.deserialized.a.description, "description");
        assertStrictEquals(x.deserialized.a, x.deserialized.b);
      },
    },
    "custom transformers": {
      input: {
        testLocal: { testLocal: true },
      },
      output: {
        testLocal: { $testLocal: null },
      },
      serializers: {
        testLocal: serializer({
          check: (v: { testLocal?: boolean }) => v.testLocal === true,
          serialize: () => null,
          deserialize: () => ({ testLocal: true }),
        }),
      },
    },
    // Skipping "Decimal.js" (N/A)
    "issue #58": {
      input: () => {
        const cool = Symbol("cool");
        return {
          q: [
            9,
            {
              henlo: undefined,
              yee: new Date(2022, 2, 28),
              yee2: new Date(2022, 2, 28),
              foo1: new Date(2022, 2, 28),
              z: cool,
            },
          ],
        };
      },
      output: {
        q: [9, {
          henlo: { $undefined: null },
          yee: { $date: new Date(2022, 2, 28).toISOString() },
          yee2: { $date: new Date(2022, 2, 28).toISOString() },
          foo1: { $date: new Date(2022, 2, 28).toISOString() },
          z: { $symbol: "cool" },
        }],
      },
      custom: (x) => {
        assertEquals(x.serialized, x.output);
        assertEquals(Object.keys(x.deserialized), ["q"]);
        assertEquals(x.deserialized.q.length, 2);
        assertEquals(x.deserialized.q[0], 9);
        assertEquals(Object.keys(x.deserialized.q[1]), [
          "henlo",
          "yee",
          "yee2",
          "foo1",
          "z",
        ])

        const io = x.input.q[1];
        const uo = x.deserialized.q[1];
        assertEquals({ ...io, z: null }, { ...uo, z: null });
        assertEquals(typeof uo.z, "symbol");
        assertEquals(io.z.description, uo.z.description);
      },
    },
    // Skipping "works with custom allowedProps" (N/A)
    // TODO: "works with typed arrays": {
    "undefined, issue #48": {
      input: undefined,
      output: { $undefined: null },
    },
    // Skipping "regression #109: nested classes" (I'm lazy)
  };

  for (const [k, v] of Object.entries(fixtures)) {
    await t.step(k, () => {
      const i = typeof v.input === "function" ? v.input() : v.input;

      const serialized = serialize(i, v.serializers);
      const deserialized = deserialize(v.output, v.serializers);

      if (v.custom) {
        v.custom({
          input: i,
          output: v.output,
          serialized: serialized,
          deserialized: deserialized,
        });
      } else {
        assertEquals(serialized, v.output);
        assertEquals(deserialized, i);
      }
    });
  }
});
Deno.test("de/serialize(): bad inputs", () => {
    assertThrows(() => {
      serialize(new (class { constructor(){} }));
    });

    assertThrows(() => {
      deserialize({ __proto__: { hi: "hello" } });
    });

    assertThrows(() => {
      deserialize({ $ref: ".hello" });
    });

    assertThrows(() => {
      deserialize({ $huh: "what?" });
    });
});
Deno.test("de/serialize(): reserved serializer names", async t => {
  const reserved = [
    "httpError", "error", "date",
    "undefined", "symbol", "map",
    "set", "bigint", "regexp",
    "number", "conflict", "ref", // Note that ref isn't a serializer
  ];

  for (const name of reserved) {
    await t.step(name, () => {
      assertThrows(() => {
        serialize(null, { [name]: {} as Serializer });
      });
      assertThrows(() => {
        deserialize(null, { [name]: {} as Serializer });
      });
    });
  }
});

function testSerializeBody(desc: string, opt: {
  input: unknown;
  serializers?: Serializers;
  body?: unknown;
  type?: unknown;
}) {
  Deno.test(`serializeBody(): ${desc}`, () => {
    const sb = serializeBody(opt.input, opt.serializers);
    if (opt.body) {
      assertEquals(sb.body, opt.body);
    }
    if (opt.type) {
      assertEquals(sb.type, opt.type);
    }
  });
}

testSerializeBody("ArrayBuffer", {
  input: new ArrayBuffer(10),
  body: new ArrayBuffer(10),
  type: "application/octet-stream",
});

testSerializeBody("ArrayBufferView", {
  input: new Uint8Array([1, 2, 3]),
  body: new Uint8Array([1, 2, 3]),
  type: "application/octet-stream",
});

testSerializeBody("ReadableStream")