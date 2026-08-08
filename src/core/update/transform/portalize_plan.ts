/**
 * portalize_data PLAN layer — the pure, DB-free half of `portalizeOne`
 * (UPDATE_PROCESS Phase 5, WC-025). Extracted verbatim from the inline loop
 * that used to live in `portalize.ts` so the move-selection law can be gated
 * without touching a matrix table.
 *
 * The law, in one sentence: for each mapped component, for each JSONB column of
 * the source row, if the decoded column object CARRIES the source tipo as a key
 * (`!== undefined` — NOT truthiness), that value moves under the target tipo.
 *
 * WHY `=== undefined` AND NOT TRUTHINESS: step 3 of `portalizeOne` nulls the
 * source key for every collected move. A truthy test would skip `[]`, `0`, `''`
 * and `null` values at collection time while the SOURCE key is still nulled →
 * silent, TM-suppressed data loss. Every falsy-but-present value MUST produce a
 * move.
 *
 * Relation-like columns (`relation`, `relation_search`) additionally repoint
 * `from_component_tipo` on every object element of an array value to the target
 * tipo; non-array payloads and null array elements pass through untouched.
 */

import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn } from '../../db/matrix.ts';

/** Columns whose array values carry relation locators with `from_component_tipo`. */
const RELATION_LIKE: ReadonlySet<string> = new Set(['relation', 'relation_search']);

/** One component value to copy into the new target record (and null on the source). */
export interface PortalizeMove {
	column: MatrixJsonbColumn;
	sourceTipo: string;
	targetTipo: string;
	value: unknown;
}

/**
 * Collect the moves for ONE source row.
 *
 * @param rowColumnsText the row's JSONB columns as raw `::text` (or null/absent).
 * @param components     already-validated {source_tipo, target_tipo} mappings.
 * @returns one move per (component × column-carrying-the-source-tipo), emitted
 *          in component order then `MATRIX_JSONB_COLUMNS` declaration order.
 *          A tipo present in two columns therefore yields TWO moves.
 * @throws  whatever `JSON.parse` throws on a malformed column payload (faithful
 *          to the pre-extraction behaviour — the executor does not guard it).
 */
export function collectPortalizeMoves(
	rowColumnsText: Readonly<Partial<Record<MatrixJsonbColumn, string | null>>>,
	components: readonly { source_tipo: string; target_tipo: string }[],
): PortalizeMove[] {
	const moves: PortalizeMove[] = [];
	for (const component of components) {
		for (const column of MATRIX_JSONB_COLUMNS) {
			const text = rowColumnsText[column];
			if (text === null || text === undefined) continue;
			const decoded = JSON.parse(text) as Record<string, unknown>;
			if (decoded[component.source_tipo] === undefined) continue;
			let value = decoded[component.source_tipo];
			// relation locators carry from_component_tipo — repoint to the target.
			if (RELATION_LIKE.has(column) && Array.isArray(value)) {
				value = value.map((loc) =>
					loc !== null && typeof loc === 'object'
						? { ...(loc as Record<string, unknown>), from_component_tipo: component.target_tipo }
						: loc,
				);
			}
			moves.push({
				column: column as MatrixJsonbColumn,
				sourceTipo: component.source_tipo,
				targetTipo: component.target_tipo,
				value,
			});
		}
	}
	return moves;
}
