// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-compatible.

/**
 * An object or function responsible for parsing data or throwing errors if the
 * data isn't shaped as expected. These can either be functions with a single
 * data argument that return the parsed data or an object with a `parse(data):
 * unknown` function property that does the same. Cav is specifically tuned to
 * be compatible with (but not dependent on) Zod, a schema-based data parsing
 * library. However, any parsing library can be used, as long as its parsers
 * satisfy this Parser interface. (Let me know if more shapes should be
 * supported in a github issue.) You can also write strongly-typed parsing
 * functions and objects by hand if you don't want to use a third-party parsing
 * library.
 *
 * To read more about Zod, visit https://github.com/colinhacks/zod.
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
