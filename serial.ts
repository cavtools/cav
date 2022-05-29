// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

// This module is heavily inspired by https://github.com/blitz-js/superjson

// TODO: IMPORTANT: Serialized values should be wrapped in a metadata object
// that encodes the version of cav that serialized it (e.g. 0.1)  

// TODO: serialize() should first scan the input's values recursively to see if
// it needs serializing. If it doesn't, it should return the input without the
// metadata wrapper

// TODO: Automatically escape strings for XSS, see
// https://github.com/yahoo/serialize-javascript ?  
// TODO: Support for ArrayBuffer/View  
// TODO: Support for functions?

// HttpError is defined here so that serial.ts can be self-contained

/**
 * Init options for constructing HttpErrors, which can expose arbitrary data and
 * status codes during de/serialization.
 */
export interface HttpErrorInit {
  /** An HTTP status code describing what kind of error this is. */
  status?: number;
  /** Optional data exposed to the client when this error is serialized. */
  expose?: unknown;
  /** Other details about the error. Omitted during serialization. */
  detail?: Record<string, unknown>;
}

/** Error class for describing exceptions during HTTP processing. */
export class HttpError extends Error {
  /** An HTTP status code describing what kind of error this is. */
  status: number;
  /** Optional data exposed to the client when this error is serialized. */
  expose: unknown;
  /** Other details about the error. Omitted during serialization. */
  detail: Record<string, unknown>;

  constructor(message: string, init?: HttpErrorInit) {
    super(message);
    this.status = init?.status || 500;
    this.expose = init?.expose || null;
    this.detail = init?.detail || {};
  }
}

/**
 * Interface for serializing and deserializing arbitrary non-JSON primitive
 * values into JSON.
 */
export interface Serializer<I = unknown, O = unknown> {
  /**
   * Checks if this serializer applies to the value.
   */
  check(value: unknown): boolean;
  /**
   * Transforms the value into its JSON-compatible format. The value returned by
   * this function will be re-serialized, i.e. not every nested value needs to
   * be JSON compatible.
   */
  serialize(value: I): O;
  /**
   * Transforms serialized values into their original input. Nested serialized
   * values will still be serialized when this function is called; use the
   * `whenDone` registration function to finish setting up the resulting output
   * only when each of the nested values is finished deserializing. (i.e.
   * "ready")
   */
  deserialize(
    raw: unknown,
    whenDone: (fn: (ready: O) => void) => void,
  ): I;
}

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

/**
 * Determines if the object is a plain object or not. This also checks for
 * prototype poisoning; it returns false whenever the prototype of an input
 * object was poisoned before JSON.parsing it. See
 * https://book.hacktricks.xyz/pentesting-web/deserialization/nodejs-proto-prototype-pollution
 * for more information on prototype poisoning.
 */
 export function isPojo(obj: unknown): obj is Record<string | symbol, unknown> {
  return (
    !!obj &&
    typeof obj === "object" &&
    (
      Object.getPrototypeOf(obj) === Object.prototype ||
      Object.getPrototypeOf(obj) === null
    )
  );
}

const defaults = new Map<string, AnySerializer>(Object.entries({
  symbol: serializer({
    check: (v) => typeof v === "symbol",
    serialize: (v: symbol) => {
      const key = Symbol.keyFor(v);
      if (typeof key === "string") {
        return { for: key };
      }
      return { desc: v.description };
    },
    deserialize: (raw: { for: string } | { desc: string }) => {
      if ("for" in raw && typeof raw.for === "string") {
        return Symbol.for(raw.for);
      }
      return Symbol((raw as { desc: string }).desc);
    },
  }),
  // NOTE: This must come before the `error` serializer
  httpError: serializer({
    check: (v) => v instanceof HttpError,
    serialize: (v: HttpError) => ({
      status: v.status,
      message: v.message,
      expose: v.expose || null,
    }),
    deserialize: (raw: { status: number, message: string }, whenDone) => {
      // Type check this one since HttpError doesn't do type checking itself
      if (
        !raw ||
        typeof raw !== "object" ||
        typeof raw.status !== "number" ||
        typeof raw.message !== "string" ||
        !("expose" in raw)
      ) {
        throw new TypeError("Invalid $httpError format");
      }

      const err = new HttpError(raw.message, { status: raw.status });
      whenDone(ready => {
        err.expose = ready.expose;
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
    serialize: () => true,
    deserialize: () => undefined,
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
      Object.is(v, -0) ? "-zero"
      : v === Number.POSITIVE_INFINITY ? "+infinity"
      : v === Number.NEGATIVE_INFINITY ? "-infinity"
      : "nan"
    ),
    deserialize: (raw: string) => (
      raw === "-zero" ? -0
      : raw === "+infinity" ? Number.POSITIVE_INFINITY
      : raw === "-infinity" ? Number.NEGATIVE_INFINITY
      : NaN
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
    serialize: (v: Record<string, string>) => Object.entries(v)[0],
    deserialize: (_, whenDone) => {
      const result: Record<string, unknown> = {};
      whenDone(entry => {
        result[entry[0]] = entry[1];
      });
      return result;
    },
  }),
}));

function serializerMap(serializers?: Serializers): Map<string, AnySerializer> {
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
 * If a value isn't recognized by any of the provided or default serializers, an
 * error will be thrown.
 */
export function serialize(
  value: unknown,
  serializers?: Serializers | null,
): unknown {
  const smap = serializerMap(serializers || undefined);
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
 * Deserializes a JSON value that was `serialize()`d back into the original
 * input. An error will be thrown if a value was serialized with an unknown
 * serializer.
 */
export function deserialize<T = unknown>(
  value: unknown,
  serializers?: Serializers | null,
): T {
  const smap = serializerMap(serializers || undefined);
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
        `Non-plain objects can't be deserialized - Path: "${path}"`,
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

/** Return type of serializeBody(). Includes the BodyInit and a content type. */
// export interface SerializedBody {
//   body: BodyInit;
//   type: string;
// }

// /**
//  * Serializes a value into a type that's compatible with a BodyInit for a new
//  * Response or a fetch() call, making it easy to serialize values for sending to
//  * an external host/client via HTTP. If a provided value is already compatible
//  * with BodyInit, it will be returned with an appropriate mime type, skipping
//  * the serialization process. During serialization, this function extends the
//  * serializable types to include Blobs and Files. If a Blob is encountered
//  * during serialization, the resulting body will be a multipart FormData that
//  * encodes the shape of the input as well as the blobs that were encountered.
//  * Otherwise, a regular JSON string will be returned. Blobs and Files can be
//  * placed anywhere on the input value, even if they are nested, inside a Map or
//  * Set, etc. 
//  */
function packBody(
  body: unknown,
  serializers?: Serializers,
): { body: unknown; type: string } {
  if (
    body instanceof ReadableStream ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  ) {
    return {
      body,
      type: "application/octet-stream",
    };
  }
  if (typeof body === "string") {
    return {
      body,
      type: "text/plain",
    };
  }
  if (body instanceof URLSearchParams) {
    return {
      body,
      type: "application/x-www-form-urlencoded",
    };
  }
  if (body instanceof Blob) {
    return {
      body,
      type: body.type,
    };
  }
  
  const form = new FormData();
  const fileKeys = new Map<Blob, string>();
  const shape = JSON.stringify(serialize(body, {
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
      type: "application/json",
    };
  }

  // TODO: Multipart bodies include a boundary that isn't generated until the
  // request/response is constructed. The "type" property doesn't currently
  // include that boundary because there's no way to determine it. Not sure if
  // the current behavior is broken or not

  form.set("__shape", new Blob([shape], { type: "application/json" }));
  return {
    body: form,
    type: "multipart/form-data",
  };
}

const mimeStream = /^application\/octet-stream;?/;
const mimeString = /^text\/plain;?/;
const mimeParams = /^application\/x-www-form-urlencoded;?/;
const mimeJson = /^application\/json;?/;
const mimeForm = /^multipart\/form-data;?/;

async function unpackBody(
  from: Request | Response,
  serializers?: Serializers,
): Promise<unknown> {
  const type = from.headers.get("content-type");
  if (!type || type.match(mimeStream)) {
    return from.body;
  }
  if (type.match(mimeString)) {
    return await from.text();
  }
  if (type.match(mimeParams)) {
    const form = await from.formData();
    const params = new URLSearchParams();
    for (const [k, v] of form.entries()) {
      params.append(k, v as string);
    }
    return params;
  }
  if (type.match(mimeJson)) {
    return deserialize(await from.json(), serializers);
  }
  if (type.match(mimeForm)) {
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
        serialize: () => null, // Not needed here
        deserialize: (raw: string) => {
          const blob = form.get(raw);
          if (!blob || !(blob instanceof Blob)) {
            throw new Error(
              `Referenced blob "${raw}" is missing from the multipart form`,
            );
          }
          return blob;
        },
      }),
    }));
  }
  return await from.blob();
}

export interface PackRequestInit extends Omit<RequestInit, "body" | "method"> {
  serializers?: Serializers;
  query?: Record<string, string | string[]>;
  message?: unknown;
}

export function packRequest(url: string, init: PackRequestInit): Request {
  
}

export async function unpackRequest(
  req: Request,
  serializers?: Serializers,
): Promise<{
  query: Record<string, string | string[]>;
  message: unknown;
}> {

}

export interface PackResponseInit extends ResponseInit {
  serializers?: Serializers;
}

export function packResponse(body: unknown, init?: PackResponseInit): Response {

}

export async function unpackResponse(
  res: Response,
  serializers?: Serializers,
): Promise<unknown> {

}