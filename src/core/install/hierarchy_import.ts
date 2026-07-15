/**
 * install_hierarchies — the wizard's hierarchy step. For each selected TLD: import its
 * vendored `<tld>1.copy.gz` (thesaurus terms) and optional `<tld>2.copy.gz` (models) into
 * matrix_hierarchy, re-consolidate the counter, then ACTIVATE it (./hierarchy_activate.ts).
 *
 * The import forces the target table to `matrix_hierarchy` regardless of the file's own
 * section_tipo — avoiding the lg1→matrix_langs mis-route, where `lg1` is ALSO a core
 * section whose own table is matrix_langs, so resolving the table from the tipo would COPY
 * the rows somewhere the activated hierarchy never reads (they would import "successfully"
 * into an empty-looking hierarchy). Uses `\copy … FROM STDIN` through psql (the sanctioned
 * subprocess pattern).
 *
 * Login-gated (the router checks the session): a fresh install reaches this only after the
 * in-wizard root login. Selecting no hierarchies is valid (the seed already carries the
 * core ontology).
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
import { hierarchyMetaByTld } from './hierarchy_meta.ts';
import { HIERARCHY_IMPORT_DIR } from './paths.ts';
import { type DbConnDescriptor, connFromConfig, runPsql } from './pg_exec.ts';

const HIERARCHY_TABLE = 'matrix_hierarchy';

export interface HierarchyImportResponse {
	tld: string;
	result: boolean;
	msg: string;
}

export interface InstallHierarchiesResult {
	result: boolean;
	msg: string;
	errors: string[];
	responses: HierarchyImportResponse[];
}

/** Load one `<name>.copy.gz` into matrix_hierarchy via \copy FROM STDIN. */
async function importCopyFile(
	conn: DbConnDescriptor,
	fileName: string,
): Promise<{ ok: boolean; msg: string }> {
	const path = join(HIERARCHY_IMPORT_DIR, fileName);
	if (!existsSync(path)) return { ok: false, msg: `missing import file ${fileName}` };
	let text: Uint8Array;
	try {
		text = gunzipSync(readFileSync(path));
	} catch (error) {
		return { ok: false, msg: `decompress failed: ${(error as Error).message}` };
	}
	// Table FORCED to matrix_hierarchy (PHP parity), explicit column order.
	const copyCmd = `\\copy ${HIERARCHY_TABLE} (${MATRIX_COPY_COLUMNS.join(', ')}) FROM STDIN`;
	const res = await runPsql(conn, ['-v', 'ON_ERROR_STOP=1', '-c', copyCmd], { stdin: text });
	if (res.exitCode !== 0) return { ok: false, msg: res.stderr || 'copy failed' };
	return { ok: true, msg: 'copied' };
}

/**
 * Realign matrix_counter after a raw COPY: for EVERY imported section_tipo of
 * this tld (e.g. es1, es2), set the counter to MAX(section_id) so the next
 * insert allocates a fresh id. `tld` is safeTld-validated before this runs, so
 * the anchored regex literal is safe to embed.
 */
async function consolidateHierarchyCounter(conn: DbConnDescriptor, tld: string): Promise<void> {
	const sql = `INSERT INTO matrix_counter (tipo, value)
		SELECT section_tipo, MAX(section_id)
		  FROM ${HIERARCHY_TABLE} WHERE section_tipo ~ '^${tld}[0-9]+$'
		  GROUP BY section_tipo
		ON CONFLICT (tipo) DO UPDATE
		  SET value = GREATEST(matrix_counter.value, EXCLUDED.value);`;
	await runPsql(conn, ['-v', 'ON_ERROR_STOP=1', '-c', sql]).catch(() => {});
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
export async function installHierarchies(
	tlds: string[],
	conn?: DbConnDescriptor,
	userId = -1,
): Promise<InstallHierarchiesResult> {
	const connection = conn ?? connFromConfig();
	const responses: HierarchyImportResponse[] = [];
	const errors: string[] = [];
	const engineOwnsTarget = connection.database === config.db.database;

	for (const tld of tlds) {
		if (!safeTld(tld)) {
			responses.push({ tld, result: false, msg: 'invalid tld' });
			errors.push(`${tld}: invalid tld`);
			continue;
		}
		// Terms file is required; the model file is optional.
		const terms = await importCopyFile(connection, `${tld}1.copy.gz`);
		if (!terms.ok) {
			responses.push({ tld, result: false, msg: terms.msg });
			errors.push(`${tld}: ${terms.msg}`);
			continue;
		}
		if (existsSync(join(HIERARCHY_IMPORT_DIR, `${tld}2.copy.gz`))) {
			await importCopyFile(connection, `${tld}2.copy.gz`); // best-effort model import
		}
		await consolidateHierarchyCounter(connection, tld);

		// The engine's writes land in the CONFIGURED database. When the import target is a
		// different one, activating would write into the wrong DB — refuse, loudly.
		if (!engineOwnsTarget) {
			responses.push({
				tld,
				result: false,
				msg: `imported into '${connection.database}', NOT activated: the engine writes to '${config.db.database}'`,
			});
			errors.push(
				`${tld}: activation skipped — the import target '${connection.database}' is not the engine's database ('${config.db.database}')`,
			);
			continue;
		}

		// ACTIVATION (installer_hierarchy_manager::activate_hierarchy): flag the hierarchy
		// active and provision its ontology, so it is usable at the first login.
		// The descriptor drives it; an unregistered tld has no typology to provision with.
		const meta = hierarchyMetaByTld(tld);
		if (meta === null) {
			responses.push({
				tld,
				result: false,
				msg: 'imported, but not registered in hierarchies.json — not activated',
			});
			errors.push(`${tld}: not registered in hierarchies.json; activation skipped`);
			continue;
		}
		const activation = await activateHierarchy(meta, userId);
		if (!activation.result) {
			responses.push({
				tld,
				result: false,
				msg: `imported, activation failed: ${activation.errors.join('; ')}`,
			});
			errors.push(...activation.errors.map((error) => `${tld}: ${error}`));
			continue;
		}
		responses.push({ tld, result: true, msg: 'imported and activated' });
	}

	return {
		result: errors.length === 0,
		msg:
			errors.length === 0
				? `Imported ${responses.filter((r) => r.result).length} hierarchy(ies)`
				: `${errors.length} hierarchy(ies) failed`,
		errors,
		responses,
	};
}
