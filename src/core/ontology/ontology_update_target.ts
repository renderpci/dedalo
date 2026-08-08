/**
 * Two pure-ish halves of the UPDATE_PROCESS Phase 2 orchestrator
 * (`ontology_update.ts` updateOntology), extracted so they are reachable
 * WITHOUT the ONTOLOGY_SERVERS / IS_AN_ONTOLOGY_SERVER config the live
 * orchestrator returns on:
 *
 *   1. resolveUpdateTarget  — WC-023 D5: the network target is re-resolved
 *      from the CONFIG catalog by code; the client-supplied `server.url` is
 *      never trusted (it is ignored entirely).
 *   2. stageOntologyFiles   — Phase A: download (or copy, for a local master)
 *      every manifest file into the staging dir, gunzip under caps, sanity
 *      check the COPY payload, and build the StagedFile list. Wholly
 *      non-destructive and fully abortable — nothing here touches the DB.
 *
 * `stageOntologyFiles` RECOMPUTES each file's `section_tipo` from its tld
 * (`es` → `es0`, `matrix_dd` → `matrix_dd`): the options schema still accepts
 * a client `section_tipo`, so honouring it would let an `es` package aim its
 * scoped DELETE at `dd0`. The recompute is the guard.
 */

import { cpSync, statSync } from 'node:fs';
import { MATRIX_COPY_COLUMNS } from '../db/matrix_write.ts';
import {
	confinedPath,
	copySanityCheck,
	downloadRemoteOntologyFile,
	gunzipWithCaps,
} from './data_io_import.ts';

/** One manifest entry as the client sends it (updateOntologyOptionsSchema shape). */
export interface OntologyUpdateFile {
	tld: string;
	/** Accepted by the schema but IGNORED — recomputed from `tld`. */
	section_tipo?: string | undefined;
	url: string;
	typology_id?: number | string | null | undefined;
	name_data?: unknown;
}

export interface StagedFile {
	tld: string;
	/** RECOMPUTED from the tld — never the client's value. */
	sectionTipo: string;
	/** Decompressed, sanity-checked `.copy` payload ready for \copy. */
	stagedPath: string;
	typologyId?: number | string | null;
	nameData?: unknown;
}

/** The config catalog slice resolveUpdateTarget adjudicates against. */
export interface OntologyUpdateCatalog {
	readonly servers: readonly { readonly code: string; readonly url: string }[];
	readonly isOntologyServer: boolean;
}

export interface UpdateTarget {
	isLocal: boolean;
	configuredOrigin: string | null;
}

/**
 * Match the client-selected server against the configured catalog by CODE, or
 * accept the `localhost` pseudo-server when this instance is itself an
 * ontology master. Returns the resolved target, or the refusal
 * (`error` + the operator-facing `msg`).
 */
export function resolveUpdateTarget(
	server: { name: string; url: string; code: string },
	catalog: OntologyUpdateCatalog,
): UpdateTarget | { error: string; msg: string } {
	const isLocal = server.code === 'localhost' && catalog.isOntologyServer;
	const configured = catalog.servers.find((entry) => entry.code === server.code);
	if (!isLocal && configured === undefined) {
		return {
			error: `unknown ontology server code: ${server.code}`,
			msg: 'Error. The selected server is not configured on this instance',
		};
	}
	const configuredOrigin = isLocal ? null : new URL((configured as { url: string }).url).origin;
	return { isLocal, configuredOrigin };
}

/**
 * Phase A — stage EVERY manifest file (non-destructive, fully abortable).
 * The caller owns the staging dir lifecycle (create before, remove after).
 * Failure returns `{errors, msg?}`; a missing `msg` means the caller keeps its
 * current message (PHP/TS parity with the inline original).
 */
export async function stageOntologyFiles(
	files: readonly OntologyUpdateFile[],
	target: UpdateTarget,
	dirs: { ioPath: string; stagingDir: string },
): Promise<{ staged: StagedFile[]; messages: string[] } | { errors: string[]; msg?: string }> {
	const { isLocal, configuredOrigin } = target;
	const { ioPath, stagingDir } = dirs;
	const messages: string[] = [];
	const staged: StagedFile[] = [];
	const seenTlds = new Set<string>();
	for (const file of files) {
		if (seenTlds.has(file.tld)) {
			return { errors: [`duplicate tld in file list: ${file.tld}`] };
		}
		seenTlds.add(file.tld);
		const expectedBasename = `${file.tld}.copy.gz`;
		const gzPath = confinedPath(stagingDir, expectedBasename);
		if (gzPath === null) {
			return { errors: [`unconfined staging name: ${expectedBasename}`] };
		}
		if (isLocal) {
			// Local-package source: the files already sit in the IO dir —
			// no self-HTTP round trip (wire-invisible shortcut).
			const source = confinedPath(ioPath, expectedBasename);
			if (source === null || !statSafe(source)) {
				return {
					errors: [`local ontology file missing: ${expectedBasename}`],
					msg: `Error. Local ontology file missing: ${expectedBasename}`,
				};
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
				return {
					errors: [...downloaded.errors],
					msg: `Error. Download failed for ${expectedBasename}`,
				};
			}
		}
		const stagedPath = gzPath.slice(0, -'.gz'.length);
		await gunzipWithCaps(gzPath, stagedPath);
		const sanity = copySanityCheck(stagedPath, MATRIX_COPY_COLUMNS.length);
		if (sanity !== null) {
			return {
				errors: [`${expectedBasename}: ${sanity}`],
				msg: `Error. Staged file failed validation: ${expectedBasename}`,
			};
		}
		staged.push({
			tld: file.tld,
			sectionTipo: file.tld === 'matrix_dd' ? 'matrix_dd' : `${file.tld}0`,
			stagedPath,
			typologyId: file.typology_id ?? null,
			nameData: file.name_data ?? null,
		});
	}
	return { staged, messages };
}

function statSafe(path: string): boolean {
	try {
		return statSync(path).size >= 0;
	} catch {
		return false;
	}
}
