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
  packRequest,
  unpackRequest,
  // packResponse,
  // unpackResponse,
} from "../serial.ts";
import type { Serializers } from "../serial.ts";

function testDeSerialize(opt: {
  serializers?: Serializers;
  input: unknown;
  // deno-lint-ignore no-explicit-any
  check?: (x: { input: any; deserialized: any }) => void;
}) {
  const input = typeof opt.input === "function" ? opt.input() : opt.input;
  const serialized = serialize(input, opt.serializers);
  const deserialized = deserialize(serialized, opt.serializers);
  
  // This will throw if the output from serialize() isn't JSON-compatible
  JSON.stringify(serialized);

  // check() can override the default assertion
  if (opt.check) {
    opt.check({ input, deserialized });
  } else {
    assertEquals(deserialized, input);
  }
}

Deno.test("de/serialize()", async t => {
  // Primitives

  await t.step("boolean", () => testDeSerialize({
    input: true,
  }));

  await t.step("null", () => testDeSerialize({
    input: null
  }));

  await t.step("string", () => testDeSerialize({
    input: "hello",
  }));

  await t.step("number", () => testDeSerialize({
    input: 1234,
  }));

  await t.step("object", () => testDeSerialize({
    serializers: {}, // added for coverage
    input: {
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
  }));

  // Non-primitives

  await t.step("undefined", () => testDeSerialize({
    input: undefined,
  }));

  await t.step("nan", () => testDeSerialize({
    input: NaN,
  }));

  await t.step("date", () => testDeSerialize({
    input: new Date(1994, 11, 6),
  }));

  await t.step("regexp", () => testDeSerialize({
    input: /hello[world]/g,
  }));

  await t.step("+infinity", () => testDeSerialize({
    input: Number.POSITIVE_INFINITY,
  }));

  await t.step("-infinity", () => testDeSerialize({
    input: Number.NEGATIVE_INFINITY,
  }));

  await t.step("-zero", () => testDeSerialize({
    input: -0,
    check: x => {
      // Only way to check for -0
      assert(Object.is(x.deserialized, -0));
    },
  }));

  await t.step("bigint", () => testDeSerialize({
    input: BigInt("584837272849585737282992848575732929"),
  }));


  await t.step("set", () => testDeSerialize({
    input: new Set<unknown>(["foo", null, 123]),
  }));

  await t.step("map", () => testDeSerialize({
    input: new Map<unknown, unknown>([["foo", "bar"], [123, null]]),
  }));

  await t.step("conflict", () => testDeSerialize({
    input: { $hi: { world: "foobar" } },
  }));

  await t.step("global symbol", () => testDeSerialize({
    input: Symbol.for("global"),
  }));

  await t.step("array buffer view", () => testDeSerialize({
    input: new Int32Array([0,1,2,3,4,5]),
  }));

  await t.step("array buffer", () => testDeSerialize({
    input: new Uint8Array([0,1,2,3,4,5]).buffer,
  }));

  // Not tested in nesting section
  await t.step("local symbol", () => testDeSerialize({
    input: Symbol("local"),
    check: x => {
      assert(typeof x.deserialized === "symbol");
      assertEquals(x.deserialized.description, "local");
      assert(x.deserialized !== Symbol.for("local"));
    },
  }));

  // Not tested in nesting section
  await t.step("jsonable instance", () => testDeSerialize({
    input: new (class { toJSON(key: string) { return { key } } }),
    check: x => {
      assertEquals(x.deserialized, { key: "" });
    },
  }));

  await t.step("error", () => testDeSerialize({
    input: new Error("error"),
  }));

  await t.step("http error", () => testDeSerialize({
    input: new HttpError("httpError", {
      detail: { priv: true },
      expose: { pub: true },
    }),
    check: x => {
      assertEquals(x.deserialized, new HttpError("httpError", {
        status: 500,
        // detail is never serialized
        expose: { pub: true },
      }));
    }
  }));

  // Not tested in nesting section
  await t.step("error subclass", () => testDeSerialize({
    input: new SyntaxError("syntaxError"),
  }));

  // Nesting non-primitives

  // A lot of this is overkill, I know. But now I would have to put effort into
  // shortening it, which would also be overkill...

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
      o: new Int32Array([1,2,3]),
      p: new Uint8Array([1,2,3]).buffer,
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
      new Int32Array([1,2,3]),
      new Uint8Array([1,2,3]).buffer
    ],
  }));

  await t.step("set with non-primitives nested", () => testDeSerialize({
    input: new Set<unknown>([
      undefined,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0, // NOTE: -0 is converted to +0 as a value in a Set
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
      new Int32Array([1,2,3]),
      new Uint8Array([1,2,3]).buffer
    ]),
  }));

  await t.step("map with non-primitives nested", () => testDeSerialize({
    input: new Map<unknown, unknown>([
      // I'm not testing references here, so I switched global to global2 in
      // this first entry. Besides that, the values are just the keys in reverse
      // order
      [undefined, Symbol.for("global2")],
      [Number.POSITIVE_INFINITY, { $foo: "bar" }],
      [Number.NEGATIVE_INFINITY, new Map<unknown, unknown>([["hello", 0], [null, null]])],
      // NOTE: The -0 is converted to +0 as a key in a Map
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
      // Added later, not redoing the order
      [new Int32Array([1,2,3]), new Int32Array([4,5,6])],
      [new Uint8Array([1,2,3]).buffer, new Uint8Array([1,2,3]).buffer],
    ]),
  }));

  await t.step("http error with non-primitives nested", () => testDeSerialize({
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
        o: new Int16Array([1,2,3]),
        p: new Uint8Array([1,2,3]).buffer
      },
    }),
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
        o: new Float64Array([1,2,3]),
        p: new Uint8Array([1,2,3]).buffer
      },
    },
  }));

  // References

  const refObj = { hello: "world" };
  await t.step("referential equality for objects", () => testDeSerialize({
    input: {
      a: refObj,
      b: refObj,
    },
    check: x => {
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(x.deserialized.b, x.deserialized.a);
    },
  }));

  const refArr = [null, 123];
  await t.step("referential equality for arrays", () => testDeSerialize({
    input: [refArr, refArr],
    check: x => {
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
    check: x => {
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
    check: x => {
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
    check: x => {
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
    check: x => {
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
    check: x => {
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
    check: x => {
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
    check: x => {
      assertStrictEquals(x.deserialized.a, x.deserialized.b);
    },
  }));

  const refGlobalSym = Symbol.for("global");
  await t.step("referential equality for global syms", () => testDeSerialize({
    input: {
      a: refGlobalSym,
      b: refGlobalSym,
    },
    check: x => {
      assertEquals(x.deserialized, x.input);
      assertStrictEquals(x.deserialized.a, x.deserialized.b);
    },
  }));

  const refBuffer = new Float32Array([1,2,3]);
  await t.step(
    "referential equality for array buffer views",
    () => testDeSerialize({
      input: {
        a: refBuffer,
        b: refBuffer,
      },
      check: x => {
        assertEquals(x.deserialized, x.input);
        assertStrictEquals(x.deserialized.a, x.deserialized.b);
      },
    }),
  );

  const refBuffer2 = new Uint8Array([1,2,3]).buffer;
  await t.step(
    "referential equality for array buffers",
    () => testDeSerialize({
      input: {
        a: refBuffer2,
        b: refBuffer2,
      },
      check: x => {
        assertEquals(x.deserialized, x.input);
        assertStrictEquals(x.deserialized.a, x.deserialized.b);
      },
    }),
  );

  const refObj2 = {};
  const refObj3 = {};
  await t.step("references to paths containing '.'", () => testDeSerialize({
    input: {
      "a..b.": refObj2,
      "c.d": [refObj2, refObj3],
      e: refObj3,
    },
    check: x => {
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
    check: x => {
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
    check: x => {
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

  // Misc

  await t.step("throws when prototype poisoned", () => {
    assertThrows(() => serialize({ __proto__: { a: true }, b: true }));
    assertThrows(() => deserialize({ __proto__: { a: true }, b: true }));
  });

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
      check: x => {
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
    check: x => {
      assert(typeof x.deserialized.a === "symbol");
      assert(typeof x.deserialized.b === "symbol");
      assert(x.deserialized.a !== x.deserialized.b);
    },
  }));
});

interface TestUnPackRequestOptions {
  serializers?: Serializers;
  message?: unknown;
  headers?: HeadersInit;
}

async function testUnPackRequest(opt: TestUnPackRequestOptions & {
  check?: (x: {
    opt: TestUnPackRequestOptions,
    // deno-lint-ignore no-explicit-any
    message: any;
  }) => Promise<void> | void;
}) {
  const { check, ...options } = opt;
  const packed = packRequest("http://localhost/test", opt);
  const message = await unpackRequest(packed, opt.serializers);
  if (check) {
    await check({ opt: options, message });
  } else {
    assertEquals(message, opt.message);
  }
}

async function assertEqualsBlob(a: File | Blob, b: File | Blob) {
  assertEquals({
    name: a instanceof File ? a.name : "blob",
    type: a.type,
    body: await a.text(),
  }, {
    name: b instanceof File ? b.name : "blob",
    type: b.type,
    body: await b.text(),
  });
}

Deno.test("un/packRequest()", async t => {
  // Symmetric

  await t.step("message: string", () => testUnPackRequest({
    message: "foo-bar",
  }));

  await t.step("message: object", () => testUnPackRequest({
    message: {
      a: new Set(["baz"]),
      b: Symbol.for("poop"),
    },
  }));

  await t.step("message: File", () => testUnPackRequest({
    message: new File(["blah"], "eh.txt", { type: "text/plain" }),
    check: x => assertEqualsBlob(x.message, x.opt.message as File),
  }));

  await t.step("message: Blob", () => testUnPackRequest({
    message: new Blob(
      ["you look lovely today, btw"],
      { type: "text/plain" },
    ),
    check: x => assertEqualsBlob(x.message, x.opt.message as Blob),
  }));

  await t.step(
    "message: File with quotes in filename (testing content-disposition)",
    () => testUnPackRequest({
      message: new File(
        [
          "jk i can't see you",
          "now back to our regularly scheduled programming",
        ],
        "\"shows-over\".txt",
        { type: "text/plain" },
      ),
      check: x => assertEqualsBlob(x.message, x.opt.message as File),
    }),
  );

  await t.step("message: object w/Files", () => testUnPackRequest({
    message: new Map([[
      new File(["hello"], "dumb.csv", { type: "text/csv" }),
      new File(["world"], "dumber.csv", { type: "text/csv" }),
    ]]),
    check: async x => {
      const [[a, b]] = Array.from(x.message.entries());
      const [[oa, ob]] = Array.from(
        (x.opt.message as Map<File, File>).entries()
      );
      await assertEqualsBlob(a, oa);
      await assertEqualsBlob(b, ob);
    },
  }));

  await t.step("message: object w/Blobs", () => testUnPackRequest({
    message: new Map([[
      new Blob(["hello"], { type: "text/csv" }),
      new Blob(["world"], { type: "text/csv" }),
    ]]),
    check: async x => {
      const [[a, b]] = Array.from(x.message.entries());
      const [[oa, ob]] = Array.from(
        (x.opt.message as Map<File, File>).entries()
      );
      await assertEqualsBlob(a, oa);
      await assertEqualsBlob(b, ob);
    },
  }));

  const refFile = new File(["red cards for everybody"], "soccer.txt", {
    type: "text/plain",
  });
  await t.step(
    "message: object w/ multiple ref. equal Files",
    () => testUnPackRequest({
      message: {
        a: refFile,
        b: refFile,
      },
      check: async x => {
        await assertEqualsBlob(
          x.message.a,
          (x.opt.message as Record<string, File>).a,
        );
        assertStrictEquals(x.message.a, x.message.b);
      },
    }),
  );

  // Asymmetric

  await t.step("message: ArrayBufferView", () => testUnPackRequest({
    message: new Uint8Array([1,2,3]),
    check: x => assertEqualsBlob(
      x.message,
      new Blob([new Uint8Array([1,2,3])], { type: "application/octet-stream" }),
    ),
  }));

  await t.step(
    "message: ArrayBufferView w/content-type",
    () => testUnPackRequest({
      message: new Uint8Array([1,2,3]),
      headers: { "content-type": "none-of-your/business" },
      check: x => assertEqualsBlob(
        x.message,
        new Blob([new Uint8Array([1,2,3])], {
          type: "none-of-your/business",
        }),
      ),
    }),
  );

  // TODO: Something's wrong with ReadableStreams, I couldn't figure it out so
  // I'm just moving on for now. Don't use ReadableStreams as messages yet

  // await t.step("message: ReadableStream", () => testUnPackRequest({
  //   message: new ReadableStream({
  //     start(controller) {
  //       controller.enqueue("foo-bar");
  //       controller.close();
  //     }
  //   }),
  //   headers: { "content-length": "7" },
  //   check: x => assertEqualsBlob(x.message, new Blob(["foo-bar"])),
  // }));
  // await t.step(
  //   "message: ReadableStream w/content-type",
  //   () => testUnPackRequest({
      
  //   }),
  // );

  await t.step("message: URLSearchParams", () => testUnPackRequest({
    message: new URLSearchParams({ hello: "world" }),
    check: x => assertEquals(x.message, { hello: "world" }),
  }));

  const form = new FormData();
  form.set("hello", "world");
  form.append("foo", "bar");
  form.append("foo", "baz");
  await t.step("message: FormData", () => testUnPackRequest({
    message: form,
    check: x => assertEquals(x.message, {
      hello: "world",
      foo: ["bar", "baz"],
    }),
  }));

  // Misc

  class Custom {}
  await t.step("custom serializers", () => testUnPackRequest({
    message: new Custom(),
    serializers: {
      custom: serializer({
        check: v => v instanceof Custom,
        serialize: () => null,
        deserialize: () => new Custom,
      }),
    },
  }));
});