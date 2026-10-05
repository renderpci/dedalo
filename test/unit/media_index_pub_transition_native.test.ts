/**
 * THE pub/ TRANSITION SEAM (PUBLICATION_HOST_SPEC §5.2, decision M3): the marker
 * store tells a registered sink when `pub/<key>` really FLIPS — once per flip,
 * never for a write that leaves the gate's decision unchanged — from every door
 * that writes pub/: applyTableState (all three marker writers) and the reconcile
 * apply. A sink is best-effort: its failure never fails the marker write.
 *
 * WRITES: a temp marker store only (the module's guarded seam). Advisory locks on
 * the lane database for the reconcile leg, released.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	applyTableState,
	hasPubMarker,
	overrideMediaIndexBaseForTests,
	reconcileMediaIndex,
} from '../../src/diffusion/targets/mediastore/media_index.ts';
import { registerPubTransitionSink } from '../../src/diffusion/targets/mediastore/pub_transitions.ts';

let base: string;
let events: [string, boolean][];
let unregister: () => void;

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'dedalo_pub_transition_'));
	overrideMediaIndexBaseForTests(base);
	events = [];
	unregister = registerPubTransitionSink((key, published) => {
		events.push([key, published]);
	});
});

afterEach(() => {
	unregister();
	overrideMediaIndexBaseForTests(null);
	rmSync(base, { recursive: true, force: true });
});

describe('pub/ transitions', () => {
	test('the first publication fires (key, true) once; a second table publishing it fires nothing', async () => {
		await applyTableState('web_db', 't1', 'test3', [1], []);
		expect(events).toHaveLength(1); // the sink really hears (positive control for the silent cases)
		expect(events).toEqual([['test3_1', true]]);
		await applyTableState('web_db', 't2', 'test3', [1], []);
		await applyTableState('web_db', 't1', 'test3', [1], []);
		expect(events).toEqual([['test3_1', true]]);
	});

	test('unpublish fires (key, false) only when the LAST table lets go', async () => {
		await applyTableState('web_db', 't1', 'test3', [2], []);
		await applyTableState('web_db', 't2', 'test3', [2], []);
		events = [];
		await applyTableState('web_db', 't1', 'test3', [], [2]);
		expect(events).toEqual([]);
		await applyTableState('web_db', 't2', 'test3', [], [2]);
		expect(events).toEqual([['test3_2', false]]);
		await applyTableState('web_db', 't2', 'test3', [], [2]);
		expect(events).toEqual([['test3_2', false]]);
	});

	test('scratch dedalo_ts_ tables never fire (they never touch pub/)', async () => {
		await applyTableState('web_db', 'dedalo_ts_scratch', 'test3', [3], []);
		expect(events).toEqual([]);
	});

	test('the reconcile apply fires for every marker it heals', async () => {
		mkdirSync(join(base, 'dbs', 'web_db', 't1'), { recursive: true });
		writeFileSync(join(base, 'dbs', 'web_db', 't1', 'test3_5'), '');
		mkdirSync(join(base, 'pub'), { recursive: true });
		writeFileSync(join(base, 'pub', 'test3_6'), '');
		const healed = await reconcileMediaIndex();
		expect(healed).toEqual({ added: 1, removed: 1 });
		expect([...events].sort()).toEqual([
			['test3_5', true],
			['test3_6', false],
		]);
	});

	test('a throwing sink never fails the marker write; the sinks after it still hear the flip', async () => {
		unregister();
		const logSpy = spyOn(console, 'error').mockImplementation(() => {});
		const off = registerPubTransitionSink(() => {
			throw new Error('sink broke (test)');
		});
		unregister = registerPubTransitionSink((key, published) => {
			events.push([key, published]);
		});
		try {
			const result = await applyTableState('web_db', 't1', 'test3', [7], []);
			expect(result.applied).toBe(1);
			expect(events).toEqual([['test3_7', true]]);
			expect(await hasPubMarker('test3_7')).toBe(true);
			expect(logSpy).toHaveBeenCalledTimes(1);
		} finally {
			off();
			logSpy.mockRestore();
		}
	});

	test('an unregistered sink hears nothing', async () => {
		unregister();
		await applyTableState('web_db', 't1', 'test3', [8], []);
		expect(events).toEqual([]);
	});

	test('hasPubMarker reads the gate decision and refuses a key outside the grammar', async () => {
		expect(await hasPubMarker('test3_9')).toBe(false);
		await applyTableState('web_db', 't1', 'test3', [9], []);
		expect(await hasPubMarker('test3_9')).toBe(true);
		await applyTableState('web_db', 't1', 'test3', [], [9]);
		expect(await hasPubMarker('test3_9')).toBe(false);
		writeFileSync(join(base, 'auth_x'), '');
		expect(await hasPubMarker('../auth_x')).toBe(false);
	});
});
