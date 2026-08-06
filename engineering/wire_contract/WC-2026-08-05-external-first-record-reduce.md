# WC-2026-08-05-external-first-record-reduce — the blind first-record reduce is replaced by an id-matching `pickRow`

- **Date:** 2026-08-05 (with WC-2026-08-05-external-request-field-union and
  -external-entry-normalisation, whose row-selection bullet points here).
- **Decision:** — (DEC-12 gates: `test/unit/external_transport_native.test.ts`,
  `test/unit/external_zenon_native.test.ts`,
  `test/unit/external_multi_source_native.test.ts`).

## Shape before (v6 / frozen v7 PHP)

`class.component_external.php` decoded the response, took the row array, and
reduced it:

```php
$row_data = array_reduce($ar_records, function($carry, $item){ return $item; });
```

Whatever the array ended with became "the record". The engine could not tell a
one-hit answer from a ten-hit one, and never compared the returned id with the
requested one.

## Shape after (TS)

`defaultPickRow` (`src/external/fields_map.ts`) returns the row whose **encoded
id equals the requested id**, and `null` otherwise. A `null` becomes the row
status `not_found` — carried to the wire as `source_status.state:'not_found'`,
`retryable:false` (WC-2026-08-05-external-source-status) — and is
negative-cached, so a record deleted upstream does not become one remote call
per page view.

An adapter may override `pickRow`; none does. The id path is `remoteIdPath`
(default `'id'`), and comparison is on the ENCODED form: the row's raw id is
`String()`-ed and run through `encodeRemoteIdWith`, so **the adapter's codec —
not this function — decides equality**.

What that means for Zenon, stated exactly, because the codec is where the
subtlety lives (corrected 2026-08-06; the entry previously claimed the
opposite): Zenon declares **no** `encodeRemoteId`, so `encodeRemoteIdWith` is a
shape check plus the IDENTITY. A service answering `"id": 1338683` (a JSON
number, which cannot carry leading zeros) therefore encodes to `'1338683'` and
does **not** match the stored `'001338683'` — the row is `not_found`, reported
through `source_status`, never a wrong record. That is the safe direction and
the deliberate one: the storage form is authoritative, and a codec that
canonicalised padding would be guessing which zeros the service dropped.

An adapter that needs the number form to match must declare the canonicalising
`encodeRemoteId` itself — a per-service behaviour change with its own entry, not
a silent default. Nothing in the tree needs one today.

## Reason

The three failures the reduce produced are all silent and all wrong in the same
direction — they put SOMEONE ELSE'S bibliographic record into a heritage
record's field:

1. a search-shaped answer to a record query rendered its last hit as if it were
   the requested work;
2. an upstream id change (or a deletion answered with a near match) silently
   swapped the record instead of reporting it;
3. a proxy or error page whose body happens to decode to a one-element array
   rendered as data.

A cataloguer has no way to detect any of them: the field is populated, plausible
and wrong. "Not found, and here is why" is the only honest answer, and it is
what the degradation contract already knows how to render.

## Measured effect on this installation

None observable in the frozen store: every Zenon record fixture answers exactly
the record asked for, so both rules select the same row. The divergence is
protection against an answer this installation has not yet received — which is
precisely why it is ledgered rather than left to a comment.

## Gate reconciliation

`external_zenon_native` pins the request bytes and the id codec;
`external_transport_native` drives the door around the pick;
`external_multi_source_native` covers a multi-row answer that does NOT contain
the requested id, asserting `not_found` rather than a first-row value.

**No parity fixture is affected**: the frozen oracle-harvest store holds no
data item for any `component_external` tipo, and `zenon1` has zero rows in every
matrix table — there is no recorded PHP response for this seam to reconcile
against. **Re-harvest: NO — impossible by definition.**
