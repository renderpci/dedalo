# WC-2026-08-27-tm-lang-slice-restore-merge — a component restore never deletes a language the snapshot does not carry

- **Date:** 2026-08-27. Adopted with the DATA-03 remediation (audit
  `audits/2026-08-26_deep`, backlog item P0-4).
- **Decision:** DEC-15 (the byte-identical client is the spec at this seam) and
  the project premise: silent loss of curated heritage data outranks parity with
  a fossil.

## Shape before (PHP)

`tool_time_machine::apply_value` wrote the Time-Machine snapshot as the WHOLE
component key. For a lang-sliced component that snapshot is NOT the component's
value — it is the EFFECTIVE-LANGUAGE SLICE of it, because the save path stores
`get_time_machine_data_to_save() = get_data_lang()` (TS twin:
`save_component.ts:1231-1238`, `items.filter(item => item.lang === effectiveLang)`).

So a trilingual literal has three independent one-language histories, no row
anywhere holds all three, and restoring the Spanish row wrote

```
string['test52'] = [ {id:2, lang:'lg-spa', value:'HOLA v1'} ]
```

over a live value of

```
string['test52'] = [ {id:1, lang:'lg-eng', value:'HELLO ENGLISH'},
                     {id:2, lang:'lg-spa', value:'HOLA v2'} ]
```

The Basque and English values were DELETED. The call answered `ok:true`, no
notice, no counter; and the fresh TM row the restore appended carried only the
restored slice, so the loss was invisible even in the history the restore itself
created. Sequential per-language restores ping-ponged — the tool structurally
could not reassemble a multilingual value.

`bulk_revert_process` wrote the same whole-key replace from the same
per-language snapshots, once per component of a batch.

The trigger had no confirmation either: 'Apply and save' was the only destructive
action in the whole tool tree that fired on one click, while the bulk-revert
button 50 lines above it in the same file asked first.

## Shape after (TS)

**The law, stated once: a component restore never deletes a language the
snapshot does not carry.** It binds BOTH restore doors — `apply_value` and
`bulk_revert_process` — through the same three exported helpers
(`snapshotLangs` / `mergeRestoredLangSlice` / `tmAuditSlice`, defined in
`tools/tool_time_machine/server/tool_time_machine.ts` and imported by
`bulk_revert.ts`): one law, one implementation of it.

- the doors decide "lang-sliced" with the WRITE engine's own exported predicate,
  `isLangSlicedModel` (`save_component.ts:326` — PHP `supports_translation &&
  !is_relation`), never a second copy and never the ontology `translatable` flag
  alone (the flag mis-slices: an ontology-non-translatable `input_text` still
  slices, on the `lg-nolan` the engine normalizes it to);
- for every OTHER model the snapshot IS the whole value and the doors keep
  replacing the key exactly as PHP did. Merging there would resurrect portal
  locators and select values a later save legitimately removed;
- the languages a restore is entitled to replace are read from the SNAPSHOT
  ITEMS, falling back to the TM row's own `lang` column when the snapshot names
  no language;
- **a snapshot that is not an item array is the EMPTY SLICE of its own
  language** — SQL NULL (what a cleared slice is stored as) and a bare scalar
  alike. `matrix_time_machine.data` is a NULLABLE jsonb column (verified against
  the suite schema), so both shapes are representable and PHP-era rows hold
  them. The lang branch is therefore NOT gated on the array shape: gating it
  there sent exactly those rows back down the whole-key path, where the restore
  deleted every language the component held and wrote a bare string into a key
  that must hold an item array. The snapshot's shape may decide how much of ONE
  language is restored; it may never decide whether a SIBLING language lives.
  (An earlier revision of this entry pinned a production census — "roughly 430
  rows, component_text_area/lg-spa 263 scalar + 35 null". It is WITHDRAWN as of
  2026-08-27: it cannot be re-measured from the repository, and the rule does
  not need it. The gate BUILDS both shapes instead of counting them.);
- surviving items are kept VERBATIM (same object reference through
  `json_codec`), so an untouched language is byte-identical before and after.
  They are written survivors-first, restored-last, which is the array order
  `save_component.ts` already uses for a lang-sliced save
  (`items = [...otherLangs, ...stamped]`, PHP `set_data_lang` :1052-1128). That
  is CONTRACT, and since 2026-08-27 it is ASSERTED — the gate reads the stored
  array's lang sequence after a merge (`['lg-eng','lg-eus','lg-spa']`: the two
  survivors in their stored order, the restored slice last). Until then nothing
  in the gate looked at ORDER, and putting the restored items first passed it
  green: a claim the tree did not hold;
- **ONE TM ROW IS ONE LANGUAGE, AND IT IS THE RESTORED ROW'S.** The audit row a
  restore appends carries the language the SNAPSHOT ROW speaks for — its `lang`
  column, falling back to the request's effective lang only when that column is
  null or empty (pre-migration rows) — sliced out of the post-merge value by
  `tmAuditSlice`, exactly as `save_component.ts:1231-1238` slices the same
  write. BOTH doors derive it that way: `bulk_revert_process` always did
  (`auditLang = rowLang ?? …`), and `apply_value` was corrected to match on
  2026-08-27. It had used the REQUEST's effective lang, and the server does not
  validate `options.lang` against `tmRow.lang` (the target check covers
  section_tipo / section_id / tipo only). When the two differed on a
  translatable component the MERGE stayed correct — no language was deleted, so
  DATA-03 proper did not reopen — but the audit row was tagged AND sliced for
  the request language: it held the UNTOUCHED language's surviving items, the
  CHANGED language's timeline recorded nothing, and the untouched language's
  timeline gained a row duplicating its current value, whose later restore
  reverts an edit nobody selected. Tag and payload are derived from the same
  lang, so the row is self-consistent by construction. This is what every other consumer of
  `matrix_time_machine` already assumes: the dd15 history list filters rows by
  `filter_by_locators.lang` (`js/tool_time_machine.js` :381-386), the preview and
  list emit resolve a row against the request lang (`section/read.ts` :715-722
  grafts the row and :751 injects it; the lang filter is
  `resolve/component_data.ts` :123-125), and both restore doors derive what they
  may replace from the row's own items. A row carrying several languages under a
  single-language tag therefore reverted languages nobody selected — restoring
  the row the tool itself had just written put English back from the Spanish
  timeline while the English timeline's newest row said something else. The merge
  is what makes a one-language row sufficient: reverting it replaces that
  language and leaves the others standing;
- the read that feeds the merge is `readMatrixKeyForUpdate` — `FOR UPDATE`,
  inside the restore's transaction. A whole-key read-modify-write on an unlocked
  read is the lost-update shape the merge exists to close, moved one layer down.

Two deliberate deviations from `set_data_lang`, both on the conservative side:

- a live item with **no `lang`** (a lang orphan) is KEPT, where the save path
  drops it. This door replays a snapshot; it does not garbage-collect data no
  snapshot mentions, and an orphan a restore deleted is recoverable from nothing;
- a snapshot that is spelled for one language does not replace the others even
  when the record held only that language when the snapshot was taken. A restore
  that predates a translation therefore leaves the translation standing.

And one refusal that exists only on the bulk door: a lang-sliced batch row whose
snapshot names no language AND whose `lang` column is empty is SKIPPED with a
surfaced `skipped[]` entry. `apply_value` falls back to the request's effective
lang; the batch loop has no request lang to fall back on, and guessing which
language to clear would delete curated content nothing can name.

**Client half.** `render_tool_time_machine.js` confirms before calling
`apply_value`, and the message NAMES what is overwritten — the component label,
the language and the record address — instead of a generic are-you-sure. It
states the server's rule rather than deciding it: the lang-sliced predicate stays
server-side, where it cannot drift. The sentence is a promise the server keeps in
every branch, the non-array snapshot included. The text is TRANSLATED —
`apply_value_confirm_msg` ships in every lang block of the tool's
`register.json` with three positional tokens (`{0}` component, `{1}` language,
`{2}` record) a translator may reorder; the English literal in the JS is the
fallback for an install whose registered tool data predates the key.

## Reason

The consumer is a curator restoring one language of a multilingual record. Under
the PHP shape the only way to use the tool correctly was to already know that the
history is per-language and that applying it deletes the rest — and the tool's own
audit trail actively hid the deletion. Parity with that behaviour has no
constituency: it is not a shape the client depends on (`apply_value` answers
`data === true` either way), and its only observable effect is losing heritage
content that exists nowhere else.

## Gate reconciliation

- `test/unit/tm_lang_slice_restore_native.test.ts` — the behavioural gate,
  30 tests. It BUILDS its own ontology in the reserved scratch TLD `zztmlang`
  (section `zztmlang1` parented on `test1` and carrying the `test24`
  matrix_table relation, so every record it creates lives in `matrix_test`;
  three components under it drive the translatable, the
  non-translatable-but-still-sliced and the non-sliced branch), materialized
  through the engine's own write path and dropped with a zero-residue assertion
  in teardown — it is not seeded in the generic `test` TLD, and it reads no
  record the archive already holds. It then seeds a translatable literal with
  three language slices, restores ONE, and asserts every other language survives
  BYTE-IDENTICAL, that the row the restore writes is tagged AND shaped for
  exactly one language, that the merged key keeps the save path's
  survivors-first / restored-last array ORDER, that a restore whose REQUEST lang
  DIFFERS from the ROW lang still tags and slices its audit row for the ROW
  language (the untouched language's timeline gains nothing; the changed
  language's records the restore), that a sequential per-language restore no
  longer ping-pongs, that restoring a row THIS DOOR wrote reverts only its own
  language (an English edit made after it survives), that an EMPTY slice clears
  exactly one language, that a SQL NULL and a scalar snapshot clear exactly one
  language and leave the key an array, that a NON-lang-sliced component is still
  replaced whole, that `bulk_revert_process` reverting one language's batch write
  leaves the other language standing and writes a one-language audit row, that
  the restore-door census (derived, not listed) has every door CALLING the
  shared helpers — CALL-SITE, not string containment: an import line, a comment
  line and the helper's own `export function` definition do not satisfy it, and
  the predicate deciding that is itself asserted against those four shapes — and
  that the client confirms the destructive action with a translated sentence.
  Anti-vacuity floor: the fixture ontology (section, translatable literal, the
  non-sliced control) is asserted present with the expected model and
  translatable flag before any assertion runs.
- `test/unit/tm_bulk_revert.test.ts` continues to pass unchanged: its component
  `testmint1002` IS ontology-translatable and lang-sliced (verified against the
  suite ontology on 2026-08-27, correcting an earlier revision of this entry
  that called the four pre-existing TM gates non-translatable), but every record
  it builds holds exactly ONE language, `lg-spa` — so the merge degenerates to
  the replace that door always performed.
- **No re-harvest.** No frozen oracle fixture covers `apply_value` — the retired
  differentials for this tool are write-path, and their TS twins are the four
  pre-existing TM gates (`tm_dataframe_restore_native.test.ts`,
  `tm_section_restore.test.ts`, `tm_bulk_revert.test.ts`,
  `delete_record_tm_native.test.ts`), none of which asserts the whole-key
  replace this entry diverges from: none of them ever holds a MULTILINGUAL
  value, so the divergence is invisible to all four. Two are `lg-nolan`;
  `tm_dataframe_restore_native`'s main is `test6836`, a `component_portal`,
  which is not lang-sliced; `tm_bulk_revert`'s is a translatable literal used on
  one language only (above). Both named files were re-run on 2026-08-27 and pass
  unchanged (27 tests together).

## Residual

The `matrix_time_machine` history `bulk_revert_process` walks to find a
component's pre-batch state (`preBulkState`) is NOT filtered by language: the row
immediately older than the batch may belong to a different language than the
batch row. That predates this entry and is unchanged by it — the merge now bounds
its consequence to the languages that older snapshot itself names, instead of the
whole key — but the selection is still wrong for a multilingual component and is
carried as open work.
