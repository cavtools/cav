// Copyright 2022 Connor Logan. All rights reserved. MIT License.

import { serve, router, assets } from "./deps.ts";

const mainRouter = router({
  "*": assets(),
});

serve(mainRouter, { port: 8080 });
console.log("listening on port 8080");