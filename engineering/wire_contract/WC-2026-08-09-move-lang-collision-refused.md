# WC-2026-08-09-move-lang-collision-refused — move_lang refuses a row where the target language is already populated

- **Date:** 2026-08-09 (defect ledger D5, the CRAP Population B pass).
- **Decision:** — (DEC-12 gate: `test/unit/transform_lang_native.test.ts`; the
  pin that recorded the overwrite as "ACCEPTED DATA LOSS, PINNED" is FLIPPED in
  place and now asserts the refusal.)
- **Relation to WC-025:** amends the `change_data_lang` / `lang_to_nolan` half
  of WC-025's executor enumeration; the rest of WC-025 stands.

### What was wrong

`src/core/update/transform/lang.ts` re-keyed a component's per-language data
with

    UPDATE "<table>"
    SET "<col>" = jsonb_set("<col>" #- ARRAY[$tipo,$from], ARRAY[$tipo,$to],
                            "<col>" -> $tipo -> $from)
    WHERE "<col>" IS NOT NULL AND "<col>" -> $tipo -> $from IS NOT NULL

The `WHERE` tested only the SOURCE key. Nothing tested whether
`-> tipo -> toLang` already held a value, so `jsonb_set` overwrote it.

Reproduced by the existing gate's fixture: `{zzt023: {'lg-spa': ['source'],
'lg-eng': ['PRE-EXISTING']}}` came out as `{'lg-eng': ['source']}`.
`'PRE-EXISTING'` was gone, `recorder.errors` was `[]`, and the delta reported an
ordinary successful update — the report was identical whether or not anything
was destroyed.

Blast radius: permanent, silent loss of the target language's content for EVERY
record where both languages were populated, across all allowlisted tables × all
typed jsonb columns in one run. These transforms write no Time Machine snapshot
by construction (`engine.ts`: TM suppressed for transforms), so only a database
backup restores it. A lang consolidation on a multilingual install is precisely
the case where both keys are populated.

### Shape before (TS, until 2026-08-09)

    data.zzt023   {'lg-spa':['source'], 'lg-eng':['PRE-EXISTING']}
                → {'lg-eng':['source']}
    errors []     sample [{op:'update', …, detail:'lang lg-spa→lg-eng (1)'}]

### Shape after (TS)

The re-key is split in two, applied identically in dry run and in execute:

1. **Move only where the target key is ABSENT** — the `WHERE` gains
   `AND "<col>" -> $tipo -> $to IS NULL`. A clean row moves exactly as before,
   byte for byte, and is reported by the same `op: 'update'` delta.
2. **Count and REFUSE the rows where both keys are present.** They are left
   completely untouched — both values survive — and reported twice over:

       errors[]  "move_lang: <n> row(s) in <table>.<column> already carry
                  <tipo> <toLang> — <fromLang>→<toLang> refused there,
                  both values left in place"
       sample[]  {op:'refuse_collision', table:<table>,
                  target:'<column>.<tipo>', detail:'lang <from>→<to> collision (<n>)'}

**Refusal, not merge.** The values are per-language component payloads with no
defined merge semantics. The portalize precedent
(`WC-2026-08-09-portalize-portal-merge`) applies verbatim: never destroy what the
transform did not create; where it cannot merge safely, refuse the row and say
so.

**The dry run predicts the refusal.** An operator's whole safety gate is the
preview, so a dry run reporting N moves where the execute refuses M of them
would be a second defect. The collision count is computed by the same helper in
both modes and reported through the same two channels.

**Idempotent.** After a refusal a re-run refuses again — it never eventually
overwrites. One refused row does not block a clean sibling row in the same
column, table or run.

**`lg-nolan` is guarded identically.** It is a legitimate TARGET, so an existing
`lg-nolan` value is protected exactly like any other language.

**Deliberately unchanged:** the `TIPO_RE` / `LANG_RE` guards and their exact
error strings (three cases assert them byte for byte); the `matrix_time_machine`
`lang`-column tail, which RELABELS history rows and destroys nothing (extracted
into `rekeyTimeMachineLang` unchanged in behaviour); and the absence of any TM
snapshot (WC-025 pins TM suppression for transforms). One added guard: an item
whose two langs are equal is a no-op and returns early rather than reading as a
collision with itself.

### Reason

The consumer is the STORED RECORD, not a client payload: `move_lang` is an
UPDATE_PROCESS phase 5 transform run unattended over a whole install during an
upgrade, from a JSON file an operator hand-edits, reachable only through the
global-admin maintenance widget. A blind overwrite on a TM-suppressed write is
the one class of bug this codebase cannot recover from afterwards, and "the
target language was probably empty" is an assumption about customer data, not an
invariant.

### Gate reconciliation

**No fixture re-harvest.** Nothing on any read path changes shape — write-path
transform, no PHP-facing response, and the frozen oracle store contains no
move_lang run.

Gated by `test/unit/transform_lang_native.test.ts` (scratch `section_tipo`
`zzt02s1`, tipos `zzt021..zzt024`, section ids 902000-902999, both ends swept
and asserted to zero in `afterAll`): the collision refusal with both values
intact and the error named; idempotence across two runs; a colliding row not
blocking a clean sibling; the dry run predicting the same refusal while writing
nothing; and `lg-nolan` guarded identically.
