// Copyright 2022 Connor Logan. All rights reserved. MIT License.  
// This module is browser-compatible.  
// This module is heavily inspired by https://github.com/blitz-js/superjson.

// REVIEW: Automatically escape strings for XSS, see
// https://github.com/yahoo/serialize-javascript ?
// REVIEW: Support for functions?

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

// HttpError is defined here so that serial.ts can be self-contained
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
   * Transforms serialized values into their original input. Any nested
   * serialized values will still be serialized when this function is called
   * initially. Use the `whenDone` registration function to finish setting up
   * the resulting output only when each of the nested values is finished
   * deserializing, i.e. "ready".
   */
  deserialize(
    raw: unknown,
    whenDone: (fn: (ready: O) => void) => void,
  ): I;
}

// REVIEW: I don't think this function is really necessary. Probably fine to
// make all the serializer types unknowns and not provide this typing function
// at all
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

// Creating a constant object results in the default serializers being included
// in bundles regardless of whether or not they get used. Wrapping them in a
// function fixes this. Also, creating them on every call is unnecessary work,
// so they get cached to the window with a symbol
function defaults(): Map<string, AnySerializer> {
  const sym = Symbol.for("defaults.serial.cav.bar");
  const s = self as unknown as typeof self & {
    [sym]?: Map<string, AnySerializer>;
  };

  const cached = s[sym];
  if (cached) {
    return cached;
  }

  Object.assign(self, {
    [sym]: new Map<string, AnySerializer>(Object.entries({
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
            case "AggregateError":
              return { type: v.name, message: v.message };
            default:
              return v.message;
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
                err.expose = ready.expose;
              });
              return err;
            }
            case "EvalError":
              return new EvalError(raw.message);
            case "RangeError":
              return new RangeError(raw.message);
            case "ReferenceError":
              return new ReferenceError(raw.message);
            case "SyntaxError":
              return new SyntaxError(raw.message);
            case "TypeError":
              return new TypeError(raw.message);
            case "URIError":
              return new URIError(raw.message);
            case "AggregateError":
              return new AggregateError(raw.message);
            default:
              return new Error(raw.message);
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
          whenDone((entries) => {
            entries.forEach((v) => map.set(v[0], v[1]));
          });
          return map;
        },
      }),
      set: serializer({
        check: (val) => val instanceof Set,
        serialize: (v: Set<unknown>) => Array.from(v.values()),
        deserialize: (_, whenDone) => {
          const set = new Set();
          whenDone((values) => {
            values.forEach((v) => set.add(v));
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
        check: (v) =>
          typeof v === "number" && (
            isNaN(v) ||
            v === Number.POSITIVE_INFINITY ||
            v === Number.NEGATIVE_INFINITY ||
            Object.is(v, -0)
          ),
        serialize: (v: number) => (
          Object.is(v, -0)
            ? "-zero"
            : v === Number.POSITIVE_INFINITY
            ? "+infinity"
            : v === Number.NEGATIVE_INFINITY
            ? "-infinity"
            : "nan"
        ),
        deserialize: (raw: string) => (
          raw === "-zero"
            ? -0
            : raw === "+infinity"
            ? Number.POSITIVE_INFINITY
            : raw === "-infinity"
            ? Number.NEGATIVE_INFINITY
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
          whenDone((entry) => {
            result[entry[0]] = entry[1];
          });
          return result;
        },
      }),
      buffer: serializer({
        check: (v) => v instanceof ArrayBuffer || ArrayBuffer.isView(v),
        // TODO: This could be faster - https://jsben.ch/wnaZC
        serialize: (v: ArrayBufferView | ArrayBuffer) => {
          let base64 = "";
          const data = new Uint8Array(
            v instanceof ArrayBuffer ? v : v.buffer,
          );
          for (let i = 0; i < data.length; i++) {
            base64 += String.fromCharCode(data[i]);
          }
          return {
            type: v.constructor.name,
            data: self.btoa(base64),
          };
        },
        deserialize: (raw: { type: string; data: string }) => {
          const data = self.atob(raw.data);
          const buf = new Uint8Array(data.length);
          for (let i = 0; i < data.length; i++) {
            buf[i] = data.charCodeAt(i);
          }
    
          switch (raw.type) {
            case "ArrayBuffer":
              return buf.buffer;
            case "Int8Array":
              return new Int8Array(buf.buffer);
            case "Uint8Array":
              return new Uint8Array(buf.buffer);
            case "Uint8ClampedArray":
              return new Uint8ClampedArray(buf.buffer);
            case "Int16Array":
              return new Int16Array(buf.buffer);
            case "Uint16Array":
              return new Uint16Array(buf.buffer);
            case "Int32Array":
              return new Int32Array(buf.buffer);
            case "Uint32Array":
              return new Uint32Array(buf.buffer);
            case "Float32Array":
              return new Float32Array(buf.buffer);
            case "Float64Array":
              return new Float64Array(buf.buffer);
            case "BigInt64Array":
              return new BigInt64Array(buf.buffer);
            case "BigUint64Array":
              return new BigUint64Array(buf.buffer);
            case "DataView":
              return new DataView(buf.buffer);
            default: // Uint8Array is the fallback
              return buf;
          }
        },
      }),
    })),
  });

  return s[sym]!;
}

function serializerMap(serializers?: Serializers): Map<string, AnySerializer> {
  if (!serializers) {
    return defaults();
  }

  const defs = defaults();
  const smap = new Map<string, AnySerializer>();
  for (const [k, v] of Object.entries(serializers)) {
    if (v === null) {
      continue;
    }
    if (k === "ref" || defs.has(k)) {
      throw new Error(
        `Conflict: The serializer key "${k}" is reserved`,
      );
    }
    smap.set(k, v);
  }
  if (!smap.size) {
    return defs;
  }
  for (const [k, v] of defs.entries()) {
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
    p.map((v) => v.replace(/\./g, "\\.")).join(".")
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
      if (
        result && (
          typeof result === "object" ||
          typeof result === "symbol"
        )
      ) {
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
  body?: BodyInit | null;
  headers?: HeadersInit;
}

function packBody(
  body: unknown,
  serializers?: Serializers,
): PackedBody {
  if (
    body === null ||
    typeof body === "undefined" ||
    body instanceof ReadableStream ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    body instanceof FormData
  ) {
    return { body };
  }

  if (body instanceof File) {
    return {
      body,
      headers: { "content-disposition": `attachment; filename="${body.name}"` },
    };
  }

  if (body instanceof Blob) {
    return {
      body,
      headers: { "content-disposition": "attachment" },
    };
  }

  // Anything else needs to be serialized either as JSON or as a multipart form
  // if there's Blobs anywhere in the input
  const form = new FormData();
  const fileKeys = new Map<Blob, string>();
  const json = JSON.stringify(serialize(body, {
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
      body: json,
      headers: { "content-type": "application/json" },
    };
  }
  form.set(
    "__shape",
    new File([json], "__shape.json", {
      type: "application/json",
    }),
  );
  return { body: form };
}

function mergeHeaders(a?: HeadersInit, b?: HeadersInit) {
  const ah = new Headers(a);
  const bh = new Headers(b);
  for (const [k, v] of bh.entries()) {
    if (k === "content-type" || k === "content-disposition") {
      ah.set(k, v);
    } else {
      ah.append(k, v);
    }
  }
  return ah;
}

export interface PackRequestInit extends Omit<RequestInit, "body" | "method"> {
  serializers?: Serializers;
  message?: unknown;
}

/**
 * Serializes a new Request, which can then be deserialized using `unpack()`.
 * Only GET and POST requests are supported; the method used is automatically
 * determined based on the presence of the `message` init option. Any headers
 * specified on the init options will override the headers determined during
 * serialization. The serializable input types can be extended with the
 * serializers option.
 *
 * If the message is `undefined`, the method is GET. If the message is `null`,
 * the method is POST with no body. Any defined message (including null) results
 * in a POST request.
 *
 * If the message extends BodyInit, it'll be passed through to the Request
 * constructor unmodified. During `unpack()`, it'll be deserialized according to
 * the content-type set on the request headers, which can sometimes result in
 * asymmetric deserialization.
 *
 * If the message is a File or Blob, it'll also be sent with a
 * "content-disposition: attachment" header. During `unpack()`, it will be
 * deserialized back into a regular Blob or File, along with the file name if
 * there is one, regardless of the content-type.
 *
 * If the message is any other type, it'll first be serialized as JSON using
 * `serialize()`. The default serializers are extended to include Files and
 * Blobs; if a File or Blob exists on the serialized value, the request will be
 * sent as a specially formatted FormData instead of JSON. During `unpack()`,
 * it'll be deserialized back into the original `message` with all the Files and
 * Blobs back in the right place. Referential equality for Files and Blobs will
 * be preserved, so that duplicate Blobs only have 1 copy uploaded.
 */
export function packRequest(url: string, init?: PackRequestInit): Request {
  const packed = packBody(init?.message, init?.serializers);
  return new Request(url, {
    ...init,
    method: typeof packed.body === "undefined" ? "GET" : "POST",
    headers: mergeHeaders(packed.headers, init?.headers),
    body: packed.body,
  });
}

export interface PackResponseInit extends ResponseInit {
  serializers?: Serializers;
}

/**
 * Serializes a new Response, which can then be deserialized back into the input
 * body using `unpack()`. Any headers specified on the init options will
 * override the headers determined during serialization. The same applies for
 * status and statusText. The serializable input types can be extended with the
 * serializers option.
 *
 * If the body is `undefined`, a 204 Response is created. If the body is `null`,
 * a 200 response is created with a zero-length body.
 *
 * If the body extends BodyInit, it'll be passed through to the Response
 * constructor unmodified. During `unpack()`, it'll be deserialized according to
 * the content-type set on the response headers, which can sometimes result in
 * asymmetric deserialization.
 *
 * If the message is a File or Blob, it'll also be sent with a
 * "content-disposition: attachment" header. During `unpack()`, it will be
 * deserialized back into a regular Blob or File, along with the file name if
 * there is one, regardless of the content-type.
 *
 * If the message is any other type, it'll first be serialized as JSON using
 * `serialize()`. The default serializers are extended to include Files and
 * Blobs; if a File or Blob exists on the serialized value, the response will be
 * sent as a specially formatted FormData instead of JSON. During `unpack()`,
 * it'll be deserialized back into the original `message` with all the Files and
 * Blobs back in the right place. Referential equality for Files and Blobs will
 * be preserved, so that duplicate Blobs only have 1 copy uploaded.
 */
export function packResponse(
  body?: unknown,
  init?: PackResponseInit,
): Response {
  const packed = packBody(body, init?.serializers);
  return new Response(packed.body, {
    status: typeof packed.body === "undefined" ? 204 : 200,
    ...init,
    headers: mergeHeaders(packed.headers, init?.headers),
  });
}

const mimeString = /^text\/plain;?/;
const mimeParams = /^application\/x-www-form-urlencoded;?/;
const mimeJson = /^application\/json;?/;
const mimeForm = /^multipart\/form-data;?/;

// TODO: Add an option for controlling the way forms/blobs/files are processed.
// (For large file uploads that are disk backed)
/**
 * Deserializes a Request or Response generated with `packRequest()` or
 * `packResponse()` back into the original request message or response body. Any
 * serializers specified during packing need to be specified here as well.
 */
export async function unpack(
  packed: Request | Response,
  serializers?: Serializers,
): Promise<unknown> {
  // GET requests and 204 responses return undefined. Any other Request or
  // Response without a body returns null
  if (
    (packed instanceof Request && packed.method === "GET") ||
    (packed instanceof Response && packed.status === 204)
  ) {
    return undefined;
  }
  if (!packed.body) {
    return null;
  }

  const type = packed.headers.get("content-type") || "";
  const disposition = packed.headers.get("content-disposition");
  if (disposition) {
    const match = disposition.match(/^attachment; filename="(.+)"/);
    if (match) {
      const filename = match[1];
      return new File([await packed.blob()], filename, { type }); // REVIEW
    }
    if (disposition.match(/^attachment;?/)) {
      return packed.blob();
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
      } else {
        result[k] = [old, v];
      }
    }
    return result;
  };

  if (type.match(mimeString)) {
    return await packed.text();
  }
  if (type.match(mimeParams)) {
    return parseForm(await packed.formData());
  }
  if (type.match(mimeJson)) {
    return deserialize(await packed.json(), serializers);
  }
  if (type.match(mimeForm)) {
    const form = await packed.formData();
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

  // The fallback behavior just returns a Blob (for now)
  return await packed.blob();
}
