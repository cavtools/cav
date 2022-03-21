// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

/**
 * An object or function responsible for parsing data or throwing errors if the
 * data isn't shaped as expected. These can either be functions with a single
 * data argument that return the parsed data or an object with a `parse(data):
 * unknown` function that does the same. Parsers can be asynchronous.
 */
 export type Parser<I = any, O = any> = (
  | ParserFunction<I, O>
  | ParserObject<I, O>
);

/**
 * A function that parses data. If data is not shaped as expected, an error
 * should be thrown.
 */
export interface ParserFunction<I = any, O = any> {
  (input: I): Promise<O> | O;
}

/** An object with a ParserFunction as its "parse" property. Zod compatible. */
export interface ParserObject<I = any, O = any> {
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
    : T extends Parser<any, infer O> ? O
    : never
);

/** Normalizes a Parser into a ParserFunction. */
export function normalizeParser<I = any, O = any>(
  parser: Parser<I, O>,
): ParserFunction<I, O> {
  return (
    typeof parser === "function" ? parser
    : parser.parse
  );
}