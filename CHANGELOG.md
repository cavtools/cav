# Changelog

## Up next: [0.2.0](https://deno.land/x/cav@0.2.0)

- Removed the COOKIE_JWT_HEADER and added the `encodeCookie()` and
  `decodeCookie()` exports to cookies.ts
- When serving assets without an explicit asset `path` specified, the
  `serveAsset()` function will now use the routed path from the RouterContext
  instead of the full request path and activate the special asset serving rules
- No more automatic redirects for requests to ".../index.html"
- Requests to ".ts(x)" assets imply a trailing ".js" when searching for the file
  to serve

## June 16, 2022: [0.1.0](https://deno.land/x/cav@0.1.0)

TODO: Baby steps. Here's the functions Cav is starting with, and the purpose
they serve: