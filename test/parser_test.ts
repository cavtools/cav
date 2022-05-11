// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import {
  AnyParser,
  Parser,
  ParserFunction,
  ParserInput,
  ParserObject,
  ParserOutput,
} from "../parser.ts";

// There's nothing real to test here, so I'm just doing some typescript tests
// that won't compile if the Parser types aren't behaving correctly

// Parsers can be regular input => output functions
((x: unknown) => x) as Parser;
((x: unknown) => x) as ParserFunction;

// Or they can be objects with a "parse" property that's a ParserFunction
({ parse: (x: unknown) => x }) as Parser;
({ parse: (x: unknown) => x }) as ParserObject;

// Non-parsers don't match
true as ({ notParse: (_: string) => string }) extends Parser ? null : boolean;
true as ((_: never) => boolean) extends Parser ? null : boolean;

// The input/output types of the Parser match the arg/return types of the fn
({ parse: (_: boolean) => 1234 }) as Parser<boolean, number>;
({ parse: (_: boolean) => 1234 }) as ParserObject<boolean, number>;
((_: string) => ({ hello: "world" })) as Parser<string, { hello: string }>;
((_: string) => ({ hello: "world" })) as ParserFunction<string, {
  hello: string;
}>;

// The ParserInput and ParserOutput types extract correctly
({ input: null }) as ParserInput<Parser<{ input: null }, null>>;
({ output: null }) as ParserOutput<Parser<null, { output: null }>>;

// The AnyParser type matches any Parser, but not a non-Parser
({}) as Parser<true, false> as AnyParser;
({}) as Parser<{ hello: "world" }, Map<null, Date>> as AnyParser;
true as boolean extends AnyParser ? null : boolean;
true as Record<never, never> extends AnyParser ? null : boolean;