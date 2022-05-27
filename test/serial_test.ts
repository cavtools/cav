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

interface TestDeSerializeOptions {
  input: unknown;
  json: unknown;
  // `json` is forwarded from the `json` property on the opt
  // deno-lint-ignore no-explicit-any
  checkSerialize?: false | ((x: { json: any; serialized: any }) => void);
  // `input` is forwarded from the `input` property on the opt
  // deno-lint-ignore no-explicit-any
  checkDeserialize?: false | ((x: { input: any; deserialized: any }) => void);
  serializers?: Serializers;
}

function testDeSerialize(opt: TestDeSerializeOptions) {
  const i = typeof opt.input === "function" ? opt.input() : opt.input;
  const serialized = serialize(i, opt.serializers);
  const deserialized = deserialize(opt.json, opt.serializers);

  if (opt.checkSerialize) {
    opt.checkSerialize({ serialized, json: opt.json });
  } else if (opt.checkSerialize !== false) {
    assertEquals(serialized, opt.json);
  }

  if (opt.checkDeserialize) {
    opt.checkDeserialize({ deserialized, input: opt.input });
  } else if (opt.checkDeserialize !== false) {
    assertEquals(deserialized, opt.input);
  }
}

Deno.test("de/serialize()", async t => {
  // Primitives

  await t.step("boolean", () => testDeSerialize({
    input: true,
    json: true,
  }));

  await t.step("null", () => testDeSerialize({
    input: null,
    json: null,
  }));
  
  await t.step("string", () => testDeSerialize({
    input: "hello",
    json: "hello",
  }));

  await t.step("number", () => testDeSerialize({
    input: 1234,
    json: 1234,
  }));

  await t.step("object", () => testDeSerialize({
    input: {
      boolean: true,
      null: null,
      string: "hello",
      number: 1234,
      object: { hello: "world" },
      array: [1234, "foobar"],
    },
    json: {
      boolean: true,
      null: null,
      string: "hello",
      number: 1234,
      object: { hello: "world" },
      array: [1234, "foobar"],
    },
  }));

  await t.step("array", () => testDeSerialize({
    input: [true, null, "hello", 1234, { hello: "world" }, [1234, "foobar"]],
    json: [true, null, "hello", 1234, { hello: "world" }, [1234, "foobar"]],
  }));

  // Non-primitives

  await t.step("undefined", () => testDeSerialize({
    input: undefined,
    json: { $undefined: true },
  }));

  await t.step("+infinity", () => testDeSerialize({
    input: Number.POSITIVE_INFINITY,
    json: { $number: "+infinity" },
  }));

  await t.step("-infinity", () => testDeSerialize({
    input: Number.NEGATIVE_INFINITY,
    json: { $number: "-infinity" },
  }));

  await t.step("-zero", () => testDeSerialize({
    input: -0,
    json: { $number: "-zero" },
  }));

  await t.step("nan", () => testDeSerialize({
    input: NaN,
    json: { $number: "nan" },
  }));

  await t.step("regexp", () => testDeSerialize({
    input: /hello[world]/g,
    json: { $regexp: "/hello[world]/g" },
  }));

  await t.step("httpError", () => testDeSerialize({
    input: new HttpError("httpError", {
      status: 400,
      detail: { priv: true },
      expose: { pub: true },
    }),
    json: {
      $httpError: {
        status: 400,
        message: "httpError",
        expose: { pub: true },
      },
    },
    checkDeserialize: x => {
      assertEquals(x.deserialized, new HttpError("httpError", {
        status: 400,
        expose: { pub: true },
      }));
    },
  }));

  await t.step("error", () => testDeSerialize({
    input: new Error("error"),
    json: { $error: "error" },
  }));

  await t.step("bigint", () => testDeSerialize({
    input: BigInt("584837272849585737282992848575732929"),
    json: { $bigint: "584837272849585737282992848575732929" },
  }));

  await t.step("date", () => testDeSerialize({
    input: new Date(1994, 11, 6),
    json: { $date: "1994-12-06T05:00:00.000Z" },
  }));

  await t.step("set", () => testDeSerialize({
    input: new Set<unknown>(["foo", null, 123]),
    json: { $set: ["foo", null, 123] },
  }));

  await t.step("map", () => testDeSerialize({
    input: new Map<unknown, unknown>([["foo", "bar"], [123, null]]),
    json: { $map: [["foo", "bar"], [123, null]] },
  }));

  await t.step("conflict", () => testDeSerialize({
    input: { $hi: { world: "foobar" } },
    json: { $conflict: ["$hi", { world: "foobar" }] }
  }));

  await t.step("global symbol", () => testDeSerialize({
    input: Symbol.for("global"),
    json: { $symbol: { for: "global" } },
  }));

  // Not tested for nesting
  await t.step("local symbol", () => testDeSerialize({
    input: Symbol("local"),
    json: { $symbol: { desc: "local" } },
    checkDeserialize: x => {
      assertEquals(typeof x.deserialized, "symbol");
      assertEquals(x.deserialized.description, "local");
    },
  }));

  // Not tested for nesting
  await t.step("jsonable instance", () => testDeSerialize({
    input: new (class { toJSON(key: string) { return { key } } }),
    json: { key: "" },
    checkDeserialize: x => {
      assertEquals(x.deserialized, { key: "" });
    },
  }));

  // Not tested for nesting
  await t.step("error subclass", () => testDeSerialize({
    input: new SyntaxError("syntaxError"),
    json: { $error: "syntaxError" },
    checkDeserialize: x => {
      assertEquals(x.deserialized, new Error("syntaxError"));
    },
  }));

  // Nesting non-primitives

  await t.step("object with non-primitives nested", () => testDeSerialize({
    input: {
      a: undefined,
      b: Number.POSITIVE_INFINITY,
      c: Number.NEGATIVE_INFINITY,
      d: -0,
      e: NaN,
      f: /foobar/g,
      g: new HttpError("idk", { status: 418 }),
      h: new Error("idk2"),
      i: BigInt("5757892927657389191874757"),
      j: new Date(2022, 4, 26),
      k: new Set<unknown>([null, "hello", 123]),
      l: new Map<unknown, unknown>([["hello", 0], [null, null]]),
      m: { $foo: "bar" },
      n: Symbol.for("global"),
    },
    json: {
      a: { $undefined: true },
      b: { $number: "+infinity" },
      c: { $number: "-infinity" },
      d: { $number: "-zero" },
      e: { $number: "nan" },
      f: { $regexp: "/foobar/g" },
      g: { $httpError: { status: 418, message: "idk", expose: null } },
      h: { $error: "idk2" },
      i: { $bigint: "5757892927657389191874757" },
      j: { $date: "2022-05-26T04:00:00.000Z" },
      k: { $set: [null, "hello", 123] },
      l: { $map: [["hello", 0], [null, null]] },
      m: { $conflict: ["$foo", "bar"] },
      n: { $symbol: { for: "global" } },
    },
  }));

  await t.step("array with non-primitives nested", () => testDeSerialize({
    input: [
      undefined,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      NaN,
      /foobar/g,
      new HttpError("idk", { status: 418 }),
      new Error("idk2"),
      BigInt("5757892927657389191874757"),
      new Date(2022, 4, 26),
      new Set<unknown>([null, "hello", 123]),
      new Map<unknown, unknown>([["hello", 0], [null, null]]),
      { $foo: "bar" },
      Symbol.for("global"),
    ],
    json: [
      { $undefined: true },
      { $number: "+infinity" },
      { $number: "-infinity" },
      { $number: "-zero" },
      { $number: "nan" },
      { $regexp: "/foobar/g" },
      { $httpError: { status: 418, message: "idk", expose: null } },
      { $error: "idk2" },
      { $bigint: "5757892927657389191874757" },
      { $date: "2022-05-26T04:00:00.000Z" },
      { $set: [null, "hello", 123] },
      { $map: [["hello", 0], [null, null]] },
      { $conflict: ["$foo", "bar"] },
      { $symbol: { for: "global" } },
    ],
  }));

  await t.step("set with non-primitives nested", () => testDeSerialize({
    input: new Set<unknown>([
      undefined,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      NaN,
      /foobar/g,
      new HttpError("idk", { status: 418 }),
      new Error("idk2"),
      BigInt("5757892927657389191874757"),
      new Date(2022, 4, 26),
      new Set<unknown>([null, "hello", 123]),
      new Map<unknown, unknown>([["hello", 0], [null, null]]),
      { $foo: "bar" },
      Symbol.for("global"),
    ]),
    json: {
      $set: [
        { $undefined: true },
        { $number: "+infinity" },
        { $number: "-infinity" },
        // NOTE: -0 loses its sign when added to a Set
        0,
        { $number: "nan" },
        { $regexp: "/foobar/g" },
        { $httpError: { status: 418, message: "idk", expose: null } },
        { $error: "idk2" },
        { $bigint: "5757892927657389191874757" },
        { $date: "2022-05-26T04:00:00.000Z" },
        { $set: [null, "hello", 123] },
        { $map: [["hello", 0], [null, null]] },
        { $conflict: ["$foo", "bar"] },
        { $symbol: { for: "global" } },
      ],
    },
  }));

  await t.step("map with non-primitives nested", () => testDeSerialize({
    input: new Map<unknown, unknown>([
      [undefined, Symbol.for("global2")],
      [Number.POSITIVE_INFINITY, { $foo: "bar" }],
      [Number.NEGATIVE_INFINITY, new Map<unknown, unknown>([["hello", 0], [null, null]])],
      [-0, new Set<unknown>([null, "hello", 123])],
      [NaN, new Date(2022, 4, 26)],
      [/foobar/g, BigInt("5757892927657389191874757")],
      [new HttpError("idk", { status: 418 }), new Error("idk2")],
      [new Error("idk2"), new HttpError("idk", { status: 418 })],
      [BigInt("5757892927657389191874757"), /foobar/g],
      [new Date(2022, 4, 26), NaN],
      [new Set<unknown>([null, "hello", 123]), -0],
      [new Map<unknown, unknown>([["hello", 0], [null, null]]), Number.NEGATIVE_INFINITY],
      [{ $foo: "bar" }, Number.POSITIVE_INFINITY],
      [Symbol.for("global"), undefined],
    ]),
    json: {
      $map: [
        [{ $undefined: true }, { $symbol: { for: "global2" } }],
        [{ $number: "+infinity" }, { $conflict: ["$foo", "bar"] }],
        [{ $number: "-infinity" }, { $map: [["hello", 0], [null, null]] }],
        // NOTE: -0 loses its sign when used as a key on a Map
        [0, { $set: [null, "hello", 123] }],
        [{ $number: "nan" }, { $date: "2022-05-26T04:00:00.000Z" }],
        [{ $regexp: "/foobar/g" }, { $bigint: "5757892927657389191874757" }],
        [{ $httpError: { status: 418, message: "idk", expose: null } }, { $error: "idk2" }],
        [{ $error: "idk2" }, { $httpError: { status: 418, message: "idk", expose: null } }],
        [{ $bigint: "5757892927657389191874757" }, { $regexp: "/foobar/g" }],
        [{ $date: "2022-05-26T04:00:00.000Z" }, { $number: "nan" }],
        [{ $set: [null, "hello", 123] }, { $number: "-zero" }],
        [{ $map: [["hello", 0], [null, null]] }, { $number: "-infinity" }],
        [{ $conflict: ["$foo", "bar"] }, { $number: "+infinity" }],
        [{ $symbol: { for: "global" } }, { $undefined: true }],
      ],
    },
  }));

  await t.step("httpError with non-primitives nested", () => testDeSerialize({
    input: new HttpError("message", {
      status: 200,
      expose: {
        a: undefined,
        b: Number.POSITIVE_INFINITY,
        c: Number.NEGATIVE_INFINITY,
        d: -0,
        e: NaN,
        f: /foobar/g,
        g: new HttpError("idk", { status: 418 }),
        h: new Error("idk2"),
        i: BigInt("5757892927657389191874757"),
        j: new Date(2022, 4, 26),
        k: new Set<unknown>([null, "hello", 123]),
        l: new Map<unknown, unknown>([["hello", 0], [null, null]]),
        m: { $foo: "bar" },
        n: Symbol.for("global"),
      },
    }),
    json: {
      $httpError: {
        status: 200,
        message: "message",
        expose: {
          a: { $undefined: true },
          b: { $number: "+infinity" },
          c: { $number: "-infinity" },
          d: { $number: "-zero" },
          e: { $number: "nan" },
          f: { $regexp: "/foobar/g" },
          g: { $httpError: { status: 418, message: "idk", expose: null } },
          h: { $error: "idk2" },
          i: { $bigint: "5757892927657389191874757" },
          j: { $date: "2022-05-26T04:00:00.000Z" },
          k: { $set: [null, "hello", 123] },
          l: { $map: [["hello", 0], [null, null]] },
          m: { $conflict: ["$foo", "bar"] },
          n: { $symbol: { for: "global" } },
        },
      },
    },
  }));

  await t.step("conflict with non-primitives nested", () => testDeSerialize({
    input: {
      $conflict: {
        a: undefined,
        b: Number.POSITIVE_INFINITY,
        c: Number.NEGATIVE_INFINITY,
        d: -0,
        e: NaN,
        f: /foobar/g,
        g: new HttpError("idk", { status: 418 }),
        h: new Error("idk2"),
        i: BigInt("5757892927657389191874757"),
        j: new Date(2022, 4, 26),
        k: new Set<unknown>([null, "hello", 123]),
        l: new Map<unknown, unknown>([["hello", 0], [null, null]]),
        m: { $foo: "bar" },
        n: Symbol.for("global"),
      },
    },
    json: {
      $conflict: ["$conflict", {
        a: { $undefined: true },
        b: { $number: "+infinity" },
        c: { $number: "-infinity" },
        d: { $number: "-zero" },
        e: { $number: "nan" },
        f: { $regexp: "/foobar/g" },
        g: { $httpError: { status: 418, message: "idk", expose: null } },
        h: { $error: "idk2" },
        i: { $bigint: "5757892927657389191874757" },
        j: { $date: "2022-05-26T04:00:00.000Z" },
        k: { $set: [null, "hello", 123] },
        l: { $map: [["hello", 0], [null, null]] },
        m: { $conflict: ["$foo", "bar"] },
        n: { $symbol: { for: "global" } },
      }],
    },
  }));

  // References

  const refObj = { hello: "world" }
  await t.step("referential equality for objects", () => testDeSerialize({
    input: {
      a: refObj,
      b: refObj,
    },
    json: {
      a: refObj,
      b: { $ref: ".a" },
    },
    checkDeserialize: x => {
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(x.deserialized.b, x.deserialized.a);
    },
  }));

  const refArr = [null, 123];
  await t.step("referential equality for arrays", () => testDeSerialize({
    input: [refArr, refArr],
    json: [refArr, { $ref: ".0" }],
  }));

  const refSet = new Set<unknown>([123, "hello", {}]);
  await t.step("referential equality for sets", () => testDeSerialize({
    input: new Set<unknown>([
      refSet,
      [refSet],
    ]),
    json: {
      $set: [
        { $set: [123, "hello", {}] },
        [{ $ref: ".$set.0" }],
      ],
    },
    checkDeserialize: x => {
      // TODO
    },
  }));

  const refMap = new Map<unknown, unknown>([["foo", null]]);
  await t.step("referential equality for maps", () => testDeSerialize({
    input: new Map<unknown, unknown>([
      [refMap, refMap],
    ]),
    json: {
      $map: [
        [{ $map: [["foo", null]] }, { $ref: ".$map.0.0" }],
      ],
    },
    checkDeserialize: x => {
      // TODO
    },
  }));

  const refHttpError = new HttpError("message", {
    status: 418,
    expose: true,
  });
  await t.step("referential equality for httpErrors", () => testDeSerialize({
    input: new HttpError("message2", {
      status: 500,
      expose: {
        a: refHttpError,
        b: refHttpError,
      },
    }),
    json: {
      $httpError: {
        status: 500,
        message: "message2",
        expose: {
          a: { $httpError: { status: 418, message: "message", expose: true } },
          b: { $ref: ".$httpError.expose.a" },
        },
      },
    },
    checkDeserialize: x => {
      // TODO
    },
  }));

  // await t.step("referential equality for errors", () => testDeSerialize({

  // }));

  // await t.step("referential equality for dates", () => testDeSerialize({
    
  // }));

  // await t.step("referential equality for regexps", () => testDeSerialize({
    
  // }));

  // await t.step("referential equality for local symbols", () => testDeSerialize({
    
  // }));

  // await t.step("referential equality for global symbols", () => testDeSerialize({

  // }));

  // await t.step("references to serialized nested values", () => testDeSerialize({

  // }));

  // await t.step("references to paths containing '.'", () => testDeSerialize({

  // }));

  // await t.step("references to paths containing '\\'", () => testDeSerialize({

  // }));

  // await t.step("circular references", () => testDeSerialize({
  //   // TODO: a reference to top level parent as well as non-top level parent
  // }));

  // Bad inputs

  // await t.step("throws when prototype poisoned", () => testDeSerialize({

  // }));

  // await t.step("throws when non-jsonable instance", () => testDeSerialize({

  // }));

  // await t.step("throws when unknown reference", () => testDeSerialize({

  // }));

  // await t.step("throws when serializer unknown", () => testDeSerialize({

  // }));

  // await t.step("throws when using reserved serializer name", () => {

  // });

  // Misc

  // await t.step("custom serializers", () => testDeSerialize({

  // }));

  // await t.step("object with array-like keys", () => testDeSerialize({

  // }));

  // await t.step("two local symbols with the same description", () => testDeSerialize({

  // }));

  // await t.step("Incorrectly typed json when deserializing <non-primitive>")
});