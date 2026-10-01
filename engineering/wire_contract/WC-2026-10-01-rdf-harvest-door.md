# WC-2026-10-01-rdf-harvest-door — `tool_import_rdf` dereferences IRIs through the harvesting door

- **Date:** 2026-10-01.
- **Decision:** `engineering/OUTBOUND_SPEC.md` §2 — a URL a cataloguer pasted is
  fetched through `harvestFetch`; the last tool row of the raw-door list
  (`test/unit/ssrf_one_guard_tripwire.test.ts`) is deleted. Code:
  `tools/tool_import_rdf/server/index.ts` (`fetchRdfXml`, `loadRdf`, `loadRdfBatch`,
  `RDF_MAX_URIS`); new code `tool.too_many_items` (`src/core/errors/registry.ts`).
- **Shape before:** `get_rdf_data` fetched `<iri>.rdf` (suffix always appended)
  through `fetchGuardedText`, which refuses every redirect: a linked-data server
  answering with a 303 See Other or a 301 to https failed as
  `security.outbound_failed`. `data.rdf[].uri` / `data.errors[].uri` were the
  suffixed URL. No limit on `ar_values`.
- **Shape after:**
  - The IRI itself is asked first (`Accept: application/rdf+xml, application/xml;q=0.9,
    text/xml;q=0.8`; only RDF/XML or XML accepted); redirects are followed hop by hop
    under the door's rules. A 4xx other than 408/429, or a 2xx that is not XML, is
    retried ONCE at `<iri>.rdf` (http(s) only; fragment and trailing slashes dropped;
    never when the IRI already ends in `.rdf`, any case), where
    `application/octet-stream` and `text/plain` are accepted too. A 5xx, 408 or 429
    is final.
  - `uri` (both lists) is the IRI as sent, not the URL that answered.
  - New per-URI `error.code`s: `harvest.robots_disallowed`,
    `harvest.robots_unavailable`, `harvest.unexpected_type`, `harvest.refused`,
    `harvest.too_large`; `security.ssrf_blocked` may now come from a redirect hop.
    `security.outbound_failed` remains for an HTTP error status on both forms, a
    timeout, a network failure. When both forms fail, the IRI's own failure is
    reported (also over a refusal of the guessed address), except a status-only
    IRI failure beside a wrong-type `.rdf` answer, which reports the latter
    (`tellingFailure`).
  - `ar_values` that is not an array of strings fails the CALL: 400
    `request.invalid_options` (a non-string item used to be fetched as text).
  - More than 3 `ar_values` fails the CALL: 400 `tool.too_many_items`
    (public, `details: {count, limit}`), before any fetch.
- **Reason:** the single-call door's redirect refusal made the tool fail on the
  servers it exists for; robots.txt and per-site pacing are owed to every site a
  tool reads. The cap bounds the paced work one interactive call can queue; it
  does NOT guarantee an answer inside the client's 60 s timeout (a Crawl-delayed or
  busy site can exceed it even for one IRI). The client sends one IRI.
- **Gate reconciliation:** no parity fixture covers `get_rdf_data`; no re-harvest.
  Gates: `test/unit/tool_import_rdf.test.ts` (scripted site through the door's `hop`
  seam), `test/unit/ssrf_one_guard_tripwire.test.ts` (no tool holds a raw door; the
  census sees this tool holding `harvestFetch`).
