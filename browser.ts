// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

/// <reference lib="dom" />

export * from "./client.ts";
export * from "./pack.ts";

// idk where else to put these next utilities yet, but I hate the idea of making
// them for every project so they're going in here for now

// Note: The <style> should come before the <slot> in the template, so that it
// can be overridden TODO: Test that claim...
const shadowRootTemplate = document.createElement("template");
shadowRootTemplate.innerHTML = `
  <style>:host { display: block; }</style>
  <slot></slot>
`;

/**
 * The `<shadow-root>` custom element simply slots its content into a
 * `ShadowRoot`, making it easy to define scoped styles for a component
 * alongside its template html. Additionally, `display: block;` is applied to
 * the `:host{}`, overriding the default of `display: inline;` applied to all
 * custom elements. (Thanks,
 * [Apple](https://github.com/WICG/webcomponents/issues/224#issuecomment-193982703).)
 *
 * ```html
 * <shadow-root type="app">
 *   <!-- The type="app" has no effect, it's only for easy identification -->
 *
 *   <h1>App</h1>
 *
 *   <!-- Scoped styles. These only affect the contents of this component -->
 *   <link rel="stylesheet" href="https://rsms.me/inter/inter.css">
 *   <style>
 *     h1 {
 *       font-family: "Inter var", sans-serif;
 *       font-weight: 900;
 *     }
 *   </style>
 * </shadow-root>
 * ```
 *
 * To get this element to work in preact/react, you'll need to modify the
 * IntrinsicElements interface that's exported by the jsx-runtime module used by
 * your project. Tip: Do it in the deps.ts. Here's an example:
 *
 * ```ts
 * // deps.ts
 *
 * export * from "https://esm.sh/preact";
 * export * from "https://esm.sh/preact/hooks";
 * export type { Ref } from "https://esm.sh/preact"; // Resolves conflict
 * 
 * // Assuming you were using @jsxImportSource https://esm.sh/preact
 * declare module "https://esm.sh/preact/jsx-runtime" {
 *   namespace JSX {
 *     export interface IntrinsicElements {
 *       "shadow-root": HTMLAttributes<HTMLElement>;
 *     }
 *   }
 * }
 * ```
 * 
 * Yes, this is obnoxious. Alternatives are being sought.
 */
export class ShadowRootElement extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.append(shadowRootTemplate.content.cloneNode(true));
  }
}

if (self.customElements) {
  customElements.define("shadow-root", ShadowRootElement);
}

// TODO: https://www.npmjs.com/package/classnames

/**
 * Filters non-string values from the provided arguments and joins the remaining
 * strings with a space separator. Useful for declaratively toggling CSS
 * classes.
 *
 * ```jsx
 * import { cx } from "https://deno.land/x/preact/mod.ts";
 *
 * function App() {
 *   const [ego, setEgo] = useState(0);
 *
 *   return (
 *     <button
 *       class={cx(
 *         "button",
 *         ego <= 5 && "font-xs",
 *         ego > 5 && ego <= 10 && "font-sm",
 *         ego > 10 && ego <= 15 && "font-md",
 *         ego > 15 && ego <= 20 && "font-lg",
 *         ego > 20 && "font-xl",
 *       )}
 *       onClick={() => setEgo(ego + 1)}
 *     >
 *      {ego <= 20 && `Inflate my ego: ${ego}`}
 *      {ego > 20 && "I am God."}
 *     </button>
 *   );
 * }
 * ```
 * 
 * NOTE: This is not part of the standard Preact API
 */
export function cx(...classes: unknown[]): string {
  return classes.filter(c => !!c && typeof c === "string").join(" ");
}
