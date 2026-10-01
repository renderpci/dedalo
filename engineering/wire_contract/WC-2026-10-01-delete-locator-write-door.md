# WC-2026-10-01-delete-locator-write-door — `delete_locator` goes through the write door: pair, section floor 2, scope

- **Date:** 2026-10-01 (closure Step 3, audit 2026-09-26 SEC-2, the `delete_locator` half;
  the media half is WC-2026-09-30-media-pair-scope).
- **Decision:** owner decisions 2026-09-30 (Step 3 leanings accepted: every record-addressed
  write goes through WC-2026-09-30-write-door). Code: `src/core/relations/save.ts`
  (`deletePortalLocator` = the door; the effect `removePortalLocatorUnderGrant` is module
  private and typed on the grant), `src/core/security/write_door.ts` (`RecordGrant.userId`,
  the actor the grant was minted for; grant fields type-checked before the brand cast).
- **Supersedes:** "Addendum 2026-08-09 — the delete_locator gate is not a divergence" in
  WC-2026-08-09-record-birth-defaults. That section-only `getSectionPermissions >= 2` gate
  was a faithful PHP restoration; this entry is a deliberate divergence from it.
- **Doors:** `dd_component_portal_api.delete_locator` (the portal unlink, tool_indexation's
  "delete index" step 2) and every importer of `deletePortalLocator` (the MCP
  `dedalo_portal_unlink` authorizes itself first, then reaches this door).

| | Before (HEAD) | After |
|---|---|---|
| Section | `getSectionPermissions >= 2` (consultation-capped) | the same, as the door's `sectionFloor: 2` |
| Pair `(section_tipo, tipo)` | never asked — a profile reading the portal field but writing the section unlinked from it | `>= 2`, dd128 own-record aware: a user manager cannot unlink their own profile / active / admin flag |
| Record scope | never asked — a record outside the caller's projects was rewritten | `assertRecordWriteTarget`: out of projects → `perm.out_of_scope` |
| `section_id <= 0` | served | `perm.out_of_scope` for every caller, admins included, before the admin bypass |
| Tipo / id grammar | unchecked (`Number(section_id)`) | `request.invalid` (identifier grammar, an integer id) |
| Missing `options.locator` | `request.invalid_options` before any gate | `request.invalid_options` only AFTER the door (an unauthorized caller learns nothing of the payload; the `delete_tag` precedent) |
| Audit actor (portal write, TM rows, frame cascade) | the request's principal | the grant's `userId` |
| Frame `delete_target` cascade | as the request's principal | as the grant's `userId` — a caller reading the frame section only is refused (`perm.denied`, `target_section_tipo` = the frame section) and the whole unlink rolls back |

- **Wire:** success envelope unchanged (`data` = removed count, `msg`). New refusals a client
  can see: `perm.denied` on a read-only portal field or the manager's own dd128 fields;
  `perm.out_of_scope` on an out-of-projects record or a non-positive id; `request.invalid`
  on a malformed tipo. A missing address stays `request.invalid_options`.
- **Owner flag — indexation orphans:** "delete index" is two calls. `delete_tag` runs at
  section floor 0 (`SECTION_FLOOR_ZERO_DOORS`, the save's twin) and `delete_locator` at
  section floor 2 with the pair. A profile writing the transcription field but only reading
  the section gets its marks removed, then the locator refused: the `rsc860` locator is
  left behind as an orphan (the audit §5.4 shape, now on a narrower population). The
  structural fix is ONE atomic "delete index" door (marks + locator in one transaction,
  one authorization) — not landed; ledgered.
- **Open question (owner):** the door does not check the MODEL at `tipo`: a non-relation
  component the caller may write passes the door and its column is read as locators.
  Should a non-relation model be refused (`request.invalid`) before the lock? Not decided;
  behaviour unchanged.
- **Follow-up (not blocking):** the MCP `portalUnlink` (`src/ai/mcp/tools/fields_write.ts`)
  authorizes at floor 1 and then the engine at floor 2 — move it onto the engine door so
  it is authorized once.
- **Reason:** a removal is a write; a write goes through the one door (pair, floor, scope)
  and its effect is built from the grant, never from the request.
- **Gate reconciliation:** no parity fixture exercises a refusal of this door; no
  re-harvest. Gates: `test/unit/portal_locator_door_native.test.ts` (legs a–j, every
  refusal measured on stored portal + slot bytes and the TM row count; vacuity control;
  locator check after the door), `test/unit/authz_door_matrix_native.test.ts` (the
  `dd_component_portal_api:delete_locator` probe — NO_COMPONENT, OUT_OF_SCOPE, ADMIN_ID0,
  DD1725, READ_COMPONENT cells), `test/unit/write_door_native.test.ts` (the grant carries
  `userId`), `test/unit/dataframe_delete_policy_native.test.ts` (the frame-target grant
  through `deletePortalLocator` as a non-admin), `test/unit/dd128_write_census_tripwire.test.ts`
  (`save.ts` and `dd_component_portal_api.ts` are `delegates`, measured by DD128_PROBED).
