# WC-2026-08-11-vector-tag-badges — the inline-tag badge is a PURE VECTOR SVG, no longer an SVG embedding a base64 PNG sprite

- **Date:** 2026-08-11 (reported as "edit mode of a tag-heavy record takes ~4s";
  traced to badge rendering, not to the server).
- **Decision:** none standing — a rendering-cost fix; the badge look is
  unchanged.
- **Shape before (TS, the PHP port):** `core/component_text_area/tag/index.php`
  composited each badge in GD from a per-type/-state base sprite, and the TS
  port reproduced it by embedding that SAME sprite PNG in the served SVG
  (`src/core/components/component_text_area/tag_render.ts`):
  `<image width="W" height="30" xlink:href="data:image/png;base64,…"/>` plus the
  label `<text>`. The 20 sprites lived in the component's own `tag_base/` folder
  (~80KB).
- **Shape after (TS):** the same badge DRAWN — a `<rect>`/`<path>` pill plus one
  `<path>` icon, then the same `<text>`. No `<image>`, no data-URI, no `xlink`
  namespace, no `node:fs` at module init; `tag_base/` is deleted.
  Everything the consumer can observe is unchanged:
  - **same native box** per type — `width`/`height`/`viewBox` stay `2W x 30`
    (tc 164, index 68, geo/page/draw 76, person 144, lang 100, note 44). This is
    load-bearing: the client sizes the `<img>` `width:auto; height:15px`
    (`component_text_area.less`), so the intrinsic width comes from the SVG.
  - **same colours** — each shape carries its sprite's sampled fill, including
    the palette DRIFT the sprites carry (index/geo/page/lang on the
    WC-2026-08-02 `#ffab01` / `#fc461a` / `#2f8fff`; `draw-d` still `#3e8fed`,
    person `#ffaa00`, note `#ffaa00` / `#44b941`). Re-colouring those is a
    separate, deliberate change, not a side effect of this one.
  - **same label placement** — the WC-2026-08-02 machinery is untouched
    (`offsetX`/`offsetXFor`/`offsetY`/`vCenter`/`fontSize`/`fontWeight`;
    index still `x=27` in / `x=40` out, `y=15` central, black on every state).
  - **same endpoint contract for the `?id=` grammar** — `image/svg+xml`,
    content-hashed ETag; the id grammar is untouched, so tags stay draggable in
    CKEditor. The CACHE policy did change, deliberately — see "Cache" below.
  The vectors were fitted against the sprites they replace and verified by
  re-rasterising and diffing against the PNG alpha: mean absolute error
  0.0005–0.0043 per shape (`lang`'s 乂 crossing is the loose one, 0.028).
- **Reason:** the cost is per-DOCUMENT, and caching cannot touch it. Each tag is
  an `<img>` with a unique URL, so Chrome builds one isolated SVG image document
  per badge: SVG parse + sub-fetch of the inner data:PNG + PNG decode + a full
  document lifecycle, all on the main thread. Entering edit mode on rsc167/1
  (≈330 tags) built 328 such documents ≈ 26k sub-millisecond tasks ≈ 4s of
  blocked main thread — re-paid on every entry, because document construction is
  not what an immutable cache saves. Isolated A/B, 330 badges, same page, cold:
  embedded-PNG **1474ms total / 1256ms main-thread blocking** vs pure vector
  **699ms total / 0ms blocking chunks**. The server was never the bottleneck
  (section read ≈360ms; the tag endpoint answers in 3ms).
- **Gate reconciliation:** `test/unit/text_area_tag_grammar.test.ts` — the
  renderer gates flipped from pinning the embedded-PNG shape
  (`xlink:href="data:image/png;base64,"`) to pinning the vector one: no
  `<image>`, no `data:image`, no `xlink` anywhere in the output; the per-type
  `viewBox`/`width`/`height` assertions stay; the index pill fill is pinned per
  state AND per direction (a fill regression on one mirror only is otherwise
  invisible); the label assertions read the extracted `<text>` element, so a
  colour can no longer be satisfied by a shape's fill.
  The deleted PNG assertion also proved, cheaply, that the sprite carrying the
  ICON was there; a drawn badge splits pill and icon, so **all 20 shapes (7
  sprite types × state/direction + the 3 draw states) now pin their exact drawn
  elements** — how many, in paint order, each with its fill, its identifying
  path head and any `fill-rule`/`transform` it needs (`geo` without `evenodd`
  fills the pin's hole; `lang` without its fit transforms lands the glyphs
  elsewhere). Mutation-verified: dropping the pin, the page document, the person
  bust, the note bubble or a lang transform, emptying `EVENODD`, or re-anchoring
  the eye each turns the file red (before, all of those were green).
  `assertWellFormed` (the font-family quote guard) and the SEC-028 escaping test
  are unchanged.
  **No re-harvest needed:** the frozen oracle store carries no badge bytes — the
  endpoint returns an image, and the fixtures that mention tags pin the `<img
  src>` GRAMMAR (`?id=[index-n-116-]`), which is untouched.

## Cache: `immutable` moved to a version-addressed url

The old policy served EVERY badge `public, max-age=31536000, immutable`. That is
false for a version-free url: the bytes are a function of the id *and* of
`tag_render.ts`, and this entry is the proof that the renderer changes. A browser
that had already drawn a badge would therefore keep the embedded-PNG one for up
to a year — i.e. the fix would never reach the tag-heavy record that reported it,
because `immutable` suppresses revalidation even on a normal reload and the
content-hashed ETag is never consulted. Two coordinated changes:

- **Client** (`client/dedalo/core/common/js/tr.js`,
  `client/dedalo/core/component_text_area/js/component_text_area.js`): every
  DETERMINISTIC badge src now carries the renderer fingerprint,
  `?id=<tag>&v=<tr.tag_badge_version>` (currently `b948b27e`). The url changes
  when the drawing changes, so a redraw is a cache MISS instead of a year-old
  hit. The `?id=` grammar itself is untouched, the token is never interpreted by
  the endpoint, and `preprocess_text_to_save` rebuilds bracket tokens from
  `data-*` only — the src never round-trips into stored data. The `svg`/locator
  tag is left unversioned: it is a media redirect, not a drawn badge.
- **Server** (`tag_endpoint.ts`): `immutable` is now served only when the request
  carries a non-empty `v` (the url is version-addressed and the promise is true).
  A bare `?id=` — stored `<img src>` HTML, list/diffusion emit, older clients —
  gets `public, max-age=3600, must-revalidate`, so it self-heals on the next
  renderer change at the cost of one content-hashed 304 (~3ms) per hour.

The token is not a manual convention: `text_area_tag_grammar.test.ts` computes
the fingerprint (FNV-1a over all 20 rendered badges) and asserts `tr.js` declares
exactly it, that every badge src goes through `badge_src` (the only bare
`${tag_url}` left is the svg redirect), and that the editor's insert path uses the
same token. Change any geometry and the gate fails with the value to paste in.
