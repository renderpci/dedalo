/**
 * R5 gate (pure core + module): tool_time_machine.bulk_revert_process.
 * preBulkState picks the correct pre-batch snapshot from a component's TM history
 * (id DESC): the row immediately older than the batch row, or empty when the
 * batch row was the component's first-ever change. The module registers both
 * actions. Full DB revert drive is ledgered (needs a seeded bulk batch).
 */

import { describe, expect, test } from 'bun:test';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { preBulkState } from '../../tools/tool_time_machine/server/bulk_revert.ts';
import { mustGet } from '../helpers/assert.ts';

describe('preBulkState', () => {
	test('returns the row immediately older than the batch row', () => {
		// id DESC: newest first. Batch row (bulk 77) has an older row before it.
		const history = [
			{ bulk_process_id: 88, data: ['newest'] },
			{ bulk_process_id: 77, data: ['the batch change'] },
			{ bulk_process_id: null, data: ['pre-batch value'] },
		];
		expect(preBulkState(history, 77)).toEqual({ data: ['pre-batch value'], found: true });
	});

	test('batch row is the oldest/only row → pre-batch state is empty', () => {
		expect(preBulkState([{ bulk_process_id: 77, data: ['first ever'] }], 77)).toEqual({
			data: [],
			found: true,
		});
	});

	test('bulk id not in history → not found (empty)', () => {
		const history = [{ bulk_process_id: 88, data: ['x'] }];
		expect(preBulkState(history, 77)).toEqual({ data: [], found: false });
	});

	test('matches on numeric-coerced bulk id (string/number)', () => {
		const history = [
			{ bulk_process_id: 77 as unknown as number, data: ['batch'] },
			{ bulk_process_id: 5, data: ['older'] },
		];
		expect(preBulkState(history, 77).data).toEqual(['older']);
	});
});

describe('tool_time_machine module', () => {
	test('registers apply_value + bulk_revert_process with the right gates', async () => {
		const loaded = await getLoadedTool('tool_time_machine');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual(['apply_value', 'bulk_revert_process']);
		const bulkRevert = mustGet(actions.bulk_revert_process, 'bulk_revert_process');
		expect(bulkRevert.permission).toBe('section');
		expect(bulkRevert.minLevel).toBe(2);
	});
});
