/**
 * Media-import matchers (PHP tool_import_files::get_media_section_match_from_souce
 * / get_media_section_match) — match an uploaded file to existing records by the
 * filename stored in a "target_filename" component.
 *
 * The basename comparison (extension-stripped, PHP pathinfo()['filename']) is the
 * pure, tested core; the DB walks (relation locators / value search) live in the
 * tool module.
 */

/** PHP pathinfo($path)['filename']: strip directory AND the final extension. */
export function fileBasename(path: string): string {
	const noDir = path.replace(/^.*[\\/]/, '');
	const dot = noDir.lastIndexOf('.');
	return dot > 0 ? noDir.slice(0, dot) : noDir;
}

/** Whether an uploaded file name matches a stored value by extension-stripped basename. */
export function basenamesMatch(storedValue: string, uploadedFullName: string): boolean {
	return fileBasename(storedValue) === fileBasename(uploadedFullName);
}

/**
 * A named-processor registry (PHP file_processor's SEC-053 dynamic include of
 * per-tool scripts, collapsed here to an allowlist of registered functions —
 * "only registered names run"). A processor transforms a staged file before
 * ingest. None are ported yet; the dispatch + allowlist enforcement are what
 * matter (an unregistered name is refused, never executed).
 */
export type FileProcessor = (
	input: Record<string, unknown>,
) => Promise<{ result: boolean; msg: string }>;

const FILE_PROCESSORS = new Map<string, FileProcessor>();

/** Register a named processor (name must match ^[A-Za-z_][A-Za-z0-9_]{0,63}$). */
export function registerFileProcessor(name: string, fn: FileProcessor): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
		throw new Error(`invalid processor name: ${name}`);
	}
	FILE_PROCESSORS.set(name, fn);
}

export function getFileProcessor(name: string): FileProcessor | null {
	if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) return null;
	return FILE_PROCESSORS.get(name) ?? null;
}
