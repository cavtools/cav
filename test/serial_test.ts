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

function testDeSerialize(opt: {
  input: unknown;
  json: unknown;
  // `json` is forwarded from the `json` property on the opt
  // deno-lint-ignore no-explicit-any
  checkSerialize?: false | ((x: { json: any; serialized: any }) => void);
  // `input` is forwarded from the `input` property on the opt
  // deno-lint-ignore no-explicit-any
  checkDeserialize?: false | ((x: { input: any; deserialized: any }) => void);
  serializers?: Serializers;
}) {
  const i = typeof opt.input === "function" ? opt.input() : opt.input;
  const serialized = serialize(i, opt.serializers);
  const deserialized = deserialize(opt.json, opt.serializers);

  if (opt.checkSerialize) {
    opt.checkSerialize({ serialized, json: c.json });
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
    input: { object: true },
    json: { object: true },
  }));

  await t.step("array", () => testDeSerialize({
    input: ["array", true],
    json: ["array", true],
  }));

  // Non-primitives

  await t.step("undefined", () => testDeSerialize({
    input: undefined,
    json: { $undefined: true },
  }));

  const localSym = Symbol("local");
  await t.step("local symbol", () => testDeSerialize({
    input: localSym,
    json: { $symbol: { desc: "local" } },
    checkDeserialize: x => {
      assertEquals(typeof x.deserialized, "symbol");
      assertEquals(x.deserialized.description, "local");
    },
  }));

  const globalSym = Symbol.for("global");
  await t.step("global symbol", () => testDeSerialize({
    input: globalSym,
    json: { $symbol: { for: "global" } },
  }));

  const jsonableInst = new (class {
    constructor(){}
    toJSON(key: string) { return { key } }
  });
  await t.step("jsonable instance", () => testDeSerialize({
    input: jsonableInst,
    json: { key: "" },
    checkDeserialize: x => {
      assertEquals(x.deserialized, { key: "" });
    },
  }));

  const posInf = Number.POSITIVE_INFINITY;
  await t.step("+infinity", () => testDeSerialize({
    input: posInf,
    json: { $number: "+infinity" },
    
  }));

  const negInf = Number.NEGATIVE_INFINITY;
  await t.step("-infinity", () => testDeSerialize({

  }));

  const negZero = -0;
  await t.step("-zero", () => testDeSerialize({

  }));

  const regex = /hello[world]/g;
  await t.step("regexp", () => testDeSerialize({

  }));

  await t.step("nan", () => testDeSerialize({

  }));

  const httpError = new HttpError("httpError", {
    status: 400,
    detail: { priv: true },
    expose: { pub: true },
  });
  await t.step("http error", () => testDeSerialize({

  }));

  const error = new Error("error");
  await t.step("error", () => testDeSerialize({

  }));

  const syntaxError = new SyntaxError("syntax");
  await t.step("error subclass", () => testDeSerialize({

  }));

  const bigint = BigInt("584837272849585737282992848575732929");
  await t.step("bigint", () => testDeSerialize({

  }));

  const date = new Date(1994, 11, 6);
  await t.step("date", () => testDeSerialize({

  }));

  const map = new Map<unknown, unknown>([["foo", "bar"], [123, null]]);
  await t.step("map", () => testDeSerialize({

  }));

  const set = new Set<unknown>(["foo", null, 123]);
  await t.step("set", () => testDeSerialize({

  }));

  const conflict = { $hi: { world: "foobar" } };
  await t.step("conflict", () => testDeSerialize({

  }));

  // Nesting

  const everything = {
    a: true,
    b: null,
    c: "hello",
    d: 1234,
    e: { object: true },
    f: ["array", true],
    // TODO: Non-primitives, excluding local symbols
  };

  await t.step("object with everything nested", () => testDeSerialize({
    input: everything,
    json: everything,
  }));

  await t.step("array with everything nested", () => testDeSerialize({
    input: Object.values(everything),
    json: Object.values(everything),
  }));

  await t.step("set with everything nested", () => testDeSerialize({

  }));

  await t.step("map with everything nested", () => testDeSerialize({

  }));

  await t.step("httpError with everything nested", () => testDeSerialize({

  }));

  await t.step("conflict with everything nested", () => testDeSerialize({

  }));

  await t.step("(divergent) nested local symbols", () => testDeSerialize({

  }));

  // References

  await t.step("referential equality for objects", () => testDeSerialize({

  }));

  await t.step("referential equality for arrays", () => testDeSerialize({

  }))

  await t.step("referential equality for sets", () => testDeSerialize({

  }));

  await t.step("referential equality for maps", () => testDeSerialize({

  }));

  await t.step("referential equality for httpErrors", () => testDeSerialize({

  }));

  await t.step("referential equality for errors", () => testDeSerialize({

  }));

  await t.step("referential equality for dates", () => testDeSerialize({
    
  }));

  await t.step("referential equality for regexps", () => testDeSerialize({
    
  }));

  await t.step("references with paths containing periods", () => testDeSerialize({

  }));

  await t.step("references with paths containing backslashes", () => testDeSerialize({

  }));

  await t.step("circular references", () => testDeSerialize({
    // TODO: a reference to top level parent as well as non-top level parent
  }));

  // Bad inputs

  await t.step("throws when prototype poisoned", () => testDeSerialize({

  }));

  await t.step("throws when non-jsonable instance", () => testDeSerialize({

  }));

  await t.step("throws when unknown reference", () => testDeSerialize({

  }));

  await t.step("throws when serializer unknown", () => testDeSerialize({

  }));

  await t.step("throws when using reserved serializer name", () => {

  });

  // Misc

  await t.step("custom serializers", () => testDeSerialize({

  }));

  await t.step("object with array-like keys", () => testDeSerialize({

  }));
});