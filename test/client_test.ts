// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { assertEquals } from "./deps_test.ts";
import { client } from "../client.ts";
import type {
  EndpointRequest,
  EndpointResponse,
  RouterRequest,
} from "../client.ts";

Deno.test("client fetch", async t => {
  // Setup
  const oldFetch = self.fetch; // Put it back when you're done
  const lastFetch = {
    url: "",
    init: undefined as RequestInit | undefined,
  };
  let returnResponse = new Response();
  self.fetch = (url, init) => {
    lastFetch.url = url as string;
    lastFetch.init = init;
    return new Promise(resolve => resolve(returnResponse));
  };

  await t.step("A: bare endpoint", async () => {
    type Endpoint = (req: EndpointRequest) => EndpointResponse<true>;
    returnResponse = new Response("true", {
      headers: { "content-type": "application/json" },
    });
    const response = await client<Endpoint>("http://localhost/base")({});
    assertEquals(lastFetch, {
      url: "http://localhost/base",
      init: {
        method: "GET",
        headers: {},
        body: null,
      },
    });
    assertEquals(response, true);
  });

  await t.step("B: endpoint with query", async () => {
    type Endpoint = (
      req: EndpointRequest<{ query: "b" }>,
    ) => EndpointResponse<Error>;

    returnResponse = new Response(`{"$error":"b"}`, {
      headers: { "content-type": "application/json" },
    });
    const response = await client<Endpoint>("http://localhost/base")({
      query: {
        query: "b",
      },
    });
    assertEquals(lastFetch, {
      url: "http://localhost/base?query=b",
      init: {
        method: "GET",
        headers: {},
        body: null,
      },
    });
    assertEquals(response, new Error("b"));
  });

  await t.step("C: endpoint with query and message", async () => {
    type Endpoint = (req: EndpointRequest<
      { query: "c" },
      { message: Date }
    >) => EndpointResponse<undefined>;

    const date = new Date();
    returnResponse = new Response(null);
    const response = await client<Endpoint>("http://localhost/base")({
      query: { query: "c" },
      message: { message: date },
    });
    assertEquals(lastFetch, {
      url: "http://localhost/base?query=c",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: `{"message":{"$date":"${date.toJSON()}"}}`,
      },
    });
    assertEquals(response, undefined);
  });

  await t.step("D: router with two endpoints, one is nested", async () => {
    type Router = (req: RouterRequest<{
      one: (req: EndpointRequest) => EndpointResponse<"yes">;
      two: (req: RouterRequest<{
        three: (req: EndpointRequest<
          { four: "five" },
          { six: "seven" }
        >) =>  EndpointResponse<"no">;
      }>) => Response;
    }>) => Response;

    returnResponse = new Response("yes");
    const response1 = await client<Router>("http://localhost/base").one({});
    assertEquals(lastFetch, {
      url: "http://localhost/base/one",
      init: {
        method: "GET",
        headers: {},
        body: null,
      },
    });
    assertEquals(response1, "yes");
    
    returnResponse = new Response("no");
    const response2 = await client<Router>("http://localhost/base")
      .two.three({
        query: { four: "five" },
        message: { six: "seven" },
      });
    assertEquals(lastFetch, {
      url: "http://localhost/base/two/three?four=five",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: `{"six":"seven"}`,
      },
    });
    assertEquals(response2, "no");
  });

  // All done, put the fetch back
  self.fetch = oldFetch;
});
