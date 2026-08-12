/**
 * Shared restore primitives for the two time-machine WRITE doors
 * (`apply_value` and `bulk_revert_process`).
 *
 * Both doors deliberately bypass `saveComponentData` — only the direct path
 * (persistRecordKeys + recordTimeMachine) can thread a bulk id and replay a
 * snapshot without the save pipeline's defaults firing. The cost of that
 * bypass is that every side effect the chokepoint performs has to be
 * reproduced here explicitly, or it silently disappears from the restore path.
 * The observer cascade was one such casualty: PHP restored through
 * `component_common::save()`, whose last act is `propagate_to_observers()`
 * (class.component_common.php:2147), so a PHP TM restore recomputed every
 * observer mirror and wrote its TM audit row. This port did not, so restoring
 * an observed component left the mirrors pointing at the pre-restore value
 * with nothing in the audit trail to show for it (audit 2026-08, P2).
 */

import { DATAFRAME_RELATION_TYPE } from '../../../src/core/concepts/subdatum.ts';
import type { MatrixJsonbColumn } from '../../../src/core/db/matrix.ts';
import { readMatrixRecord } from '../../../src/core/db/matrix.ts';

/** The stored items of one component key (`[]` when the record or key is absent). */
export async function readComponentItems(
	table: string,
	sectionTipo: string,
	sectionId: number,
	column: string,
	componentTipo: string,
): Promise<unknown[]> {
	const record = await readMatrixRecord(table, sectionTipo, sectionId);
	const bag = record?.columns[column as MatrixJsonbColumn];
	if (bag === null || bag === undefined || typeof bag !== 'object') return [];
	const value = (bag as Record<string, unknown>)[componentTipo];
	if (value === null || value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

/**
 * Locators present BEFORE a write and absent after it, identified by the RECORD
 * they point at (section_tipo + section_id) — dataframe frames excluded, they
 * are not observable targets.
 *
 * Byte-for-byte the rule `saveComponentData` applies when it fills
 * `result.removedItems` (save_component.ts :1150-1172); the two MUST agree, or
 * the same edit propagates differently depending on which door made it. It is
 * re-expressed rather than imported because that helper is a closure inside the
 * save body; extracting it into a shared export is handed off (that file is
 * owned elsewhere).
 *
 * The "MUST agree" is not a comment on trust: it is GATED behaviourally by
 * `test/unit/tm_dataframe_restore_native.test.ts` › "removedLocators agrees
 * with saveComponentData.removedItems", which runs a real save that drops a
 * locator and requires the save door's own `removedItems` to equal what this
 * function computes from the same before/after. Change the rule in one place
 * and that test goes red. Retire the test with the extraction, not before.
 */
export function removedLocators(before: readonly unknown[], after: unknown): unknown[] {
	if (before.length === 0) return [];
	const key = (entry: unknown): string | null => {
		if (entry === null || typeof entry !== 'object') return null;
		const locator = entry as { section_tipo?: unknown; section_id?: unknown; type?: unknown };
		if (typeof locator.section_tipo !== 'string' || locator.section_id === undefined) return null;
		if (locator.type === DATAFRAME_RELATION_TYPE) return null;
		return `${locator.section_tipo}|${String(locator.section_id)}`;
	};
	const afterKeys = new Set<string>();
	for (const entry of Array.isArray(after) ? after : []) {
		const entryKey = key(entry);
		if (entryKey !== null) afterKeys.add(entryKey);
	}
	const removed: unknown[] = [];
	const seen = new Set<string>();
	for (const entry of before) {
		const entryKey = key(entry);
		if (entryKey === null || afterKeys.has(entryKey) || seen.has(entryKey)) continue;
		seen.add(entryKey);
		removed.push(entry);
	}
	return removed;
}

/**
 * Fire the observer cascade for a restored component. MUST be called
 * POST-COMMIT: a cascade hop refuses to run inside an ambient transaction
 * (B6 — hops read committed state and open their own).
 *
 * A no-op for the vast majority of components (the subscription lookup is the
 * first thing inside). Never throws outside an ambient transaction; a failure
 * is logged and counted by the propagation itself.
 */
export async function propagateRestoreToObservers(
	componentTipo: string,
	sectionTipo: string,
	sectionId: number,
	before: readonly unknown[],
	after: unknown,
	userId: number,
): Promise<void> {
	const { propagateToObservers } = await import('../../../src/core/section/record/observers.ts');
	await propagateToObservers(
		componentTipo,
		sectionTipo,
		sectionId,
		{
			saved: Array.isArray(after) ? after : [],
			removed: removedLocators(before, after),
		},
		userId,
	);
}
