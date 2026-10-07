# tool_numisdata_acquisition

Imports coin-auction lots from a pasted public URL (jesusvico.com, biddr.com, aureo.com,
numisbids.com, sixbid.com) into Numismatic Object (`numisdata4`) records, with an operator review
step before anything is written, Auction/Type resolution, and obverse/reverse image import.

## What it does / why & when to use it

`tool_numisdata_acquisition` is a three-action, preview-then-commit acquisition tool: `preview_url`
fetches and parses a public auction page (nothing written yet); `preview_html` does the same against
HTML the operator's own browser already fetched, for a source that blocks automated retrieval;
`commit_lots` creates one `numisdata4` record per kept lot, resolving/linking its Auction
(`numisdata224`) and Type (`numisdata3`), and importing its photo via the shared `cropCoinPair`
obverse/reverse splitter.

Use it to bulk-catalogue lots from a live or past auction at one of the five supported houses,
reviewed and curated before any record is created. For bibliographic data from a journal instead of
numismatic auction lots, the sibling tool is [tool_bibliography_acquisition](tool_bibliography_acquisition.md)
— same shape, different domain, no shared code.

Key behaviours to know:

- **Nothing is written until Confirm.** `preview_url`/`preview_html` only fetch and parse; the
  operator curates the checklist client-side, and only `commit_lots` creates records.
- **A lot already imported is skipped, not duplicated.** `commit_lots` matches each lot by
  (Auction, Inventory number) where it has both, and by its CANONICAL lot URL (stored in the
  `numisdata275` URI field) where its source adapter can rebuild one from the lot's own identity —
  each under its own advisory lock before creating it. The URL key covers the lots the first one cannot: search-batch
  lots, a lot whose auction did not resolve, a lot with no number. Re-committing the same batch
  reports the pre-existing `section_id` with `skipped: true` and attempts nothing else for it.
- **The Type link only ever points to an EXISTING `numisdata3` record** — a shared scholarly
  classification (Mint/Denomination cross-links, weight/diameter averages computed across every
  linked object). A catalog citation parsed from the description is matched against the Catalogues
  this instance currently curates; a citation with no match is reported, never fabricated as a new
  Type.
- **Auction/Entity resolution never writes free text.** The Company field (`numisdata228`) is a
  real relation to an Entity (`rsc106`), resolved via the client's search-or-create picker (or an
  automatic exact-name match-or-create fallback when no picker ran, e.g. a per-lot override — see
  below); the scraped auction-house string is never written straight into it.
- **Both fetch actions are gated `permission: 'targets'`, not `'section'`**, on a fixed target
  (`{section_tipo: 'numisdata4'}') regardless of what `options.section_tipo` the client sends — the
  handler always parses against `numisdata4`, so gating on the client's own field would let any
  user who can read *any* section trigger a live outbound fetch.
- **`commit_lots` runs in the background and honors the cancel signal.** It checks
  `context.signal?.aborted` at the top of each lot's loop iteration and **breaks** (not throws) —
  the lot already in flight finishes or rolls back cleanly, and the response's `stopped: true` plus
  `lots_total` lets the client report "stopped after N of M" rather than silently truncating.

## How it works

### Server

`tools/tool_numisdata_acquisition/server/index.ts` declares three API actions:

1. **`preview_url(context)`.** Reads `options.url`, picks the matching `SourceAdapter` by
   `matchesUrl` (refusing with `request.invalid_options` if none matches), and calls
   `adapter.acquire(url, onProgress)` — a multi-page fetch for sources that allow automated
   retrieval, reporting page-by-page progress via `context.publishProgress`. The first page is
   parsed with `adapter.parseAuction`; every page's lots are parsed with `adapter.parseLots` and
   capped at `MAX_LOTS` (3000), reporting how many were truncated. A read-only
   `checkExistingAuctionStatus` then looks up the auction (by exact-name Entity match, then exact
   (Entity, Code) match) so the review screen can show "will link" vs "will create" before the
   operator commits to anything. Returns `{auction, lots, auction_status, lots_truncated_by}`.
2. **`preview_html(context)`.** The fallback for a source whose own defenses block automated
   retrieval outright (confirmed live for numisbids.com: HTTP 403 from multiple independent
   networks) or that serves a bot-challenge page instead of the real one. Takes `options.url` **and**
   `options.html` — HTML the operator's own browser already retrieved, parsed in memory and never
   written to disk. Single-page only (no live fetch here to drive a pagination walk — a multi-page
   auction needs one call per page). Still validates the URL is `https://` even though nothing is
   fetched, and runs the same `checkExistingAuctionStatus` lookup as `preview_url`.
3. **`commit_lots(context)`.** Reads `options.lots` (the curated array from a preview response,
   `MAX_LOTS`-capped, refusing a larger batch outright rather than silently trimming a write action),
   `options.auction` (the batch's `ExtractedAuction`, unmodified from preview), and
   `options.company_selection` (the operator's picker choice — `{section_id}` for an existing Entity
   or `{create: true, name}` for a new one; a missing/malformed selection falls back to an automatic
   exact-name match-or-create). For each kept lot, `commitOneLot`:
   - resolves the lot's **effective** auction info — the batch's own auction, UNLESS the lot carries
     its own `category` field shaped `"<House>, <Auction title>"` (Biddr/sixbid search-batch results
     only, detected by the sentinel `auctionHouse === 'Multiple auction houses'` the two search
     parsers stamp) — in which case the lot resolves against **its own** auction instead, since a
     search batch has no single real auction at all;
   - resolves/creates the Auction (`findOrCreateAuction`, cached per batch by `(house, number)`) —
     one transaction per new Auction, locked on `numisdata224:<entityId>:` + the number (advisory
     lock, folded in SQL — see below) and re-checked under the lock before creating, so two concurrent
     commits of the same sale can't both miss the lookup and both create it;
   - looks up (read-only, best-effort) the EXISTING Type its description cites: a catalog citation
     matched against the Catalogues this instance curates (`extractCatalogueCitation`, longest name
     first), then `findExistingType` (`matchLotType`);
   - under one transaction — the record's whole BIRTH — acquires the lock on
     `numisdata4:lot:<auctionSectionId>:` + the lot number (when the lot has a resolved Auction and a
     lot number) and then the lock on `numisdata4:url:` + the canonical lot URL (when it has a URL
     key) — always in that order, so two
     commits never deadlock — re-checks `findExistingLot` (exact match on the Auction relation + the
     Inventory number component) and `findExistingLotByUrl` (exact `==` match on `numisdata275`),
     and either returns the pre-existing record (`skipped: true`) or creates the new `numisdata4`
     record and writes its scalar fields (weight/diameter parsed from `"6.75g"`-style strings,
     inventory number, date text, obverse/reverse design split from a jesusvico-style
     `"A/... R/..."` description, falling back to a general Public remark field when no such split is
     found) plus the URL key itself into `numisdata275`, then links the resolved Auction
     (`linkAuction`, `numisdata147`) and the matched Type (`linkType`, `numisdata161`) — all in that
     same transaction, so there is no post-commit window in which a link write could replace a
     curator's edit of the just-born record. A link failure rolls the whole lot back (reported in the
     lot's `error`; the next commit retries it) — there is no savepoint to keep the record without
     it. The URL key is `SourceAdapter.canonicalLotUrl` (`server/lib/acquisition/keys.ts`), picked
     by the batch's source domain: ONE https URL per lot, rebuilt from the lot's identity in the
     source's own single-lot grammar (the adapter's `parseAuctionIdentifier` reads it back as that
     lot) — jesusvico from the parsed `lotIdentifier` (auction + lot number); biddr from the lot
     id `l` + auction `a` of the lot's own URL, only when that `l` IS the parsed lot id; numisbids
     from the `/sale/{id}/lot/{n}` lot URL, only for an id-carrying lot whose parsed number agrees;
     sixbid from the global `lotId` under its company/auction, slugs dropped. Never the scraped
     href as-is: a pasted URL, a card href, tracking params, `www.` or http/https give the same key,
     and a broken card href resolving to the listing page gives NO key (never one every lot of the
     listing would share, across batches). Every builder fails closed (`null` — dedup on Auction +
     number only) on a missing, malformed or contradicting field; aureo has no builder (its lots all
     carry their auction's page URL); and a key two different `lotIdentifier`s of one batch share is
     dropped for that batch;
   - best-effort imports the lot's first image (`importImagesForLot`): downloads it through
     `harvestFetch` with a per-source host allowlist (the image's own host, resolved from the image
     URL itself since it isn't always the listing page's host — sixbid's `image-cdn.sixbid.com`,
     biddr's `media.biddr.com` — a bare domain entry also covers its subdomains), stages it, splits
     it with the shared `crop_50` processor (`cropCoinPair`, called directly as trusted server code,
     not through an untrusted client-named processor allowlist) into obverse/reverse halves wired to
     the `numisdata164`/`numisdata165` portals, and persists each half as its own `rsc170` image
     record. **The pair is all-or-nothing:** if either half fails after an `rsc170` record was
     already created by the portal link, every `rsc170` record this call created (ids taken only from
     its own save results) is deleted again through `deleteSectionRecord`, which also strips the
     portal locators, and transcodes start only once both halves are in. A cleanup deletion that
     itself fails is logged (`[tool_numisdata_acquisition] image record cleanup failed`, with
     `section_tipo`/`section_id`) and its id is reported in the lot's `images_orphaned`, so the
     summary says which record may remain without media.

   Auction resolution, the Type lookup and the image import are each best-effort: their own error
   is captured into the per-lot result (`auction_error`/`type_error`/`images_error`, each the error
   system's wire body, `toErrorBody(toDedaloError(error))`, never a raw exception's text) and the
   lot is created without that link (or without images) rather than failed. `fields_written` and `images_created`
   carry display labels (the ontology term in the request's application language, `labelByTipo`),
   never raw tipos. The per-lot loop itself checks
   `context.signal?.aborted` at its top and breaks (setting `stopped: true`) rather than throwing, so
   a cancelled batch reports a partial summary instead of running to completion. Returns
   `{results, stopped, lots_total}`.

Shared helpers worth knowing: `writeField`/`writeField(..., lang)` is a thin wrapper over
`saveComponentData` for a bare `{id, value}` scalar write, throwing `record.save_failed` (never
silently discarding a refusal) when the save itself fails; a handful of translatable fields
(date text, obverse/reverse design, public remark) pass `currentDataLang()` explicitly rather than
the default `NO_LANG`. `acquireDedupLock(scope, term)` (`server/lib/acquisition/lock.ts`) is a
transaction-scoped `pg_advisory_xact_lock(hashtext(scope || lower(f_unaccent(term))))`, both values
bound — the same primitive as the engine's own node lock, just keyed on a find-or-create dedup key
since the record doesn't exist yet when the race happens; it must run inside `withTransaction`,
releasing at commit/rollback. A lock key must never be FINER than the `==` equality it guards
(`f_unaccent(a) = f_unaccent(b)`, case-sensitive), so the term is folded IN SQL by that same
`f_unaccent` — every rule of Postgres's `unaccent` dictionary (typographic quotes, dashes,
guillemets, accents…) applies to the lock exactly as to the search — and `lower()` on top only makes
it coarser, which is safe (two unrelated terms may serialise on one lock; the re-check under the
lock decides). Every lock (Entity name, Auction number, lot number, lot URL) uses it. Gate:
`test/unit/tool_numisdata_acquisition_keys.test.ts` (a second transaction must time out on a
spelling the search equates, and get in on an unrelated one). Every dedup/existence lookup
(`findEntityByExactName`, `findExistingAuction`, `findExistingLot`, `findExistingType`,
`loadCatalogueIndex`) runs through `buildSearchSql` with `{principal: context.principal}` — never a
hand-written SQL `WHERE` — so it only ever sees records the caller can actually read.

### Client

`tools/tool_numisdata_acquisition/js/` wires the standard tool lifecycle through `tool_common`; no
`ddo_map` is registered, so `build()` resolves a single synthetic instance — the tool only needs
`self.section_tipo`. It opens as a **modal** (`register.json`'s `properties.open_as: "modal"`, not
a separate window like the import tools).

`get_content_data` (`render_tool_numisdata_acquisition.js`) builds a URL input + Preview button, an
HTML-file upload fallback (read client-side via `FileReader`, never written to disk; it also tries to
auto-detect the saved page's own URL from `<link rel="canonical">`, `og:url`, or `<base href>` and
fills the URL field when it's still empty), and a result container. Clicking **Preview**:

- with no uploaded file, dispatches `preview_url` as a background job and drives it through
  `stream_background_job` — `data_manager.request_stream` + `render_stream` against
  `dd_utils_api`/`get_process_status`, rendering live progress text until the terminal frame;
- with an uploaded HTML file, calls `preview_html` as a **plain** (non-backgrounded) request instead
  — nothing is fetched over the network, so there's no job to stream.

A successful preview renders `build_review`: the Auction status line ("will link"/"will create"),
and — when there is an auction-house name — a **Company resolution** block (`search_companies`
queries real `rsc106` Entities through the engine's own search API, `dd_core_api`/`read`/
`action:'search'`, with the calling user's own session so it only sees what they can read) rendering
one radio option per candidate plus an always-present "Create new Entity" option, auto-running the
search once with the scraped name and preselecting an exact (case/accent-loose) match when found.
Below that, a checklist (`build_lot_row` per lot, checked by default) with a selection toolbar:
*Select all*/*Deselect all*, an include/exclude keyword filter against the lot's description and
title, and an include/exclude **lot-number range** `[from, to)`. Clicking **Confirm import** gathers
the checked lots, dispatches `commit_lots` the same way `preview_url` does (background job +
stream), and renders one summary line per result — fields written, the Auction/Type/image bits
(each reading `.message` off the error-body shape), or the skipped/failed cases.

## Actions & options

`apiActions` is declaratively gated per action. `backgroundRunnable = ['preview_url', 'commit_lots']`
— `preview_html` is a plain synchronous action (no network fetch to justify a job).
`backgroundLanes = { preview_url: 'maintenance', commit_lots: 'media' }` (commit_lots spends the
media budget downloading/cropping images). `isAvailable` scopes the tool to
`sectionTipo === 'numisdata4'` only.

| Action | Permission gate | Key options it reads | Returns |
| --- | --- | --- | --- |
| `preview_url` | declarative `permission: 'targets', minLevel: 1` on the fixed target `{section_tipo: 'numisdata4'}` (never the client's own `options.section_tipo`) | `url` (required) | `{auction, lots, auction_status, lots_truncated_by}` |
| `preview_html` | same fixed-target gate, `minLevel: 1` | `url`, `html` (both required) | same shape as `preview_url` |
| `commit_lots` | declarative `permission: 'targets', minLevel: 2` on `numisdata4` + every component it writes (weight/diameter/inventory number/date/obverse+reverse design/public remark/Auction relation/Type relation/image portals) + `numisdata224` (Auction) + its Company/Number-title/Code components + `rsc106` (Entity) + its Name component + `rsc170` (Image) + its image component | `lots` (required, `MAX_LOTS`-capped), `auction`, `company_selection` | `{results: CommitOneLotResult[], stopped, lots_total}` |

**`CommitOneLotResult`** (one entry per lot in `commit_lots`' `results`):

| Field | Meaning |
| --- | --- |
| `lot_identifier` | The source's own lot identifier, echoed back for the client's summary line. |
| `section_id` | `null` only when the whole lot failed before anything was created (its transaction rolled back); `error` names why. |
| `skipped` | `true` when a `numisdata4` record for this (Auction, Inventory number) already existed — nothing else was attempted. |
| `fields_written` | Component tipos actually written on the record. |
| `auction_section_id` / `auction_created` / `auction_error` | The resolved Auction, whether it was newly created, or why linking it failed. |
| `type_section_id` / `type_citation` / `type_error` | The matched Type (never created, only linked); a non-null citation with a null `type_section_id` means a citation was found but nothing in the catalog matched it. |
| `images_created` / `images_error` | The `rsc170` image records created (as `"<portal tipo>→rsc170#<id>"` strings), or why the image import failed. |

Each `*_error` field is the error system's wire body (`toErrorBody(toDedaloError(error))`) — never a
raw exception's own text, which could carry tipos, ids and driver text to the client.

## How it is registered & surfaced

`tools/tool_numisdata_acquisition/register.json` is a hand-authored flat registration (not a
column-keyed matrix dump like the older in-repo tools):

- `name`: `tool_numisdata_acquisition`, `version`: `1.0.0`, `label`: "Import from auction URL"
  (`lg-eng`).
- `affected_models`: `["section"]`, `show_in_component`: `true`, `active`: `true`.
- `properties`: `{"open_as": "modal"}` — opens inline as a modal, not a separate window.
- `labels`: every UI string the client reads via `get_tool_label(...)` — the URL placeholder, the
  HTML-upload fallback copy, the Company-picker strings, the selection-toolbar strings, and a set of
  **per-lot commit-summary labels** (`lot_imported`, `lot_skipped`, `lot_not_imported`,
  `lot_auction_linked`/`lot_auction_not_linked`, `lot_type_linked`/`lot_type_not_found`/
  `lot_type_not_linked`, `lot_images_created`/`lot_images_not_imported`, plus the shared
  `created`/`reused` status words) — added specifically so every line of the commit summary is
  translatable, not just the static chrome around it.

Because the registration carries no `ddo_map`/`tool_config`, surfacing is driven purely by
`affected_models` plus the module's own `isAvailable` hook (`src/core/tools/registry.ts`'s
`getElementTools`) — the button only actually renders on a `numisdata4` section, narrower than what
`affected_models: ["section"]` alone would allow.

## Source adapters

Every adapter implements the shared `SourceAdapter` contract
(`tools/tool_numisdata_acquisition/server/lib/sources/types.ts`): `matchesUrl`,
`parseAuctionIdentifier` (sync, URL-only, for the dedupe fast path), `acquire` (the network fetch,
paged progress callback), `parseAuction`/`parseLots`, and `storageKey` (the on-disk raw-source
directory key, prefixed per source so two sources' numbering spaces can't collide).

| Adapter | URL shapes supported | Can `acquire` fetch live? |
| --- | --- | --- |
| `jesusvicoAdapter` (jesusvico.com) | Full auction listing; single lot (`/lot/` or Spanish `/lote/`) | Yes — respects robots.txt |
| `biddrAdapter` (biddr.com) | Full auction catalogue; single lot (`?a=...&l=...`); `biddr.com/search?...` (spans multiple auctions) | Yes |
| `aureoAdapter` (aureo.com) | Full auction listing only (`/en/subasta/{id}`) — no separate lot-detail fetch, since the listing card already carries the full description and a directly-constructible full-resolution image URL | Yes — respects robots.txt |
| `numisbidsAdapter` (numisbids.com) | Full sale page (`/sale/{id}`); single lot (`/sale/{id}/lot/{n}`) | **No** — `acquire` always throws `tool.unsupported_target`; robots.txt blocks every agent (confirmed live, HTTP 403). `preview_html` is the only path in. |
| `sixbidAdapter` (sixbid.com) | Full auction; single lot (`/{company}/{auction}/{category}/{lotId}/{slug}`); site-wide search (`/lots/page/{p}/perPage/{n}?term=...`, spans multiple auctions) | **No** — same refusal as numisbids; `lots.sixbid.com`'s robots.txt is a blanket `Disallow: /`. `preview_html` is the only path in. |

Every page-fetch function across the three automated adapters (jesusvico, biddr, aureo) routes
through `looksBlocked` (`server/lib/acquisition/block-signals.ts`) on the fetched HTML: a small set
of strong signals (`"are you a human"`, `"checking your browser before accessing"`,
`"verify you are a human"`, `"just a moment"`, `"unusual traffic"`) are trusted regardless of page
size; a weaker set (`"captcha"`, `"access denied"`, `"forbidden"`) is trusted only when the whole
response body is 15,000 characters or less, since those words can appear incidentally inside a real,
large page. A match throws, surfacing the same "use `preview_html` instead" guidance numisbids/sixbid
give unconditionally.

## Examples

Client-side `preview_url` dispatch (background job):

``` js
const response = await self.tool_request({
    action      : 'preview_url',
    background  : true,
    options     : {
        url             : 'https://www.aureo.com/en/subasta/0470',
        section_tipo    : self.section_tipo // read, but NOT what gates the action — see above
    }
})
```

The terminal frame's unwrapped `data`, as `build_review` consumes it:

``` json
{
  "auction": { "auctionHouse": "Aureo & Calicó", "auctionNumber": "470", "title": "Subasta 470" },
  "auction_status": { "exists": false, "section_id": null },
  "lots": [
    { "lotIdentifier": "470-12", "lotNumber": "12", "weight": "6.75g", "diameter": "29.6mm", "description": "A/ ... R/ ..." }
  ],
  "lots_truncated_by": 0
}
```

`commit_lots`' per-lot result shape (one entry of `results`):

``` json
{
  "lot_identifier": "470-12",
  "section_tipo": "numisdata4",
  "section_id": 8421,
  "error": null,
  "skipped": false,
  "fields_written": ["numisdata133", "numisdata135", "numisdata151", "numisdata147"],
  "auction_section_id": 612,
  "auction_created": true,
  "auction_error": null,
  "type_section_id": null,
  "type_citation": "ACIP-1759",
  "type_error": null,
  "images_created": ["numisdata164→rsc170#9901", "numisdata165→rsc170#9902"],
  "images_error": null
}
```

## Related

- [tool_bibliography_acquisition](tool_bibliography_acquisition.md) — the same preview-then-commit,
  background-job shape applied to journal articles instead of auction lots; no shared code, but
  worth reading side by side when extending either.
- [tool_import_files](tool_import_files.md) — `crop_50`, called directly here as trusted server
  code, is the same per-file processor `tool_import_files`' own `file_processor` selector would
  otherwise expose to the client (and refuses there today, since no processor is registered for
  that allowlist).
- [Server contract](../server_contract.md), [Security](../security.md), [Creating new tools](../creating_tools.md)
  — the `ToolServerModule`/`ToolActionContext` contract, the declarative permission gates, and the
  background-job lifecycle this tool relies on.
- Source: `tools/tool_numisdata_acquisition/server/index.ts`; source adapters:
  `tools/tool_numisdata_acquisition/server/lib/sources/*/adapter.ts`; bot-challenge detection:
  `tools/tool_numisdata_acquisition/server/lib/acquisition/block-signals.ts`; image split:
  `src/core/media/tools/crop_coin_pair.ts`.
