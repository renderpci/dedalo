# WC-2026-09-24-external-record-4xx-is-not-found — a record-path 4xx is that record's `not_found`, not the source's `unavailable`

- **Date:** 2026-09-24 (breaker evidence law + no-flood logging, `src/external/{breaker,transport,cache,errors}.ts`).
- **Decision:** — (amends the state mapping of WC-2026-08-05-external-source-status;
  gate: `test/unit/external_breaker_evidence_native.test.ts`).

### Shape before (TS, 2026-08-05 → 2026-09-24)

A RECORD request the service answered with `400`/`404`/`410`/`422` surfaced as
`source_status: { state: 'unavailable', label_key: 'external_source_unavailable',
retryable: true }` (reason `http_status`), and — worse, off the wire — three of
them counted as service failures and opened the circuit, so EVERY later external
value on the install (other records, other users) emitted
`state: 'circuit_open'` for a whole cooldown. (PHP had no such state at all: the
empty `[null]` / `null` fossil of WC-2026-08-05-external-source-status.)

### Shape after (TS)

- Record path, `404`/`410` (record gone) and `400`/`422` (the service rejected
  the id): `source_status: { state: 'not_found', label_key:
  'external_source_not_found', retryable: false }`, negative-cached for the soft
  TTL — the same shape as a 200 that does not contain the record.
- `401`/`403`/other 4xx: unchanged (`unavailable`, reason `http_status`).
- No 4xx (except 408/429) opens the circuit any more, so a bad id no longer turns
  every other record's value into `circuit_open`.

### Reason

The source ANSWERED, definitively, and the same request answers the same way:
`unavailable` said "the source could not answer, retry", which is false twice
and made the client offer a retry that can never succeed. The measured case
(2026-09-24, install DB): Zenon answers `400 Error loading record` for an
unpadded or local id; three of them blacked out Zenon for the whole install.

### Gate reconciliation

No parity gate covers it (external values are TS-native; the fixture store
holds no external emission), so no re-harvest. Behaviour:
`external_breaker_evidence_native` (record-path cases); the state map's
totality stays `external_degradation_tripwire`.

## Addendum 2026-09-24 (b) — an endpoint that answers 4xx for EVERY id is the source failing

### Shape before (TS, the entry above)

Every record-path 400/404/410/422 was that record's `not_found`, whatever the
rest of the endpoint's answers were. A wrong `api_url` path, a moved record
route or a changed id format answers 4xx for EVERY id: every cell said
`not_found`, 404s were not logged, nothing was counted, the breaker ignored it
(by its evidence law) and an export, which does not record `not_found`,
reported itself complete with every external column empty.

### Shape after (TS)

- Per (service, record endpoint = scheme + host + api_url PATH), record-path 4xx
  answers since the endpoint last delivered a record (any 2xx) are counted
  (`src/external/record_answers.ts`). Below 20 in a row: unchanged — `not_found`.
- From the 20th on: `source_status: { state: 'unavailable', label_key:
  'external_source_unavailable', retryable: true }`, reason `http_status`, not
  negative-cached; an export records the cell as degraded (incomplete,
  retryable). One `external.http_status` line names the streak, the statuses and
  the api_url path (at most once per 10 minutes per endpoint), and the counter
  `external_record_endpoint_suspect` moves. The breaker is still not moved.
- One delivered record answer ends it: a 4xx is again that record's `not_found`.
- The per-record 400/422 log line is deduped per failure CLASS (service, kind,
  origin, status, section, detail), no longer per id: an API-wide rejection is
  one line per window, not one stack per record (`errors.ts logDedupKey`).

### Reason

A missing record is ordinary; twenty in a row with nothing delivered is not how
a working catalogue answers, and reading them one by one made a dead
integration look like an empty catalogue, with no signal to the operator or
the export user. The heuristic being wrong once costs a "could not be read"
that a re-run clears; it never opens the circuit.

### Gate reconciliation

No parity fixture holds an external emission; no re-harvest. Behaviour:
`external_breaker_evidence_native` ("a record endpoint that answers 4xx for
EVERY id is not silent", and the per-class dedup case).
