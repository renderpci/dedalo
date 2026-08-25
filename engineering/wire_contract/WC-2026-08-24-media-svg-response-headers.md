# WC-2026-08-24-media-svg-response-headers — the production media origin stops serving uploaded SVG as active content

- **Date:** 2026-08-24.
- **Decision:** the GENERATED Apache/nginx rules now emit MEDIA-03 response
  headers, from the same definition the Bun media route uses. A media response
  therefore carries `X-Content-Type-Options`, and an SVG response carries a
  `Content-Security-Policy` and — for the uploader-supplied population — a
  `Content-Disposition: attachment`, in the documented production topology and
  in EVERY mode including `off`.

## Why

SVG is the one image format that is also a DOCUMENT: it carries `<script>`,
inline event handlers, `<foreignObject>` and SMIL animation targets. The media
origin is the APPLICATION origin, and `component_svg` accepts `.svg` uploads
(`DEDALO_SVG_EXTENSIONS_SUPPORTED`), which are stored verbatim. The generated
rules blocked script EXTENSIONS (`.php`, `.cgi`, …) and emitted no headers at
all, so an uploaded SVG was served inline, same-origin, with nothing stopping
it — stored XSS against a curator's session, driven by anyone who can upload.

This is not a new discovery. `SECURITY_DECISIONS.md` DECISION 2 ("MEDIA-03
refined close", 2026-07-10) worked the answer out in full and closed it for the
Bun dev/fallback route only, ending with: *"the production nginx/.htaccess
template must mirror the two path-scoped rules when it lands."* It never
landed. `src/server.ts` ledgered the gap honestly for six weeks
("HONEST SCOPE … these guarantees do not hold there"). This entry is that
sentence being paid.

## Shape before

- `.htaccess` / `dedalo_media_protection.nginx.conf`: access control only, no
  header directives. `.svg`, `.xml`, `.html`, `.swf` all served, inline, bare.
- `dedalo_media_protection_map.nginx.conf`: the cookie-sanitizing `map` only,
  no config hash, **written only when absent** (documented as static).
- The two CSP strings and the selection rule existed once, inline, in
  `src/server.ts mediaSvgSafetyHeaders()`.

## Shape after

Two populations, opposite treatment, ONE definition
(`src/core/media/svg_safety.ts`, consumed by the route AND both generators):

| population | Content-Disposition | Content-Security-Policy |
|---|---|---|
| server-generated image envelope (`<imageFolder>/…/svg/…/*.svg`) | *(none — stays inline)* | `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'` |
| every other `.svg` / `.xml` / `.xsl` / `.xslt` | `attachment` | `default-src 'none'; sandbox` |
| anything else | *(none)* | *(none)* |

`X-Content-Type-Options: nosniff` is emitted for the WHOLE media root.
`html|htm|xhtml|xht|shtml|swf|hta` are DENIED outright (no media model's
`allowedExtensions` contains one).

The envelope stays inline because the client embeds it through
`<object type="image/svg+xml">` and needs same-origin `contentDocument` access
(quality switch, vector editor) plus the same-origin raster `<image>` fetch;
`attachment` or a CSP `sandbox` blanks the edit view. `script-src 'none'` is
what makes it safe without an opaque origin.

## What an operator must do

- **nginx: re-include the map file and reload.** The map now carries a config
  hash, is rewritten on drift, and defines `$dedalo_svg_disposition` /
  `$dedalo_svg_csp` which the server block references. An install that reloads
  with an OLD map gets `unknown "dedalo_svg_csp" variable` and nginx refuses to
  start. The maintenance widget says so when the map is stale.
- **Apache: nothing.** `.htaccess` is read per request. An install without
  `mod_headers` will start refusing raw `.svg`/`.xml` (fail closed, by design —
  see below); enabling `mod_headers` restores serving them as downloads.
- `TEMPLATE_VERSION` 2 → 3, so every install regenerates all three files.

## Refusals and their reasons

- **Uploaded SVG is NOT refused and NOT sanitized.** Refusing a curator's
  vector file is data loss — a heritage archive legitimately holds files it did
  not author — and sanitizing SVG is lossy and unverifiable. The serving-side
  quarantine is what makes such a file inert; an active-content upload is
  NOTICED in the log (`verify_content.ts`) so it can be found, never rejected.
  The engine-written envelope is a different population and IS refused
  (`svg_overlay.ts ENVELOPE_REFUSALS`, now shared from `svg_safety.ts`).
- **`.xml` is quarantined, not denied.** A finding aid is legitimate data.
- **Headers may not fail open.** Without `mod_headers` Apache cannot emit the
  CSP, so that branch DENIES the quarantine population instead of serving it
  inline unprotected (the envelope, whose bytes come from a fixed template,
  stays granted). An install in that state loses a download, never a guarantee.

## Gate

`test/unit/media_protection_tripwire.test.ts` — a FOURTH lockstep axis. The
envelope and quarantine patterns are pulled back OUT of the generated Apache
text and the generated nginx maps, compiled, and asserted to classify a table
of real paths exactly as `mediaSvgSafetyHeaders()` does; plus the nginx map
ORDER (envelope first), every byte-serving location carrying the full header
set in every mode, the `!mod_headers` fail-closed branch, the `<If>`-after-
`<FilesMatch>` merge order, and the map's config hash. Mutation-verified: the
naive envelope pattern (anchoring the file directly inside `svg/`, which
matches no real envelope) turns the gate red.

HONEST LIMIT: it proves the PATTERNS, not Apache's and nginx's engines.

**Both engines were then run for real** (2026-08-24, Apache 2.4.66 + nginx, the
curl matrix in `engineering/MEDIA_PROTECTION.md` §9 over a scratch media tree
built from the ACTUALLY GENERATED rule files). They agree on every row, and the
run found one defect no pattern gate could: the active-document deny was
`Require all denied`, which answers **403** — confirming the file exists, against
this subsystem's "deny as 404, never 403" rule. In a `.htaccess` mod_rewrite runs
at FIXUP, after authorization, so the authz denial answered first. It is now a
`RewriteRule … [R=404,L]`; both engines answer 404.


## Addendum, same day — the app CSP's two embed directives now agree

Found by opening a real image edit view on this project's SPLIT-ORIGIN install
(app on `:3500`, media on `http://localhost:8080/dedalo/media`):

```
Framing 'http://localhost:8080/' violates the following Content Security Policy
directive: "frame-src 'self' blob:". The request has been blocked.
```

**Cause.** `component_image`'s edit view hosts the envelope as
`<object type="image/svg+xml">`. An `<object>` that loads a document opens a
NESTED BROWSING CONTEXT, and Chrome checks that against **`frame-src`**, not only
`object-src`. The policy admitted the envelope prefix in `object-src` alone, so
on any split-origin install the envelope was blocked and every image in the edit
view rendered blank — the exact symptom `object-src 'none'` had produced before
`MEDIA_CSP_OBJECT_SOURCE` was introduced. Pre-existing (the CSP file predates
this session's work), and invisible until now.

**Fix.** One source, `MEDIA_CSP_EMBED_SOURCE`, feeding both directives through a
pure `buildEmbedDirectives()`. Still path-scoped to the image folder — never the
bare media host — so the uploader-supplied population under `svg/` is excluded.

**Why this is safe to frame now, and was not before.** The old comment on that
constant justified itself with "a split-origin media host … emits no CSP, no
`sandbox` and no `Content-Disposition` — the MEDIA-03 safety headers exist only
on the Bun dev/fallback media route". That sentence is what the main entry above
made false: the generated rules now emit the envelope's own `script-src 'none'`
CSP and hand every other SVG over sandboxed as an `attachment`, so the framed
document is inert at the media origin too.

**Why no gate caught it.** Under `bun test` media is SAME-ORIGIN, so
`MEDIA_CSP_EMBED_SOURCE` is `''` and every split-origin assertion in
`xss_csp_tripwire` was vacuous — the pre-existing `object-src` case had the same
blind spot. The directives are therefore built by a PURE function that the gate
drives with a synthetic off-origin source, box-independently. Mutation-verified:
dropping the source from `frame-src` (i.e. restoring the bug) turns it red.

**Residual, unrelated to CSP and NOT fixed here:** on a split-origin install the
parent page cannot reach the envelope's `contentDocument` at all — it is
cross-origin, so the access is impossible whatever the policy says (measured:
`contentDocument` is null). The quality switch and vector editor that DECISION 2
records as needing same-origin `contentDocument` are therefore degraded on such
installs by construction. Same-origin media (the default topology) is unaffected.
