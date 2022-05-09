
In Cav, RPCs are special Request handler functions with some inferred type
information attached. When a new RPC is created using the top-level `rpc()`, the
returned function fulfills Deno's
[`http.Handler`](https://deno.land/std@0.138.0/http/server.ts#L27) type:

```ts
rpc({}) as {
  (req: Request, connInfo: {
    localAddr: Deno.Addr;
    remoteAddr: Deno.Addr;
  }): Promise<Response>;

  // The init options specified during creation are assigned as the `init`
  // property on the RPC function itself. This can be useful when you want to
  // create an RPC that extends a different RPC's functionality
  readonly init: RpcInit;
};
```

RPCs follow an opinionated procedure while responding to an incoming Request.
They are GET and POST only, and which method to allow is automatically
determined by the options specified during construction.

RPC Resolvers receive a single argument containing all of the pre-processed
request data and are expected to return data to serialize back to the client.
(Throughout this guide the Resolver argument is named `x`, but the name doesn't
really matter.) The resolved data can be in almost any format; strings are
serialized as plaintext and JavaScript values are serialized as JSON. For
example, the following RPC always responds with a JSON content type:

```ts
rpc({ resolve: x => ({ hello: "world" }) });
// Content-Type: "application/json"
// Body: `{"hello":"world"}`
```

Cav can also automatically serialize most non-JSON JavaScript primitives, like
Maps, Sets, Dates, etc. Further, referential equality will be maintained through
the serialization process. The resulting JSON can be deserialized using the
top-level `deserialize()` function. (Deserialization is automatic when using the
isomorphic `client()` function. More on that later.)

```ts
rpc({
  resolve: x => {
    const now = new Date();
    const map = new Map([undefined, now]);
    return { now, map };
  },
});

// Content-Type: "application/json"
// Body (pretty printed): ```
// {
//   "now": { "$date": "2022-05-09T08:14:16.485Z" },
//   "map": {
//     "$map":[
//       { "$undefined": null },
//       { "$ref": ".now" }
//     ]
//   }
// }
```