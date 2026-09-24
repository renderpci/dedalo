/**
 * Shared file-target infrastructure for the file-format diffusion writers
 * (DIFFUSION_SPEC §4.3 rdf/xml/markdown/csv/json; this slice serves the
 * tabular trio csv/json/markdown).
 *
 * Layout contract — NOT restated here (PUB-03, 2026-09-03): the root, the
 * per-target directory and the per-record file names come from the ONE
 * producer both sides import, src/core/diffusion_bridge/published_files.ts
 * (the delete side, diffusion_delete.ts resolvePublishedFilePath, reads the
 * same functions). This module re-exports the root resolver and wraps the
 * grammar for the writers; `diffusion_scope_tripwire` proves per writer that
 * the file the producer names is the file the writer's removeRecords unlinks.
 *
 *   <root>/<format>/<dirLabel>/            one directory per format × target
 *   <root>/markdown/<service>/<st>_<id>.md per-record files (delete grammar)
 *
 * Root resolution: DEDALO_DIFFUSION_FILES_ROOT (ops override; tests point it
 * at a MARKED scratch dir so the real media tree is never touched) falling
 * back to `config.media.rootPath`. Missing both = loud typed error at open(),
 * never a silent write to a guessed path.
 *
 * All finalization is temp+rename on the SAME filesystem (atomicWriteFile);
 * ZIP creation ports the old engine's Bun.zip-or-PKZIP-STORE fallback
 * (diffusion/api/v1/lib/rdf_file_utils.ts:138-248) — flat archive, basename
 * entries, method STORE, zeroed timestamps (deterministic archives).
 *
 * The ZIP bytes are the engine's ONE encoder, a neutral kernel outside this
 * subsystem (src/core/files/zip.ts `buildStoreZip`; tool_export streams through
 * the same file's `openZipStream`), and the temp-sibling name is the kernel's
 * too (src/core/files/temp_path.ts) — both imported, never forked.
 */

import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import {
	diffusionFilesRoot,
	MissingDiffusionFilesRootError,
	publishedRecordFileName,
	publishedTargetDir,
} from '../../core/diffusion_bridge/published_files.ts';
import { DedaloError } from '../../core/errors/index.ts';
import { tempPathFor } from '../../core/files/temp_path.ts';
import { buildStoreZip } from '../../core/files/zip.ts';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';

// The root resolver and its error are the core producer's; writers and their
// tests keep importing them from here.
export { diffusionFilesRoot, MissingDiffusionFilesRootError };

/**
 * The per-target directory label: serviceName for 'files' targets (PHP
 * /{format}/{service_name}/), database for 'table' targets published to a
 * file format (csv/json exports of a table plan).
 */
export function fileTargetDirLabel(plan: PublicationPlan): string {
	return plan.target.kind === 'files' ? plan.target.serviceName : plan.target.database;
}

/** `<root>/<format>/<dirLabel>` — the run's output directory (the producer's grammar). */
export function formatTargetDir(format: string, dirLabel: string): string {
	return publishedTargetDir(diffusionFilesRoot(), format, dirLabel);
}

/**
 * Per-record file name of the xml / markdown writers — THE producer's grammar
 * (published_files.ts publishedRecordFileName; PHP get_record_file_path
 * `$section_tipo .'_'. $section_id .'.md'`). `extension` is the writer's file
 * extension ('xml' | 'md'); a format with no per-record file is a caller bug.
 */
export function recordFileName(
	sectionTipo: string,
	sectionId: number | string,
	extension: 'xml' | 'md',
): string {
	const name = publishedRecordFileName(
		extension === 'md' ? 'markdown' : 'xml',
		sectionTipo,
		sectionId,
	);
	if (name === null) {
		throw new DedaloError('internal.invariant', {
			message: `recordFileName: no per-record file grammar for extension '${extension}'`,
		});
	}
	return name;
}

/**
 * Ordered emitted column names of a section plan — excludeColumn fields
 * participate in resolution only and never reach a file (same filter the
 * mariadb writer applies via tableColumnFields).
 */
export function planColumnNames(section: SectionPlan): string[] {
	return section.fields
		.filter((field) => field.excludeColumn !== true)
		.map((field) => field.columnName);
}

/**
 * Atomic write: mkdir -p parents, write `<final>.tmp-<random>`, rename over
 * the final path. A failed write never leaves a partial final file; the temp
 * is cleaned on error.
 */
export function atomicWriteFile(finalPath: string, content: string | Uint8Array): void {
	mkdirSync(dirname(finalPath), { recursive: true });
	const tempPath = tempPathFor(finalPath);
	try {
		writeFileSync(tempPath, content);
		renameSync(tempPath, finalPath);
	} catch (error) {
		if (existsSync(tempPath)) unlinkSync(tempPath);
		throw error;
	}
}

/**
 * ZIP the given files into `zipPath` — flat archive keyed by basename (old
 * engine posture, rdf_file_utils.ts create_zip). ALWAYS the deterministic
 * PKZIP STORE archive of the engine's one encoder (core/files/zip.ts
 * buildStoreZip): the old engine's runtime `Bun.zip` probe was
 * deliberately removed (audit S2-36) — a future Bun release shipping Bun.zip
 * would have silently switched the archive bytes with zero code change and no
 * test signal. If Bun.zip is ever wanted, gate it behind explicit config plus
 * a golden zip-bytes test. Missing source files are skipped with a warning;
 * zero valid entries throws. The archive lands via temp+rename like every
 * other artifact.
 */
export async function createZip(filePaths: string[], zipPath: string): Promise<void> {
	const entries: Record<string, Uint8Array> = {};
	for (const filePath of filePaths) {
		try {
			const buffer = await Bun.file(filePath).arrayBuffer();
			entries[basename(filePath)] = new Uint8Array(buffer);
		} catch (error) {
			console.warn(`diffusion createZip: skipping missing file '${filePath}':`, error);
		}
	}
	if (Object.keys(entries).length === 0) {
		throw new Error('diffusion createZip: no valid files to include');
	}

	atomicWriteFile(zipPath, buildStoreZip(entries));
}
