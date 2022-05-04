// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

// This module is heavily inspired by https://github.com/blitz-js/superjson

// TODO: Automatically escape strings for XSS, see https://github.com/yahoo/serialize-javascript
// TODO: Support for ArrayBuffer/View
// TODO: Support for functions?

/**
 * Initializer arguments for constructing HttpErrors, which can expose arbitrary
 * data and status codes during de/serialization.
 */
 export interface HttpErrorInit {
  /** An HTTP status code describing what kind of error this is. */
  status?: number;
  /** Optional data exposed to the client when this error is serialized. */
  expose?: unknown;
  /** Other details about the error. Omitted during serialization. */
  detail?: Record<string, unknown>;
}

/** An error class for describing exceptions during HTTP processing. */
export class HttpError extends Error {
  /** An HTTP status code describing what kind of error this is. */
  status: number;
  /** Optional data exposed to the client when this error is serialized. */
  expose?: unknown;
  /** Other details about the error. Omitted during serialization. */
  detail: Record<string, unknown>;

  constructor(message: string, init?: HttpErrorInit) {
    super(message);
    this.status = init?.status || 500;
    this.expose = init?.expose;
    this.detail = init?.detail || {};
  }
}

/**
 * A group of functions used to recognize (check), serialize, and deserialize
 * objects and special values that are not strings, basic numbers, booleans, or
 * nulls into objects that are JSON compatible.
 */
export interface Serializer<I = unknown, O = unknown> {
  /**
   * Function for checking if the serializer applies to a given value. JSON
   * primitives like basic numbers, strings, booleans, and nulls skip all
   * serializers and are returned as-is. For example, `check: (v) => typeof v
   * === "string"` always returns false.
   */
  check(value: unknown): boolean;
  /**
   * Transforms the value into its output on the resulting json-compatible
   * object. The value returned by this function will be reserialized; the
   * output does not need to be JSON-compatible. 
   */
  serialize(value: I): O;
  /**
   * Transforms serialized values into their original shape and structure.
   * Initially, the value is only constructed from the raw serialized JSON.
   * Values that are more complex and need things like referential equality or
   * non-POJO/Array objects will need to use the `whenDone` registration
   * function to access the equivalent of the value returned from `serialize()`
   * when the value was serialized. (See the docs for the WhenDone type for more
   * details.)
   */
  deserialize(raw: unknown, whenDone: WhenDone<O>): I;
}

/**
 * A Serializer's `deserialize()` function receives the raw serialized JSON
 * value as its first argument and this registration function as the second.
 * Functions registered with WhenDone will be run last-in-first-out (stack
 * order) when the raw JSON has been processed into the final object instance.
 * WhenDone functions are needed whenever the serialized data is more complex
 * than simple JSON values, for example when referential equality needs to be
 * maintained or when the serialize function returns anything that needs to be
 * re-serialized by some other serializer. Referenced objects may not be fully
 * initialized when the registered function is called, but its instance will be
 * instantiated so that references can be fixed.
 */
export type WhenDone<O> = (fn: (serialized: O) => void) => void;

/**
 * Constructs a Serializer. This simply returns the first argument, it's only
 * used for type annotations.
 */
export function serializer<I = unknown, O = unknown>(
  init: Serializer<I, O>,
): Serializer<I, O> {
  return init;
}

/**
 * Type alias representing a Serializer with any input or output type. Useful
 * for type constraints.
 */
// deno-lint-ignore no-explicit-any
export type AnySerializer = Serializer<any, any>;

/**
 * A group of named Serializer objects. Serializer keys are used to tag
 * serialized values on the output JSON, which is required in order to correctly
 * deserialize the value on the other side.
 */
export type Serializers = Record<string, AnySerializer | null>;

function serializerMap(serializers?: Serializers): Map<string, AnySerializer> {
  const defaults = new Map<string, AnySerializer>(Object.entries({
    httpError: serializer({
      check: (v) => v instanceof HttpError,
      serialize: (v: HttpError) => ({
        status: v.status,
        message: v.message,
        expose: v.expose,
      }),
      deserialize: (raw, whenDone) => {
        const u = (raw as { status: number; message: string });
        const err = new HttpError(u.message, { status: u.status });
        whenDone((parsed) => {
          err.expose = parsed.expose;
        });
        return err;
      },
    }),
    error: serializer({
      check: (v) => v instanceof Error,
      serialize: (v: Error) => v.message,
      deserialize: (raw) => new Error(raw as string),
    }),
    date: serializer({
      check: (v) => v instanceof Date,
      serialize: (v: Date) => v.toJSON(),
      deserialize: (raw) => new Date(raw as string),
    }),
    undefined: serializer({
      check: (v) => typeof v === "undefined",
      serialize: () => null,
      deserialize: () => undefined,
    }),
    symbol: serializer({
      check: (v) => typeof v === "symbol",
      serialize: (v: symbol) => v.description,
      deserialize: (raw) => Symbol(raw as string),
    }),
    map: serializer({
      check: (v) => v instanceof Map,
      serialize: (v: Map<unknown, unknown>) => Array.from(v.entries()),
      deserialize: (_, whenDone) => {
        const map = new Map();
        whenDone(entries => {
          entries.forEach(v => map.set(v[0], v[1]));
        });
        return map;
      },
    }),
    set: serializer({
      check: (val) => val instanceof Set,
      serialize: (v: Set<unknown>) => Array.from(v.values()),
      deserialize: (_, whenDone) => {
        const set = new Set();
        whenDone(values => {
          values.forEach(v => set.add(v));
        });
        return set;
      },
    }),
    bigint: serializer({
      check: (v) => typeof v === "bigint",
      serialize: (v: bigint) => v.toString(),
      deserialize: (raw) => BigInt(raw as string),
    }),
    regexp: serializer({
      check: (v) => v instanceof RegExp,
      serialize: (v: RegExp) => v.toString(),
      deserialize: (raw) => {
        const r = (raw as string).slice(1).split("/");
        return new RegExp(r[0], r[1]);
      },
    }),
    number: serializer({
      check: (v) => typeof v === "number" && (
        isNaN(v) ||
        v === Number.POSITIVE_INFINITY ||
        v === Number.NEGATIVE_INFINITY ||
        Object.is(v, -0)
      ),
      serialize: (v: number) => (
        isNaN(v) ? "nan"
        : v === Number.POSITIVE_INFINITY ? "+infinity"
        : v === Number.NEGATIVE_INFINITY ? "-infinity"
        : Object.is(v, -0) ? "-0"
        : 0 // Should never happen
      ),
      deserialize: (raw: string) => (
        raw === "nan" ? NaN
        : raw === "+infinity" ? Number.POSITIVE_INFINITY
        : raw === "-infinity" ? Number.NEGATIVE_INFINITY
        : raw === "-zero" ? -0
        : 0
      ),
    }),
    conflict: serializer({
      check: (v) => {
        if (!isPojo(v)) {
          return false;
        }
        const keys = Object.keys(v);
        return keys.length === 1 && keys[0].startsWith("$");
      },
      serialize: Object.entries,
      deserialize: (_, whenDone) => {
        const result: Record<string, unknown> = {};
        whenDone(entry => {
          result[entry[0][0]] = entry[0][1];
        });
        return result;
      },
    }),
  }));

  if (!serializers) {
    return defaults;
  }

  const smap = new Map<string, AnySerializer>();
  for (const [k, v] of Object.entries(serializers)) {
    if (v === null) {
      continue;
    }
    if (k === "ref" || defaults.has(k)) {
      throw new Error(
        `Conflict: The serializer key "${k}" is reserved`,
      );
    }
    smap.set(k, v);
  }
  if (!smap.size) {
    return defaults;
  }
  for (const [k, v] of defaults.entries()) {
    smap.set(k, v);
  }
  return smap;
}

/**
 * Serializes a value recursively until it's JSON-compatible. Serializers can be
 * plugged in to extend the accepted types beyond what Cav supports by default.
 * Referential equality will be preserved whenever the same object or symbol
 * value is encountered more than once. If a value isn't recognized by any of
 * the provided serializers or the default serializers, an error is thrown.
 */
export function serialize(
  value: unknown,
  serializers?: Serializers | null,
): unknown {
  const smap = serializerMap(serializers || {});
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

    for (const [name, serializer] of smap.entries()) {
      if (serializer.check(val)) {
        const key = `$${name}`;
        return { [key]: recur(serializer.serialize(val), [...path, key]) };
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
      `No matching serializers for ${val}`,
    );
  };

  return recur(value, [""]);
}

/**
 * Deserializes a value returned by `serialize()` into the original input value.
 * Referential equality will be restored on the output object. An error will be
 * thrown if a value was serialized with an unknown/unused serializer.
 */
export function deserialize<T = unknown>(
  value: unknown,
  serializers?: Serializers | null,
): T {
  const smap = serializerMap(serializers || {});
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
        `Non-plain objects can't be deserialized - Path: ${path}`,
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
      const serializer = smap.get(name);
      if (!serializer) {
        throw new Error(
          `No matching serializer with name "${name}" - Path: "${path}"`,
        );
      }

      const raw = val[tag];
      let serialized: unknown = undefined;
      const result = serializer.deserialize(raw, (fn) => {
        whenDones.push(() => fn(serialized));
      });
      if (result && (
        typeof result === "object" ||
        typeof result === "symbol"
      )) {
        objects.set(path, result);
      }
      serialized = recur(raw, `${path}.${tag}`);
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
 * Serializes a value into a type that is compatible with a Response BodyInit,
 * making it easy to serialize values for sending to an external host/client via
 * HTTP. If a provided value is already compatible with BodyInit, it will be
 * returned with an appropriate mime type, skipping the serialization process.
 * During serialization, this function extends the default supported types to
 * include Blobs and Files. If a Blob is encountered during serialization, the
 * resulting body will be a multipart FormData that encodes the shape of the
 * input as well as the blobs that were encountered. Otherwise, a regular JSON
 * string will be returned. Blobs and Files can be placed anywhere on the input
 * value, even if they are nested. 
 */
export function serializeBody(value: unknown, serializers?: Serializers): {
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
  const shape = JSON.stringify(serialize(value, {
    ...serializers,
    __blob: serializer({
      check: (v) => v instanceof Blob,
      serialize: (v: Blob) => {
        let key = fileKeys.get(v);
        if (key) {
          return key;
        }

        key = crypto.randomUUID();
        form.set(key, v);
        fileKeys.set(v, key);
        return key;
      },
      deserialize: () => null, // Not needed here
    }),
  }));

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
 * Deserializes a Request or Response object whose body was serialized with
 * `serializeBody()`. Any Serializers used outside of the library defaults
 * during serialization need to be provided here as well, or an error may be
 * thrown.
 */
export async function deserializeBody(
  from: Request | Response,
  serializers?: Serializers,
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
    return deserialize(await from.json(), serializers);
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
    return JSON.parse(deserialize(await shape.text(), {
      ...serializers,
      __blob: serializer({
        check: () => false, // Not needed here
        serialize: () => false, // Not needed here
        deserialize: (raw: string) => {
          const blob = form.get(raw);
          if (!blob || !(blob instanceof Blob)) {
            throw new Error(
              `Referenced blob "${raw}" is missing from the form body`,
            );
          }
          return blob;
        },
      }),
    }));
  }
  return await from.blob();
}

/**
 * Utility function used in the serial functions that determines if an object is
 * a plain object or not. Because this is such a common operation when checking
 * and serializing unknown objects, it's being exported as part of the API.
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
