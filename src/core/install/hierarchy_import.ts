/**
 * install_hierarchies (PHP installer_hierarchy_manager). For each selected TLD,
 * import its vendored `<tld>1.copy.gz` (thesaurus terms) and optional
 * `<tld>2.copy.gz` (models) into matrix_hierarchy, re-consolidate the counter,
 * then provision the virtual ontology sections via the already-ported
 * generateVirtualSection.
 *
 * The import forces the target table to `matrix_hierarchy` regardless of the
 * file's own section_tipo (PHP parity — avoids the lg1→matrix_langs mis-route),
 * using `\copy … FROM STDIN` through psql (the sanctioned subprocess pattern).
 *
 * Login-gated (the router checks the session): a fresh install reaches this only
 * after the in-wizard root login. Selecting no hierarchies is valid (the seed
 * already carries the core ontology).
 *
 * SCOPE (ledgered): this imports the hierarchy DATA (term/model records) and
 * realigns the counters. Full THESAURUS ACTIVATION — registering the hierarchy
 * in the hierarchy1 master and provisioning the virtual ontology sections via
 * hierarchy_provision.generateVirtualSection so the tree is browsable in the UI
 * — is a documented follow-up (docs/install/ts_native_install.md). The core
 * install is complete without it; activation runs post-install via the thesaurus.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { MATRIX_COPY_COLUMNS } from '../db/matrix_write.ts';
import { safeTld } from '../ontology/data_io.ts';
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

/** Import + provision the selected hierarchies. `conn` defaults to config.db. */
export async function installHierarchies(
	tlds: string[],
	conn?: DbConnDescriptor,
): Promise<InstallHierarchiesResult> {
	const connection = conn ?? connFromConfig();
	const responses: HierarchyImportResponse[] = [];
	const errors: string[] = [];

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
		responses.push({ tld, result: true, msg: 'imported' });
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
