/**
 * Ontology data IO — the IMPORT/remote half (UPDATE_PROCESS Phase 2).
 * PHP twins: class.ontology_data_io.php check_remote_server /
 * get_ontology_update_info / download_remote_ontology_file / import_from_file
 * / import_private_lists_from_file, and backup::import_from_copy_file.
 * The export half lives in data_io.ts (its header ledgered these functions as
 * deferred — that deferral closes here).
 *
 * SECURITY POSTURE (Opus-reviewed design; deliberately STRICTER than PHP —
 * ledgered as WC-023):
 *  - TLS peer verification stays ON (PHP passes ssl_verifypeer=false; Bun
 *    fetch verifies by default; self-signed masters use NODE_EXTRA_CA_CERTS).
 *    The module refuses to run with NODE_TLS_REJECT_UNAUTHORIZED=0.
 *  - Downloads: redirect:'error', streamed byte ceilings + stall guard —
 *    never an unbounded buffer.
 *  - Filenames are NEVER taken from remote data: the basename is CONSTRUCTED
 *    from the validated tld and confined under the versioned IO dir.
 *  - Decompression is streamed with byte + ratio ceilings (zip-bomb guard);
 *    the decompressed payload gets a COPY-shape sanity check BEFORE any
 *    destructive SQL.
 *  - Each file's DELETE + \copy runs in ONE psql transaction
 *    (ON_ERROR_STOP) — a failed COPY rolls its DELETE back (PHP deletes
 *    first and can leave a half-emptied table).
 * Identifier discipline: target tables come from a 2-entry allowlist and the
 * column list is MATRIX_COPY_COLUMNS. In the COPY script the data-derived
 * section_tipo rides a psql -v variable (:'tipo'), never interpolation.
 * The two statement helpers that cannot use a variable —
 * consolidateSectionCounter and normalizeOntologyTld — interpolate a tld that
 * `safeTld`/`requiredOntologyTld` has already constrained to `^[a-z]{2,}$`, so
 * the value cannot carry a quote, a space or a semicolon by construction.
 */

import {
	closeSync,
	createWriteStream,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	rmSync,
	statSync,
} from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { createGunzip } from 'node:zlib';
import { z } from 'zod';
import { readEnv } from '../../config/env.ts';
import { MATRIX_COPY_COLUMNS } from '../db/matrix_write.ts';
import { connFromConfig, type DbConnDescriptor, runPsql } from '../install/pg_exec.ts';
import { isSafeSectionTipo, safeTld } from './data_io.ts';
import { DATA_NOLAN, ONTOLOGY_TLD } from './ontology_tipos.ts';
import { requiredOntologyTld } from './tld.ts';

// ---------------------------------------------------------------------------
// Limits (Opus design constants)
// ---------------------------------------------------------------------------

export const CHECK_TIMEOUT_MS = 5_000; // preflight probe (PHP parity: 5 s)
export const DOWNLOAD_TIMEOUT_MS = 600_000; // per-file total deadline (PHP parity: 600 s)
export const DOWNLOAD_STALL_TIMEOUT_MS = 60_000; // per-read idle guard (PHP has none)
export const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024; // per .copy.gz
export const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024; // hard ceiling
export const MAX_DECOMPRESSION_RATIO = 100; // out/in ceiling once in > 1 MiB
export const MAX_MANIFEST_FILES = 64;
const COPY_SANITY_LINES = 50;
const GZ_BASENAME_RE = /^(?:[a-z]{2,}|matrix|matrix_dd)\.copy\.gz$/;
const IMPORT_TABLE_ALLOWLIST: ReadonlySet<string> = new Set(['matrix_ontology', 'matrix_dd']);

/** The internal outcome every IO function returns (data_io.ts twin — `ok` is the discriminator, not a wire body). */
export interface OntologyIoResponse {
	ok: boolean;
	msg: string;
	errors: string[];
	[key: string]: unknown;
}

/** One configured ontology server (PHP ONTOLOGY_SERVERS entry). */
export interface OntologyServer {
	name: string;
	url: string;
	code: string;
}

/** One manifest file entry (PHP get_ontology_update_info files item). */
export const manifestFileItemSchema = z.object({
	tld: z.string().regex(/^(?:[a-z]{2,}|matrix|matrix_dd)$/),
	section_tipo: z.string().regex(/^[a-zA-Z0-9_]+$/),
	url: z.string().url(),
});
export type ManifestFileItem = z.infer<typeof manifestFileItemSchema>;

/**
 * Refuse to operate with process-wide TLS verification disabled — that env
 * var silently reverts every fetch to the PHP ssl_verifypeer=false posture
 * this port explicitly rejects (WC-023 D1).
 */
export function assertTlsVerificationOn(): void {
	if (readEnv('NODE_TLS_REJECT_UNAUTHORIZED') === '0') {
		throw new Error(
			'ontology ingest refused: NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS peer verification process-wide. Remove it; pin private CAs via NODE_EXTRA_CA_CERTS instead.',
		);
	}
}

/**
 * Confine a filename under a base dir and reject shell-hostile bytes (the
 * data_io.ts confinedCopyPath rule — duplicated here because that one is
 * module-private and export-side).
 */
export function confinedPath(baseDir: string, fileName: string): string | null {
	if (fileName.includes('/') || fileName.includes('..') || fileName.includes('\0')) return null;
	const resolved = resolve(join(baseDir, fileName));
	if (!resolved.startsWith(resolve(baseDir) + sep)) return null;
	if (/['"\\\s]/.test(resolved)) return null;
	return resolved;
}

// ---------------------------------------------------------------------------
// 1. check_remote_server
// ---------------------------------------------------------------------------

/**
 * Probe one ontology server (PHP check_remote_server): POST the
 * get_server_ready_status rqo, 5 s timeout. `data` is the decoded remote body
 * (or false when it could not be decoded) — a PAYLOAD, not a discriminator —
 * and `code` the HTTP status.
 */
export async function checkRemoteServer(server: OntologyServer): Promise<{
	data: unknown;
	msg: string;
	errors: string[];
	code: number | null;
}> {
	assertTlsVerificationOn();
	const rqo = {
		dd_api: 'dd_utils_api',
		action: 'get_server_ready_status',
		prevent_lock: true,
		options: { check: 'ontology_server' },
	};
	try {
		// JSON body, not PHP's `rqo=`-form-encoded: the TS API endpoint parses the
		// request body as JSON (server.ts request.json()) and 400s on a form body,
		// exactly like the vendored client's data_manager.request. A form-encoded
		// probe made every TS ontology/code master read back "Invalid JSON body"
		// and the update panel disabled its radio (render_update_ontology.js).
		const response = await fetch(server.url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(rqo),
			redirect: 'error',
			signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
		});
		const text = await response.text();
		let decoded: unknown = false;
		try {
			decoded = JSON.parse(text);
		} catch {
			decoded = false;
		}
		return {
			data: decoded,
			msg: response.ok
				? 'OK. Request done successfully'
				: `Error. bad server response code: ${response.status}`,
			errors: response.ok ? [] : [`bad server response code: ${response.status}`],
			code: response.status,
		};
	} catch (error) {
		return {
			data: false,
			msg: `Error. Request failed [check_remote_server]: ${(error as Error).message}`,
			errors: [(error as Error).message],
			code: null,
		};
	}
}

// ---------------------------------------------------------------------------
// 2. get_ontology_update_info (SERVER side — build the manifest)
// ---------------------------------------------------------------------------

/**
 * Read-only versioned IO dir resolve (PHP get_ontology_io_path — no mkdir,
 * false when the version has no files). `baseDir` is a test seam.
 */
export function getOntologyIoPath(baseDir: string, version: readonly number[]): string | false {
	if (!Number.isInteger(version[0]) || !Number.isInteger(version[1])) return false;
	const ioPath = join(baseDir, `${version[0]}.${version[1]}`);
	return existsSync(ioPath) ? ioPath : false;
}

/**
 * Build the update manifest from the local IO dir (PHP SERVER-side
 * get_ontology_update_info): `info` = ontology.json verbatim, `files` = one
 * item per `<tld>.copy.gz` with the public download URL. `publicBaseUrl` is
 * the absolute URL prefix the files route serves (the ONTOLOGY_DATA_IO_URL
 * twin), already versioned by the caller.
 */
export function buildOntologyUpdateInfo(
	ioPath: string,
	publicBaseUrl: string,
): { data: { info: unknown; files: ManifestFileItem[] }; msg: string; errors: string[] } {
	const manifest: { info: unknown; files: ManifestFileItem[] } = { info: null, files: [] };
	for (const name of readdirSync(ioPath).sort()) {
		if (name === 'ontology.json') {
			try {
				manifest.info = JSON.parse(readFileSync(join(ioPath, name), 'utf8'));
			} catch {
				// unreadable metadata stays null (PHP json_decode null)
			}
			continue;
		}
		const match = name.match(/^([a-z_]{2,})\.copy\.gz$/);
		if (match === null) continue;
		const tld = match[1] as string;
		manifest.files.push({
			tld,
			section_tipo: tld === 'matrix' ? 'matrix' : `${tld}0`,
			url: `${publicBaseUrl}/${name}`,
		});
	}
	// The manifest IS the payload: it becomes the envelope's `data` at the door.
	return { data: manifest, msg: 'OK. request done', errors: [] };
}

// ---------------------------------------------------------------------------
// 3. download_remote_ontology_file (hardened)
// ---------------------------------------------------------------------------

/**
 * Download one ontology file (PHP download_remote_ontology_file, hardened —
 * WC-023 D1/D2/D3/D5): the URL must parse, sit on `configuredOrigin` (the
 * operator-config server origin — remote manifests never choose the network
 * target), and end with `expectedBasename` (constructed from the validated
 * tld, never taken from the manifest). Streams to `<targetDir>/<basename>`
 * under byte + stall ceilings; redirects are refused.
 */
export async function downloadRemoteOntologyFile(options: {
	url: string;
	configuredOrigin: string;
	expectedBasename: string;
	targetDir: string;
}): Promise<OntologyIoResponse> {
	assertTlsVerificationOn();
	const response: OntologyIoResponse = { ok: false, msg: '', errors: [] };
	const started = Date.now();

	let parsed: URL;
	try {
		parsed = new URL(options.url);
	} catch {
		response.msg = 'Error. Invalid URL provided';
		response.errors.push('Invalid URL provided');
		return response;
	}
	if (parsed.origin !== options.configuredOrigin) {
		response.msg = 'Error. URL origin does not match the configured ontology server';
		response.errors.push(`origin mismatch: ${parsed.origin} != ${options.configuredOrigin}`);
		return response;
	}
	if (basename(parsed.pathname) !== options.expectedBasename) {
		response.msg = 'Error. URL file name does not match the expected ontology file';
		response.errors.push(`basename mismatch: ${basename(parsed.pathname)}`);
		return response;
	}
	if (
		!GZ_BASENAME_RE.test(options.expectedBasename) &&
		options.expectedBasename !== 'ontology.json'
	) {
		response.msg = 'Error. Disallowed ontology file name';
		response.errors.push(`disallowed basename: ${options.expectedBasename}`);
		return response;
	}
	const filePath = confinedPath(options.targetDir, options.expectedBasename);
	if (filePath === null) {
		response.msg = 'Error. Unconfined download path';
		response.errors.push('unconfined download path');
		return response;
	}

	try {
		mkdirSync(options.targetDir, { recursive: true });
		const remote = await fetch(parsed, {
			redirect: 'error',
			signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
		});
		if (!remote.ok) {
			response.msg = `Error. bad server response code: ${remote.status}`;
			response.errors.push(`bad server response code: ${remote.status}`);
			return response;
		}
		const declared = Number(remote.headers.get('content-length') ?? '0');
		if (declared > MAX_DOWNLOAD_BYTES) {
			response.msg = 'Error. Remote file exceeds the download size cap';
			response.errors.push(`content-length ${declared} > ${MAX_DOWNLOAD_BYTES}`);
			return response;
		}
		if (remote.body === null) {
			response.msg = 'Error. empty data';
			response.errors.push('empty data');
			return response;
		}
		const reader = remote.body.getReader();
		const sink = createWriteStream(filePath);
		let total = 0;
		try {
			for (;;) {
				const chunk = await Promise.race([
					reader.read(),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('download stalled')), DOWNLOAD_STALL_TIMEOUT_MS),
					),
				]);
				if (chunk.done) break;
				total += chunk.value.byteLength;
				if (total > MAX_DOWNLOAD_BYTES) {
					throw new Error(`download exceeds the ${MAX_DOWNLOAD_BYTES}-byte cap`);
				}
				if (!sink.write(chunk.value)) {
					await new Promise<void>((resolveDrain) => sink.once('drain', () => resolveDrain()));
				}
			}
		} finally {
			await new Promise<void>((resolveEnd) => sink.end(() => resolveEnd()));
			reader.releaseLock();
		}
		if (total === 0) {
			rmSync(filePath, { force: true });
			response.msg = 'Error. empty data';
			response.errors.push('empty data');
			return response;
		}
		response.ok = true;
		response.msg = `OK. Request done successfully [download_remote_ontology_file] file: ${options.expectedBasename}`;
		response.file_path = filePath;
		response.file_size = total;
		response.total_time = Date.now() - started;
		return response;
	} catch (error) {
		rmSync(filePath, { force: true });
		response.msg = `Error. Request failed [download_remote_ontology_file]: ${(error as Error).message}`;
		response.errors.push((error as Error).message);
		return response;
	}
}

// ---------------------------------------------------------------------------
// 4. Decompression + COPY-shape sanity (zip-bomb guards)
// ---------------------------------------------------------------------------

/**
 * Stream-gunzip `srcPath` to `destPath` under byte + ratio ceilings
 * (WC-023 D6). Throws on any ceiling trip or zlib error; the partial output
 * file is removed.
 */
export async function gunzipWithCaps(srcPath: string, destPath: string): Promise<number> {
	const compressedSize = statSync(srcPath).size;
	const gunzip = createGunzip();
	const sink = createWriteStream(destPath);
	let out = 0;
	try {
		await new Promise<void>((resolveDone, reject) => {
			gunzip.on('data', (chunk: Buffer) => {
				out += chunk.byteLength;
				if (out > MAX_DECOMPRESSED_BYTES) {
					gunzip.destroy(
						new Error(`decompressed output exceeds the ${MAX_DECOMPRESSED_BYTES}-byte cap`),
					);
					return;
				}
				if (compressedSize > 1024 * 1024 && out / compressedSize > MAX_DECOMPRESSION_RATIO) {
					gunzip.destroy(
						new Error(`decompression ratio exceeds ${MAX_DECOMPRESSION_RATIO}x (zip bomb?)`),
					);
					return;
				}
				if (!sink.write(chunk)) {
					gunzip.pause();
					sink.once('drain', () => gunzip.resume());
				}
			});
			gunzip.on('error', reject);
			gunzip.on('end', () => {
				sink.end(() => resolveDone());
			});
			const source = readFileSync(srcPath);
			gunzip.end(source);
		});
		return out;
	} catch (error) {
		sink.destroy();
		rmSync(destPath, { force: true });
		throw error;
	}
}

/**
 * Cheap COPY-text smoke test BEFORE any destructive SQL (WC-023 D8): no NUL
 * bytes, and the first non-empty lines carry exactly the MATRIX_COPY_COLUMNS
 * tab arity. An EMPTY file is valid (PHP: empty export = no-op). psql
 * ON_ERROR_STOP stays the real parser.
 */
export function copySanityCheck(filePath: string, columnCount: number): string | null {
	const size = statSync(filePath).size;
	if (size === 0) return null; // valid empty export
	// Bounded read: only the first 512 KiB, never the whole (possibly huge) file.
	const fd = openSync(filePath, 'r');
	const buffer = Buffer.alloc(Math.min(size, 512 * 1024));
	try {
		readSync(fd, buffer, 0, buffer.length, 0);
	} finally {
		closeSync(fd);
	}
	if (buffer.includes(0)) return 'payload carries NUL bytes — not COPY text';
	const sample = buffer.toString('utf8');
	const lines = sample.split('\n').filter((line) => line !== '');
	const expectedTabs = columnCount - 1;
	for (const line of lines.slice(0, COPY_SANITY_LINES)) {
		// The final sampled line may be truncated mid-row — tolerate fewer
		// tabs there; every complete line must match exactly.
		const tabs = line.split('\t').length - 1;
		if (tabs !== expectedTabs && line !== lines[lines.length - 1]) {
			return `line arity mismatch: expected ${expectedTabs} tabs, found ${tabs}`;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// 5. import_from_copy_file (the backup::import_from_copy_file twin)
// ---------------------------------------------------------------------------

export interface ImportCopyFileOptions {
	/** Required unless deleteTable=true — scopes the DELETE. */
	sectionTipo?: string;
	/** A `.copy.gz` (gunzipped here under caps) or an uncompressed `.copy`. */
	filePath: string;
	matrixTable: 'matrix_ontology' | 'matrix_dd';
	/** true = whole-table replace (matrix_dd); false = scoped DELETE. */
	deleteTable?: boolean;
	/** Test/scratch-DB seam; defaults to the configured live DB. */
	conn?: DbConnDescriptor;
}

/**
 * DELETE + `\copy FROM` one staged ontology file in ONE psql transaction
 * (PHP backup::import_from_copy_file, atomicity added — WC-023 D7). PHP msg
 * bytes preserved on the empty-export and success paths.
 */
export async function importFromCopyFile(
	options: ImportCopyFileOptions,
): Promise<OntologyIoResponse> {
	const response: OntologyIoResponse = { ok: false, msg: '', errors: [] };
	const started = Date.now();
	const conn = options.conn ?? connFromConfig();
	const deleteTable = options.deleteTable === true;

	// -- validations (PHP parity + allowlists)
	if (!IMPORT_TABLE_ALLOWLIST.has(options.matrixTable)) {
		response.errors.push(`matrix_table not allowlisted: ${options.matrixTable}`);
		response.msg = 'Error. Invalid matrix_table';
		return response;
	}
	if (
		!deleteTable &&
		(options.sectionTipo === undefined || !isSafeSectionTipo(options.sectionTipo))
	) {
		response.errors.push('section_tipo is mandatory when delete_table is false');
		response.msg = 'Error. Invalid section_tipo';
		return response;
	}
	if (!/^[a-zA-Z0-9_/.-]+$/.test(options.filePath) || !existsSync(options.filePath)) {
		response.errors.push(`file_path is not valid: ${options.filePath}`);
		response.msg = 'Error. Invalid file_path';
		return response;
	}

	// -- decompress (streamed, capped) or accept a pre-staged plain file
	let uncompressed = options.filePath;
	let createdTemp = false;
	if (options.filePath.endsWith('.gz')) {
		uncompressed = options.filePath.slice(0, -'.gz'.length);
		try {
			await gunzipWithCaps(options.filePath, uncompressed);
			createdTemp = true;
		} catch (error) {
			response.errors.push(`decompress failed: ${(error as Error).message}`);
			response.msg = 'Error. Failed to decompress file';
			return response;
		}
	}

	try {
		// -- empty-export short-circuit (PHP: skip the DELETE entirely)
		if (statSync(uncompressed).size === 0) {
			response.ok = true;
			response.msg = `OK. Empty export, nothing to import [import_from_copy_file] ${basename(options.filePath)}`;
			return response;
		}

		// -- COPY-shape sanity BEFORE the destructive statement
		const sanity = copySanityCheck(uncompressed, MATRIX_COPY_COLUMNS.length);
		if (sanity !== null) {
			response.errors.push(`copy sanity check failed: ${sanity}`);
			response.msg = 'Error. Staged file failed the COPY sanity check';
			return response;
		}

		// -- one transaction: DELETE (scoped or whole) + \copy FROM the staged
		//    file. Identifiers are static; the tipo rides a psql variable.
		const columnsList = MATRIX_COPY_COLUMNS.map((column) => `"${column}"`).join(',');
		// SECTION-SCOPED IMPORT LANDS IN THE TARGET SECTION, BY CONSTRUCTION.
		//
		// A `.copy.gz` carries the `section_tipo` it was EXPORTED with, while the
		// caller's `sectionTipo` is recomputed from the validated target tld. A
		// straight `\copy` into the table honoured the FILE and ignored the target:
		// importing an `objet0` export as tld `object` deleted the (empty) object0,
		// re-inserted the rows as `objet0` — duplicating them, or violating the
		// (section_id, section_tipo) unique index if objet0 still existed — and left
		// the target section empty. Every downstream guard then looked correct while
		// operating on nothing.
		//
		// Staging through a TEMP table and projecting `:'tipo'` over the file's own
		// column makes the target authoritative: the rows land where the caller said,
		// which is what makes export-as-X / import-as-Y a real tld rename rather than
		// a duplication. The whole-table path (matrix_dd) has no single target tipo
		// and keeps the direct COPY.
		const projected = MATRIX_COPY_COLUMNS.map((column) =>
			column === 'section_tipo' ? `:'tipo'` : `"${column}"`,
		).join(',');
		const script = deleteTable
			? [
					'BEGIN;',
					`DELETE FROM "${options.matrixTable}";`,
					`\\copy "${options.matrixTable}" (${columnsList}) FROM '${uncompressed}'`,
					'COMMIT;',
					'',
				].join('\n')
			: [
					'BEGIN;',
					`DELETE FROM "${options.matrixTable}" WHERE section_tipo = :'tipo';`,
					`CREATE TEMP TABLE dd_import_stage (LIKE "${options.matrixTable}" INCLUDING DEFAULTS) ON COMMIT DROP;`,
					`\\copy dd_import_stage (${columnsList}) FROM '${uncompressed}'`,
					`INSERT INTO "${options.matrixTable}" (${columnsList}) SELECT ${projected} FROM dd_import_stage;`,
					'COMMIT;',
					'',
				].join('\n');
		const scriptPath = `${uncompressed}.import.sql`;
		if (confinedPath(resolve(uncompressed, '..'), basename(scriptPath)) === null) {
			response.errors.push('unconfined staging path');
			response.msg = 'Error. Unconfined staging path';
			return response;
		}
		await Bun.write(scriptPath, script);
		try {
			const args = ['-v', 'ON_ERROR_STOP=1'];
			if (!deleteTable) args.push('-v', `tipo=${options.sectionTipo}`);
			args.push('-f', scriptPath);
			const run = await runPsql(conn, args);
			if (run.exitCode !== 0) {
				response.errors.push(`psql import failed: ${run.stderr.trim()}`);
				response.msg = 'Error. Failed to copy data from file';
				return response;
			}
		} finally {
			rmSync(scriptPath, { force: true });
		}

		// -- sequence bump (PHP parity; non-fatal)
		const setval = await runPsql(conn, [
			'-c',
			`SELECT setval('${options.matrixTable}_id_seq', (SELECT MAX(id) FROM "${options.matrixTable}")+1);`,
		]);
		if (setval.exitCode !== 0) {
			console.warn(`[data_io_import] sequence bump failed (non-fatal): ${setval.stderr.trim()}`);
		}

		response.ok = true;
		response.msg = `OK. Request done successfully [import_from_copy_file] ${basename(options.filePath)} | ${Date.now() - started} ms`;
		return response;
	} finally {
		if (createdTemp) rmSync(uncompressed, { force: true });
	}
}

// ---------------------------------------------------------------------------
// 6. import_from_file / import_private_lists_from_file + counter consolidation
// ---------------------------------------------------------------------------

/**
 * Re-sync one section's matrix_counter row to MAX(section_id) after a COPY
 * load (PHP counter::consolidate_counter; the hierarchy_import GREATEST
 * upsert, scoped to one tipo).
 */
export async function consolidateSectionCounter(
	sectionTipo: string,
	matrixTable: string,
	conn: DbConnDescriptor = connFromConfig(),
): Promise<boolean> {
	if (!isSafeSectionTipo(sectionTipo) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(matrixTable))
		return false;
	// psql performs NO variable interpolation with -c (only via -f or interactively),
	// so the already-validated tipo is inlined directly rather than passed as :'tipo'
	// (which would reach the server literally and fail with "syntax error at or near :").
	const sql = `INSERT INTO matrix_counter (tipo, value)
SELECT section_tipo, MAX(section_id) FROM "${matrixTable}" WHERE section_tipo = '${sectionTipo}' GROUP BY section_tipo
ON CONFLICT (tipo) DO UPDATE SET value = GREATEST(matrix_counter.value, EXCLUDED.value);`;
	const run = await runPsql(conn, ['-v', 'ON_ERROR_STOP=1', '-c', sql]);
	return run.exitCode === 0;
}

/**
 * THE ONT-TLD POST-COPY NORMALIZATION — and the one door a global TLD RENAME
 * actually goes through.
 *
 * A `.copy.gz` carries whatever `ontology7` its rows were EXPORTED with, while
 * the import recomputes `section_tipo` from the TARGET tld. Export `objet` and
 * import it as `object` — which is exactly how a tld is renamed in the ontology
 * master and redistributed — and every row lands in section `object0` still
 * declaring `objet`. The parser derives a node's identity from the record's own
 * `ontology7`, not from its section, so the whole ontology would parse into the
 * OLD namespace: `ontology_state`'s `foreign` drift, a thousand rows at a time.
 *
 * Forcing the target tld here makes export-as-X / import-as-Y a first-class
 * rename instead of a trap. It is also the only enforcement this door can have:
 * the COPY streams straight into the table through `psql`, so neither the birth
 * stamp (record_defaults.ts) nor the save refusal (save_component.ts) ever sees
 * these rows.
 *
 * TWO DELIBERATE LIMITS:
 *  - rows with NO `string` column at all are left alone. Those carry no term and
 *    no properties — contentless shells, not nodes — and stamping a tld on one
 *    would MATERIALIZE a nameless node in the ontology tree, which is worse than
 *    the invisibility it fixes. `ontology_state`'s `tldless` drift reports them
 *    instead. ("Has a `string` column" is a sound proxy for "is a real node":
 *    both `ontology5` and `ontology7` live there.)
 *  - the RESTORE path (ontology_update's snapshot rollback) does NOT call this.
 *    A restore's contract is "put back exactly what was here", not "improve it";
 *    silently rewriting values during a rollback would make the rollback a lie.
 *
 * Driven by the TARGET SECTION, not by the manifest's tld string: the section is
 * where the rows actually landed, and `requiredOntologyTld` is the one place the
 * rule lives. That also makes the not-governed cases fall out for free rather
 * than needing a caller-side list — `localontology0`, and the whole-table
 * manifest entries `matrix` / `matrix_dd`, whose section tipo is not `<tld>0`
 * shaped at all. Returns 0 for those: nothing to normalize is not a failure.
 *
 * The derived tld is `safeTld`-validated by construction (`^[a-z]{2,}$`), so it
 * and the section tipo are safe to inline — the same posture as
 * consolidateSectionCounter above.
 * Returns the number of rows rewritten, or null when the statement failed.
 */
export async function normalizeOntologyTld(
	sectionTipo: string,
	conn: DbConnDescriptor = connFromConfig(),
): Promise<number | null> {
	const tld = requiredOntologyTld(sectionTipo);
	if (tld === null) return 0;
	const item = `[{"id": 1, "lang": "${DATA_NOLAN}", "value": "${tld}"}]`;
	// THE SHAPE TEST IS "IS THIS A NODE", NOT "IS `string` NON-NULL".
	//   - `jsonb_typeof(...) = 'object'` — a row whose `string` is a JSON SCALAR
	//     makes jsonb_set raise "cannot set path in scalar", and ON_ERROR_STOP
	//     then aborts the WHOLE section's normalization for one bad row.
	//   - `EXISTS (… keys except ontology7)` — the contentless-shell skip the
	//     header promises. `IS NOT NULL` only skipped SQL NULL, so `{}` and a row
	//     carrying nothing but its own ontology7 still got stamped and
	//     MATERIALIZED as a nameless node in the ontology tree — the outcome the
	//     skip exists to prevent. A real node always carries at least one other
	//     component (its ontology5 term).
	const statement = `WITH upd AS (
  UPDATE "matrix_ontology"
     SET "string" = jsonb_set("string", '{${ONTOLOGY_TLD}}', '${item}'::jsonb)
   WHERE section_tipo = '${sectionTipo}'
     AND jsonb_typeof("string") = 'object'
     AND EXISTS (
           SELECT 1 FROM jsonb_object_keys("string") AS k(key)
            WHERE k.key <> '${ONTOLOGY_TLD}'
         )
     AND ("string"->'${ONTOLOGY_TLD}'->0->>'value') IS DISTINCT FROM '${tld}'
  RETURNING 1
) SELECT count(*) FROM upd;`;
	// `-X`: a server-side ~/.psqlrc (\timing, \pset …) prints banners on STDOUT,
	// which is the only thing this function reads. Without it a developer's rc
	// file turned a successful rewrite into an unparseable count — and, before
	// the callers were made fatal, into a silently skipped normalization.
	const run = await runPsql(conn, ['-X', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', statement]);
	if (run.exitCode !== 0) return null;
	const rewritten = Number.parseInt(run.stdout.trim(), 10);
	return Number.isFinite(rewritten) ? rewritten : null;
}

/**
 * Import one TLD's staged file into matrix_ontology (PHP import_from_file):
 * scoped DELETE + COPY, then ONT-TLD normalization + counter consolidation.
 * `section_tipo` is RECOMPUTED from the validated tld (never trusted from the
 * manifest).
 */
export async function importOntologyFile(
	fileItem: { tld: string; filePath: string },
	conn: DbConnDescriptor = connFromConfig(),
): Promise<OntologyIoResponse> {
	if (!safeTld(fileItem.tld)) {
		return { ok: false, msg: `Error. Invalid tld: ${fileItem.tld}`, errors: ['invalid tld'] };
	}
	const sectionTipo = `${fileItem.tld}0`;
	const imported = await importFromCopyFile({
		sectionTipo,
		filePath: fileItem.filePath,
		matrixTable: 'matrix_ontology',
		conn,
	});
	if (imported.ok === true) {
		// ONT-TLD before the counter: a row whose tld still names the EXPORT's
		// namespace is not this tld's node at all (see normalizeOntologyTld).
		const rewritten = await normalizeOntologyTld(sectionTipo, conn);
		if (rewritten === null) {
			// FATAL, not a warning. An un-normalized import is an ontology whose
			// every node declares the wrong namespace — the caller must not go on to
			// re-derive dd_ontology from it and report success.
			imported.ok = false;
			imported.errors.push(`ontology7 normalization failed for ${sectionTipo}`);
			imported.msg = `Error. ONT-TLD normalization failed for ${sectionTipo} — the imported rows may declare another tld`;
			return imported;
		}
		imported.tld_normalized = rewritten;
		if (rewritten > 0) {
			imported.msg = `${imported.msg} (rewrote ontology7 on ${rewritten} row(s) to '${fileItem.tld}')`;
		}
		const counter = await consolidateSectionCounter(sectionTipo, 'matrix_ontology', conn);
		if (!counter) imported.errors.push(`counter consolidation failed for ${sectionTipo}`);
	}
	return imported;
}

/**
 * Import the private lists dump into matrix_dd (PHP
 * import_private_lists_from_file): whole-table replace, no counter step.
 */
export async function importPrivateListsFile(
	filePath: string,
	conn: DbConnDescriptor = connFromConfig(),
): Promise<OntologyIoResponse> {
	return importFromCopyFile({ filePath, matrixTable: 'matrix_dd', deleteTable: true, conn });
}
