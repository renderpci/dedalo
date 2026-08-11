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
 * Since D6 (2026-08-09) this module also owns the three WRITE laws the executor
 * used to inline: `planPortalizeWrites` (dedupe the moves by (column,
 * target_tipo), first-wins), `planPortalWrite` (read-then-merge of the source's
 * portal key — never a blind replace, idempotent on re-run) and
 * `planTmRelocations`.
 *
 * Relation-like columns (`relation`, `relation_search`) additionally repoint
 * `from_component_tipo` on every object element of an array value to the target
 * tipo; non-array payloads and null array elements pass through untouched.
 */

import type { Locator } from '../../concepts/locator.ts';
import { compareLocators } from '../../concepts/locator.ts';
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
 * @throws  whatever `JSON.parse` throws on a malformed column payload. The
 *          contract is unchanged, but since D6 (2026-08-09) the EXECUTOR
 *          catches it per row: one corrupt column skips its row instead of
 *          aborting the whole transform mid-write.
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

/** One `{column, key, value}` unit for `updateMatrixKeysData` (structural, no import cycle). */
export interface PortalizeKeyWrite {
	column: MatrixJsonbColumn;
	key: string;
	value: unknown;
}

/** A (column, target_tipo) claimed by two moves — the loser is reported, never written. */
export interface PortalizeCollision {
	column: MatrixJsonbColumn;
	targetTipo: string;
	keptSourceTipo: string;
	droppedSourceTipo: string;
}

/** The two write sets of one source row, plus the refused collisions. */
export interface PortalizeWritePlan {
	/** flat component values to write into the NEW target record. */
	targetWrites: PortalizeKeyWrite[];
	/** source keys to NULL — only those whose value actually landed on the target. */
	sourceNulls: PortalizeKeyWrite[];
	collisions: PortalizeCollision[];
}

/**
 * Turn the collected moves into the two write sets (D6, fixed 2026-08-09).
 *
 * THE COLLISION LAW. Two moves can claim the SAME (column, target_tipo) — two
 * source components mapped onto one target tipo. `updateMatrixKeysData` nests
 * same-column writes, so the LAST one used to win: the loser's value was
 * discarded on the target while its source key was still nulled (silent,
 * TM-suppressed loss), and which one lost depended on mapping order.
 *
 * The rule now: FIRST move in plan order WINS (plan order is total and
 * input-only — component order, then `MATRIX_JSONB_COLUMNS` declaration order —
 * so it never depends on row/DB iteration), the loser is NOT written AND its
 * source key is NOT nulled (its data stays where it is, recoverable), and the
 * collision is reported so the operator sees it.
 *
 * A single source tipo mapped to TWO target tipos is NOT a collision: both
 * moves are written and the shared source key is nulled once.
 */
export function planPortalizeWrites(moves: readonly PortalizeMove[]): PortalizeWritePlan {
	const targetWrites: PortalizeKeyWrite[] = [];
	const sourceNulls: PortalizeKeyWrite[] = [];
	const collisions: PortalizeCollision[] = [];
	const claimed = new Map<string, string>(); // "column targetTipo" -> winning sourceTipo
	const nulled = new Set<string>(); // "column sourceTipo"
	for (const move of moves) {
		const targetKey = `${move.column} ${move.targetTipo}`;
		const winner = claimed.get(targetKey);
		if (winner !== undefined) {
			collisions.push({
				column: move.column,
				targetTipo: move.targetTipo,
				keptSourceTipo: winner,
				droppedSourceTipo: move.sourceTipo,
			});
			continue;
		}
		claimed.set(targetKey, move.sourceTipo);
		targetWrites.push({ column: move.column, key: move.targetTipo, value: move.value });
		const nullKey = `${move.column} ${move.sourceTipo}`;
		if (!nulled.has(nullKey)) {
			nulled.add(nullKey);
			sourceNulls.push({ column: move.column, key: move.sourceTipo, value: null });
		}
	}
	return { targetWrites, sourceNulls, collisions };
}

/**
 * Which mapped components keep their Time Machine relocation (D6, 2026-08-09).
 * Every mapped component relocates, as before — EXCEPT a collision loser whose
 * value was refused everywhere: its data never left the source record, so its
 * history must not leave either.
 */
export function planTmRelocations<T extends { source_tipo: string; target_tipo: string }>(
	components: readonly T[],
	plan: PortalizeWritePlan,
): T[] {
	if (plan.collisions.length === 0) return [...components];
	const moved = new Set(plan.sourceNulls.map((write) => write.key));
	const dropped = new Set(plan.collisions.map((collision) => collision.droppedSourceTipo));
	return components.filter(
		(component) => !dropped.has(component.source_tipo) || moved.has(component.source_tipo),
	);
}

/**
 * Is this portal value UNUSABLE as a merge base? Returns the reason, or null
 * when the value can be merged into (absent, null, or an array). The executor
 * calls it BEFORE creating anything, so a refused row is left untouched.
 */
export function portalValueRefusal(existingPortalValue: unknown): string | null {
	if (existingPortalValue === undefined || existingPortalValue === null) return null;
	if (Array.isArray(existingPortalValue)) return null;
	return `portal key holds a non-array value (${typeof existingPortalValue}) — refusing to overwrite`;
}

/** What to do with the source record's portal key. */
export type PortalWritePlan =
	| { action: 'write'; value: Locator[] }
	| { action: 'skip'; reason: string }
	| { action: 'refuse'; reason: string };

/** The properties that identify a portal locator for the already-linked test. */
const PORTAL_IDENTITY = ['section_tipo', 'section_id', 'from_component_tipo'];

/**
 * Plan the source record's portal-key write (D6, fixed 2026-08-09).
 *
 * WAS: the executor wrote `[portalLocator]` UNCONDITIONALLY, so any
 * pre-existing content of that portal on the source record was destroyed on a
 * TM-suppressed write — unrecoverable.
 *
 * NOW, read-then-merge, in three cases:
 *  - key absent / SQL-null / JSON null  → write `[locator]` (unchanged for the
 *    single-move happy path, which is what a not-yet-portalized record is);
 *  - key holds an ARRAY → if a locator with the same
 *    (section_tipo, section_id, from_component_tipo) is ALREADY there, `skip`
 *    (this is what makes a re-run idempotent: no duplicate locator, no write at
 *    all); otherwise APPEND at the end, preserving existing content and order;
 *  - key holds anything else (scalar/object — a corrupt or non-portal payload)
 *    → `refuse`. Overwriting it would be exactly the D6 data loss, so the row
 *    is left alone and the operator is told.
 */
export function planPortalWrite(existingPortalValue: unknown, locator: Locator): PortalWritePlan {
	if (existingPortalValue === undefined || existingPortalValue === null) {
		return { action: 'write', value: [locator] };
	}
	const refusal = portalValueRefusal(existingPortalValue);
	if (refusal !== null) return { action: 'refuse', reason: refusal };
	const existing = existingPortalValue as unknown[];
	const alreadyLinked = existing.some(
		(element) =>
			element !== null &&
			typeof element === 'object' &&
			compareLocators(element as Locator, locator, PORTAL_IDENTITY),
	);
	if (alreadyLinked) {
		return { action: 'skip', reason: 'portal already carries this locator' };
	}
	return { action: 'write', value: [...(existing as Locator[]), locator] };
}

/**
 * Decode ONE jsonb column's `::text` payload into its tipo-keyed object.
 * Returns `{}` for a null/absent column. Throws on malformed JSON — the
 * executor catches per row (D6 companion fix, 2026-08-09).
 */
export function decodeColumnText(text: string | null | undefined): Record<string, unknown> {
	if (text === null || text === undefined) return {};
	return JSON.parse(text) as Record<string, unknown>;
}
