/**
 * GEOIP ENSURE — native contract gate (rewrite/CRAP_COVERAGE_PLAN.md §3.15).
 *
 * Gates the pure enabled / auto-update / freshness policy extracted out of
 * ensureGeoipDb. The surrounding shell is exempt and deliberately untested:
 * `config.geoip` is Object.frozen, so a shell test could only assert its own
 * mock (see the file header of src/core/geoip/ensure.ts).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { decideGeoipAction } from '../../src/core/geoip/ensure.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 8, 12, 0, 0);

/** Defaults for a present, fresh, enabled, auto-updating install. */
function input(overrides: Partial<Parameters<typeof decideGeoipAction>[0]> = {}) {
	return {
		enabled: true,
		autoUpdate: true,
		present: true,
		mtimeMs: NOW - 1 * DAY,
		now: NOW,
		...overrides,
	};
}

describe('decideGeoipAction', () => {
	test('disabled: neither download nor load', () => {
		const action = decideGeoipAction(input({ enabled: false }));
		expect(action.download).toBe(false);
		expect(action.load).toBe(false);
		expect(action.reason).toBe('disabled');
	});

	test('disabled wins even when the cache is absent', () => {
		expect(decideGeoipAction(input({ enabled: false, present: false })).reason).toBe('disabled');
	});

	test('29 days old is fresh', () => {
		const action = decideGeoipAction(input({ mtimeMs: NOW - 29 * DAY }));
		expect(action.stale).toBe(false);
		expect(action.download).toBe(false);
		expect(action.reason).toBe('fresh');
		expect(action.load).toBe(true);
	});

	test('31 days old is stale and triggers a download', () => {
		const action = decideGeoipAction(input({ mtimeMs: NOW - 31 * DAY }));
		expect(action.stale).toBe(true);
		expect(action.download).toBe(true);
		expect(action.reason).toBe('stale');
	});

	test('exactly 30 days is NOT stale — the comparison is strict >', () => {
		const action = decideGeoipAction(input({ mtimeMs: NOW - 30 * DAY }));
		expect(action.stale).toBe(false);
		expect(action.download).toBe(false);
		expect(action.reason).toBe('fresh');
	});

	test('an unstattable cached file (mtimeMs null) counts as stale', () => {
		const action = decideGeoipAction(input({ mtimeMs: null }));
		expect(action.stale).toBe(true);
		expect(action.download).toBe(true);
		expect(action.reason).toBe('stale');
	});

	test('absent cache: download, reason absent (never "stale")', () => {
		const action = decideGeoipAction(input({ present: false, mtimeMs: null }));
		expect(action.download).toBe(true);
		expect(action.reason).toBe('absent');
		expect(action.stale).toBe(false);
		expect(action.load).toBe(true);
	});

	test('autoUpdate off never downloads but still loads — even when stale', () => {
		const stale = decideGeoipAction(input({ autoUpdate: false, mtimeMs: NOW - 400 * DAY }));
		expect(stale.download).toBe(false);
		expect(stale.load).toBe(true);
		expect(stale.stale).toBe(true);

		const absent = decideGeoipAction(input({ autoUpdate: false, present: false, mtimeMs: null }));
		expect(absent.download).toBe(false);
		expect(absent.load).toBe(true);
		expect(absent.reason).toBe('absent');
	});

	test('the refresh window is injectable', () => {
		const action = decideGeoipAction(input({ mtimeMs: NOW - 2 * DAY, refreshAfterMs: DAY }));
		expect(action.stale).toBe(true);
	});
});

describe('rewire proof — the inline policy is gone from ensure.ts', () => {
	const source = readFileSync(
		new URL('../../src/core/geoip/ensure.ts', import.meta.url).pathname,
		'utf8',
	);

	test('ensureGeoipDb delegates instead of recomputing staleness inline', () => {
		expect(source).not.toContain('statSync(dbPath).mtimeMs > REFRESH_AFTER_MS');
		expect(source).not.toContain('config.geoip.autoUpdate && (!present || stale)');
		expect(source).not.toContain('if (!config.geoip.enabled)');
		expect(source).toContain('const action = decideGeoipAction({');
		expect(source).toContain('if (action.download) {');
		expect(source).toContain('if (!action.load) {');
	});
});
