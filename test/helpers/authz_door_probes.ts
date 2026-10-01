/**
 * DD128_PROBED — the bridge between the dd128 write census
 * (test/unit/dd128_write_census_tripwire.test.ts) and the authorization-door
 * matrix (test/unit/authz_door_matrix_native.test.ts), closure Step 3.
 *
 * A census row may claim the verdict `delegates` — "this file's dd128-reachable
 * writes are authorized by the write door (security/write_door.ts), which
 * applies the own-record rule" — ONLY when the claim is MEASURED: the file is a
 * key here, and every matrix door listed for it runs the DD1725 leg (a
 * `(dd128, dd1725)` user-manager addressing their OWN account) and must answer
 * `refused`. The census asserts the membership; the matrix asserts the outcome.
 * A spelling (an import of write_door) is never the evidence on its own.
 *
 * Lives in a helper, not in either test file: a test file imported by another
 * registers its tests twice.
 */

/** Census file → the matrix door keys whose DD1725 leg proves the file delegates. */
export const DD128_PROBED: Readonly<Record<string, readonly string[]>> = {
	// The human save door (sectionFloor 0, the named exception) — its DD1725 leg
	// is the own-record DOWNGRADE through authorizeRecordAccess.
	'src/core/api/handlers/dd_core_api.ts': ['dd_core_api:save'],
	// The MCP write tools — set_field / save_component on the manager's own dd1725.
	// fields_write.ts has TWO dd128-reachable writers that authorize themselves:
	// setField (portal_link / find_or_create fill through it) and portalUnlink
	// (its own door, then deletePortalLocator) — each is a probed door.
	'src/ai/mcp/tools/fields_write.ts': ['mcp:dedalo_set_field', 'mcp:dedalo_portal_unlink'],
	'src/ai/mcp/tools/records_write.ts': ['mcp:dedalo_save_component'],
	// THE declarative tool gate: its `tipo` and `record_tipo` kinds, at write level.
	'src/core/tools/security.ts': [
		'tool:tool_time_machine:apply_value',
		'tool:tool_image_rotation:apply_rotation',
		'tool:tool_tc:change_all_timecodes',
	],
	// (tool_tc is NOT here: the matrix probes its declarative GATE — the
	// security.ts row above — never its handler, so the file claims nothing of
	// its own; its census row is PENDING.)

	// The tag-delete wire door and the engine it is the ONLY importer of (the
	// importer set is DERIVED by the census — DELEGATING_ENGINES).
	'src/core/api/handlers/dd_component_text_area_api.ts': ['dd_component_text_area_api:delete_tag'],
	'src/core/components/component_text_area/tag_delete.ts': [
		'dd_component_text_area_api:delete_tag',
	],
	// The portal-unlink wire door and its engine (SEC-2-delete_locator):
	// deletePortalLocator is now the write door itself (pair 2, section floor 2,
	// scope). mcp:dedalo_portal_unlink is NOT listed for save.ts — the MCP door
	// refuses DD1725 before the engine runs, so its leg proves nothing of it.
	'src/core/api/handlers/dd_component_portal_api.ts': ['dd_component_portal_api:delete_locator'],
	'src/core/relations/save.ts': ['dd_component_portal_api:delete_locator'],
	// (transcription_asr.ts is NOT here: its exported saveTranscriptionResult is
	// an UNGATED writer any importer may call, and no matrix door drives the
	// poll's save with the DD1725 manager — PENDING until one does.)
};
