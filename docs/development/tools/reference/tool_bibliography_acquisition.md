# tool_bibliography_acquisition

Harvests journal article metadata from any OAI-PMH/OJS source via a pasted URL into Publication
(`rsc205`) records, with an operator review step before anything is written, Series/Author
resolution, a per-language abstract, and best-effort PDF import.

## What it does / why & when to use it

`tool_bibliography_acquisition` is a three-action, preview-then-commit acquisition tool:
`preview_url` harvests one bounded set of articles from a journal URL via OAI-PMH (nothing written
yet); `preview_html` does the same against content the operator's own browser already fetched, for a
source that blocks automated retrieval; `commit_publications` creates one `rsc205` record per kept
publication, resolving/linking its Series (`rsc212`) and Authors (`rsc197`), and importing its PDF
when one can be found.

Use it to bulk-ingest a journal's articles — typically one issue's worth per run — from any source
that speaks OAI-PMH (OJS journals, Persée, and similar repositories), reviewed and curated before any
record is created. For numismatic auction lots instead of journal articles, the sibling tool is
[tool_numisdata_acquisition](tool_numisdata_acquisition.md) — same shape, different domain, no
shared code.

Key behaviours to know:

- **Nothing is written until Confirm.** `preview_url`/`preview_html` only fetch and parse; the
  operator curates the checklist client-side, and only `commit_publications` creates records.
- **A publication already imported is skipped, not duplicated.** `commit_publications` matches each
  publication by a short, host-qualified form of its OAI identifier under a per-key advisory lock
  before creating it; re-committing the same batch reports the pre-existing `section_id` with
  `skipped: true` and attempts nothing else for it.
- **This is one bounded set of articles per run, never a whole journal's history.** The pasted URL
  either names a single article, or is scanned for the real article links it carries (capped at 200
  found; `commit_publications` separately caps at 200 kept per batch) — the same "one auction's
  lots, not the auction house's history" scoping the numismatic tool uses.
- **Both fetch actions are gated `permission: 'targets'`, not `'section'`**, on a fixed target
  (`{section_tipo: 'rsc205'}`) regardless of what `options.section_tipo` the client sends — the
  handler always parses against `rsc205`, so gating on the client's own field would let any user who
  can read *any* section trigger a live outbound fetch.
- **`commit_publications` runs in the background and honors the cancel signal.** It checks
  `context.signal?.aborted` at the top of each publication's loop iteration and **breaks** (not
  throws) — the response's `stopped: true` plus `publications_total` lets the client report
  "stopped after N of M" rather than silently truncating.

## How it works

### Server

`tools/tool_bibliography_acquisition/server/index.ts` declares three API actions:

1. **`preview_url(context)`.** Reads `options.url`, matches it against the registered `ojs-oai`
   adapter (refusing with `request.invalid_options` if it isn't an OAI-PMH-capable URL), and calls
   `adapter.acquire(url, onProgress)` — `acquireArticleSet` either resolves a single article
   directly or scans a listing page for real `article/view/<id>` links (capped at `MAX_ARTICLES`,
   200, reporting the rest as `truncatedBy`), then fetches each article's own OAI-PMH `GetRecord`
   individually (reporting one `{article_id, error}` per failed article into `failures` — `error` is
   the whole error wire body, never a flattened message — rather than sinking the whole batch: one
   flaky host response does not cost the articles already resolved). The first page's
   series info is parsed with `adapter.parseSeries`; every page's publications are parsed with
   `adapter.parsePublications`. A read-only `findExistingSeries` lookup (byte-exact name match) lets the
   review screen show "will link" vs "will create" before the operator commits to anything. Returns
   `{series, publications, series_status, article_failures, publications_truncated_by}`.
2. **`preview_html(context)`.** The fallback for a source that blocks automated retrieval (confirmed
   live: some OJS journal landing pages sit behind a Cloudflare challenge that returns a plain HTTP
   200, not a status code this tool's own fetch logic can key off). Takes `options.url` **and**
   `options.html` — content the operator's own browser already retrieved (an OAI-PMH response, or
   HTML), parsed in memory and never written to disk. Single-page only (no live fetch here to drive
   `resumptionToken` pagination). Still validates the URL is `https://` even though nothing is
   fetched, and runs the same `findExistingSeries` lookup as `preview_url`.
3. **`commit_publications(context)`.** Reads `options.publications` (the curated array from a
   preview response, capped at `MAX_PUBLICATIONS` — 200, mirroring `acquireArticleSet`'s own
   `MAX_ARTICLES` — refusing a larger batch outright rather than silently trimming a write action).
   For each kept publication, `commitOnePublication`:
   - derives a short dedup identifier (`shortPublicationCode`) from the OAI `<identifier>` — the
     local id alone is not unique across independently-hosted OJS installs that happen to share the
     same default repository id, so it's prefixed with the landing page's own hostname instead;
   - checks for an existing `rsc205` record with that Code **before** opening any transaction (the
     common, no-conflict path), then, inside one transaction, acquires a lock on
     `rsc205:code:<identifier>` and re-checks under the lock before creating — so two concurrent
     commits of the same article can't both miss the lookup and both create it;
   - on create, writes the record's scalar fields (Code, Title, Pages, Publisher, Series number,
     landing-page URL as a `component_iri` `{id, iri, title}` tuple, a semicolon-joined author-name
     text field, the publication date as a `component_date` `start`-only write), links the
     Bibliographic-typology and Standard-number-type fields to **fixed, pre-known thesaurus terms**
     (never a dynamic lookup — "journal article" and "ISSN" are the only ones this tool ever
     recognizes) when the source's `dc:type`/ISSN values match, and writes the **Abstract** once per
     language variant the source actually carries (see below);
   - outside that transaction, best-effort resolves/links the Series (`findOrCreateSeries`, cached
     per batch by name, same locked-and-rechecked create pattern as the Auction/Entity case in the
     numismatic tool) and best-effort resolves/links each Author as a Person (`findOrCreatePerson`,
     cached per batch by `(surname, given name)`);
   - best-effort imports the PDF (`importDocumentForPublication` — see below) and, when a URL was
     resolved (even if the byte-download itself failed or was skipped), writes it into the PDF-URI
     field regardless.

   Every step past the record's own creation (Series, Authors, PDF) is independently best-effort:
   its own error is captured into the per-publication result (`series_error`/`author_errors`/
   `document_error`, each the error system's wire body, `toErrorBody(toDedaloError(error))`, never a
   raw exception's text) rather than rolling back fields already written. The per-publication loop
   checks `context.signal?.aborted` at its top and breaks (setting `stopped: true`) rather than
   throwing. Returns `{results, stopped, publications_total}`.

**The Abstract field (`rsc221`, a `component_text_area` — stores HTML).** Writing plain scraped text
into it would make e.g. `"p < 0.05 &"` invalid markup the moment the record is opened, so every
abstract write goes through `textAsParagraph` (`src/core/tools/import_code_lookup.ts` — the same
escape-and-wrap helper every other HTML-component writer in this codebase uses). Each language
variant the source carries (`abstractVariants`, one `{lang, text}` per `xml:lang`-tagged
`dc:description`) is written into **its own** data-lang slot rather than merged into whichever
variant happened to be English-preferred. `planAbstractLangs`
(`server/lib/domain/abstract_langs.ts`, pure) plans the slots against the install's own data
languages — `installedDataLangs()` paired with the engine's ISO 639-1 map (`getAlpha2FromCode`,
`src/core/resolve/lang_names.ts`), the same `{data, current}` shape `tool_import_rdf` plans with. A
region tag (`es-ES`, `en_US`) is normalised to its primary subtag; a 3-letter ISO 639-2/T code
(`spa`) matches the installed `lg-<code>` directly. A variant whose language is unmappable or not
installed is **skipped** (`language_not_installed`), and a second variant for an already-taken slot
is skipped too (`duplicate_language`, the first wins); an untagged variant goes to the request data
lang only when no tagged variant took it. Skips are reported per publication in `abstract_skipped`
— the publication itself is still committed (a write in an undeclared language would be refused by
`saveComponentData` and roll the whole publication's transaction back).

**The PDF step (`importDocumentForPublication`).** OAI-PMH's `oai_dc` metadata prefix never carries
a direct PDF link, so when the publication doesn't already have one, `resolvePublicationPdfUrl`
calls the adapter's own `resolvePdfUrl(landingPageUrl)` — a two-hop scrape (landing page → PDF galley
view page → the real file URL) specific to OJS. That resolve step is itself best-effort (a blocked or
unreachable landing page, or simply no PDF galley on it, both land on `{url: null}`, never thrown
past this point); the byte download is a normal `harvestFetch` (`hosts: 'public'`, https-only,
`application/pdf` content-type check, 50 MB cap) staged and written directly onto the Publication
record's own `rsc209` field — no separate resource record or crop step, unlike the numismatic tool's
obverse/reverse image split.

Shared helpers worth knowing: `writeField`/`writeIriField`/`writeDateField` are thin wrappers over
`saveComponentData` for a scalar, an iri-tuple, or a date-range-with-only-`start` write respectively,
each throwing `record.save_failed` (never silently discarding a refusal) when the save itself fails.
`acquireDedupLock(key)` is a transaction-scoped `pg_advisory_xact_lock(hashtext(key))` — the same
primitive as the engine's own node lock, just keyed on a find-or-create dedup key since the record
doesn't exist yet when the race happens; it must run inside `withTransaction`, releasing at
commit/rollback. `foldNameForLock(name)` NFD-decomposes a name, lowercases it, and strips the Unicode
combining-diacritical-marks block (U+0300–U+036F) by code point — the SAME equivalence class
Postgres's own `f_unaccent` gives the engine's `==` search operator — so e.g. "Martín" and "Martin"
take the SAME lock instead of two different ones that would otherwise both miss the lookup and both
create a Person. `findExistingSeries` and `findExistingPerson` additionally never trust the loose accent-insensitive
search alone: they widen the candidate window past 1 (`LOOKALIKE_WINDOW`, 10) and compare every
stored item of each candidate's name (surname/given name) **byte-exact** (trimmed) before accepting a
match, so two genuinely different series or people who happen to share an accent-folded name are
never silently merged. When the name component's data column cannot be resolved the lookup is
treated as no match — an uncompared row is never trusted. Every dedup/existence
lookup (`findExistingPublication`, `findExistingSeries`, `findExistingPerson`) runs through
`buildSearchSql` with `{principal: context.principal}` — never a hand-written SQL `WHERE` — so it
only ever sees records the caller can actually read.

### Client

`tools/tool_bibliography_acquisition/js/` wires the standard tool lifecycle through `tool_common`;
no `ddo_map` is registered, so `build()` resolves a single synthetic instance — the tool only needs
`self.section_tipo`. It opens as a **modal** (`register.json`'s `properties.open_as: "modal"`, not a
separate window like the import tools).

`get_content_data` (`render_tool_bibliography_acquisition.js`) builds a URL input + Preview button,
an HTML/XML-file upload fallback (read client-side via `FileReader`, never written to disk), and a
result container. Clicking **Preview**:

- with no uploaded file, dispatches `preview_url` as a background job and drives it through
  `stream_background_job` — `data_manager.request_stream` + `render_stream` against
  `dd_utils_api`/`get_process_status`, rendering live progress text until the terminal frame;
- with an uploaded file, calls `preview_html` as a **plain** (non-backgrounded) request instead —
  nothing is fetched over the network, so there's no job to stream.

A successful preview renders `build_review`: a truncation notice (when more articles were found than
the 200 cap kept), a per-article failure list (one line per article whose metadata could not be
fetched, rendering each error body's label/message), the
Series status line ("will link"/"will create" — no client-side picker here, unlike the numismatic
tool's Company resolution; Series/Author resolution is fully automatic server-side). Below that, a
checklist (`build_publication_row` per publication, checked by default, labeled with title, authors,
date and pages) with a selection toolbar: *Select all*/*Deselect all*, an include/exclude keyword
filter against the title and authors, and an include/exclude **year range** `[from, to]` (parsed from
each publication's date). Clicking **Confirm import** gathers the checked publications, dispatches
`commit_publications` the same way `preview_url` does (background job + stream), and renders one
summary line per result — fields written, the Series/Authors/PDF bits (each reading `.message` off
the error-body shape), or the skipped/failed cases.

## Actions & options

`apiActions` is declaratively gated per action.
`backgroundRunnable = ['preview_url', 'commit_publications']` — `preview_html` is a plain synchronous
action (no network fetch to justify a job). `backgroundLanes = { preview_url: 'maintenance',
commit_publications: 'media' }` (`commit_publications` spends the media budget downloading PDFs).
`isAvailable` scopes the tool to `sectionTipo === 'rsc205'` or `'rsc3'` (the virtual section's
possibly-resolved real tipo).

| Action | Permission gate | Key options it reads | Returns |
| --- | --- | --- | --- |
| `preview_url` | declarative `permission: 'targets', minLevel: 1` on the fixed target `{section_tipo: 'rsc205'}` (never the client's own `options.section_tipo`) | `url` (required) | `{series, publications, series_status, partial_error, publications_truncated_by}` |
| `preview_html` | same fixed-target gate, `minLevel: 1` | `url`, `html` (both required) | same shape as `preview_url` |
| `commit_publications` | declarative `permission: 'targets', minLevel: 2` on `rsc205` + every component it writes (Code/Title/Pages/Abstract/Publisher/Series number/URL/author-name text/date/typology relation/standard-number fields/Series relation/Authorship relation/PDF URI/document) + `rsc197` (People) + its Surname/Given-name components + `rsc212` (Series) + its Name component | `publications` (required, `MAX_PUBLICATIONS`-capped) | `{results: CommitOnePublicationResult[], stopped, publications_total}` |

**`CommitOnePublicationResult`** (one entry per publication in `commit_publications`' `results`):

| Field | Meaning |
| --- | --- |
| `publication_identifier` | The source's own OAI identifier, echoed back for the client's summary line. |
| `section_id` | `null` only when the whole publication failed before anything was created (its transaction rolled back); `error` names why. |
| `skipped` | `true` when an `rsc205` record with this Code already existed — nothing else was attempted. |
| `fields_written` | Component tipos actually written on the record. |
| `abstract_skipped` | Abstract variants NOT written, each `{lang, reason}`: `language_not_installed` (unmappable or not a declared data language) or `duplicate_language` (an earlier variant already took the slot). |
| `series_section_id` / `series_created` / `series_error` | The resolved Series, whether it was newly created, or why linking it failed. |
| `author_section_ids` / `author_errors` | The resolved Person records linked as authors, and any per-author resolution failures. |
| `document_imported` / `document_error` | Whether the PDF was imported, or why it wasn't. |

Each `*_error` field is the error system's wire body (`toErrorBody(toDedaloError(error))`) — never a
raw exception's own text, which could carry tipos, ids and driver text to the client.

## How it is registered & surfaced

`tools/tool_bibliography_acquisition/register.json` is a hand-authored flat registration (not a
column-keyed matrix dump like the older in-repo tools):

- `name`: `tool_bibliography_acquisition`, `version`: `1.0.0`, `label`: "Import from journal URL"
  (`lg-eng`).
- `affected_models`: `["section"]`, `show_in_component`: `true`, `active`: `true`.
- `properties`: `{"open_as": "modal"}` — opens inline as a modal, not a separate window.
- `labels`: every UI string the client reads via `get_tool_label(...)` — the URL placeholder, the
  HTML-upload fallback copy, the Series-status strings, the selection-toolbar strings, and a set of
  **per-publication commit-summary labels** (`pub_imported`, `pub_skipped`, `pub_not_imported`,
  `pub_series_linked`/`pub_series_not_linked`, `pub_authors_linked`/`pub_authors_not_linked`,
  `pub_pdf_imported`/`pub_pdf_not_imported`, plus the shared `created`/`reused` status words) —
  added specifically so every line of the commit summary is translatable, not just the static chrome
  around it.

Because the registration carries no `ddo_map`/`tool_config`, surfacing is driven purely by
`affected_models` plus the module's own `isAvailable` hook (`src/core/tools/registry.ts`'s
`getElementTools`) — the button only actually renders on a Publications (`rsc205`) section, narrower
than what `affected_models: ["section"]` alone would allow.

## Source adapter

A single adapter, `ojsOaiAdapter` (`id: 'ojs-oai'`), implements the shared `SourceAdapter` contract
(`tools/tool_bibliography_acquisition/server/lib/sources/types.ts` — deliberately mirrors the
numismatic tool's own `SourceAdapter` shape): `matchesUrl`/`parseSeriesIdentifier` (via
`deriveOaiBaseUrl`, which recognizes either a URL already ending `/oai` or a normal OJS
journal-routing URL and derives the real OAI base from it), `acquire`
(`acquireArticleSet`), `parseSeries`/`parsePublications`, `storageKey`, and an optional
`resolvePdfUrl` (best-effort; some hosts, e.g. some Saguntum-hosted journals, block the landing-page
fetch it needs).

Every page-fetch function (`fetchOaiPage`) checks the harvesting door's own `cf-mitigated` response
header and, on a response that is NOT a well-formed OAI-PMH document (`isOaiPmhDocument`: an HTML
content type, or a body without an `<OAI-PMH` root), routes the body through `looksBlocked`
(`server/lib/acquisition/block-signals.ts` — the same helper and signal set the numismatic tool
uses): either one throws `external.protocol`, surfacing the same "use `preview_html` instead"
guidance. Real OAI-PMH XML is never treated as a bot wall — its article text ("The Forbidden City")
would otherwise trip the weak patterns.

## Examples

Client-side `preview_url` dispatch (background job):

``` js
const response = await self.tool_request({
    action      : 'preview_url',
    background  : true,
    options     : {
        url             : 'https://revistas.usal.es/myjournal/issue/current',
        section_tipo    : self.section_tipo // read, but NOT what gates the action — see above
    }
})
```

The terminal frame's unwrapped `data`, as `build_review` consumes it:

``` json
{
  "series": { "name": "My Journal" },
  "series_status": { "exists": false, "section_id": null },
  "publications": [
    {
      "publicationIdentifier": "oai:ojs.pkp.sfu.ca:article/123",
      "title": "A Study of Something",
      "authors": ["Martín, J."],
      "pages": "45-60",
      "publicationDate": "2024-03-01",
      "landingPageUrl": "https://revistas.usal.es/myjournal/article/view/123"
    }
  ],
  "article_failures": [],
  "publications_truncated_by": 0
}
```

`commit_publications`' per-publication result shape (one entry of `results`):

``` json
{
  "publication_identifier": "oai:ojs.pkp.sfu.ca:article/123",
  "section_tipo": "rsc205",
  "section_id": 5310,
  "error": null,
  "skipped": false,
  "fields_written": ["rsc137", "rsc140", "rsc223", "rsc221", "rsc217", "rsc224", "rsc211", "rsc139"],
  "abstract_skipped": [{ "lang": "eu", "reason": "language_not_installed" }],
  "series_section_id": 70,
  "series_created": true,
  "series_error": null,
  "author_section_ids": [812],
  "author_errors": [],
  "document_imported": true,
  "document_error": null
}
```

## Related

- [tool_numisdata_acquisition](tool_numisdata_acquisition.md) — the same preview-then-commit,
  background-job shape applied to numismatic auction lots instead of journal articles; no shared
  code, but worth reading side by side when extending either.
- [tool_import_zotero](tool_import_zotero.md) — the other Publications-section (`rsc205`) importer,
  for a bibliography already curated and exported from Zotero rather than harvested live.
- [Server contract](../server_contract.md), [Security](../security.md), [Creating new tools](../creating_tools.md)
  — the `ToolServerModule`/`ToolActionContext` contract, the declarative permission gates, and the
  background-job lifecycle this tool relies on.
- Source: `tools/tool_bibliography_acquisition/server/index.ts`; OAI-PMH adapter:
  `tools/tool_bibliography_acquisition/server/lib/sources/ojs_oai/*.ts`; bot-challenge detection:
  `tools/tool_bibliography_acquisition/server/lib/acquisition/block-signals.ts`; abstract escaping:
  `src/core/tools/import_code_lookup.ts`.
