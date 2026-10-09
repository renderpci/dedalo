/**
 * THE OFFLINE ARCHIVE OF A REAL EXPORT (installer unification A6 —
 * src/core/install/ontology_archive.ts): the documented offline form, "an
 * archive of one export version directory", must resolve for an export of
 * realistic size. The vendored install/import/ontology/<major.minor> IS such an
 * export (two hundred-odd files + a recovery/ subtree), so it is archived here
 * by the SYSTEM tar — directory entries, pax headers and all — and resolved
 * through the same door the installer uses.
 *
 * WHAT IS MEASURED (outcomes):
 *  - every wanted file of the directory (ontology.json + each top-level
 *    `<tld>.copy.gz`) is extracted, nothing else;
 *  - the archive and the plain directory resolve to the SAME catalog
 *    (resolveOntologyCatalog — local source);
 *  - IGNORED entries never count against a limit: a system-tar archive whose
 *    ignored entries alone exceed the retired single cap (256 headers, every
 *    type counted) still extracts its wanted files — the shape a growing
 *    export (and a recovery/ subtree, and per-file pax headers) takes;
 *  - the FILE cap still refuses: one wanted file over MAX_ARCHIVE_FILES is
 *    install.invalid_input naming the cap.
 * Hermetic: no database, no network.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDedaloError } from '../../src/core/errors/index.ts';
import {
	extractOntologyArchive,
	MAX_ARCHIVE_FILES,
} from '../../src/core/install/ontology_archive.ts';
import { resolveOntologyCatalog } from '../../src/core/install/ontology_catalog.ts';
import { buildOntologyUpdateInfo } from '../../src/core/ontology/data_io_import.ts';
import { DEDALO_VERSION_MAJOR_MINOR } from '../../src/core/update/version.ts';

const EXPORT_ROOT = resolve(import.meta.dir, '../../install/import/ontology');
const VERSION_DIR = join(EXPORT_ROOT, DEDALO_VERSION_MAJOR_MINOR);
/** The old single cap (every header counted) this archive must now pass. */
const OLD_HEADER_CAP = 256;

const roots: string[] = [];

function scratch(name: string): string {
	const dir = mkdtempSync(join(tmpdir(), `zzarc_${name}_`));
	roots.push(dir);
	return dir;
}

/** The system tar's archive of the vendored export version directory. */
function archiveOfExport(): string {
	const archive = join(scratch('archive'), 'ontology_export.tgz');
	const tar = spawnSync('tar', ['-czf', archive, '-C', EXPORT_ROOT, DEDALO_VERSION_MAJOR_MINOR]);
	expect(tar.status, String(tar.stderr)).toBe(0);
	return archive;
}

/** Entries in the archive as the system tar lists them (directories included). */
function listedEntries(archive: string): number {
	const listed = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
	expect(listed.status, listed.stderr).toBe(0);
	return listed.stdout.split('\n').filter((line) => line !== '').length;
}

/** A hand-built ustar of empty regular files (the file-cap case: no system tar needed). */
function ustarOfEmptyFiles(names: readonly string[]): Buffer {
	const blocks: Buffer[] = [];
	for (const name of names) {
		const header = Buffer.alloc(512);
		header.write(name, 0, 100, 'utf8');
		header.write('0000644\0', 100);
		header.write('0000000\0', 108);
		header.write('0000000\0', 116);
		header.write('00000000000\0', 124);
		header.write('00000000000\0', 136);
		header.write('0', 156);
		header.write('ustar\0', 257);
		header.write('00', 263);
		header.fill(' ', 148, 156);
		let sum = 0;
		for (const byte of header) sum += byte;
		header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
		blocks.push(header);
	}
	blocks.push(Buffer.alloc(1024));
	return Buffer.concat(blocks);
}

/** `count` distinct TLD-shaped names (letters only — the wanted-name grammar). */
function tldNames(count: number): string[] {
	const names: string[] = [];
	for (let index = 0; names.length < count; index++) {
		let name = '';
		for (let rest = index; name.length < 3; rest = Math.floor(rest / 26)) {
			name = String.fromCharCode(97 + (rest % 26)) + name;
		}
		names.push(`zz${name}`);
	}
	return names;
}

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('an archive of a real ontology export version directory', () => {
	const archive = archiveOfExport();

	test('every wanted top-level file is extracted, nothing else', async () => {
		// The WANTED set is the engine's own reading of the plain directory — the
		// manifest a master serves for it (buildOntologyUpdateInfo: ontology.json +
		// one entry per top-level `<tld>.copy.gz`) — so the archive must extract
		// exactly what the directory form offers, through no walk of this gate's own.
		const manifest = buildOntologyUpdateInfo(VERSION_DIR, 'file:///export').data;
		expect(manifest.info).not.toBeNull();
		const wanted = ['ontology.json', ...manifest.files.map((file) => `${file.tld}.copy.gz`)].sort();
		expect(wanted.length).toBeGreaterThan(100); // a realistic export, not a stub
		expect(wanted).toContain('ontology.json');
		expect(wanted).toContain('oh.copy.gz');
		const extracted = await extractOntologyArchive(archive, join(scratch('extract'), 'source'));
		expect([...extracted.files].sort()).toEqual(wanted);
	});

	test('the archive and the directory resolve to the same catalog', async () => {
		const fromDir = await resolveOntologyCatalog(
			{ kind: 'local', path: VERSION_DIR },
			{ allowedServers: [] },
		);
		const fromArchive = await resolveOntologyCatalog(
			{ kind: 'local', path: archive },
			{ allowedServers: [] },
		);
		try {
			const view = (entries: typeof fromDir.catalog.entries) =>
				entries.map((entry) => [entry.tld, entry.origin, entry.dependencies]);
			expect(view(fromArchive.catalog.entries)).toEqual(view(fromDir.catalog.entries));
			expect(fromArchive.catalog.entries.find((entry) => entry.tld === 'oh')?.origin).toBe('local');
			expect(fromArchive.catalog.entries.length).toBeGreaterThan(1);
		} finally {
			fromDir.cleanup();
			fromArchive.cleanup();
		}
	});
});

describe('the archive limits count what is written, not what is walked', () => {
	test('ignored entries beyond the retired 256-header cap never refuse', async () => {
		const root = scratch('ignored');
		const top = join(root, 'export');
		mkdirSync(join(top, 'recovery', 'snapshot'), { recursive: true });
		writeFileSync(join(top, 'ontology.json'), '{}');
		writeFileSync(join(top, 'zzab.copy.gz'), '');
		for (let index = 0; index < OLD_HEADER_CAP + 44; index++) {
			writeFileSync(join(top, 'recovery', 'snapshot', `zz${index}.copy`), '');
		}
		const archive = join(root, 'export.tgz');
		const tar = spawnSync('tar', ['-czf', archive, '-C', root, 'export']);
		expect(tar.status, String(tar.stderr)).toBe(0);
		expect(listedEntries(archive)).toBeGreaterThan(OLD_HEADER_CAP); // anti-vacuity
		const extracted = await extractOntologyArchive(archive, join(root, 'out'));
		expect([...extracted.files].sort()).toEqual(['ontology.json', 'zzab.copy.gz']);
		expect(extracted.ignored.length).toBeGreaterThan(OLD_HEADER_CAP);
	});

	test('one wanted file over MAX_ARCHIVE_FILES is refused', async () => {
		const root = scratch('files_cap');
		const archive = join(root, 'many.tar');
		const names = tldNames(MAX_ARCHIVE_FILES + 1).map((tld) => `${tld}.copy.gz`);
		expect(new Set(names).size).toBe(MAX_ARCHIVE_FILES + 1);
		writeFileSync(archive, ustarOfEmptyFiles(names));
		let refusal: unknown = null;
		try {
			await extractOntologyArchive(archive, join(root, 'out'));
		} catch (error) {
			refusal = error;
		}
		expect(isDedaloError(refusal) ? refusal.code : refusal).toBe('install.invalid_input');
		expect((refusal as Error).message).toContain(`more than ${MAX_ARCHIVE_FILES} ontology files`);
	});
});
