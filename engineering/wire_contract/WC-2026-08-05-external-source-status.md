# WC-2026-08-05-external-source-status — the `source_status` provenance field on external values

- **Date:** 2026-08-05 (with WC-2026-08-05-external-derived-emission).
- **Decision:** — (DEC-12 gate: `test/unit/external_degradation_tripwire.test.ts`,
  behaviour in `test/unit/external_degradation_native.test.ts`).

### Shape before (PHP)

Two shapes, differing by MODE, and neither carried provenance:

- **edit** — `component_external`'s json controller emitted the component's
  `value` as `[null]` when the remote answered nothing;
- **list / tm** — the same failure emitted `value: null`.

Which of the two you got depended on which controller ran, not on what
happened. In every failure case — the service down, slow, returning a non-2xx,
returning a different record, the section's `api_config` malformed — the answer
was the same empty shape, so an empty field could not be told from a record
that genuinely has no author. v6 additionally cached the verdict in
`$_SESSION['zenon_is_available']`, so one bad response blanked the source for a
whole session, for that user, across every entity at once.

### Shape after (TS)

ONE shape in every mode — the WC-001 `entries: []` form — plus a
`source_status` object when, and only when, the values are not a plain
complete fresh success:

```json
"source_status": {
  "service": "zenon",
  "state": "stale",
  "label_key": "external_source_stale",
  "retryable": true,
  "stale_since": 1754380000000
}
```

- `state` is a CLOSED set: `ok` | `stale` | `unavailable` | `timeout` |
  `not_found` | `circuit_open` | `disabled` | `misconfigured`.
- **`state: 'ok'` NEVER reaches the wire.** A clean success omits the whole
  field, so the happy path is byte-identical to an emission with no provenance
  concept at all. The single nuance: a fresh row whose values hit an emission
  ceiling emits the field with `state: 'ok'`, `label_key:
  'external_source_truncated'` and the drop counters — the row was fine, the
  loss was ours, and it is named rather than hidden.
- `label_key` is a KEY into `src/core/labels/master.json`, never prose: the
  message a user reads must be translatable, and the server does not know the
  user's application language at this depth. Eight keys ship with this entry
  (`external_source_{stale,unavailable,timeout,not_found,circuit_open,disabled,misconfigured,truncated}`).
- `retryable` is FALSE exactly where waiting cannot help — `not_found`,
  `disabled`, `misconfigured` — so a client does not offer a retry that will
  hammer a host which will never answer.
- `stale_since` (epoch ms) rides only on `stale`.
- The optional `dropped_over_count` / `dropped_over_length` /
  `dropped_unrenderable` counters report what the emission ceilings did.

Nothing is per-session and nothing is per-user: the state is computed from the
row view for THIS read (see the isolation tripwire — v6's `$_SESSION` flag is
the request-identity bleed this design exists to avoid).

### Reason

"The source did not answer" and "this work has no author" look identical on
screen, and a cataloguer will act on the difference — one is a data gap to
fill, the other is an infrastructure problem to report. A heritage record must
still render when a third party is down, and the gap must be explained. The
mode-dependent PHP shapes were never a contract, only an artifact of which
controller ran; unifying them on `entries: []` is the WC-001 rule (the
byte-identical client's lifecycle code crashes on a null `entries`).

### Gate reconciliation

`external_degradation_tripwire` asserts, for every reachable (row status, error
kind) pair, that the emitted item's `entries` is a string array (never `null`,
never `[null]`) and that its `source_status.state` is the EXPECTED one; that
the state→label/retryable maps are total over the closed set; and that every
`label_key` is DEFINED in the labels master and looks like a key rather than a
sentence. `external_degradation_native` covers each state end to end, including
the identical empty shape in `edit`, `list` and `tm`. `labels_tripwire` covers
the new keys' definition and catalog integrity.

**No parity fixture is affected**: no fixture in the frozen oracle-harvest
store holds a data item for any `component_external` tipo, so no gate has a PHP
empty shape to reconcile against. **Re-harvest: NO — impossible by definition.**
