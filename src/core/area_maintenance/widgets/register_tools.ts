/**
 * register_tools widget — the tools registry panel + the reconcile action
 * (PHP widgets/register_tools wrapping tools_register).
 */

import { sql } from '../../db/postgres.ts';
import { getModelByTipo } from '../../ontology/resolver.ts';
import { type WidgetModule, type WidgetResponse, gated } from './support.ts';

/**
 * register_tools panel (PHP widgets/register_tools::get_value →
 * tools_register::get_tools_files_list). PHP scans the tool DIRECTORIES for
 * register.json files and pairs each with its dd1324 registry record; this
 * engine ships no tool file tree, so the SHARED registry is the single
 * source: `version` mirrors `installed_version` by construction and the
 * file-state warnings ('Missing register.json' / 'Not registered tool')
 * cannot arise. On an install whose files and registry agree — the normal
 * state — the datalist is byte-identical to PHP's. Component tipos per
 * tool_ontology_map: dd1326 TOOL_NAME, dd1327 VERSION, dd1644 DEVELOPER.
 */
async function registerToolsGetValue(): Promise<WidgetResponse> {
	const rows = (await sql.unsafe(
		`SELECT string->'dd1326'->0->>'value' AS name,
		        string->'dd1327'->0->>'value' AS version,
		        string->'dd1644'->0->>'value' AS developer
		 FROM matrix_tools
		 WHERE section_tipo = 'dd1324'
		 ORDER BY string->'dd1326'->0->>'value'`,
		[],
	)) as { name: string | null; version: string | null; developer: string | null }[];

	const datalist = rows
		.filter((row) => row.name !== null && row.name !== '')
		.map((row) => ({
			name: row.name,
			warning: null,
			version: row.version,
			developer: row.developer,
			installed_version: row.version,
		}));

	// PHP pre-flight: warn when the dd1644 Developer term is missing from the
	// ontology (an outdated matrix_tools schema would break imports)
	const errors =
		(await getModelByTipo('dd1644')) === null
			? ["Your Ontology is outdated. Term 'dd1644' (Developer) do not exists"]
			: null;

	return {
		result: { datalist, errors },
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/**
 * register_tools.register_tools — reconcile the TS-owned tools/ tree with the
 * dd1324 registry (PHP tools_register::import_tools). Because dd1324 is SHARED
 * with the live PHP install, this is DRY-RUN unless config.tools.
 * enableRegistryImport is on: it validates every tool package and reports which
 * would change, writing nothing. The report lists per-tool validity, whether the
 * registry already matches (empty diff = no-op), and any warnings.
 */
async function registerToolsImport(): Promise<WidgetResponse> {
	const { importTools } = await import('../../tools/register.ts');
	const report = await importTools();
	const dryRun = report[0]?.dryRun ?? true;
	const invalid = report.filter((item) => !item.valid);
	const wouldChange = report.filter(
		(item) => item.valid && (!item.inRegistry || item.diff.length > 0),
	);

	return {
		result: {
			dry_run: dryRun,
			total: report.length,
			invalid_count: invalid.length,
			would_change_count: wouldChange.length,
			report,
		},
		msg: dryRun
			? `OK. Dry-run: ${report.length} tools scanned, ${wouldChange.length} would change, ${invalid.length} invalid. Registry not modified.`
			: `OK. ${report.length} tools registered.`,
		errors: invalid.flatMap((item) => item.errors),
	};
}

/**
 * register_tools.register_tools OWNED mode (UPDATE_PROCESS Phase 1): when the
 * TS engine owns the install (core/update/ownership.ts) dd1324 is TS-owned and
 * the widget behaves like PHP `register_tools::register_tools` — always a real
 * import. Response bytes per the oracle: result = the per-tool import-result
 * array, msg = 'OK. Request done successfully' | 'Warning! Request done with
 * errors', errors = flat per-tool error strings. Report items keep the TS
 * installer shape {name,dir,version,imported,errors,warnings} (richer than
 * PHP's file_info rows — ledgered divergence, engineering/WIRE_CONTRACT.md).
 */
async function registerToolsImportOwned(): Promise<WidgetResponse> {
	const { importTools } = await import('../../tools/register.ts');
	const raw = await importTools({ dryRun: false });
	const report = raw.map((item) => ({
		name: item.name,
		dir: item.dir,
		version: (item as { record?: { version?: string } }).record?.version ?? null,
		imported: item.valid === true && item.dryRun !== true,
		errors: item.errors ?? [],
		warnings: item.warnings ?? [],
	}));
	const errors = report.flatMap((item) => item.errors);
	return {
		result: report,
		msg:
			errors.length === 0 ? 'OK. Request done successfully' : 'Warning! Request done with errors',
		errors,
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'register_tools',
		category: 'config',
		label: { kind: 'label', key: 'register_tools' },
	},
	apiActions: {
		// Ownership-gated (UPDATE_PROCESS Phase 1). Closed (coexisting): reconcile
		// the TS-owned tools/ tree with the dd1324 registry DRY-RUN by default
		// (config.tools.enableRegistryImport=false) — validates every tool and
		// reports the diff WITHOUT writing (engineering/TOOLS_SPEC.md write-parity
		// gate before enabling writes). Open (engine owns the install): real
		// import, PHP response bytes.
		register_tools: gated(
			'register_tools.register_tools',
			registerToolsImport,
			registerToolsImportOwned,
		),
	},
	getValue: registerToolsGetValue,
};
