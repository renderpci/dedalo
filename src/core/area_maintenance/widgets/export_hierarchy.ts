/**
 * export_hierarchy widget — thesaurus registry sync + the psql dump of one or
 * more hierarchy sections into the engine's own hierarchy import directory.
 *
 * WHERE THE FILES GO (2026-08-19). PHP took the destination from an operator
 * constant, `EXPORT_HIERARCHY_PATH`, which was never carried into the TS engine.
 * It is not a choice: the only useful destination is the directory the IMPORT
 * half already reads (`install/import/hierarchy` — HIERARCHY_IMPORT_DIR), so a
 * file exported here is immediately offered by the add_hierarchy panel and the
 * install wizard. It is therefore a FIXED, repo-root-derived constant, not a
 * config key — the same treatment every other v6 `*_PATH` constant got
 * (config/migration_map.ts DERIVED_PATH). The widget serves it to the client as
 * `export_hierarchy_path`; without that value the panel renders its
 * "define the constant" dead-end instead of the export form.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MATRIX_COPY_COLUMNS } from '../../db/matrix_write.ts';
import { sql } from '../../db/postgres.ts';
import { HIERARCHY_IMPORT_DIR } from '../../install/paths.ts';
import { connFromConfig, type DbConnDescriptor, runPsql } from '../../install/pg_exec.ts';
import { composeContains, locatorJsonVariants } from '../../search/containment.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/** The web path the download route (server.ts serveHierarchyExportFile) answers. */
export const HIERARCHY_EXPORT_URL_PREFIX = '/dedalo/install/import/hierarchy/';

/**
 * One row of the hierarchy REGISTRY (`hierarchy1`) that is currently ACTIVE —
 * `relation->'hierarchy4'` carrying the dd64/1 "yes" locator.
 *
 * `active_ts` is the 'active in thesaurus' flag (hierarchy125) and `target` the
 * hierarchy's target section tipo (hierarchy53). Both consumers of this list
 * want a subset of the same three columns, which is exactly why it is ONE
 * function: the sync action reconciles `active_ts` per row, the export action
 * maps `target`. Two copies of this query would be two chances to lose the
 * dual-typed section_id probe below.
 */
export interface ActiveHierarchyRow {
	section_id: number;
	active_ts: string | null;
	target: string | null;
}

/**
 * The ACTIVE hierarchy registry rows (PHP hierarchy::get_active_elements).
 *
 * The dd64/1 locator is matched in BOTH typed section_id forms
 * (WC-2026-08-10-section-id-int-canonical): jsonb `@>` is type-strict and stored
 * locators are string-form until the int sweep, int-form after — a single-form
 * literal silently loses half the rows during the expand window and forever on
 * an old-backup restore. `active_ts` reads through `->>`, which renders either
 * stored type as text, so its '1' comparison is type-agnostic.
 */
export async function activeHierarchyRows(): Promise<ActiveHierarchyRow[]> {
	const queryParams: string[] = [];
	const activeClause = composeContains(
		`relation->'hierarchy4'`,
		[locatorJsonVariants({ section_id: 1, section_tipo: 'dd64' }).map((json) => `[${json}]`)],
		(payload) => {
			queryParams.push(payload);
			return `$${queryParams.length}`;
		},
	);
	return (await sql.unsafe(
		`SELECT section_id,
		        relation->'hierarchy125'->0->>'section_id' AS active_ts,
		        COALESCE(data->'hierarchy53', string->'hierarchy53')->0->>'value' AS target
		 FROM matrix_hierarchy_main
		 WHERE section_tipo = 'hierarchy1'
		   AND ${activeClause}
		 ORDER BY section_id`,
		queryParams,
	)) as ActiveHierarchyRow[];
}

/**
 * The PURE per-row decision of the registry sync: does THIS active hierarchy
 * registry row get deactivated?
 *
 * Two skips, both load-bearing:
 *  - `active_ts === '1'` — the registry already agrees with the thesaurus, so
 *    writing again would be a needless component save plus a time-machine row
 *    per already-synced hierarchy.
 *  - `target === 'rsc197'` — the 'People' hierarchy is EXEMPT (PHP
 *    hierarchy::sync_hierarchy_active_status). Drop this arm and pressing the
 *    button deactivates People on every install.
 *
 * `active_ts` arrives from `->>`, i.e. text or NULL: the comparison is against
 * the STRING '1', never a number and never truthiness.
 */
export function shouldDeactivate(row: {
	active_ts: string | null;
	target: string | null;
}): boolean {
	if (row.active_ts === '1') return false; // in sync
	if (row.target === 'rsc197') return false; // 'People' hierarchy exempt
	return true;
}

/**
 * Deactivate every ACTIVE hierarchy (hierarchy1 hierarchy4 = dd64/1) whose
 * 'active in thesaurus' flag (hierarchy125) is NOT yes — the registry follows
 * the thesaurus (PHP hierarchy::sync_hierarchy_active_status). The 'People'
 * hierarchy (target rsc197) is exempted. Writes go through the standard
 * component save path (TM row + modification metadata included).
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): the read below is the whole-registry
 * reconcile BY DESIGN — no `section_id` is bound — so no scratch-scoped
 * invocation exists: one call would deactivate every out-of-sync hierarchy in
 * the suite database and write a TM row for each. The DECISION it drives is
 * gated as `shouldDeactivate()`
 * (test/unit/export_hierarchy_deactivate_native.test.ts); the write path is
 * `saveComponentData`, gated elsewhere.
 */
async function exportHierarchySyncActiveStatus(): Promise<WidgetResponse> {
	const rows = await activeHierarchyRows();

	let errorCount = 0;
	const { saveComponentData } = await import('../../section/record/save_component.ts');
	for (const row of rows) {
		if (!shouldDeactivate(row)) continue;
		const outcome = await saveComponentData({
			componentTipo: 'hierarchy4',
			sectionTipo: 'hierarchy1',
			sectionId: Number(row.section_id),
			lang: 'lg-nolan',
			userId: -1,
			changedData: [
				{
					action: 'set_data',
					id: null,
					// NUMERICAL_MATRIX_VALUE_NO — the full locator shape the
					// component save persists for the radio_button. section_id is
					// minted as an INT: that is the canonical stored form
					// (WC-2026-08-10-section-id-int-canonical), not a string.
					value: [
						{
							id: 1,
							type: 'dd151',
							section_id: 2,
							section_tipo: 'dd64',
							from_component_tipo: 'hierarchy4',
						},
					],
				},
			],
		});
		if (!outcome.ok) errorCount++;
	}
	return { data: errorCount === 0 };
}

// ---------------------------------------------------------------------------
// EXPORT — pure decisions first, so each is reachable without touching psql.
// ---------------------------------------------------------------------------

/**
 * PHP `safe_tipo()`: a SECTION tipo is 2+ lowercase ascii letters followed by
 * digits, and nothing else. Deliberately STRICTER than the engine-wide
 * `isSafeSectionTipo` (`[a-zA-Z0-9_]+`): this value is inlined into a psql
 * `\copy` argument — where psql performs NO variable interpolation, so a bind
 * parameter is impossible — AND it becomes the exported file's basename, which
 * the download route must be able to allowlist with the same shape.
 */
export function safeExportTipo(sectionTipo: string): boolean {
	return /^[a-z]{2,}[0-9]+$/.test(sectionTipo);
}

/**
 * The matrix table a section tipo's rows live in. The two LANGUAGE sections are
 * stored apart from the rest of the thesaurus; everything else is hierarchy.
 */
export function tableForTipo(sectionTipo: string): 'matrix_langs' | 'matrix_hierarchy' {
	return sectionTipo === 'lg1' || sectionTipo === 'lg2' ? 'matrix_langs' : 'matrix_hierarchy';
}

/** What the operator asked to export. */
export type ExportScope = { kind: 'active' } | { kind: 'all' } | { kind: 'list'; tipos: string[] };

/**
 * Parse the panel's single free-text input (PHP's three accepted forms):
 * `'*'` = every currently active hierarchy, one file each; `'all'` = every
 * matrix_hierarchy row into ONE timestamped file; anything else = a
 * comma-separated tipo list. Empty entries are dropped here; INVALID ones are
 * NOT — they must survive to the run so each gets its own error line rather
 * than vanishing silently.
 */
export function parseExportScope(raw: unknown): ExportScope {
	const text = typeof raw === 'string' ? raw.trim() : '';
	if (text === '*') return { kind: 'active' };
	if (text === 'all') return { kind: 'all' };
	return {
		kind: 'list',
		tipos: text
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry !== ''),
	};
}

/** `all_2026-08-19_142530.copy.gz` — the whole-table scope's timestamped name. */
export function allScopeFileName(when: Date): string {
	const pad = (value: number): string => String(value).padStart(2, '0');
	const stamp =
		`${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
		`_${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
	return `all_${stamp}.copy.gz`;
}

/**
 * The single psql meta-command that produces one file.
 *
 * `\copy … TO PROGRAM 'gzip -c > <file> && sync'` streams the result set
 * straight through gzip to its final name in ONE pass: no intermediate
 * uncompressed file to clean up, and `sync` flushes it before psql returns, so
 * the existence probe that follows is meaningful. `\copy` (backslash) is
 * psql's CLIENT-side meta-command — not SQL `COPY` — so gzip runs on THIS host
 * and the file lands here even when Postgres is remote.
 */
export function exportCopyCommand(
	table: string,
	where: string,
	order: string,
	outFile: string,
): string {
	const columns = MATRIX_COPY_COLUMNS.join(',');
	return (
		`\\copy (SELECT ${columns} FROM ${table} WHERE ${where} ORDER BY ${order})` +
		` TO PROGRAM 'gzip -c > ${outFile} && sync'`
	);
}

/** The copy-pasteable re-import command the panel prints under the file list. */
export function importHint(table: string): string {
	const columns = MATRIX_COPY_COLUMNS.join(',');
	return (
		`SECTION_TIPO='us1' ; gunzip -c \${SECTION_TIPO}.copy.gz` +
		` | psql dedalo_myentity -U mydbuser -h localhost` +
		` -c "\\copy ${table}(${columns}) from STDIN"`
	);
}

/** One produced file, as the client's `render_export_response` reads it. */
export interface ExportedFile {
	section_tipo: string;
	table: string;
	file_name: string;
	bytes: number | null;
	url: string;
}

/**
 * Why the destination cannot be used, or null when it can.
 *
 * A SENTENCE-OR-NULL, deliberately not an `{ok, error}` pair: an internal
 * outcome shape must not spell the wire envelope (error_taxonomy_tripwire B1).
 * The caller turns this into one error line of a batch report.
 *
 * The single-quote screen is not paranoia about the operator: the path is
 * inlined into a psql-quoted shell command (`TO PROGRAM '…'`), so a repo
 * checked out under a directory whose name contains `'` would break OUT of that
 * quoting. It cannot be escaped away inside a nested quoting context, so it is
 * refused loudly instead of silently producing a broken command.
 */
export function exportDirRefusal(dir: string): string | null {
	if (/['\r\n\0]/.test(dir)) {
		return `the hierarchy export directory path cannot be used in a shell command: ${dir}`;
	}
	if (!existsSync(dir)) {
		return `hierarchy export directory does not exist: ${dir}`;
	}
	try {
		// A write probe by CREATION would litter; the psql child is the real
		// writer and reports its own failure, so this is the cheap precondition.
		if (!statSync(dir).isDirectory()) {
			return `hierarchy export destination is not a directory: ${dir}`;
		}
	} catch (error) {
		return `hierarchy export directory unreadable: ${(error as Error).message}`;
	}
	return null;
}

/** The injectable edge: production always takes the configured connection. */
export interface ExportHierarchyDeps {
	conn?: DbConnDescriptor;
	/** Destination directory; defaults to the fixed HIERARCHY_IMPORT_DIR. */
	outDir?: string;
	/** Clock for the 'all' scope's file name. */
	now?: Date;
}

/** One file to produce: everything the psql command needs, decided up front. */
export interface ExportEntry {
	sectionTipo: string;
	table: string;
	where: string;
	order: string;
	fileName: string;
}

/** One produced file, as the client's `render_export_response` reads it. */
export interface ExportedFile {
	section_tipo: string;
	table: string;
	file_name: string;
	bytes: number | null;
	url: string;
}

/** The entry for one requested section tipo (caller has validated the tipo). */
export function listEntry(sectionTipo: string): ExportEntry {
	return {
		sectionTipo,
		table: tableForTipo(sectionTipo),
		where: `section_tipo = '${sectionTipo}'`,
		order: 'section_id ASC',
		fileName: `${sectionTipo}.copy.gz`,
	};
}

/** The whole-table entry: every matrix_hierarchy row into ONE timestamped file. */
export function allEntry(when: Date): ExportEntry {
	return {
		sectionTipo: 'all',
		table: 'matrix_hierarchy',
		where: 'section_tipo IS NOT NULL',
		order: 'section_tipo, section_id ASC',
		fileName: allScopeFileName(when),
	};
}

/**
 * Split a requested tipo list into the entries to dump and the refusal lines.
 *
 * Pure, and separate from the run for one reason: an invalid tipo must produce
 * an error LINE, never abort the batch. Deciding that here means the runner has
 * no "is this safe" arm left to get wrong.
 */
export function planListEntries(tipos: readonly string[]): {
	entries: ExportEntry[];
	errors: string[];
} {
	const entries: ExportEntry[] = [];
	const errors: string[] = [];
	for (const sectionTipo of tipos) {
		if (safeExportTipo(sectionTipo)) entries.push(listEntry(sectionTipo));
		else errors.push(`Ignored invalid section tipo: ${sectionTipo} . Use format like "es1"`);
	}
	if (entries.length === 0 && errors.length === 0) {
		errors.push('No section tipo requested. Use a list like "es1,ts1", "*" or "all"');
	}
	return { entries, errors };
}

/** The distinct target section tipos of the ACTIVE hierarchies (the '*' scope). */
async function activeTargets(): Promise<string[]> {
	const targets = (await activeHierarchyRows())
		.map((row) => row.target)
		.filter((target): target is string => typeof target === 'string' && target !== '');
	return [...new Set(targets)];
}

/** Turn a parsed scope into the files to produce plus the refusals it earned. */
async function planEntries(
	scope: ExportScope,
	when: Date,
): Promise<{ entries: ExportEntry[]; errors: string[] }> {
	if (scope.kind === 'all') return { entries: [allEntry(when)], errors: [] };
	const tipos = scope.kind === 'active' ? await activeTargets() : scope.tipos;
	return planListEntries(tipos);
}

/** Dump ONE entry to its file. Returns the record, or the error sentence. */
async function exportOne(
	conn: DbConnDescriptor,
	outDir: string,
	entry: ExportEntry,
): Promise<{ file: ExportedFile } | { error: string }> {
	const outFile = join(outDir, entry.fileName);
	const command = exportCopyCommand(entry.table, entry.where, entry.order, outFile);
	const run = await runPsql(conn, ['-v', 'ON_ERROR_STOP=1', '-c', command]);
	// The file probe is the real verdict: `\copy … TO PROGRAM` reports the psql
	// side, not gzip's, so a nonzero exit and a produced file are both possible.
	// psql's own words ride along when there is nothing to show.
	if (!existsSync(outFile)) {
		const detail = run.stderr !== '' ? ` (${run.stderr})` : '';
		return { error: `Export failed for section_tipo: ${entry.sectionTipo}${detail}` };
	}
	return {
		file: {
			section_tipo: entry.sectionTipo,
			table: entry.table,
			file_name: entry.fileName,
			bytes: fileBytes(outFile),
			url: HIERARCHY_EXPORT_URL_PREFIX + entry.fileName,
		},
	};
}

/** Size of a produced file, or null when it cannot be stat'ed (never a throw). */
function fileBytes(path: string): number | null {
	try {
		return statSync(path).size;
	} catch {
		return null;
	}
}

/**
 * Assemble the panel response. `data` is true when at least one file landed;
 * `files` and `import_hint` are top-level extension keys the client reads by
 * name (render_export_response). PHP prints the hint for the LAST table it
 * touched — matrix_hierarchy when nothing was planned.
 */
function exportResponse(
	files: ExportedFile[],
	errors: string[],
	entries: readonly ExportEntry[],
): WidgetResponse {
	const exported = files.length > 0;
	const lastTable = entries[entries.length - 1]?.table ?? 'matrix_hierarchy';
	return {
		data: exported,
		msg: exported
			? `OK. ${files.length} hierarchy file(s) exported`
			: 'Error. No hierarchy files were exported',
		...(errors.length > 0 ? { errors } : {}),
		extend: { files, import_hint: importHint(lastTable) },
	};
}

/**
 * Fill the injectable edges with their production defaults.
 *
 * Kept OUT of `exportHierarchy` (the same reason ontology_update.ts keeps
 * `resolveUpdateDeps` separate): three `??` fallbacks are three branches the
 * seam would otherwise add to the function that actually runs psql, and the
 * complexity budget belongs to the real work.
 */
function resolveExportDeps(deps: ExportHierarchyDeps): {
	conn: DbConnDescriptor;
	outDir: string;
	now: Date;
} {
	return {
		conn: deps.conn ?? connFromConfig(),
		outDir: deps.outDir ?? HIERARCHY_IMPORT_DIR,
		now: deps.now ?? new Date(),
	};
}

/**
 * Dump hierarchy sections to gzip-compressed psql COPY files (PHP
 * hierarchy::export_hierarchy).
 *
 * A per-entry failure is an ERROR LINE, never a thrown refusal: the panel runs
 * over a list, and one bad tipo must not discard the files the others produced.
 */
export async function exportHierarchy(
	options: Record<string, unknown>,
	deps: ExportHierarchyDeps = {},
): Promise<WidgetResponse> {
	const { conn, outDir, now } = resolveExportDeps(deps);
	const refusal = exportDirRefusal(outDir);
	if (refusal !== null) return exportResponse([], [refusal], []);

	const { entries, errors } = await planEntries(parseExportScope(options.section_tipo), now);

	const files: ExportedFile[] = [];
	for (const entry of entries) {
		const result = await exportOne(conn, outDir, entry);
		if ('error' in result) errors.push(result.error);
		else files.push(result.file);
	}
	return exportResponse(files, errors, entries);
}

async function exportHierarchyGetValue(): Promise<WidgetResponse> {
	return { data: { export_hierarchy_path: HIERARCHY_IMPORT_DIR } };
}

export const widget: WidgetModule = {
	spec: {
		id: 'export_hierarchy',
		category: 'data',
		class: 'success width_100',
		label: { kind: 'label', key: 'export_hierarchy' },
	},
	getValue: exportHierarchyGetValue,
	apiActions: {
		sync_hierarchy_active_status: exportHierarchySyncActiveStatus,
		export_hierarchy: (options) => exportHierarchy(options),
	},
};
