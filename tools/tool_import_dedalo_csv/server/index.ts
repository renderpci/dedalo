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
 * All component tipos in a section's ontology subtree (not crossing child
 * sections). Canonical accessor (S2-19/T3): the section-bounded walk lives in
 * ontology/resolver.ts; the `component_*` filter (the old LIKE 'component\_%')
 * stays local.
 */
async function sectionComponentTipos(
	sectionTipo: string,
): Promise<{ tipo: string; model: string }[]> {
	const { getOrderedSubtree } = await import('../../../src/core/ontology/resolver.ts');
	const nodes = await getOrderedSubtree(sectionTipo);
	return nodes
		.filter((node) => node.model?.startsWith('component_') === true)
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

/** Resolve a CSV header cell to its target component (strip date/relation suffix). */
async function resolveColumn(header: string): Promise<CsvColumn | null> {
	const candidates = [header, header.replace(/_(dmy|mdy|ymd)$/, ''), header.replace(/_[^_]+$/, '')];
	for (const tipo of candidates) {
		if (tipo === '') continue;
		const model = await getModelByTipo(tipo);
		if (model !== null) return { tipo, model, columnName: header };
	}
	return null;
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

async function executePlan(
	plan: PlannedRecord[],
	sectionTipo: string,
	userId: number,
): Promise<{ created: number; updated: number; failed: unknown[] }> {
	let created = 0;
	let updated = 0;
	const failed: unknown[] = [];
	for (const record of plan) {
		let sectionId = record.sectionId;
		if (sectionId === null) {
			sectionId = await createSectionRecord(sectionTipo, userId);
			created += 1;
		} else {
			updated += 1;
		}
		for (const column of record.columns) {
			if (column.conform.errors.length > 0) {
				failed.push(...column.conform.errors);
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
			});
		}
	}
	return { created, updated, failed };
}

async function importFiles(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const sectionTipo = String(ctx.options.section_tipo ?? '');
		const fileName = String(ctx.options.file_name ?? '');
		if (sectionTipo === '' || fileName === '') return fail('Missing section_tipo or file_name');
		const dir = importDir(ctx.userId);
		const target = safeImportFile(dir, fileName);
		if (!existsSync(target)) return fail('CSV file not found');

		const rows = await parseCsvOffLoop(await Bun.file(target).text());
		const header = rows[0];
		if (header === undefined || rows.length < 2) return fail('CSV has no data rows');
		const columns = await Promise.all(header.map((cell) => resolveColumn(cell)));
		const plan = planCsvImport(rows.slice(1), columns);
		const report = await executePlan(plan, sectionTipo, ctx.userId);
		return {
			result: true,
			msg: `OK. Import done. Created ${report.created}, updated ${report.updated}${report.failed.length > 0 ? `, ${report.failed.length} failed` : ''}.`,
			errors: [],
			...report,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
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
		process_uploaded_file: { permission: 'section', minLevel: 2, handler: processUploadedFile },
		import_files: { permission: 'section', minLevel: 2, handler: importFiles },
	},
	backgroundRunnable: ['import_files'],
};
