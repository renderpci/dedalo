/**
 * FETCH CLIENT LIBS — materialise the client libraries that no package manager
 * can supply, into `vendor/`.
 *
 * Runs as the package.json `postinstall` hook, so it fires everywhere `bun install`
 * already runs: a dev clone, CI, and deploy.sh's `bun install --frozen-lockfile
 * --production` on the host. Idempotent and cached — a second run is a no-op.
 *
 * Today that is exactly ONE lib, pdf.js. npm's `pdfjs-dist` ships the pdf.js
 * COMPONENT library (web/pdf_viewer.mjs); it does NOT ship the standalone viewer
 * app. component_pdf iframes `/dedalo/lib/pdfjs/web/viewer.html`, which only exists
 * in the `pdfjs-<version>-dist.zip` GitHub release — so we take it from Mozilla's
 * own release and pin it by sha256. (Verified 2026-07-12: the release is
 * byte-identical to the copy Dédalo had vendored.)
 *
 * The other non-npm libs (ckeditor, svgedit, json-view) are COMMITTED under
 * vendor/ — see src/core/client_libs/registry.ts for why each one has to be.
 *
 * Usage: bun run scripts/fetch_client_libs.ts [--force]
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const REPO_ROOT = resolve(import.meta.dir, '..');
const CACHE_DIR = join(REPO_ROOT, '.cache', 'client_libs');

interface FetchedLib {
	readonly id: string;
	readonly url: string;
	readonly sha256: string;
	readonly bytes: number;
	/** Destination, relative to the repo root. Must match CLIENT_LIBS[id].base. */
	readonly dest: string;
}

const FETCHED_LIBS: readonly FetchedLib[] = [
	{
		id: 'pdfjs',
		url: 'https://github.com/mozilla/pdf.js/releases/download/v5.7.284/pdfjs-5.7.284-dist.zip',
		sha256: '6d1b81252d76358df5831567d7d551f40ebae0cd8e0a554694bc4df0d3db8715',
		bytes: 6_526_209,
		dest: 'vendor/pdfjs',
	},
];

/** Name of the stamp file that records which sha256 a destination holds. */
const STAMP = '.dedalo_lib_stamp';

const force = Bun.argv.includes('--force');

function sha256(data: Uint8Array): string {
	return createHash('sha256').update(data).digest('hex');
}

// --- Minimal ZIP reader ------------------------------------------------------
// Deliberately dependency-free: no `unzip` binary (absent on minimal images), no
// npm zip package. Reads the central directory, inflates each entry. Store (0) and
// deflate (8) are the only methods a dist zip uses; anything else is a hard error.

interface ZipEntry {
	readonly name: string;
	readonly data: Uint8Array;
}

function readZip(buf: Buffer): ZipEntry[] {
	// End of Central Directory: scan back for the 0x06054b50 signature.
	let eocd = -1;
	for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd === -1) throw new Error('not a zip file (no end-of-central-directory record)');

	const entryCount = buf.readUInt16LE(eocd + 10);
	const cdOffset = buf.readUInt32LE(eocd + 16);
	if (cdOffset === 0xffffffff || entryCount === 0xffff) {
		throw new Error('zip64 archives are not supported');
	}

	const entries: ZipEntry[] = [];
	let p = cdOffset;
	for (let i = 0; i < entryCount; i++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory');
		const method = buf.readUInt16LE(p + 10);
		const compressedSize = buf.readUInt32LE(p + 20);
		const nameLen = buf.readUInt16LE(p + 28);
		const extraLen = buf.readUInt16LE(p + 30);
		const commentLen = buf.readUInt16LE(p + 32);
		const localOffset = buf.readUInt32LE(p + 42);
		const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
		p += 46 + nameLen + extraLen + commentLen;

		if (name.endsWith('/')) continue; // directory record

		// Local file header: the data starts after its own (differently sized) name+extra.
		if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`corrupt entry: ${name}`);
		const lNameLen = buf.readUInt16LE(localOffset + 26);
		const lExtraLen = buf.readUInt16LE(localOffset + 28);
		const dataStart = localOffset + 30 + lNameLen + lExtraLen;
		const raw = buf.subarray(dataStart, dataStart + compressedSize);

		let data: Uint8Array;
		if (method === 0) data = new Uint8Array(raw);
		else if (method === 8) data = new Uint8Array(inflateRawSync(raw));
		else throw new Error(`unsupported zip compression method ${method} for ${name}`);

		entries.push({ name, data });
	}
	return entries;
}

// --- Fetch + extract ---------------------------------------------------------

async function download(lib: FetchedLib): Promise<Buffer> {
	const cached = join(CACHE_DIR, `${lib.id}-${lib.sha256.slice(0, 12)}.zip`);
	if (existsSync(cached)) {
		const buf = readFileSync(cached);
		if (sha256(buf) === lib.sha256) return buf;
		rmSync(cached, { force: true }); // corrupt cache entry — refetch
	}

	console.log(`  downloading ${lib.url}`);
	const response = await fetch(lib.url);
	if (!response.ok) {
		throw new Error(`${lib.id}: download failed — HTTP ${response.status} ${response.statusText}`);
	}
	const buf = Buffer.from(await response.arrayBuffer());

	// Integrity is a HARD gate: a mismatch means we are not running the code we
	// pinned, so refuse rather than extract something unverified.
	const got = sha256(buf);
	if (got !== lib.sha256) {
		throw new Error(
			`${lib.id}: sha256 mismatch\n  expected ${lib.sha256}\n  got      ${got}\n  The upstream asset changed, or the download was tampered with. Refusing to extract.`,
		);
	}
	if (buf.length !== lib.bytes) {
		throw new Error(`${lib.id}: size mismatch — expected ${lib.bytes}, got ${buf.length}`);
	}

	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(cached, buf);
	return buf;
}

function extract(lib: FetchedLib, zip: Buffer): number {
	const destRoot = resolve(REPO_ROOT, lib.dest);
	rmSync(destRoot, { recursive: true, force: true });
	mkdirSync(destRoot, { recursive: true });

	let written = 0;
	for (const entry of readZip(zip)) {
		// zip-slip guard: an entry name must never escape the destination root.
		const target = resolve(destRoot, entry.name);
		if (target !== destRoot && !target.startsWith(destRoot + sep)) {
			throw new Error(`${lib.id}: zip entry escapes destination: ${entry.name}`);
		}
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, entry.data);
		written++;
	}
	writeFileSync(join(destRoot, STAMP), `${lib.sha256}\n`);
	return written;
}

async function main(): Promise<void> {
	for (const lib of FETCHED_LIBS) {
		const destRoot = resolve(REPO_ROOT, lib.dest);
		const stampPath = join(destRoot, STAMP);

		if (!force && existsSync(stampPath) && readFileSync(stampPath, 'utf8').trim() === lib.sha256) {
			console.log(`client_libs: ${lib.id} already at ${lib.sha256.slice(0, 12)} — skipping`);
			continue;
		}

		console.log(`client_libs: fetching ${lib.id} → ${lib.dest}`);
		const zip = await download(lib);
		const count = extract(lib, zip);
		console.log(`client_libs: ${lib.id} extracted (${count} files, sha256 verified)`);
	}
}

await main();
