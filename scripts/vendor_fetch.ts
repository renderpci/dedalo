/**
 * VENDOR BUMP — download an upstream archive, REFUSE unless its sha256 is the one
 * the operator stated, and only then replace `vendor/<lib>/`.
 *
 * WHY THE EXPECTED DIGEST IS MANDATORY AND POSITIONAL. Vendoring exists because a
 * lib cannot be package-manager tracked; the price is that nothing verifies the
 * download for us. "Fetch and trust TLS" is exactly the property this whole change
 * removed from `xlsx` (a CDN tarball URL in package.json, no integrity in
 * bun.lock, re-fetched unverified on every code update). So this script has no
 * "just fetch it" mode: without `--sha256=<expected>` it refuses and prints the
 * digest it WOULD have accepted, which is the two-step a human can audit — read the
 * digest the upstream project publishes, run the command with it, compare.
 *
 * A digest the operator copied from the same page as the download is weak
 * provenance and this script cannot fix that. What it does guarantee: the bytes
 * that land in the repo are the bytes whose digest is recorded in
 * `vendor/vendor_manifest.json`, and any later drift is caught by
 * `scripts/vendor_verify.ts`.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: pick the trim set. Every vendored tree here is
 * trimmed (pdfjs drops 10 MB of sourcemaps and a demo PDF; xlsx keeps one .mjs and
 * a LICENSE), and which files are dead weight is a judgement about what the CLIENT
 * loads — the `--keep` globs make it an explicit argument instead of a silent
 * default. After the swap it prints the exact follow-up: rewrite the digests, set
 * `reviewed`, run the gates.
 *
 * Usage:
 *   bun run scripts/vendor_fetch.ts --lib xlsx --version 0.20.4 \
 *       --url https://cdn.sheetjs.com/xlsx-0.20.4/xlsx-0.20.4.tgz \
 *       --sha256 <expected> [--keep 'xlsx.mjs' --keep 'LICENSE'] [--strip 1]
 *
 * Supported archives: .tgz/.tar.gz and .zip (extracted with the system `tar`/`unzip`
 * — no in-repo archive parser, which is machinery this needs once per year).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listVendorDirs, REPO_ROOT, treeDigest, VENDOR_ROOT } from './vendor_verify.ts';

/** `--flag value` / `--flag=value`; `--keep` may repeat. */
function parseArgs(argv: string[]): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i] ?? '';
		if (!token.startsWith('--')) continue;
		const eq = token.indexOf('=');
		const key = eq === -1 ? token.slice(2) : token.slice(2, eq);
		const value = eq === -1 ? (argv[++i] ?? '') : token.slice(eq + 1);
		out.set(key, [...(out.get(key) ?? []), value]);
	}
	return out;
}

function fail(message: string): never {
	console.error(`== vendor_fetch: REFUSED — ${message}`);
	process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const lib = args.get('lib')?.[0] ?? '';
const version = args.get('version')?.[0] ?? '';
const url = args.get('url')?.[0] ?? '';
const expected = (args.get('sha256')?.[0] ?? '').toLowerCase();
const keep = args.get('keep') ?? [];
const strip = Number(args.get('strip')?.[0] ?? '1');

if (lib === '' || version === '' || url === '') {
	fail('--lib, --version and --url are all required (see the header for the full form).');
}
if (!/^[a-z0-9][a-z0-9._-]*$/.test(lib)) fail(`--lib "${lib}" is not a plain directory name.`);
if (!url.startsWith('https://')) fail('--url must be https:// — an archive is code we will serve.');

// The download is a temporary file OUTSIDE vendor/, so a refused fetch can never
// leave a half-extracted tree where the verifier expects a vendored lib.
const workRoot = join(REPO_ROOT, '.vendor_fetch_tmp');
rmSync(workRoot, { recursive: true, force: true });
mkdirSync(workRoot, { recursive: true });

console.log(`== vendor_fetch: GET ${url}`);
const response = await fetch(url);
if (!response.ok) fail(`download failed — HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const actual = createHash('sha256').update(bytes).digest('hex');
console.log(`   ${bytes.length} bytes, sha256 ${actual}`);

if (expected === '') {
	rmSync(workRoot, { recursive: true, force: true });
	fail(
		'no --sha256 given, so nothing was written.\n' +
			`   The archive that WOULD have been used hashes to:\n      ${actual}\n` +
			'   Check that against the digest the upstream project publishes, then re-run with\n' +
			`      --sha256 ${actual}`,
	);
}
if (actual !== expected) {
	rmSync(workRoot, { recursive: true, force: true });
	fail(
		`sha256 MISMATCH — nothing was written.\n      expected ${expected}\n      got      ${actual}\n` +
			'   Either the upstream artefact was replaced (a release should be immutable) or the\n' +
			'   download was tampered with. Do not "just update the expected digest".',
	);
}

const isZip = url.endsWith('.zip');
const archivePath = join(workRoot, isZip ? 'archive.zip' : 'archive.tgz');
writeFileSync(archivePath, bytes);
const extractRoot = join(workRoot, 'extract');
mkdirSync(extractRoot, { recursive: true });

const command = isZip
	? ['unzip', '-q', archivePath, '-d', extractRoot]
	: ['tar', 'xzf', archivePath, '-C', extractRoot, `--strip-components=${strip}`];
const proc = Bun.spawnSync(command, { stdout: 'inherit', stderr: 'inherit' });
if (proc.exitCode !== 0) fail(`extraction failed (${command[0]} exit ${proc.exitCode}).`);

// The trim. `--keep` is relative to the extracted root; with no --keep the whole
// archive is vendored, which is a decision the operator makes by omission and sees
// in the printed file count.
const staged = join(workRoot, 'staged');
mkdirSync(staged, { recursive: true });
if (keep.length === 0) {
	renameSync(extractRoot, staged);
} else {
	for (const relative of keep) {
		const from = join(extractRoot, relative);
		if (!existsSync(from)) fail(`--keep "${relative}" is not in the archive.`);
		const to = join(staged, relative);
		mkdirSync(join(to, '..'), { recursive: true });
		renameSync(from, to);
	}
}

const target = join(VENDOR_ROOT, lib);
const replacing = listVendorDirs().includes(lib);
rmSync(target, { recursive: true, force: true });
renameSync(staged, target);
rmSync(workRoot, { recursive: true, force: true });

const { digest, files } = treeDigest(target);
console.log(
	`\n== vendor_fetch: ${replacing ? 'REPLACED' : 'CREATED'} vendor/${lib}/ — ${files} files\n` +
		`   tree_sha256 ${digest}\n\n` +
		'Now, by hand (these are curated fields, not derived ones):\n' +
		`   1. vendor/vendor_manifest.json → "${lib}": version "${version}", upstream "${url}",\n` +
		`      archive_sha256 "${actual}", reviewed "${new Date().toISOString().slice(0, 10)}", and a\n` +
		'      note saying what was trimmed and WHY this lib cannot come from a package manager.\n' +
		'   2. bun run scripts/vendor_verify.ts --write   (fills tree_sha256 + files)\n' +
		'   3. bun test test/unit/dependency_integrity_tripwire.test.ts test/unit/client_libs_tripwire.test.ts\n' +
		'   4. bun run test:client, then smoke-test the component that loads it.\n' +
		'   5. Update the version table in docs/development/vendored_library_versions.md.',
);

// Read back: prove the manifest is now the thing that is stale, not the tree.
const manifestPath = join(VENDOR_ROOT, 'vendor_manifest.json');
if (existsSync(manifestPath) && !readFileSync(manifestPath, 'utf-8').includes(digest)) {
	console.log('\n   (vendor_verify is RED until step 2 — that is the intended state.)');
}
