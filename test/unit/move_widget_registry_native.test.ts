/**
 * move_* widget registry CONSISTENCY (plan §4.1.8).
 *
 * OPERATOR-VISIBLE FAILURE THIS GATES: a sixth `move_*` migration widget is
 * added (registry line + spec) without its `executorFor` switch arm or its
 * `MOVE_WIDGET_BODIES` entry. Today that ships a dashboard button with an
 * EMPTY explanation whose real failure — `no transform executor for <id>` —
 * appears only when an operator fires a bulk record transform in production.
 * This gate makes the omission fail here instead.
 *
 * Catalog-driven on purpose: "move_tld maps to executeChangesInTipos" is a
 * restatement of the switch and gates nothing. The claim asserted is the
 * three-way agreement between the built widgets, the body catalog and the
 * executor switch — in BOTH directions.
 *
 * The module dynamic-imports the transform modules to resolve an executor;
 * module load is side-effect free. The returned executor is NEVER called.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	executorFor,
	MOVE_WIDGET_BODIES,
} from '../../src/core/area_maintenance/widgets/move_common.ts';
import { MAINTENANCE_WIDGET_IDS } from '../../src/core/area_maintenance/widgets/registry.ts';

const WIDGETS_DIR = join(import.meta.dir, '../../src/core/area_maintenance/widgets');

/** Every id actually built through buildMoveWidget(), read from the sources. */
function registeredMoveWidgetIds(): string[] {
	const ids: string[] = [];
	for (const name of readdirSync(WIDGETS_DIR)) {
		if (!name.endsWith('.ts')) continue;
		const source = readFileSync(join(WIDGETS_DIR, name), 'utf-8');
		for (const match of source.matchAll(/buildMoveWidget\(\s*'([^']+)'/g)) {
			ids.push(match[1] as string);
		}
	}
	return ids.sort();
}

const registered = registeredMoveWidgetIds();

describe('move_* widget registry consistency', () => {
	test('the source scan finds the move widgets (self-check of the scan itself)', () => {
		// Without this the whole suite passes vacuously if the scan breaks.
		expect(registered.length).toBeGreaterThanOrEqual(5);
		expect(registered).toContain('move_lang');
		expect(new Set(registered).size).toBe(registered.length); // no duplicate ids
	});

	test('every registered id is in the served maintenance catalog', () => {
		for (const id of registered) {
			expect(MAINTENANCE_WIDGET_IDS).toContain(id);
		}
	});

	test('registered ids and MOVE_WIDGET_BODIES keys are the SAME set (both directions)', () => {
		// → a new widget with no body ships an empty explanation panel;
		// ← an orphan body entry is a widget that was removed but not cleaned up.
		expect(Object.keys(MOVE_WIDGET_BODIES).sort()).toEqual(registered);
	});

	test("every registered id has a NON-EMPTY body (the `?? ''` fallback stays dead)", () => {
		for (const id of registered) {
			expect((MOVE_WIDGET_BODIES[id] ?? '').length).toBeGreaterThan(0);
		}
	});

	test('every registered id resolves an executor function', async () => {
		for (const id of registered) {
			const executor = await executorFor(id); // NEVER invoked
			expect(typeof executor).toBe('function');
		}
	});

	test('an unregistered id THROWS, naming the id', async () => {
		expect(executorFor('move_nonexistent')).rejects.toThrow(
			'no transform executor for move_nonexistent',
		);
	});
});
