/**
 * Ontology UPDATE orchestrator (UPDATE_PROCESS Phase 2) — the TS twin of PHP
 * widgets/update_ontology::update_ontology(). Options come from the
 * byte-identical client: `{server, files, info}` — the CLIENT fetched the
 * manifest from the selected master and built the file list (matrix_dd
 * prepended); this engine validates, stages, and imports.
 *
 * PHP step order preserved: download per file → per-TLD import branch
 * (matrix_dd = whole-table private lists; others = add_main_section +
 * create_dd_ontology_root + scoped import + counter) → dd_ontology reindex
 * per TLD → schema snapshot → optimize tables → cache purge → schema-changes
 * file (hard-fail on write error) → root_info read-back.
 *
 * STRICTER THAN PHP (WC-023): the selected server is RE-RESOLVED from the
 * config catalog (never trusted from the client); everything is staged and
 * validated BEFORE the first destructive statement; a per-table recovery
 * snapshot is taken before import and AUTO-RESTORED on failure; each file's
 * DELETE+COPY is one transaction. PHP's per-file partial success
 * (result:true with errors) is replaced by all-or-nothing semantics.
 * TS-N/A steps (PHP session wipe, static JS lang-file regen, backend
 * activity row): the TS engine has no static session caches or generated
 * lang files — labels are DB-derived and in-process caches are purged via
 * clearOntologyDerivedCaches; the activity row is not ported (ledgered).
 */

import { cpSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { config } from '../../config/config.ts';
import { privateDir } from '../../config/env.ts';
import { readDdOntologyRow, searchDdOntology } from '../db/dd_ontology.ts';
import { MATRIX_COPY_COLUMNS } from '../db/matrix_write.ts';
import { type DbConnDescriptor, connFromConfig, runPsql } from '../install/pg_exec.ts';
import { engineOwnsInstall } from '../update/ownership.ts';
import { clearOntologyDerivedCaches } from './cache_invalidation.ts';
import { setOntologyIoPath } from './data_io.ts';
import {
	MAX_MANIFEST_FILES,
	type OntologyIoResponse,
	assertTlsVerificationOn,
	confinedPath,
	consolidateSectionCounter,
	copySanityCheck,
	downloadRemoteOntologyFile,
	gunzipWithCaps,
	importFromCopyFile,
} from './data_io_import.ts';
import { termByTipo } from './labels.ts';
import {
	addMainSection,
	createDdOntologyRootNode,
	setRecordsInDdOntology,
} from './ontology_write.ts';
import { getOrderedSubtree } from './resolver.ts';

const DEDALO_ROOT_TIPO = 'dd1';
const OPTIMIZE_TABLES = ['dd_ontology', 'matrix_ontology', 'matrix_ontology_main', 'matrix_dd'];

/**
 * section tipo → recursive descendant tipos (PHP
 * hierarchy::get_simple_schema_of_sections). Built on the ONE consolidated
 * ontology walk (resolver getOrderedSubtree, crossSections — the T3 ratchet
 * rule); sections with no children map to [].
 */
async function getSimpleSchemaOfSections(): Promise<Record<string, string[]>> {
	const sections = await searchDdOntology({ model: 'section' }, true);
	const schema: Record<string, string[]> = {};
	for (const sectionTipo of sections) {
		const subtree = await getOrderedSubtree(sectionTipo, { crossSections: true });
		schema[sectionTipo] = subtree.map((node) => node.tipo).sort();
	}
	return schema;
}

/** Client options (PHP $options): the selected server + the built file list. */
export const updateOntologyOptionsSchema = z.object({
	server: z.object({ name: z.string(), url: z.string().url(), code: z.string() }),
	files: z
		.array(
			z.object({
				tld: z.string().regex(/^(?:[a-z]{2,}|matrix_dd)$/),
				section_tipo: z
					.string()
					.regex(/^[a-zA-Z0-9_]+$/)
					.optional(),
				url: z.string().url(),
				typology_id: z.union([z.number(), z.string()]).nullish(),
				name_data: z.unknown().nullish(),
			}),
		)
		.min(1)
		.max(MAX_MANIFEST_FILES),
	info: z.unknown().nullish(),
});
export type UpdateOntologyOptions = z.infer<typeof updateOntologyOptionsSchema>;

/** Single-flight latch — two concurrent runs must never interleave DELETEs. */
let updateInFlight = false;

interface StagedFile {
	tld: string;
	/** RECOMPUTED from the tld — never the client's value. */
	sectionTipo: string;
	/** Decompressed, sanity-checked `.copy` payload ready for \copy. */
	stagedPath: string;
	typologyId?: number | string | null;
	nameData?: unknown;
}

/**
 * PHP hierarchy::save_simple_schema_file — additions-only diff of the section
 * schema, written under <private>/backups/ontology/changes/. Only a
 * FILESYSTEM failure fails (the diff itself always succeeds, PHP parity).
 */
export function saveSimpleSchemaFile(
	oldSchema: Record<string, string[]>,
	newSchema: Record<string, string[]>,
	dirPath: string = join(privateDir, 'backups', 'ontology', 'changes'),
): { result: boolean; msg: string; errors: string[]; filepath?: string } {
	const changes: { tipo: string; children_added: string[] }[] = [];
	for (const [tipo, children] of Object.entries(newSchema)) {
		const before = new Set(oldSchema[tipo] ?? []);
		const added = children.filter((child) => !before.has(child));
		if (added.length > 0) changes.push({ tipo, children_added: added });
	}
	const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-');
	const name = `simple_schema_changes_${stamp}.json`;
	try {
		mkdirSync(dirPath, { recursive: true, mode: 0o750 });
	} catch {
		return {
			result: false,
			msg: `Error on read or create directory. Permission denied (${dirPath})`,
			errors: [`unable to create ${dirPath}`],
		};
	}
	const filepath = join(dirPath, name);
	try {
		writeFileSync(filepath, JSON.stringify(changes));
	} catch {
		return {
			result: false,
			msg: `Error on read or create file of simple schema changes. Permission denied (${filepath})`,
			errors: [`unable to write ${filepath}`],
		};
	}
	return { result: true, msg: 'OK. Request successfully processed', errors: [], filepath };
}

/** Snapshot one table's rows (whole or tipo-scoped) to a plain `.copy` file. */
async function snapshotTableRows(
	table: 'matrix_ontology' | 'matrix_dd',
	sectionTipo: string | null,
	outFile: string,
	conn: DbConnDescriptor,
): Promise<boolean> {
	const columns = MATRIX_COPY_COLUMNS.map((column) => `"${column}"`).join(',');
	const where = sectionTipo === null ? '' : ` WHERE section_tipo = :'tipo'`;
	const copy = `\\copy (SELECT ${columns} FROM "${table}"${where} ORDER BY section_id ASC) TO '${outFile}'`;
	const args = ['-v', 'ON_ERROR_STOP=1'];
	if (sectionTipo !== null) args.push('-v', `tipo=${sectionTipo}`);
	args.push('-c', copy);
	const run = await runPsql(conn, args);
	return run.exitCode === 0;
}

/** REINDEX + VACUUM ANALYZE each table (PHP db_tasks::optimize_tables). Non-fatal. */
async function optimizeTables(
	tables: readonly string[],
	conn: DbConnDescriptor,
): Promise<string[]> {
	const errors: string[] = [];
	for (const table of tables) {
		if (!/^[a-zA-Z0-9_.]+$/.test(table)) continue;
		const reindex = await runPsql(conn, ['-c', `REINDEX TABLE CONCURRENTLY ${table};`]);
		if (reindex.exitCode !== 0) errors.push(`REINDEX ${table}: ${reindex.stderr.trim()}`);
		const vacuum = await runPsql(conn, ['-c', `VACUUM ANALYZE ${table};`]);
		if (vacuum.exitCode !== 0) errors.push(`VACUUM ${table}: ${vacuum.stderr.trim()}`);
	}
	return errors;
}

/**
 * The full update pipeline. `userId` stamps the TM-audited registry writes.
 * `conn` is the psql seam for the COPY steps (tests); the dd_ontology rebuild
 * always runs on the configured pool.
 */
export async function updateOntology(
	rawOptions: unknown,
	userId: number,
	conn: DbConnDescriptor = connFromConfig(),
): Promise<OntologyIoResponse> {
	const response: OntologyIoResponse = {
		result: false,
		msg: 'Error. Request failed [update_ontology::update_ontology]',
		errors: [],
	};
	assertTlsVerificationOn();
	if (!engineOwnsInstall()) {
		response.errors.push('engine does not own the install');
		return response;
	}
	const parsed = updateOntologyOptionsSchema.safeParse(rawOptions);
	if (!parsed.success) {
		response.errors.push(
			`invalid options: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`,
		);
		return response;
	}
	const options = parsed.data;

	// The network target comes from the CONFIG catalog, never the client
	// (WC-023 D5): match the selected server by code, or the localhost
	// pseudo-server when this instance is an ontology master.
	const isLocal = options.server.code === 'localhost' && config.ontologyIo.isOntologyServer;
	const configured = config.ontologyIo.servers.find((entry) => entry.code === options.server.code);
	if (!isLocal && configured === undefined) {
		response.errors.push(`unknown ontology server code: ${options.server.code}`);
		response.msg = 'Error. The selected server is not configured on this instance';
		return response;
	}
	const configuredOrigin = isLocal ? null : new URL((configured as { url: string }).url).origin;

	if (updateInFlight) {
		response.errors.push('an ontology update is already running');
		response.msg = 'Error. An ontology update is already running';
		return response;
	}
	updateInFlight = true;

	const ioPath = setOntologyIoPath();
	if (ioPath === false) {
		updateInFlight = false;
		response.errors.push('unable to resolve the ontology IO directory');
		return response;
	}
	const stagingDir = join(ioPath, '.staging');
	const recoveryDir = join(ioPath, 'recovery', String(Date.now()));
	const messages: string[] = [];
	const mutated: StagedFile[] = [];

	try {
		// ------------------------------------------------------------------
		// Phase A — stage EVERYTHING (non-destructive, fully abortable)
		// ------------------------------------------------------------------
		rmSync(stagingDir, { recursive: true, force: true });
		mkdirSync(stagingDir, { recursive: true });
		const staged: StagedFile[] = [];
		const seenTlds = new Set<string>();
		for (const file of options.files) {
			if (seenTlds.has(file.tld)) {
				response.errors.push(`duplicate tld in file list: ${file.tld}`);
				return response;
			}
			seenTlds.add(file.tld);
			const expectedBasename = `${file.tld}.copy.gz`;
			const gzPath = confinedPath(stagingDir, expectedBasename);
			if (gzPath === null) {
				response.errors.push(`unconfined staging name: ${expectedBasename}`);
				return response;
			}
			if (isLocal) {
				// Local-package source: the files already sit in the IO dir —
				// no self-HTTP round trip (wire-invisible shortcut).
				const source = confinedPath(ioPath, expectedBasename);
				if (source === null || !statSafe(source)) {
					response.errors.push(`local ontology file missing: ${expectedBasename}`);
					response.msg = `Error. Local ontology file missing: ${expectedBasename}`;
					return response;
				}
				cpSync(source, gzPath);
			} else {
				const downloaded = await downloadRemoteOntologyFile({
					url: file.url,
					configuredOrigin: configuredOrigin as string,
					expectedBasename,
					targetDir: stagingDir,
				});
				messages.push(downloaded.msg);
				if (downloaded.result !== true) {
					response.errors.push(...downloaded.errors);
					response.msg = `Error. Download failed for ${expectedBasename}`;
					return response;
				}
			}
			const stagedPath = gzPath.slice(0, -'.gz'.length);
			await gunzipWithCaps(gzPath, stagedPath);
			const sanity = copySanityCheck(stagedPath, MATRIX_COPY_COLUMNS.length);
			if (sanity !== null) {
				response.errors.push(`${expectedBasename}: ${sanity}`);
				response.msg = `Error. Staged file failed validation: ${expectedBasename}`;
				return response;
			}
			staged.push({
				tld: file.tld,
				sectionTipo: file.tld === 'matrix_dd' ? 'matrix_dd' : `${file.tld}0`,
				stagedPath,
				typologyId: file.typology_id ?? null,
				nameData: file.name_data ?? null,
			});
		}

		// ------------------------------------------------------------------
		// Phase B — recovery snapshot BEFORE the first destructive statement
		// ------------------------------------------------------------------
		mkdirSync(recoveryDir, { recursive: true });
		for (const file of staged) {
			const outFile = confinedPath(recoveryDir, `${file.tld}.copy`);
			if (outFile === null) {
				response.errors.push(`unconfined recovery path for ${file.tld}`);
				return response;
			}
			const ok =
				file.tld === 'matrix_dd'
					? await snapshotTableRows('matrix_dd', null, outFile, conn)
					: await snapshotTableRows('matrix_ontology', file.sectionTipo, outFile, conn);
			if (!ok) {
				response.errors.push(`recovery snapshot failed for ${file.tld}`);
				response.msg = 'Error. Recovery snapshot failed — database untouched';
				return response;
			}
		}

		// ------------------------------------------------------------------
		// Phase C — import (destructive; per-file txn; auto-restore on failure)
		// ------------------------------------------------------------------
		for (const file of staged) {
			if (file.tld === 'matrix_dd') {
				const imported = await importFromCopyFile({
					filePath: file.stagedPath,
					matrixTable: 'matrix_dd',
					deleteTable: true,
					conn,
				});
				messages.push(imported.msg);
				if (imported.result !== true) {
					response.errors.push(...imported.errors);
					await restoreSnapshots(mutated.concat(file), recoveryDir, conn, response.errors);
					response.msg = 'Error. Import failed — previous state restored';
					return response;
				}
				mutated.push(file);
				continue;
			}
			// PHP order: registry record + root node BEFORE the row import.
			await addMainSection(
				{
					tld: file.tld,
					section_tipo: file.sectionTipo,
					typology_id: file.typologyId ?? undefined,
					name_data: file.nameData,
				} as Parameters<typeof addMainSection>[0],
				userId,
			);
			await createDdOntologyRootNode(
				{ tld: file.tld, section_tipo: file.sectionTipo } as Parameters<
					typeof createDdOntologyRootNode
				>[0],
				userId,
			);
			const imported = await importFromCopyFile({
				sectionTipo: file.sectionTipo,
				filePath: file.stagedPath,
				matrixTable: 'matrix_ontology',
				conn,
			});
			messages.push(imported.msg);
			if (imported.result !== true) {
				response.errors.push(...imported.errors);
				await restoreSnapshots(mutated.concat(file), recoveryDir, conn, response.errors);
				response.msg = 'Error. Import failed — previous state restored';
				return response;
			}
			if (!(await consolidateSectionCounter(file.sectionTipo, 'matrix_ontology', conn))) {
				response.errors.push(`counter consolidation failed for ${file.sectionTipo}`);
			}
			mutated.push(file);
		}

		// dd_ontology flat-index rebuild per imported TLD (skip matrix_dd)
		for (const file of staged) {
			if (file.tld === 'matrix_dd') continue;
			const rebuilt = await setRecordsInDdOntology({ sectionTipo: file.sectionTipo, userId });
			messages.push(rebuilt.msg);
			if (rebuilt.result !== true) response.errors.push(...rebuilt.errors);
		}

		// PHP order: snapshot old schema AFTER import/reindex, BEFORE optimize.
		const oldSchema = await getSimpleSchemaOfSections();

		const optimizeErrors = await optimizeTables(OPTIMIZE_TABLES, conn);
		response.errors.push(...optimizeErrors);

		// TS analog of the PHP session wipe + dd_cache purge: the in-process
		// ontology-derived caches (labels are DB-derived — no lang files).
		await clearOntologyDerivedCaches();

		// schema-changes file — the ONE hard-fail tail step (PHP parity)
		const newSchema = await getSimpleSchemaOfSections();
		const schemaSaved = saveSimpleSchemaFile(oldSchema, newSchema);
		if (!schemaSaved.result) {
			response.result = false;
			response.msg = `Error saving simple_schema_file: ${schemaSaved.msg}`;
			response.errors.push(...schemaSaved.errors);
			return response;
		}
		messages.push(
			`OK. Saved a new simple schema changes file: ${basename(schemaSaved.filepath as string)}`,
		);

		// root_info read-back (dd1 term + properties)
		const rootRow = await readDdOntologyRow(DEDALO_ROOT_TIPO);
		const rootTerm = await termByTipo(DEDALO_ROOT_TIPO, config.lang.structureLang);
		response.root_info = {
			term: rootTerm,
			properties: (rootRow as { properties?: unknown } | null)?.properties ?? null,
		};

		response.result = true;
		response.msg = `${response.errors.length === 0 ? 'OK. Request done successfully' : 'Warning! Request done with errors'} ${messages.join('\n')}`;
		return response;
	} catch (error) {
		response.errors.push((error as Error).message);
		if (mutated.length > 0) {
			await restoreSnapshots(mutated, recoveryDir, conn, response.errors);
			response.msg = 'Error. Import failed — previous state restored';
		}
		return response;
	} finally {
		rmSync(stagingDir, { recursive: true, force: true });
		updateInFlight = false;
	}
}

/** Restore every mutated table from the Phase-B snapshots (best-effort, loud). */
async function restoreSnapshots(
	files: readonly StagedFile[],
	recoveryDir: string,
	conn: DbConnDescriptor,
	errors: string[],
): Promise<void> {
	for (const file of files) {
		const snapshot = confinedPath(recoveryDir, `${file.tld}.copy`);
		if (snapshot === null || !statSafe(snapshot)) {
			errors.push(`recovery snapshot missing for ${file.tld} — MANUAL RESTORE REQUIRED`);
			continue;
		}
		const restored = await importFromCopyFile(
			file.tld === 'matrix_dd'
				? { filePath: snapshot, matrixTable: 'matrix_dd', deleteTable: true, conn }
				: {
						filePath: snapshot,
						matrixTable: 'matrix_ontology',
						sectionTipo: file.sectionTipo,
						conn,
					},
		);
		if (restored.result !== true) {
			errors.push(
				`RESTORE FAILED for ${file.tld}: ${restored.errors.join('; ')} — MANUAL RESTORE REQUIRED from ${snapshot}`,
			);
		}
	}
}

function statSafe(path: string): boolean {
	try {
		return statSync(path).size >= 0;
	} catch {
		return false;
	}
}
