/**
 * Media-import matchers (PHP tool_import_files::get_media_section_match_from_souce
 * / get_media_section_match) — match an uploaded file to existing records by the
 * filename stored in a "target_filename" component.
 *
 * The basename comparison (extension-stripped, PHP pathinfo()['filename']) is the
 * pure, tested core; the DB walks (relation locators / value search) live in the
 * tool module.
 */

import { DedaloError } from '../errors/index.ts';

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
 * ingest; the dispatch + allowlist enforcement are what matter (an
 * unregistered name is refused, never executed).
 */
export interface FileProcessorOutput {
	/** The processor's own staged output file name, in the SAME staging dir as its source. */
	tmpName: string;
	/** The display/target_filename name to record for this output (e.g. `<stem>_crop-0.<ext>`). */
	fileName: string;
	/**
	 * The PORTAL component tipo this output must be added through, on the
	 * CALLING record itself (no new top-level record — PHP crop_50 :139-148
	 * uses the caller's own `section_id` for every `custom_arguments`
	 * destination). When set, the per-file loop skips its normal
	 * destination-resolution entirely and adds one child through this exact
	 * portal (`import_files()`'s `importIntoPortal`). Omit it for a processor
	 * whose outputs should go through the ordinary enumerate/named/default +
	 * component_option path instead.
	 */
	portalComponentTipo?: string;
}

export type FileProcessor = (input: Record<string, unknown>) => Promise<{
	ok: boolean;
	message: string;
	/**
	 * A processor that SPLITS one upload into several new files (crop_50: one
	 * photo -> obverse + reverse) reports them here instead of transforming the
	 * source in place. The `import_files` per-file loop then runs each output
	 * through the ordinary destination-resolution + portal + ingest path, exactly
	 * as if it had been uploaded directly — the processor only ever produces
	 * files, it never creates a record itself.
	 */
	outputs?: FileProcessorOutput[];
}>;

const FILE_PROCESSORS = new Map<string, FileProcessor>();

/** Register a named processor (name must match ^[A-Za-z_][A-Za-z0-9_]{0,63}$). */
export function registerFileProcessor(name: string, fn: FileProcessor): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
		throw new DedaloError('internal.invariant', {
			message: `invalid processor name: ${name}`,
		});
	}
	FILE_PROCESSORS.set(name, fn);
}

export function getFileProcessor(name: string): FileProcessor | null {
	if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) return null;
	return FILE_PROCESSORS.get(name) ?? null;
}
