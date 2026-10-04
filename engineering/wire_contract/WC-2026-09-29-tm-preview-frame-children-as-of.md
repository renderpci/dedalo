# WC-2026-09-29-tm-preview-frame-children-as-of — the Time Machine preview shows a frame's children as of the row, not live

- **Date:** 2026-09-29.
- **Decision:** the user's report: the `tool_time_machine` preview of
  `numisdata32` (`numisdata3/1`, slot `numisdata251`, frame target `rsc1242`)
  always showed the live rating chip. Its frames were already read from the
  history row. The frame CHILDREN (the rating `rsc1246` on `rsc1242/585`,
  which has its own history rows) were read from the live target. DEC-12 gate:
  `test/unit/tm_preview_frame_as_of_native.test.ts`.
- Code: `src/core/tm_record/frame_as_of.ts` (the law, the per-read as-of
  cache, the row bound `tmAsOfRow`, the row frame state `rowFrameState`),
  `lane_state.ts componentValueAsOf`, `db/time_machine.ts`
  `nextVisibleRowAfter` + `readKeyLanesAt`, the three hooks in
  `relations/relation_core.ts`, `section/read.ts resolveTmPreview`, and
  `resolve/read_tm.ts graftRowFrameState` + `snapshotCellEmission` (the
  history list, below).

## Shape before (PHP, and TS until this entry)

A preview (`get_data` with `data_source: "tm"` + `matrix_id`) grafted the
row's value and frames onto the main. It read everything reached THROUGH a
frame live:
- the frame children at each frame target (`relation_core.ts
  emitDataframeItem`, `loadRecordCached`);
- the frame bag of a SIBLING-anchored slot, i.e. frames stored on another
  section's record at the same id (`numisdata75` on `numisdata3/N` keeps them
  on `numisdata4/N`).

So a rating edited after the row previewed its new value, and a target emptied
by the `delete_target` policy previewed blank.

## Shape after (TS)

The preview SUBJECT's frame children, and its sibling frame bag, are read AS
OF THE ROW. The wire shape is unchanged: same items, same keys. Only the
values of the frame children, the sibling bag's `entries` and its
`pagination.total` change.

**The bound law.** R is the previewed main row. N is the next visible row
after R of the same main key (section, id, main tipo, any lane) OR of the
record's own section-level key (section, id, tipo = section_tipo: the delete
snapshot, an archive restore's snapshot), whichever comes first.
- Why the section-level arm: a whole-record delete writes its snapshot under
  the section tipo and nothing on the main key, then its commit-lane frame
  policies (`delete_target`) wipe every frame target ABOVE the snapshot row.
  Without the arm the main's newest row had no N, B was +inf, and the preview
  of a deleted record (the view that decides whether to recover it) showed
  its targets already wiped — a state that never existed at R. An undelete
  does not reopen the interval: the snapshot row stays the first boundary.
- The main held R's state over [R, N). Another record "as of R" is its state
  at the END of that interval: bound B = N-1, or +inf when no such N exists.
- For the main's own keys, "<= B" is "<= R", because no main row lies inside
  (R, N). This is the engine's one law, generalized; there is not a second
  one.
- Plain "<= R" was rejected. It makes the newest row preview DIFFERENT from
  live: the UI links a frame first and fills the target afterwards (dev DB:
  link 51581270 < rating 51581271), so the frame-introducing row, often the
  newest, would preview a blank rating while live shows 3.
- Guarantees:
  - the newest row previews == live whenever history is complete;
  - a link-then-fill previews the fill;
  - a pre-unlink row of a `delete_target` slot previews the target's
    pre-wipe values. The wipe runs on the commit-only lane, so its rows lie
    above the unlink row, and the gate pins that ordering.

**Per frame child** (target T, child C, read under its data tipo):
- **UNSLICED** (relations, numbers, dates): one lane, whatever the row's tag.
  The value is the newest visible row at or below B, main part only. If rows
  exist but all lie above B, the child previews EMPTY.
- **SLICED:** EVERY language lane, judged on its own:
  - a lane with a speaking row at or below B takes that row;
  - a lane whose rows all lie above B is empty — and so is a lane whose
    rows at or below B are all frames-only (nothing there speaks for a
    value, so its live items were written after B, or never recorded);
  - a lane history never recorded keeps its live items.

  Frames-only rows are skipped for the next older one. Untagged pre-migration
  rows speak for nothing. A translatable key's lg-nolan lane never speaks.

  This differs from the MAIN's preview, which shows other languages live. The
  difference is deliberate: a target has no row lane and nothing restores it,
  so its honest picture is the whole record at B. View-lane-only would let the
  emission's language fallback mix live and historical text.
- **No visible row at all:** the child keeps its LIVE value. History is
  silent, e.g. an import with the time machine off.
- **Dead generation:** when T's address has an epoch (it was reborn) and the
  LIVING generation wrote no visible row at or below B, it did not exist at
  B — the address was empty or held another record. The epoch alone is not
  the birth: it sits just past the dead generation's last row, and the
  rebirth may come much later, so "epoch > B" misses B in [epoch, rebirth).
  Every grafted child previews EMPTY on a VIRTUAL record (never a clone of
  the living stranger), never the stranger's value. Never at the unbounded
  bound (the newest row), and never for an address with no epoch. A
  generation reborn with no history row until after B (explicit-id import,
  time machine off) is judged dead there: nothing proves it existed.
- **Live row gone:** if some child spoke, T renders from a virtual record.
- **T's own archive restore.** An `archive/restore.ts` overwrite rewrites T
  and records ONE whole-record snapshot row (tipo = T's section_tipo), no key
  rows. When T's newest visible whole-record row at or below B is such a
  restore (classified exactly as the sibling anchor's, below), it FLOORS every
  child: the child's base is the snapshot's value; key rows at or below the
  snapshot are superseded; only key rows in (snapshot, B] speak over it (per
  lane for a sliced key); a lane with rows only above B keeps the snapshot's
  items. The snapshot is recorded history, so the child is never "silent"
  there. A DELETE snapshot does not floor (see the caveat on a target deleted
  and not reborn). The same lifecycle law the sibling bag applies, on the
  children path.

**Sibling bag.**
- A sibling slot save is filed at the slot-holding record under the caller
  main: (sibling, N, main). The gate asserts this first.
- The bag as of B is that key's frame state at or below B, run through the
  same slot-frame law `applyTmGraft` uses. That law is hoisted into
  `frame_as_of.ts recordedSlotFrames`, so both doors read it from one place.
- Other mains' frames in the same slot stay live.
- If no frame state was ever recorded there, the live bag is kept.
- **The anchor's own lifecycle.** The bound is computed on the MAIN's record,
  and deleting the ANCHOR writes nothing there. So the anchor's newest
  visible whole-record row (tipo = its section_tipo) at or below B, when
  NEWER than that frame state, supersedes it:
  - a DELETE: the anchor did not exist at B — the slot previews no frames at
    all, other mains' included (door 1 and door 3 alike; door 3 judges the
    anchor's live existence on the real row, never its virtual stand-in);
  - an archive RESTORE: the slot previews the snapshot's frames of this main.
  - a REBIRTH after B (explicit id, an epoch): the dead generation's rows are
    hidden, so no whole-record row is seen. The anchor is judged by the frame
    targets' one generation law (`deadAtBound`): its living generation did not
    exist at B, so the slot previews no frames at all, other mains' included
    — never the living stranger's bag.

  A delete snapshot and a restore snapshot share one shape, so the row is
  classified by what the address wrote NEXT: a key save means it existed (a
  restore); another whole-record row reads as the restore of a deleted record
  (an explicit-id rebirth's epoch hides the delete row altogether); nothing:
  a delete while the anchor is gone now, a restore while it lives.

**Door-3 sibling servability widening.** The frame widget of a sibling slot is
read directly with `section_tipo` = the sibling and `matrix_id` = a row of the
MAIN's record (`numisdata4/N` + a `numisdata3/N` row). `tmRowBelongsToRecord`
refused it because the section differs, so that widget previewed EMPTY. It is
now served only when ALL of these hold:
- the model is `component_dataframe`;
- the caller pairing is complete and names the row's main;
- `section_id` equals the row's;
- the main's own config declares this slot on this section;
- the row belongs to the main's living record (its epoch).

Anything else stays `served:false` (`[]`), as before.

**Confinement.** Only the subject's own frames read as of B: the frames of
the row's main emitted from the EMISSION ROOT, matched by object IDENTITY,
never by address (`TmAsOf.root`, `frame_as_of.ts subjectRowOf`). The preview
roots at a CLONE of its own record (`section/read.ts tmPreviewEmission` — never
the live object `record_loader` answers for the same address), the list at its
virtual dd15 row record. So the subject's OWN record met again NESTED (a
portal target, or a frame target's child, pointing back at it) is another
object and stays entirely live, bag and children, on both surfaces alike — an
address match paired that nested live bag with as-of children in the preview
while the list cell showed it live. The one top-level expansion of a direct
dataframe read gets the bound. No nested expansion does. Within that
expansion the bound is applied PER FRAME: only a locator whose
`main_component_tipo` names the row's main (`frame_as_of.ts isSubjectMain`,
the same test `frameTargetsAsOf` makes) reads as of B. Another main's frame in
a shared slot — the caller pairing naming it, or no pairing — keeps its LIVE
children, as its frame stays live.

## What stays live

- The main portal's own target content and chip labels.
- Datalists and option labels (the rating term).
- A frame child's own targets' labels. Their LOCATORS are as of B, their
  labels are not.
- Derived children (`component_info`) and models with no matrix jsonb column.
- Every nested dataframe, bag and children together — the subject's own
  record met again nested included.
- Every read other than a TM preview or a framed TM-list row.
  `EmissionContext.tmAsOf` has exactly two producer surfaces:
  `section/read.ts resolveTmPreview` (the preview's row) and
  `resolve/read_tm.ts` (`graftRowFrameState`: one bound per framed
  history-list row; `snapshotCellEmission`: one per framed cell of a
  whole-record row — both rooted at the virtual dd15 record); null everywhere
  else.

## The history list (dd15 cells) shows what the preview shows

The tool's history LIST is the dd15 virtual section: one virtual record per
row (`tm_record.ts buildTmSectionRecord`), each cell emitted from it. Its
frame cells read only the frames the ROW'S OWN snapshot carried, so they
disagreed with the preview of the same row.

**Shape before (TS until this entry), measured on built situations:**
- A LANGUAGE-lane row of a lang-sliced literal main (a translatable
  `component_input_text`; a `component_iri` with its fixed `dd560` label
  slot) carries no frame: its frame cell was EMPTY while its preview showed
  the frames it stood with (the newest frame state at or below it).
- A RELATION main's frame cell was ALWAYS empty, whatever the row: its slot
  ddo declares the main's own section (`section_tipo` = the record's
  section), which `emitDataframeItem` compared with the virtual record's
  section (`dd15`) and so read a "sibling" bag at `<section>/<dd15 row id>`
  — a record that does not exist (or, worse, an unrelated one).
- Frame CHILDREN (a rating on a frame target) and a sibling-anchored bag
  read LIVE, while the preview reads them as of the row's bound.
- Frames-only lg-nolan rows and composed rows (relation, number) already
  carried their frames; their children were still live.

**Shape after (TS).** For a row of a main with declared slots (non-empty
`resolveDataframeSlotTipos`; a main model with a jsonb column, never a
slot):
- each slot of the virtual record holds the frame state AT the row —
  `frame_as_of.ts rowFrameState`, the SAME function the preview graft reads
  (`readRowLaneState` + `recordedSlotFrames`), never a second law;
- the row's cells emit under their OWN `EmissionContext` over the same items
  array, carrying the row's bound (`tmAsOfRow`, the preview's one bound
  computation) ROOTED at the virtual record (`TmAsOf.root`,
  `frame_as_of.ts rootedAt`). `subjectRowOf` maps the root to the subject
  (the row's section + id): confinement matches ONLY the root, by identity
  (the subject's live record met as a portal target inside the list stays
  live — as in the preview),
  and the frame bag, a sibling anchor and its as-of bag are addressed by the
  subject, never by the dd15 id. One emission per row keeps the per-read
  as-of cache sound: its key omits the bound because the bound is constant
  per emission.

So every listed row's frame cells (ids, `pagination.total`) and frame
children equal its preview's. Wire shape unchanged: same items, same keys;
only `entries` / `pagination.total` of frame items and the values of frame
children change.

**The client reads each row's own copy.** The same frame target is now
emitted once PER framed row with a different as-of value; the copies share
tipo, section_tipo, section_id, from_component_tipo and mode, and differ ONLY
in `row_section_id` (the dd15 row id, stamped by `relation_core.ts` on the
frame item and on each of its children alike). The list's datum is one bag
shared by every row, so `component_dataframe.get_rating` (the chip of
`view_default_list_dataframe` / `view_mini_list_dataframe`) also matches
`el.row_section_id` against its own frame item's `data.row_section_id` when
both carry it — before, every row linking a target showed the first-emitted
copy (the newest row's, i.e. the live value; on page 2+ another row's). No
other client lookup reads frame children out of a list datum.

**Whole-record rows (the record-snapshot / deleted-records list).** A row
filed under the section tipo (a delete snapshot, an archive restore's
snapshot; `data` = every jsonb column) stands for EVERY main of the record at
once. Shape before: no bound, and the frame bag addressed by the virtual
record — an own-section slot read as a "sibling" at `<section>/<dd15 row
id>` (empty, or an unrelated live record's frames), frame children live (a
deleted record's targets, wiped by its `delete_target`, showed blank). Shape
after — the SAME law, one main at a time (`read_tm.ts rowCellEmissions` →
`snapshotCellEmission`, one `EmissionContext` per framed cell over the same
items array):
- the subject is the snapshot's record (section + id), never the dd15 id;
- the frame bag is the snapshot's own `relation.<slot>` frames, adopted onto
  the virtual record by `buildTmSectionRecord` (no frame-state read); a
  sibling-anchored bag is `frameBagAsOf` at the anchor addressed by the
  subject;
- the bound (`frame_as_of.ts tmAsOfWholeRow`), the row classified by the
  anchor lifecycle law's one classifier (`wholeRowIsDelete`): an archive
  RESTORE begins the content the snapshot holds, so the cell's main held it
  until its key's next row or the record's next section-level row —
  `tmAsOfRow`, the one bound; a DELETE ends the record AT the row (its
  commit-lane `delete_target` wipes lie above it, gate (b')), so B = the row
  itself — the list of deleted records shows each frame target as it stood
  when the record was deleted, never the wiped state that followed.
- The tool's RECOVER (`apply_value`, section branch → `restoreSection`)
  writes its own whole-record TM row (tipo = section_tipo, the record as
  written) in the restore's transaction, so a recovered record's delete
  snapshot is still followed by a section-level row and still classifies as
  a DELETE — the snapshot keeps showing its frame children as of the delete
  (gate (i-snap), the recover case). Before it the recover wrote no row, the
  snapshot had nothing after it on a living record, read as a restore, and
  listed the wiped live children.
- Residue: the classifier's ledgered residue (anchor lifecycle caveat below)
  applies here too — a delete snapshot followed by a key save and no
  section-level row (a bulk-revert undelete, whose birth marker is hidden)
  reads as a restore, its bound
  extending to the main key's next row.

**Unchanged:** a row filed under a SLOT's own tipo is unsupported history
(the preview answers it empty); its list cell stays empty. Mains with no
declared slot keep their cells exactly as before (the shared emission). A
live UNDECLARED slot a frame state names is grafted too but no list cell ever
requests it.

**Cost.** Per listed framed row: one frame-state read when the row is not
itself one, one bound read, and a per-row emission (the per-read record memo
still answers repeated target loads). Rows of mains with no declared slot pay
nothing.

## Caveats (ledgered, never guessed)

- **Sequence order, not commit order.** TM row ids are one sequence across
  every record. Within a record they follow the real order (its FOR UPDATE
  lock). Across records they follow insert order, which is exact for
  sequential requests and within one transaction. Writes CONCURRENT with the
  main row's own transaction can invert (the epoch law's bound). There is no
  timestamp fallback, by law.
- **A key whose only rows lie above B previews EMPTY,** even when its pre-edit
  value was an unrecorded import. A backfill pre-value row cannot be told from
  an ordinary one.
- **Anchor lifecycle residue.** Two archive restores in a row, or a restore
  deleted with no save between, read the first as a delete (the interval
  between them previews no frames). The tool's recover is NOT residue: it
  writes its own visible whole-record row. A bulk-revert UNDELETE writes only a
  hidden birth marker (visible history never serves undo-log rows), so B
  between the delete and the undelete previews the restored snapshot's
  frames.
- **A target deleted and NOT reborn** (no epoch) keeps previewing its
  pre-delete values at B past the delete, the way the main's frame still
  pointed at it; only a rebirth (an epoch) makes it dead.
- **Future wipe doors.** If a door ever wipes targets inside the unlink
  transaction BEFORE the main row, gate (b) goes red. That is intended. The
  same holds for the delete door (gate (b')): its wipes must land above the
  delete snapshot row.

## Preview / restore asymmetry

The preview is not a restore. `apply_value` restores the main and its frames.
It never touches frame targets or sibling bags, so the as-of children are
preview-only, by design.

## Gate reconciliation

- `test/unit/tm_preview_frame_as_of_native.test.ts` (46 tests; its four (i)
  list cases are reconciled under the history list below) pins:
  - the bound law through door 1 (portal main), door 2 (literal main) and
    door 3 (the slot read directly);
  - link-then-fill;
  - `delete_target` with the wipe-above-unlink precondition;
  - a DELETED record's newest main row: its targets, wiped by the delete's
    `delete_target` policy above the snapshot row, preview their pre-delete
    values (b');
  - a target gone live whose history speaks renders from a virtual record
    (b'');
  - the sibling bag, with filing coordinates asserted first, other mains live,
    and door-3 servability both served and refused;
  - all lanes, with a never-recorded lane staying live;
  - silent history and rows-above-bound;
  - the dead generation: epoch above B, AND B between the epoch and the
    rebirth on a key the new generation never recorded (the as-of record is
    virtual — none of the stranger's other keys ride along); every emptiness
    verdict floored by the frame and its child item being present;
  - the sibling anchor's lifecycle (c-life): an anchor deleted after the
    main's newest row previews == live (no frame, doors 1 and 3), and a
    whole-record snapshot on a living anchor supersedes its older frame
    state; an anchor deleted and REBORN (explicit id) previews no frame at a
    bound before the rebirth, doors 1 and 3, other mains' included;
  - a frame TARGET's own archive restore (c-restore): key rows below the
    snapshot superseded (unsliced and per lane), a key row above it speaks,
    the newest row == live, the restore's single-snapshot-no-key-row shape
    asserted first;
  - isolation: sequential, concurrent, live and as-of in one read, and no
    mutation of the loader or memo records;
  - confinement, including per frame (h'): door 3 on a shared slot, with
    the other main's pairing or none, reads only the row's main's frames as
    of B;
  - confinement by ROOT identity (h''): the host's own record reached again
    nested (its portal target's back-portal shows the same main + slot)
    previews its bag AND children live while the root frame reads as of the
    row, and every listed row's cells equal its preview; the units pin that
    the same address as another object never matches;
  - (m), the edges the hand-mutation check found unpinned: an alias of the
    row's main names it and a frame with no main never does
    (`isSubjectMain`); the newest (unbounded) row of a target reborn with no
    visible row since previews its live value; a target with no live row
    and silent history is skipped as live skips it (no blank virtual
    target); a delete snapshot never floors (a silent key of a deleted
    target is EMPTY, not the snapshot value); a dead target's child with no
    jsonb column is left alone (no throw); door 3 refuses a NON-dataframe
    component the main declares on another section at the same id; door 3
    on an anchor deleted after the bound previews its frames from a virtual
    record.
- Mutation-proved: removing each hook reddens its own case, as does replacing
  the bound with the row id; dropping the bound's
  section-level arm reddens (b'); dropping the anchor-lifecycle arm, the
  restore classification, the born-by-B test or the dead record's
  virtuality each reddens its own (c-life)/(f) case; dropping the target's
  restore floor, or ignoring it in the lane reader, reddens (c-restore);
  dropping the anchor's generation test reddens (c-life) rebirth; dropping the
  per-frame main test in `loadPortalTarget` reddens (h'); matching the
  subject by ADDRESS instead of root identity reddens (h'') and the two
  root units. Each (m) case reddens under its own mutant (the alias arm, the
  non-string answer, the unbounded-bound shortcut of `deadAtBound`, a
  virtual record for a live-less target, a delete snapshot as floor, the
  jsonb-column test, the dataframe-model test of the door-3 widening, the
  live-less door-3 fallback). The preview's root CLONE
  (`tmPreviewEmission`) is belt-and-braces: `applyTmGraft` already answers a
  clone, so dropping it survives every gate (measured); it stays so the root
  is never a loader object whatever the graft becomes.
- The history list (above): `tm_two_lanes_native` (12, 5 tests) — for EVERY listed
  row, in the spa and eng lists, the frame cells equal the preview's frames:
  a translatable literal main (per-language rows + frames-only rows), a
  `component_iri` main through its fixed `dd560` slot (runtime `dd1706`
  label records, swept, residue asserted zero), a relation main and a number
  main (composed rows), and a row filed under a slot tipo (both empty — its frame cell read from
  the slot-scoped list that contains the row, floored as emitted); each
  floored non-vacuous (framed language rows, differing rows); and an
  UNTAGGED PHP-era row of a translatable main, listed by a lang-less locator,
  read under the view lane like its preview (`rowFrameState`'s
  `fallbackLang`: read under lg-nolan it would be its own, frameless, frame
  state).
  `tm_preview_frame_as_of_native` (i) — frame ids, totals AND every frame
  child (rating, relation, note) of every listed row equal its preview's, for
  a portal main, a literal main and a sibling-anchored slot, floored by
  per-row values that differ, and (h'') the nested re-occurrence; plus
  `subjectRowOf`/root confinement units.
  The UI half: client suite `test_component_dataframe_rating` — two listed
  rows sharing a frame target each read THEIR copy of the rating (number and
  string row ids), a row with no copy of its own reads none, an unstamped
  side keeps the unscoped lookup. Mutation-proved: dropping the
  `row_section_id` match reddens 3 of its 4 cases (the older row reads 'live').
  Mutation-proved: dropping the row frame-state graft reddens (12) literal
  and iri (a composed row already carries its frames); dropping the per-row bound emission reddens (12) relation
  and every (i) case; addressing the bag by the virtual record instead of the
  subject reddens (12) relation and (i) portal + sibling.
- The whole-record rows: `tm_preview_frame_as_of_native` (i-snap), through
  the section's snapshot list (the `tipo` column filter) — a DELETED record's
  snapshot row shows its frame and the target's rating as it stood (3) though
  `delete_target` wiped it live, and NOT the frame of a live stranger planted
  at `<section>/<dd15 row id>`; a restore-shape snapshot on a living record
  shows the rating as of the main key's next row (7 — not 5, as of the row;
  not 9, live) and a sibling bag addressed by the snapshot's record.
  Mutation-proved: dropping the whole-record branch reddens both; dropping the
  delete bound (B = the row) reddens the delete case; B = the row always, B
  unbounded for a restore, judging the record always alive, or bounding by the
  section key instead of the cell's main each redden their case.
- `tm_two_lanes_native` and every `tm_*` / `dataframe*` native gate stay
  green. The two new `matrix_time_machine` reads (`nextVisibleRow` — behind
  `nextVisibleRowAfter` and `nextVisibleRecordRowAfter` — and
  `readKeyLanesAt`, both `withTmHistory`; `readWholeRecordRowAt` rides
  `newestRowAt`) are pinned in `tm_epoch_tripwire`
  and `tm_history_visibility_tripwire` (time_machine.ts: 6 reads, 6 narrowed). `applyTmGraft`'s behaviour is unchanged; only its two helpers moved.

## Fixture interaction (DEC-14b)

No re-harvest. The one fixture of the store carrying `"data_source":"tm"`
(`tm_component_value_differential.json`) holds no dd490 frame and no
`component_dataframe`. Its retired differential's twin, `tm_emit_hooks_native`,
stays green.
