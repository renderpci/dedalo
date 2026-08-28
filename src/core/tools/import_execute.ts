/**
 * Shared import executor — turn mapped records (from any format: CSV, MARC21,
 * RDF/Zotero) into section records. For each mapped record: create a new record
 * (or reuse a matched section_id), conform each field's value(s) through the
 * import engine, and save via the standard component save path (TM-audited).
 *
 * Reused by tool_import_marc21 / tool_import_zotero / tool_import_rdf so the
 * write path is identical to the CSV import (which is scratch-twin verified).
 *
 * THREE PROPERTIES THIS EXECUTOR OWES ITS CALLERS (P0-7, audit DATA-01/DATA-20),
 * all of which the CSV door already had and this one did not:
 *
 *   1. THE RUN IS ONE dd800 BULK PROCESS. Every TM row it writes carries that
 *      run's id, which is the ONLY thing that makes a wrong import revertable as
 *      one operation instead of row by row. The dd800 record is created BEFORE
 *      any data row is touched, ATOMICALLY (the row and its label are one
 *      transaction, so a failed label leaves no orphan), and a failure to create
 *      it REFUSES the run — an unattributable import is worse than no import. A
 *      run with NO mapped records mints nothing: there is no event to file.
 *   2. ONE TRANSACTION PER RECORD. A mid-record failure used to leave a
 *      half-written record committed; now the record's create and every one of
 *      its component saves commit or roll back together, and a failed record is
 *      reported instead of aborting (and discarding) the whole run.
 *      A CONSEQUENCE, deliberate and ledgered in the WC entry: an observer
 *      propagation failure now rolls the record back instead of being swallowed
 *      per record. Inside an ambient transaction a failed statement has already
 *      ABORTED it (observers.ts B6), so the swallow could only hide the cause
 *      and hand the record's remaining saves a poisoned transaction.
 *   3. THE WRITE LANGUAGE IS THE REQUEST'S. It comes from the request-language
 *      ALS (`currentDataLang()`), never from the static DEDALO_DATA_LANG: the
 *      write is lang-sliced, so the install default REPLACED the operator's
 *      actual working language and an empty cell CLEARED it. The ALS survives
 *      into the background job the import runs in (mediaJobs.submit exits only
 *      the transaction stores), so a backgrounded run keeps the session's lang.
 */

import { BULK_PROCESS_TIPOS } from '../concepts/section.ts';
import { withTransaction } from '../db/postgres.ts';
import { getModelByTipo, getTranslatableByTipo } from '../ontology/resolver.ts';
import { currentDataLang } from '../resolve/request_lang.ts';
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
	/**
	 * The dd800 bulk-process record this run is attributed to. Every TM row the
	 * run wrote carries it, so `bulk_revert_process` can undo the whole import as
	 * ONE operation (audit DATA-20). Present whenever the run had anything to
	 * write — a run that refuses to mint one writes nothing at all.
	 *
	 * NULL means the run was EMPTY: no mapped records, so no data row was touched
	 * and there is nothing to attribute or revert. A dd800 minted for that would
	 * file an event that never happened in the operator's Processes list.
	 */
	bulkProcessId: number | null;
}

/**
 * The dd800 record that owns this import run — the twin of the CSV door's own
 * `createBulkProcessRecord`. Created BEFORE any data row is touched: a failure
 * here fails the RUN rather than importing unattributably.
 */
async function createBulkProcessRecord(
	sectionTipo: string,
	userId: number,
	options: { bulkLabel?: string; sourceFile?: string },
): Promise<number> {
	// ATOMIC (P0-7 review): the row and its label/file are ONE mint. Without the
	// wrap a failing label save correctly refused the run but left an ORPHAN
	// dd800 behind — an unlabelled row in the operator's Processes list,
	// attributed to nothing, that no revert will ever name.
	return await withTransaction(async () => {
		const bulkProcessId = await createSectionRecord(BULK_PROCESS_TIPOS.section, userId);
		const entries: [string, string][] = [
			[BULK_PROCESS_TIPOS.label, options.bulkLabel ?? `Mapped import into ${sectionTipo}`],
		];
		// The file name is the caller's to know (MARC21/Zotero/RDF each name their
		// own source): omitted rather than invented when the caller did not say.
		if (options.sourceFile !== undefined && options.sourceFile !== '') {
			entries.push([BULK_PROCESS_TIPOS.file, options.sourceFile]);
		}
		for (const [tipo, value] of entries) {
			await saveComponentData({
				componentTipo: tipo,
				sectionTipo: BULK_PROCESS_TIPOS.section,
				sectionId: bulkProcessId,
				lang: 'lg-nolan',
				changedData: [{ action: 'set_data', id: null, value: [{ value }] }],
				userId,
			});
		}
		return bulkProcessId;
	});
}

/** One mapped record's write, as it happened. Counters move only on a COMMIT. */
interface RecordOutcome {
	sectionId: number;
	wasCreated: boolean;
	failed: ConformFailure[];
}

/**
 * Write ONE mapped record. Runs inside the caller's per-record transaction, so
 * everything it does — the record create and every component save — commits or
 * rolls back together.
 */
async function writeMappedRecord(
	record: MappedRecord,
	sectionTipo: string,
	userId: number,
	bulkProcessId: number,
	dataLang: string,
): Promise<RecordOutcome> {
	const failed: ConformFailure[] = [];
	const wasCreated = record.sectionId === null;
	const sectionId = record.sectionId ?? (await createSectionRecord(sectionTipo, userId));

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
		// THE REQUEST's data language, not the install default (audit DATA-01).
		const componentLang = translatable ? dataLang : 'lg-nolan';
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
				// The run's attribution: without it the TM rows land with a NULL
				// bulk_process_id and the import cannot be reverted as one operation.
				bulkProcessId,
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
	return { sectionId, wasCreated, failed };
}

/**
 * Execute an import of mapped records into `sectionTipo`. Creates a record per
 * mapped record when sectionId is null. Each field's flat values are conformed
 * (wrapping into {value} items for value-property models) and merged into a single
 * set_data. Per-field failures are collected, never aborting the run.
 *
 * `options` is how a door names its run in the dd800 Processes list; it is
 * optional so the existing MARC21/Zotero/RDF call sites keep working, and the
 * bulk process is created either way.
 */
export async function importMappedRecords(
	records: readonly MappedRecord[],
	sectionTipo: string,
	userId: number,
	options: { bulkLabel?: string; sourceFile?: string } = {},
): Promise<ImportReport> {
	let created = 0;
	let updated = 0;
	const failed: ConformFailure[] = [];
	const createdIds: number[] = [];

	// NOTHING TO WRITE, NOTHING TO ATTRIBUTE (P0-7 review). Every caller can reach
	// here with an empty mapped set — a MARC21 batch whose every staged file
	// failed to parse, a Zotero/RDF export with no subjects, a map that matched no
	// column — and each of them already reports its own parse errors. Minting a
	// dd800 for that files an event that never happened in the operator's
	// Processes list, and it is the one dd800 no revert can ever be about.
	if (records.length === 0) {
		return { created, updated, failed, createdIds, bulkProcessId: null };
	}

	// REFUSE rather than proceed: a throw here reaches the caller before a single
	// data row is touched, which is the whole point of creating it first.
	const bulkProcessId = await createBulkProcessRecord(sectionTipo, userId, options);

	// Resolved ONCE for the run, outside the per-record transactions: every row of
	// one import belongs to one operator's working language, and a mid-run change
	// would split the file across two language slices.
	const dataLang = currentDataLang();

	for (const record of records) {
		try {
			// ONE TRANSACTION PER RECORD (the CSV door's posture): a failure part-way
			// through a record leaves NO half-written record behind.
			const outcome = await withTransaction(() =>
				writeMappedRecord(record, sectionTipo, userId, bulkProcessId, dataLang),
			);
			if (outcome.wasCreated) {
				created += 1;
				createdIds.push(outcome.sectionId);
			} else {
				updated += 1;
			}
			failed.push(...outcome.failed);
		} catch (error) {
			// The row is rolled back, so the run continues and REPORTS it — an engine
			// fault used to escape here and discard the whole report, `createdIds`
			// included, leaving the operator with records they could not find.
			failed.push({
				section_id: record.sectionId ?? 0,
				data: '',
				component_tipo: sectionTipo,
				msg: `IGNORED: the record was not written — ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	}
	return { created, updated, failed, createdIds, bulkProcessId };
}
