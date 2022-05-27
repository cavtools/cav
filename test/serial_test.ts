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
} from "../serial.ts";
import type { Serializers } from "../serial.ts";

interface TestDeSerializeOptions {
  serializers?: Serializers;
  input: unknown;
  json: unknown;
  // `json` is forwarded from the `json` property on the opt
  // deno-lint-ignore no-explicit-any
  checkSerialize?: (x: { json: any; serialized: any }) => void;
  // `input` is forwarded from the `input` property on the opt
  // deno-lint-ignore no-explicit-any
  checkDeserialize?: (x: { input: any; deserialized: any }) => void;
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
    serializers: {},
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
      detail: { priv: true },
      expose: { pub: true },
    }),
    json: {
      $httpError: {
        status: 500,
        message: "httpError",
        expose: { pub: true },
      },
    },
    checkDeserialize: x => {
      assertEquals(x.deserialized, new HttpError("httpError", {
        status: 500,
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

  // Not tested in nesting section
  await t.step("local symbol", () => testDeSerialize({
    input: Symbol("local"),
    json: { $symbol: { desc: "local" } },
    checkDeserialize: x => {
      assertEquals(typeof x.deserialized, "symbol");
      assertEquals(x.deserialized.description, "local");
    },
  }));

  // Not tested in nesting section
  await t.step("jsonable instance", () => testDeSerialize({
    input: new (class { toJSON(key: string) { return { key } } }),
    json: { key: "" },
    checkDeserialize: x => {
      assertEquals(x.deserialized, { key: "" });
    },
  }));

  // Not tested in nesting section
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

  const refObj = { hello: "world" };
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
    checkDeserialize: x => {
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(x.deserialized[0], x.deserialized[1]);
    },
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
      assertEquals(x.deserialized, x.input);
      const [a, b] = Array.from(x.deserialized.values());
      assertEquals(a, b[0]);
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
      assertEquals(x.deserialized, x.input);
      const [[k, v]] = Array.from(x.deserialized.entries());
      assertEquals(k, v);
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
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(x.deserialized.expose.a, x.deserialized.expose.b);
    },
  }));

  const refError = new Error("message");
  await t.step("referential equality for errors", () => testDeSerialize({
    input: {
      a: refError,
      b: refError,
    },
    json: {
      a: { $error: "message" },
      b: { $ref: ".a" },
    },
    checkDeserialize: x => {
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(x.deserialized.a, x.deserialized.b);
    },
  }));

  const refDate = new Date(2000, 0, 1);
  await t.step("referential equality for dates", () => testDeSerialize({
    input: {
      a: refDate,
      b: refDate,
    },
    json: {
      a: { $date: refDate.toJSON() },
      b: { $ref: ".a" },
    },
    checkDeserialize: x => {
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(x.deserialized.a, x.deserialized.b);
    },
  }));

  const refRegexp = /^[^abc]/g;
  await t.step("referential equality for regexps", () => testDeSerialize({
    input: {
      a: refRegexp,
      b: refRegexp,
    },
    json: {
      a: { $regexp: "/^[^abc]/g" },
      b: { $ref: ".a" },
    },
    checkDeserialize: x => {
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(x.deserialized.a, x.deserialized.b);
    },
  }));

  const refLocalSym = Symbol("local");
  await t.step("referential equality for local syms", () => testDeSerialize({
    input: {
      a: refLocalSym,
      b: refLocalSym,
    },
    json: {
      a: { $symbol: { desc: "local" } },
      b: { $ref: ".a" },
    },
    checkDeserialize: x => {
      assertStrictEquals(x.deserialized.a, x.deserialized.b);
    },
  }));

  const refGlobalSym = Symbol.for("global");
  await t.step("referential equality for global syms", () => testDeSerialize({
    input: {
      a: refGlobalSym,
      b: refGlobalSym,
    },
    json: {
      a: { $symbol: { for: "global" } },
      b: { $ref: ".a" },
    },
    checkDeserialize: x => {
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(x.deserialized.a, x.deserialized.b);
    },
  }));

  const refObj2 = {};
  const refObj3 = {};
  await t.step("references to paths containing '.'", () => testDeSerialize({
    input: {
      "a..b.": refObj2,
      "c.d": [refObj2, refObj3],
      e: refObj3,
    },
    json: {
      "a..b.": {},
      "c.d": [{ $ref: ".a\\.\\.b\\." }, {}],
      e: { $ref: ".c\\.d.1" },
    },
    checkDeserialize: x => {
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(x.deserialized["a..b."], x.deserialized["c.d"][0]);
      assertStrictEquals(x.deserialized.e, x.deserialized["c.d"][1]);
    },
  }));

  await t.step("references to paths containing '\\'", () => testDeSerialize({
    input: {
      "a\\\\b\\": refObj2,
      "c\\d\\.": [refObj2, refObj3],
      e: refObj3,
    },
    json: {
      "a\\\\b\\": {},
      "c\\d\\.": [{ $ref: ".a\\\\b\\" }, {}],
      e: { $ref: ".c\\d\\\\..1" },
    },
    checkDeserialize: x => {
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(
        x.deserialized["a\\\\b\\"],
        x.deserialized["c\\d\\."][0],
      );
      assertStrictEquals(x.deserialized["c\\d\\."][1], x.deserialized.e);
    },
  }));

  const refCircular = {
    set: new Set(),
    map: new Map(),
    top: null as unknown,
  };
  refCircular.top = refCircular;
  refCircular.set.add(refCircular.set);
  refCircular.map.set(refCircular.map, refCircular.map);
  await t.step("circular references", () => testDeSerialize({
    input: refCircular,
    json: {
      set: { $set: [{ $ref: ".set" }] },
      map: { $map: [[{ $ref: ".map" }, { $ref: ".map" }]] },
      top: { $ref: "" },
    },
    checkDeserialize: x => {
      assertStrictEquals(x.deserialized, x.deserialized.top);
      const setValues = Array.from(x.deserialized.set);
      assertStrictEquals(setValues[0], x.deserialized.set);
      const mapEntries: [unknown, unknown][] = Array.from(
        x.deserialized.map.entries(),
      );
      assertStrictEquals(mapEntries[0][0], mapEntries[0][1]);
      assertStrictEquals(mapEntries[0][0], x.deserialized.map);
    },
  }));

  // Exceptions

  await t.step("throws when prototype poisoned", () => {
    assertThrows(
      () => serialize({ __proto__: { a: true }, b: true }),
      TypeError,
      "No matching serializers for [object Object]",
    );

    assertThrows(
      () => deserialize({ __proto__: { a: true }, b: true }),
      TypeError,
      "Non-plain objects can't be deserialized - Path: \"\"",
    );
  });

  await t.step("throws when deserializing non-plain objects", () => {
    assertThrows(
      () => deserialize({ date: new Date() }),
      TypeError,
      "Non-plain objects can't be deserialized - Path: \".date\"",
    );
  });

  await t.step("throws when non-jsonable instance", () => {
    assertThrows(
      () => serialize(new (class{})),
      TypeError,
      "No matching serializers for [object Object]",
    );
  });

  await t.step("throws when unknown reference", () => {
    assertThrows(
      () => deserialize({ $ref: ".a.b" }),
      Error,
      "Invalid reference \".a.b\" - Path: \"\"",
    );
  });

  await t.step("throws when serializer unknown", () => {
    assertThrows(
      () => deserialize({ $unknown: "hello" }),
      Error,
      "No matching serializer with name \"unknown\" - Path: \"\"",
    );
  });

  await t.step("throws when using reserved serializer name", () => {
    const s = serializer({
      check: () => true,
      serialize: () => null,
      deserialize: () => null,
    });

    assertThrows(
      () => serialize(null, { symbol: s }),
      Error,
      "Conflict: The serializer key \"symbol\" is reserved",
    );
    assertThrows(() => serialize(null, { httpError: s }));
    assertThrows(() => serialize(null, { error: s }));
    assertThrows(() => serialize(null, { date: s }));
    assertThrows(() => serialize(null, { undefined: s }));
    assertThrows(() => serialize(null, { map: s }));
    assertThrows(() => serialize(null, { set: s }));
    assertThrows(() => serialize(null, { bigint: s }));
    assertThrows(() => serialize(null, { regexp: s }));
    assertThrows(() => serialize(null, { number: s }));
    assertThrows(() => serialize(null, { conflict: s }));

    assertThrows(
      () => deserialize(null, { symbol: s }),
      Error,
      "Conflict: The serializer key \"symbol\" is reserved",
    );
    assertThrows(() => deserialize(null, { httpError: s }));
    assertThrows(() => deserialize(null, { error: s }));
    assertThrows(() => deserialize(null, { date: s }));
    assertThrows(() => deserialize(null, { undefined: s }));
    assertThrows(() => deserialize(null, { map: s }));
    assertThrows(() => deserialize(null, { set: s }));
    assertThrows(() => deserialize(null, { bigint: s }));
    assertThrows(() => deserialize(null, { regexp: s }));
    assertThrows(() => deserialize(null, { number: s }));
    assertThrows(() => deserialize(null, { conflict: s }));
  });

  await t.step("throws for bad json when deserializing serialized val", () => {
    assertThrows(() => deserialize({ $symbol: "hello" }));
    assertThrows(() => deserialize({ $httpError: ["foo", 124] }));
    assertThrows(() => deserialize({ $map: [null, [2, 1]] }));
    assertThrows(() => deserialize({ $set: null }));
    assertThrows(() => deserialize({ $bigint: "yo" }));

    // These ones don't throw when the JSON isn't formatted correctly
    assertEquals(
      deserialize({ $error: { msg: "hi" } }),
      new Error("[object Object]"),
    );
    assertEquals(deserialize({ $date: "nooooooo" }), new Date("noooooo"));
    assertEquals(deserialize({ $undefined: null }), undefined);
    assertEquals(deserialize({ $regexp: "not-a-regexp" }), /ot-a-regexp/);
    assertEquals(deserialize({ $number: "hey" }), NaN);
    assertEquals(deserialize({ $conflict: [null, null] }), { null: null });
  });

  // Misc

  await t.step("custom serializers", () => {
    class Custom {
      a: unknown;
      constructor(a: unknown) {
        this.a = a;
      }
    }

    const custom = serializer({
      check: v => v instanceof Custom,
      serialize: (v: Custom) => v.a,
      deserialize: (_, whenDone) => {
        const inst = new Custom(null);
        whenDone(ready => {
          inst.a = ready;
        });
        return inst;
      },
    });

    const inst = new Custom(null);
    inst.a = inst;
    testDeSerialize({
      serializers: { custom, custom2: null },
      input: inst,
      json: {
        $custom: { $ref: "" },
      },
      checkDeserialize: x => {
        assertStrictEquals(x.deserialized.a, x.deserialized);
        assert(x.deserialized instanceof Custom);
      },
    })
  });

  await t.step("two local symbols with the same desc", () => testDeSerialize({
    input: {
      a: Symbol("local"),
      b: Symbol("local"),
    },
    json: {
      a: { $symbol: { desc: "local" } },
      b: { $symbol: { desc: "local" } },
    },
    checkDeserialize: x => {
      assert(typeof x.deserialized.a === "symbol");
      assert(typeof x.deserialized.b === "symbol");
      assert(x.deserialized.a !== x.deserialized.b);
    },
  }));
});