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
import { type ConformFailure, conformImportData, groupItemsByLang } from './import_data.ts';

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
			const translatable = await getTranslatableByTipo(field.component_tipo);
			const componentLang = translatable ? config.menu.dataLang : 'lg-nolan';
			// Group by lang across ALL of the field's values: a lang-keyed conform
			// result (a translatable export) or v7 raw items carrying their own lang
			// must be saved ONE LANG AT A TIME — set_data is lang-sliced (PHP
			// set_data_lang), and a flat merged save would lose translations (the
			// old code even pushed a lang-keyed OBJECT as a single item).
			const groups = new Map<string, unknown[]>();
			// A REFUSED cell and an EXPLICIT EMPTY are opposite intents and must not
			// share a write. `set_data []` below is the import's CLEAR — the source
			// said "no value". A conform error says the cell was never readable, and
			// the refusal message promises the stored value was left untouched; so a
			// field with ANY refused value is not written at all. Same per-column
			// all-or-nothing the CSV executor applies (import_csv_execute.ts: an
			// errored column is skipped before any saveComponentData).
			let refused = false;
			for (const value of field.values) {
				const conform = await conformImportData({
					model,
					importValue: value,
					columnName: field.component_tipo,
					sectionTipo,
					sectionId,
					componentTipo: field.component_tipo,
					lang: componentLang,
				});
				if (conform.errors.length > 0) {
					failed.push(...conform.errors);
					refused = true;
					continue;
				}
				for (const [lang, items] of groupItemsByLang(conform.result, componentLang)) {
					const group = groups.get(lang);
					if (group === undefined) groups.set(lang, [...items]);
					else group.push(...items);
				}
			}
			if (refused) {
				// The dropped-siblings line: a multi-occurrence field whose other
				// values DID conform is still not written, so say so — silence here
				// would read as "only the bad one was skipped".
				if (groups.size > 0) {
					failed.push({
						section_id: sectionId,
						data: field.values,
						component_tipo: field.component_tipo,
						msg: 'IGNORED: the field was NOT written — one of its values was refused, so the record keeps its stored value',
					});
				}
				continue;
			}
			if (groups.size === 0) groups.set(componentLang, []);
			for (const [lang, items] of groups) {
				// A REFUSED save is a per-field failure, never a silent no-op. The
				// write engine answers `{ok:false, message}` for a refusal it wants the
				// caller to show (ONT-TLD, consultation-only, dataframe pairing …);
				// discarding it reported "N updated, 0 failed" for a run that wrote
				// nothing, which is the one outcome an importer must never produce.
				const outcome = await saveComponentData({
					componentTipo: field.component_tipo,
					sectionTipo,
					sectionId,
					lang,
					changedData: [{ action: 'set_data', id: null, value: items }],
					userId,
				});
				if (outcome.ok === false) {
					failed.push({
						section_id: sectionId,
						data: items,
						component_tipo: field.component_tipo,
						msg: `IGNORED: ${outcome.message}`,
					});
				}
			}
		}
	}
	return { created, updated, failed, createdIds };
}
