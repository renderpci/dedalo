/**
 * portalize_data (move_to_portal) executor — THE flat-data + link-back pattern
 * (UPDATE_PROCESS Phase 5, the pattern the user named): copy a source record's
 * component data into a NEW target-section record, leave a component_portal
 * locator on the SOURCE pointing at the new record, null the moved source
 * components, and relocate the Time Machine history to the new coordinates.
 *
 * SCHEMA NOTE (WC-025 functional port): PHP builds main_components_obj via
 * section->Save; the TS write path has no one-shot Save, and the data lives in
 * split typed columns keyed by tipo. This port operates at the matrix-column
 * level: for each mapped component it finds the column carrying the source
 * tipo's value, copies it under the target tipo into the new record (rewriting
 * from_component_tipo on relation locators), then nulls the source key. TM is
 * relocated with save_tm suppressed (a direct UPDATE, no new snapshot).
 *
 * D6 (fixed 2026-08-09, WC-2026-08-09-portalize-portal-merge): the portal write
 * is a READ-THEN-MERGE (pre-existing portal content survives; an already-present
 * locator writes nothing, so a re-run is idempotent), two moves claiming one
 * (column, target_tipo) resolve FIRST-WINS with the loser left intact on the
 * source, one corrupt jsonb column skips its row instead of aborting the run,
 * and the five write steps of a row run in ONE transaction.
 */

import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn } from '../../db/matrix.ts';
import { updateMatrixKeysData } from '../../db/matrix_write.ts';
import { sql, withTransaction } from '../../db/postgres.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';
import { createSectionRecord } from '../../section/record/create_record.ts';
import type { PortalizeItem } from './definitions.ts';
import {
	collectPortalizeMoves,
	decodeColumnText,
	type PortalizeMove,
	type PortalizeWritePlan,
	planPortalizeWrites,
	planPortalWrite,
	planTmRelocations,
	portalValueRefusal,
} from './portalize_plan.ts';
import type { TransformRecorder } from './report.ts';

const TIPO_RE = /^[a-z]+[0-9]+$/;

export async function executePortalize(
	rawItems: unknown,
	recorder: TransformRecorder,
): Promise<void> {
	const items = Array.isArray(rawItems) ? (rawItems as PortalizeItem[]) : [];
	for (const item of items) {
		if (
			!TIPO_RE.test(item.source_section ?? '') ||
			!TIPO_RE.test(item.target_section ?? '') ||
			!TIPO_RE.test(item.portal ?? '')
		) {
			recorder.error(`portalize: invalid section/portal tipos in ${item.info ?? 'item'}`);
			continue;
		}
		await portalizeOne(item, recorder);
	}
}

/** Exported for test/unit/portalize_plan_native.test.ts (the dry-run gate). */
export async function portalizeOne(
	item: PortalizeItem,
	recorder: TransformRecorder,
): Promise<void> {
	const sourceTable = await getMatrixTableFromTipo(item.source_section);
	const targetTable = await getMatrixTableFromTipo(item.target_section);
	if (sourceTable === null || targetTable === null) {
		recorder.error(`portalize: no matrix table for ${item.source_section}/${item.target_section}`);
		return;
	}
	const components = item.components.filter(
		(c) => TIPO_RE.test(c.source_tipo ?? '') && TIPO_RE.test(c.target_tipo ?? ''),
	);
	const columnList = MATRIX_JSONB_COLUMNS.map((column) => `"${column}"::text AS ${column}`).join(
		',',
	);

	const sourceRows = (await sql.unsafe(
		`SELECT section_id, ${columnList} FROM "${sourceTable}" WHERE section_tipo = $1 ORDER BY section_id ASC`,
		[item.source_section],
	)) as (Record<string, string | null> & { section_id: number })[];

	for (const row of sourceRows) {
		const sourceId = row.section_id;
		// Gather the per-component values to move: {column, sourceKey, targetKey, value}.
		// The selection law (including the `=== undefined` presence test) lives in
		// portalize_plan.ts — gated by test/unit/portalize_plan_native.test.ts.
		// (the cast only drops `section_id: number` from the row's shape — the
		// plan layer reads MATRIX_JSONB_COLUMNS keys only.)
		// D6 (2026-08-09): ONE corrupt jsonb column used to abort the whole
		// transform mid-run, after earlier rows were already half-written. The
		// parse is now per-row fatal only: the row is reported and skipped.
		let moves: PortalizeMove[];
		let existingPortalValue: unknown;
		try {
			moves = collectPortalizeMoves(
				row as Readonly<Partial<Record<MatrixJsonbColumn, string | null>>>,
				components,
			);
			existingPortalValue = decodeColumnText(row.relation)[item.portal];
		} catch (error) {
			recorder.error(
				`portalize: unreadable jsonb on ${item.source_section}/${sourceId} — row skipped (${
					error instanceof Error ? error.message : String(error)
				})`,
			);
			continue;
		}
		if (moves.length === 0) continue;

		// D6: dedupe the moves by (column, target_tipo) — first in plan order
		// wins, the loser is neither written nor nulled (see planPortalizeWrites).
		const plan = planPortalizeWrites(moves);
		for (const collision of plan.collisions) {
			recorder.error(
				`portalize: ${item.source_section}/${sourceId} maps ${collision.droppedSourceTipo} and ` +
					`${collision.keptSourceTipo} onto the same ${collision.column}.${collision.targetTipo} — ` +
					`kept ${collision.keptSourceTipo}, left ${collision.droppedSourceTipo} on the source record`,
			);
		}
		// D6: a portal key holding a non-array payload is refused BEFORE anything
		// is created, so the row is left exactly as it was.
		const refusal = portalValueRefusal(existingPortalValue);
		if (refusal !== null) {
			recorder.error(
				`portalize: ${item.source_section}/${sourceId} ${item.portal}: ${refusal} — row skipped`,
			);
			continue;
		}
		const moveCount = plan.targetWrites.length;

		if (recorder.dryRun) {
			recorder.record({
				op: 'insert',
				table: targetTable,
				target: `${item.target_section}/(new)`,
				detail: `${moveCount} flat component(s) from ${item.source_section}/${sourceId}`,
			});
			recorder.record({
				op: 'link_portal',
				table: sourceTable,
				target: `${item.source_section}/${sourceId}`,
				detail: `portal ${item.portal} → new ${item.target_section}`,
			});
			recorder.record({
				op: 'null_component',
				table: sourceTable,
				target: `${item.source_section}/${sourceId}`,
				detail: `${plan.sourceNulls.length} source component(s)`,
			});
			recorder.record({
				op: 'update',
				table: 'matrix_time_machine',
				target: `${item.source_section}/${sourceId}`,
				detail: 'relocate history to new record',
			});
			continue;
		}

		// D6 (2026-08-09): the five steps run in ONE transaction, so a failure
		// mid-row can no longer leave the data duplicated into the new record
		// with the source not yet nulled. A failed row rolls back alone; the
		// loop continues with the next row.
		await withTransaction(() =>
			applyPortalizeRow({
				item,
				sourceTable,
				targetTable,
				sourceId,
				plan,
				components,
				existingPortalValue,
				recorder,
			}),
		);
	}
}

/** The five write steps for ONE source row — transaction-wrapped by the caller. */
async function applyPortalizeRow(context: {
	item: PortalizeItem;
	sourceTable: string;
	targetTable: string;
	sourceId: number;
	plan: PortalizeWritePlan;
	components: readonly { source_tipo: string; target_tipo: string }[];
	existingPortalValue: unknown;
	recorder: TransformRecorder;
}): Promise<void> {
	const { item, sourceTable, targetTable, sourceId, plan, recorder } = context;
	// 1. create the new target record and write the flat data into it.
	const newId = await createSectionRecord(item.target_section, -1);
	await updateMatrixKeysData(targetTable, item.target_section, newId, plan.targetWrites);
	recorder.record({
		op: 'insert',
		table: targetTable,
		target: `${item.target_section}/${newId}`,
		detail: `${plan.targetWrites.length} flat component(s)`,
	});

	// 2. portal locator on the SOURCE record (relation column, portal key).
	//    D6 (2026-08-09): READ-THEN-MERGE, never a blind replace — pre-existing
	//    portal content survives, and an already-present locator writes nothing
	//    (idempotent re-run). The law is planPortalWrite in portalize_plan.ts.
	const portalLocator = {
		section_id: newId,
		section_tipo: item.target_section,
		from_component_tipo: item.portal,
		type: 'dd151',
	};
	const portalPlan = planPortalWrite(context.existingPortalValue, portalLocator);
	if (portalPlan.action === 'write') {
		await updateMatrixKeysData(sourceTable, item.source_section, sourceId, [
			{ column: 'relation', key: item.portal, value: portalPlan.value },
		]);
	}
	recorder.record({
		op: 'link_portal',
		table: sourceTable,
		target: `${item.source_section}/${sourceId}`,
		detail:
			portalPlan.action === 'write'
				? `portal ${item.portal} → ${item.target_section}/${newId} (${portalPlan.value.length} locator(s))`
				: `portal ${item.portal} unchanged — ${portalPlan.reason}`,
	});

	// 3. null the moved source components (only the keys whose value actually
	//    landed on the target — a collision loser keeps its data, see the plan).
	await updateMatrixKeysData(sourceTable, item.source_section, sourceId, plan.sourceNulls);
	recorder.record({
		op: 'null_component',
		table: sourceTable,
		target: `${item.source_section}/${sourceId}`,
		detail: `${plan.sourceNulls.length} source component(s)`,
	});

	// 4. relocate TM history to the new coordinates (save_tm suppressed —
	//    a direct UPDATE, no new snapshot). Per mapped component tipo.
	for (const component of planTmRelocations(context.components, plan)) {
		await sql.unsafe(
			`UPDATE matrix_time_machine SET tipo = $1, section_id = $2, section_tipo = $3
			 WHERE section_id = $4 AND section_tipo = $5 AND tipo = $6`,
			[
				component.target_tipo,
				newId,
				item.target_section,
				sourceId,
				item.source_section,
				component.source_tipo,
			],
		);
	}
	recorder.record({
		op: 'update',
		table: 'matrix_time_machine',
		target: `${item.source_section}/${sourceId}`,
		detail: `relocated to ${item.target_section}/${newId}`,
	});
	// The source record is KEPT — only its moved components are nulled and it
	// now carries the portal link back to the new record (PHP parity).
}
