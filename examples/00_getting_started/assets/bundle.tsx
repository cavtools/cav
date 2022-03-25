// <root>/assets/bundle.tsx
// This module is browser-only.

/** @jsxImportSource https://esm.sh/preact */
import { App } from "../app.tsx";
import { render } from "../preact.ts";

render(<App />, document.body);