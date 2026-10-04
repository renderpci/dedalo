/**
 * Shared restore primitives for the two time-machine WRITE doors
 * (`apply_value` and `bulk_revert_process`).
 *
 * Both doors deliberately bypass `saveComponentData` — only the direct path
 * (the write chokepoint + a time-machine writer: recordTimeMachine for
 * apply_value, the undo-log pair `recordBulkPair` for the bulk revert) can
 * replay a stored image without the save pipeline's defaults firing.
 *
 * WHAT THE BYPASS NO LONGER COSTS (CLOSURE_PLAN Step 2, the obligation ledger):
 * the side effects PHP's `component_common::save()` performed — the observer
 * cascade (`propagate_to_observers`, class.component_common.php:2147) and the
 * `relation_search` index — used to be reproduced here, door by door, and the
 * doors that forgot them left mirrors stale (audit 2026-08, P2; CORE-1). They
 * are now obligations of the write chokepoint itself
 * (section_record/record_write.ts §3e): every restore write declares its
 * before/after to the ledger, and the index is derived in the same UPDATE. The
 * removed-set rule lives with the ledger (obligation_ledger.ts
 * removedLocators); this module keeps only the stored-items reader.
 */

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
