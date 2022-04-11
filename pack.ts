// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

// Self-contained module for un/packing arbitrary values for sending over the
// wire (via HTTP). pack.ts is inspired by superjson and the other libraries
// that inspired it. (See their "Prior art", the bullets at the end of their
// readme.) https://github.com/blitz-js/superjson

// Also shout-out to json-dry, they had a really good solution to the circular
// reference problem. I didn't use or read their code (my answer may be
// wrong/incomplete), but I did snag the whenDone idea from them.
// https://github.com/11ways/json-dry

// There may be something fundamentally broken about this module, but if there
// is, I haven't found it yet. If you find something that seems amiss, please
// let me know so that I can learn: https://github.com/connorlogin/cav/issues

// TODO: Support for ArrayBuffer/View

/**
 * A group of functions used to recognize, pack, and unpack objects and special
 * values that are not strings, basic numbers, booleans, or nulls into objects
 * that are JSON compatible.
 */
export interface Packer<I = unknown, O = unknown> {
  /**
   * Function for checking if the packer applies to a given value. JSON
   * primitives like basic numbers, strings, booleans, and nulls skip all
   * packers and are returned as-is. i.e. `check: (v) => typeof v === "string"`
   * would always return false.
   */
  check(value: unknown): boolean;
  /**
   * Transforms the value into its output on the resulting json-compatible
   * object. The value returned by this function will be re-packed; the output
   * does not need to be JSON-compatible. 
   */
  pack(value: I): O;
  /**
   * Unpacks packed values into their original shape and structure. Initially,
   * the value is only constructed from the raw packed JSON. Values that are
   * more complex and need things like referential equality or non-POJO/Array
   * objects will need to use the `whenDone` registration function to access the
   * equivalent of the value returned from `pack()` when the value was
   * serialized. (See the docs for the WhenDone type for more details.)
   */
  unpack(raw: unknown, whenDone: WhenDone<O>): I;
}

/**
 * A Packer's `unpack()` function receives the raw packed JSON value as its
 * first argument and this registration function as the second. Functions
 * registered with WhenDone will be run last-in-first-out (stack order) when the
 * raw JSON has been processed into the final object instance. WhenDone
 * functions are needed whenever the packed data is more complex than simple
 * JSON values, for example when referential equality needs to be maintained or
 * when the pack function returns anything that needs to be re-packed by some
 * other packer. Referenced objects may not be fully initialized when the
 * registered function is called, but its instance will be instantiated so that
 * references can be fixed.
 */
export type WhenDone<O> = (fn: (packed: O) => void) => void;

/**
 * Constructs a Packer. This simply returns the first argument, it's only used
 * for type annotations.
 */
export function packer<I = unknown, O = unknown>(
  init: Packer<I, O>,
): Packer<I, O> {
  return init;
}

/**
 * Type alias representing a Packer with any input or output type. Useful for
 * type constraints.
 */
// deno-lint-ignore no-explicit-any
export type AnyPacker = Packer<any, any>;

/**
 * A Record of Packers. Packer keys are used to tag packed values on the output
 * JSON, which is required in order to correctly unpack the value on the other
 * side.
 */
export type Packers = Record<string, AnyPacker | null>;

const usedPackers: Map<string, AnyPacker> = new Map(Object.entries({
  error: packer({
    check: (v) => v instanceof Error,
    pack: (v: Error) => v.message,
    unpack: (raw) => new Error(raw as string),
  }),
  date: packer({
    check: (v) => v instanceof Date,
    pack: (v: Date) => v.toJSON(),
    unpack: (raw) => new Date(raw as string),
  }),
  undefined: packer({
    check: (v) => typeof v === "undefined",
    pack: () => null,
    unpack: () => undefined,
  }),
  symbol: packer({
    check: (v) => typeof v === "symbol",
    pack: (v: symbol) => v.description,
    unpack: (raw) => Symbol(raw as string),
  }),
  map: packer({
    check: (v) => v instanceof Map,
    pack: (v: Map<unknown, unknown>) => Array.from(v.entries()),
    unpack: (_, whenDone) => {
      const map = new Map();
      whenDone((packed) => {
        packed.forEach(v => map.set(v[0], v[1]));
      });
      return map;
    },
  }),
  set: packer({
    check: (val) => val instanceof Set,
    pack: (v: Set<unknown>) => Array.from(v.values()),
    unpack: (_, whenDone) => {
      const set = new Set();
      whenDone((packed) => {
        packed.forEach(v => set.add(v));
      });
      return set;
    },
  }),
  bigint: packer({
    check: (v) => typeof v === "bigint",
    pack: (v: bigint) => v.toString(),
    unpack: (raw) => BigInt(raw as string),
  }),
  regexp: packer({
    check: (v) => v instanceof RegExp,
    pack: (v: RegExp) => v.toString(),
    unpack: (raw) => {
      const r = (raw as string).slice(1).split("/");
      return new RegExp(r[0], r[1]);
    },
  }),
  number: packer({
    check: (v) => typeof v === "number" && (
      isNaN(v) ||
      v === Number.POSITIVE_INFINITY ||
      v === Number.NEGATIVE_INFINITY ||
      Object.is(v, -0)
    ),
    pack: (v: number) => (
      isNaN(v) ? "nan"
      : v === Number.POSITIVE_INFINITY ? "+infinity"
      : v === Number.NEGATIVE_INFINITY ? "-infinity"
      : Object.is(v, -0) ? "-0"
      : 0 // Should never happen
    ),
    unpack: (raw: string) => (
      raw === "nan" ? NaN
      : raw === "+infinity" ? Number.POSITIVE_INFINITY
      : raw === "-infinity" ? Number.NEGATIVE_INFINITY
      : raw === "-zero" ? -0
      : 0
    ),
  }),
  conflict: packer({
    check: (v) => {
      if (!isPojo(v)) {
        return false;
      }
      const keys = Object.keys(v);
      return keys.length === 1 && keys[0].startsWith("$");
    },
    pack: Object.entries,
    unpack: (_, whenDone) => {
      const result: Record<string, unknown> = {};
      whenDone((parsed) => {
        result[parsed[0][0]] = parsed[0][1];
      });
      return result;
    },
  }),
}));

/**
 * Registers the Packers to be used as defaults in addition to the library
 * defaults for the top-level packing functions. Falsy properties are skipped.
 * If any packer keys conflict with the packers that are already in use, an
 * error is thrown. Returns the input `packers` argument.
 */
export function usePackers<P extends Packers>(packers: P): P {
  for (const [name, packer] of Object.entries(packers)) {
    if (!packer) {
      continue;
    }

    if (name === "ref" || usedPackers.has(name)) {
      throw new Error(
        `Conflict: Packer name "${name}" is already used`,
      );
    }
    usedPackers.set(name, packer);
  }
  return packers;
}

function packerMap(packers?: Packers): Map<string, AnyPacker> {
  if (!packers) {
    return usedPackers;
  }

  const pm = new Map();
  for (const [k, v] of Object.entries(packers)) {
    if (v === null) {
      continue;
    }
    if (k === "ref" || usedPackers.has(k)) {
      throw new Error(
        `Conflict: Packer name "${k}" is already used`,
      );
    }
    pm.set(k, v);
  }
  if (!pm.size) {
    return usedPackers;
  }
  for (const [k, v] of usedPackers.entries()) {
    pm.set(k, v);
  }
  return pm;
}

/**
 * Packs a value recursively until it's JSON-compatible. Packers can be plugged
 * in to extend the accepted types beyond what Cav supports by default as well
 * as the packers registered with `usePackers()`. Referential equality will be
 * preserved whenever the same object or symbol value is encountered more than
 * once. If a value isn't recognized by any of the used packers or the default
 * packers, an error is thrown.
 */
export function pack(value: unknown, packers?: Packers): unknown {
  const pm = packerMap(packers);
  const paths = new Map<unknown, string[]>();

  const pathString = (p: string[]) => (
    p.map(v => v.replace(/\./g, "\\.")).join(".")
  );
  
  const recur = (
    val: unknown,
    path: string[],
  ): unknown => {
    if (val && (typeof val === "object" || typeof val === "symbol")) {
      if (paths.has(val)) {
        return { $ref: pathString(paths.get(val)!) };
      }
      paths.set(val, path);
    }

    if (
      val === null ||
      typeof val === "string" ||
      typeof val === "boolean" ||
      (typeof val === "number" && !Object.is(val, -0) && Number.isFinite(val))
    ) {
      return val;
    }

    for (const [name, packer] of pm.entries()) {
      if (packer.check(val)) {
        const key = `$${name}`;
        return { [key]: recur(packer.pack(val), [...path, key]) };
      }
    }

    if (isPojo(val)) {
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) {
        copy[k] = recur(v, [...path, k]);
      }
      return copy;
    }

    if (Array.isArray(val)) {
      const copy: unknown[] = [];
      for (let k = 0; k < val.length; k++) {
        copy[k] = recur(val[k], [...path, k.toString()]);
      }
      return copy;
    }

    if (
      typeof val === "object" &&
      "toJSON" in val &&
      typeof (val as { toJSON: unknown })["toJSON"] === "function"
    ) {
      return (val as { toJSON: (key: string) => unknown }).toJSON(
        path[path.length - 1],
      );
    }

    throw new TypeError(
      `No matching packers for ${val}`,
    );
  };

  return recur(value, [""]);
}

/**
 * Unpacks a value packed with `pack()` into the original value. Referential
 * equality will be restored on the output object. An error will be thrown if a
 * value was packed with an unknown/unused packer.
 */
export function unpack<T = unknown>(value: unknown, packers?: Packers): T {
  const pm = packerMap(packers);
  const objects = new Map<string, unknown>();
  const whenDones: (() => void)[] = [];

  const recur = (val: unknown, path: string) => {
    if (!val || typeof val !== "object") {
      return val;
    }

    if (Array.isArray(val)) {
      const copy: unknown[] = [];
      objects.set(path, copy);
      for (let i = 0; i < val.length; i++) {
        copy.push(recur(val[i], path + "." + i.toString()));
      }
      return copy;
    }

    // NOTE: This block should protect against prototype poisoning
    if (!isPojo(val)) {
      throw new TypeError(
        `Non-plain objects can't be unpacked - Path: ${path}`,
      );
    }

    const keys = Object.keys(val);
    if (keys.length === 1 && keys[0] === "$ref") {
      const refPath = (val as Record<string, string>).$ref;
      const ref = objects.get(refPath);
      if (!ref) {
        throw new Error(
          `Invalid reference "${refPath}" - Path: "${path}"`,
        );
      }
      return ref;
    }
    if (keys.length === 1 && keys[0].startsWith("$")) {
      const tag = keys[0];
      const name = keys[0].slice(1);
      const packer = pm.get(name);
      if (!packer) {
        throw new Error(
          `No matching packer with name "${name}" - Path: "${path}"`,
        );
      }

      const raw = val[tag];
      let packed: unknown = undefined;
      const result = packer.unpack(raw, (fn) => {
        whenDones.push(() => fn(packed));
      });
      if (result && (
        typeof result === "object" ||
        typeof result === "symbol"
      )) {
        objects.set(path, result);
      }
      packed = recur(raw, `${path}.${tag}`);
      return result;
    }

    const copy: Record<string, unknown> = {};
    objects.set(path, copy);
    for (const [k, v] of Object.entries(val)) {
      copy[k] = recur(v, path + "." + k.replace(/\./g, "\\."));
    }
    return copy;
  };
  
  const result = recur(value, "");
  let fn = whenDones.pop();
  while (fn) {
    fn();
    fn = whenDones.pop();
  }
  return result as T;
}

/**
 * Packs the value into a JSON string. This function is a one-liner:
 * 
 * ```ts
 * return JSON.stringify(pack(value, packers || undefined), null, spaces);
 * ```
 */
export function packJson(
  value: unknown,
  packers?: Packers | null,
  spaces?: string | number,
): string {
  return JSON.stringify(pack(value, packers || undefined), null, spaces);
}

/**
 * Unpacks the JSON string into the original value. Any packers used during
 * packing (outside of registered packers and the Cav defaults) need to be
 * provided here as well, or an error may be thrown. This function is a
 * one-liner:
 *
 * ```ts
 * return unpack(JSON.parse(value), packers);
 * ```
 */
export function unpackJson(
  value: string,
  packers?: Packers,
): unknown {
  return unpack(JSON.parse(value), packers);
}

/**
 * Packs a value into a type that is compatible with a Response BodyInit, making
 * it easy to pack values for sending to an external host/client via HTTP. If a
 * provided value is already compatible with BodyInit, it will be returned with
 * an appropriate mime type, skipping the packing process. During packing, this
 * function extends the default supported types to include Blobs and Files. If a
 * Blob is encountered during packing, the resulting body will be a multipart
 * FormData that encodes the shape of the input as well as the blobs that were
 * encountered. Otherwise, a regular JSON string will be returned. Blobs and
 * Files can be placed anywhere on the input value, even if they are nested. 
 */
export function packBody(value: unknown, packers?: Packers): {
  body: BodyInit;
  mime: string;
} {
  if (
    value instanceof ArrayBuffer ||
    value instanceof ReadableStream ||
    ArrayBuffer.isView(value)
  ) {
    return {
      body: value,
      mime: "application/octet-stream",
    };
  }
  if (typeof value === "string") {
    return {
      body: value,
      mime: "text/plain",
    };
  }
  if (value instanceof URLSearchParams) {
    return {
      body: value,
      mime: "application/x-www-form-urlencoded",
    };
  }
  if (value instanceof Blob) {
    return {
      body: value,
      mime: value.type,
    };
  }
  
  const form = new FormData();
  const fileKeys = new Map<Blob, string>();
  const shape = packJson(value, {
    ...packers,
    __blob: packer({
      check: (v) => v instanceof Blob,
      pack: (v: Blob) => {
        let key = fileKeys.get(v);
        if (key) {
          return key;
        }

        key = crypto.randomUUID();
        form.set(key, v);
        fileKeys.set(v, key);
        return key;
      },
      unpack: () => null, // Not needed here
    }),
  });

  if (!fileKeys.size) {
    return {
      body: shape,
      mime: "application/json",
    };
  }
  form.set("__shape", new Blob([shape], {
    type: "application/json",
  }));
  return {
    body: form,
    mime: "multipart/form-data",
  };
}

const mimeStream = /^application\/octet-stream;?/;
const mimeString = /^text\/plain;?/;
const mimeParams = /^application\/x-www-form-urlencoded;?/;
const mimeJson = /^application\/json;?/;
const mimeForm = /^multipart\/form-data;?/;

/**
 * Unpacks a Request or Response object whose body was packed with `packBody()`.
 * Any packers used outside of the library defaults during packing need to be
 * provided here as well, or an error may be thrown.
 */
export async function unpackBody(
  from: Request | Response,
  packers?: Packers,
): Promise<unknown> {
  const mime = from.headers.get("content-type");
  if (!mime || mime.match(mimeStream)) {
    return from.body;
  }
  if (mime.match(mimeString)) {
    return await from.text();
  }
  if (mime.match(mimeParams)) {
    const form = await from.formData();
    const params = new URLSearchParams();
    for (const [k, v] of form.entries()) {
      params.append(k, v as string);
    }
    return params;
  }
  if (mime.match(mimeJson)) {
    return unpack(await from.json(), packers);
  }
  if (mime.match(mimeForm)) {
    const form = await from.formData();
    const shape = form.get("__shape");
    if (
      !shape ||
      !(shape instanceof Blob) ||
      shape.type !== "application/json"
    ) {
      return form;
    }
    return unpackJson(await shape.text(), {
      ...packers,
      __blob: packer({
        check: () => false, // Not needed here
        pack: () => false, // Not needed here
        unpack: (raw: string) => {
          const blob = form.get(raw);
          if (!blob || !(blob instanceof Blob)) {
            throw new Error(
              `Referenced blob "${raw}" is missing from the form body`,
            );
          }
          return blob;
        },
      }),
    });
  }
  return await from.blob();
}

/**
 * Utility function used in the packing functions that determines if an object
 * is a plain object or not. Because this is such a common operation when
 * checking and serializing unknown objects, it's being exported as part of the
 * API.
 */
export function isPojo(obj: unknown): obj is Record<string, unknown> {
  return (
    !!obj &&
    typeof obj === "object" &&
    (
      Object.getPrototypeOf(obj) === Object.prototype ||
      Object.getPrototypeOf(obj) === null
    )
  );
}
