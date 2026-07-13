/**
 * Shared import executor — turn mapped records (from any format: CSV, MARC21,
 * RDF/Zotero) into section records. For each mapped record: create a new record
 * (or reuse a matched section_id), conform each field's value(s) through the
 * import engine, and save via the standard component save path (TM-audited).
 *
 * Reused by tool_import_marc21 / tool_import_zotero / tool_import_rdf so the
 * write path is identical to the CSV import (which is scratch-twin verified).
 */

import { config } from '../../config/config.ts';
import { getModelByTipo, getTranslatableByTipo } from '../ontology/resolver.ts';
import { createSectionRecord } from '../section/record/create_record.ts';
import { saveComponentData } from '../section/record/save_component.ts';
import { type ConformFailure, conformImportData } from './import_data.ts';

export interface MappedField {
	component_tipo: string;
	/** One or more flat values (multi-occurrence) to conform into this component. */
	values: string[];
}

export interface MappedRecord {
	/** Existing section_id to update, or null to create a new record. */
	sectionId: number | null;
	fields: MappedField[];
}

export interface ImportReport {
	created: number;
	updated: number;
	failed: ConformFailure[];
	/** The section_ids of records CREATED by this run (for cleanup / reporting). */
	createdIds: number[];
}

/**
 * Execute an import of mapped records into `sectionTipo`. Creates a record per
 * mapped record when sectionId is null. Each field's flat values are conformed
 * (wrapping into {value} items for value-property models) and merged into a single
 * set_data. Per-field failures are collected, never aborting the run.
 */
export async function importMappedRecords(
	records: readonly MappedRecord[],
	sectionTipo: string,
	userId: number,
): Promise<ImportReport> {
	let created = 0;
	let updated = 0;
	const failed: ConformFailure[] = [];
	const createdIds: number[] = [];

	for (const record of records) {
		let sectionId = record.sectionId;
		if (sectionId === null) {
			sectionId = await createSectionRecord(sectionTipo, userId);
			created += 1;
			createdIds.push(sectionId);
		} else {
			updated += 1;
		}
		for (const field of record.fields) {
			const model = await getModelByTipo(field.component_tipo);
			if (model === null) {
				failed.push({
					section_id: sectionId,
					data: '',
					component_tipo: field.component_tipo,
					msg: 'IGNORED: unknown component tipo',
				});
				continue;
			}
			const items: unknown[] = [];
			for (const value of field.values) {
				const conform = await conformImportData({
					model,
					importValue: value,
					columnName: field.component_tipo,
					sectionTipo,
					sectionId,
					componentTipo: field.component_tipo,
				});
				if (conform.errors.length > 0) {
					failed.push(...conform.errors);
					continue;
				}
				if (Array.isArray(conform.result)) items.push(...conform.result);
				else if (conform.result !== null) items.push(conform.result);
			}
			const translatable = await getTranslatableByTipo(field.component_tipo);
			await saveComponentData({
				componentTipo: field.component_tipo,
				sectionTipo,
				sectionId,
				lang: translatable ? config.menu.dataLang : 'lg-nolan',
				changedData: [{ action: 'set_data', id: null, value: items }],
				userId,
			});
		}
	}
	return { created, updated, failed, createdIds };
}
