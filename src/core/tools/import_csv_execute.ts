/**
 * CSV import EXECUTOR — apply a plan (import_csv.ts) to the database.
 *
 * PHP does this row by row, component by component, each save its own
 * transaction, and asks the DB "does this record exist?" once per row. This
 * executor keeps the semantics and changes the shape:
 *
 *   - ONE existence query per FILE (`readExistingSectionIds`), not one per row;
 *   - ONE transaction per ROW (withTransaction JOINS an ambient transaction, so
 *     every saveComponentData inside a row shares it). A row is therefore
 *     ALL-OR-NOTHING: a crash mid-row cannot leave half a record written. For a
 *     30-column file that is 1 transaction per row instead of 30.
 *
 * Metadata columns (dd199/dd200/dd197/dd201) get PHP's dual write: the audit
 * component AND the record's own `data`-column metadata, with the modified stamp
 * suppressed so the imported values survive the save that carries them.
 */

import { AUDIT_TIPOS } from '../concepts/section.ts';
import { readExistingSectionIds, readMatrixRecord } from '../db/matrix.ts';
import { withTransaction } from '../db/postgres.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../ontology/resolver.ts';
import { readComponentItems } from '../resolve/component_data.ts';
import { createSectionRecord } from '../section/record/create_record.ts';
import { setRecordMetadata } from '../section/record/record_metadata.ts';
import { saveComponentData } from '../section/record/save_component.ts';
import type { PlannedColumn, PlannedRecord } from './import_csv.ts';
import { groupItemsByLang } from './import_data.ts';
import type { ImportFileReport, ImportProgressFrame, ImportRowIssue } from './import_wire.ts';

/** The dataframe relation type (PHP DEDALO_RELATION_TYPE_DATAFRAME). */
const RELATION_TYPE_DATAFRAME = 'dataframe';

export interface CsvExecuteRequest {
	plan: PlannedRecord[];
	sectionTipo: string;
	userId: number;
	/** The dd800 run every TM row is stamped with — the revert handle. */
	bulkProcessId: number;
	/** The import UI's "save time machine history" checkbox. */
	saveTm: boolean;
	/** File-level errors accumulated before the plan (unmapped columns, …). */
	errors: string[];
	/** Progress context: what the panel shows while this runs. */
	progress: {
		file: string;
		fileIndex: number;
		filesTotal: number;
		/** Component label by tipo (pre-resolved: a progress tick must not hit the ontology). */
		labels: ReadonlyMap<string, string>;
		publish: (frame: ImportProgressFrame) => void;
	};
}

/** How often a progress frame may be published. Each one rewrites the job's pfile. */
const PROGRESS_THROTTLE_MS = 200;

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A dd_date {year, month, day} → the 'YYYY-MM-DD HH:MM:SS' the `data` column stores. */
function ddDateToDbTimestamp(date: Record<string, unknown>): string | null {
	const year = Number(date.year);
	if (!Number.isFinite(year)) return null;
	const pad = (value: unknown, fallback: number): string =>
		String(Number.isFinite(Number(value)) ? Number(value) : fallback).padStart(2, '0');
	const yyyy = (year < 0 ? '-' : '') + String(Math.abs(year)).padStart(4, '0');
	return `${yyyy}-${pad(date.month, 1)}-${pad(date.day, 1)} ${pad(date.hour, 0)}:${pad(date.minute, 0)}:${pad(date.second, 0)}`;
}

/**
 * The `data`-column metadata this row's audit columns imply (PHP's
 * set_created_date / set_created_by_userID side of the metadata branches).
 */
function metadataPatchFor(column: PlannedColumn): {
	createdDate?: string;
	createdByUserId?: number;
} {
	const items = Array.isArray(column.conform.result) ? column.conform.result : [];
	const first = items[0];
	if (!isObject(first)) return {};

	if (column.tipo === AUDIT_TIPOS.createdDate && isObject(first.start)) {
		const stamp = ddDateToDbTimestamp(first.start);
		return stamp === null ? {} : { createdDate: stamp };
	}
	if (column.tipo === AUDIT_TIPOS.createdByUser && first.section_id !== undefined) {
		const userId = Number(first.section_id);
		return Number.isFinite(userId) ? { createdByUserId: userId } : {};
	}
	return {};
}

/**
 * Write the {dato, dataframe} envelope's FRAMES (PHP trait.dataframe_common::
 * import_dataframe_data). Frames are grouped by their slot (from_component_tipo);
 * within a slot, the frames of OTHER main components are preserved and only this
 * component's are replaced.
 */
async function writeDataframeFrames(
	frames: readonly unknown[],
	mainComponentTipo: string,
	sectionTipo: string,
	sectionId: number,
	userId: number,
	bulkProcessId: number,
	issues: ImportRowIssue[],
	row: number,
): Promise<void> {
	const bySlot = new Map<string, Record<string, unknown>[]>();
	for (const raw of frames) {
		if (!isObject(raw)) continue;
		const slot = raw.from_component_tipo;
		// `section_id_key` is the pre-v7 pairing key — still accepted on import.
		const idKey = raw.id_key ?? raw.section_id_key;
		if (typeof slot !== 'string' || slot === '' || idKey === undefined || idKey === null) {
			issues.push({
				section_id: sectionId,
				component_tipo: mainComponentTipo,
				msg: 'IGNORED: dataframe frame without a slot (from_component_tipo) or a pairing key (id_key)',
				data: raw,
				row,
			});
			continue;
		}
		// The legacy pairing keys are dropped: v7 pairs on id_key alone.
		const { section_id_key: _legacyId, section_tipo_key: _legacyTipo, ...rest } = raw;
		const frame: Record<string, unknown> = {
			...rest,
			type: RELATION_TYPE_DATAFRAME,
			id_key: Number(idKey),
			main_component_tipo: raw.main_component_tipo ?? mainComponentTipo,
		};
		const group = bySlot.get(slot);
		if (group === undefined) bySlot.set(slot, [frame]);
		else group.push(frame);
	}

	for (const [slot, group] of bySlot) {
		const model = await getModelByTipo(slot);
		if (model !== 'component_dataframe') {
			issues.push({
				section_id: sectionId,
				component_tipo: slot,
				msg: `IGNORED: dataframe frames target '${slot}', which is not a component_dataframe`,
				data: group,
				row,
			});
			continue;
		}
		// Keep the frames owned by OTHER main components; replace ours wholesale.
		const table = await getMatrixTableFromTipo(sectionTipo);
		const column = getColumnNameByModel(model);
		let kept: unknown[] = [];
		if (table !== null && column !== null) {
			const record = await readMatrixRecord(table, sectionTipo, sectionId);
			const existing = record === null ? [] : (readComponentItems(record, slot, model) ?? []);
			kept = existing.filter(
				(item) => !isObject(item) || item.main_component_tipo !== mainComponentTipo,
			);
		}
		await saveComponentData({
			componentTipo: slot,
			sectionTipo,
			sectionId,
			lang: 'lg-nolan',
			changedData: [{ action: 'set_data', id: null, value: [...kept, ...group] }],
			userId,
			bulkProcessId,
			// The frames are audited through their MAIN component's TM row, not twice.
			saveTm: false,
		});
	}
}

/**
 * Execute one file's plan. Record identity is the CSV's own section_id column: a
 * row without one is SKIPPED (never created under a fresh counter id), and an id
 * not yet in the DB is INSERTED with that id — preserving the source system's ids
 * and the relations that point at them.
 */
export async function executeCsvImport(request: CsvExecuteRequest): Promise<ImportFileReport> {
	const { plan, sectionTipo, userId, bulkProcessId, saveTm, progress } = request;
	const startedAt = performance.now();

	const created: number[] = [];
	const updated: number[] = [];
	const failed: ImportRowIssue[] = [];
	const warnings: ImportRowIssue[] = [];
	const errors: string[] = [...request.errors];

	// ONE existence query for the whole file (see the header).
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) throw new Error(`no matrix table for section '${sectionTipo}'`);
	const candidateIds = plan
		.map((record) => record.sectionId)
		.filter((id): id is number => id !== null && id > 0);
	const existing = await readExistingSectionIds(table, sectionTipo, candidateIds);

	let lastPublish = 0;
	const publish = (record: PlannedRecord, componentTipo: string | null, force: boolean): void => {
		const now = performance.now();
		if (!force && now - lastPublish < PROGRESS_THROTTLE_MS) return;
		lastPublish = now;
		progress.publish({
			phase: 'importing',
			file: progress.file,
			file_index: progress.fileIndex,
			files_total: progress.filesTotal,
			row: record.row - 1, // the header is row 1; row N of the data is N-1
			rows_total: plan.length,
			section_id: record.sectionId,
			component_label:
				componentTipo === null ? null : (progress.labels.get(componentTipo) ?? componentTipo),
			created: created.length,
			updated: updated.length,
			failed: failed.length,
			warnings: warnings.length,
		});
	};

	for (const record of plan) {
		const sectionId = record.sectionId;
		if (sectionId === null || sectionId <= 0) {
			errors.push(
				`Row ${record.row}: SKIPPED — the mandatory section_id is missing or not a number`,
			);
			continue;
		}

		// The modified stamp must be suppressed for the WHOLE row when the CSV
		// carries the modified metadata: dd197/dd201 may be written before the
		// row's other columns, and each of those saves would re-stamp the record
		// with "now, by the importer" — overwriting what we just imported.
		const carriesModifiedMetadata = record.columns.some(
			(column) =>
				(column.tipo === AUDIT_TIPOS.modifiedDate || column.tipo === AUDIT_TIPOS.modifiedByUser) &&
				column.conform.errors.length === 0,
		);

		const isNew = !existing.has(sectionId);
		try {
			// ONE transaction for the row: create + every component + its frames.
			await withTransaction(async () => {
				if (isNew) {
					// conflictTolerant: a concurrent writer may have taken the id; then the
					// insert is a no-op and we simply save the components onto it.
					await createSectionRecord(sectionTipo, userId, new Date(), sectionId, {
						conflictTolerant: true,
					});
				}

				const metadata: { createdDate?: string; createdByUserId?: number } = {};

				for (const column of record.columns) {
					if (column.conform.errors.length > 0) {
						for (const error of column.conform.errors) {
							failed.push({ ...error, row: record.row });
						}
						continue;
					}
					for (const warning of column.conform.warnings) {
						warnings.push({ ...warning, row: record.row });
					}
					Object.assign(metadata, metadataPatchFor(column));

					// A dataframe-ONLY envelope: the component's data is not touched, only
					// its frames (below). Distinct from an empty dato, which CLEARS.
					if (column.hasDato) {
						const groups = groupItemsByLang(column.conform.result, column.lang);
						if (groups.size === 0) {
							// An explicit CLEAR (empty cell).
							await saveComponentData({
								componentTipo: column.tipo,
								sectionTipo,
								sectionId,
								lang: column.lang,
								changedData: [{ action: 'set_data', id: null, value: [] }],
								userId,
								bulkProcessId,
								saveTm,
								skipModifiedStamp: carriesModifiedMetadata,
							});
						}
						for (const [lang, items] of groups) {
							await saveComponentData({
								componentTipo: column.tipo,
								sectionTipo,
								sectionId,
								lang,
								changedData: [{ action: 'set_data', id: null, value: items }],
								userId,
								bulkProcessId,
								saveTm,
								skipModifiedStamp: carriesModifiedMetadata,
							});
						}
					}

					if (column.dataframe !== null && column.dataframe.length > 0) {
						await writeDataframeFrames(
							column.dataframe,
							column.tipo,
							sectionTipo,
							sectionId,
							userId,
							bulkProcessId,
							warnings,
							record.row,
						);
					}

					publish(record, column.tipo, false);
				}

				// The `data`-column twin of dd199/dd200 (see record_metadata.ts): without
				// it the edit view says 1998 and every list says "created today".
				if (metadata.createdDate !== undefined || metadata.createdByUserId !== undefined) {
					await setRecordMetadata(sectionTipo, sectionId, metadata);
				}
			});

			if (isNew) created.push(sectionId);
			else updated.push(sectionId);
		} catch (error) {
			// The row's transaction rolled back: the record is exactly as it was.
			failed.push({
				section_id: sectionId,
				component_tipo: '',
				msg: `IGNORED: the row was rolled back — ${(error as Error).message}`,
				data: null,
				row: record.row,
			});
		}
		publish(record, null, false);
	}

	return {
		ok: true,
		file: progress.file,
		section_tipo: sectionTipo,
		bulk_process_id: bulkProcessId,
		created,
		updated,
		failed,
		warnings,
		errors,
		rows_total: plan.length,
		ms: Math.round(performance.now() - startedAt),
	};
}
