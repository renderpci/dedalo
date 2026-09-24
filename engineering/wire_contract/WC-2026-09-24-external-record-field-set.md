# WC-2026-09-24-external-record-field-set — one record request per remote record, carrying the section's whole field set + the id field

- **Date:** 2026-09-24 (`src/external/record_fields.ts`, applied in `src/external/cache.ts fetchExternalRows`).
- **Decision:** — (restores the v6 / frozen-PHP request shape that WC-2026-08-05-era
  per-component field sets had narrowed; companion of
  WC-2026-09-24-external-foreign-target-and-verbatim-id and
  WC-2026-09-24-external-record-4xx-is-not-found; gate:
  `test/unit/external_record_field_set_native.test.ts`).

This entry is about the OUTBOUND request to the external service (the Zenon
URL) and, through it, about the `entries` / `source_status` a component_external
emits. The Dédalo client wire keys are unchanged.

### Shape before (PHP — the fossil)

`component_external::get_dato` collected the remote field of EVERY component
child of the section whose `fields_map` has a `local:'dato'` entry
(`section::get_ar_children_tipo_by_model_name_in_section`), and asked Zenon once
per record with all of them:

    <api_url>?id=000903635&lgn=en&field[]=id&field[]=title&field[]=authors…

(the frozen `class.zenon.php` header example; `id` was there because the
installation maps a component to it).

### Shape before (TS, 2026-08 → 2026-09-24)

Each component_external asked for ITS OWN mapped fields only (the portal prepass
and the export prefetch unioned the fields of the components THEY predicted):

    <api_url>?id=000903635&lgn=en&field[]=title

Measured live against Zenon on 2026-09-24: Zenon answers exactly the fields it
is asked for, so the row came back WITHOUT `id`; the identity check
(`fields_map.ts defaultPickRow`: the row's id must equal the requested one)
refused it, and every column other than the id column emitted
`entries: []` + `source_status: { state: 'not_found', … }`. And one record cost
one GET — and one row-cache entry — per component (four per Zenon record).

### Shape after (TS)

ONE request per (service, section, remote id, data lang), whoever asks first (a
cell's own fetch, the read-path portal prepass, the export batch prefetch):

    <api_url>?id=000903635&lgn=en&field[]=id&field[]=title&field[]=authors&field[]=…

- `field[]` = the id field (the head of the model's `remoteIdPath`, default
  `id`) FIRST, then every field mapped by any component_external of the
  section's own subtree and of its REAL section's (virtual-aware), in ontology
  sibling order, deduped; then any field a caller named that the section does
  not map (none, under the ownership rule). A component with a malformed
  `fields_map` contributes nothing (it reports `misconfigured` itself).
- One row-cache entry per record: the cache key's field signature is that
  section-wide set, so it no longer fragments by requesting component (the key's
  other parts, and the api_url QUERY exclusion, are unchanged — `cache.ts`).
- Every component projects its own fields from that one row. The identity check
  is KEPT: a row whose id differs from the requested one is still `not_found`.
- Every row view the row layer builds names the fields it was requested with
  (`ExternalRowView.remoteFields`); a parked view is served to a component only
  when those cover the component's fields (`value.ts prefetchedRow`).

Emission: every mapped column of a Zenon record now carries its value (was
`not_found`); a record answered once costs one request instead of one per column.

### Reason

A value that exists upstream must not render as "not found", and the identity
check that refuses a wrong row must be able to see the row's id. The per-component
narrowing (a TS decision, argued as "don't ask for fields nobody asked to see")
coupled correctness to the service returning `id` unasked, which Zenon does not.
The section-wide set is ontology-derived and cached with the ontology lifecycle,
so an unrelated fields_map edit changes the request exactly when it changes what
the section can show.

### Gate reconciliation

No parity fixture holds an external emission or an outbound request; no
re-harvest. Behaviour: `external_record_field_set_native` (a stub returning ONLY
the requested fields: four columns of one record → four values, ONE request, the
id field first; callers naming different fields share one cache entry; a row
naming another id is refused). Contract edits in the same change:
`external_multi_source_native` (the batched request now also carries `id`),
`export_external_prefetch_degradation_native` (the request's field set, and the
self-describing coverage of a parked view).

## Addendum 2026-09-24 (b) — a field name the adapter refuses is that component's error, not the record's

### Shape before (TS, the entry above)

The section-wide set skipped a component whose `fields_map` failed to PARSE, but
a parseable map naming a remote field the ADAPTER refuses (Zenon splices names
into the URL and takes bare identifiers only — `dc:title`, `publication-dates`)
entered the union. `buildRecordRequest` then refused EVERY record request of the
section (`bad_config`, thrown before the fetch), so every component_external of
every record of that section emitted `entries: []` +
`source_status: { state: 'unavailable', … }` — retryable, the wrong cause — and
an export counted every such cell incomplete.

### Shape after (TS)

- An adapter may declare `acceptsRemoteField(field)` (Zenon: `/^[A-Za-z0-9_]+$/`,
  the same grammar `buildRecordRequest` still enforces as the last line).
  `record_fields.ts` leaves a refused name out of the section's set AND out of a
  caller's own fields, so the shared request is never poisoned.
- The component that maps it emits `entries: []` +
  `source_status: { state: 'misconfigured', … }` (`value.ts`, before any fetch)
  and the door logs one `external.bad_config` line naming the tipo and the name.
- Every other column of the record renders from the one request, as before the
  poisoned field was catalogued.

### Reason

The entry's own rule — one cataloguing error must not take the whole section's
record fetch down — applied to the error class it had missed; and an operator
must be sent to the fields_map, not to a service outage.

### Gate reconciliation

No parity fixture holds an external emission; no re-harvest. Behaviour:
`external_record_field_set_native` ("a remote field name the adapter refuses",
and the union case), mutation-verified (union filter, caller-field filter, the
component's own check — each reddens one case).
