# WC-2026-08-09-time-machine-restore-replays-paired-dataframe-frames — a TM restore replays the dataframe half, and both TM write doors join the observer cascade

- **Date:** 2026-08-09 (audit `audits/2026-08_oh1_beta` §5.6 + its P2 list).
- **Scope:** `tools/tool_time_machine/server/` — `apply_value` (component
  branch) and `bulk_revert_process`.

## What was wrong

A main component that declares a `component_dataframe` slot does not store its
frames in its own column: they live in `relation[<slot tipo>]`, paired to
individual main items by `id_key → id`. Both time-machine write doors rewrote
only the main column, so a restore left the record in a state it had never
been in — on `oh1`, `oh24` (Informants) reverted while `oh115` (Role) stayed at
today's values, and every frame whose `id_key` no longer matched a live main
item became a permanent orphan the UI can neither render nor delete.

PHP restored or wiped the frames FIRST
(`tool_time_machine::apply_value` :277-333 → `component_dataframe::
set_time_machine_data` :382, which empties the slot then replays the snapshot's
frames with `tm_record::$save_tm = false`). That half was unported.

## Restored oracle behaviour (no divergence)

- **`apply_value` replays the frame half.** For each dataframe slot of the main
  component, the slot is emptied and the snapshot's frames for it are written,
  BEFORE the main column write, all inside one transaction. A slot with no
  frames in the snapshot is emptied (key removed) — PHP's contract.
- **The fresh TM audit row carries main + frames** (PHP
  `component_common::get_time_machine_data_to_save` :1580 appends every slot's
  full data to the main's snapshot), so reverting a restore brings the frames
  back with it.
- **No TM row is written for a slot** — PHP suppresses it; the main's row
  carries the frames.
- **Both doors fire the observer cascade, post-commit.** PHP restored through
  `component_common::save()`, whose last act is `propagate_to_observers()`
  (class.component_common.php:2147). The TS port writes through
  `persistRecordKeys` directly and had skipped it, so a TM restore of an
  observed component left every mirror at the pre-restore value and wrote no
  observer TM audit row. This is oracle parity, not a broadening: WC-050's
  "doors still outside the cascade" list never named these two, and its opening
  sentence ("PHP fired `propagate_to_observers` only from the interactive
  component-save controller") is inaccurate — every `element->save()` fired it.
- **Restored items are absorbed into the item-id counter**
  (`absorbComponentItemIds`, PHP raises on every `set_data`). Load-bearing for
  the pairing itself: a re-minted duplicate main-item id would make two items
  answer to the same frame `id_key`.

## Deliberate divergences

1. **Slot discovery is a UNION, not the config map alone.** PHP's
   `get_dataframe_ddo` reads only the main's `request_config` show map, which
   misses a LITERAL main whose frames activate on `has_dataframe` + ontology
   parentage (the config and data halves can legitimately disagree). TS unions
   the ontology children of model `component_dataframe`, the own-config ddos
   (show AND hide), and the slots the snapshot's own frames name. A slot missed
   at discovery is a slot never emptied — exactly the orphan this change exists
   to end. Strictly additive: a slot PHP found is still found.
2. **An unattributable LEGACY frame refuses the whole restore.** A pre-migration
   frame with no `from_component_tipo` while the main has more than one slot in
   play aborts with `uncovered_scope` and writes nothing; PHP duplicated it into
   EVERY slot, which is the corruption, not a fix. Unreachable on real data
   (a scan of every TM snapshot in the live archive found zero frames lacking
   `from_component_tipo`).

   NOT a divergence, and explicitly reverted on 2026-08-09: a frame whose
   `from_component_tipo` does not resolve to a `component_dataframe`, and a
   legacy frame when the main has NO slot at all. PHP never inspects a frame's
   `from_component_tipo` on its own — it loops the slots it discovered and
   filters the snapshot per slot — so such a frame matches no iteration, is
   written nowhere, and is stripped out of the main data. It is inert, not lost:
   the TM row carrying it is kept forever (component restores never consume it).
   A first revision of this entry refused those restores; that broke the Phase-6
   contract gate `test/unit/tool_request.test.ts` "apply_value strips dataframe
   frames from the restored main data", which is a real, correct contract — a
   snapshot carrying a stale or foreign frame must still restore. Law 3's second
   half applies: do not throw where the oracle handled a case generically.
3. **`bulk_revert_process` takes the same frame path.** PHP's bulk revert fed
   the raw snapshot to `set_data` — writing frame locators into the main
   component's own key and leaving the slots at today's values. That is the very
   corruption `apply_value`'s strip exists to prevent, so the two doors now
   share one primitive instead of one of them keeping the defect.
4. **Restoring a TM row whose own tipo IS a `component_dataframe` slot is
   refused** (previously refused only when `caller_dataframe` was present). For
   such a row the snapshot's dd490 entries ARE the component's value, and the
   ONE shared `stripDataframeFramesFromTmMain` — which the TM PREVIEW read
   applies too — reduces it to an empty array, so the restore silently WIPED the
   slot. Un-stripping only the restore would make the tool write something the
   user never previewed, so the door refuses until the shared strip and
   `section/read.ts` are fixed together.

5. **A FRAMELESS snapshot over LIVE frames is refused, not replayed** (added
   2026-08-09; `refuseFramelessWipe`). PHP's contract is that a slot absent from
   the snapshot is emptied, and this port originally replayed that faithfully.
   It cannot, safely, while the CAPTURE half is unported (below): every TM row
   the TS engine has written for a dataframe-paired main is frameless, and it is
   indistinguishable from a PHP-era row whose slots were genuinely empty. The
   frames exist in NO other row — PHP writes no TM row for a slot (`oh115` has 0
   against `oh24`'s 172 in the live archive) and divergence 4 refuses a slot-row
   restore — so replaying the wipe is an UNRECOVERABLE deletion, where the
   pre-fix defect merely left the frames stale. Both write doors therefore
   refuse: `apply_value` with `uncovered_scope` and nothing written,
   `bulk_revert_process` by skipping that component with a surfaced error.

   The condition is the narrowest one that closes the hole: refuse only when the
   snapshot carries NO frame for ANY planned slot AND a planned slot currently
   holds frames. A snapshot that carries frames is demonstrably a frame-aware
   capture, so its silence about another slot is informative and that slot is
   emptied (PHP's contract, unchanged); an already-empty slot has nothing to
   lose and restores normally. **This divergence is retired — with its two
   tests, not by loosening them — the day the capture half lands.**

## Known-open dependency (the capture half — BLOCKING pair)

`section/record/save_component.ts` records the main component's TM snapshot as
its own column value alone (`tmSnapshot`, :1091-1113); PHP's
`component_common::get_time_machine_data_to_save` :1580 APPENDED every slot's
full frame set. Until that is paired, TS-written TM rows for a dataframe-paired
main carry no frames and divergence 5 refuses to restore them onto populated
slots. PHP-era rows already carry the frames and restore fully. The fix is to
append the values of `(await getDataframeChildTipos(mainTipo)) ∪ own-config
dataframe ddos` (`resolveDataframeSlotTipos` in
`tools/tool_time_machine/server/dataframe_restore.ts` is exactly that discovery,
ready to be shared) to `tmSnapshot` for non-dataframe mains — the same shape
`composeTimeMachineSnapshot` already writes on the restore side. That file is
owned elsewhere; land it with this entry.

### Gate

`test/unit/tm_dataframe_restore_native.test.ts` — scratch `oh1` twins over the
real `oh24`/`oh115` pair: the frame set equals the snapshot's, no orphan
`id_key` survives, a frameless snapshot over live frames REFUSES and writes
nothing (and the same snapshot over an EMPTY slot still restores, so the guard
is not a blanket), a frame naming a tipo that is not a live slot restores
normally and lands nowhere, `planDataframeRestore` attributes/refuses legacy
frames by slot count, the fresh TM row carries main + frames, the slot gets no
TM row of its own, `bulk_revert_process` restores both halves and skips a
frameless pre-batch state, and an observed component's restore recomputes the
target mirror and writes its observer TM audit row.
Plus `test/unit/tool_request.test.ts` (Phase 6) for the non-refusal in
divergence 2.
