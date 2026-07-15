/**
 * TRIPWIRE — standalone-ownership classification of the maintenance-widget
 * EXECUTE surface + the engine-version single-source rule (UPDATE_PROCESS
 * Phase 0; rewrite/COEXISTENCE.md "Standalone-ownership gate" row).
 *
 * Invariants:
 *  1. EVERY widget apiActions entry is ownership-classified: marked `gated`
 *     (consults core/update/ownership.ts via support.ts gated()/gatedStub()),
 *     marked `denied` (engineDenied — closed-by-design), or listed in the
 *     named ENGINE_NATIVE exemption registry below with a reason. A new
 *     EXECUTE cannot bypass the gate by simply not mentioning it.
 *  2. The gated set is FROZEN (EXPECTED_GATED): silently un-gating an
 *     update/move EXECUTE is a red test, and so is gating a new action
 *     without ledgering it here.
 *  3. Denied handlers are PURE refusals: invoked, they return the
 *     engine_denied envelope (no DB, no writes) — the coexisting-mode
 *     contract engine_denied_boundary.test.ts pins byte-level.
 *  4. Engine/data version literals live ONLY in src/core/update/version.ts —
 *     the eight pre-Phase-0 hardcode sites must not regrow.
 *
 * Enumeration is marker-based over the LIVE registry (support.ts
 * OWNERSHIP_MARK function property) — no grep fragility. Hermetic-safe: no
 * DB, no state writes; only pure denied closures are invoked.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { ALL_WIDGET_MODULES } from '../../src/core/area_maintenance/widgets/registry.ts';
import {
	type WidgetHandler,
	ownershipMark,
} from '../../src/core/area_maintenance/widgets/support.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * ENGINE-NATIVE exemptions: apiActions that mutate TS-owned surfaces (or are
 * read-only) and deliberately do NOT consult the ownership gate — they never
 * touch anything the coexisting PHP install owns. Every entry needs a reason;
 * entries whose action disappears from the registry fail the staleness check.
 */
const ENGINE_NATIVE: Record<string, string> = {
	'make_backup.make_psql_backup': "pg_dump into the TS tree's own backup dir",
	'make_backup.get_dedalo_backup_files': 'read-only backup listing',
	'check_config.set_maintenance_mode':
		'TS-native runtime state (ts_state.json), not the PHP config_core.php',
	'check_config.set_recovery_mode': 'TS-native runtime state (ts_state.json)',
	'check_config.set_notification': 'TS-native runtime state (ts_state.json)',
	'config_areas.save_config_areas': 'TS-native runtime state (ts_state.json areas deny/allow)',
	'menu_skip_tipos.save_menu_skip_tipos': 'TS-native runtime state (ts_state.json menu skip list)',
	'export_hierarchy.sync_hierarchy_active_status':
		'hierarchy active-status sync through the TS write path',
	'add_hierarchy.install_hierarchies':
		'imports + activates vendored hierarchy files into the engine-owned (configured) database — the wizard EXECUTE path, reachable post-seal only through this widget',
	'add_hierarchy.reset_hierarchies':
		'DESTRUCTIVE delete-then-reimport of a hierarchy into the engine-owned (configured) database — explicit confirmed "Reset to seed" (PHP replace parity)',
	'diffusion_server_control.get_value': 'read-only diffusion engine status',
	'diffusion_server_control.cancel_process': 'TS-owned diffusion engine control (Bun owns MariaDB)',
	'diffusion_server_control.requeue_job': 'TS-owned diffusion engine control',
	'diffusion_server_control.purge_jobs': 'TS-owned diffusion engine control',
	'diffusion_server_control.set_scheduler': 'TS-owned diffusion engine control',
	'diffusion_server_control.retry_pending_deletions': 'TS-owned diffusion engine control',
	'php_runtime.clear_cache_files': 'TS in-process caches only',
	'php_runtime.clear_session_files': 'TS-owned session store pruning',
	'database_info.analyze_db':
		'shared-DB maintenance through the TS db_assets path (PHP-parity action, no PHP-tree surface)',
	'database_info.consolidate_tables': 'shared-DB maintenance through the TS db_assets path',
	'database_info.rebuild_user_stats': 'shared-DB maintenance through the TS db_assets path',
	'database_info.optimize_tables': 'shared-DB maintenance through the TS db_assets path',
	'database_info.rebuild_db_functions': 'shared-DB maintenance through the TS db_assets path',
	'database_info.rebuild_db_constraints': 'shared-DB maintenance through the TS db_assets path',
	'database_info.rebuild_db_indexes': 'shared-DB maintenance through the TS db_assets path',
	'database_info.recreate_db_assets': 'shared-DB maintenance through the TS db_assets path',
	'unit_test.create_test_record': 'scratch test-record surface (matrix_test)',
	'media_control.get_value': 'read-only media index status',
	'media_control.rebuild_media_index': 'TS-owned media index rebuild',
	'media_control.set_media_access_mode':
		'TS-native runtime state (ts_state.json media_access_mode) + the TS-owned media rule files (.htaccess / nginx include) — no PHP-install surface exists to own',
	'counters_status.get_value': 'read-only counters panel',
	'counters_status.modify_counter':
		'matrix_counter repair through the TS write path (PHP-parity action)',
	'dataframe_control.get_value': 'read-only dataframe panel',
	'dataframe_control.run_check': 'read-only dataframe consistency check',
	'dataframe_control.run_fix': 'dataframe repair through the TS write path',
	'error_reports.get_reports': 'read-only listing of the TS-owned error-report intake table',
};

/**
 * The FROZEN gated set (UPDATE_PROCESS phases): `stub: true` means the open
 * branch is still the denied closure (its phase has not landed). Adding a
 * gated action, or landing a phase (stub → false), updates this map in the
 * same change; removing the gate on any of these is a regression.
 */
const EXPECTED_GATED: Readonly<Record<string, { stub: boolean }>> = {
	'update_ontology.update_ontology': { stub: false }, // phase 2 — LANDED
	'update_data_version.update_data_version': { stub: false }, // phase 3 — LANDED
	'update_code.update_code': { stub: false }, // phase 4 — LANDED
	'update_code.build_version_from_git_master': { stub: false }, // phase 4 — LANDED
	'move_tld.move_tld': { stub: false }, // phase 5 — LANDED
	'move_locator.move_locator': { stub: false }, // phase 5 — LANDED
	'move_to_portal.move_to_portal': { stub: false }, // phase 5 — LANDED
	'move_to_table.move_to_table': { stub: false }, // phase 5 — LANDED
	'move_lang.move_lang': { stub: false }, // phase 5 — LANDED
	'register_tools.register_tools': { stub: false }, // phase 1 — LANDED
	'build_database_version.build_recovery_version_file': { stub: false }, // phase 2 — LANDED
	'build_database_version.restore_dd_ontology_recovery_from_file': { stub: false }, // phase 2 — LANDED
};

interface ActionEntry {
	key: string;
	handler: WidgetHandler;
}

function allActions(): ActionEntry[] {
	const entries: ActionEntry[] = [];
	for (const module of ALL_WIDGET_MODULES) {
		for (const [action, handler] of Object.entries(module.apiActions ?? {})) {
			entries.push({ key: `${module.spec.id}.${action}`, handler });
		}
	}
	return entries;
}

describe('ownership classification is TOTAL over the widget registry', () => {
	test('every apiActions entry is gated, denied, or a named ENGINE_NATIVE exemption', () => {
		const unclassified: string[] = [];
		const doubleClassified: string[] = [];
		const misnamed: string[] = [];
		for (const { key, handler } of allActions()) {
			const mark = ownershipMark(handler);
			if (mark === undefined) {
				if (!(key in ENGINE_NATIVE)) unclassified.push(key);
				continue;
			}
			if (key in ENGINE_NATIVE) doubleClassified.push(key);
			if (mark.what !== key) misnamed.push(`${key} (marked as '${mark.what}')`);
		}
		expect(
			unclassified,
			'UNCLASSIFIED widget EXECUTEs — classify each: wrap with gated()/gatedStub() (consults the ownership gate) or engineDenied() (closed-by-design), or add a named ENGINE_NATIVE exemption WITH A REASON in this file:',
		).toEqual([]);
		expect(
			doubleClassified,
			'marked handlers must not ALSO be listed in ENGINE_NATIVE (pick one classification):',
		).toEqual([]);
		expect(misnamed, "mark.what must be '<widget_id>.<action>' (the registry key):").toEqual([]);
	});

	test('ENGINE_NATIVE staleness: every exemption resolves to a live action, with a reason', () => {
		const live = new Set(allActions().map((entry) => entry.key));
		const rotted = Object.keys(ENGINE_NATIVE).filter((key) => !live.has(key));
		expect(
			rotted,
			'ENGINE_NATIVE entries whose widget.action no longer exists (drop them):',
		).toEqual([]);
		const reasonless = Object.entries(ENGINE_NATIVE)
			.filter(([, reason]) => reason.trim() === '')
			.map(([key]) => key);
		expect(reasonless, 'ENGINE_NATIVE entries need a non-empty reason:').toEqual([]);
	});

	test('the gated set is exactly EXPECTED_GATED (frozen — un-gating is a regression)', () => {
		const gatedKeys = allActions()
			.filter(({ handler }) => ownershipMark(handler)?.kind === 'gated')
			.map(({ key }) => key)
			.sort();
		expect(gatedKeys).toEqual(Object.keys(EXPECTED_GATED).sort());
	});

	test('phase state: openIsStub matches the ledgered phase state per action', () => {
		for (const { key, handler } of allActions()) {
			const mark = ownershipMark(handler);
			if (mark?.kind !== 'gated') continue;
			expect(mark.openIsStub, `${key} openIsStub`).toBe(EXPECTED_GATED[key]?.stub ?? true);
		}
	});
});

describe('denied handlers are pure engine_denied refusals', () => {
	const DUMMY: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

	test('every denied-marked handler (incl. gated whenClosed stubs) refuses without side effects', async () => {
		for (const { key, handler } of allActions()) {
			const mark = ownershipMark(handler);
			// direct denials, plus the denied closures behind gated stubs
			const targets: WidgetHandler[] = [];
			if (mark?.kind === 'denied') targets.push(handler);
			if (mark?.kind === 'gated' && mark.whenClosed !== undefined) {
				const closedMark = ownershipMark(mark.whenClosed);
				if (closedMark?.kind === 'denied') targets.push(mark.whenClosed);
			}
			for (const target of targets) {
				const response = await target({}, DUMMY);
				expect(response.result, `${key} denied result`).toBe(false);
				expect(response.errors[0], `${key} denied errors[0]`).toStartWith('engine_denied: ');
				expect(response.msg, `${key} denied msg`).toMatch(
					/^Error\. '.+' is not runnable on this engine: .+\. Run it from the PHP maintenance dashboard\.$/,
				);
			}
		}
	});
});

describe('TLS peer verification stays ON (WC-023 D1)', () => {
	test("no 'rejectUnauthorized: false' in src/ or tools/ runtime code", () => {
		const banned = /rejectUnauthorized['"]?\s*:\s*false/;
		const offenders: string[] = [];
		const glob = new Glob('{src,tools}/**/*.ts');
		for (const rel of glob.scanSync({ cwd: REPO_ROOT })) {
			if (rel.endsWith('.test.ts')) continue;
			const raw = readFileSync(join(REPO_ROOT, rel), 'utf8');
			const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
			if (banned.test(stripped)) offenders.push(rel);
		}
		expect(
			offenders,
			'TLS peer verification must never be disabled (PHP ssl_verifypeer=false is the weakness this port rejects; pin private CAs via NODE_EXTRA_CA_CERTS):',
		).toEqual([]);
	});
});

describe('engine-version single source (core/update/version.ts)', () => {
	test('no version literals outside version.ts in src/ and tools/ runtime code', () => {
		// Quote-anchored: '7.0.0' / "7.0.0.dev" / `7.0.0` — never bare (would
		// false-positive on '127.0.0.1'); plus the [7, 0, 0] array form.
		const stringLiteral = /['"`]7\.0\.0(\.dev)?['"`]/;
		const arrayLiteral = /\[\s*7\s*,\s*0\s*,\s*0\s*\]/;
		const offenders: string[] = [];
		const glob = new Glob('{src,tools}/**/*.ts');
		for (const rel of glob.scanSync({ cwd: REPO_ROOT })) {
			if (rel === join('src', 'core', 'update', 'version.ts')) continue;
			if (rel.endsWith('.test.ts')) continue;
			const raw = readFileSync(join(REPO_ROOT, rel), 'utf8');
			// strip block comments, then line-comment tails
			const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
			if (stringLiteral.test(stripped) || arrayLiteral.test(stripped)) {
				offenders.push(rel);
			}
		}
		expect(
			offenders,
			'engine/data version literals belong in src/core/update/version.ts ONLY (import the exported shapes):',
		).toEqual([]);
	});
});
