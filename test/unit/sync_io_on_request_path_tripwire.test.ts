/**
 * SYNCHRONOUS I/O ON THE REQUEST PATH — the whole install waits, one call at a
 * time (audit-2026-08-26 MEDIA-02 / P2-32).
 *
 * Bun serves every concurrent request from ONE event loop. A synchronous call
 * whose byte count scales with a FILE or a SUBPROCESS therefore does not slow
 * down its own request — it stops every other request on the installation for
 * the whole duration. `copyFileSync` on a heritage mesh or a scanned PDF is the
 * measured case: `media/processing.ts::copyToQuality` copied whole media files
 * synchronously on the upload path, and `media/file_ops.ts::duplicateMediaFiles`
 * did the same, once per quality × extension, on record duplication.
 *
 * THE DEFENCE FOR IT WAS A REAL CONCERN WITH A BACKWARDS REMEDY, which is why
 * this gate exists rather than a code comment: the sync copy was justified
 * in-comment as avoiding a floating rejection from an `unawaited` `regenerate3d`
 * at the ingest call site. A floating promise is fixed by awaiting it, or by an
 * explicit handler, AT THE CALL SITE — never by blocking the event loop. (The
 * measurement found every one of those call sites already awaited inside a
 * try/catch, so the premise was stale as well.)
 *
 * WHAT IS FORBIDDEN IS THE UNBOUNDED-BYTE CLASS ONLY: `copyFileSync`, `cpSync`,
 * `readFileSync`, `writeFileSync`, `appendFileSync`, `execSync`, `execFileSync`,
 * `spawnSync`, `globSync`, `scanSync`. Metadata syscalls — `existsSync`,
 * `statSync`, `mkdirSync`, `renameSync`, `unlinkSync`, `rmSync`, `readdirSync`,
 * `chmodSync`, `readlinkSync` — are O(1) and stay legal. Banning those too would
 * make the ledger below ~98 files of noise, and a ledger nobody can read enforces
 * nothing.
 *
 * THE CENSUS IS TOTAL AND DERIVED, never a hand list: the reachable set is the
 * closure of relative STATIC and DYNAMIC imports over the two root tables the
 * server dispatches through — `src/core/api/dispatch.ts` (the API action table)
 * and `src/server.ts` (the HTTP route table). The dynamic edge is load-bearing:
 * without it the closure is 367 modules instead of 623 and 23 of the 41 ledgered
 * files disappear, since the heavy admin subsystems (update, install, geoip,
 * diffusion writers) are reached exactly that way.
 *
 * THE LEDGER IS SHRINK-ONLY ON THREE LEGS: no file outside it may offend, the
 * file count and the call count may only fall, and an entry whose file no longer
 * offends is RED — a stale exemption is how a ledger stops describing the tree.
 *
 * HONEST LIMITS. (1) It pins STRUCTURE, not a duration: the stall this closes is
 * UNOBSERVABLE on this machine's APFS, where a file copy is a copy-on-write
 * clone that returns in 0 ms; the same copy measured 232 ms for 1 GB on NVMe,
 * and the SHIPPED path is Linux/ext4, which has no clone. A gate asserting
 * milliseconds would therefore pass on the developer's laptop for the wrong
 * reason. (2) It is a source scan: a sync call reached through a bare
 * identifier alias, or through a non-relative import, is invisible to it.
 * (3) Comments and `//`-suffixed lines are stripped before scanning, so prose
 * describing an anti-pattern is not a false positive — and a real call written
 * after a `//` on the same line would be missed with it.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { WRITE_PATH_CORPUS_FLOOR, writePathSourceFiles } from '../helpers/write_path_corpus.ts';

/** Repo root (this file lives in test/unit/). */
const REPO_ROOT = resolve(import.meta.dir, '..', '..');

/** The two tables every served request enters through. */
const ROOT_MODULES = ['src/core/api/dispatch.ts', 'src/server.ts'];

/**
 * The engine corpus the closure is MEASURED AGAINST — the shared write-path
 * lister (src/ + tools/ + scripts/, non-test), whose roots live in one place.
 * Without it the closure would only ever be compared with itself: a walk that
 * collapsed to a handful of modules, or one that stopped discriminating and
 * swallowed the whole tree, would both read as "the census is total".
 */
const ENGINE_CORPUS = writePathSourceFiles();

/**
 * The ONE reachable module outside the engine corpus: the boot migration
 * entrypoint the server imports out of `install/`. Written as an exact expected
 * set, so a closure that wandered anywhere else is a failure and not a wider
 * census.
 */
const REACHABLE_OUTSIDE_CORPUS = ['install/db/migrate.ts'];

/**
 * The forbidden class: a synchronous call whose cost scales with a file's bytes
 * or with a child process. See the header for why metadata syscalls are not here.
 */
const FORBIDDEN_SYNC_CALLS = [
	'copyFileSync',
	'cpSync',
	'readFileSync',
	'writeFileSync',
	'appendFileSync',
	'execSync',
	'execFileSync',
	'spawnSync',
	'globSync',
	'scanSync',
] as const;

const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN_SYNC_CALLS.join('|')})\\s*\\(`, 'g');

/** Floor on the derived reachable set — a closure that collapsed is not a census. */
const REACHABLE_MODULE_FLOOR = 500;

/** Floor on the total forbidden calls SEEN — a detector that stopped matching is not a scan. */
const SCANNED_CALL_FLOOR = 60;

/**
 * The shrink-only ledger. Every entry is a module on the reachable set that
 * still makes an unbounded-byte synchronous call, with the reason it is not on
 * the hot request path in the sense this gate is about. Measured at the MEDIA-02
 * fix: 41 files, 93 calls.
 *
 * NOTE what is NOT here: `src/core/media/processing.ts` and
 * `src/core/media/file_ops.ts`. They were the offenders this gate was written
 * for, and they were converted rather than exempted (see the pinning test at the
 * bottom).
 */
const CEILING_FILES = 41;
const CEILING_CALLS = 93;

const EXEMPTIONS: { file: string; reason: string }[] = [
	{
		file: 'src/config/catalog/media.ts',
		reason:
			'reads/writes the install state file (a few hundred bytes of JSON) at config resolution, not per request',
	},
	{
		file: 'src/config/env.ts',
		reason: 'reads ../private/.env ONCE at boot to build the typed config catalog',
	},
	{
		file: 'src/config/install_mode.ts',
		reason: 'reads the install-state JSON to decide whether the installer route is live; boot-time',
	},
	{
		file: 'src/core/ai/model_manifest.ts',
		reason:
			'reads and rewrites the small AI model manifest JSON during an operator-driven model download',
	},
	{
		file: 'src/core/ai/model_pins.ts',
		reason: 'parses the repo-owned model pin table ONCE at module load; a fixed committed file',
	},
	{
		file: 'src/core/area_maintenance/backup.ts',
		reason:
			'operator-driven backup/restore admin action: job record files, the log tail and pg_dump verification sidecars',
	},
	{
		file: 'src/core/geoip/download.ts',
		reason: 'operator-driven GeoIP database download and its sha sidecar; not a served request',
	},
	{
		file: 'src/core/geoip/reader.ts',
		reason:
			'loads the .mmdb into memory ONCE on first lookup and caches the reader; a per-request read would be the defect',
	},
	{
		file: 'src/core/install/config_persist.ts',
		reason: 'the installer writes ../private/.env and copies sample.env; runs once, before service',
	},
	{
		file: 'src/core/install/db_restore.ts',
		reason: 'the installer unpacks the seed dump to a temp .sql; runs once, before service',
	},
	{
		file: 'src/core/install/dir_probe.ts',
		reason: 'writes a zero-byte probe file to test directory writability during installation',
	},
	{
		file: 'src/core/install/hierarchy_import.ts',
		reason: 'the installer gunzips a repo-owned hierarchy definition file; runs once',
	},
	{
		file: 'src/core/install/hierarchy_meta.ts',
		reason: 'reads the small repo-owned hierarchy metadata JSON during installation',
	},
	{
		file: 'src/core/install/pg_bin.ts',
		reason: 'probes `psql --version` to locate the postgres binaries during installation',
	},
	{
		file: 'src/core/install/server_info.ts',
		reason: 'probes web-server binaries for their version banner on the installer report page',
	},
	{
		file: 'src/core/media/ingest/staged_name_record.ts',
		reason:
			"writes and reads the uploader's own file name — a fixed-size string of a few dozen bytes, best-effort beside an already-moved file",
	},
	{
		file: 'src/core/media/ingest/upload.ts',
		reason:
			'KNOWN-OPEN, the chunked-upload assembler: it writes the received blob and its part files synchronously on the request path — the one entry here that is a defect rather than a justification, kept visible instead of silent',
	},
	{
		file: 'src/core/media/jobs.ts',
		reason:
			'reads/writes one small job record JSON per transcode job in the media job store; bounded by the record, not by the media',
	},
	{
		file: 'src/core/media/protection.ts',
		reason:
			'generates the Apache/nginx rule files and the .publication markers on an operator-driven maintenance action',
	},
	{
		file: 'src/core/media/repair.ts',
		reason:
			'rewrites the drifted raster path inside an SVG overlay file — a text document, on the operator-driven repair sweep',
	},
	{
		file: 'src/core/media/svg_overlay.ts',
		reason:
			'reads and stages SVG overlay markup — a text document whose size is bounded by the annotation, not by the media',
	},
	{
		file: 'src/core/ontology/data_io_import.ts',
		reason: 'reads the import manifest and payload of an operator-driven ontology data import',
	},
	{
		file: 'src/core/ontology/ontology_update.ts',
		reason: 'writes the change list of an operator-driven ontology update to a report file',
	},
	{
		file: 'src/core/ontology/ontology_update_target.ts',
		reason: 'copies the gzipped ontology definition file into the update target; operator-driven',
	},
	{
		file: 'src/core/resolve/server_state.ts',
		reason: 'reads/writes the small server state JSON (install status, versions), not per request',
	},
	{
		file: 'src/core/update/boot_confirm.ts',
		reason: 'reads the code-update sentinel ONCE at boot to confirm or roll back the swap',
	},
	{
		file: 'src/core/update/build_stamp.ts',
		reason: 'reads the committed build_info.txt ONCE and caches it',
	},
	{
		file: 'src/core/update/channel.ts',
		reason: 'reads /proc/self/cgroup and mountinfo to detect the container channel; boot-time',
	},
	{
		file: 'src/core/update/code_build.ts',
		reason: 'hashes release artifacts while CUTTING a release; an operator-driven build action',
	},
	{
		file: 'src/core/update/code_manifest.ts',
		reason: 'reads the sha sidecar of a release artifact while verifying a manifest',
	},
	{
		file: 'src/core/update/code_restore.ts',
		reason:
			'reads version.ts, .bun-version and server.ts out of a candidate tree during a rollback',
	},
	{
		file: 'src/core/update/code_update.ts',
		reason:
			'the code updater itself: hashes the release, writes the sentinel/install stamp and the lock; an operator-driven update that ends in a planned restart',
	},
	{
		file: 'src/core/update/engine.ts',
		reason: 'appends update progress lines to the update log file; operator-driven update',
	},
	{
		file: 'src/core/update/install_stamp.ts',
		reason: 'reads the tree-local install_stamp.json ONCE and caches the identity it carries',
	},
	{
		file: 'src/core/update/smoke_boot.ts',
		reason: 'writes the smoke-boot result file of the quarantined tree; operator-driven update',
	},
	{
		file: 'src/core/update/status.ts',
		reason:
			'shells out to git and probes binaries to report the update panel status; an admin panel read, off the served data path',
	},
	{
		file: 'src/core/update/transform/definitions.ts',
		reason: 'reads the repo-owned transform definition JSONs applied during an update',
	},
	{
		file: 'src/diffusion/writers/files.ts',
		reason:
			'stages one generated diffusion export file; the diffusion run is a background operator-driven publication, not a served request',
	},
	{
		file: 'src/diffusion/writers/rdf.ts',
		reason: 'merges the RDF part files of a finished diffusion run into one document',
	},
	{
		file: 'src/diffusion/writers/xml.ts',
		reason: 'merges the XML part files of a finished diffusion run into one document',
	},
	{
		file: 'src/server.ts',
		reason: 'reads .bun-version ONCE at boot to report the runtime pin on /health',
	},
];

/** Strip block and line comments so prose about an anti-pattern is not a hit. */
function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.map((line) => line.replace(/\/\/.*$/, ''))
		.join('\n');
}

/** Every forbidden CALL SITE in `source` (import/export statements excluded). */
function forbiddenCallsIn(source: string): { name: string; line: number }[] {
	const hits: { name: string; line: number }[] = [];
	const lines = stripComments(source).split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		if (/^\s*(import|export)\b/.test(line)) continue;
		for (const match of line.matchAll(FORBIDDEN_RE)) {
			hits.push({ name: match[1] as string, line: i + 1 });
		}
	}
	return hits;
}

const STATIC_IMPORT_RE = /\bfrom\s*['"](\.[^'"]*)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"](\.[^'"]*)['"]\s*\)/g;

/**
 * The reachable set: close relative static + dynamic imports over the root
 * tables. `includeDynamic` exists so the gate's own mutation control can prove
 * the dynamic edge is load-bearing.
 */
function reachableModules(includeDynamic = true): string[] {
	const seen = new Set<string>();
	const queue = ROOT_MODULES.map((relative) => resolve(REPO_ROOT, relative));
	while (queue.length > 0) {
		const file = queue.pop() as string;
		if (seen.has(file) || !existsSync(file)) continue;
		seen.add(file);
		const source = readFileSync(file, 'utf8');
		const patterns = includeDynamic ? [STATIC_IMPORT_RE, DYNAMIC_IMPORT_RE] : [STATIC_IMPORT_RE];
		for (const pattern of patterns) {
			for (const match of source.matchAll(pattern)) {
				const target = resolve(dirname(file), match[1] as string);
				if (target.endsWith('.ts') && !seen.has(target)) queue.push(target);
			}
		}
	}
	return [...seen].sort();
}

const REACHABLE = reachableModules();

/** file (repo-relative) -> forbidden call sites, for every offending reachable module. */
const OFFENDERS = new Map<string, { name: string; line: number }[]>();
for (const absolute of REACHABLE) {
	const hits = forbiddenCallsIn(readFileSync(absolute, 'utf8'));
	if (hits.length > 0) OFFENDERS.set(absolute.slice(REPO_ROOT.length + 1), hits);
}

describe('sync I/O on the request path: the census is real', () => {
	test('the reachable set is derived from BOTH root tables and is large', () => {
		expect(REACHABLE.length).toBeGreaterThanOrEqual(REACHABLE_MODULE_FLOOR);
		for (const root of ROOT_MODULES) {
			expect(REACHABLE).toContain(resolve(REPO_ROOT, root));
		}
	});

	test('the closure is measured against the engine corpus, not against itself', () => {
		// The shared lister owns the roots; its own floor is what says the walk ran.
		expect(ENGINE_CORPUS.length).toBeGreaterThanOrEqual(WRITE_PATH_CORPUS_FLOOR);
		const corpus = new Set(ENGINE_CORPUS);
		const relative = REACHABLE.map((file) => file.slice(REPO_ROOT.length + 1));
		expect(relative.filter((file) => !corpus.has(file)).sort()).toEqual(REACHABLE_OUTSIDE_CORPUS);
		// A STRICT subset: the engine holds modules no served request reaches (the
		// CLI entrypoints, the installer, the scripts). A closure equal to the
		// corpus would mean the import walk stopped discriminating.
		expect(relative.length).toBeLessThan(ENGINE_CORPUS.length);
	});

	test('the DYNAMIC import edge is load-bearing (mutation control, in-gate)', () => {
		// Static-only closure: 367 modules, 23 of the ledgered files unreachable.
		// If this ever stopped being true the census would be silently narrower
		// than it claims, so the gate proves its own edge instead of asserting it.
		const staticOnly = reachableModules(false);
		expect(staticOnly.length).toBeLessThan(REACHABLE.length);
		const staticSet = new Set(staticOnly.map((f) => f.slice(REPO_ROOT.length + 1)));
		const dynamicOnlyOffenders = [...OFFENDERS.keys()].filter((f) => !staticSet.has(f));
		expect(dynamicOnlyOffenders.length).toBeGreaterThan(10);
	});

	test('the detector really matched something (corpus floor on call sites)', () => {
		const total = [...OFFENDERS.values()].reduce((sum, hits) => sum + hits.length, 0);
		expect(total).toBeGreaterThanOrEqual(SCANNED_CALL_FLOOR);
	});
});

describe('sync I/O on the request path: the detector', () => {
	test('positive control — a planted offender is flagged', () => {
		const planted = [
			'const bytes = copyFileSync(source, temp);',
			"const out = execFileSync('git', args);",
		].join('\n');
		const hits = forbiddenCallsIn(planted);
		expect(hits.map((h) => h.name).sort()).toEqual(['copyFileSync', 'execFileSync']);
	});

	test('negative control — metadata syscalls are NOT flagged', () => {
		const legal = [
			'if (!existsSync(dir)) mkdirSync(dir, { recursive: true });',
			'renameSync(temp, target); rmSync(temp, { force: true });',
			'const entries = readdirSync(dir); const info = statSync(path);',
		].join('\n');
		expect(forbiddenCallsIn(legal)).toEqual([]);
	});

	test('negative control — an import naming a forbidden call is NOT a call site', () => {
		const source = "import { copyFileSync, existsSync } from 'node:fs';\nexport { writeFileSync };";
		expect(forbiddenCallsIn(source)).toEqual([]);
	});

	test('negative control — prose describing the anti-pattern is NOT a call site', () => {
		const source = [
			'/** Never call copyFileSync( here — it blocks the loop. */',
			"const path = join(dir, 'x'); // was readFileSync(path)",
		].join('\n');
		expect(forbiddenCallsIn(source)).toEqual([]);
	});
});

describe('sync I/O on the request path: the shrink-only ledger', () => {
	test('no module outside the ledger makes an unbounded-byte synchronous call', () => {
		const exempt = new Set(EXEMPTIONS.map((entry) => entry.file));
		const unexempted = [...OFFENDERS.entries()]
			.filter(([file]) => !exempt.has(file))
			.map(([file, hits]) => `${file} (${hits.map((h) => `${h.name}@${h.line}`).join(', ')})`);
		expect(
			unexempted,
			`Synchronous unbounded-byte I/O on a module reachable from the dispatch table or the route table. Bun serves every request from ONE event loop, so this stalls the WHOLE installation for the length of the read/copy/spawn, not just its own request. Make it async (node:fs/promises, the async spawn) and handle the rejection AT THE CALL SITE — never keep it sync to avoid a floating promise, which is what src/core/media/processing.ts::copyToQuality did. If it genuinely is not on a served path, add it to EXEMPTIONS with its reason: ${unexempted.join(' | ')}`,
		).toEqual([]);
	});

	test('every ledger entry still offends (a stale exemption is RED)', () => {
		const stale = EXEMPTIONS.filter((entry) => !OFFENDERS.has(entry.file)).map((e) => e.file);
		expect(
			stale,
			`These files no longer make a forbidden synchronous call (or are no longer reachable). DELETE their entries — the ledger is shrink-only and a stale line stops it describing the tree: ${stale.join(', ')}`,
		).toEqual([]);
	});

	test('the ledger only ever shrinks (files and calls)', () => {
		expect(EXEMPTIONS.length).toBeLessThanOrEqual(CEILING_FILES);
		const exempt = new Set(EXEMPTIONS.map((entry) => entry.file));
		const exemptCalls = [...OFFENDERS.entries()]
			.filter(([file]) => exempt.has(file))
			.reduce((sum, [, hits]) => sum + hits.length, 0);
		expect(exemptCalls).toBeLessThanOrEqual(CEILING_CALLS);
		// And when the count falls, the ceiling must fall with it.
		expect(CEILING_CALLS - exemptCalls).toBeLessThan(5);
	});

	test('every entry is unique and carries a substantive reason', () => {
		const files = EXEMPTIONS.map((entry) => entry.file);
		expect(new Set(files).size).toBe(files.length);
		for (const entry of EXEMPTIONS) {
			expect(
				entry.reason.trim().length,
				`${entry.file}: the exemption reason must SAY why this call is not on a served request path`,
			).toBeGreaterThanOrEqual(40);
			expect(entry.reason.split(/\s+/).length, `${entry.file}: reason too terse`).toBeGreaterThan(
				6,
			);
		}
	});
});

describe('sync I/O on the request path: the MEDIA-02 conversion is pinned', () => {
	const MEDIA_COPY_MODULES = ['src/core/media/processing.ts', 'src/core/media/file_ops.ts'];

	test('the media copy modules are IN the reachable set (so the ban reaches them)', () => {
		const reachable = new Set(REACHABLE.map((f) => f.slice(REPO_ROOT.length + 1)));
		for (const file of MEDIA_COPY_MODULES) expect(reachable).toContain(file);
	});

	test('neither copies media bytes synchronously any more, and neither is exempted', () => {
		const exempt = new Set(EXEMPTIONS.map((entry) => entry.file));
		for (const file of MEDIA_COPY_MODULES) {
			expect(OFFENDERS.has(file), `${file} makes a forbidden synchronous call again`).toBe(false);
			expect(exempt.has(file), `${file} must be CONVERTED, never exempted`).toBe(false);
		}
	});

	test('the async copy really is async end to end (source shape)', () => {
		const processing = readFileSync(resolve(REPO_ROOT, 'src/core/media/processing.ts'), 'utf8');
		expect(processing).toContain('export async function copyToQuality(');
		expect(processing).toContain('export async function regenerate3d(');
		const fileOps = readFileSync(resolve(REPO_ROOT, 'src/core/media/file_ops.ts'), 'utf8');
		expect(fileOps).toContain('export async function duplicateMediaFiles(');
		// The ingest call site that the sync copy was defended by must AWAIT it.
		const ingest = readFileSync(
			resolve(REPO_ROOT, 'src/core/media/ingest/process_uploaded_file.ts'),
			'utf8',
		);
		expect(ingest).toContain('await regenerate3d(');
	});
});
