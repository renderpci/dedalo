# WC-2026-08-27-duplicate-reminted-dataframe-targets — duplicating a record RE-MINTS its dataframe frame targets (or refuses); PHP shared them

- **Date:** 2026-08-27 (deep audit 2026-08-26, finding DATA-05 / remediation P0-6).
- **Decision:** no DEC of its own. It follows from the project premise — silent
  corruption of a heritage record outranks wire fidelity — and from the
  documented dataframe contract (`src/core/concepts/subdatum.ts`,
  `engineering/RELATIONS_SPEC.md` §6.2): a pairing locator ties each frame
  record to exactly ONE data item. DEC-12 gate:
  `test/unit/duplicate_record_dataframe_native.test.ts`.

## The divergence in one line

PHP's `section_record::duplicate` (`class.section_record.php:2111`) copies the
`relation` column verbatim, so the copy and the original address the SAME frame
target records. The TS engine deep-copies each frame target and re-points the
copied locator — and where a copy is impossible, it REFUSES the duplicate
rather than sharing.

## Shape before (PHP — and TS until this entry)

Source `test6099/8`, one `component_dataframe` slot `test6744` paired to main
item 1 of `test6117`:

```json
"test6744": [
  {"id":1,"type":"dd490","id_key":1,"section_id":509,"section_tipo":"rsc1242",
   "from_component_tipo":"test6744","main_component_tipo":"test6117"}
]
```

The duplicate's slot was BYTE-IDENTICAL — `section_id: 509` on both records.
One frame target, two owners:

- **ALTERATION, unconditional.** The frame editing surface is the target
  section opened in a modal, so a curator correcting the COPY's frame writes
  into `rsc1242/509` and the ORIGINAL's frame silently changes. The curator
  never opened the record they damaged, and nothing anywhere reports it.
- **DESTRUCTION, ontology-gated.** Under
  `properties.dataframe.delete_policy: "delete_target"`, removing the paired
  main item on the duplicate calls `deleteSectionData` on the shared target
  (`relations/save.ts` `removeDataframeDataById`) and EMPTIES the original's
  frame.

84 `component_dataframe` nodes exist on the vendored ontology, including the
core IRI label frame (`dd560`) and the live oral-history role frame (`oh115`).
Reproduced on the suite database 2026-08-26; the frozen oracle behaves
identically, which is why this is a divergence and not a regression fix.

## Shape after (TS)

The same duplicate now stores

```json
"test6744": [
  {"id":1,"type":"dd490","id_key":1,"section_id":511,"section_tipo":"rsc1242",
   "from_component_tipo":"test6744","main_component_tipo":"test6117"}
]
```

where `rsc1242/511` is a full deep copy of `rsc1242/509`, minted through
`duplicateSectionRecord` itself (`remintDataframeTargets`). Precisely:

1. **Census is TOTAL** over the copied bag — every jsonb column, every tipo,
   every entry. `relation_search` is copied verbatim too, and a pairing locator
   owns a record wherever it is stored.
2. **Only OWNERSHIP edges are re-minted.** A dd490 pairing owns the record it
   addresses; the portal/autocomplete/thesaurus locators beside it are
   REFERENCES and stay shared, exactly as before. Re-minting those would be a
   different defect of the same size.
3. **The topology is preserved.** Targets are de-duplicated by address, so two
   main items framing the same record in the source share ONE copy in the
   duplicate.
4. **The pairing is untouched.** `id`, `id_key`, `main_component_tipo` and
   `from_component_tipo` are copied as they were: the duplicate copies the main
   component's items verbatim, ids included, so the pairing is exactly as valid
   on the copy. Only the address changes — with one exactness: a frame written
   by the PHP era stores `section_id` as a STRING (`"509"`), and the re-mint
   writes the new address as a NUMBER unconditionally, so on a legacy frame the
   stored TYPE changes with the value. That is the canonical form
   (WC-2026-08-10-section-id-int-canonical) and every reader on both sides is
   dual-form, so it is a normalization, not a divergence — but "only the
   address changes" would be inexact without saying it.
5. **Recursive**, through the same writer: a frame target carrying frames of its
   own is re-minted the same way, with its own reference locators left shared.
6. **REFUSAL where a copy is impossible** — `record.dataframe_unduplicable`,
   naming the dataframe slot, with nothing written: an address-shaped id no
   record copy can be minted from (a non-positive one — `-1` is the root
   record, `-666` the activity sentinel — or one whose `section_tipo` is
   missing), a target section that is consultation-only or resolves to no
   matrix table, an ORPHAN pairing (the target no longer exists), or a cycle (a
   frame chain that re-enters a record this duplication is already copying).

   **NARROWED, 2026-08-27 (adversarial round 3), to frames that NAME A DEDALO
   RECORD ADDRESS.** The first cut refused any dd490 entry whose `section_id`
   was not a positive safe integer, which swept in the ABSENT (null / no key)
   and NON-NUMERIC (external remote id: `'Q42'`, `'001338683'`) forms — and
   those are a REAL stored shape, not corruption: `normalizeDataframeEntry`
   (`src/core/concepts/subdatum.ts`) explicitly passes a non-address
   `section_id` through verbatim, and
   `area_maintenance/widgets/dataframe_control.ts` renders `section_id ??
   unknown`. Such a frame OWNS no record, so the verbatim copy — the
   pre-existing PHP-era behaviour — shares nothing, while refusing it made the
   WHOLE RECORD permanently unduplicable for no integrity gain. The classifier
   is the shared one (`isSectionId` / `isConvertibleSectionIdString`,
   WC-2026-08-10-section-id-int-canonical), never a second rule. Census of the
   suite database on this machine (2026-08-27): 162 dd490 entries, 0 with a
   missing / null / non-numeric `section_id` — so the shape is PLAUSIBLE for
   installs carrying PHP-era or external-target frames, and not present here.

   The code is a CONFLICT (409, `disclosure: public`, the slot tipo and the
   branch that fired carried in `details` as `component_tipo` / `reason`),
   because every branch is repairable by the curator who asked: re-point the
   pairing, delete the stale frame, break the cycle. The first cut of this entry
   reused `engine.uncovered_scope` — 503, operator disclosure — which told the
   client "the server is unavailable, retry" about a refusal no retry can
   change, and swallowed the slot name the repair needs.

   PRE-FLIGHT, and its exact reach: every target of ONE record is checked before
   that record's first copy is minted, so a refusal never leaves half of THAT
   record's frames re-minted. It is one level deep. A refusal raised inside a
   NESTED re-mint — a frame target that itself carries an unduplicable frame —
   fires after this level's earlier targets were already minted, leaving stray
   unreferenced copies. See the residual: that is the same leak the missing
   transaction leaves, it is recoverable by inspection, and no pre-flight can
   remove it entirely (a mint can also fail on the database itself).

7. **AUTHORIZATION IS RE-ASKED ON THE TARGET SECTION** — `perm.denied` (403),
   the same code the duplicate door throws for the host section. Re-minting
   CREATES records in a section no duplicate request names, and every door onto
   this writer gates level 2 on the HOST section only
   (`api/handlers/dd_core_api.ts`, `ai/mcp/tools/fields_write.ts`), so without
   this a curator holding level 2 on the host and level 1 (read-only) on the
   frame target's section MINTED ROWS THERE, carrying their own audit stamps,
   simply by duplicating. The grant is asked for the duplicating user on every
   distinct target, at every level of the recursion, inside the same pre-flight
   — before the target record is even read, so a refusal does not disclose
   whether it exists. That ORDER is itself gated (2026-08-27): a no-grant
   principal duplicating a host whose frame target has been DELETED must still
   get `perm.denied`, never `record.dataframe_unduplicable` — swapping the two
   blocks passes every other assertion in the gate and turns a 403 into an
   existence oracle for a section the caller may not write. This is a gate PHP
   never had, because PHP never minted anything: it shared the target.

   **THE PROJECTS-FILTER ASYMMETRY — a DECIDED EXEMPTION (2026-08-27).** The
   duplicate door gates the HOST twice: `getSectionPermissions >= 2` AND the
   per-record projects filter (`isRecordInScope` → `perm.out_of_scope`,
   `api/handlers/dd_core_api.ts`). `assertFrameTargetDuplicable` re-asks only
   the SECTION level on the target, so a frame target OUTSIDE the actor's
   projects scope is still deep-copied. That is deliberate, and the parity
   claim above must be read with it. Why the second half is NOT applied:

   - the copy carries the SOURCE target's own project locator across (a deep
     copy copies every component column), so it lands in the project the
     original was in — it never enters the actor's scope and discloses nothing
     they did not already hold;
   - the actor reaches that frame's fields through the HOST record they hold
     write on, so the target is not a record they cannot see;
   - and the refusal would be WIDE. Measured on the suite database
     2026-08-27: `rsc1242` — the target section of 47 of the 84
     `component_dataframe` nodes — IS project-gated
     (`getComponentFilterTipo('rsc1242')` → `rsc1249`); a frame target the
     engine itself has just created carries project `dd153/1`; and
     `isRecordInScope` is `false` on it for a non-admin without projects.
     Applying the per-record gate to targets would therefore refuse every
     framed duplicate for a projects-less curator, and any framed duplicate
     whose target sits in a project the curator is not in — the same
     "permanently unduplicable for no integrity gain" shape the narrowing in
     point 6 was ruled against.

   REVISIT IF minting into another project ever becomes observable to the
   actor — e.g. if the copy is ever re-stamped with the ACTOR's projects
   instead of inheriting the source's, which would turn an invisible
   same-project copy into a cross-project write.

**Sharing was never an option**, and neither was dropping the frame: the first
is silent corruption, the second is silent loss, and this system ranks both far
above a refused duplicate. A half-copy — some frames re-minted, some shared —
would be the worst of the three and is what the pre-flight exists to prevent.

## Reason

The consumer here is not the browser but the STORED RECORD, and the PHP shape
is not a shape the client depends on: no context or data key gains or loses a
field. What changes is which record a frame locator addresses after a duplicate
— and the copied client reads a frame through the same pairing predicate either
way.

The wire is not untouched, and the earlier draft of this entry was wrong to say
so: the duplicate door can now answer with two codes it never emitted —
`record.dataframe_unduplicable` (409) and `perm.denied` (403) — on a request
that previously always succeeded. Both are registered codes rendered by the
existing client policy (`record.*` has no core entry, so the default `'*'`
toast applies; `perm.*` is the no-access page the door's own host-section
refusal already used), so no client file changes.

The everyday cataloguing action ("duplicate this record and adjust it") was
producing two records that shared a sub-record, in a system whose entire
purpose is that a record is what it says it is. A curator has no way to see the
sharing and no way to detect the damage afterwards: the duplicate's own bytes
are correct, so every existing gate — including the DEC-14b twin
`duplicate_record_native.test.ts`, which asserts what the duplicate's columns
CONTAIN — reported green over it.

## Gate reconciliation

- **New DEC-12 gate:** `test/unit/duplicate_record_dataframe_native.test.ts`
  (13 tests, measured green 2026-08-27: 13 pass / 0 fail / 106 expect() calls on
  the suite database `dedalo_v7_mht_test`) — builds a host record whose section, main component and dataframe
  slot are the generic `test` TLD (`test6099` / `test6117` / `test6744`), mints
  its frame targets at runtime in the slot's declared target section, writes
  every frame through the engine's own write path (dispatch → save →
  `mergeCallerEntries` → `normalizeDataframeEntry`), duplicates, and asserts
  over the WHOLE duplicate bag that no dd490 entry addresses a source frame
  target. It also asserts the topology, the surviving pairing, that reference
  locators stay SHARED, the alteration arm end to end (edit the copy's frame,
  re-read the original's), the orphan REFUSAL and the WIRE it produces (409,
  `conflict`, the slot in `details`), the TARGET-SECTION GRANT against a real
  non-admin principal the gate mints itself (level 2 on the host, level 1 on the
  target section, with a root positive control so the refusal cannot be a broken
  fixture), and the PRE-FLIGHT (two targets, one deleted under its pairing: the
  live one must not be minted).

  FOUR MORE ASSERTIONS from the third adversarial round (2026-08-27), each
  closing a hole the nine above were green over:

  - **the AUTHORIZATION half-mint.** Test 8's host carries ONE frame target, so
    moving only the grant check into the mint loop kept it and the orphan
    pre-flight green while re-opening the half-mint. Catching it needs TWO
    targets in TWO sections the actor holds DIFFERENT levels on — impossible
    under `test6744`, which declares exactly one target section, and the engine
    REFUSES an off-target frame (`relation.insert_refused`, constraint
    `off_target`, measured 2026-08-27). The gate therefore builds that case on
    the one host shape that expresses it: `testmint1` (repo-owned generic
    `test`-TLD ontology, `src/core/test_data/test_tld_ontology.json`), whose
    portal main `testmint1014` carries `testmint1035` → `rsc1370` and
    `testmint1036` → `rsc1379`, with the reader holding 2 / 2 / 1. The writable
    target is framed FIRST; its copy count must be UNCHANGED across the
    refusal, and a root positive control re-mints both. Test 8 keeps its
    single-target fixture rather than being rebuilt on that host;
  - **the CYCLE guard.** A mutual pair — A frames B, B frames A — must be
    REFUSED, not recursed. Each frame is written by the server and then
    re-pointed at the sibling host by SQL, because the off-target refusal above
    makes a cycle unwritable through the write path today; it is not unwritable
    in a DATABASE (a PHP-era row, a repair script, or an ontology declaring
    mutually-framing slots);
  - **the DISCLOSURE ORDER.** A no-grant principal against a host whose frame
    target has been DELETED must still get `perm.denied` — with a root positive
    control proving the engine really does answer "does not exist" to a
    principal that holds the grant;
  - **the NARROWING** (point 6): a dd490 entry whose `section_id` is an
    external remote id, an explicit null, or an absent key duplicates VERBATIM
    — key for key — and does not refuse.

  NOT a pure generic-`test` situation, deliberately: the frame TARGET sections
  and their literals are `rsc1242` / `rsc1248` and (for the two-slot host)
  `rsc1370` / `rsc1377` / `rsc1379`, reached through the `seed()` helper. Every
  one of them is named by the SLOT's own `request_config` — `test6744`,
  `testmint1035`, `testmint1036` declare exactly those target sections — so the
  alternative is not a `test` twin but a different slot testing a different
  contract. This is the sanctioned carve-out — `generic_tld_tripwire`
  names `rsc` among the SEED-SHIPPED TLDs every install carries, and
  `dataframe_idkey_native.test.ts` is the precedent — and it is stated here
  rather than claimed away.

  MUTATION-PROVED, one remediation at a time, EVERY COUNT RE-MEASURED against
  the 13-test gate as it stands on 2026-08-27 (each run isolated: the suite
  database is purged of stray scratch copies before and after, because a mutant
  leaks the unreferenced targets a half-mint mints, and a leak poisons the next
  measurement — that is how the "3 tests" claim in the first cut of this entry
  came to be stale):

  | mutation of `duplicate_record.ts` | result |
  |---|---|
  | the re-mint call removed | 5 pass / 8 fail — census, the alteration arm, and all six refusal tests |
  | the target-section grant removed | 10 pass / 3 fail — the authorization test, the authorization pre-flight, the disclosure order |
  | the whole pre-flight moved inside the mint loop | 11 pass / 2 fail — both pre-flight tests (2 copies of the live target where 1 is correct) |
  | ONLY the grant moved into the mint loop | 11 pass / 2 fail — the authorization pre-flight and the disclosure order (this is the refactor the nine-test gate was green over) |
  | the cycle guard (`chain.has`) deleted | 12 pass / 1 fail — the cycle test never terminates and dies on the runner timeout, which IS the failure it asserts |
  | the grant asked AFTER the target record is read | 12 pass / 1 fail — the disclosure order |
  | the narrowing reverted (refuse every non-address `section_id`) | 12 pass / 1 fail — the verbatim-copy test |
  | the refusal code back to `engine.uncovered_scope` | 9 pass / 4 fail — orphan, pre-flight, cycle, disclosure order |
  | the refusal's `publicMessage` dropped (public → operator disclosure) | 12 pass / 1 fail — the orphan test's wire assertion |
- **Parity:** no fixture change and NO RE-HARVEST NEEDED. The duplicate
  differential was retired at the cutover (its surviving anatomy is the DEC-14b
  twin `duplicate_record_native.test.ts`), and the frozen harvest store holds no
  duplicate response — the duplicate door was never harvested. Nothing in
  `test/parity/` replays this path, so there is no red gate to absorb.
- **Sibling gates unaffected:** `duplicate_record_native.test.ts`,
  `duplicate_record_media.test.ts`, `tools_cache_invalidation.test.ts` and
  `observer_native.test.ts` all duplicate scratch records carrying no dd490
  pairing, so the re-mint is a no-op there (the census returns empty and the
  function returns before touching anything).

## Residual, stated rather than hidden

`duplicateSectionRecord` is NOT transaction-wrapped — it cannot be, the observer
cascade refuses to run inside a transaction — so a failure between two frame-
target mints can leave a stray unreferenced target copy. That is a leak, and a
leak is recoverable by inspection; a shared frame target is not. If the writer
is ever made atomic, the mint loop belongs inside the same unit.

The pre-flight does not remove that leak, it narrows it. TWO ways a stray copy
still happens: a NESTED refusal (a frame target that itself carries an
unduplicable frame is only pre-flighted when the recursion reaches it, by which
time this level's earlier targets are minted), and any failure of the mint
itself (the database, the counter, a media copy). Making the pre-flight
recursive would close the first and not the second, which is why the honest
statement — a duplicate that is refused may leave unreferenced copies of frame
targets, and never a shared one — is the contract rather than a promise of
atomicity the writer cannot keep.

No existing surface finds such a copy: `dataframe_control` scans the same dd490
locators but asks whether a frame's MAIN ITEM still exists in its row, not
whether a target record is pointed at by anyone. A stray copy is therefore
found by inspection of the target section, and the refusal messages name the
repair rather than sending the curator to a tool that would report nothing.
