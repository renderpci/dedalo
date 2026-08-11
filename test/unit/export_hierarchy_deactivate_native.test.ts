/**
 * `shouldDeactivate` — the per-row decision extracted out of
 * `exportHierarchySyncActiveStatus` (plan §4.1.7).
 *
 * The sync action walks every ACTIVE hierarchy registry row and deactivates
 * the ones the thesaurus no longer marks active. Two skips carry the risk:
 *   - `target === 'rsc197'` exempts the 'People' hierarchy. Drop it and
 *     pressing the button deactivates People on EVERY install.
 *   - `active_ts === '1'` skips rows already in sync. Drop it and each press
 *     writes a needless component save plus a time-machine row per hierarchy.
 *
 * The loop itself and `saveComponentData` are never driven from here: the
 * action writes real hierarchy registry records through the standard save
 * path. The decision is what has arms; the loop has none.
 */

import { describe, expect, test } from 'bun:test';
import { shouldDeactivate } from '../../src/core/area_maintenance/widgets/export_hierarchy.ts';

const SOURCE_FILE = `${import.meta.dir}/../../src/core/area_maintenance/widgets/export_hierarchy.ts`;

describe('shouldDeactivate — the four-cell truth table', () => {
	test('out of sync and not People: DEACTIVATE (the only writing cell)', () => {
		expect(shouldDeactivate({ active_ts: '2', target: 'rsc170' })).toBe(true);
	});

	test('in sync and not People: skip (no write, no TM row)', () => {
		expect(shouldDeactivate({ active_ts: '1', target: 'rsc170' })).toBe(false);
	});

	test('out of sync but People: EXEMPT — the load-bearing cell', () => {
		// Without the rsc197 arm this returns true and the action deactivates
		// the People thesaurus on every install that presses the button.
		expect(shouldDeactivate({ active_ts: '2', target: 'rsc197' })).toBe(false);
	});

	test('in sync and People: skip', () => {
		expect(shouldDeactivate({ active_ts: '1', target: 'rsc197' })).toBe(false);
	});
});

describe('shouldDeactivate — the coercion shapes the SQL really produces', () => {
	test('a NULL active flag is out of sync, not in sync', () => {
		// `->>` yields NULL when the component holds no value at all.
		expect(shouldDeactivate({ active_ts: null, target: 'rsc170' })).toBe(true);
	});

	test('the active comparison is against the STRING "1", never truthiness', () => {
		// `->>` renders text: a truthiness test would read '0' as false-y and
		// deactivate nothing, and would read '2' as in-sync-adjacent noise.
		expect(shouldDeactivate({ active_ts: '0', target: 'rsc170' })).toBe(true);
		expect(shouldDeactivate({ active_ts: '', target: 'rsc170' })).toBe(true);
	});

	test('the People exemption is EXACT, not a prefix', () => {
		// 'rsc1970'/'rsc19' must not inherit the exemption.
		expect(shouldDeactivate({ active_ts: '2', target: 'rsc1970' })).toBe(true);
		expect(shouldDeactivate({ active_ts: '2', target: 'rsc19' })).toBe(true);
	});

	test('a NULL target is not exempt', () => {
		expect(shouldDeactivate({ active_ts: '2', target: null })).toBe(true);
	});
});

describe('the extraction is REWIRED, not duplicated', () => {
	test('the sync loop calls the extraction and holds no inline copy', async () => {
		const source = await Bun.file(SOURCE_FILE).text();
		const loop = source.slice(source.indexOf('for (const row of rows)'));
		expect(loop).not.toBe('');
		expect(loop).toContain('if (!shouldDeactivate(row)) continue;');
		// The inline predicates are gone from the loop — an extraction that left
		// them would gate a copy while the shipped decision stayed unreachable.
		expect(loop).not.toContain("row.active_ts === '1'");
		expect(loop).not.toContain("row.target === 'rsc197'");
		// and each predicate survives EXACTLY ONCE in the file, inside the extraction
		expect(source.split("row.target === 'rsc197'").length - 1).toBe(1);
		expect(source.split("row.active_ts === '1'").length - 1).toBe(1);
	});
});
