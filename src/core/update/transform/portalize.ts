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
 */

import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn } from '../../db/matrix.ts';
import { updateMatrixKeysData } from '../../db/matrix_write.ts';
import { sql } from '../../db/postgres.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';
import { createSectionRecord } from '../../section/record/create_record.ts';
import type { PortalizeItem } from './definitions.ts';
import type { TransformRecorder } from './report.ts';

const TIPO_RE = /^[a-z]+[0-9]+$/;
const RELATION_LIKE: ReadonlySet<string> = new Set(['relation', 'relation_search']);

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

async function portalizeOne(item: PortalizeItem, recorder: TransformRecorder): Promise<void> {
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
		const moves: {
			column: MatrixJsonbColumn;
			sourceTipo: string;
			targetTipo: string;
			value: unknown;
		}[] = [];
		for (const component of components) {
			for (const column of MATRIX_JSONB_COLUMNS) {
				const text = row[column];
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
		if (moves.length === 0) continue;

		if (recorder.dryRun) {
			recorder.record({
				op: 'insert',
				table: targetTable,
				target: `${item.target_section}/(new)`,
				detail: `${moves.length} flat component(s) from ${item.source_section}/${sourceId}`,
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
				detail: `${moves.length} source component(s)`,
			});
			recorder.record({
				op: 'update',
				table: 'matrix_time_machine',
				target: `${item.source_section}/${sourceId}`,
				detail: 'relocate history to new record',
			});
			continue;
		}

		// 1. create the new target record and write the flat data into it.
		const newId = await createSectionRecord(item.target_section, -1);
		await updateMatrixKeysData(
			targetTable,
			item.target_section,
			newId,
			moves.map((m) => ({ column: m.column, key: m.targetTipo, value: m.value })),
		);
		recorder.record({
			op: 'insert',
			table: targetTable,
			target: `${item.target_section}/${newId}`,
			detail: `${moves.length} flat component(s)`,
		});

		// 2. portal locator on the SOURCE record (relation column, portal key).
		const portalLocator = {
			section_id: newId,
			section_tipo: item.target_section,
			from_component_tipo: item.portal,
			type: 'dd151',
		};
		await updateMatrixKeysData(sourceTable, item.source_section, sourceId, [
			{ column: 'relation', key: item.portal, value: [portalLocator] },
		]);
		recorder.record({
			op: 'link_portal',
			table: sourceTable,
			target: `${item.source_section}/${sourceId}`,
			detail: `portal ${item.portal} → ${item.target_section}/${newId}`,
		});

		// 3. null the moved source components.
		await updateMatrixKeysData(
			sourceTable,
			item.source_section,
			sourceId,
			moves.map((m) => ({ column: m.column, key: m.sourceTipo, value: null })),
		);
		recorder.record({
			op: 'null_component',
			table: sourceTable,
			target: `${item.source_section}/${sourceId}`,
			detail: `${moves.length} source component(s)`,
		});

		// 4. relocate TM history to the new coordinates (save_tm suppressed —
		//    a direct UPDATE, no new snapshot). Per mapped component tipo.
		for (const component of components) {
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
}
