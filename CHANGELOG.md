# Changelog

## Up next: [0.2.0](https://deno.land/x/cav@0.2.0)

- Added the `encodeCookie()` and `decodeCookie()` exports to cookies.ts, removed
  the `COOKIE_JWT_HEADER`. Also changed some `const` functions into regular
  functions. Cav shouldn't have any more variables in the Deno Docs
- When serving assets without an explicit asset `path` specified, the
  `serveAsset()` function will now use the routed path from the RouterContext
  instead of the full request path
- When no `path` option is specified for `serveAsset`, all requests to files
  beginning with a '.' will 404. Auto redirects for '/index.html' were removed,
  and requests to '.html' files don't auto redirect anymore either
- Moved the browser exports to `dom.ts` and added some selector shorthands `$`
  and `$$`
- Resolvers are no longer assigned to endpoints as the `resolve` property
- Updated the cookies to better handle signed/unsigned operations
- HttpErrors thrown during query/message parsing are passed along instead of
  being wrapped in a 400 HttpError
- Modified client type to treat "*" correctly (it treated it like a path param,
  but it doesn't consume path parts)
- Various other e2e bug fixes
- Changed endpoint `message`s to `body`s
- Changed endpoint `groups` to `params`
- Params can only be strings (used to allow string[] also). Duplicate params
  will override old values
- No more plural(s) in module names (besides deps)
- When a string is specified on a router, it'll serve that string with a
  content-type based on the extension of the route. If there isn't an extension,
  it defaults to html. Supported extensions are: .html, .md, .css, .json, .js, .svg, .txt, .rss, .xml,
- Removed the old asset bundling, which bundled all ts(x) files in the assets
  directory
- Added the `bundle` endpoint type and related utility functions
- Managed to get the resolver and setup function to fit onto the schemas without
  breaking the types (!!!! "the big problem". Haven't tested this fully yet, it might not be working lol. This problem has been hard for me)
- Whenever Cav sets a content-type of "text/*", it also sets the "utf-8"
  charset. This applies for static string routes and asset files

## June 16, 2022: [0.1.0](https://deno.land/x/cav@0.1.0)

Stuff's workin'. See https://deno.land/x/cav@0.1.0/mod.ts