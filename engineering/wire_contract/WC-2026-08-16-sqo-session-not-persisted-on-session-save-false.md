# WC-2026-08-16-sqo-session-not-persisted-on-session-save-false — a `source.session_save:false` read gets `sqo_session: null` in every section context entry

- **Date:** 2026-08-16 (entry). The behaviour itself LANDED 2026-08-15 in commit
  `acbc416e2c` — "feat(tm): one Time Machine — every surface is a dd15 section list" —
  as `src/core/section/read.ts stripSessionSqoStamp`, applied at both context
  emission sites of `readSectionScoped`. It is NOT one of the thesaurus-picker commits
  (`4e8de6ee25`, `886945e856`, `67ab72eb14`, `625f17e7b3`, `480e098cea`) and not the
  error-system sweep: it is the Time Machine unification, which shipped the gate
  (`test/unit/tm_session_sqo_isolation_native.test.ts`, "door 3 — THE STAMP") but no
  ledger entry. This entry closes that gap; nothing about the emitted bytes changes today.
- **Decision:** — (DEC-12: the invariant had a gate but no ledger row; a deliberate
  divergence with no WC entry reads as a regression to the next reader.)

## The seam

`section::get_structure_context` (PHP `class.common.php:1698`) stamps
`sqo_session = section::get_session_sqo(sqo_id)` on the section's context entry for
EVERY section read, regardless of what the request declared about session persistence.
The client ADOPTS that value wholesale on its next build
(`client/dedalo/core/section/js/section.js:706-715`: `if (self.context?.sqo_session …)
self.rqo.sqo = self.context.sqo_session`).

## Shape before (PHP)

```json
"context": [ { "typo": "context", "tipo": "oh1", "model": "section", …,
               "sqo_session": { "section_tipo": ["oh1"], "limit": 10, "offset": 26, … } } ]
```

Present on every section read that had a stored session SQO, `session_save:false` or not.

## Shape after (TS)

Identical for an ordinary read (`session_save` absent or `true`). For a read whose
`source.session_save === false`:

```json
"context": [ { "typo": "context", "tipo": "dd15", "model": "section", …,
               "sqo_session": null } ]
```

Every context entry that carried an `sqo_session` key carries it as `null`; entries
that never had the key are untouched (the key is nulled, never added or deleted, so the
key set of the entry is byte-stable).

## Reason

A read that declared `session_save:false` has declared itself OUTSIDE session
navigation: it neither persists its SQO nor merges the stored one (`readSectionRows`
honoured both halves already). Stamping the stored SQO onto its context was the THIRD
door, and it was open: the embedded Time Machine panels share `callerTipo 'dd15'` with
the standalone dd15 browse, so a panel that adopted the browse's stored SQO (offset 26,
no filter) started listing the WHOLE 2.4M-row `matrix_time_machine` on its first
pagination — silently. The client is guarded (`section.js:706` checks truthiness), so
`null` is the exact value that closes the door with no client change: "no stored SQO to
adopt" is precisely what a session-less read must be told.

## What a consumer must expect

1. A read WITHOUT `session_save:false` is byte-unchanged, `sqo_session` included.
2. A read WITH `session_save:false` must not depend on `sqo_session` for anything —
   it is `null` by contract, and a consumer that adopted it would be adopting a
   FOREIGN query (another surface's stored navigation on the same section tipo).
3. The key is nulled, not removed: a consumer keying on `'sqo_session' in entry`
   sees the same key set as before.

## Gate reconciliation

- `test/unit/tm_session_sqo_isolation_native.test.ts` — the three doors, including
  "door 3 — THE STAMP: the returned context carries NO adoptable sqo_session" and its
  control (the same read without the flag still carries a non-null `sqo_session`).
- `test/parity/*` — **NOT AFFECTED and NOT re-harvestable**: the frozen store holds
  ZERO `session_save:false` interactions (measured), so no fixture pins the PHP stamp
  on such a read and no parity gate can redden on this. Per
  `engineering/ORACLE_HARVEST.md` a re-harvest is impossible by definition; the native
  gate above is this behaviour's only baseline.

Cross-reference: `src/core/section/read.ts stripSessionSqoStamp` docblock links here.
