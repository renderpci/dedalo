/**
 * MOCK ISOLATION — `bun test` shares ONE process, so a module mock and a global
 * stub are not scoped to the file that installs them.
 *
 * WHY THIS EXISTS (measured 2026-08-21). Two files were quietly corrupting
 * every other file in the tier, and neither of the victims mocked anything:
 *
 *   - `client_upload_queue_render` replaced `globalThis.URL` with a plain
 *     object carrying `createObjectURL`/`revokeObjectURL`. A plain object is
 *     NOT a constructor, so every `new URL(...)` elsewhere in the process threw
 *     "Object is not a constructor". The visible symptom was
 *     `external_transport_native` reporting `bad_config` where it asserts
 *     `blocked_host` — a SECURITY gate naming the wrong reason for a refusal,
 *     in a file that touches no globals at all.
 *   - `client_tm_list_destroy_race` mocked `events.js` with only the one export
 *     it uses. `mock.module` is process-global, so the module was TRUNCATED for
 *     everyone: another file importing it died at import with "Export named
 *     'dd_request_idle_callback' not found", nowhere near the cause.
 *
 * Both were invisible in isolation and only appeared in certain file ORDERS,
 * which is the worst property a gate can have: the suite's own signal stops
 * being trustworthy, and a real regression can hide in the noise.
 *
 * ── THE TWO RULES ────────────────────────────────────────────────────────────
 *  1. A `mock.module` factory returning an object literal must SPREAD the real
 *     module (`...real`), so the surface stays whole for every other importer —
 *     or carry a named exemption saying why it cannot.
 *  2. A file that installs a module mock must restore it (`mock.restore()`), or
 *     say why it does not need to.
 *
 * ── HONEST LIMITATIONS ───────────────────────────────────────────────────────
 *  - It reads SOURCE, not behaviour: a factory that spreads the wrong module
 *    passes. The rules make the common accident impossible, not every accident.
 *  - It cannot see a global stub at all (rule 1 covers modules). The `URL` case
 *    above is prevented by review and by the comment left at that site, not by
 *    this gate — stubbing a global CONSTRUCTOR is the pattern to look for.
 *
 * HERMETIC: filesystem reads of tracked test source. No DB, no network, no clock.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const UNIT_DIR = join(import.meta.dir);

/**
 * A SHRINK-ONLY BASELINE, not an approval list.
 *
 * Two of these were proved to corrupt other files (see the header) and are
 * fixed; the rest are UNVETTED — they may be harmless, and asserting otherwise
 * without measuring would be a claim this gate cannot support. So the rule is
 * the honest one: these exist, and NO MORE may appear. Removing a name is a
 * one-line change in the commit that fixes it; adding one is refused.
 *
 * Three entries are known-good by inspection and noted as such: they capture
 * the REAL module up front and re-mock it back, which is a restore by another
 * name.
 */
const PARTIAL_MOCK_BASELINE: readonly string[] = [
	'client_data_model_guard.test.ts',
	'client_tm_list_destroy_race.test.ts', // ui.js; its events.js mock WAS the proven leak, now spread
	'client_upload_queue_render.test.ts',
	'component_info_widget_client.test.ts',
	'dd_tools_api_stream_headers.test.ts', // captures + re-mocks the real module
	'record_scope_gates.test.ts', // captures + re-mocks the real module
	'tools_record_tipo_permission.test.ts', // captures + re-mocks the real module
	'transcription_status_panel.test.ts', // a VIRTUAL module id: no file on disk to spread
];

/** Same shape: files that install a module mock and never call `mock.restore()`. */
const NO_RESTORE_BASELINE: readonly string[] = [
	'client_open_window_guard.test.ts',
	'client_show_interface_ownership.test.ts',
	'media_master_qualities_config.test.ts',
	'tm_bulk_revert.test.ts',
];

interface Site {
	file: string;
	body: string;
}

/** This file NAMES `mock.module(` in its prose and its regex; it never calls it. */
const SELF = 'mock_isolation_tripwire.test.ts';

function unitFiles(): string[] {
	return readdirSync(UNIT_DIR)
		.filter((name) => name.endsWith('.test.ts') && name !== SELF)
		.sort();
}

/** Every `mock.module(x, () => ({ … }))` site — the REPLACEMENT shape. */
function objectLiteralMockSites(): Site[] {
	const sites: Site[] = [];
	for (const file of unitFiles()) {
		const source = readFileSync(join(UNIT_DIR, file), 'utf8');
		for (const match of source.matchAll(
			/mock\.module\([^,]+,\s*\(\)\s*=>\s*\(\{(.*?)\}\)\s*\)/gs,
		)) {
			sites.push({ file, body: match[1] ?? '' });
		}
	}
	return sites;
}

describe('mock isolation — one process, so a mock is everyone’s', () => {
	test('NO NEW partial module mock (shrink-only)', () => {
		const partial = [
			...new Set(
				objectLiteralMockSites()
					.filter((site) => !site.body.includes('...'))
					.map((site) => site.file),
			),
		].sort();
		const added = partial.filter((file) => !PARTIAL_MOCK_BASELINE.includes(file));
		expect(
			added,
			'A partial `mock.module` TRUNCATES that module for every other file in the tier — they fail at import with "Export named \'x\' not found", nowhere near this file. Spread the real module and override only what you stub.',
		).toEqual([]);
	});

	test('NO NEW unrestored module mock (shrink-only)', () => {
		const unrestored = unitFiles().filter((file) => {
			const source = readFileSync(join(UNIT_DIR, file), 'utf8');
			return source.includes('mock.module(') && !source.includes('mock.restore()');
		});
		const added = unrestored.filter((file) => !NO_RESTORE_BASELINE.includes(file));
		expect(
			added,
			'`mock.module` is process-global: a file that never restores hands its stub to every later file importing the same module.',
		).toEqual([]);
	});

	test('the baselines are LIVE — a stale entry is a finding, because it hides a regression', () => {
		const partial = new Set(
			objectLiteralMockSites()
				.filter((site) => !site.body.includes('...'))
				.map((site) => site.file),
		);
		expect(
			PARTIAL_MOCK_BASELINE.filter((file) => !partial.has(file)),
			'fixed — delete these names in the same change that fixed them',
		).toEqual([]);
		const unrestored = new Set(
			unitFiles().filter((file) => {
				const source = readFileSync(join(UNIT_DIR, file), 'utf8');
				return source.includes('mock.module(') && !source.includes('mock.restore()');
			}),
		);
		expect(
			NO_RESTORE_BASELINE.filter((file) => !unrestored.has(file)),
			'fixed — delete these names in the same change that fixed them',
		).toEqual([]);
	});

	test('ANTI-VACUITY: the scan actually finds mock sites', () => {
		const mockers = unitFiles().filter((file) =>
			readFileSync(join(UNIT_DIR, file), 'utf8').includes('mock.module('),
		);
		// 40+ files mock a module today; a scan that found none would pass every
		// rule above while measuring nothing.
		expect(mockers.length).toBeGreaterThan(20);
		expect(objectLiteralMockSites().length).toBeGreaterThan(5);
	});
});
