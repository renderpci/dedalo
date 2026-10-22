/**
 * install_hierarchies — the installer's hierarchy step. For each selected OPTIONAL TLD: look
 * up its entry in the vendored thesaurus manifest (hierarchy.json, hierarchy_meta.ts —
 * WC-2026-10-10-hierarchy-json-manifest), import the data files the entry lists
 * (`<tld>1.copy.gz` terms, `<tld>2.copy.gz` models) into matrix_hierarchy, re-consolidate
 * the counter, then ACTIVATE it (./hierarchy_activate.ts — the registry row is created from
 * the entry).
 *
 * VERIFIED BEFORE WRITTEN. Every listed data file must exist in the vendored dir AND its
 * bytes must hash to the entry's `sha256` before anything of the tld is written; a missing
 * file or a mismatch is a loud refusal for that tld (its own error line), never a partial
 * import. Only the LISTED files are imported — a file on disk the entry does not list is
 * not this release's data. An entry with NO data files is an EMPTY thesaurus by design:
 * no import, activation only (and a reset is refused — there is nothing to reset from).
 * A tld the manifest does not list is refused (nothing imported).
 *
 * ACTIVATABLE BEFORE IMPORTED (2026-10-10 review). The entry was exported by
 * ANOTHER installation, so what it references must resolve HERE before a term
 * is copied: hierarchy_activate.ts `activationBlocker` (the lg1 language
 * record, the hierarchy13 typology record, a real section that is a `section`)
 * runs FIRST. It used to run after the `\copy` had committed: a refused entry
 * left thousands of unreachable terms, and every later run saw them and
 * answered "already installed — skipped", ok, never activating.
 *
 * THE CHOSEN THESAURI'S OWN DECLARATIONS. A hierarchy.json entry carries its
 * registry row's hierarchy60, and the hierarchy60 law binds whoever declares:
 * before the batch runs, the selection is checked against the chosen entries'
 * declared dependencies, transitively (hierarchy_dependencies.ts
 * withThesaurusDependencies → ontology_choice.ts closeThesaurusChoice — the rule
 * the CLI plan applies too). A THESAURUS dependency never blocks (owner
 * decision 2026-10-10): the batch is exactly the selection — the front ends
 * pre-tick the declared thesauri — and a MANDATORY one left out (declined, or
 * with no entry) is a warning in the batch message (strongly recommended,
 * installable later from Maintenance › Install hierarchies). Only a declared
 * MANDATORY ONTOLOGY this installation lacks (the ontology law) refuses the
 * WHOLE batch before anything is written. ONE door: the installer's step and
 * the add_hierarchy widget all come through here.
 *
 * ALREADY IMPORTED CONVERGES. A tld whose LISTED sections already hold its
 * rows is not re-copied (the raw `\copy` is insert-only) but is still
 * ACTIVATED (idempotent) — a run interrupted between import and activation is
 * finished by the next one, never reported as installed while unreachable.
 * The probe covers every section the entry lists (an entry may list only its
 * `<tld>2` models). A listed section that holds ONLY the General Term root an
 * activation minted (an empty thesaurus activated before the release shipped
 * its data) is not "installed": the terms are available but cannot be copied
 * additively — refused with its own line naming Reset, never a silent skip. So
 * is a listed section left EMPTY while a sibling is populated (its file carries
 * rows): one populated section never vouches for the others.
 *
 * A CORE tld (hierarchy_meta.ts CORE_HIERARCHIES — `lg`) is NEVER imported: its terms ship
 * in the seed, in their own table, and the seed restore already activates it. Asked for
 * here it is re-activated only (idempotent), and a reset is refused. History: the importer
 * used to take `lg` too and FORCED its `lg1` rows into matrix_hierarchy — `lg1` is a core
 * section whose table is matrix_langs, so those 21,705 rows landed where nothing reads
 * them (measured 2026-10-08: activation alone makes the hierarchy usable with zero lg rows
 * in matrix_hierarchy). The vendored `lg1.copy.gz` is deleted.
 *
 * The import forces the target table to `matrix_hierarchy` regardless of the file's own
 * section_tipo, and uses `\copy … FROM STDIN` through psql (the sanctioned subprocess
 * pattern).
 *
 * STREAMED, NEVER HELD (cross-ops:r2). It runs inside the server process and a listed
 * file can be a gigabyte decompressed (`in1.copy.gz`: 27.9 MB → 1.07 GB): the digest,
 * the row count and the load are each a streaming pass over the file — psql's stdin is
 * a pull stream (backpressure), so the process holds a chunk and one partial row, never
 * the file — and what it streamed is collected AS IT GOES (pacedCollection): in a process
 * whose live heap is large the collector otherwise lets the garbage of a big pass pile up
 * past the file's own size (gate: hierarchy_import_stream_memory_native).
 *
 * INT-CLEAN (WC-2026-10-21-seed-and-thesaurus-int-clean). The vendored files are PHP-era
 * exports carrying record addresses in the repealed string form; every row passes the
 * sweep's own kernel on its way to psql (copy_section_ids.ts), so an imported thesaurus
 * is born in the canonical int form — never a writer of the residue the sweep removes.
 *
 * THE RECORD-DATA FAN-OUT (cross-ops:r2). psql writes outside the engine's write
 * chokepoint, so the import owes what that chokepoint would have done: once the unit
 * COMMITTED, fireSaveEvent for every section it changed — the listed ones and, on a
 * reset, every `<tld>N` its DELETE emptied — so no data cache serves pre-import rows
 * (cache_factory.ts: in-process invalidation is complete only because every write goes
 * through that channel). What it deliberately does NOT run is declared, with reasons and
 * remedies, in HIERARCHY_IMPORT_SKIPPED_OBLIGATIONS (censused by
 * psql_matrix_write_obligations_tripwire). Gate: hierarchy_import_obligations_native.
 *
 * The installer runs it as the audited actor -1; the add_hierarchy widget behind the
 * maintenance area's session gate. Selecting no optional hierarchy is valid (the seed already carries
 * the core ontology, and Languages is already active).
 *
 * IMPORT IS HALF THE JOB. The `.copy.gz` only lands term rows; on their own they are
 * unreachable — `<tld>1` is not a section the engine knows until its ONTOLOGY exists, and
 * the hierarchy1 registry record is not flagged ACTIVE, so the thesaurus tree is empty and
 * every portal that resolves its targets from the active hierarchies gets nothing. That was
 * the shipped behaviour until 2026-07-14: 69,889 `es1` terms in the database and not one
 * of them reachable. An import that succeeds but whose activation fails is now reported as
 * a FAILURE for that tld — a hierarchy the operator ticked but cannot use is not an install
 * that worked.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { config } from '../../config/config.ts';
import { MATRIX_COPY_COLUMNS } from '../db/matrix_write.ts';
import { safeTld } from '../ontology/data_io.ts';
import type { HierarchyDataFile } from '../ontology/hierarchy_manifest_format.ts';
import { fireSaveEvent } from '../section_record/save_event.ts';
import {
	canonicalCopyChunks,
	jsonbColumnIndexes,
	newCopySectionIdTally,
} from './copy_section_ids.ts';
import {
	activateCoreHierarchy,
	activateHierarchy,
	activationBlocker,
} from './hierarchy_activate.ts';
import { withThesaurusDependencies } from './hierarchy_dependencies.ts';
import {
	CORE_HIERARCHIES,
	type HierarchyMeta,
	hierarchyMetaByTld,
	isCoreHierarchyTld,
} from './hierarchy_meta.ts';
import { HIERARCHY_IMPORT_DIR } from './paths.ts';
import { connFromConfig, type DbConnDescriptor, type PsqlRunResult, runPsql } from './pg_exec.ts';

const HIERARCHY_TABLE = 'matrix_hierarchy';

export interface HierarchyImportResponse {
	tld: string;
	/** Per-tld REPORT flag (the batch's data), never an envelope. */
	ok: boolean;
	msg: string;
	/** True when the tld was already installed and left untouched (skip mode). */
	skipped?: boolean;
}

/**
 * A BATCH REPORT, not a refusal. The import runs per tld and answers what
 * happened to each one; the add_hierarchy widget serves it as a widget outcome
 * and the installer prints it, so both still get the per-tld sentences (a thrown refusal would
 * replace `errors` with the single failure code and lose them).
 */
export interface InstallHierarchiesResult {
	ok: boolean;
	msg: string;
	errors: string[];
	responses: HierarchyImportResponse[];
}

/** How to treat a tld whose rows are already in matrix_hierarchy. */
export interface InstallHierarchiesOptions {
	/**
	 * false (default): an already-installed tld is SKIPPED (non-destructive — the raw
	 * `\copy` is insert-only and would violate the PK). true: DELETE the tld's existing
	 * rows first, then re-copy from the vendored seed — the PHP replace behavior. This is
	 * destructive (discards any operator edits/additions to that hierarchy's terms) and is
	 * only reached through the explicit, confirmed "Reset to seed" widget action.
	 */
	replace?: boolean;
	/**
	 * The vendored hierarchy dir — the manifest AND the data files are read from
	 * it. Default HIERARCHY_IMPORT_DIR (the release's); a gate passes its own
	 * scratch dir (a manifest it built) — never a production code path.
	 */
	importDir?: string;
	/**
	 * The caller's stop (a maintenance job's stop, a shutdown): kills the running tld's
	 * psql unit at once — its transaction rolls back — and no later tld runs ("not run").
	 */
	signal?: AbortSignal;
}

/**
 * The counter realignment after a raw COPY: for EVERY imported section_tipo of
 * this tld (e.g. es1, es2), raise the counter to the section's high-water mark
 * — MAX(section_id) over live rows AND over the surviving time-machine rows of
 * deleted ones — so the next insert allocates a genuinely fresh id. `tld` is
 * safeTld-validated before this runs, so the anchored regex literal is safe to
 * embed.
 */
function consolidateCounterSql(tld: string): string {
	// The seeded value is the HIGH-WATER MARK, not MAX(live section_id): a row
	// this CREATES would otherwise restart inside the ids of records deleted
	// before the re-import, and matrix_time_machine outlives those records
	// (P0-14; same floor as src/core/db/matrix_write.ts counterFloorExpression).
	return `INSERT INTO matrix_counter (tipo, value)
		SELECT live.section_tipo,
		       GREATEST(live.max_id, COALESCE((
		         SELECT MAX(tm.section_id) FROM matrix_time_machine tm
		          WHERE tm.section_tipo = live.section_tipo), 0))
		  FROM (SELECT section_tipo, MAX(section_id) AS max_id
		          FROM ${HIERARCHY_TABLE} WHERE section_tipo ~ '^${tld}[0-9]+$'
		         GROUP BY section_tipo) live
		ON CONFLICT (tipo) DO UPDATE
		  SET value = GREATEST(matrix_counter.value, EXCLUDED.value);`;
}

/**
 * The row count of each LISTED section (`<tld>1` / `<tld>2`, from the data
 * file names) in matrix_hierarchy — 0 for a section with none. The names are
 * the format's own `<tld>1|2.copy.gz` (the reader pinned them to the entry's
 * safeTld-valid tld), so the quoted literals are safe. A probe failure answers
 * null → the caller falls through to the normal copy, whose own error is
 * reported honestly.
 */
async function listedSectionCounts(
	conn: DbConnDescriptor,
	sections: readonly string[],
): Promise<Map<string, number> | null> {
	const list = sections.map((tipo) => `'${tipo}'`).join(', ');
	const res = await runPsql(conn, [
		'-tAF',
		'\t',
		'-c',
		`SELECT section_tipo, count(*) FROM ${HIERARCHY_TABLE} WHERE section_tipo IN (${list}) GROUP BY section_tipo`,
	]).catch(() => null);
	if (res === null || res.exitCode !== 0) return null;
	const counts = new Map(sections.map((tipo) => [tipo, 0]));
	for (const line of res.stdout.split('\n')) {
		const [tipo, count] = line.split('\t');
		if (tipo !== undefined && counts.has(tipo)) counts.set(tipo, Number(count));
	}
	return counts;
}

/** What is already in matrix_hierarchy of the sections a tld's data files fill. */
export type ListedSectionsState =
	/** None of the listed sections has a row: copy. */
	| { kind: 'absent' }
	/** The data is there (every listed section whose file carries rows is populated, none root-only): skip the copy. */
	| { kind: 'imported' }
	/**
	 * Not importable additively — Reset is the way. `rootOnly`: a listed section holds
	 * only a minted root while its file carries more. `missing`: a listed section holds
	 * NOTHING while its file carries rows and a sibling is populated (an import that
	 * never landed whole: a pre-atomic interrupted run, or a release that added the file).
	 */
	| { kind: 'partial'; rootOnly: string[]; missing: string[] };

/**
 * PURE: classify the listed sections (`counts` — rows now; `dataRows` — rows
 * in each verified file). A section with at most ONE row whose file carries
 * more is ROOT-ONLY: the General Term root an empty activation mints
 * (hierarchy_state.ts ensureRootTerm), not this release's data. A file of one
 * row is indistinguishable from its own root, so it counts as imported. Once
 * ANY listed section is populated, a listed section with NO row whose file
 * carries rows is MISSING: "already installed" would skip the copy and its
 * data would never land (an empty FILE is not missing — it has nothing to land).
 */
export function classifyListedSections(
	counts: ReadonlyMap<string, number>,
	dataRows: ReadonlyMap<string, number>,
): ListedSectionsState {
	const present = [...counts].filter(([, count]) => count > 0);
	if (present.length === 0) return { kind: 'absent' };
	const rootOnly = present
		.filter(([section, count]) => holdsOnlyARoot(count, dataRows.get(section) ?? 0))
		.map(([section]) => section);
	const missing = [...counts]
		.filter(([section, count]) => count === 0 && (dataRows.get(section) ?? 0) > 0)
		.map(([section]) => section);
	return rootOnly.length > 0 || missing.length > 0
		? { kind: 'partial', rootOnly, missing }
		: { kind: 'imported' };
}

/** The operator's line for a tld whose listed sections are not importable additively. */
function partialRefusal(state: { rootOnly: string[]; missing: string[] }): string {
	const why = [
		...(state.rootOnly.length === 0
			? []
			: [
					`${state.rootOnly.join(', ')} hold(s) only the root an earlier activation created (it was installed as an empty thesaurus)`,
				]),
		...(state.missing.length === 0
			? []
			: [
					`${state.missing.join(', ')} hold(s) none of its rows while the rest of the thesaurus is there (an earlier import did not land whole)`,
				]),
	];
	return `data available, not imported: ${why.join('; ')} — use "Reset to seed" to import its terms; nothing imported`;
}

/** A section of `count` rows whose file carries `fileRows`: only a minted root (see above)? */
function holdsOnlyARoot(count: number, fileRows: number): boolean {
	return count <= 1 && fileRows > 1;
}

/** The section tipo a listed data file fills (`es1.copy.gz` → `es1`). */
function listedSection(file: string): string {
	return file.replace(/\.copy\.gz$/, '');
}

/** A collection requested per this many bytes a pass streams through the process. */
const STREAM_COLLECT_EVERY_BYTES = 32 << 20;

/**
 * The chunks of `source`, unchanged, with a collection requested (non-blocking,
 * `Bun.gc(false)`) every STREAM_COLLECT_EVERY_BYTES. WHY: every byte a pass streams
 * arrives in a fresh Buffer, and the collector paces itself on the LIVE heap — so in a
 * process whose heap is already large (the server; the unit tier's one `bun test`
 * process) the garbage of a big pass piles up before it is reclaimed. Measured in the
 * CI image with a large live heap, gunzipping 512 MiB: +80..234 MB of resident set
 * unpaced, ~50 MB paced (cross-ops W4 seed-import).
 */
async function* pacedCollection(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
	let since = 0;
	for await (const chunk of source) {
		since += chunk.length;
		if (since >= STREAM_COLLECT_EVERY_BYTES) {
			since = 0;
			Bun.gc(false);
		}
		yield chunk;
	}
}

/** sha256 of a file's bytes, streamed. */
async function fileSha256(path: string): Promise<string> {
	const hash = createHash('sha256');
	for await (const chunk of pacedCollection(createReadStream(path))) hash.update(chunk);
	return hash.digest('hex');
}

/** The decompressed byte stream of a gzip file (a read error ends it with that error). */
function gunzipStream(path: string): Readable {
	const source = createReadStream(path);
	const gunzip = createGunzip();
	source.on('error', (error) => gunzip.destroy(error));
	return source.pipe(gunzip);
}

/** The data rows of a gzip COPY file, streamed (one per line; a last line without its newline counts). */
async function gzipCopyRowCount(path: string): Promise<number> {
	let rows = 0;
	let last = 0x0a;
	for await (const bytes of pacedCollection(gunzipStream(path))) {
		if (bytes.length === 0) continue;
		for (let at = bytes.indexOf(0x0a); at !== -1; at = bytes.indexOf(0x0a, at + 1)) rows++;
		last = bytes[bytes.length - 1] as number;
	}
	return last === 0x0a ? rows : rows + 1;
}

/** One LISTED data file, verified: where it is, its pinned digest, the section it fills, its rows. */
export interface VerifiedSeedFile {
	file: string;
	path: string;
	sha256: string;
	section: string;
	rows: number;
}

/**
 * One LISTED data file: its bytes checked against the manifest's sha256 (a streamed
 * hash), then its rows counted (a streamed decompression) — or the problem that kept it
 * unread. The digest is checked BEFORE decompression and before anything is written.
 */
async function verifySeedFile(
	importDir: string,
	listed: HierarchyDataFile,
): Promise<VerifiedSeedFile | { problem: string }> {
	const fileName = listed.file;
	const path = join(importDir, fileName);
	if (!existsSync(path)) {
		return {
			problem: `missing data file ${fileName} (listed in hierarchy.json) — nothing imported`,
		};
	}
	let digest: string;
	try {
		digest = await fileSha256(path);
	} catch (error) {
		console.error(`[install:hierarchy_import] read failed: ${fileName}`, error);
		return { problem: `read failed (${fileName}) — see the server log; nothing imported` };
	}
	if (digest !== listed.sha256) {
		return {
			problem: `checksum mismatch for ${fileName}: its sha256 is not the one hierarchy.json lists — nothing imported`,
		};
	}
	try {
		const rows = await gzipCopyRowCount(path);
		return { file: fileName, path, sha256: digest, section: listedSection(fileName), rows };
	} catch (error) {
		// The raw zlib/fs text names absolute paths (SEC-17): it goes to the server log;
		// the report carries a deliberate sentence naming the file.
		console.error(`[install:hierarchy_import] read/decompress failed: ${fileName}`, error);
		return {
			problem: `decompress failed (${fileName}): the file could not be read as a gzip archive — see the server log`,
		};
	}
}

/**
 * The IMPORT half of one tld (no activation) — ONE ATOMIC UNIT (OPS-6/PERF-11
 * review): every write of the tld runs in ONE psql session inside ONE explicit
 * transaction (`BEGIN` … `COMMIT`, ON_ERROR_STOP), so it applies whole or not at all:
 *   (replace) the scoped DELETE of every `<tld>N` section (the PHP pre-delete,
 *   backup::import_from_copy_file — destructive by design, the caller confirmed
 *   it), the `\copy` of each LISTED data file (`dataFiles` — the manifest
 *   entry's, terms then models; at least one) and the counter realignment.
 * Each used to be its own psql call: a terms file that failed to load left the
 * hierarchy DELETED (operator edits and additions gone, the seed not restored),
 * a failed models file and a failed counter were ignored and the tld reported
 * imported. Every listed file is CHECKSUM-VERIFIED against the manifest and its
 * rows counted BEFORE anything is sent (a missing file or a mismatch: nothing
 * written); the load re-hashes the bytes it streams and a file that changed under
 * it is refused before its COMMIT is ever sent.
 * Without `replace`, a tld whose LISTED sections already hold its rows is
 * skipped (the raw `\copy` is insert-only), and one whose listed section holds
 * only a minted root — or nothing, beside a populated sibling — is refused naming
 * Reset (classifyListedSections). Table
 * FORCED to matrix_hierarchy (PHP parity), explicit column order. Once the unit
 * committed, every section it changed is announced on the record-data channel
 * (see the header). BOUNDED AND ENDABLE (cross-ops:r4): the unit's lock waits give
 * up at HIERARCHY_UNIT_LOCK_TIMEOUT and the unit is retried WHOLE on the maintenance
 * schedule (runUnitRetryingLockWaits); `signal` kills it at once (runImportUnit).
 * Gates: test/unit/hierarchy_import_atomic_native.test.ts,
 * hierarchy_import_obligations_native, hierarchy_import_stream_memory_native,
 * hierarchy_import_lock_bound_native.
 */
export async function importHierarchyRows(
	conn: DbConnDescriptor,
	tld: string,
	options: {
		/** The manifest entry's data files (verified here); [] is refused — nothing to import. */
		dataFiles: readonly HierarchyDataFile[];
		replace?: boolean;
		importDir?: string;
	} & UnitRunOptions,
): Promise<ImportOutcome> {
	const replace = options.replace === true;
	const seeds = await verifySeedFiles(options.importDir ?? HIERARCHY_IMPORT_DIR, options.dataFiles);
	if ('problem' in seeds) return importRefused(seeds.problem);
	const present = replace ? null : await presentRowsOutcome(conn, seeds);
	if (present !== null) return present;
	const { res, attempts } = await runUnitRetryingLockWaits(conn, tld, replace, seeds, options);
	if (res.exitCode !== 0) return importRefused(failedImportMessage(replace, res, attempts));
	await announceChangedSections([...seeds.dataRows.keys(), ...res.removedSections]);
	return { ok: true, msg: 'copied' };
}

/**
 * The record-write obligations a thesaurus import / reset does NOT run, each with
 * its reason and the operator's remedy. The import writes through psql, outside
 * the write chokepoint (section_record/record_write.ts afterRecordWrite) — what it
 * DOES owe and run is the record-data fan-out (announceChangedSections). Censused,
 * with every other psql writer of a matrix table, by
 * psql_matrix_write_obligations_tripwire.
 */
export const HIERARCHY_IMPORT_SKIPPED_OBLIGATIONS: Readonly<Record<string, string>> = Object.freeze(
	{
		time_machine:
			'a vendored data load is not an edit: no per-row Time Machine history, as for the install seed itself (PHP backup::import_from_copy_file parity)',
		rag: 'one COPY lands up to ~10^6 rows; enqueuing them one by one is the RAG reconcile’s job — for a RAG-embedded thesaurus run `bun run src/ai/rag/cli/rag_drain.ts --reconcile <tld>1` (and <tld>2) after an import or reset',
		observers:
			'a reset deletes terms outside the delete door, so the observers of a deleted operator-added term are not told — run the observer_mirrors reconcile after a reset (Maintenance › Reconcile, or scripts/observer_reconcile.ts)',
		diffusion:
			'terms a reset deletes are not unpublished — re-publish a diffused thesaurus after a reset',
		revocation:
			'thesaurus terms are not accounts: no users (dd128) record is written, so no session has access to revoke',
	},
);

/** The operator's follow-up line of a successful reset (HIERARCHY_IMPORT_SKIPPED_OBLIGATIONS, short). */
const RESET_FOLLOW_UP =
	'derived state outside the record channel is not rebuilt: run the observer_mirrors reconcile; re-publish / RAG-reconcile the thesaurus if it is diffused or embedded';

/** fireSaveEvent for every section an import changed (deduplicated, in order). */
async function announceChangedSections(sections: readonly string[]): Promise<void> {
	for (const section of new Set(sections)) await fireSaveEvent(section);
}

/** What importing one tld's rows answered (an internal outcome — the batch report reads it). */
type ImportOutcome = { ok: boolean; msg: string; skipped?: boolean };

/** The one refusal shape of {@link importHierarchyRows}: nothing of the tld was written. */
function importRefused(msg: string): ImportOutcome {
	return { ok: false, msg };
}

/**
 * Without `replace`: the outcome when the LISTED sections already hold rows —
 * skipped (the data is there) or refused naming Reset (a minted root only, or a
 * section left empty beside a populated one: classifyListedSections) — or null
 * when there is nothing there: copy.
 */
async function presentRowsOutcome(
	conn: DbConnDescriptor,
	seeds: SeedFiles,
): Promise<ImportOutcome | null> {
	const counts = await listedSectionCounts(conn, [...seeds.dataRows.keys()]);
	if (counts === null) return null;
	const state = classifyListedSections(counts, seeds.dataRows);
	if (state.kind === 'imported') {
		return { ok: true, msg: 'already installed — import skipped', skipped: true };
	}
	if (state.kind === 'absent') return null;
	return importRefused(partialRefusal(state));
}

/** The stdout tag of a section the reset's DELETE emptied (one line per section). */
const REMOVED_SECTION_TAG = 'removed_section:';

/**
 * The stdout tag of the unit's SESSION LINE, `unit_session:<backend pid>:<xid8>`.
 * Printed before the first write (psql flushes each result as it prints it), so a
 * unit the caller's signal killed is cancelled on the server and its outcome READ,
 * never guessed (killedUnitOutcome). No line: the session never reached a write.
 */
const UNIT_SESSION_TAG = 'unit_session:';

/**
 * THE UNIT'S LOCK-WAIT BOUND: the maintenance bound, db/postgres.ts
 * MAINTENANCE_LOCK_TIMEOUT, by value. This file ships its writes through psql and so
 * may not import the pool module (sql_confinement_tripwire: one channel per file);
 * hierarchy_import_lock_bound_native pins the two equal.
 */
export const HIERARCHY_UNIT_LOCK_TIMEOUT = '5s';

/**
 * The retries of a unit whose lock wait ran out (55P03), each one a WHOLE re-run —
 * the maintenance lane's schedule (withMaintenanceTransaction's default).
 */
const UNIT_LOCK_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000];

/** How long a killed unit's transaction may stay 'in progress' before its outcome is 'unknown'. */
const KILLED_UNIT_SETTLE_MS = 30_000;

/** A file whose bytes changed between its verification and its load (nothing committed). */
class SeedFileChanged extends Error {}

/** What a killed unit's transaction did, read on the server (killedUnitOutcome). */
type KilledUnitOutcome = 'committed' | 'rolled_back' | 'unknown';

/** What the import unit answered: psql's run + the sections a reset emptied. */
export interface ImportUnitResult extends PsqlRunResult {
	removedSections: string[];
	/** A lock wait ran out (55P03 at HIERARCHY_UNIT_LOCK_TIMEOUT): rolled back whole, retryable. */
	lockTimedOut: boolean;
	/** The caller's signal killed the unit: what its transaction did, and why it was killed. */
	aborted: { outcome: KilledUnitOutcome; cause: string } | null;
}

/** How a unit runs: the caller's stop, and (gates) the lock-retry schedule. */
export interface UnitRunOptions {
	/** A stop / shutdown: kills the unit's psql at once; its transaction rolls back. */
	signal?: AbortSignal;
	/** The whole-unit retries after a lock wait ran out (default UNIT_LOCK_RETRY_DELAYS_MS). */
	lockRetryDelaysMs?: readonly number[];
	/** Told before each retry (attempt number, from 1). */
	onLockRetry?: (attempt: number, delayMs: number) => void;
}

/**
 * THE UNIT'S BOUNDS, its first statements after `BEGIN`. psql children never receive
 * the maintenance pool's startup `lock_timeout` (engineering/PRODUCTION.md: the
 * ceiling is lifted, the lock-wait bound is not), so the unit sets its own. A lock
 * WAIT gives up at HIERARCHY_UNIT_LOCK_TIMEOUT (55P03): the transaction rolls back, and
 * the sessions queued behind the locks it already holds go on. The STATEMENT is
 * unbounded on purpose: a COPY of ~10^6 rows is work, not a wait, and an operator's
 * PGOPTIONS statement_timeout must not cut it off part-way. Then the session line
 * (UNIT_SESSION_TAG). `pg_current_xact_id()` assigns the xid now, before any write.
 */
function unitSessionSql(): string {
	return [
		`SET LOCAL lock_timeout = '${HIERARCHY_UNIT_LOCK_TIMEOUT}';`,
		'SET LOCAL statement_timeout = 0;',
		`SELECT '${UNIT_SESSION_TAG}' || pg_backend_pid() || ':' || pg_current_xact_id();`,
	].join('\n');
}

/**
 * THE SCRIPT of one tld, streamed: `BEGIN`, the unit's bounds and session line
 * (unitSessionSql), (reset) the scoped DELETE answering the sections it emptied, each
 * listed file as an inline `\copy … FROM STDIN` (its rows int-clean, its bytes
 * re-hashed — a changed file throws BEFORE its `\.`, so the script can never reach its
 * COMMIT), the counter, `COMMIT`. The COMMIT is the script's LAST line, never psql's
 * implicit end-of-input one (`--single-transaction` commits at EOF): a stream that ends
 * early — a failure, a kill — leaves the transaction open, and the server rolls it back
 * when the session goes.
 */
async function* importScript(
	statements: { session: string; reset: string | null; copy: string; counter: string },
	files: readonly VerifiedSeedFile[],
): AsyncGenerator<Uint8Array> {
	const encoder = new TextEncoder();
	yield encoder.encode(`BEGIN;\n${statements.session}\n`);
	if (statements.reset !== null) yield encoder.encode(`${statements.reset}\n`);
	const jsonbIndexes = jsonbColumnIndexes(MATRIX_COPY_COLUMNS);
	const tally = newCopySectionIdTally();
	for (const file of files) {
		yield encoder.encode(`${statements.copy}\n`);
		const hash = createHash('sha256');
		const source = createReadStream(file.path);
		source.on('data', (chunk) => hash.update(chunk as Buffer));
		const gunzip = createGunzip();
		source.on('error', (error) => gunzip.destroy(error));
		try {
			// COPY text format escapes every backslash in the data, so no data line can
			// be the bare `\.` terminator; every row comes out newline-terminated.
			yield* canonicalCopyChunks(pacedCollection(source.pipe(gunzip)), jsonbIndexes, tally);
		} finally {
			// psql gone (a failed statement) or the stream cancelled: never leave the fd open.
			source.destroy();
		}
		if (hash.digest('hex') !== file.sha256) throw new SeedFileChanged(file.file);
		yield encoder.encode('\\.\n');
	}
	yield encoder.encode(`${statements.counter}\nCOMMIT;\n`);
}

/**
 * A pull stream over `chunks` (psql's stdin: Bun reads it with backpressure). A
 * failing chunk calls `onFailure` FIRST (it kills psql, so the session dies before
 * it could read an end of input) and then errors the stream.
 */
function pullStream(
	chunks: AsyncGenerator<Uint8Array>,
	onFailure: (error: unknown) => void,
): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>(
		{
			async pull(controller) {
				try {
					const next = await chunks.next();
					if (next.done === true) controller.close();
					else controller.enqueue(next.value);
				} catch (error) {
					onFailure(error);
					controller.error(error);
				}
			},
			async cancel() {
				await chunks.return(undefined);
			},
		},
		{ highWaterMark: 1 },
	);
}

/**
 * THE WRITE: the tld's whole import as ONE psql session, one transaction (see
 * importScript) — every statement it ships is built HERE: the bounds, (reset) the
 * scoped DELETE answering the sections it emptied, the `\copy` of each listed file,
 * the counter. A failing statement stops the script (ON_ERROR_STOP) and the session
 * ends with its transaction rolled back; so does a lock wait past the bound
 * (`lockTimedOut`, read from the 55P03 VERBOSITY=verbose prints), and so does a
 * script stream that fails (runPsql's `signal` kills the child before its input
 * ends). The caller's `signal` kills it too, at once. A kill can land after the
 * COMMIT went down the pipe, so the outcome of a killed unit is READ
 * (killedUnitOutcome), never assumed. Exported for its gates
 * (hierarchy_import_obligations_native: a file whose bytes no longer hash to the
 * verified digest; hierarchy_import_lock_bound_native).
 */
export async function runImportUnit(
	conn: DbConnDescriptor,
	tld: string,
	replace: boolean,
	seeds: SeedFiles,
	options: { signal?: AbortSignal } = {},
): Promise<ImportUnitResult> {
	const statements = {
		session: unitSessionSql(),
		reset: replace
			? `WITH removed AS (DELETE FROM ${HIERARCHY_TABLE} WHERE section_tipo ~ '^${tld}[0-9]+$' RETURNING section_tipo) SELECT DISTINCT '${REMOVED_SECTION_TAG}' || section_tipo FROM removed;`
			: null,
		copy: `\\copy ${HIERARCHY_TABLE} (${MATRIX_COPY_COLUMNS.join(', ')}) FROM STDIN`,
		counter: consolidateCounterSql(tld),
	};
	let failure: unknown = null;
	const producerFailed = new AbortController();
	const stdin = pullStream(importScript(statements, seeds.files), (error) => {
		failure = error;
		producerFailed.abort();
	});
	const stop = options.signal;
	const res = await runPsql(
		conn,
		['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '--quiet', '-tA', '-f', '-'],
		{
			stdin,
			signal:
				stop === undefined ? producerFailed.signal : AbortSignal.any([producerFailed.signal, stop]),
		},
	);
	if (stop?.aborted === true && res.exitCode !== 0) return killedUnitResult(conn, res, stop);
	return unitResult(res, failure);
}

/** The sections a reset's DELETE reported emptying (REMOVED_SECTION_TAG lines). */
function removedSectionsOf(stdout: string): string[] {
	return stdout
		.split('\n')
		.filter((line) => line.startsWith(REMOVED_SECTION_TAG))
		.map((line) => line.slice(REMOVED_SECTION_TAG.length).trim());
}

/** A lock wait that ran out: SQLSTATE 55P03, as psql prints it under VERBOSITY=verbose. */
function isLockTimeout(stderr: string): boolean {
	return /\bERROR:\s+55P03:/.test(stderr);
}

/** psql's answer, a failed script stream folded in (never exit 0), the emptied sections parsed. */
function unitResult(res: PsqlRunResult, failure: unknown): ImportUnitResult {
	const { exitCode, stdout, stderr } = res;
	const removedSections = removedSectionsOf(stdout);
	if (failure === null) {
		const lockTimedOut = exitCode !== 0 && isLockTimeout(stderr);
		return { exitCode, stdout, stderr, removedSections, lockTimedOut, aborted: null };
	}
	const why =
		failure instanceof SeedFileChanged
			? `${failure.message} changed while it was imported (its sha256 is no longer the verified one)`
			: 'reading a data file failed — see the server log';
	if (!(failure instanceof SeedFileChanged)) {
		console.error('[install:hierarchy_import] the import stream failed:', failure);
	}
	return {
		exitCode: exitCode === 0 ? 1 : exitCode,
		stdout,
		stderr: why,
		removedSections: [],
		lockTimedOut: false,
		aborted: null,
	};
}

/** Why `signal` fired, in words (its reason's message). */
function abortCause(signal: AbortSignal): string {
	const reason: unknown = signal.reason;
	if (reason instanceof Error && reason.message !== '') return reason.message;
	return typeof reason === 'string' && reason !== '' ? reason : 'aborted';
}

/**
 * A unit the caller's signal KILLED: its outcome read on the server. No session line:
 * the session never reached a write (rolled back by definition). A committed outcome
 * (the kill landed after the COMMIT) is a success: exit 0, the emptied sections kept.
 */
async function killedUnitResult(
	conn: DbConnDescriptor,
	res: PsqlRunResult,
	signal: AbortSignal,
): Promise<ImportUnitResult> {
	const match = new RegExp(`^${UNIT_SESSION_TAG}(\\d+):(\\d+)$`, 'm').exec(res.stdout);
	const outcome: KilledUnitOutcome =
		match === null ? 'rolled_back' : await killedUnitOutcome(conn, match[1] ?? '', match[2] ?? '');
	const committed = outcome === 'committed';
	return {
		exitCode: committed ? 0 : res.exitCode,
		stdout: res.stdout,
		stderr: res.stderr,
		removedSections: committed ? removedSectionsOf(res.stdout) : [],
		lockTimedOut: false,
		aborted: { outcome, cause: abortCause(signal) },
	};
}

/**
 * What a KILLED unit's transaction became. Its backend is cancelled first, only while
 * it is still the unit's (pid AND xid: a recycled pid is never cancelled), so a long
 * statement ends now rather than when it next reads the dead socket. Then the xid's
 * status is polled until it leaves 'in progress' (bounded by KILLED_UNIT_SETTLE_MS).
 * Both pid and xid are digit strings (the session-line regex), safe to embed.
 */
async function killedUnitOutcome(
	conn: DbConnDescriptor,
	pid: string,
	xid: string,
): Promise<KilledUnitOutcome> {
	await runPsql(conn, [
		'-X',
		'-tAc',
		`SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE pid = ${pid} AND backend_xid = xid('${xid}'::xid8)`,
	]);
	const deadline = Date.now() + KILLED_UNIT_SETTLE_MS;
	for (;;) {
		const status = await xactOutcome(conn, xid);
		if (status !== 'in progress') return status;
		if (Date.now() > deadline) return 'unknown';
		await Bun.sleep(100);
	}
}

/** `pg_xact_status(xid)` as an outcome; 'in progress' while it runs, 'unknown' when unreadable. */
async function xactOutcome(
	conn: DbConnDescriptor,
	xid: string,
): Promise<KilledUnitOutcome | 'in progress'> {
	const read = await runPsql(conn, ['-X', '-tAc', `SELECT pg_xact_status('${xid}'::xid8)`]);
	const status = read.exitCode === 0 ? read.stdout : '';
	if (status === 'committed') return 'committed';
	if (status === 'aborted') return 'rolled_back';
	return status === 'in progress' ? 'in progress' : 'unknown';
}

/**
 * runImportUnit, RETRIED WHOLE while its lock wait runs out, after each delay of the
 * schedule (UNIT_LOCK_RETRY_DELAYS_MS — the shape of db/postgres.ts
 * retryOnLockNotAvailable, which this psql-channel file may not import). Every
 * attempt re-streams and re-hashes the files; a rolled-back attempt changed nothing.
 * The backoff is abortable: a stop during it answers the last attempt's rollback as
 * aborted. The last attempt's answer comes back with how many ran.
 */
async function runUnitRetryingLockWaits(
	conn: DbConnDescriptor,
	tld: string,
	replace: boolean,
	seeds: SeedFiles,
	options: UnitRunOptions,
): Promise<{ res: ImportUnitResult; attempts: number }> {
	const delays = options.lockRetryDelaysMs ?? UNIT_LOCK_RETRY_DELAYS_MS;
	for (let attempts = 1; ; attempts += 1) {
		const res = await runImportUnit(conn, tld, replace, seeds, { signal: options.signal });
		const delayMs = delays[attempts - 1];
		if (!res.lockTimedOut || delayMs === undefined) return { res, attempts };
		console.warn(
			`[install:hierarchy_import] ${tld}: a lock wait ran past ${HIERARCHY_UNIT_LOCK_TIMEOUT} — nothing applied; retry ${attempts} in ${delayMs}ms`,
		);
		options.onLockRetry?.(attempts, delayMs);
		const stopped = await sleepUnlessStopped(delayMs, options.signal);
		if (stopped !== null) return { res: abortedBeforeRun(stopped), attempts };
	}
}

/** Sleep `delayMs`; the signal that fired meanwhile (or already had), else null. */
async function sleepUnlessStopped(
	delayMs: number,
	signal: AbortSignal | undefined,
): Promise<AbortSignal | null> {
	if (signal === undefined) {
		await Bun.sleep(delayMs);
		return null;
	}
	if (!signal.aborted) {
		await new Promise<void>((resolve) => {
			const wake = () => {
				clearTimeout(timer);
				signal.removeEventListener('abort', wake);
				resolve();
			};
			const timer = setTimeout(wake, delayMs);
			signal.addEventListener('abort', wake, { once: true });
		});
	}
	return signal.aborted ? signal : null;
}

/** A unit stopped before (another attempt of) it ran: nothing of it is open, nothing changed. */
function abortedBeforeRun(signal: AbortSignal): ImportUnitResult {
	return {
		exitCode: 1,
		stdout: '',
		stderr: '',
		removedSections: [],
		lockTimedOut: false,
		aborted: { outcome: 'rolled_back', cause: abortCause(signal) },
	};
}

/** The verified data files of a tld, in COPY order (terms, then models). */
export interface SeedFiles {
	files: VerifiedSeedFile[];
	/** The data rows each file carries, by the section it fills. */
	dataRows: Map<string, number>;
}

/**
 * Every listed data file of a tld — verified, its rows counted — terms
 * (`<tld>1`) before models (`<tld>2`), or the FIRST problem that kept one
 * unread (then nothing is written). The format reader already pinned each
 * name to the entry's own `<tld>1|2.copy.gz`.
 */
async function verifySeedFiles(
	importDir: string,
	dataFiles: readonly HierarchyDataFile[],
): Promise<SeedFiles | { problem: string }> {
	if (dataFiles.length === 0) return { problem: 'no data files listed — nothing to import' };
	const ordered = [...dataFiles].sort((a, b) => a.file.localeCompare(b.file));
	const files: VerifiedSeedFile[] = [];
	const dataRows = new Map<string, number>();
	for (const listed of ordered) {
		const verified = await verifySeedFile(importDir, listed);
		if ('problem' in verified) return verified;
		files.push(verified);
		dataRows.set(verified.section, verified.rows);
	}
	return { files, dataRows };
}

/**
 * A failed import unit, in the operator's words. Rolled back whole: nothing of the tld
 * changed — a lock wait past the bound says so and names the lock; a killed unit says
 * what its transaction was READ to have done (abortedImportMessage).
 */
function failedImportMessage(replace: boolean, res: ImportUnitResult, attempts: number): string {
	if (res.aborted !== null) return abortedImportMessage(replace, res.aborted);
	const step = `${replace ? 'reset failed' : 'import failed'} — ${nothingDone(replace)}`;
	if (res.lockTimedOut) {
		return `${step}: another session held a lock on the thesaurus's rows past the lock_timeout ${HIERARCHY_UNIT_LOCK_TIMEOUT} (${attempts} attempt(s)) — retry once it is released (a session idle in transaction shows in pg_stat_activity)`;
	}
	return `${step}: ${operatorStderr(res.stderr) || `psql exited ${res.exitCode}`}`;
}

/** What a rolled-back unit did NOT do, in the operator's words. */
function nothingDone(replace: boolean): string {
	return replace ? 'nothing changed' : 'nothing imported';
}

/** A unit the caller's signal killed: its READ outcome (killedUnitOutcome), an unreadable one included. */
function abortedImportMessage(
	replace: boolean,
	aborted: NonNullable<ImportUnitResult['aborted']>,
): string {
	const step = `${replace ? 'reset' : 'import'} aborted (${aborted.cause})`;
	return aborted.outcome === 'unknown'
		? `${step} — its outcome could not be read: check the thesaurus's rows before retrying`
		: `${step} — ${nothingDone(replace)}: its transaction rolled back`;
}

/** psql's stderr without the VERBOSITY=verbose source-location lines (server internals). */
function operatorStderr(stderr: string): string {
	return stderr
		.split('\n')
		.filter((line) => !/^\s*LOCATION:/.test(line))
		.join('\n')
		.trim();
}

/**
 * One tld's line in the batch report: its response + the findings it contributes to the
 * batch `errors[]`. Findings are UNPREFIXED sentences — the batch loop tags each with its
 * tld in ONE place (installHierarchies), so no outcome builds a wire list by hand.
 */
interface TldOutcome {
	response: HierarchyImportResponse;
	findings: readonly string[];
}

/** A failed tld: the response says `msg`; the batch gets `findings` (default: the msg). */
function failedTld(tld: string, msg: string, findings: readonly string[] = [msg]): TldOutcome {
	return { response: { tld, ok: false, msg }, findings };
}

/**
 * A CORE tld asked for by name: activation only (never an import, never a reset).
 * The engine-owns-target refusal still applies — activation writes through the pool.
 */
async function coreHierarchyOutcome(
	tld: string,
	replace: boolean,
	engineOwnsTarget: boolean,
	userId: number,
): Promise<TldOutcome> {
	if (replace)
		return failedTld(tld, 'core hierarchy — cannot be reset (its terms ship in the seed)');
	if (!engineOwnsTarget) {
		return failedTld(
			tld,
			`core hierarchy — NOT activated: the engine writes to '${config.db.database}'`,
		);
	}
	const core = CORE_HIERARCHIES.find((item) => item.tld === tld);
	if (core === undefined) return failedTld(tld, 'not a core hierarchy');
	const activation = await activateCoreHierarchy(core, userId);
	if (!activation.ok) {
		return failedTld(tld, `core hierarchy — activation failed: ${activation.errors.join('; ')}`);
	}
	const msg = 'core hierarchy — activated (its terms ship in the seed; never imported)';
	return { response: { tld, ok: true, msg }, findings: [] };
}

/**
 * ACTIVATION of a tld (installer_hierarchy_manager::activate_hierarchy): create its
 * registry row from the manifest entry when it has none, flag it active and provision
 * its ontology, so it is usable at the first login.
 */
async function activateEntry(
	meta: HierarchyMeta,
	done: string,
	userId: number,
	skipped = false,
): Promise<TldOutcome> {
	const activation = await activateHierarchy(meta, userId);
	if (!activation.ok) {
		return failedTld(
			meta.tld,
			`${done}, activation failed: ${activation.errors.join('; ')}`,
			activation.errors,
		);
	}
	const response: HierarchyImportResponse = {
		tld: meta.tld,
		ok: true,
		msg: `${done} and activated`,
	};
	return { response: skipped ? { ...response, skipped } : response, findings: [] };
}

/** The refusal of an activation whose target is not the engine's database. */
function foreignTarget(tld: string, connection: DbConnDescriptor, done: string): TldOutcome {
	return failedTld(
		tld,
		`${done} into '${connection.database}', NOT activated: the engine writes to '${config.db.database}'`,
		[
			`activation skipped — the import target '${connection.database}' is not the engine's database ('${config.db.database}')`,
		],
	);
}

/**
 * An EMPTY thesaurus by design (its entry lists no data files): nothing to
 * import — activation only. A reset is refused: there is no data to reset from.
 */
async function emptyHierarchyOutcome(
	meta: HierarchyMeta,
	connection: DbConnDescriptor,
	replace: boolean,
	engineOwnsTarget: boolean,
	userId: number,
): Promise<TldOutcome> {
	if (replace) {
		return failedTld(
			meta.tld,
			'empty thesaurus by design (hierarchy.json lists no data files) — nothing to reset from',
		);
	}
	if (!engineOwnsTarget)
		return foreignTarget(meta.tld, connection, 'empty thesaurus (nothing imported)');
	return activateEntry(meta, 'empty thesaurus (no data files — nothing imported)', userId);
}

/** A tld WITH data files: the verified import (or skip / reset), then activation. */
async function importedHierarchyOutcome(
	meta: HierarchyMeta,
	connection: DbConnDescriptor,
	options: { replace: boolean; importDir: string; signal?: AbortSignal },
	engineOwnsTarget: boolean,
	userId: number,
): Promise<TldOutcome> {
	const { tld } = meta;
	const imported = await importHierarchyRows(connection, tld, {
		replace: options.replace,
		importDir: options.importDir,
		dataFiles: meta.data_files,
		signal: options.signal,
	});
	if (!imported.ok) return failedTld(tld, imported.msg);
	const skipped = imported.skipped === true;
	// The engine's writes land in the CONFIGURED database. When the import target is a
	// different one, activating would write into the wrong DB — refuse, loudly (a skip
	// there stays a plain skip: nothing of ours to converge).
	if (!engineOwnsTarget) {
		if (skipped) return { response: { tld, ok: true, msg: imported.msg, skipped }, findings: [] };
		return foreignTarget(tld, connection, 'imported');
	}
	// An already-imported tld CONVERGES (see the header): activation is idempotent.
	if (skipped) return activateEntry(meta, imported.msg, userId, true);
	return options.replace ? resetOutcome(meta, userId) : activateEntry(meta, 'imported', userId);
}

/** A reset that landed: activated, and its line names what it did not rebuild (RESET_FOLLOW_UP). */
async function resetOutcome(meta: HierarchyMeta, userId: number): Promise<TldOutcome> {
	const reset = await activateEntry(meta, 'reset', userId);
	if (!reset.response.ok) return reset;
	return {
		...reset,
		response: { ...reset.response, msg: `${reset.response.msg} — ${RESET_FOLLOW_UP}` },
	};
}

/** An OPTIONAL tld: its manifest entry, then (empty → activation only | import + activate). */
async function optionalHierarchyOutcome(
	connection: DbConnDescriptor,
	tld: string,
	options: { replace: boolean; importDir: string; signal?: AbortSignal },
	engineOwnsTarget: boolean,
	userId: number,
): Promise<TldOutcome> {
	const meta = hierarchyMetaByTld(tld, options.importDir);
	if (meta === null) {
		return failedTld(tld, 'not listed in hierarchy.json — nothing imported, not activated');
	}
	// THE PREFLIGHT (see the header): what the entry references must resolve HERE before
	// anything of the tld is written. Against the engine's own database only — a foreign
	// target is refused activation anyway, and this check reads the engine pool.
	if (engineOwnsTarget) {
		const blocker = await activationBlocker(meta);
		if (blocker !== null) return failedTld(tld, `${blocker}; nothing imported`);
	}
	if (meta.data_files.length === 0) {
		return emptyHierarchyOutcome(meta, connection, options.replace, engineOwnsTarget, userId);
	}
	return importedHierarchyOutcome(meta, connection, options, engineOwnsTarget, userId);
}

/** The batch sentence the caller shows. */
function batchMessage(
	tldCount: number,
	responses: readonly HierarchyImportResponse[],
	errorCount: number,
	replace: boolean,
): string {
	if (tldCount === 0) return 'No optional hierarchies selected — Languages (lg) is always active';
	if (errorCount > 0) return `${errorCount} hierarchy(ies) failed`;
	const imported = responses.filter((r) => r.ok && !r.skipped).length;
	const skipped = responses.filter((r) => r.skipped).length;
	const msg = `${replace ? 'Reset' : 'Imported'} ${imported} hierarchy(ies)`;
	return skipped > 0 ? `${msg}, skipped ${skipped} already installed` : msg;
}

/**
 * Import + ACTIVATE the selected hierarchies. `conn` defaults to config.db.
 *
 * TWO WRITE CHANNELS, ONE DATABASE. The import is a `\copy` through psql into `conn`;
 * the activation writes through the ENGINE (its connection pool), which is bound to the
 * CONFIGURED database and cannot be pointed elsewhere. They agree only while `conn` names
 * that same database — which the installer and the widget always do (they pass no conn at all). A caller
 * that hands us a DIFFERENT database (a scratch DB in a test) would import there and
 * activate HERE: half the work in each. That is not a scenario we can serve, so we refuse
 * to activate and say so, rather than silently writing a hierarchy into the wrong database.
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a ONE-SHOT install procedure that
 * MUTATES THE MACHINE — config files, a database restore, root credentials, a
 * 126 MB hierarchy import, or a process restart. Blocked by DANGER, not by
 * fixture: the hermetic logic in the same subsystem (deriveLangConfig,
 * pgBinaryCandidates, the hierarchy_meta readers) IS gated
 * (test/unit/tier1_install_native.test.ts).
 */
export async function installHierarchies(
	tlds: string[],
	conn?: DbConnDescriptor,
	userId = -1,
	options: InstallHierarchiesOptions = {},
): Promise<InstallHierarchiesResult> {
	const connection = conn ?? connFromConfig();
	const run: BatchRun = {
		connection,
		replace: options.replace === true,
		importDir: options.importDir ?? HIERARCHY_IMPORT_DIR,
		engineOwnsTarget: connection.database === config.db.database,
		userId,
		signal: options.signal,
	};
	const selection = closedSelection(tlds, run);
	const responses: HierarchyImportResponse[] = [];
	const errors: string[] = [...selection.refusals];
	for (const tld of selection.batch) {
		const outcome =
			run.signal?.aborted === true
				? failedTld(tld, 'not run — the operation was aborted; nothing changed')
				: await tldOutcome(tld, run);
		responses.push(outcome.response);
		errors.push(...outcome.findings.map((error) => `${tld}: ${error}`));
	}
	const msg =
		selection.refusals.length > 0
			? 'Nothing installed: a selected thesaurus declares an ontology this installation does not have'
			: withNotes(
					batchMessage(selection.batch.length, responses, errors.length, run.replace),
					selection.notes,
				);
	return { ok: errors.length === 0, msg, errors, responses };
}

/** What every tld of one batch shares. */
interface BatchRun {
	connection: DbConnDescriptor;
	replace: boolean;
	importDir: string;
	engineOwnsTarget: boolean;
	userId: number;
	/** The caller's stop (InstallHierarchiesOptions.signal). */
	signal?: AbortSignal;
}

/**
 * THE CHOSEN THESAURI'S OWN DECLARATIONS (see the header): the batch an install
 * runs, checked against them before anything is written — the batch is the
 * selection (nothing added; a mandatory thesaurus left out is a warning note),
 * a declared mandatory ONTOLOGY this installation lacks REFUSES it whole
 * (`refusals`, empty `batch`). A reset re-seeds exactly what was selected (it
 * installs nothing new).
 */
function closedSelection(
	tlds: string[],
	run: BatchRun,
): { batch: string[]; notes: string[]; refusals: string[] } {
	if (run.replace) return { batch: tlds, notes: [], refusals: [] };
	const closure = withThesaurusDependencies(tlds, { dir: run.importDir });
	if (closure.errors.length > 0) return { batch: [], notes: [], refusals: closure.errors };
	return {
		batch: closure.hierarchies,
		notes: [...closure.notes, ...closure.warnings],
		refusals: [],
	};
}

/** One tld of the batch: refused (invalid), core (activation only) or optional. */
async function tldOutcome(tld: string, run: BatchRun): Promise<TldOutcome> {
	if (!safeTld(tld)) return failedTld(tld, 'invalid tld');
	if (isCoreHierarchyTld(tld)) {
		return coreHierarchyOutcome(tld, run.replace, run.engineOwnsTarget, run.userId);
	}
	return optionalHierarchyOutcome(
		run.connection,
		tld,
		{ replace: run.replace, importDir: run.importDir, signal: run.signal },
		run.engineOwnsTarget,
		run.userId,
	);
}

/** `msg (note; note)` — or `msg` alone. */
function withNotes(msg: string, notes: readonly string[]): string {
	return notes.length > 0 ? `${msg} (${notes.join('; ')})` : msg;
}
