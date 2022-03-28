import { assertEquals, assertStrictEquals } from "./deps_test.ts";
import { pack, unpack, usePackers, packer, Packers } from "./pack.ts";
const { test } = Deno;

// The following tests are modeled after superjson's tests as of March 28, 2022:
// https://github.com/blitz-js/superjson/blob/main/src/index.test.ts
test("[pack/superjson_20220328]: pack() and unpack()", async (t) => {
  const data: Record<string, {
    input: unknown;
    output: unknown;
    custom?: (x: {
      // deno-lint-ignore no-explicit-any
      input: any; output: any; packed: any; unpacked: any;
    }) => void;
    localPackers?: Packers;
    globalPackers?: Packers;
  }> = {
    "works for objects": {
      input: {
        a: { 1: 5, 2: { 3: 'c' } },
        b: null,
      },
      output: {
        a: { 1: 5, 2: { 3: 'c' } },
        b: null,
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
    },
    "works for arrays": {
      input: {
        a: [1, undefined, 2],
      },
      output: {
        a: [1, { $undefined: null }, 2],
      },
    },
    "works for Sets": {
      input: {
        a: new Set([1, undefined, 2]),
      },
      output: {
        a: { $set: [1, { $undefined: null }, 2] },
      },
    },
    "works for top-level Sets": {
      input: new Set([1, undefined, 2]),
      output: { $set: [1, { $undefined: null }, 2] },
    },
    "works for Maps": {
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
        assertEquals(x.packed, x.output);
        assertEquals(x.unpacked, x.input);
        assertStrictEquals(x.unpacked.options[0], x.unpacked.selected);
      },
    },
    "works for paths containing dots": {
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
    "works for paths containing backslashes": {
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
        assertEquals(x.packed, x.output);
        assertEquals(x.unpacked, x.input);
        assertStrictEquals(x.unpacked["a\\.1"], x.unpacked.ref);
      },
    },
    "works for dates": {
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
    "works for errors": {
      input: {
        e: new Error("epic fail"),
      },
      output: {
        e: { $error: "epic fail" },
      },
    },
    "works for regex": {
      input: {
        a: /hello/g,
      },
      output: {
        a: { $regexp: "/hello/g" },
      },
    },
    "works for Infinity": {
      input: {
        a: Number.POSITIVE_INFINITY,
      },
      output: {
        a: { $number: "+infinity" },
      },
    },
    "works for -Infinity": {
      input: {
        a: Number.NEGATIVE_INFINITY,
      },
      output: {
        a: { $number: "-infinity" },
      },
    },
    "works for NaN": {
      input: {
        a: NaN,
      },
      output: {
        a: { $number: "nan" },
      },
    },
    "works for bigint": {
      input: {
        a: BigInt("4206942069420694206942069"),
      },
      output: {
        a: { $bigint: "4206942069420694206942069" },
      },
    },
    "works for unknown": {
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
    "works for self-referencing objects": {
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
        assertEquals(x.packed, x.output);
        assertEquals({
          role: x.unpacked.role,
          children: [{
            role: x.unpacked.children[0].role,
          }],
        }, {
          role: "parent",
          children: [{
            role: "child",
          }],
        });
        assertStrictEquals(x.unpacked, x.unpacked.children[0].parents[0]);
      },
    },
    "works for Maps with two keys that serialize to the same string but have a different reference": {
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
    "works for Maps with a key that's referentially equal to another field": {
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
    "works for referentially equal maps": {
      input: () => {
        const map = new Map([[1, 1]]);
        return { a: map, b: map };
      },
      output: {
        a: { $map: [[1, 1]] },
        b: { $ref: ".a" },
      },
      custom: (x) => {
        assertEquals(x.packed, x.output);
        assertEquals(x.unpacked, x.input);
        assertStrictEquals(x.unpacked.a, x.unpacked.b);
      },
    },
    "works for maps with non-uniform keys": {
      input: {
        map: new Map<string | number, number>([[1, 1], ["1", 1]]),
      },
      output: {
        map: { $map: [[1, 1], ["1", 1]] },
      },
    },
    "works for referentially equal values inside a set": {
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
        assertEquals(x.packed, x.output);
        assertEquals(x.unpacked, x.input);
        const vals = Array.from(x.unpacked.users);
        assertStrictEquals(x.unpacked.userOfTheMonth, vals[0]);
      },
    },
    "works for symbols": {
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
        assertEquals(x.packed, x.output);
        assertEquals(Object.keys(x.unpacked), ["a", "b"]);
        assertEquals(typeof x.unpacked.a, "symbol");
        assertEquals(x.unpacked.a.description, "description");
        assertStrictEquals(x.unpacked.a, x.unpacked.b);
      },
    },
    "works for custom transformers": {
      input: {
        testLocal: { testLocal: true },
        testGlobal: { testGlobal: true },
      },
      output: {
        testLocal: { $testLocal: null },
        testGlobal: { $testGlobal: null },
      },
      localPackers: {
        testLocal: packer({
          check: (v: { testLocal?: boolean }) => v.testLocal === true,
          pack: () => null,
          unpack: () => ({ testLocal: true }),
        }),
      },
      globalPackers: {
        testGlobal: packer({
          check: (v: { testGlobal?: boolean }) => v.testGlobal === true,
          pack: () => null,
          unpack: () => ({ testGlobal: true }),
        }),
      },
    },
    // Skipping "works for Decimal.js" (N/A)
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
        assertEquals(x.packed, x.output);
        assertEquals(Object.keys(x.unpacked), ["q"]);
        assertEquals(x.unpacked.q.length, 2);
        assertEquals(x.unpacked.q[0], 9);
        assertEquals(Object.keys(x.unpacked.q[1]), [
          "henlo",
          "yee",
          "yee2",
          "foo1",
          "z",
        ])

        const io = x.input.q[1];
        const uo = x.unpacked.q[1];
        assertEquals({ ...io, z: null }, { ...uo, z: null });
        assertEquals(typeof uo.z, "symbol");
        assertEquals(io.z.description, uo.z.description);
      },
    },
    // Skipping "works with custom allowedProps" (N/A)
    // TODO: "works with typed arrays": {
    "works for undefined, issue #48": {
      input: undefined,
      output: { $undefined: null },
    },
    // Skipping "regression #109: nested classes" (I'm lazy)
  };

  for (const [k, v] of Object.entries(data)) {
    await t.step(k, async (t) => {
      const i = typeof v.input === "function" ? v.input() : v.input;
      
      if (v.globalPackers) {
        usePackers(v.globalPackers);
      }

      let packed: unknown;
      let unpacked: unknown;
      await t.step(`pack()`, () => {
        packed = pack(i, v.localPackers);
      });
      await t.step(`unpack()`, () => {
        unpacked = unpack(v.output, v.localPackers);
      });

      if (v.custom) {
        await t.step(`custom asserts`, () => v.custom!({
          input: i,
          output: v.output,
          packed,
          unpacked,
        }));
      } else {
        await t.step(`standard asserts`, () => {
          assertEquals(packed, v.output);
          assertEquals(unpacked, i);
        });
      }
    });
  }
});
// test("[pack/superjson_20220328]: when serializing custom class instances", () => {

// });