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
  error: serializer({
    check: (v) => v instanceof Error,
    serialize: (v: Error) => {
      if (v instanceof HttpError) {
        return {
          type: "HttpError",
          message: v.message,
          status: v.status,
          expose: v.expose,
        };
      }
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
      switch (v.name) {
        case "EvalError":
        case "RangeError":
        case "ReferenceError":
        case "SyntaxError":
        case "TypeError":
        case "URIError":
        case "AggregateError": return { type: v.name, message: v.message };
        default: return v.message;
      }
    },
    // deno-lint-ignore no-explicit-any
    deserialize: (raw: any, whenDone) => {
      if (typeof raw === "string") {
        return new Error(raw);
      }

      switch (raw.type) {
        case "HttpError": {
          const err = new HttpError(raw.message, {
            status: parseInt(raw.status, 10), // Should be parsed first
          });
          // deno-lint-ignore no-explicit-any
          whenDone((ready: any) => {
            err.expose = ready.expose
          });
          return err;
        }
        case "EvalError": return new EvalError(raw.message);
        case "RangeError": return new RangeError(raw.message);
        case "ReferenceError": return new ReferenceError(raw.message);
        case "SyntaxError": return new SyntaxError(raw.message);
        case "TypeError": return new TypeError(raw.message);
        case "URIError": return new URIError(raw.message);
        case "AggregateError": return new AggregateError(raw.message);
        default: return new Error(raw.message);
      }
    },
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
  buffer: serializer({
    check: v => v instanceof ArrayBuffer || ArrayBuffer.isView(v),
    // TODO: This could be faster - https://jsben.ch/wnaZC
    serialize: (v: ArrayBufferView | ArrayBuffer) => {
      let base64 = "";
      const data = new Uint8Array(
        v instanceof ArrayBuffer ? v : v.buffer
      );
      for (let i = 0; i < data.length; i++) {
        base64 += String.fromCharCode(data[i]);
      }
      return {
        type: v.constructor.name,
        data: self.btoa(base64),
      };
    },
    deserialize: (raw: { type: string, data: string }) => {
      const data = self.atob(raw.data);
      const buf = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        buf[i] = data.charCodeAt(i);
      }

      switch (raw.type) {
        case "ArrayBuffer": return buf.buffer;
        case "Int8Array": return new Int8Array(buf.buffer);
        case "Uint8Array": return new Uint8Array(buf.buffer);
        case "Uint8ClampedArray": return new Uint8ClampedArray(buf.buffer);
        case "Int16Array": return new Int16Array(buf.buffer);
        case "Uint16Array": return new Uint16Array(buf.buffer);
        case "Int32Array": return new Int32Array(buf.buffer);
        case "Uint32Array": return new Uint32Array(buf.buffer);
        case "Float32Array": return new Float32Array(buf.buffer);
        case "Float64Array": return new Float64Array(buf.buffer);
        case "BigInt64Array": return new BigInt64Array(buf.buffer);
        case "BigUint64Array": return new BigUint64Array(buf.buffer);
        case "DataView": return new DataView(buf.buffer);
        default: return buf; // Uint8Array is the fallback
      }
    },
  })
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

interface PackedBody {
  body: BodyInit | null;
  headers?: HeadersInit;
}

function packBody(
  body: unknown,
  serializers?: Serializers,
): PackedBody {
  if (body === null || typeof body === "undefined") {
    return { body: null };
  }
  if (
    body instanceof ReadableStream ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  ) {
    return {
      body,
      headers: { "content-type": "application/octet-stream" },
    };
  }
  if (typeof body === "string") {
    return {
      body,
      headers: { "content-type": "text/plain" },
    };
  }
  if (body instanceof URLSearchParams) {
    // No need to specify the type since its inferred because it's a form
    return {
      body,
      // headers: { "content-type": "application/x-www-form-urlencoded" },
    };
  }
  if (body instanceof FormData) {
    // No need to specify the type since its inferred because it's a form
    return { body };
  }
  if (body instanceof File) {
    return {
      body,
      headers: {
        "content-type": body.type,
        "content-disposition": `attachment; filename="${body.name}"`,
      },
    }
  }
  if (body instanceof Blob) {
    return {
      body,
      headers: {
        "content-type": body.type,
        "content-disposition": "attachment",
      },
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
      headers: { "content-type": "application/json" },
    };
  }

  form.set("__shape", new File([shape], "__shape.json", {
    type: "application/json",
  }));

  // No need to specify the type since its inferred because it's a form
  return { body: form };
}

export interface PackRequestInit extends Omit<RequestInit, "body" | "method"> {
  serializers?: Serializers;
  message?: unknown;
}

export function packRequest(url: string, init: PackRequestInit): Request {
  const packed = (
    typeof init.message === "undefined" ? undefined
    : packBody(init.message, init.serializers)
  );

  const headers = new Headers(packed?.headers);
  const initHeaders = new Headers(init.headers);
  for (const [k, v] of initHeaders.entries()) {
    headers.append(k, v);
  }

  return new Request(url, {
    method: packed ? "POST" : "GET",
    ...init,
    headers,
    body: packed?.body,
  });
}

// const mimeStream = /^application\/octet-stream;?/;
const mimeString = /^text\/plain;?/;
const mimeParams = /^application\/x-www-form-urlencoded;?/;
const mimeJson = /^application\/json;?/;
const mimeForm = /^multipart\/form-data;?/;

async function unpackBody(
  from: Request | Response,
  serializers?: Serializers,
): Promise<unknown> {
  if (!from.body) {
    return null;
  }

  // Files and Blobs are sent with a "content-disposition: attachment" header
  const type = from.headers.get("content-type") || "";
  const disposition = from.headers.get("content-disposition");
  if (disposition) {
    const match = disposition.match(/^attachment; filename="(.+)"/);
    if (match) {
      const filename = match[1];
      return new File([await from.blob()], filename, { type });
    }
    if (disposition.match(/^attachment;?/)) {
      return from.blob();
    }
  }

  const parseForm = (form: FormData) => {
    const result: Record<string, string | File | (string | File)[]> = {};
    for (const [k, v] of form.entries()) {
      const old = result[k];
      if (Array.isArray(old)) {
        old.push(v);
      } else if (typeof old === "undefined") {
        result[k] = v;
      } else  {
        result[k] = [old, v];
      }
    }
    return result;
  };

  if (type.match(mimeString)) {
    return await from.text();
  }
  if (type.match(mimeParams)) {
    return parseForm(await from.formData());
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
      return parseForm(form);
    }
    return deserialize(JSON.parse(await shape.text()), {
      ...serializers,
      __blob: serializer({
        check: () => false, // Not needed here
        serialize: () => null, // Not needed here
        deserialize: (raw: string) => form.get(raw),
      }),
    });
  }

  // Fallback is to return the body as a blob. You can force this behavior by
  // specifying a "content-type: attachment" header
  return await from.blob();
}

export async function unpackRequest(
  req: Request,
  serializers?: Serializers,
): Promise<unknown> {
  return await unpackBody(req, serializers);
}

// export interface PackResponseInit extends ResponseInit {
//   serializers?: Serializers;
// }

// export function packResponse(body: unknown, init?: PackResponseInit): Response {
  
// }

// export async function unpackResponse(
//   res: Response,
//   serializers?: Serializers,
// ): Promise<unknown> {

// }