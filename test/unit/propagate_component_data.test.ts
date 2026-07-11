/**
 * R3 gate (pure core): the propagate_component_data replace/delete/add mutation
 * logic. Scalar components match by deep value; relation components match by
 * locator identity (section_tipo+section_id). The `changed` flag must be false on
 * no-ops so the caller skips the save (PHP `$save=false`).
 */

import { describe, expect, test } from 'bun:test';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { applyPropagation } from '../../tools/tool_propagate_component_data/server/propagate.ts';
import { mustGet } from '../helpers/assert.ts';

describe('applyPropagation — replace', () => {
	test('replaces the whole slice; unchanged input → not changed', () => {
		expect(applyPropagation(['a'], 'replace', ['b'], false)).toEqual({
			final: ['b'],
			changed: true,
		});
		expect(applyPropagation(['a'], 'replace', ['a'], false)).toEqual({
			final: ['a'],
			changed: false,
		});
	});
	test('null value clears the slice', () => {
		expect(applyPropagation(['a'], 'replace', null, false)).toEqual({ final: [], changed: true });
		expect(applyPropagation([], 'replace', null, false)).toEqual({ final: [], changed: false });
	});
});

describe('applyPropagation — delete', () => {
	test('scalar: removes matching values, keeps the rest', () => {
		expect(applyPropagation(['a', 'b', 'c'], 'delete', ['b'], false)).toEqual({
			final: ['a', 'c'],
			changed: true,
		});
	});
	test('no match → not changed', () => {
		expect(applyPropagation(['a'], 'delete', ['z'], false)).toEqual({
			final: ['a'],
			changed: false,
		});
	});
	test('relations: matches by locator identity (section_tipo+section_id), ignores extra fields', () => {
		const current = [
			{ section_tipo: 'rsc197', section_id: 5, from_component_tipo: 'x' },
			{ section_tipo: 'rsc197', section_id: 9 },
		];
		const out = applyPropagation(
			current,
			'delete',
			[{ section_tipo: 'rsc197', section_id: 5 }],
			true,
		);
		expect(out.changed).toBe(true);
		expect(out.final).toEqual([{ section_tipo: 'rsc197', section_id: 9 }]);
	});
	test('relations: string/number section_id are treated equal', () => {
		const out = applyPropagation(
			[{ section_tipo: 'rsc197', section_id: '5' }],
			'delete',
			[{ section_tipo: 'rsc197', section_id: 5 }],
			true,
		);
		expect(out.final).toEqual([]);
	});
});

describe('applyPropagation — add', () => {
	test('scalar: appends only new values (dedup)', () => {
		expect(applyPropagation(['a'], 'add', ['a', 'b'], false)).toEqual({
			final: ['a', 'b'],
			changed: true,
		});
		expect(applyPropagation(['a', 'b'], 'add', ['a'], false)).toEqual({
			final: ['a', 'b'],
			changed: false,
		});
	});
	test('relations: dedup by locator identity', () => {
		const current = [{ section_tipo: 'rsc197', section_id: 5 }];
		const out = applyPropagation(
			current,
			'add',
			[{ section_tipo: 'rsc197', section_id: 5, extra: 1 }],
			true,
		);
		expect(out.changed).toBe(false);
	});
});

describe('tool_propagate_component_data module', () => {
	test('loads with the backgroundRunnable action (permission: null → imperative gate)', async () => {
		const loaded = await getLoadedTool('tool_propagate_component_data');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions)).toEqual(['propagate_component_data']);
		expect(
			mustGet(actions.propagate_component_data, 'propagate_component_data').permission,
		).toBeNull();
		expect(loaded!.module.backgroundRunnable).toEqual(['propagate_component_data']);
	});
});
