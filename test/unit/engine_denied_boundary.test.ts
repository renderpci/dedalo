/**
 * The CLOSED-BY-DESIGN boundary, made explicit: every PHP maintenance method
 * that mutates the PHP INSTALL (code tree, install/ files, config files) or
 * replaces shared assets from PHP-tree sources is registered as an EXPLICIT
 * engine_denied refusal — a named reason, not a generic unauthorized_method.
 * This test enumerates the boundary; a new denial belongs here, and a denial
 * that becomes portable leaves here with its port.
 */

import { describe, expect, test } from 'bun:test';
import { dispatchWidgetRequest } from '../../src/core/area_maintenance/widgets/registry.ts';

const ROOT = { userId: -1, isGlobalAdmin: true };

// NOTE: register_tools.register_tools LEFT this boundary — the tools/ tree is
// now TS-owned, so the import runs here (dry-run by default). See
// test/parity/tools_register_differential.test.ts + test/unit/tools_register*.
//
// 2026-07-11 cutover: the ownership-GATED actions (update_code.update_code /
// build_version_from_git_master, update_ontology.update_ontology, the move_*
// family, build_database_version.build_recovery_version_file /
// restore_dd_ontology_recovery_from_file) left this LIVE-dispatch boundary —
// engineOwnsInstall() is collapsed to true, so their OPEN branches answer
// here. Their frozen whenClosed refusal closures stay pinned byte-level by
// update_ownership_tripwire.test.ts ("denied handlers are pure refusals").
// What remains below is the PURE engineDenied set: closed-by-design methods
// whose surfaces this engine never took over.
//
// 2026-07-12: media_control.set_media_access_mode LEFT this boundary with its port. The
// media access mode is now TS-native runtime state (ts_state.json) and the engine owns
// BOTH generated web-server rule files — there is no PHP install config to write. See
// src/core/media/protection.ts + engineering/MEDIA_PROTECTION.md (closes MEDIA-01).
const DENIED: [string, string][] = [
	['update_ontology', 'export_to_translate'],
	['update_ontology', 'rebuild_lang_files'],
	['export_hierarchy', 'export_hierarchy'],
	['build_database_version', 'build_install_version'],
	['build_database_version', 'build_matrix_hierarchy_main_sql'],
];

describe('closed-by-design boundary (explicit engine_denied refusals)', () => {
	test('every boundary method refuses with a NAMED engine_denied envelope', async () => {
		for (const [widget, method] of DENIED) {
			const response = await dispatchWidgetRequest(
				ROOT as never,
				{ model: widget, action: method },
				{},
			);
			expect(response.result).toBe(false);
			expect(response.errors).toContain(`engine_denied: ${widget}.${method}`);
			expect(response.msg).toContain('is not runnable on this engine');
			expect(response.msg).toContain('PHP maintenance dashboard');
		}
	});

	test('unknown methods still get the generic registry denial', async () => {
		const response = await dispatchWidgetRequest(
			ROOT as never,
			{ model: 'update_code', action: 'not_a_method' },
			{},
		);
		expect(response.result).toBe(false);
		expect(response.errors).toContain('unauthorized_method');
	});
});
