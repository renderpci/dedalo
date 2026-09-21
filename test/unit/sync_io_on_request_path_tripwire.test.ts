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
 *
 * SECOND CLASS — THE DIRECTORY WALK (audit PERF-13, added with it). A metadata
 * syscall is O(1) and stays legal above; a metadata syscall IN A LOOP is not,
 * because its cost scales with the DIRECTORY. `get_dedalo_files` — the service
 * worker's pre-cache manifest, on an AUTHENTICATED request path — walked the
 * whole client tree with `readdirSync` and then `statSync`'d every manifested
 * file, thousands of blocking syscalls, once per requesting browser. It is a
 * frozen boot-time manifest now (`core/api/dedalo_files.ts`), and the census
 * below is what keeps the shape from coming back somewhere else. Its detector
 * is deliberately NARROWER than "the module calls readdirSync": with brace
 * tracking it counts only the calls INSIDE a `for`/`while` body — the per-file
 * stat loop and the directory walk — which is 16 files instead of 44, and a
 * ledger of 44 justifications is one nobody reads.
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

/**
 * THE WALK LEDGER (second detector class — see the header). Every reachable
 * module that makes a metadata syscall INSIDE A LOOP, with the reason its cost
 * is not paid per served request. Shrink-only, and a stale entry is RED.
 * Measured at the PERF-13 fix: 16 files, 20 calls.
 */
const WALK_CEILING_FILES = 16;
const WALK_CEILING_CALLS = 20;

const WALK_EXEMPTIONS: { file: string; reason: string }[] = [
	{
		file: 'src/core/api/dedalo_files.ts',
		reason:
			'THE PERF-13 CONVERSION: the client-tree walk and its per-file stat now run ONCE, at boot, into a frozen manifest (prewarmDedaloFilesManifest); a served get_dedalo_files reads the frozen result. Dev mode recomputes per call on purpose — that is where client files change under a running server',
	},
	{
		file: 'src/core/area_maintenance/backup.ts',
		reason:
			'lists the backup directory to date the artifacts for the maintenance panel; operator-driven, and bounded by the number of backup files, not by the collection',
	},
	{
		file: 'src/core/install/media_tree.ts',
		reason:
			'probes the media tree layout during installation and the maintenance media probe — a fixed set of quality folders, off every served data path',
	},
	{
		file: 'src/core/media/file_ops.ts',
		reason:
			"collects the existing quality files of ONE record's media during duplication or delete; bounded by that record's qualities and extensions",
	},
	{
		file: 'src/core/media/ingest/staged_files.ts',
		reason:
			"lists the CALLER'S OWN staging directory to answer list_uploaded_files; bounded by that user's staged files, which is the answer being asked for",
	},
	{
		file: 'src/core/media/ingest/staged_name_record.ts',
		reason:
			'sweeps the same staging directory by mtime to drop stale display-name sidecars; bounded by that one directory',
	},
	{
		file: 'src/core/media/ingest/staging_gc.ts',
		reason:
			"the staging garbage sweep: ages one user's upload artifacts; a maintenance pass over a directory whose size the uploader controls, not the archive",
	},
	{
		file: 'src/core/media/ingest/upload.ts',
		reason:
			'sums the parts of ONE in-flight transfer to enforce the assembled-size ceiling; bounded by the chunks of that upload, and the size gate has to see them',
	},
	{
		file: 'src/core/media/jobs.ts',
		reason:
			'lists the media job store to date the job records; bounded by the jobs on file, on an operator/poll path rather than the read path',
	},
	{
		file: 'src/core/tools/loader.ts',
		reason:
			'enumerates the tool root directory during tool discovery — a fixed ~36-entry directory, walked while the loader builds its process-wide table',
	},
	{
		file: 'src/core/tools/paths.ts',
		reason:
			'lists the tool root to resolve the tool directories; the roots are memoized for the life of the process, so a served request does not repeat it',
	},
	{
		file: 'src/core/tools/register.ts',
		reason:
			'walks the tool roots while SYNCHRONISING the dd1324 tool registry — an operator/boot registration action over the same fixed directory',
	},
	{
		file: 'src/core/update/code_manifest.ts',
		reason:
			'walks the release directory to build the update manifest; an operator-driven update action over the release artifacts',
	},
	{
		file: 'src/core/update/code_update.ts',
		reason:
			'walks the candidate code tree during a code update and its rollback; operator-driven, and it ends in a planned restart',
	},
	{
		file: 'src/core/update/status.ts',
		reason:
			'lists the restore-point and archive directories for the update panel; an admin panel read, off the served data path',
	},
	{
		file: 'src/diffusion/writers/rdf.ts',
		reason:
			'merges the part files of a FINISHED diffusion run into one document; a background publication job, never a served request',
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

/**
 * Every metadata syscall made INSIDE A LOOP body — the walk class. Brace
 * tracking, not a whole-file grep: a `statSync` at the top of a function costs
 * one syscall, the same call inside a `for` costs one PER ENTRY, and only the
 * second is what this class is about.
 */
const WALK_CALLS = ['readdirSync', 'statSync', 'lstatSync'] as const;
const WALK_RE = new RegExp(`\\b(${WALK_CALLS.join('|')})\\s*\\(`, 'g');
const LOOP_RE = /\b(for|while)\s*\(/;

function walkCallsIn(source: string): { name: string; line: number }[] {
	const hits: { name: string; line: number }[] = [];
	let depth = 0;
	const loopDepths: number[] = [];
	const lines = stripComments(source).split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		const isLoop = LOOP_RE.test(line);
		if (!/^\s*(import|export)\b/.test(line) && loopDepths.length > 0) {
			for (const match of line.matchAll(WALK_RE)) {
				hits.push({ name: match[1] as string, line: i + 1 });
			}
		}
		const opens = (line.match(/\{/g) ?? []).length;
		const closes = (line.match(/\}/g) ?? []).length;
		if (isLoop && opens > 0) loopDepths.push(depth + 1);
		depth += opens - closes;
		while (loopDepths.length > 0 && depth < (loopDepths[loopDepths.length - 1] as number)) {
			loopDepths.pop();
		}
	}
	return hits;
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

/** file (repo-relative) -> loop-scoped metadata syscalls (the walk class). */
const WALK_OFFENDERS = new Map<string, { name: string; line: number }[]>();
for (const absolute of REACHABLE) {
	const hits = walkCallsIn(readFileSync(absolute, 'utf8'));
	if (hits.length > 0) WALK_OFFENDERS.set(absolute.slice(REPO_ROOT.length + 1), hits);
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

describe('directory walks on the request path (PERF-13): the second class', () => {
	test('the walk detector really matched something (corpus floor)', () => {
		const total = [...WALK_OFFENDERS.values()].reduce((sum, hits) => sum + hits.length, 0);
		expect(WALK_OFFENDERS.size).toBeGreaterThanOrEqual(10);
		expect(total).toBeGreaterThanOrEqual(15);
	});

	test('positive control — a per-file stat loop and a walk are flagged', () => {
		const planted = [
			'for (const name of readdirSync(dir)) {',
			'  const info = statSync(join(dir, name));',
			'  total += info.size;',
			'}',
		].join('\n');
		expect(walkCallsIn(planted).map((hit) => hit.name)).toEqual(['statSync']);
		const nested = [
			'while (queue.length > 0) {',
			'  entries = readdirSync(queue.pop());',
			'}',
		].join('\n');
		expect(walkCallsIn(nested).map((hit) => hit.name)).toEqual(['readdirSync']);
	});

	test('negative control — a ONE-SHOT metadata syscall is not a walk', () => {
		const single = [
			'function sizeOf(path) {',
			'  const info = statSync(path);',
			'  return info.size;',
			'}',
			'const entries = readdirSync(dir);',
		].join('\n');
		expect(walkCallsIn(single)).toEqual([]);
	});

	test('negative control — a loop that has CLOSED does not capture later calls', () => {
		const source = [
			'for (const x of xs) {',
			'  touch(x);',
			'}',
			'const info = statSync(path);',
		].join('\n');
		expect(walkCallsIn(source)).toEqual([]);
	});

	test('no module outside the walk ledger walks a directory on the request path', () => {
		const exempt = new Set(WALK_EXEMPTIONS.map((entry) => entry.file));
		const unexempted = [...WALK_OFFENDERS.entries()]
			.filter(([file]) => !exempt.has(file))
			.map(([file, hits]) => `${file} (${hits.map((h) => `${h.name}@${h.line}`).join(', ')})`);
		expect(
			unexempted,
			`A metadata syscall inside a LOOP on a module reachable from the dispatch or route table: its cost scales with the DIRECTORY, and Bun serves every request from one event loop. Compute it ONCE (a boot-time frozen answer, as core/api/dedalo_files.ts now does for the client manifest), move it off the request path, or add it to WALK_EXEMPTIONS with the reason its cost is not paid per served request: ${unexempted.join(' | ')}`,
		).toEqual([]);
	});

	test('every walk-ledger entry still walks (a stale exemption is RED)', () => {
		const stale = WALK_EXEMPTIONS.filter((entry) => !WALK_OFFENDERS.has(entry.file)).map(
			(entry) => entry.file,
		);
		expect(
			stale,
			`These files no longer make a loop-scoped metadata syscall. DELETE their entries — the ledger is shrink-only: ${stale.join(', ')}`,
		).toEqual([]);
	});

	test('the walk ledger only ever shrinks, and every entry carries a reason', () => {
		expect(WALK_EXEMPTIONS.length).toBeLessThanOrEqual(WALK_CEILING_FILES);
		const exempt = new Set(WALK_EXEMPTIONS.map((entry) => entry.file));
		const exemptCalls = [...WALK_OFFENDERS.entries()]
			.filter(([file]) => exempt.has(file))
			.reduce((sum, [, hits]) => sum + hits.length, 0);
		expect(exemptCalls).toBeLessThanOrEqual(WALK_CEILING_CALLS);
		expect(WALK_CEILING_CALLS - exemptCalls).toBeLessThan(5);
		const files = WALK_EXEMPTIONS.map((entry) => entry.file);
		expect(new Set(files).size).toBe(files.length);
		for (const entry of WALK_EXEMPTIONS) {
			expect(
				entry.reason.trim().length,
				`${entry.file}: the reason must SAY why the walk is not paid per served request`,
			).toBeGreaterThanOrEqual(40);
		}
	});

	test('the PERF-13 conversion is pinned: the manifest is frozen at boot', () => {
		// The behavioural half is dedalo_files_manifest_native.test.ts (it counts
		// the walks). Here: the module still exposes the boot seam server.ts calls,
		// and the server still calls it — a walk moved off the request path only if
		// something warms it.
		const manifest = readFileSync(resolve(REPO_ROOT, 'src/core/api/dedalo_files.ts'), 'utf8');
		expect(manifest).toContain('export function prewarmDedaloFilesManifest(');
		const server = readFileSync(resolve(REPO_ROOT, 'src/server.ts'), 'utf8');
		expect(server).toContain('prewarmDedaloFilesManifest()');
	});
});
