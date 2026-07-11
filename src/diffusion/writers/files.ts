/**
 * Shared file-target infrastructure for the file-format diffusion writers
 * (DIFFUSION_SPEC §4.3 rdf/xml/markdown/csv/json; this slice serves the
 * tabular trio csv/json/markdown).
 *
 * Layout contract (kept in LOCKSTEP with the delete side,
 * src/core/diffusion_bridge/diffusion_delete.ts resolvePublishedFilePath, and PHP
 * diffusion/class.diffusion_markdown.php get_record_file_path):
 *
 *   <root>/<format>/<dirLabel>/            one directory per format × target
 *   <root>/markdown/<service>/<st>_<id>.md per-record files (delete grammar)
 *
 * Root resolution: DEDALO_DIFFUSION_FILES_ROOT (test/ops override, documented
 * here — tests point it at a temp dir so the real media tree is never
 * touched) falling back to MEDIA_PATH (the same env key diffusion_delete.ts
 * reads — PHP DEDALO_MEDIA_PATH). Missing both = loud typed error at open(),
 * never a silent write to a guessed path.
 *
 * All finalization is temp+rename on the SAME filesystem (atomicWriteFile);
 * ZIP creation ports the old engine's Bun.zip-or-PKZIP-STORE fallback
 * (diffusion/api/v1/lib/rdf_file_utils.ts:138-248) — flat archive, basename
 * entries, method STORE, zeroed timestamps (deterministic archives).
 */

import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { readEnv } from '../../config/env.ts';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';

/** Thrown at open() when no file root is configured (loud config gate). */
export class MissingDiffusionFilesRootError extends Error {
	constructor() {
		super(
			'No diffusion files root configured: set MEDIA_PATH (PHP DEDALO_MEDIA_PATH) ' +
				'or the DEDALO_DIFFUSION_FILES_ROOT override.',
		);
		this.name = 'MissingDiffusionFilesRootError';
	}
}

/**
 * The published-files root. DEDALO_DIFFUSION_FILES_ROOT overrides (tests/ops);
 * default is MEDIA_PATH — the SAME key diffusion_delete.ts unlinks under, so
 * publish and delete stay in lockstep.
 */
export function diffusionFilesRoot(): string {
	const override = readEnv('DEDALO_DIFFUSION_FILES_ROOT');
	if (override !== undefined && override !== '') return override;
	const mediaPath = readEnv('MEDIA_PATH');
	if (mediaPath !== undefined && mediaPath !== '') return mediaPath;
	throw new MissingDiffusionFilesRootError();
}

/**
 * The per-target directory label: serviceName for 'files' targets (PHP
 * /{format}/{service_name}/), database for 'table' targets published to a
 * file format (csv/json exports of a table plan).
 */
export function fileTargetDirLabel(plan: PublicationPlan): string {
	return plan.target.kind === 'files' ? plan.target.serviceName : plan.target.database;
}

/** `<root>/<format>/<dirLabel>` — the run's output directory. */
export function formatTargetDir(format: string, dirLabel: string): string {
	return `${diffusionFilesRoot()}/${format}/${dirLabel}`;
}

/**
 * Per-record file name — the EXACT delete-side grammar
 * (diffusion_delete.ts:299 `${sectionTipo}_${sectionId}.${extension}`; PHP
 * get_record_file_path `$section_tipo .'_'. $section_id .'.md'`).
 */
export function recordFileName(
	sectionTipo: string,
	sectionId: number | string,
	extension: string,
): string {
	return `${sectionTipo}_${sectionId}.${extension}`;
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

/** A sibling temp path for `finalPath` (same dir ⇒ same filesystem ⇒ atomic rename). */
export function tempPathFor(finalPath: string): string {
	const random = Math.random().toString(36).slice(2, 10);
	return `${finalPath}.tmp-${random}`;
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
 * PKZIP STORE writer below: the old engine's runtime `Bun.zip` probe was
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

/**
 * Minimal PKZIP writer, method 0 (STORE), zeroed mod time/date — ported from
 * the old engine's create_zip_fallback (rdf_file_utils.ts:175-248) verbatim
 * in structure; deterministic bytes for identical inputs.
 */
function buildStoreZip(entries: Record<string, Uint8Array>): Uint8Array {
	const parts: Uint8Array[] = [];
	const centralDirectory: Uint8Array[] = [];
	let offset = 0;
	const encoder = new TextEncoder();

	for (const [name, data] of Object.entries(entries)) {
		const nameBytes = encoder.encode(name);
		const crc = crc32(data);
		const size = data.byteLength;

		// Local file header (signature 0x04034b50)
		const localHeader = new DataView(new ArrayBuffer(30 + nameBytes.length));
		localHeader.setUint32(0, 0x04034b50, true); // signature
		localHeader.setUint16(4, 20, true); // version needed
		localHeader.setUint16(6, 0, true); // flags
		localHeader.setUint16(8, 0, true); // method (STORE)
		localHeader.setUint16(10, 0, true); // mod time
		localHeader.setUint16(12, 0, true); // mod date
		localHeader.setUint32(14, crc, true); // crc-32
		localHeader.setUint32(18, size, true); // compressed size
		localHeader.setUint32(22, size, true); // uncompressed size
		localHeader.setUint16(26, nameBytes.length, true); // filename length
		localHeader.setUint16(28, 0, true); // extra length
		new Uint8Array(localHeader.buffer).set(nameBytes, 30);

		const localBytes = new Uint8Array(localHeader.buffer);
		parts.push(localBytes, data);

		// Central directory record (signature 0x02014b50)
		const centralEntry = new DataView(new ArrayBuffer(46 + nameBytes.length));
		centralEntry.setUint32(0, 0x02014b50, true);
		centralEntry.setUint16(4, 20, true);
		centralEntry.setUint16(6, 20, true);
		centralEntry.setUint16(8, 0, true);
		centralEntry.setUint16(10, 0, true);
		centralEntry.setUint16(12, 0, true);
		centralEntry.setUint16(14, 0, true);
		centralEntry.setUint32(16, crc, true);
		centralEntry.setUint32(20, size, true);
		centralEntry.setUint32(24, size, true);
		centralEntry.setUint16(28, nameBytes.length, true);
		centralEntry.setUint16(30, 0, true);
		centralEntry.setUint16(32, 0, true);
		centralEntry.setUint16(34, 0, true);
		centralEntry.setUint16(36, 0, true);
		centralEntry.setUint32(40, 0, true);
		centralEntry.setUint32(42, offset, true);
		new Uint8Array(centralEntry.buffer).set(nameBytes, 46);

		centralDirectory.push(new Uint8Array(centralEntry.buffer));
		offset += localBytes.length + size;
	}

	// End of central directory (signature 0x06054b50)
	const count = Object.keys(entries).length;
	const centralBytes = concatBytes(centralDirectory);
	const endRecord = new DataView(new ArrayBuffer(22));
	endRecord.setUint32(0, 0x06054b50, true);
	endRecord.setUint16(4, 0, true);
	endRecord.setUint16(6, 0, true);
	endRecord.setUint16(8, count, true);
	endRecord.setUint16(10, count, true);
	endRecord.setUint32(12, centralBytes.length, true);
	endRecord.setUint32(16, offset, true);
	endRecord.setUint16(20, 0, true);

	return concatBytes([...parts, centralBytes, new Uint8Array(endRecord.buffer)]);
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
	const total = arrays.reduce((sum, array) => sum + array.length, 0);
	const out = new Uint8Array(total);
	let position = 0;
	for (const array of arrays) {
		out.set(array, position);
		position += array.length;
	}
	return out;
}

/** Standard CRC-32 (table lookup) — old engine rdf_file_utils.ts crc32. */
function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (let index = 0; index < data.length; index++) {
		crc = (CRC_TABLE[(crc ^ (data[index] as number)) & 0xff] as number) ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE: Uint32Array = (() => {
	const table = new Uint32Array(256);
	for (let index = 0; index < 256; index++) {
		let value = index;
		for (let bit = 0; bit < 8; bit++) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[index] = value;
	}
	return table;
})();
