/**
 * tool_import_dedalo_csv server module (PHP tool_import_dedalo_csv).
 *
 * The tool is the API SURFACE; the import engine lives in core:
 *   - src/core/tools/import_csv.ts      — parse + plan (per-cell conform)
 *   - src/core/tools/import_conform.ts  — the per-model parsers (importConform facet)
 *   - src/core/tools/import_csv_execute.ts — apply the plan (one tx per row)
 *   - src/core/tools/import_wire.ts     — the typed report + progress contract
 *
 * Actions:
 *   get_section_components_list — the section's components for the column mapper.
 *   get_csv_files              — per-file column analysis + sample rows.
 *   delete_csv_file            — soft-delete a CSV in the per-user import dir.
 *   process_uploaded_file      — move a staged upload into the import dir.
 *   validate_import            — PREFLIGHT: check the column map + dry-run the
 *                                conform over a sample, before anything is written.
 *   import_files (background)  — the run. Publishes ImportProgressFrame ticks and
 *                                returns an ImportBatchReport.
 */

import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { config } from '../../../src/config/config.ts';
import { BULK_PROCESS_TIPOS } from '../../../src/core/concepts/section.ts';
import { sanitizeSegment } from '../../../src/core/media/ingest/add_file.ts';
import { termByTipo } from '../../../src/core/ontology/labels.ts';
import { getModelByTipo, getTranslatableByTipo } from '../../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../../src/core/section/record/save_component.ts';
import {
	type CsvAnalysis,
	type CsvColumn,
	planCsvImport,
} from '../../../src/core/tools/import_csv.ts';
import { executeCsvImport } from '../../../src/core/tools/import_csv_execute.ts';
import type {
	ImportBatchReport,
	ImportFileReport,
	ImportProgressFrame,
} from '../../../src/core/tools/import_wire.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';

function fail(message: string): ToolResponse {
	return { result: false, msg: `Error. ${message}`, errors: [message] };
}

/**
 * Parse CSV text OFF the serving event loop (audit S3-42): a fresh worker per
 * call (startup is milliseconds against multi-second parses; no idle thread
 * lingers) running the identical pure parser — see csv_worker.ts.
 */
function parseCsvOffLoop(text: string, delimiter?: string): Promise<string[][]> {
	const worker = new Worker(new URL('./csv_worker.ts', import.meta.url).href);
	return new Promise<string[][]>((resolvePromise, rejectPromise) => {
		worker.onmessage = (event: MessageEvent) => {
			const data = event.data as { rows?: string[][]; error?: string };
			if (data.error !== undefined) rejectPromise(new Error(data.error));
			else resolvePromise(data.rows ?? []);
		};
		worker.onerror = (event: ErrorEvent) => {
			rejectPromise(new Error(String(event.message ?? 'csv worker failed')));
		};
		worker.postMessage({ text, delimiter });
	}).finally(() => worker.terminate());
}

/**
 * Compute the get_csv_files summary OFF the serving event loop (audit S3-42): the
 * worker does the full parse AND the per-row malformed-JSON scan and returns only
 * the bounded summary — the full row set never crosses the thread boundary.
 */
function analyzeCsvOffLoop(text: string, delimiter?: string): Promise<CsvAnalysis | null> {
	const worker = new Worker(new URL('./csv_worker.ts', import.meta.url).href);
	return new Promise<CsvAnalysis | null>((resolvePromise, rejectPromise) => {
		worker.onmessage = (event: MessageEvent) => {
			const data = event.data as { analysis?: CsvAnalysis | null; error?: string };
			if (data.error !== undefined) rejectPromise(new Error(data.error));
			else resolvePromise(data.analysis ?? null);
		};
		worker.onerror = (event: ErrorEvent) => {
			rejectPromise(new Error(String(event.message ?? 'csv worker failed')));
		};
		worker.postMessage({ text, delimiter, analyze: true });
	}).finally(() => worker.terminate());
}

/** The per-user CSV import dir (PHP DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH/<user>). */
function importDir(userId: number): string {
	const root = config.media.rootPath;
	if (root === null || root === '') throw new Error('media root is not configured');
	const dir = resolve(root, 'import/files', String(userId));
	const base = resolve(root, 'import/files');
	if (dir !== base && !dir.startsWith(base + sep))
		throw new Error('import dir escapes the import root');
	mkdirSync(dir, { recursive: true, mode: 0o775 });
	return dir;
}

/** Confine a user-supplied file name inside the import dir (no traversal). */
function safeImportFile(dir: string, fileName: string): string {
	const target = resolve(dir, fileName);
	if (target !== dir && !target.startsWith(dir + sep)) throw new Error('invalid file name');
	return target;
}

/**
 * All component tipos of a section (PHP get_ar_children_tipo_by_model_name_in_section
 * with recursive=true and **resolve_virtual=true**), not crossing child sections.
 *
 * (!) VIRTUAL SECTIONS. A virtual section has NO components of its own: its node's
 * relations[0].tipo points at the REAL section that owns them, minus the tipos its
 * exclude_elements child names. A plain subtree walk therefore returns an EMPTY list
 * for one — which is silent here, because the client renders an empty <select> and
 * simply auto-detects nothing (an empty array is truthy, so its `!ar_components`
 * error branch never fires). resolveVirtualEditScope is the canonical resolver the
 * rest of the engine already uses for exactly this (relations/request_config).
 */
async function sectionComponentTipos(
	sectionTipo: string,
): Promise<{ tipo: string; model: string }[]> {
	const { getOrderedSubtree } = await import('../../../src/core/ontology/resolver.ts');
	const { resolveVirtualEditScope } = await import(
		'../../../src/core/relations/request_config/implicit.ts'
	);
	const { realTipo, excludeSet } = await resolveVirtualEditScope(sectionTipo);
	const nodes = await getOrderedSubtree(realTipo);
	return nodes
		.filter((node) => node.model?.startsWith('component_') === true)
		.filter((node) => !excludeSet.has(node.tipo))
		.map((node) => ({ tipo: node.tipo, model: node.model as string }));
}

/**
 * get_section_components_list: the section's components as {label,value,model} for
 * the CSV column-mapper dropdown, PLUS a top-level `label` (the section term). The
 * client reads response.result (→ list), response.label, response.msg.
 */
async function getSectionComponentsList(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const sectionTipo = String(ctx.options.section_tipo ?? '');
		if (sectionTipo === '') return fail('Missing section_tipo');
		const tipos = await sectionComponentTipos(sectionTipo);
		const components = await Promise.all(
			tipos.map(async (t) => ({
				label: await termByTipo(t.tipo, config.menu.applicationLang),
				value: t.tipo,
				model: t.model,
			})),
		);
		const label = await termByTipo(sectionTipo, config.menu.applicationLang);
		return { result: components, label, msg: 'OK. Request done', errors: [] };
	} catch (error) {
		return fail((error as Error).message);
	}
}

/** One column of the CSV header → its component map ({tipo,label,model}) or null. */
async function resolveColumnMap(
	header: string,
): Promise<{ tipo: string; label: string; model: string } | null> {
	if (header === '') return null;
	if (header === 'section_id')
		return { tipo: 'section_id', label: 'Section ID', model: 'section_id' };
	// The lookup uses the BASE tipo (strip a date/relation suffix), but the returned
	// `tipo` keeps the full header so import matches the CSV column exactly (PHP parity).
	const base = header.includes('_') ? header.slice(0, header.indexOf('_')) : header;
	const model = await getModelByTipo(base);
	if (model === null) return null;
	const label = await termByTipo(base, config.menu.applicationLang);
	return { tipo: header, label, model };
}

/**
 * get_csv_files: list the user's CSVs, each with the column analysis the client
 * renders (PHP get_csv_files): name/dir, n_records/n_columns, file_info (header),
 * ar_columns_map (per-column {tipo,label,model}), sample_data (first rows) and
 * sample_data_errors (rows with malformed JSON cells). The parse + per-row scan
 * runs off the serving event loop (audit S3-42) and returns only the bounded
 * summary; only the ontology column-map lookup (header-sized) stays on-thread.
 */
async function getCsvFiles(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const dir = importDir(ctx.userId);
		const filesInfo: Record<string, unknown>[] = [];
		const errors: string[] = [];
		for (const name of readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.csv'))) {
			try {
				const analysis = await analyzeCsvOffLoop(await Bun.file(resolve(dir, name)).text());
				if (analysis === null) {
					errors.push(`error reading file: ${name}`);
					continue;
				}
				const arColumnsMap = await Promise.all(
					analysis.header.map((cell) => resolveColumnMap(cell)),
				);
				filesInfo.push({
					dir,
					name,
					n_records: analysis.n_records,
					n_columns: analysis.n_columns,
					file_info: analysis.header,
					ar_columns_map: arColumnsMap,
					sample_data: analysis.sample_data,
					sample_data_errors: analysis.sample_data_errors,
				});
			} catch (error) {
				errors.push(`Error on read file ${name}: ${(error as Error).message}`);
			}
		}
		return { result: filesInfo, msg: 'OK. Request done', errors };
	} catch (error) {
		return fail((error as Error).message);
	}
}

async function deleteCsvFile(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const fileName = String(ctx.options.file_name ?? '');
		if (fileName === '') return fail('Missing file_name');
		const dir = importDir(ctx.userId);
		const target = safeImportFile(dir, fileName);
		if (!existsSync(target) || !statSync(target).isFile()) {
			return fail('This path does not correspond to a file. Ignored delete_csv_file');
		}
		const deletedDir = resolve(dir, 'deleted');
		mkdirSync(deletedDir, { recursive: true, mode: 0o775 });
		renameSync(target, resolve(deletedDir, `${Date.now()}_${fileName}`));
		return { result: true, msg: 'OK. File deleted', errors: [] };
	} catch (error) {
		return fail((error as Error).message);
	}
}

async function processUploadedFile(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const fileData = (ctx.options.file_data ?? {}) as {
			key_dir?: string;
			tmp_name?: string;
			file_name?: string;
		};
		const rawKeyDir = String(fileData.key_dir ?? '');
		const rawTmpName = String(fileData.tmp_name ?? '');
		if (rawTmpName === '') return fail('Missing staged file (tmp_name)');
		// SEC (parity with PHP sanitize_key_dir): the staged source is REBUILT
		// server-side from the staging root + the CURRENT user id + sanitized
		// segments — never a client-supplied path. Without this, key_dir='../<uid>'
		// stays inside the shared staging root (so the root-confinement check below
		// passes) and lets one user claim another's staged upload. key_dir is
		// optional: empty means "no sub-dir", any non-empty value must sanitize.
		const keyDir = rawKeyDir === '' ? '' : sanitizeSegment(rawKeyDir);
		const tmpName = sanitizeSegment(rawTmpName);
		const fileName = String(fileData.file_name ?? tmpName);
		const root = config.media.rootPath;
		if (root === null) throw new Error('media root is not configured');
		const staged = resolve(
			root,
			config.media.upload.tmpSubdir,
			String(ctx.userId),
			keyDir,
			tmpName,
		);
		const stagingBase = resolve(root, config.media.upload.tmpSubdir);
		if (!staged.startsWith(stagingBase + sep))
			throw new Error('staged path escapes the upload root');
		if (!existsSync(staged)) return fail('staged file not found');
		const dir = importDir(ctx.userId);
		renameSync(staged, safeImportFile(dir, fileName));
		return {
			result: true,
			msg: 'OK. File imported to the CSV folder',
			errors: [],
			file_name: fileName,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

/**
 * One entry of the client's `ar_columns_map` — INDEX-ALIGNED with the CSV header
 * (the mapper builds one per header cell). `tipo` is the header cell it was built
 * for; `map_to` is the component the user chose as the target (usually the same,
 * but the mapper lets them re-point a column); `checked` is the per-column import
 * switch; `decimal` is the number column's separator choice.
 */
interface CsvColumnMapEntry {
	tipo?: unknown;
	model?: unknown;
	checked?: unknown;
	map_to?: unknown;
	decimal?: unknown;
}

/** One file of the client's import batch (options.files[]). */
interface CsvImportFile {
	file?: unknown;
	section_tipo?: unknown;
	ar_columns_map?: unknown;
	bulk_process_label?: unknown;
}

/** The section targets of an import batch — the 'section_list' gate reads these. */
function batchSectionTipos(options: Record<string, unknown>): unknown[] {
	const files = Array.isArray(options.files) ? (options.files as CsvImportFile[]) : [];
	return files.map((file) => file?.section_tipo);
}

/**
 * Resolve the user's column map against the CSV header into the plan's column
 * array. A null entry means "skip this column". The filters, in PHP's order:
 *   - the section_id column is the record KEY, never written as a component;
 *   - unchecked / unmapped columns were deselected in the UI;
 *   - a map entry whose `tipo` no longer equals the header cell at its index was
 *     built for a DIFFERENT csv layout — skip rather than write to the wrong
 *     component (this is why the map is matched positionally AND by name).
 */
async function resolveMappedColumns(
	header: readonly string[],
	columnsMap: readonly (CsvColumnMapEntry | null)[],
	errors: string[],
): Promise<(CsvColumn | null)[]> {
	const columns: (CsvColumn | null)[] = [];
	for (let i = 0; i < header.length; i++) {
		const entry = columnsMap[i] ?? null;
		const headerCell = header[i] ?? '';
		if (entry === null || typeof entry !== 'object') {
			columns.push(null);
			continue;
		}
		// The record key: the planner reads it to match/create, never saves it.
		if (entry.model === 'section_id' || entry.model === 'component_section_id') {
			columns.push({
				tipo: 'section_id',
				model: 'component_section_id',
				columnName: headerCell,
				lang: 'lg-nolan',
			});
			continue;
		}
		const mapTo = typeof entry.map_to === 'string' ? entry.map_to : '';
		if (entry.checked !== true || mapTo === '') {
			columns.push(null);
			continue;
		}
		if (String(entry.tipo ?? '') !== headerCell) {
			errors.push(
				`Ignored column ${i} ('${headerCell}'): the column map was built for '${String(entry.tipo ?? '')}'`,
			);
			columns.push(null);
			continue;
		}
		const model = await getModelByTipo(mapTo);
		if (model === null) {
			errors.push(`Ignored column ${i} ('${headerCell}'): unknown target component '${mapTo}'`);
			columns.push(null);
			continue;
		}
		// columnName keeps the FULL header cell: the conform facets read its suffix
		// (tipo_dmy → the date order; tipo_<section_tipo> → the relation target).
		// tipo is the TARGET (map_to), which may differ from the header.
		const translatable = await getTranslatableByTipo(mapTo);
		columns.push({
			tipo: mapTo,
			model,
			columnName: headerCell,
			lang: translatable ? config.menu.dataLang : 'lg-nolan',
			decimal: typeof entry.decimal === 'string' ? entry.decimal : undefined,
		});
	}
	return columns;
}

/**
 * The dd800 record that owns this import run. Every TM row the run writes is
 * stamped with its id, so the whole import can be reverted as ONE operation.
 * Created BEFORE any data row is touched — a failure here fails the file rather
 * than importing unattributably.
 */
async function createBulkProcessRecord(
	fileName: string,
	label: string,
	userId: number,
): Promise<number> {
	const bulkProcessId = await createSectionRecord(BULK_PROCESS_TIPOS.section, userId);
	for (const [tipo, value] of [
		[BULK_PROCESS_TIPOS.file, fileName],
		[BULK_PROCESS_TIPOS.label, label],
	] as const) {
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
}

/** Read + parse one staged CSV, or throw with a caller-facing message. */
async function readCsvRows(userId: number, fileName: string): Promise<string[][]> {
	const target = safeImportFile(importDir(userId), fileName);
	if (!existsSync(target)) throw new Error(`File not found: ${fileName}`);
	const rows = await parseCsvOffLoop(await Bun.file(target).text());
	if (rows[0] === undefined || rows.length < 2) throw new Error('CSV has no data rows');
	return rows;
}

/** The component labels a progress tick may need, resolved ONCE per file. */
async function resolveColumnLabels(
	columns: readonly (CsvColumn | null)[],
): Promise<Map<string, string>> {
	const labels = new Map<string, string>();
	for (const column of columns) {
		if (column === null || column.model === 'component_section_id') continue;
		if (labels.has(column.tipo)) continue;
		labels.set(column.tipo, await termByTipo(column.tipo, config.menu.applicationLang));
	}
	return labels;
}

/**
 * validate_import — the PREFLIGHT (PHP verify_csv_map, widened).
 *
 * PHP validated the column map only, and only at import time, throwing the file
 * away on the first bad tipo. This runs BEFORE any write and answers the two
 * questions the user actually has: is my mapping valid, and will my VALUES parse?
 * The conform is dry-run over a bounded sample of rows, so a 10k-row file with a
 * date column in the wrong order is caught in milliseconds instead of after a
 * 10k-row failed run.
 */
const VALIDATE_SAMPLE_ROWS = 20;

async function validateImport(ctx: ToolActionContext): Promise<ToolResponse> {
	const files = Array.isArray(ctx.options.files) ? (ctx.options.files as CsvImportFile[]) : [];
	if (files.length === 0) return fail('Missing files');

	const result: Record<string, unknown>[] = [];
	for (const current of files) {
		const fileName = String(current.file ?? '');
		const sectionTipo = String(current.section_tipo ?? '');
		try {
			if (fileName === '' || sectionTipo === '') throw new Error('Missing file or section_tipo');
			const rows = await readCsvRows(ctx.userId, fileName);
			const header = rows[0] as string[];

			const errors: string[] = [];
			const columnsMap = Array.isArray(current.ar_columns_map)
				? (current.ar_columns_map as (CsvColumnMapEntry | null)[])
				: [];
			const columns = await resolveMappedColumns(header, columnsMap, errors);

			// Every mapped target must be a component of THIS section (PHP verify_csv_map).
			const sectionTipos = new Set((await sectionComponentTipos(sectionTipo)).map((c) => c.tipo));
			for (const column of columns) {
				if (column === null || column.model === 'component_section_id') continue;
				if (!sectionTipos.has(column.tipo)) {
					errors.push(
						`Column '${column.columnName}' maps to '${column.tipo}', which is not a component of section '${sectionTipo}'`,
					);
				}
			}

			const mapped = columns.filter(
				(column) => column !== null && column.model !== 'component_section_id',
			);
			if (mapped.length === 0) errors.push('No column is mapped for import');
			if (!columns.some((column) => column?.model === 'component_section_id')) {
				errors.push('The CSV has no section_id column — rows cannot be matched to records');
			}

			// Dry-run the conform over a sample: this is what catches a wrong date order
			// or a decimal separator, which no map check can see.
			const sample = rows.slice(1, 1 + VALIDATE_SAMPLE_ROWS);
			const plan = await planCsvImport(sample, columns, sectionTipo);
			const issues = plan.flatMap((record) =>
				record.columns.flatMap((column) =>
					column.conform.errors.map((error) => ({ ...error, row: record.row })),
				),
			);
			const sampleWarnings = plan.flatMap((record) =>
				record.columns.flatMap((column) =>
					column.conform.warnings.map((warning) => ({ ...warning, row: record.row })),
				),
			);

			result.push({
				ok: errors.length === 0 && issues.length === 0,
				file: fileName,
				section_tipo: sectionTipo,
				rows_total: rows.length - 1,
				rows_sampled: sample.length,
				errors,
				failed: issues,
				warnings: sampleWarnings,
			});
		} catch (error) {
			result.push({
				ok: false,
				file: fileName,
				section_tipo: sectionTipo,
				errors: [(error as Error).message],
				failed: [],
				warnings: [],
			});
		}
	}
	const ok = result.every((file) => file.ok === true);
	return {
		result,
		msg: ok ? 'OK. The import is ready to run' : 'The import has problems — see the report',
		errors: [],
	};
}

/**
 * import_files: the client posts a BATCH — options.files[] = {file, section_tipo,
 * ar_columns_map, bulk_process_label} + time_machine_save. Each file carries its
 * own section target and column map, so the write gate is per file; it has already
 * run in the dispatcher ('section_list' spec below), i.e. BEFORE the background
 * fork, where a denial is still observable to the caller.
 *
 * Returns an ImportBatchReport and publishes ImportProgressFrame ticks while it
 * runs (ctx.publishProgress → the job's subscribers → the client's panel).
 */
async function importFiles(ctx: ToolActionContext): Promise<ToolResponse> {
	const files = Array.isArray(ctx.options.files) ? (ctx.options.files as CsvImportFile[]) : [];
	if (files.length === 0) return fail('Missing files');
	// PHP defaults an absent flag to NO time machine; we default to KEEPING the
	// audit trail — losing the history of a 10k-row write is not a safe default for
	// a caller that simply forgot the flag. The client always sends the checkbox.
	const saveTm = ctx.options.time_machine_save !== false;
	const publish = ctx.publishProgress ?? ((): void => {});

	const report: ImportFileReport[] = [];
	for (const [index, current] of files.entries()) {
		const fileName = String(current.file ?? '');
		const sectionTipo = String(current.section_tipo ?? '');
		try {
			if (fileName === '' || sectionTipo === '') throw new Error('Missing file or section_tipo');

			publish({
				phase: 'reading',
				file: fileName,
				file_index: index + 1,
				files_total: files.length,
				row: 0,
				rows_total: 0,
				section_id: null,
				component_label: null,
				created: 0,
				updated: 0,
				failed: 0,
				warnings: 0,
			} satisfies ImportProgressFrame);

			const rows = await readCsvRows(ctx.userId, fileName);
			const header = rows[0] as string[];

			const errors: string[] = [];
			const columnsMap = Array.isArray(current.ar_columns_map)
				? (current.ar_columns_map as (CsvColumnMapEntry | null)[])
				: [];
			const columns = await resolveMappedColumns(header, columnsMap, errors);
			if (!columns.some((column) => column !== null && column.model !== 'component_section_id')) {
				throw new Error('No column is mapped for import');
			}

			const bulkProcessId = await createBulkProcessRecord(
				fileName,
				String(current.bulk_process_label ?? fileName),
				ctx.userId,
			);
			const plan = await planCsvImport(rows.slice(1), columns, sectionTipo);
			report.push(
				await executeCsvImport({
					plan,
					sectionTipo,
					userId: ctx.userId,
					bulkProcessId,
					saveTm,
					errors,
					progress: {
						file: fileName,
						fileIndex: index + 1,
						filesTotal: files.length,
						labels: await resolveColumnLabels(columns),
						publish,
					},
				}),
			);
		} catch (error) {
			report.push({
				ok: false,
				file: fileName,
				section_tipo: sectionTipo,
				bulk_process_id: null,
				created: [],
				updated: [],
				failed: [],
				warnings: [],
				errors: [(error as Error).message],
				rows_total: 0,
				ms: 0,
			});
		}
	}

	const created = report.reduce((sum, file) => sum + file.created.length, 0);
	const updated = report.reduce((sum, file) => sum + file.updated.length, 0);
	const failed = report.reduce((sum, file) => sum + file.failed.length, 0);
	const batch: ImportBatchReport = {
		result: report,
		msg: `Import done. Created ${created}, updated ${updated}, failed ${failed}.`,
		errors: [],
	};
	return batch as unknown as ToolResponse;
}

export const tool: ToolServerModule = {
	name: 'tool_import_dedalo_csv',
	apiActions: {
		get_section_components_list: {
			permission: 'section',
			minLevel: 1,
			handler: getSectionComponentsList,
		},
		get_csv_files: { permission: null, handler: getCsvFiles },
		delete_csv_file: { permission: null, handler: deleteCsvFile },
		// permission: null — there is no section target to gate on: the client posts
		// only {file_data}. The action is user-scoped by construction (both the staged
		// source and the import destination are REBUILT from ctx.userId) and writes no
		// record. The write gate lives on import_files, where the targets exist.
		process_uploaded_file: { permission: null, handler: processUploadedFile },
		// The preflight READS the same targets the import writes, so it is gated at
		// READ level on every one of them — it must never become a way to probe a
		// section the caller cannot see.
		validate_import: {
			permission: 'section_list',
			minLevel: 1,
			sectionTipos: batchSectionTipos,
			handler: validateImport,
		},
		// The batch's targets ride inside options.files[], one section per file, so
		// the gate asserts WRITE on every one before the fork (SEC-024 §9.2).
		import_files: {
			permission: 'section_list',
			minLevel: 2,
			sectionTipos: batchSectionTipos,
			handler: importFiles,
		},
	},
	backgroundRunnable: ['import_files'],
};
