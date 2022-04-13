// Copyright 2022 Connor Logan. All rights reserved. MIT License.
// This module is browser-only.

/// <reference lib="dom" />

const componentTemplate = document.createElement("template");
componentTemplate.innerHTML = `
  <style>:host { display: block; }</style>
  <slot></slot>
`; // Note: The <style> should come before the <slot>

/**
 * This custom element simply slots its content into a shadowRoot, making it
 * easy to define scoped styles for a component alongside its template html.
 * Additionally, `display: block;` is applied to the `:host{}`, overriding the
 * default of `display: inline;` applied to all custom elements. (Thanks,
 * [Apple](https://github.com/WICG/webcomponents/issues/224#issuecomment-193982703).)
 *
 * ```html
 * <shadow-root type="app">
 *   <!-- The type="app" has no effect, it's only for display purposes -->
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
 */
export class ShadowRootElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.append(componentTemplate.content.cloneNode(true));
  }
}

customElements.define("shadow-root", ShadowRootElement);
