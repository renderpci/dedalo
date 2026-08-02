# WC-2026-08-02-observer-relay-writes-nothing — the observer trigger relay re-saves nothing

- **Date:** 2026-08-02 (D1, the relay branch of the observer cascade).
- **Decision:** — (write-path side-effect rule; DEC-12 gates shipped with it:
  `test/unit/observer_cascade_native.test.ts`).

### Shape before (PHP)

PHP's DEFAULT observer branch (no `perform`, observer not an info model — v6
`class.component_common.php:1651-1660`) reads the observer component's value,
sets `observable_dato` to that value WITH REFERENCES
(`get_dato_with_references()` for `component_relation_related`, `get_dato()`
otherwise) and calls `$component->Save()`. The value DOES NOT CHANGE — the
re-save exists purely to re-enter `propagate_to_observers` (:1372); it is a
trigger relay, a dependency edge (the live edges: `numisdata161 →
numisdata36`, `tch241 → tch40`; the ontology's own comment documents the
chain numisdata161 saves → fires numisdata36 → fires numisdata77). But
`Save()` carries side effects: a `matrix_time_machine` row for the unchanged
value, a bump of the record's modified stamps (dd197/dd201), an activity-log
line, and a live-column rewrite of identical bytes.

### Shape after (TS)

The relay in `src/core/section/record/observers.ts` is modelled as
**write:'none' + payload 'with references'**: it reads the observer's value
with references (`getStoredWithReferences` — same model dispatch as PHP) and
re-enters propagation through the bounded D2 dispatch, writing NOTHING — no
TM row, no dd197/dd201 bump, no live-column write, no activity line. The
relay also contributes nothing to the save response's `observers_data` (PHP
merges the re-saved observer's component JSON for same-record targets; the
shipped relay edges are all `use_self_section:false`, so no live config ever
produced such an item anyway).

Relay execution is UNCONDITIONAL: the `DEDALO_OBSERVER_CASCADE` rollout flag
that briefly gated it was retired the same day it landed (see
WC-2026-08-02-observer-cascade-bounded-flag — the benchmark cleared the
cascade, and a deploy flag over declared edges meant data divergence between
identical installs). Every declared relay edge re-enters the bounded D2
dispatch.

### Reason

The re-save's side effects are pure noise at best and wire divergence at
worst: a TM row for an unchanged value pollutes the record's history (and TM
restore surfaces), a modified-stamp bump misreports WHO/WHEN for a record no
user touched, and an identical-bytes rewrite is a wasted write inside the
hot save path. The relay's ONLY semantic content is the child propagation
event, which TS preserves exactly (payload = the value with references).

### Gate reconciliation

`test/unit/observer_cascade_native.test.ts` — the unconditional-cascade
convergence gate (gate 1; no mode exists since the flag's retirement)
asserts the relay observer's stored bag stays byte-identical and holds
ZERO `matrix_time_machine` rows while its child recompute lands normally. No
parity fixture replays observer writes, so no fixture is affected. **No
re-harvest** (impossible anyway): the read-path store never contained a
relay re-save's TM row.
