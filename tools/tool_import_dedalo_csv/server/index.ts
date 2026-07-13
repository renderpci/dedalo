/**
 * tool_import_dedalo_csv server module (PHP tool_import_dedalo_csv).
 *
 * get_section_components_list: the section's components as {label,value,model}[]
 *   + a top-level `label` (section term) — the exact shape the client column-mapper
 *   reads (response.result → list, response.label, response.msg).
 * get_csv_files: per-file column analysis (name/dir, n_records/n_columns,
 *   file_info header, ar_columns_map {tipo,label,model}, sample_data,
 *   sample_data_errors) — the shape render_file_info / render_columns_mapper need.
 * delete_csv_file: soft-delete a CSV in the per-user import dir, path-confined.
 * process_uploaded_file: move a staged upload into the import dir.
 * import_files (backgroundRunnable): parse the CSV, resolve the column map, plan
 *   the per-record conform (import_csv.ts / import_data.ts — the round-trip
 *   invariant), and execute (createSectionRecord + saveComponentData).
 *
 * The conform/plan CORE is unit-tested (round-trip + edge cases); the live CSV→DB
 * execute drive is ledgered (needs scratch-twin fixtures).
 */

import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { config } from '../../../src/config/config.ts';
import { BULK_PROCESS_TIPOS } from '../../../src/core/concepts/section.ts';
import { sanitizeSegment } from '../../../src/core/media/ingest/add_file.ts';
import { termByTipo } from '../../../src/core/ontology/labels.ts';
import { getModelByTipo } from '../../../src/core/ontology/resolver.ts';
import { getTranslatableByTipo } from '../../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../../src/core/section/record/save_component.ts';
import {
	type CsvAnalysis,
	type CsvColumn,
	type PlannedRecord,
	planCsvImport,
} from '../../../src/core/tools/import_csv.ts';
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

/** Flatten a conform result into a flat items array (lang-keyed objects → stamped items). */
function flattenConform(result: unknown): unknown[] {
	if (result === null) return [];
	if (Array.isArray(result)) return result;
	if (typeof result === 'object') {
		const out: unknown[] = [];
		for (const [lang, items] of Object.entries(result as Record<string, unknown>)) {
			for (const item of (Array.isArray(items) ? items : [items]) as unknown[]) {
				out.push(
					item !== null && typeof item === 'object' ? { ...item, lang } : { value: item, lang },
				);
			}
		}
		return out;
	}
	return [];
}

/**
 * One entry of the client's `ar_columns_map` — INDEX-ALIGNED with the CSV header
 * (render_tool_import_dedalo_csv builds one per header cell). `tipo` is the header
 * cell it was built for; `map_to` is the component the user chose as the target
 * (usually the same, but the mapper lets them re-point a column); `checked` is the
 * per-column import switch. PHP reads exactly these names (import_dedalo_csv_file
 * :846-895) — note it is `map_to`, not the `mapped_to` some doc-blocks claim.
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
 * array (PHP import_dedalo_csv_file column-exclusion filters, :855-895). A null
 * entry means "skip this column". The filters, in PHP's order:
 *   - the section_id column is a record KEY, never written as a component;
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
		// The record key: planCsvImport reads it to match/create, never saves it.
		if (entry.model === 'section_id' || entry.model === 'component_section_id') {
			columns.push({ tipo: 'section_id', model: 'component_section_id', columnName: headerCell });
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
		// columnName keeps the FULL header cell: the conform engine reads its
		// suffix (tipo_dmy / tipo_<section_tipo>) to pick the date order / relation
		// target. tipo is the TARGET (map_to), which may differ from the header.
		columns.push({ tipo: mapTo, model, columnName: headerCell });
	}
	return columns;
}

/**
 * The dd800 record that owns this import run (PHP import_dedalo_csv_file :758-790).
 * Every TM row the run writes is stamped with its id, so the whole import can be
 * reverted as one operation. Created BEFORE any data row is touched — as in PHP, a
 * failure here fails the file rather than importing unattributably.
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

/**
 * Execute one file's plan. Record identity is the CSV's own section_id column
 * (PHP :815-836): a row whose section_id is empty is SKIPPED (never silently
 * created under a fresh counter id), and an id that is not in the DB yet is
 * inserted with THAT id — preserving the source system's ids and relations.
 * createSectionRecord raises the counter past an explicit id, which is PHP's
 * separate consolidate_counter step.
 */
async function executePlan(
	plan: PlannedRecord[],
	sectionTipo: string,
	userId: number,
	audit: { bulkProcessId: number; saveTm: boolean },
): Promise<{ created: number; updated: number; failed: unknown[]; errors: string[] }> {
	let created = 0;
	let updated = 0;
	const failed: unknown[] = [];
	const errors: string[] = [];
	for (const [index, record] of plan.entries()) {
		const sectionId = record.sectionId;
		if (sectionId === null || sectionId <= 0) {
			errors.push(`Row ${index + 1}: SKIPPED — mandatory section_id is missing or invalid`);
			continue;
		}
		// conflictTolerant: the id may already exist (an update row) — then the
		// insert is a no-op and we go straight to saving its components.
		const before = await sectionRecordExists(sectionTipo, sectionId);
		if (!before) {
			await createSectionRecord(sectionTipo, userId, new Date(), sectionId, {
				conflictTolerant: true,
			});
			created += 1;
		} else {
			updated += 1;
		}
		for (const column of record.columns) {
			if (column.conform.errors.length > 0) {
				failed.push(...column.conform.errors);
				continue;
			}
			// A conform result that is still a raw STRING means no per-model handler
			// claimed this flat cell (import_data.ts implements the JSON/raw-export path
			// + the value-property models; the per-model flat-string parsers — date
			// DMY/MDY/YMD, number decimal separator, geo "lat,lon", relation id lists —
			// are NOT ported yet). Saving it would flatten to [] and CLEAR the
			// component, i.e. silently DESTROY the record's existing value. Fail the
			// column loudly instead; the row shows up in failed_rows.
			if (typeof column.conform.result === 'string') {
				failed.push({
					section_id: sectionId,
					data: column.conform.result,
					component_tipo: column.tipo,
					msg: `IGNORED: '${column.model}' cannot import a flat (non-JSON) value yet — the cell was NOT written, and the existing value was left untouched`,
				});
				continue;
			}
			const items = flattenConform(column.conform.result);
			const translatable = await getTranslatableByTipo(column.tipo);
			await saveComponentData({
				componentTipo: column.tipo,
				sectionTipo,
				sectionId,
				lang: translatable ? config.menu.dataLang : 'lg-nolan',
				changedData: [{ action: 'set_data', id: null, value: items }],
				userId,
				bulkProcessId: audit.bulkProcessId,
				saveTm: audit.saveTm,
			});
		}
	}
	return { created, updated, failed, errors };
}

/** Does the record already exist? (PHP section_record::exists_in_the_database.) */
async function sectionRecordExists(sectionTipo: string, sectionId: number): Promise<boolean> {
	const { getMatrixTableFromTipo } = await import('../../../src/core/ontology/resolver.ts');
	const { sql } = await import('../../../src/core/db/postgres.ts');
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) throw new Error(`no matrix table for section '${sectionTipo}'`);
	// The table name comes from the ontology (never the request) — SQL confinement.
	const rows = (await sql.unsafe(
		`SELECT 1 FROM ${table} WHERE section_id = $1 AND section_tipo = $2 LIMIT 1`,
		[sectionId, sectionTipo],
	)) as unknown[];
	return rows.length > 0;
}

/**
 * import_files: the client posts a BATCH — options.files[] = {file, section_tipo,
 * ar_columns_map, bulk_process_label} + time_machine_save (PHP import_files :509).
 * Each file carries its own section target and column map, so the write gate is
 * per file; it has already run in the dispatcher ('section_list' spec below), i.e.
 * before the background fork. The response is the per-file report array PHP returns.
 */
async function importFiles(ctx: ToolActionContext): Promise<ToolResponse> {
	const files = Array.isArray(ctx.options.files) ? (ctx.options.files as CsvImportFile[]) : [];
	if (files.length === 0) return fail('Missing files');
	// PHP defaults an absent flag to NO time machine; we default to KEEPING the
	// audit trail — losing the history of a 10k-row write is not a safe default for
	// a caller that simply forgot the flag. The client always sends the checkbox,
	// so no client-observable divergence.
	const saveTm = ctx.options.time_machine_save !== false;

	const report: Record<string, unknown>[] = [];
	for (const current of files) {
		const fileName = String(current.file ?? '');
		const sectionTipo = String(current.section_tipo ?? '');
		try {
			if (fileName === '' || sectionTipo === '') throw new Error('Missing file or section_tipo');
			const target = safeImportFile(importDir(ctx.userId), fileName);
			if (!existsSync(target)) throw new Error(`File not found: ${fileName}`);

			const rows = await parseCsvOffLoop(await Bun.file(target).text());
			const header = rows[0];
			if (header === undefined || rows.length < 2) throw new Error('CSV has no data rows');

			const errors: string[] = [];
			const columnsMap = Array.isArray(current.ar_columns_map)
				? (current.ar_columns_map as (CsvColumnMapEntry | null)[])
				: [];
			const columns = await resolveMappedColumns(header, columnsMap, errors);
			if (columns.every((column) => column === null || column.tipo === 'section_id')) {
				throw new Error('No column is mapped for import');
			}

			const bulkProcessId = await createBulkProcessRecord(
				fileName,
				String(current.bulk_process_label ?? fileName),
				ctx.userId,
			);
			const plan = planCsvImport(rows.slice(1), columns);
			const outcome = await executePlan(plan, sectionTipo, ctx.userId, { bulkProcessId, saveTm });
			report.push({
				result: true,
				file: fileName,
				section_tipo: sectionTipo,
				bulk_process_id: bulkProcessId,
				msg: `Section: ${sectionTipo}. Created ${outcome.created}, updated ${outcome.updated}, failed ${outcome.failed.length}.`,
				created_rows: outcome.created,
				updated_rows: outcome.updated,
				failed_rows: outcome.failed,
				errors: [...errors, ...outcome.errors],
			});
		} catch (error) {
			report.push({
				result: false,
				file: fileName,
				section_tipo: sectionTipo,
				msg: `Error. ${(error as Error).message}`,
				errors: [(error as Error).message],
			});
		}
	}
	return { result: report, msg: 'Request done', errors: [] };
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
		// only {file_data} (PHP's API_ACTIONS is the list form here, i.e. no
		// declarative gate either). The action is user-scoped by construction — both
		// the staged source and the import destination are REBUILT from ctx.userId —
		// and it writes no record. The write gate lives on import_files, where the
		// section targets actually exist.
		process_uploaded_file: { permission: null, handler: processUploadedFile },
		// The batch's targets ride inside options.files[], one section per file, so
		// the gate asserts write on EVERY one before the fork (PHP SEC-024 §9.2).
		import_files: {
			permission: 'section_list',
			minLevel: 2,
			sectionTipos: batchSectionTipos,
			handler: importFiles,
		},
	},
	backgroundRunnable: ['import_files'],
};
