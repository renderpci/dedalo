/**
 * THE ANTI-LOCKOUT GATE — the deny/allow and menu-skip classifiers extracted
 * out of `prepareAreaLists` (config_areas.ts) and `menuSkipTiposSave`
 * (menu_skip_tipos.ts) per plan §4.1.7.
 *
 * Why this one is load-bearing: `area_maintenance` is the ONLY UI that can
 * undo an area denial. If the guarded branch stops diverting it, an admin can
 * deny the maintenance area and the dashboard that would reverse the decision
 * is gone — recovery is hand-editing `ts_state.json` on the server. The root
 * arm is the menu twin: skipping a top-level area promotes ALL of its children
 * into the top menu bar.
 *
 * WHAT IS NOT DONE HERE, on purpose:
 *   - `configAreasSave` / `menuSkipTiposSave` are NEVER driven. They call
 *     `setServerState`, which writes `ts_state.json` — shared machine state,
 *     not a scratch surface. The classifiers are what they decide with.
 *   - The guarded/root lists are INJECTED, never queried. Asserting that
 *     `dd_ontology` really carries an `area_maintenance`-model row would pin
 *     installed content, which is the trap behind the 87 fixture-absent
 *     failures.
 *
 * No database, no writes, no scratch rows.
 */

import { describe, expect, test } from 'bun:test';
import {
	classifyAreaLists,
	configAreasMessage,
} from '../../src/core/area_maintenance/widgets/config_areas.ts';
import {
	classifyMenuSkipTipos,
	menuSkipTiposMessage,
} from '../../src/core/area_maintenance/widgets/menu_skip_tipos.ts';

const CONFIG_AREAS_SOURCE = `${import.meta.dir}/../../src/core/area_maintenance/widgets/config_areas.ts`;
const MENU_SKIP_SOURCE = `${import.meta.dir}/../../src/core/area_maintenance/widgets/menu_skip_tipos.ts`;

/** The three guarded models' tipos, as getGuardedAreaTipos would return them. */
const GUARDED = ['dd118', 'dd1108', 'dd8'];
/** Everything the tests offer is a real tipo unless it is literally 'nope'. */
const anyTipoValid = (tipo: string): boolean => tipo !== 'nope';

describe('classifyAreaLists — the deny arm refuses to lock the operator out', () => {
	test('a guarded tipo requested for DENY lands in removed_guarded and NOT in areas_deny', () => {
		// dd1108 stands in for the area_maintenance-model tipo: the dashboard.
		const out = classifyAreaLists(['dd1108'], [], GUARDED, anyTipoValid);
		expect(out.removed_guarded).toEqual(['dd1108']);
		// The whole point: it must not survive into the persisted deny list.
		expect(out.areas_deny).toEqual([]);
		expect(out.areas_deny).not.toContain('dd1108');
		expect(out.invalid).toEqual([]);
	});

	test('the refusal is selective: a normal area alongside it IS denied', () => {
		const out = classifyAreaLists(['dd1108', 'dd852'], [], GUARDED, anyTipoValid);
		expect(out.areas_deny).toEqual(['dd852']);
		expect(out.removed_guarded).toEqual(['dd1108']);
	});

	test('every guarded model is covered, not just the maintenance one', () => {
		const out = classifyAreaLists(GUARDED, [], GUARDED, anyTipoValid);
		expect(out.areas_deny).toEqual([]);
		expect(out.removed_guarded).toEqual(GUARDED);
	});
});

describe('classifyAreaLists — the allow arm is asymmetric ON PURPOSE', () => {
	test('the SAME guarded tipo survives on the allow list', () => {
		const out = classifyAreaLists([], ['dd1108'], GUARDED, anyTipoValid);
		// Allow-listing a guarded area is legitimate; a "cleanup" that unified
		// the two loops would drop it into removed_guarded here.
		expect(out.areas_allow).toEqual(['dd1108']);
		expect(out.removed_guarded).toEqual([]);
	});

	test('one call decides both lists independently', () => {
		const out = classifyAreaLists(['dd1108', 'dd852'], ['dd1108'], GUARDED, anyTipoValid);
		expect(out).toEqual({
			areas_deny: ['dd852'],
			areas_allow: ['dd1108'],
			invalid: [],
			removed_guarded: ['dd1108'],
		});
	});
});

describe('classifyAreaLists — validity and dedup', () => {
	test('an unknown tipo is invalid and reaches neither list', () => {
		const out = classifyAreaLists(['nope'], ['nope'], GUARDED, anyTipoValid);
		expect(out.invalid).toEqual(['nope', 'nope']); // once per list, as PHP reports
		expect(out.areas_deny).toEqual([]);
		expect(out.areas_allow).toEqual([]);
	});

	test('validity is checked BEFORE the guarded test', () => {
		// An invalid tipo that is also guarded is reported as invalid, not as a
		// refused denial — the order of the two branches, pinned.
		const out = classifyAreaLists(['nope'], [], ['nope'], anyTipoValid);
		expect(out.invalid).toEqual(['nope']);
		expect(out.removed_guarded).toEqual([]);
	});

	test('the client 12 and the client "12" are ONE tipo (String() before dedup)', () => {
		const out = classifyAreaLists([12, '12'], [], GUARDED, anyTipoValid);
		expect(out.areas_deny).toEqual(['12']);
		expect(out.areas_deny.length).toBe(1);
	});

	test('a numeric guarded tipo is still refused after coercion', () => {
		const out = classifyAreaLists([12], [], ['12'], anyTipoValid);
		expect(out.removed_guarded).toEqual(['12']);
		expect(out.areas_deny).toEqual([]);
	});

	test('empty in, empty out — every key is present as an array', () => {
		expect(classifyAreaLists([], [], GUARDED, anyTipoValid)).toEqual({
			areas_deny: [],
			areas_allow: [],
			invalid: [],
			removed_guarded: [],
		});
	});
});

describe('classifyMenuSkipTipos — a top-level area can never be skipped', () => {
	const ROOTS = ['dd118', 'dd8'];

	test('a root tipo lands in removed and NOT in the persisted skip list', () => {
		const out = classifyMenuSkipTipos(['dd118'], ROOTS, anyTipoValid);
		expect(out.removed).toEqual(['dd118']);
		expect(out.tipos).toEqual([]);
	});

	test('a non-root grouping tipo is skipped normally', () => {
		const out = classifyMenuSkipTipos(['dd118', 'dd852'], ROOTS, anyTipoValid);
		expect(out.tipos).toEqual(['dd852']);
		expect(out.removed).toEqual(['dd118']);
	});

	test('invalid outranks root', () => {
		const out = classifyMenuSkipTipos(['nope'], ['nope'], anyTipoValid);
		expect(out.invalid).toEqual(['nope']);
		expect(out.removed).toEqual([]);
	});

	test('12 and "12" dedup to one tipo', () => {
		const out = classifyMenuSkipTipos([12, '12'], ROOTS, anyTipoValid);
		expect(out.tipos).toEqual(['12']);
	});
});

describe('the operator feedback suffixes', () => {
	test('the refused-denial suffix appears ONLY when something was refused', () => {
		expect(configAreasMessage(['dd1108'], [])).toBe(
			'OK. Configuration saved. Changes apply on the next request. Protected areas cannot be denied and were kept enabled.',
		);
		expect(configAreasMessage([], [])).toBe(
			'OK. Configuration saved. Changes apply on the next request',
		);
	});

	test('both config_areas suffixes concatenate in order', () => {
		expect(configAreasMessage(['dd1108'], ['nope'])).toBe(
			'OK. Configuration saved. Changes apply on the next request. Protected areas cannot be denied and were kept enabled.. Invalid tipos were ignored.',
		);
	});

	test('the root-skip suffix is the exact string the client shows', () => {
		expect(menuSkipTiposMessage(['dd118'], [])).toBe(
			'OK. Configuration saved. Changes apply on the next request. Top-level areas cannot be skipped and were ignored.',
		);
		expect(menuSkipTiposMessage([], ['nope'])).toBe(
			'OK. Configuration saved. Changes apply on the next request. Invalid tipos were ignored.',
		);
		expect(menuSkipTiposMessage([], [])).toBe(
			'OK. Configuration saved. Changes apply on the next request',
		);
	});
});

describe('the extractions are REWIRED, not duplicated', () => {
	test('config_areas.ts holds no inline copy of the guarded/dedup decision', async () => {
		const source = await Bun.file(CONFIG_AREAS_SOURCE).text();
		// The call sites point at the extractions...
		expect(source).toContain('return classifyAreaLists(areasDeny, areasAllow, guarded,');
		expect(source).toContain('msg: configAreasMessage(prepared.removed_guarded, prepared.invalid)');
		// ...and each predicate survives EXACTLY ONCE, inside the extraction.
		expect(source.split('guarded.includes(raw)').length - 1).toBe(1);
		expect(source.split('out.removed_guarded.push(raw)').length - 1).toBe(1);
		expect(source.split('Protected areas cannot be denied').length - 1).toBe(1);
		// the async-per-tipo validity check no longer lives in the loop
		expect(source).not.toContain('if (!(await validTipo(raw)))');
	});

	test('menu_skip_tipos.ts holds no inline copy of the root decision', async () => {
		const source = await Bun.file(MENU_SKIP_SOURCE).text();
		expect(source).toContain('classifyMenuSkipTipos(raw, rootTipos,');
		expect(source).toContain('msg: menuSkipTiposMessage(removed, invalid)');
		expect(source.split('rootTipos.includes(tipo)').length - 1).toBe(1);
		expect(source.split('Top-level areas cannot be skipped').length - 1).toBe(1);
	});

	test('neither classifier can reach the state store or the database', async () => {
		// A pure classifier that imported setServerState/sql would be able to
		// write ts_state.json from a gate. Assert the extraction is pure by
		// construction: its module-level source between the two markers holds
		// neither symbol.
		const source = await Bun.file(CONFIG_AREAS_SOURCE).text();
		const start = source.indexOf('export function classifyAreaLists');
		const end = source.indexOf('export function configAreasMessage');
		const body = source.slice(start, end);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		expect(body).not.toContain('setServerState');
		expect(body).not.toContain('sql.unsafe');
		expect(body).not.toContain('await ');
	});
});
