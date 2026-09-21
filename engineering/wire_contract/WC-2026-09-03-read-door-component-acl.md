# WC-2026-09-03-read-door-component-acl — every read door applies the per-component grant, and says so when it narrows

- **Date:** 2026-09-03, with the P1-3 remediation of the 2026-08-26 deep audit
  (SEC-04, SEC-06, SEC-10, SEC-11, SEC-12, SEC-13).
- **Decision:** DEC-12 (invariants are tripwired). Gates:
  `test/unit/read_door_acl_tripwire.test.ts` (census TOTAL over the dispatch and
  MCP registries, open set shrink-only) and `test/unit/read_door_acl_native.test.ts`
  (every `component` door probed as a reader/control PAIR on the suite database).
  Module: `src/core/security/read_door.ts`.

## Shape before (PHP, and TS through 2026-09-02)

`dd_core_api::read_raw` returned, for every record its SQO matched (already
scoped by the projects ACL), the STORED VALUE with NO per-component grant:

- `type:'component'` → `[value | null, …]` of `options.tipo` for every row,
  whether or not the caller's profile grants that component;
- `type:'section'` → every jsonb column of every row VERBATIM — on `dd128` that
  is the `string` column with the `dd133` Argon2id hash;
- `type:'target_section'` → every stored locator of the requested section, under
  every relation key.

The GET twin (`/dedalo/core/api/v1/raw`) was hardened separately with a fixed
action and a sensitive-section denylist; the POST action had neither. The
existing gate (`read_raw_native`) documented the dump as intended.

Five more doors returned component values behind a section grant or a record
scope only: the MCP `dedalo_get_media_info` tool (variant paths + fetch URLs),
`find_matches`' `thumb_url` (the profile's preview media component),
`identify_by_image` with an OMITTED scope (the whole image index, while a NAMED
scope was refused), the criterion path reader (authorized the DECLARED leaf
section while landing on the LOCATOR's own), and `get_element_context` (a
section context built with no principal, so every button rendered).

## Shape after (TS)

**The door's component key is the human read's PAIR:** the SECTION read grant
(`getPermissions(section, section) ≥ 1`, dd_core_api's Gate A/B) AND
`ddoIsAuthorized` on the component — a profile granting a component WITHOUT its
section (SEC-11's shape) is refused at every door exactly as the record page
refuses it. Every shape below reads "level 0" as "either grant at 0".

**The decision for `read_raw`, recorded:** `ddoIsAuthorized` per component key —
the human read's exact predicate — NOT the GET twin's denylist. A denylist names
the one section somebody thought of and leaves every other level-0 component of
every other section readable; the per-key grant is what the human read already
promises and what the caller's profile actually says.

- `type:'component'` — the ONE requested tipo denied on the PRIMARY section is
  `{ok:false, error:{code:'perm.denied'}}` (403), before any row is read. A row
  that LANDED in another section (a multi-section SQO, a sibling sharing the
  table) where the tipo is denied yields `null` in position.
- `type:'section'` — each jsonb column is PROJECTED to the keys the caller may
  read on the row's OWN section. A refused key is ABSENT; a column that loses
  every key is `{}` (never `null` — "you may read none of it" is not "the record
  has no such column"); a stored `null` column stays `null`.
- `type:'target_section'` — locators stored under a denied relation key are not
  harvested.
- **A narrowed answer carries `notices:[{code:'perm.out_of_scope', label_key:
  'error_perm_out_of_scope', retryable:false}]`** beside `ok:true` — ONE notice
  per request however many keys were refused (a count is an existence oracle).
  An answer nothing narrowed carries no `notices` key. The operator log line
  `[frontier] REFUSED door/dd_core_api.read_raw: …` names the coordinates.
- The superuser (-1) resolves to level 3 everywhere, so the frozen
  `read_raw_differential` (runs as -1) is byte-identical. A GLOBAL ADMIN resolves
  through their profile like the human read (no bypass; PHP parity 2026-07-18):
  the GET raw view of an admin whose profile lacks a component now omits it. The
  GET twin keeps its `dd128` denylist as defense in depth.

The other five doors:

- `dedalo_get_media_info` (MCP): `perm.denied` when the caller holds level 0 on
  `(section_tipo, field)` OR on the section itself, checked BEFORE the record
  scope — the read twin of `uploadMedia`'s level ≥ 2.
- `dedalo_read_record` (MCP): `perm.denied` when the caller holds level 0 on the
  section — the human read's Gate B, which the tool's direct `readSection` call
  bypassed; a principal granted components but not their section received the
  record identity + those components here (was: `data:[]`-or-served, never an
  error).
- `find_matches`: `thumb_url` is `null` for the seed and for every candidate
  whose section the caller holds level 0 on for the profile's `previewComponent`;
  such records are never handed to the thumb resolver. Answers that narrowed
  carry the same ONE `notices[]` entry as above.
- `identify_by_image`: every surviving hit needs the section read grant,
  whether `section_tipo` was named or omitted — a hit from a section the caller
  may not open is dropped (silently in `results`, as the ACL filter already drops;
  the notice rides on the envelope). The `scope` echo is unchanged.
- **`ai/rag/retrieval.ts aclGate` requires the section grant for EVERY chunk**,
  image chunks included (it did for `rag:<group>` chunks only). This also narrows
  `dd_rag_api` `similar_objects` / `search_by_text_image` / `similar_to` for a
  principal holding a media component without its section.
- The criterion path reader (`core/identify/path_read.ts`) authorizes every
  record a path LANDS on, on that record's own section, hop and leaf, with the
  frontier's two keys under the caller's scope; a refused record is dropped from
  the value. The scope is MANDATORY: a wiring without one does not compile and
  the reader throws `internal.invariant`; a caller-less read declares
  `internalPathReadScope(door)`. Observable on `find_matches` / `get_proposals` / `resolve_type_link`
  / the identify cluster + vision engines as a value that no longer includes what
  a sibling-section locator pointed at. The DECLARED-leaf pre-check keeps minting
  the `restricted` outcome marker; a landed-only refusal reads as absence.
- `get_element_context` (section): `buttons[]` is now the per-button grant
  (`getPermissions(section, button) ≥ 2`), not every button of a caller at
  section level ≥ 2.

## Reason

The audit's systemic finding S-5: authorization was a call a door made rather
than a property the read path had. `read_door.ts` is the one predicate and the
one refusal law; `READ_DOOR_POSTURE` classifies every registered door so a new
one cannot ship unclassified, and enumerates (shrink-only) the doors this batch
did NOT close: `get_section_terms`, `get_indexation_grid`, `get_tags_info`,
`get_media_streams`, `download_fragment`, `component_info:get_widget_data`,
`convert_search_object_to_sql_query`.

## Gate reconciliation

- `test/parity/read_raw_differential.test.ts` runs as the superuser (-1): byte
  identical, no re-harvest needed (a re-harvest is impossible anyway).
- `test/unit/read_raw_native.test.ts` rewritten: the header no longer documents
  the dump as intended; a component leg (reader/control pairs on all three
  arms + the notice) added; identities moved to
  `test/helpers/read_door_identity_fixture.ts`.
- `identify_api` (thumb denied → null, never asked), `identify_by_image`
  (omitted scope not wider than named), `identify_path_read` + `identify_match`
  (declared ≠ landed → refused; memo honest), `get_element_context_native`
  (per-button ACL) carry the behavioural twins; `frontier_class_native`'s
  open-door census shrinks 4 → 3 (`path_read.ts` closed).
- `read_door_acl_tripwire` pins the scope law as an OUTCOME (the reader refuses
  an absent scope) and the door key as the PAIR; `read_door_acl_native` probes
  `dedalo_get_media_info` and `dedalo_read_record` with the media-only identity
  (components without their section) against the control.
- No fixture in `test/parity/fixtures/oracle_harvest/` changes.
