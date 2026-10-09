/**
 * install_hierarchies — the wizard's hierarchy step. For each selected OPTIONAL TLD: import
 * its vendored `<tld>1.copy.gz` (thesaurus terms) and optional `<tld>2.copy.gz` (models)
 * into matrix_hierarchy, re-consolidate the counter, then ACTIVATE it
 * (./hierarchy_activate.ts).
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
 * Login-gated (the router checks the session): a fresh install reaches this only after the
 * in-wizard root login. Selecting no optional hierarchy is valid (the seed already carries
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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { config } from '../../config/config.ts';
import { MATRIX_COPY_COLUMNS } from '../db/matrix_write.ts';
import { safeTld } from '../ontology/data_io.ts';
import { activateHierarchy } from './hierarchy_activate.ts';
import { type HierarchyMeta, hierarchyMetaByTld, isCoreHierarchyTld } from './hierarchy_meta.ts';
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
 * happened to each one; the router serves it as `ok(<ok>, {extend:{msg, errors,
 * responses}})` so the wizard keeps reading `result`/`msg`/`errors` through the
 * compat mirror and still gets the per-tld sentences (a thrown refusal would
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
 * Is this tld already imported? True when the `<tld>1` term section has any row in
 * matrix_hierarchy. `tld` is safeTld-validated before this runs, so the quoted literal
 * is safe. A probe failure (e.g. connection issue) returns false → the caller falls
 * through to the normal copy, whose own error is reported honestly.
 */
async function hierarchyRowsPresent(conn: DbConnDescriptor, tld: string): Promise<boolean> {
	const res = await runPsql(conn, [
		'-tAc',
		`SELECT 1 FROM ${HIERARCHY_TABLE} WHERE section_tipo = '${tld}1' LIMIT 1`,
	]).catch(() => null);
	return res !== null && res.exitCode === 0 && res.stdout === '1';
}

/** One seed file, decompressed: its COPY text, or the problem that kept it unread. */
function readSeedFile(
	importDir: string,
	fileName: string,
): { text: Uint8Array } | { problem: string } {
	const path = join(importDir, fileName);
	if (!existsSync(path)) return { problem: `missing import file ${fileName}` };
	try {
		return { text: gunzipSync(readFileSync(path)) };
	} catch (error) {
		// The raw zlib/fs text names absolute paths (SEC-17): it goes to the server log;
		// the report carries a deliberate sentence naming the file.
		console.error(`[install:hierarchy_import] read/decompress failed: ${fileName}`, error);
		return {
			problem: `decompress failed (${fileName}): the file could not be read as a gzip archive — see the server log`,
		};
	}
}

/** `\copy … FROM STDIN` of one COPY text, inline in a psql script (its data ends at `\.`). */
function inlineCopy(text: Uint8Array): Buffer[] {
	const copyCmd = `\\copy ${HIERARCHY_TABLE} (${MATRIX_COPY_COLUMNS.join(', ')}) FROM STDIN\n`;
	const endsWithNewline = text.length === 0 || text[text.length - 1] === 0x0a;
	// COPY text format escapes every backslash in the data, so no data line can
	// be the bare `\.` terminator.
	return [
		Buffer.from(copyCmd),
		Buffer.from(text),
		Buffer.from(endsWithNewline ? '\\.\n' : '\n\\.\n'),
	];
}

/**
 * The IMPORT half of one tld (no activation) — ONE ATOMIC UNIT (OPS-6/PERF-11
 * review): every write of the tld runs in ONE psql session under
 * `--single-transaction` + `ON_ERROR_STOP`, so it applies whole or not at all:
 *   (replace) the scoped DELETE of every `<tld>N` section (the PHP pre-delete,
 *   backup::import_from_copy_file — destructive by design, the caller confirmed
 *   it), the terms `\copy` (`<tld>1.copy.gz`, required), the models `\copy`
 *   (`<tld>2.copy.gz`, when the file exists) and the counter realignment.
 * Each used to be its own psql call: a terms file that failed to load left the
 * hierarchy DELETED (operator edits and additions gone, the seed not restored),
 * a failed models file and a failed counter were ignored and the tld reported
 * imported. Both seed files are read and decompressed BEFORE anything is sent.
 * Without `replace`, a tld whose `<tld>1` rows exist is skipped (the raw `\copy`
 * is insert-only). Table FORCED to matrix_hierarchy (PHP parity), explicit
 * column order. Gate: test/unit/hierarchy_import_atomic_native.test.ts.
 */
export async function importHierarchyRows(
	conn: DbConnDescriptor,
	tld: string,
	options: { replace?: boolean; importDir?: string } = {},
): Promise<{ ok: boolean; msg: string; skipped?: boolean }> {
	const replace = options.replace === true;
	if (!replace && (await hierarchyRowsPresent(conn, tld))) {
		return { ok: true, msg: 'already installed — skipped', skipped: true };
	}
	const seeds = readSeedFiles(options.importDir ?? HIERARCHY_IMPORT_DIR, tld);
	if ('problem' in seeds) return { ok: false, msg: seeds.problem };
	const res = await runImportUnit(conn, tld, replace, seeds);
	if (res.exitCode === 0) return { ok: true, msg: 'copied' };
	return { ok: false, msg: failedImportMessage(replace, res) };
}

/**
 * THE WRITE: the tld's whole import as ONE psql session, one transaction —
 * (reset) the scoped DELETE, the terms and models `\copy`, the counter. A
 * failing statement stops the script (ON_ERROR_STOP) and rolls all of it back.
 */
function runImportUnit(
	conn: DbConnDescriptor,
	tld: string,
	replace: boolean,
	seeds: SeedFiles,
): Promise<PsqlRunResult> {
	const reset = replace
		? [Buffer.from(`DELETE FROM ${HIERARCHY_TABLE} WHERE section_tipo ~ '^${tld}[0-9]+$';\n`)]
		: [];
	const models = seeds.models === null ? [] : inlineCopy(seeds.models);
	const script = Buffer.concat([
		...reset,
		...inlineCopy(seeds.terms),
		...models,
		Buffer.from(`${consolidateCounterSql(tld)}\n`),
	]);
	return runPsql(conn, ['-v', 'ON_ERROR_STOP=1', '--single-transaction', '--quiet', '-f', '-'], {
		stdin: script,
	});
}

/** The decompressed seeds of a tld (models optional). */
interface SeedFiles {
	terms: Uint8Array;
	models: Uint8Array | null;
}

/** Both seed files of a tld, read and decompressed, or the problem that kept one unread. */
function readSeedFiles(importDir: string, tld: string): SeedFiles | { problem: string } {
	const terms = readSeedFile(importDir, `${tld}1.copy.gz`);
	if ('problem' in terms) return terms;
	if (!existsSync(join(importDir, `${tld}2.copy.gz`))) return { terms: terms.text, models: null };
	const models = readSeedFile(importDir, `${tld}2.copy.gz`);
	return 'problem' in models ? models : { terms: terms.text, models: models.text };
}

/** A failed import unit rolled back whole: nothing of the tld changed. */
function failedImportMessage(replace: boolean, res: PsqlRunResult): string {
	const step = replace ? 'reset failed — nothing changed' : 'import failed — nothing imported';
	return `${step}: ${res.stderr || `psql exited ${res.exitCode}`}`;
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
	const activation = await activateHierarchy(hierarchyMetaByTld(tld) as HierarchyMeta, userId);
	if (!activation.ok) {
		return failedTld(tld, `core hierarchy — activation failed: ${activation.errors.join('; ')}`);
	}
	const msg = 'core hierarchy — activated (its terms ship in the seed; never imported)';
	return { response: { tld, ok: true, msg }, findings: [] };
}

/**
 * ACTIVATION of a freshly imported tld (installer_hierarchy_manager::activate_hierarchy):
 * flag the hierarchy active and provision its ontology, so it is usable at the first
 * login. The descriptor drives it; an unregistered tld has no typology to provision with.
 */
async function activateImported(
	tld: string,
	replace: boolean,
	userId: number,
): Promise<TldOutcome> {
	const meta = hierarchyMetaByTld(tld);
	if (meta === null) {
		return failedTld(tld, 'imported, but not registered in hierarchies.json — not activated', [
			'not registered in hierarchies.json; activation skipped',
		]);
	}
	const activation = await activateHierarchy(meta, userId);
	if (!activation.ok) {
		return failedTld(
			tld,
			`imported, activation failed: ${activation.errors.join('; ')}`,
			activation.errors,
		);
	}
	const msg = replace ? 'reset and activated' : 'imported and activated';
	return { response: { tld, ok: true, msg }, findings: [] };
}

/** An OPTIONAL tld: import (or skip / reset), then activate. */
async function optionalHierarchyOutcome(
	connection: DbConnDescriptor,
	tld: string,
	replace: boolean,
	engineOwnsTarget: boolean,
	userId: number,
): Promise<TldOutcome> {
	const imported = await importHierarchyRows(connection, tld, { replace });
	if (imported.skipped === true) {
		return { response: { tld, ok: true, msg: imported.msg, skipped: true }, findings: [] };
	}
	if (!imported.ok) return failedTld(tld, imported.msg);
	// The engine's writes land in the CONFIGURED database. When the import target is a
	// different one, activating would write into the wrong DB — refuse, loudly.
	if (!engineOwnsTarget) {
		return failedTld(
			tld,
			`imported into '${connection.database}', NOT activated: the engine writes to '${config.db.database}'`,
			[
				`activation skipped — the import target '${connection.database}' is not the engine's database ('${config.db.database}')`,
			],
		);
	}
	return activateImported(tld, replace, userId);
}

/** The batch sentence the wizard shows. */
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
 * that same database — which the wizard always does (it passes no conn at all). A caller
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
 * installIpAllowed, resolvePgBinary, the hierarchy_meta readers) IS gated
 * (test/unit/tier1_install_native.test.ts).
 */
export async function installHierarchies(
	tlds: string[],
	conn?: DbConnDescriptor,
	userId = -1,
	options: InstallHierarchiesOptions = {},
): Promise<InstallHierarchiesResult> {
	const connection = conn ?? connFromConfig();
	const replace = options.replace === true;
	const responses: HierarchyImportResponse[] = [];
	const errors: string[] = [];
	const engineOwnsTarget = connection.database === config.db.database;

	for (const tld of tlds) {
		let outcome: TldOutcome;
		if (!safeTld(tld)) outcome = failedTld(tld, 'invalid tld');
		else if (isCoreHierarchyTld(tld)) {
			outcome = await coreHierarchyOutcome(tld, replace, engineOwnsTarget, userId);
		} else {
			outcome = await optionalHierarchyOutcome(connection, tld, replace, engineOwnsTarget, userId);
		}
		responses.push(outcome.response);
		errors.push(...outcome.findings.map((error) => `${tld}: ${error}`));
	}

	return {
		ok: errors.length === 0,
		msg: batchMessage(tlds.length, responses, errors.length, replace),
		errors,
		responses,
	};
}
