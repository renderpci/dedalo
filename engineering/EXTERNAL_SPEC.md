# EXTERNAL_SPEC — external record services (`src/external/`)

Standing spec for the subsystem that resolves a record from a THIRD-PARTY
service instead of from the matrix. Companion to `engineering/REWRITE_SPEC.md`
§4 (the boundary law) and `engineering/RELATIONS_SPEC.md` §1 addendum
2026-08-05 (multi-engine dispatch). Built 2026-08-05/06; the wire law is the
ten `WC-2026-08-0{5,6}-external-*` / `-multi-engine-*` entries in
`engineering/wire_contract/`.

Vocabulary: **external service**, never a bare "service" —
`docs/core/system/services.md` already owns "service" for a client-side UI
module, which is why `src/core/services/` does not exist.

---

## 1. What the subsystem is

An external record service is a third party whose records Dédalo SHOWS inside a
section without copying them: a bibliographic catalogue, an authority file, a
gazetteer. The installation's one live case is **Zenon** (DAI), bound to
section `zenon1`.

Three facts define everything else:

1. **There is no stored value.** `zenon1` has ZERO rows in every matrix table
   and no `matrix_zenon` exists; `matrix_time_machine` holds zero rows for any
   `component_external` tipo. The section is purely DERIVED.
2. **The remote id IS the `section_id`** — a zero-padded STRING (`"001338683"`).
   Never `Number()` it: that drops the padding and asks the service for a
   different record.
3. **The traffic is one-directional.** Dédalo reads; it never writes to the
   service, and never writes a remote value into a local record (§9).

Layout — every file is private except `api/`:

| File | Owns |
|---|---|
| `api/index.ts`, `api/types.ts` | THE FACADE. The only modules `src/core/**` may import. |
| `search.ts` | server-side search: refusals, the request, the hits (§10). |
| `registry.ts` | name → adapter. Unknown name THROWS. |
| `services/<name>.ts` | one adapter each (`zenon.ts`). Checklist: `services/README.md`. |
| `descriptor_types.ts` | `ExternalServiceModel` and its satellites (§4). |
| `config.ts` | ontology `api_config` → a typed, vetted binding; `publishApiConfig`. |
| `fields_map.ts` | payload → entries: unwrap, pick, extract, format, id codec, ceilings. |
| `transport.ts` | THE ONE OUTBOUND DOOR (§5) + the concurrency ceiling. |
| `breaker.ts` | circuit breaker per (service, origin). |
| `cache.ts` | row cache, in-flight coalescing, the per-page fan-out. |
| `errors.ts` | the closed error taxonomy + the log grammar. |
| `settings.ts` | THE ONE settings door (`config.external`). |

---

## 2. The four ontology pieces

A working binding is four declarations, in three different places. All four are
required; a missing one is a named degradation, never a blank (§8).

### 2.1 The mirror TLD (the section tree)

The external records need a section to be addressed in. `zenon1` is a REAL
section (`parent dd14`, `model section`, `relations NULL` — it is **not** a
virtual section), whose children are the display definition:

```
zenon1   section            properties.api_config  ← the connection
└ zenon2   section_group
  ├ zenon3   component_external   fields_map remote:'id'
  ├ zenon4   component_external   fields_map remote:'title'
  ├ zenon5   component_external   fields_map remote:'authors',              format:'zenon_authors'
  ├ zenon6   component_external   fields_map remote:'publicationDates',     format:'array_values'
  ├ zenon9   component_external   fields_map remote:'recordPage'
  ├ zenon10  component_external   fields_map remote:'containerTitle'
  └ zenon11  component_external   fields_map remote:'physicalDescriptions'
  zenon7   component_filter
  zenon8   section_list       relations [zenon3, zenon4, zenon5, zenon6]
```

The tree carries no data. It exists so that a locator can address a remote
record and so that the display of that record is ontology-declared like any
other section's.

### 2.2 The section's `api_config`

On the SECTION node's `properties`. It is the connection, and it is the source
of truth: no engine path reads a CALLER's copy.

```json
{
  "api_config": {
    "entity"        : "zenon",
    "api_url"       : "https://zenon.dainst.org/api/v1/record",
    "api_url_search": "https://zenon.dainst.org/api/v1/search",
    "ui_base_url"   : "https://zenon.dainst.org/Record/",
    "response_map"  : [
      { "local": "ar_records", "remote": "records" },
      { "local": "msg",        "remote": "status"  }
    ]
  }
}
```

- `entity` — the registry key. Unknown ⇒ `ExternalServiceNotRegisteredError`.
- `api_url` / `api_url_search` — FETCHED by this server, so their host must be
  in `DEDALO_EXTERNAL_ALLOWED_HOSTS` or the binding is refused.
- `ui_base_url` — RENDERED in the curator's browser, a different trust
  boundary: http(s)-only, no host allowlist (§7).
- `response_map` — local role → remote payload key; `ar_records` names the row
  array.

Carriers in this installation: `zenon1`, `test3`, and `rsc205` — whose copy is
a stale 2024 duplicate, INERT because only the target section's copy binds.
`zenon1` and `test3` also carry `properties.search_engine: 'search_zenon'`,
which nothing reads: **DEAD**.

`parseApiConfig` is the ONLY constructor of a typed `ExternalApiConfig` — the
constructor IS the validation.

### 2.3 The component's `fields_map`

On each `component_external` node. It says which remote field becomes this
component's entries.

```json
{ "fields_map": [ { "local": "dato", "remote": "authors", "format": "zenon_authors" } ] }
```

- Only `local: 'dato'` rows carry a value; other locals are ignored by the
  emission and by the requested-field union.
- `remote` is a **dotted/indexed PATH** resolved against the row
  (`labels.en.value`, `items[0].body.value`); a flat top-level key is that
  path's degenerate case. The retired engine read one top-level key only.
- `format` names a formatter the ADAPTER implements. A name it does not
  implement is a loud `bad_config`, never a silent raw passthrough.
- EVERY resolvable `dato` row contributes, in declaration order. The oracle
  folded the map with `array_reduce`, so the LAST resolvable row silently won;
  every node in this installation declares exactly one row, so the two agree
  here (ledgered: `WC-2026-08-05-external-entry-normalisation`).

### 2.4 The caller's `request_config` item

A component in a NORMAL section reaches the external section through an
ordinary relation config item that declares `api_engine`:

```json
{
  "api_engine": "zenon",
  "sqo": { "section_tipo": [ { "value": ["zenon1"], "source": "section" } ] },
  "show": { "ddo_map": [
    { "tipo": "zenon5", "parent": "self", "fields_map": true, "section_tipo": "zenon1" },
    { "tipo": "zenon6", "parent": "self", "fields_map": true, "section_tipo": "zenon1" },
    { "tipo": "zenon3", "parent": "self", "fields_map": true, "section_tipo": "zenon1" },
    { "tipo": "zenon4", "parent": "self", "fields_map": true, "section_tipo": "zenon1" }
  ], "fields_separator": " | " }
}
```

`fields_map: true` on a ddo means "hydrate from the NODE's own
`properties.fields_map`" — the flag is a request to look it up, not a value.

Five nodes in this installation declare a non-`dedalo` engine, across FOUR
models — which is why dispatch lives in the shared relation engine and not in
`models/portal.ts`:

| Node | Model | Engines |
|---|---|---|
| `rsc368` | component_autocomplete | dedalo + zenon |
| `numisdata162` | component_autocomplete_hi | dedalo + zenon |
| `rsc1285` | component_portal | dedalo + zenon |
| `tchi29` | component_portal | dedalo + zenon |
| `test204` | component_portal | zenon ONLY |
| `test61` | box elements | zenon ONLY |

---

## 3. Dispatch: how a locator reaches a service

Read `engineering/RELATIONS_SPEC.md` §1 addendum 2026-08-05 first. In one
breath:

1. **Every config item contributes children.** `relations/config_ddo_map.ts`
   flattens each item's `show` + `hide` ddo maps into one deduped list (the
   oracle's `full_ddo_map`). Taking `request_config[0]` was why the zenon
   children of `rsc368` were never resolved at all.
2. **No `api_engine` branch exists in the read path, and none may be added.**
   The flattened map is filtered PER LOCATOR by the locator's own
   `section_tipo` in `relation_core.expandPortal`, so a `zenon1` locator sees
   only the ddos declared at `zenon1`. Dispatch stays model-polymorphic.
3. **External targets are batched.** `relation_core` answers "which target
   sections of this page are external?" ONCE per expansion, partitions those
   locators out, and resolves them in ONE `fetchExternalRows` fan-out parked on
   the emission context. A malformed `api_config` counts as EXTERNAL, so the
   failure surfaces as a degraded external cell rather than as an empty
   matrix lookup.
4. **The prepass is an optimisation, never a precondition.** A direct read, a
   `section_list` cell, an indexation cell and `resolve_data` all arrive with an
   empty scratch, and the component fetches its own row.
5. **Narrowing sites negotiate.** Where the engine genuinely needs ONE item
   (pagination stamp, list columns, order path, fields separator),
   `relations/request_config/engine_select.ts` picks the `dedalo` item when
   there is one — not a preference, the fact that it is the only engine with a
   matrix table behind it — and otherwise puts the caller's CONCERN
   (`ordering` | `pagination` | `listColumns` | `search`) to the adapter's
   capabilities, REFUSING with `ExternalEngineConcernUnsupportedError` where
   unsupported. Silently degrading an unordered list into an "ordered" one is a
   wrong answer that looks right. Census + shrink-only ratchet:
   `test/unit/external_config_narrowing_census.test.ts` (DELETE IT when its
   `deferred` list is empty — it is migration scaffolding, not an invariant).

---

## 4. `ExternalServiceModel` — the adapter contract

An adapter is **DATA plus pure functions**: it never opens a socket, reads
config or touches the DB. That is what makes "add a service" one file + one
registry line + one doc row, with no engine edit
(`external_registry_totality_tripwire`).

Required:

| Field | Contract |
|---|---|
| `service` | the name; MUST equal `api_config.entity` and the `api_engine`. |
| `egress` | what leaves the institution (§6). NO DEFAULT. |
| `remoteIdShape` | `numeric_string` (digits, significant leading zeros) or `opaque_token` (`[A-Za-z0-9._:-]+`). |
| `capabilities` | `{ordering, pagination, listColumns, search}` — consulted by §3.5. |
| `buildRecordRequest` | the one required function; returns an `ExternalRequestSpec`. |

Optional, each with a DEFAULT in `fields_map.ts` — the defaults are the general
case, so a nested-payload/opaque-id service (Wikidata `Q42`, `labels.en.value`)
is mappable by a cataloguer with no code: `unwrapRows`, `pickRow`,
`remoteIdPath` (default `'id'`), `extract`, `formats`, `encodeRemoteId` /
`decodeRemoteId`, `uiRecordUrl`, `credentialCatalogKey` / `credentialScheme` /
`credentialParam`, and the per-service overrides `timeoutMs` / `retry` /
`softTtlMs`.

`pickRow` defaults to **the row whose encoded id equals the requested one**,
else `null`. Never a blind first element: the oracle reduced the record array
and could not tell a multi-hit answer from a single hit, so a non-matching
answer became a confidently wrong value. A non-matching answer is `not_found`
(`WC-2026-08-05-external-first-record-reduce`).

---

## 5. Transport — the one door and its order

Every byte the subsystem sends leaves through `transport.ts::fetchExternalJson`;
`external_outbound_tripwire` fails the build on any other `fetch(` /
`new Request(` / `node:http(s)` / `Bun.connect` under `src/external/**`. THE
ORDER IS LOAD-BEARING — each step exists because the next one would otherwise
leak something:

| # | Step | Failure kind | Socket? |
|---|---|---|---|
| 0 | method ∈ {GET, POST} | `bad_config` | no |
| 1 | master switch + per-service kill switch | `disabled` | no |
| 2 | circuit breaker for (service, origin) | `circuit_open` | no |
| 3 | HOST ALLOWLIST, before any DNS lookup | `blocked_host` | no, and no resolver traffic |
| 4 | `assertPublicUrl` → vet every address, PIN the socket to a vetted one, SNI kept at the real host | `blocked_host` | — |
| 5 | attach the credential — ONLY NOW | `bad_config` | — |
| 6 | fetch: `redirect:'error'`, AbortSignal at the timeout, STREAMED byte ceiling | `timeout`/`transport`/`http_status`/`too_large` | yes |
| 7 | retry ONLY on timeout/transport/429/5xx, full jitter, `Retry-After` honoured | — | maybe |
| 8 | breaker update: 3 consecutive failures open; half-open admits ONE probe, which MUST be settled | — | — |
| 9 | JSON parse failure is `protocol`, not `transport` | `protocol` | — |

Two orderings carry the whole security argument and are asserted:

- **3 before 4** — the allowlist is consulted before the first DNS traffic. The
  URL is assembled from the ontology, which is editable data; the OPERATOR's
  allowlist, not the ontology, decides where this server may go. An EMPTY
  allowlist refuses everything: it is the door, not a narrowing of an open one.
- **5 after 3+4** — attaching the credential earlier would let an ontology edit
  point the request at an attacker's host and exfiltrate it.

Concurrency is bounded per (service, origin) AT THE DOOR, so the ceiling holds
for a caller that bypasses the row cache, and retries happen INSIDE the slot so
a retrying request cannot multiply the load a struggling service is already
failing under. The ceiling is re-tested after every wake, not once on entry:
handing a slot on only RESOLVES the next waiter, whose `active++` runs a
microtask later, and a caller arriving in that window would otherwise take a
slot that is already spoken for. A slot entry is dropped only when nobody holds
it, waits for it, or is on the way to it.

The breaker's state is keyed by `${service}|${origin}` and cleared BY TIME
ONLY. It deliberately does NOT use `createOntologyCache`: that factory's clearer
fires on every `dd_ontology` write, so an unrelated cataloguing save would reset
an open circuit and re-open the flood at the worst possible moment. v6 kept a
single `$_SESSION['zenon_is_available']` boolean — request-identity state that
bleeds between users under a persistent worker, and that one empty response
poisoned for a whole session across every entity at once.

A half-open probe must be SETTLED on every exit path — `recordSuccess`,
`recordFailure`, or `releaseProbe` when the attempt died LOCALLY and learned
nothing about the remote end. Nothing here is self-healing: an unsettled probe
leaves `probeInFlight` true, every later check refreshes `touchedAt` so the
prune never reaps the entry, and the origin answers `circuit_open` until the
process restarts — a permanent outage of a healthy service, wearing the mask of
a remote one. `releaseProbe` counts NO failure on purpose: a local defect is hit
on every request, so counting it would open the circuit by itself and hide the
real error behind `circuit_open`.

---

## 6. Egress classes, and the disclosure they imply

`egress` has NO DEFAULT: a new adapter must state its class, and
`external_egress_tripwire` proves the class is TRUE of the request the adapter
builds (sentinel-driven — a record whose CONTENT is a unique sentinel is loaded
and the sentinel grepped out of every URL, header and body).

An adapter declares TWO classes when it can search: `egress` for the RECORD
path and `searchEgress` for the SEARCH path. One field cannot be honest about
both — a record fetch sends ids the install already holds, a search sends free
text a cataloguer typed — and the gate holds each path to its own class,
proving additionally that a record request CANNOT carry terms
(`ExternalRecordRequestContext` has nowhere to put one).

| Class | What leaves | Today |
|---|---|---|
| `record_identifiers` | remote record ids, the language code, remote field NAMES; no body | `zenon` (record path) |
| `query_terms` | free text a cataloguer typed | `zenon` (search path, `searchEgress`) |
| `record_content` | data stored in this installation's own records | none |

**`record_identifiers` is not "nothing".** The id set is ITSELF a disclosure: it
tells the remote service which records this institution holds, and at what rate
they are being consulted. An institution that must not disclose its holdings
turns the subsystem off (`DEDALO_EXTERNAL_ENABLED=false`) or omits the host from
the allowlist — this is stated here so the choice is made deliberately rather
than discovered.

---

## 7. Secrets, and the two publication paths

`api_config` is CATALOGUING DATA: writable by anyone who can edit the ontology,
readable through ordinary section reads. Therefore:

- a credential NEVER comes from the ontology. `parseApiConfig` and
  `publishApiConfig` STRIP every credential-shaped key (broad regex; a false
  positive costs an unused field, a false negative ships a secret) and report
  the strip;
- a credential value is read ONLY by the outbound door, through the config
  readers, on a catalog entry whose `scope` is `'secret'` with no default;
- `ui_base_url` must be http(s) with no embedded credentials. The portal
  concatenates it with a `section_id` and opens the result, so a `javascript:`
  value stored in the ontology would be stored XSS on a curator's click.

`api_config` reaches a browser by exactly TWO paths, and both go through the ONE
shaper `publishApiConfig`: the parsed `request_config[].api_config`
(`relations/request_config/external.ts`) and the structure-context
emitted-properties echo (`resolve/structure_context.ts`). It guarantees, in
order: credential strip → a publishable-key ALLOWLIST (only an allowlist catches
a future `internal_admin_url`) → URL vetting, with ONE bad field refusing the
WHOLE object, because a half-published binding is a trap. It NEVER THROWS: both
call sites are read paths whose job is to render a form.

No host allowlist applies on publication: those URLs are fetched by the
CURATOR'S BROWSER, a different trust boundary, and gating them on the server's
egress list would silently break a working catalogue link on every install that
has not opted into server-side fetching.

Gate: `external_secret_confinement_tripwire` (both paths + a source scan proving
no third exists).

---

## 8. The row cache, and the degradation table

### 8.1 Key

```
service | originAndPath(api_url) | sectionTipo | remoteId | dataLang | fieldSignature
```

`fieldSignature` is the SORTED requested field set: v6's static cache omitted
it, so a component asking for `{id,title}` was served a row fetched for `{id}`
and silently rendered nothing. `dataLang` is read AT CALL TIME through
`currentDataLang()`, never module-captured. The PATH is keyed but never the
QUERY — the query holds the id, the fields and (for a `query`-scheme
credential) the secret.

**NO PRINCIPAL is in the key**, and that is a claim that must stay true: with
`record_identifiers` egress and ONE install-wide credential the response cannot
vary by user, so a shared cache is legal. A per-USER credential would make it
illegal — the day an adapter needs one, the principal joins the key, or that
service opts out of the shared cache.

Rows are coalesced in flight (a portal row with four external children issues
ONE call) and served past their soft TTL as `stale` while a refresh runs behind
the request. Lifecycle is `createOntologyCache`, which is RIGHT here: the
content derives from `api_config` and the field set, both ontology-derived.
Dropping the map is not the whole of that lifecycle: a fetch already in the air
settles AFTER the write, carrying a row unwrapped by the PRE-edit binding, so
the coalescer re-resolves the section's binding before it stores and drops the
write on a mismatch. The requesting read still gets its row — refusing it would
500 a page because somebody else pressed save — but it never becomes the cached
answer for the next five minutes.

### 8.2 States

`entries: []` plus a `source_status` naming the state — **no silent blanks**.
"The source did not answer" and "this work has no author" look identical on
screen, and a cataloguer will act on the difference.

| state | Cause | `retryable` | label key |
|---|---|---|---|
| `ok` | fresh success — **never reaches the wire** (except with drop counters) | false | — (`external_source_truncated` when values were dropped) |
| `stale` | served past the soft TTL; carries `stale_since` | true | `external_source_stale` |
| `unavailable` | transport / http_status / too_large / protocol, no cached row | true | `external_source_unavailable` |
| `timeout` | the request exceeded the timeout | true | `external_source_timeout` |
| `not_found` | the service answered; the record is not in the answer | false | `external_source_not_found` |
| `circuit_open` | the breaker is open for (service, origin) | true | `external_source_circuit_open` |
| `disabled` | master switch or per-service kill switch | false | `external_source_disabled` |
| `misconfigured` | `not_registered` / `bad_config` / `blocked_host`, a section with no `api_config`, an empty `fields_map` | false | `external_source_misconfigured` |

`label_key` is a KEY into `src/core/labels/master.json`, never prose: the
message must be translatable and the server does not know the user's
application language at this depth. `retryable` is FALSE exactly where waiting
cannot help, so a client does not offer a retry that hammers a host which will
never answer.

Emission ceilings: an over-long value is REFUSED, never trimmed (a shortened
title is a wrong title that looks real); entries past the count ceiling are
CUT; a value with no canonical text form (an object mapped without a `format`)
is REFUSED. All three are counted in `source_status`.

### 8.3 Per surface

| Surface | Degraded behaviour |
|---|---|
| edit / list / tm item | `entries: []` + `source_status`; the item still emits |
| section_list column, export flat cell | the joined entries; empty + the model reported unresolved when the source is unreachable |
| portal / autocomplete expansion | the external locators resolve to derived items; a non-`component_external` model at an external target is REFUSED loudly in the child loop |
| import | refused per cell, every shape (§9) |
| save / delete_data | refused / skipped (§9) |
| search (SQO) | THROWS — there is no SQL surface (§10) |
| search (adapter) | `searchExternalService` THROWS: a search has no other content to protect, and `[]` reads as "no matches" (§10) |
| client render | text, plus a visible per-state marker (`WC-2026-08-06-external-client-render`) |

`deriveExternalValue` NEVER THROWS: throwing would blank the whole record's read
for one degraded field. A CONFIGURATION question (§3.5) is the opposite posture
and refuses loudly — the two must not be confused.

---

## 9. The write invariant

**Dédalo never writes to an external service, and never writes a remote value
into a matrix record or into `dd_ontology`. The only curated thing written is
the CALLER's locator.**

One-directional is the CONTRACT, not a not-yet-built feature: an external record
is somebody else's, and every path that would turn it into a local write is
cheap to open and invisible once open. The predicate is the descriptor facet
`emitHook: 'external'`, never a model-name list.

| Path | Refusal |
|---|---|
| import | no `importConform`; flat/JSON/EMPTY cells refused per cell, model named |
| save | `saveComponentData` throws `ExternalWriteRefused` BEFORE the transaction opens, after the `component_alias` hop |
| delete_data | the model is in `delete_record.ts EXCLUDED_EMPTY_MODELS` — "emptying" would write a TM backfill row and a column key for data the record never held |
| subsystem | `src/external/**` imports no `matrix_write` / `json_codec` / `core/db/`, names no `matrix_*` table, holds no DML |
| outbound | `ExternalRequestSpec.method` admits only `GET`/`POST`, and the transport re-checks at step 0 — an adapter is DATA, and a `DELETE` that reached the socket would already have destroyed a remote record |

Positive control: `{"section_tipo": "zenon1", "section_id": "001338683"}` still
saves, byte-identical, zero padding intact.

DELIBERATE DIVERGENCE from the retired engine, licensed by census: PHP's
`component_external` had a `# Tool Time machine case` branch calling
`parent::set_dato()`. `matrix_time_machine` holds ZERO rows for any
`component_external` tipo and `zenon1` has ZERO matrix rows — nothing to
restore, and restoring would fossilize a stale remote answer into a column the
read path never consults. Gate: `external_write_refusal_tripwire`; ledger:
`WC-2026-08-06-external-write-refusal`.

---

## 10. Search — SERVER-SIDE (2026-08-06)

There is no SQL surface to search: the value lives in a third-party API, so an
external search goes through the adapter, never through SQO
(`component_external.search` is still `{status:'unported'}` and THROWS — a
silently empty result set would look like "no matches").

The browser asks the engine; the engine asks the service through the ONE
outbound door. Until 2026-08-06 `service_autocomplete.js` (`zenon_engine`)
called the search endpoint DIRECTLY FROM THE BROWSER, which bypassed every
control in §5 — and, since the XSS-02 CSP dropped third-party origins from
`connect-src`, failed outright. Widening `connect-src` was the wrong fix twice
over: it reverses a deliberate hardening, and the origin would come from an
OPERATOR-EDITABLE ontology field.

| Piece | Owns |
|---|---|
| `descriptor_types.ts` | `ExternalSearchRequestContext` (terms, lang, fields, **limit + offset**), `ExternalSearchPayload` (`{rows, total}`), `searchEgress` |
| `services/<name>.ts` | `buildSearchRequest` + `unwrapSearch`. Optional: no implementation ⇒ the ENGINE cannot search that service, `capabilities.search` ⇒ the SERVICE cannot. A caller refuses loudly on either |
| `search.ts` | `searchExternalService` — the facade function. Resolves the binding, refuses, builds, fetches through `transport.ts`, decodes, id-codecs every hit |
| `core/api/handlers/dd_external_api.ts` | `dd_external_api::search` — the client action. Authenticated + CSRF-gated + READ permission on the caller component |

Six things that are contract, not detail:

1. **The client sends no URL, host, service name or field list.** Only the
   CALLER's `tipo` + `section_tipo`, the terms and a page. The target section
   comes from the component's `request_config`, the service from that section's
   `api_config`, the fields from each `component_external` node's own
   `properties.fields_map`.
2. **An empty query is refused before any socket** and answers an empty result.
   The browser's `ñ`-sentinel (which existed because Zenon answers an empty
   `lookfor` with its first ten records) is NOT ported: a magic string whose
   correctness depends on a remote tokeniser continuing to fail to match it is
   not a contract.
3. **`limit`/`offset` are caller-driven** (default 20). Above `MAX_SEARCH_LIMIT`
   is refused, not clamped; an offset that is not a whole number of VuFind pages
   is refused, not rounded.
4. **The lang is derived**, never hard-coded — the same alpha-2 helper and `en`
   default the record path uses.
5. **`searchEgress` is a SEPARATE declaration** (§6). A search sends free text a
   cataloguer typed; the record class cannot be true of it.
6. **Search results are NOT cached**, while rows are (§8): a query is free text,
   one per keystroke, and a stale RESULT SET is a wrong answer to "what is in
   the catalogue?" with nothing to mark. Identical IN-FLIGHT queries are still
   coalesced. `searchExternalService` also THROWS rather than degrading — a
   search has no other content to protect, and `[]` is a lie a user acts on.

Ledger: `WC-2026-08-06-external-search-request`. Gate:
`test/unit/external_search_native.test.ts` + the `query_terms` half of
`external_egress_tripwire`.

**KNOWN OPEN:** the CLIENT half. `service_autocomplete.js` still holds the
browser-direct `zenon_engine`; pointing it at `dd_external_api::search` is
tracked separately.

---

## 11. Gates

| Gate | Guards |
|---|---|
| `external_registry_totality_tripwire` | every declared engine/entity resolves to a registered adapter; unknown THROWS; every `api_config` parses; every `fields_map` well-formed; every adapter declares egress + capabilities + a round-tripping id codec |
| `external_outbound_tripwire` | ONE outbound door, and it still performs every step of §5 in order |
| `external_secret_confinement_tripwire` | §7, on BOTH publication paths + a no-third-path scan |
| `external_isolation_tripwire` | the closed set of module-level state; no captured request identity; concurrent langs/field sets never serve each other's row |
| `external_egress_tripwire` | §6, sentinel-driven; per-PATH classes (`egress` / `searchEgress`) |
| `external_degradation_tripwire` | §8.2 — no silent blank on any reachable (status, kind) pair; the maps are total; every label key is defined |
| `external_write_refusal_tripwire` | §9, five axes + a positive control |
| `external_client_render_tripwire` | the client half: text rendering, the visible marker, one `ui_base_url` consumer |
| `external_config_narrowing_census` | §3.5 — TRANSITIONAL RATCHET; delete when `deferred` is empty |

Behaviour twins (`test/unit/external_*_native.test.ts`): `cache`, `degradation`,
`emit`, `fields_map`, `multi_source`, `request_config`, `search`, `transport`,
`zenon`.
Census source: the FROZEN `test/fixtures/external/ontology_census.json`,
harvested from the application DB, because the gates must be credless and the
test DB holds a smaller ontology that would quietly assert less.

Operator knobs: `src/config/catalog/external.ts` (twelve `DEDALO_EXTERNAL_*`
keys; the rendered operator prose is `docs/config/config.md`). Cataloguer's
guide: `docs/core/system/external_services.md`.
