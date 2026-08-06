# WC-2026-08-06-external-search-request — external search moves from the browser into the engine

- **Date:** 2026-08-06 (the last gap of the external-record subsystem;
  engineering/EXTERNAL_SPEC.md §10 was "DECLARED, UNIMPLEMENTED" until today).
- **Decision:** — (DEC-12 gates shipped with it:
  `test/unit/external_search_native.test.ts` plus the `query_terms` half of
  `test/unit/external_egress_tripwire.test.ts`, which is already registered in
  `engineering/TRIPWIRES.md` + `scripts/verify.ts`).
- **Re-harvest: NO — impossible by definition.** The oracle is frozen; this
  entry records a deliberate contract edit.

### Shape before

`client/dedalo/core/services/service_autocomplete/js/service_autocomplete.js`
(`zenon_engine`, ~:857-1110) issued the search itself, as a cross-origin
`XMLHttpRequest` from the CURATOR'S BROWSER:

```
POST https://zenon.dainst.org/api/v1/search
     ?lookfor=<q>&type=AllFields&sort=relevance&limit=20&prettyPrint=false&lng=de
     &field[]=<f>…
```

with the URL taken from the published `api_config.api_url_search` (falling back
to a hard-coded literal), `limit` frozen at `20`, `lng` frozen at `de`, and an
empty query replaced by the sentinel string `ñññññññ---!!!!!` — because Zenon
answers an empty `lookfor` with its first ten records. The answer was then
reshaped in the browser by `format_data` into a fabricated server response.

Being browser-direct, it went round EVERY control the subsystem has
(EXTERNAL_SPEC §5): the master and per-service kill switches, the operator's
host allowlist, `assertPublicUrl` + the socket pin, the circuit breaker, the
concurrency ceiling, the streamed byte cap, the retry policy and the egress
classification. None of them can see a request the server never makes. It also
could never work for an authenticated service — a credential that reaches a
browser is a published credential.

Since the XSS-02/RC-01 hardening (2026-07-28) it did not work at all: the app's
own CSP names no third-party origin in `connect-src`, so the browser refused the
call and the XHR surfaced a bare "There was a network error". **The fix is not
to re-open `connect-src`** — that directive would then have to name a host read
out of an OPERATOR-EDITABLE ontology field, i.e. a cataloguer could aim the
browser's connect policy at any host.

### Shape after

The browser asks the engine (`dd_external_api::search`, authenticated +
CSRF-gated), the engine asks the service through the ONE outbound door
(`src/external/transport.ts`), which puts the request behind the host allowlist,
`assertPublicUrl` + socket pinning, the credential-after-vetting order, the
breaker, the concurrency ceiling, the byte cap and the retry policy.

The wire form the ENGINE now sends, which is byte-identical to the browser's on
the default page:

```
POST <api_url_search>?lookfor=<q>&type=AllFields&sort=relevance
     &limit=<n>[&page=<p>]&prettyPrint=false&lng=<alpha2>[&field[]=<f>…]
```

Four deliberate divergences, each gated:

1. **`lng` is derived from the request's data lang**, through the same
   `getAlpha2FromCode` helper and the same `en` fallback the record path uses
   (`lgn`). The browser sent the literal `de` for every user in every
   installation, so a Spanish or English cataloguer was reading German labels.
2. **The empty-query sentinel is REMOVED, not ported.** An empty (or
   whitespace-only) query is refused in the engine BEFORE any socket and answers
   an empty result; the adapter refuses it again. A magic string whose
   correctness depends on a remote tokeniser continuing to fail to match it is
   not a contract — the day Zenon indexes it, the sentinel starts returning
   records. `external_search_native` asserts the literal is absent from the
   engine and that zero fetches happen on an empty query.
3. **`limit` and `offset` come from the caller**, defaulting to `limit: 20`
   (the old literal). `offset` is expressed as VuFind's 1-based `page`; page one
   omits the parameter entirely, which is what keeps the default byte form
   identical. An offset that is not a whole number of pages is **REFUSED**, not
   rounded — VuFind cannot express it, and answering the neighbouring window is
   a wrong answer that looks right. A limit above `MAX_SEARCH_LIMIT` (100) is
   refused rather than clamped, because a clamped page is indistinguishable from
   "the service has no more".
4. **The values are emitted by the engine's ONE emission function**
   (`mapRowToEntries`), so a search cell obeys the same declared `format`s, the
   same per-entry length/count ceilings and the same refusal counting as a
   record read. The browser had its own ad-hoc formatter (author roles joined
   with `' - '`, arrays with `', '`) that agreed with nothing else in the
   engine; the normalisation rules are those of
   `WC-2026-08-05-external-entry-normalisation`.

**Egress.** `zenon` now declares TWO classes: `egress: 'record_identifiers'` for
the record path and `searchEgress: 'query_terms'` for the search path. One field
could not be honest about both — a search sends free text a cataloguer typed,
which is strictly heavier than a set of ids. `external_egress_tripwire` holds
each path to its own class, and proves a record request *cannot* carry terms:
`ExternalRecordRequestContext` has nowhere to put one.

**Caching.** Search results are NOT cached (records still are). A query is
free text, one per keystroke — an unbounded key space with a near-zero hit rate
— and a stale RESULT SET is a wrong answer to "what is in the catalogue?" with
nothing to mark it, unlike a stale ROW which carries a `stale` marker.
Identical **in-flight** queries are still coalesced. Reasons stated in the
`src/external/search.ts` header; both halves gated.

### Client-visible payload

The action returns the shape the client's `format_data` fabricated, so the
rendering path downstream is untouched:

```json
{ "result": { "context": [ <the show ddo_map> ],
              "data": [
                { "section_tipo": "zenon1", "tipo": "<caller tipo>",
                  "typo": "sections",
                  "entries": [ { "section_tipo": "zenon1", "section_id": "001338683" } ] },
                { "section_tipo": "zenon1", "section_id": "001338683",
                  "type": "dd687", "tipo": "zenon4", "mode": "list",
                  "entries": [ "Coinage of the Roman provinces" ] }
              ] },
  "msg": "OK. Request done",
  "total": 137, "limit": 20, "offset": 0 }
```

`section_id` is the remote id in STORAGE form — the zero-padded string, never a
number. `total`/`limit`/`offset` are ADDED keys (the browser engine could not
report a total at all); the client ignores unknown keys, so the envelope widens
without changing.

**What the client may NOT send:** a URL, a host, a service name or a field list.
The request carries only the caller component's `tipo` + `section_tipo`, the
terms and a page; the target section comes from the component's
`request_config`, the service from that section's `api_config`, and the field
list from each `component_external` node's own `properties.fields_map`. A client
that could name any of those would be the browser-direct call again, wearing the
engine's socket.

### Known open

`service_autocomplete.js` still holds the browser-direct `zenon_engine`; pointing
it at this action is the CLIENT half of the same change and is tracked
separately. Until it lands, the search box remains broken in exactly the way it
has been since 2026-07-28 — no regression, and no new one.
