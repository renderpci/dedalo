/**
 * register_tools (PHP installer register_tools). Populates the shared tool
 * registry (matrix_tools / dd1324) from THIS server's own tools tree
 * (each tools/<name>/register.json). Reuses the existing import machinery
 * (core/tools/register.ts importTools)
 * with dryRun:false to force the real write regardless of the standing
 * enableRegistryImport flag — a fresh install has an empty matrix_tools and must
 * be populated for the tools to appear in the UI.
 *
 * Response shape is the client contract: `{result, errors, report:[{name,dir,
 * version,imported,errors,warnings}]}` (render_installer.js renders one row per
 * tool).
 */

export interface RegisterToolsReportItem {
	name: string;
	dir: string;
	version: string | null;
	imported: boolean;
	errors: string[];
	warnings: string[];
}

export interface RegisterToolsResult {
	result: boolean;
	msg: string;
	errors: string[];
	report: RegisterToolsReportItem[];
}

/** Import every discoverable tool registration into matrix_tools. */
export async function registerInstallTools(): Promise<RegisterToolsResult> {
	const { importTools } = await import('../tools/register.ts');
	const raw = await importTools({ dryRun: false });
	const report: RegisterToolsReportItem[] = raw.map((item) => ({
		name: item.name,
		dir: item.dir,
		version: (item as { record?: { version?: string } }).record?.version ?? null,
		imported: item.valid === true && item.dryRun !== true,
		errors: item.errors ?? [],
		warnings: item.warnings ?? [],
	}));
	const failed = report.filter((item) => item.errors.length > 0);
	return {
		result: failed.length === 0,
		msg:
			failed.length === 0
				? `Registered ${report.length} tool(s)`
				: `Registered ${report.length - failed.length}/${report.length} tool(s); ${failed.length} had errors`,
		errors: failed.flatMap((item) => item.errors),
		report,
	};
}
