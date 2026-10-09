/**
 * The OFFLINE ontology source as an ARCHIVE (`--ontology-source <file>`,
 * installer unification A6): a `.tar` / `.tar.gz` / `.tgz` holding an ontology
 * directory in the server export layout (`ontology.json` + `<tld>.copy.gz`
 * [+ `matrix_dd.copy.gz`]), extracted into a scratch directory the catalog
 * resolver then reads exactly like a local directory.
 *
 * A PURE TAR WALK, NO `tar` BINARY: the archive is operator-supplied but still
 * untrusted bytes, and a system `tar` would honour every entry type it
 * understands. This reads 512-byte ustar/pax/gnu headers and writes ONLY:
 *  - REGULAR files,
 *  - at `<name>` or `<one-top-dir>/<name>`,
 *  - named `ontology.json` or `<tld>.copy.gz` (`^[a-z_]{2,}\.copy\.gz$`),
 * each through confinedPath under the destination. Directories, pax/gnu
 * extension headers, AppleDouble `._*` files and any other name are IGNORED
 * (reported). REFUSED (install.invalid_input, nothing kept): an absolute path,
 * a `..` segment, a link or device entry, a duplicate name, more than
 * MAX_ARCHIVE_FILES extracted files or MAX_ARCHIVE_HEADERS headers walked, more
 * than MAX_DECOMPRESSED_BYTES written, an archive over MAX_ARCHIVE_BYTES, a
 * header whose checksum does not match.
 *
 * TWO COUNTS, NOT ONE: an archive of a whole server export version directory
 * (the documented offline form) carries a directory entry, often a pax header
 * per file and a `recovery/` subtree — ~240 headers for today's 7.0 export
 * alone. The FILE cap bounds what is written (wanted files only); the HEADER
 * cap only bounds the walk and the ignored list, so it sits far above any real
 * export. Gate: test/unit/install_ontology_archive.test.ts (the vendored
 * export, archived by the system tar, resolves).
 */

import { closeSync, mkdirSync, openSync, readSync, rmSync, statSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import {
	confinedPath,
	gunzipWithCaps,
	MAX_DECOMPRESSED_BYTES,
} from '../ontology/data_io_import.ts';
import { refuseInstall } from './refuse.ts';

/** The archive file itself (compressed or not). */
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
/** Files EXTRACTED (ontology.json + `<tld>.copy.gz` — ignored entries never count). */
export const MAX_ARCHIVE_FILES = 4096;
/** Headers walked (every entry type counts — bounds the walk, not the export's size). */
export const MAX_ARCHIVE_HEADERS = 50_000;

const BLOCK = 512;
const COPY_CHUNK = 1024 * 1024;
const WANTED_RE = /^(?:ontology\.json|[a-z_]{2,}\.copy\.gz)$/;
const REGULAR: ReadonlySet<string> = new Set(['0', '\0']);
const IGNORED_TYPES: ReadonlySet<string> = new Set(['5', 'x', 'g', 'L', 'K']);

interface TarHeader {
	path: string;
	type: string;
	size: number;
}

interface ArchiveWalk {
	fd: number;
	destDir: string;
	files: string[];
	ignored: string[];
	written: number;
	entries: number;
}

function refuseArchive(detail: string): never {
	refuseInstall('install.invalid_input', `--ontology-source archive: ${detail}`);
}

/** A NUL-terminated header field. */
function field(block: Buffer, start: number, length: number): string {
	const raw = block.subarray(start, start + length);
	const end = raw.indexOf(0);
	return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
}

/** An octal header number (a base-256 or garbage size is refused). */
function octal(block: Buffer, start: number, length: number): number {
	const text = field(block, start, length).trim();
	if (!/^[0-7]*$/.test(text)) refuseArchive('a header carries a size that is not octal');
	return text === '' ? 0 : Number.parseInt(text, 8);
}

/** The ustar checksum: every header byte, the checksum field counted as spaces. */
function checksumMatches(block: Buffer): boolean {
	let sum = 0;
	for (let index = 0; index < BLOCK; index++) {
		sum += index >= 148 && index < 156 ? 32 : (block[index] as number);
	}
	return sum === octal(block, 148, 8);
}

/** One header block → its entry (null = the end-of-archive zero block). */
function parseHeader(block: Buffer): TarHeader | null {
	if (block.every((byte) => byte === 0)) return null;
	if (!checksumMatches(block))
		refuseArchive('not a tar archive (a header checksum does not match)');
	const name = field(block, 0, 100);
	const prefix = field(block, 345, 155);
	return {
		path: prefix === '' ? name : `${prefix}/${name}`,
		type: field(block, 156, 1) || '\0',
		size: octal(block, 124, 12),
	};
}

/** The entry's file name when its path is acceptable (<name> or <top>/<name>); refuses unsafe paths. */
function entryName(path: string): string {
	if (path.startsWith('/')) refuseArchive(`absolute path '${path}' refused`);
	const segments = path
		.replace(/^\.\//, '')
		.split('/')
		.filter((segment) => segment !== '');
	if (segments.includes('..')) refuseArchive(`'..' in path '${path}' refused`);
	return segments.length <= 2 ? (segments[segments.length - 1] ?? '') : '';
}

function readBlock(walk: ArchiveWalk, offset: number): Buffer {
	const block = Buffer.alloc(BLOCK);
	readSync(walk.fd, block, 0, BLOCK, offset);
	return block;
}

/** Copy `size` bytes at `offset` of the archive into `target` (chunked, never the whole entry in memory). */
function copyEntry(walk: ArchiveWalk, offset: number, size: number, target: string): void {
	const out = openSync(target, 'wx', 0o600);
	const chunk = Buffer.alloc(COPY_CHUNK);
	try {
		for (let done = 0; done < size; ) {
			const read = readSync(walk.fd, chunk, 0, Math.min(COPY_CHUNK, size - done), offset + done);
			if (read === 0) refuseArchive('the archive is truncated');
			writeSync(out, chunk, 0, read);
			done += read;
		}
	} finally {
		closeSync(out);
	}
}

/** Write one wanted regular entry (duplicates and the byte ceiling refused). */
function extractEntry(walk: ArchiveWalk, header: TarHeader, name: string, offset: number): void {
	const target = confinedPath(walk.destDir, name);
	if (target === null) refuseArchive(`unconfined entry name '${name}'`);
	if (walk.files.includes(name)) refuseArchive(`'${name}' appears twice`);
	if (walk.files.length >= MAX_ARCHIVE_FILES)
		refuseArchive(`more than ${MAX_ARCHIVE_FILES} ontology files`);
	walk.written += header.size;
	if (walk.written > MAX_DECOMPRESSED_BYTES)
		refuseArchive('the extracted files exceed the size cap');
	copyEntry(walk, offset, header.size, target);
	walk.files.push(name);
}

/** Decide one entry: extract, ignore, or refuse its type. */
function handleEntry(walk: ArchiveWalk, header: TarHeader, offset: number): void {
	if (IGNORED_TYPES.has(header.type)) return;
	if (!REGULAR.has(header.type)) {
		refuseArchive(`entry '${header.path}' is a link or device (type '${header.type}') — refused`);
	}
	const name = entryName(header.path);
	if (WANTED_RE.test(name)) extractEntry(walk, header, name, offset);
	else walk.ignored.push(header.path);
}

/** Walk every header of the (uncompressed) tar at `tarPath`. */
function walkTar(walk: ArchiveWalk, tarSize: number): void {
	for (let offset = 0; offset + BLOCK <= tarSize; ) {
		const header = parseHeader(readBlock(walk, offset));
		if (header === null) return;
		walk.entries += 1;
		if (walk.entries > MAX_ARCHIVE_HEADERS)
			refuseArchive(`more than ${MAX_ARCHIVE_HEADERS} entries`);
		handleEntry(walk, header, offset + BLOCK);
		offset += BLOCK + Math.ceil(header.size / BLOCK) * BLOCK;
	}
}

/** Is the file gzip-compressed (magic 1f 8b)? */
function isGzip(path: string): boolean {
	const fd = openSync(path, 'r');
	const magic = Buffer.alloc(2);
	try {
		readSync(fd, magic, 0, 2, 0);
	} finally {
		closeSync(fd);
	}
	return magic[0] === 0x1f && magic[1] === 0x8b;
}

/** The archive as a plain tar path (gunzipped under the shared caps into `workDir` when compressed). */
async function plainTar(archivePath: string, workDir: string): Promise<string> {
	if (!isGzip(archivePath)) return archivePath;
	const tarPath = join(workDir, 'archive.tar');
	try {
		await gunzipWithCaps(archivePath, tarPath);
	} catch (error) {
		refuseArchive(`cannot decompress (${(error as Error).message})`);
	}
	return tarPath;
}

/**
 * Extract the ontology files of a tar archive into `destDir` (created). Answers
 * the written names and the ignored entries; any refusal throws
 * install.invalid_input and removes `destDir`'s partial content.
 */
export async function extractOntologyArchive(
	archivePath: string,
	destDir: string,
): Promise<{ files: string[]; ignored: string[] }> {
	if (statSync(archivePath).size > MAX_ARCHIVE_BYTES) refuseArchive('the archive exceeds 512 MiB');
	mkdirSync(destDir, { recursive: true, mode: 0o700 });
	const workDir = join(destDir, '.archive');
	mkdirSync(workDir, { recursive: true, mode: 0o700 });
	try {
		const tarPath = await plainTar(archivePath, workDir);
		const walk: ArchiveWalk = {
			fd: openSync(tarPath, 'r'),
			destDir,
			files: [],
			ignored: [],
			written: 0,
			entries: 0,
		};
		try {
			walkTar(walk, statSync(tarPath).size);
		} finally {
			closeSync(walk.fd);
		}
		return { files: walk.files, ignored: walk.ignored };
	} catch (error) {
		rmSync(destDir, { recursive: true, force: true });
		throw error;
	} finally {
		rmSync(workDir, { recursive: true, force: true });
	}
}
