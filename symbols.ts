// Copyright 2022 Connor Logan. All rights reserved. MIT License.

/**
 * Symbol used by the client for infering the response type. Use it like this:
 * 
 * ```ts
 * // Server
 * interface CustomResponse {
 *   [_response]: 
 * }
 * 
 * function customHandler(req: Request) {
 *   
 * }
 * ```
 */
export const _response = Symbol("cav_response");

/**
 * 
 */
export const _query = Symbol("cav_query");

/**
 * 
 */
export const _message = Symbol("cav_message");
