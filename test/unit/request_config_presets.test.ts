/**
 * request_config PRESETS (dd1244 layout maps) — unit gate for the reader +
 * two-pass ownership matcher (PHP class.request_config_presets). Two tiers:
 *
 *  - PURE: selectMatchingPreset over synthetic preset arrays — deterministic,
 *    no DB/oracle. Covers what the LIVE fixture cannot: a PRIVATE preset only
 *    resolves for its owner (pass 1), personal wins over public, and the triple
 *    is mode/tipo/section keyed.
 *  - DB SMOKE (gated on a reachable matrix DB, skipped honestly otherwise):
 *    getActiveRequestConfigPresets hydrates real dd1244 records with well-formed
 *    fields, and resolvePresetRequestConfig resolves the active fixture. The
 *    live-PHP EQUALITY is the sibling parity gate
 *    (test/parity/request_config_presets_differential.test.ts).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	type RequestConfigPreset,
	clearRequestConfigPresetsCache,
	getActiveRequestConfigPresets,
	resolvePresetRequestConfig,
	selectMatchingPreset,
} from '../../src/core/relations/request_config/presets.ts';
import { runWithRequestContext } from '../../src/core/security/request_context.ts';

function preset(overrides: Partial<RequestConfigPreset>): RequestConfigPreset {
	return {
		tipo: 't1',
		sectionTipo: 't1',
		mode: 'edit',
		userId: null,
		public: false,
		data: [{ show: { ddo_map: [{ tipo: 'c1' }] } }],
		...overrides,
	};
}

describe('selectMatchingPreset — two-pass ownership (pure, no I/O)', () => {
	test('a PUBLIC preset resolves for any user via the public fallback (pass 2)', () => {
		const list = [preset({ public: true })];
		expect(selectMatchingPreset(list, 't1', 't1', 'edit', 42)?.public).toBe(true);
		// and with no principal at all (internal build / test scope)
		expect(selectMatchingPreset(list, 't1', 't1', 'edit', undefined)?.public).toBe(true);
	});

	test('a PRIVATE preset resolves ONLY for its owner (pass 1), never leaks to others', () => {
		const list = [preset({ userId: '7', public: false })];
		// owner sees it
		expect(selectMatchingPreset(list, 't1', 't1', 'edit', 7)).not.toBeNull();
		// a different user does not
		expect(selectMatchingPreset(list, 't1', 't1', 'edit', 8)).toBeNull();
		// and neither does an unauthenticated build (no public fallback exists)
		expect(selectMatchingPreset(list, 't1', 't1', 'edit', undefined)).toBeNull();
	});

	test('a personal preset WINS over a public one for the same triple', () => {
		const own = preset({
			userId: '7',
			public: false,
			data: [{ show: { ddo_map: [{ tipo: 'OWN' }] } }],
		});
		const pub = preset({
			userId: null,
			public: true,
			data: [{ show: { ddo_map: [{ tipo: 'PUB' }] } }],
		});
		const chosen = selectMatchingPreset([pub, own], 't1', 't1', 'edit', 7);
		expect(chosen).not.toBeNull();
		const ddoMap = (chosen?.data[0] as { show: { ddo_map: { tipo: string }[] } } | undefined)?.show
			?.ddo_map;
		expect(ddoMap?.[0]?.tipo).toBe('OWN');
	});

	test('the match is keyed on tipo, section_tipo AND mode', () => {
		const list = [preset({ public: true })];
		expect(selectMatchingPreset(list, 't1', 't1', 'list', 1)).toBeNull(); // wrong mode
		expect(selectMatchingPreset(list, 'tX', 't1', 'edit', 1)).toBeNull(); // wrong tipo
		expect(selectMatchingPreset(list, 't1', 'tX', 'edit', 1)).toBeNull(); // wrong section
		expect(selectMatchingPreset(list, 't1', 't1', 'edit', 1)).not.toBeNull(); // exact
	});

	test('loose id compare: numeric principal matches the stored string section_id', () => {
		const list = [preset({ userId: '-1', public: false })];
		expect(selectMatchingPreset(list, 't1', 't1', 'edit', -1)).not.toBeNull();
	});
});

describe('request_config presets — DB reader smoke', () => {
	let dbReady = false;
	let presets: RequestConfigPreset[] = [];

	beforeAll(async () => {
		try {
			await sql`SELECT 1`;
			dbReady = true;
		} catch {
			dbReady = false; // no shared matrix DB on this machine — skip honestly
			return;
		}
		clearRequestConfigPresetsCache();
		presets = await getActiveRequestConfigPresets();
	});

	test('every hydrated active preset is well-formed (keys + non-empty payload)', () => {
		if (!dbReady) return;
		for (const p of presets) {
			expect(p.tipo).not.toBe('');
			expect(p.sectionTipo).not.toBe('');
			expect(typeof p.mode).toBe('string');
			expect(Array.isArray(p.data)).toBe(true);
			expect(p.data.length).toBeGreaterThan(0);
		}
	});

	test('resolvePresetRequestConfig returns an active preset payload (non-vacuous)', async () => {
		if (!dbReady || presets.length === 0) return; // no fixture present → skip honestly
		const sample = presets[0]!;
		const currentUserId = sample.userId !== null ? Number(sample.userId) : undefined;
		const resolve = () => resolvePresetRequestConfig(sample.tipo, sample.sectionTipo, sample.mode);
		const data =
			currentUserId !== undefined
				? await runWithRequestContext(
						{
							principal: { userId: currentUserId, isGlobalAdmin: true, isDeveloper: true },
							session: null,
							requestId: 'presets_unit',
							clientIp: '127.0.0.1',
						},
						resolve,
					)
				: await resolve();
		expect(data).toEqual(sample.data);
	});

	test('an unknown triple resolves to null', async () => {
		if (!dbReady) return;
		expect(await resolvePresetRequestConfig('__no_section__', '__no_section__', 'edit')).toBeNull();
	});

	test('clearRequestConfigPresetsCache forces a consistent re-read', async () => {
		if (!dbReady) return;
		clearRequestConfigPresetsCache();
		const again = await getActiveRequestConfigPresets();
		expect(again.length).toBe(presets.length);
	});
});
