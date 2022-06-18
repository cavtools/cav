# Changelog

## Up next: [0.2.0](https://deno.land/x/cav@0.2.0)

- Removed the COOKIE_JWT_HEADER and added the `encodeCookie()` and
  `decodeCookie()` exports to cookies.ts
- When serving assets without an explicit asset `path` specified, the
  `serveAsset()` function will now use the routed path from the RouterContext
  instead of the full request path
- When no `path` option is specified for `serveAsset`, special rules activate,
  like: all requests to files beginning with a '.' will 404, and all requests to
  '.ts(x)' files will imply a trailing '.js' extension. Auto redirects for
  '/index.html' were removed, and requests to '.html' files also don't auto
  redirect anymore
- Moved the browser TS reference comments to `dom.ts` and added some selector
  shorthands `$` and `$$`
- If an endpoint resolver returns a string that begins with optional whitespace
  and then `<!DOCTYPE html>`, it'll automatically set the content-type to be
  html unless the content-type was already explicitly set
- Fixed a bug where the route "/" wasn't allowed but it should've been

TODO:

- Provide a way to do etagging with non-asset responses

## June 16, 2022: [0.1.0](https://deno.land/x/cav@0.1.0)

TODO: Baby steps. Here's the functions Cav is starting with, and the purpose
they serve: