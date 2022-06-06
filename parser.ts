// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

// TODO: Several type constraints are more permissive than they should be, for
// example query parsers should constrain to Parser<Record<string, string |
// string[]>>. Further, the Any types (like AnyParser, AnyEndpointSchema, etc.)
// probably don't need to exist, but I'm not positive. I should get everything
// tested before I try to fix these things

/**
 * An object or function responsible for parsing data or throwing errors if the
 * data isn't shaped as expected. These can either be functions with a single
 * data argument that return the parsed data or an object with a `parse(data):
 * unknown` function that does the same. Parsers can be asynchronous.
 */
 export type Parser<I = unknown, O = unknown> = (
  | ParserFunction<I, O>
  | ParserObject<I, O>
);

/**
 * Matches any kind of parser. Useful for type constraints.
 */
// deno-lint-ignore no-explicit-any
export type AnyParser = Parser<any, any>;

/**
 * A function that parses data. If data is not shaped as expected, an error
 * should be thrown.
 */
export interface ParserFunction<I = unknown, O = unknown> {
  (input: I): Promise<O> | O;
}

/** An object with a ParserFunction as its "parse" property. Zod compatible. */
export interface ParserObject<I = unknown, O = unknown> {
  parse(input: I): Promise<O> | O;
}

/** Extracts the input type of a given Parser. */
export type ParserInput<T> = (
  T extends { _input: infer I } ? I // zod
    : T extends Parser<infer I> ? I
    : never
);

/** Extracts the output type of a given Parser. */
export type ParserOutput<T> = (
  T extends { _output: infer O } ? O // zod
    : T extends Parser<unknown, infer O> ? O
    : never
);

/** Normalizes a Parser into a ParserFunction. */
export function normalizeParser<
  I = unknown,
  O = unknown,
>(parser: Parser<I, O>): ParserFunction<I, O> {
  return (
    typeof parser === "function" ? parser
    : parser.parse
  );
}