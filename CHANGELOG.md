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
  '/index.html' were removed, and requests to '.html' files don't auto redirect
  anymore either
- Moved the browser TS reference comments to `dom.ts` and added some selector
  shorthands `$` and `$$`
- If an endpoint resolver returns a string that begins with optional whitespace
  and then `<!DOCTYPE html>`, it'll automatically set the content-type to be
  html unless the content-type was already explicitly set
- Fixed a bug where the route "/" wasn't working properly
- Fixed a bug where `bundle.ts(x)` wasn't being watched for file creation or
  modification events in asset bundling
- Fixed a few client bugs with URL formation
- Resolvers are no longer assigned to endpoints as the `resolve` property
- Endpoints now require both a schema and a resolver to be specified explicitly
- Change `ResolveArg` to `ResolverArg`

## June 16, 2022: [0.1.0](https://deno.land/x/cav@0.1.0)

Stuff's workin'. See https://deno.land/x/cav@0.1.0/mod.ts