# WC-2026-08-09-dataframe-import-id-key-identity — a frame written with no caller pairing keeps id_key identity

- **Date:** 2026-08-09 (found while reviewing
  `WC-2026-08-09-export-raw-dataframe-own-column`, by the scratch probe
  "two frames same target different id_key, pairing null" — expected 2 kept,
  got 1).
- **Decision:** — (DEC-15 divergence; DEC-12 gate:
  `test/unit/relations_save_dataframe_identity_native.test.ts`).

### What was wrong

`validateRelationInsert` (`src/core/relations/save.ts`) had TWO duplicate gates
and a frame could only reach the right one with a caller ddo:

1. the frame gate — `dataframeEntriesEqual`, identity over
   `DATAFRAME_TEST_EQUAL_PROPERTIES`
   (`type, section_id, section_tipo, from_component_tipo, id_key,
   main_component_tipo`), reached ONLY when `context.pairing` was non-null;
2. the generic relation gate — a hash of
   `[section_id, section_tipo, type, tag_id]` (+`lang` when translatable).

`id_key` is absent from (2). So two frames pointing at the SAME target record
from DIFFERENT main items hashed identically, and the second was dropped as
"already linked" — silently, with no issue row.

`context.pairing` comes from `dataframePairingOf(source.caller_dataframe)`
(`save_component.ts`), and **an import has no caller ddo**: the CSV importer
writes every column through `saveComponentData({action:'set_data'})` with no
caller, so `pairing` was null on every imported frame and gate (1) was
unreachable there. The loud refusal that guards incomplete caller context is
itself gated on `callerDataframe !== null`, so an import did not refuse either —
it proceeded into the wrong gate.

`dataframeEntriesEqual`'s own header already warned against exactly this
("the generic relation dedup key … must NOT be used here: it omits id_key, so it
would reject a legitimate second frame pointing at the same target record from a
DIFFERENT main item"). The predicate was right; it was simply not reachable.

### Shape before

A main with two items, both linked to the same target record, each carrying its
own frame:

    slot value in:  [{…id_key:1, section_id:15657…}, {…id_key:2, section_id:15657…}]
    slot value out: [{…id_key:1, section_id:15657…}]        ← the id_key:2 frame is gone

Losing the frame does not merely lose a link: the surviving item keeps its frame
and the other item's framed content is unrecoverable from the file it came from.

### Shape after

Both frames are stored. Identity for ANY entry whose `type` is `dd490` is
`dataframeEntriesEqual`, whether or not a caller pairing was supplied:

    slot value out: [{…id_key:1, section_id:15657…}, {…id_key:2, section_id:15657…}]

A genuinely identical frame (same slot, same target, same `id_key`, same main)
is still dropped — that is unchanged, and is what keeps a re-import idempotent.

**Nothing is normalized on this path.** With no caller context there is nothing
authoritative to stamp, so the entry's own `id_key`/`main_component_tipo` — put
in the file by the raw export — ARE the identity. The paired (widget) path is
untouched: it still overrides client-sent pairing fields from the server's
caller context.

### Scope

Every door that writes a frame without a caller ddo: CSV import (both the new
per-slot column of `WC-2026-08-09-export-raw-dataframe-own-column` AND the
legacy in-cell `{"data"|"dato","dataframe"}` envelope, which routes through the
same `set_data`), and maintenance/tool writes. The widget save path is
unaffected — it always carries a caller and already used gate (1).

### Reason

`WC-2026-08-09-export-raw-dataframe-own-column` states that a raw export round
trips because "`id_key` re-pairs the frame with the main's item on the way back
in". That was true on the way OUT and false on the way IN: `id_key` was carried
in the file but never consulted for identity. This entry makes the claim true.

The bug PRE-DATES the export split — the legacy in-cell path called the same
`saveComponentData`, so frames collapsed there too. The split did not cause it;
it made the lossless claim load-bearing, which is how it surfaced.

### Gate reconciliation

- `test/unit/relations_save_dataframe_identity_native.test.ts` (NEW): with
  `pairing: null`, two same-target frames differing only by `id_key` are BOTH
  kept; a byte-identical frame is still dropped; a differing
  `from_component_tipo` or `main_component_tipo` is a distinct frame; a
  non-frame relation still uses the generic key (unchanged); and the paired
  path still normalizes. Mutation-verified: reverting the new arm turns the
  first case red.
- Existing dataframe gates are unchanged — the paired branch was not touched.
- **Re-harvest: NOT needed.** No PHP fossil covers a caller-less frame write;
  PHP's `validate_data_element` keys the frame gate on
  `component_dataframe::get_locator_properties_to_check`, which INCLUDES
  `id_key`, so this restores PHP-faithful behaviour rather than diverging from
  it.

### Known-open (not fixed here)

Frames already collapsed by a previous import are gone from the record and are
recoverable only from the source file. Separately, and named in the D19 fix:
frames written by an older import still carry the literal `type: 'dataframe'`
instead of `dd490` on disk — those are invisible to `isDataframeEntry`, so they
do not reach this gate at all and still need their one-shot repair.
