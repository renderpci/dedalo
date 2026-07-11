/**
 * Ontology UPDATE ingest (UPDATE_PROCESS Phase 2, WC-023) — the hardened
 * transport branches (origin pin, basename allowlist, redirect refusal, size
 * declaration, empty body), the decompression/sanity guards, the manifest
 * builder, and the DESTRUCTIVE copy-file import exercised on a THROWAWAY
 * scratch DATABASE (the install-suite pattern: CREATE DATABASE + seed +
 * DbConnDescriptor seam — never the shared dev DB). The orchestrator's
 * refusal paths run against the real (closed) ownership gate.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { config } from '../../src/config/config.ts';
import { MATRIX_COPY_COLUMNS } from '../../src/core/db/matrix_write.ts';
import { installDbFromSeed } from '../../src/core/install/db_restore.ts';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { runPsql } from '../../src/core/install/pg_exec.ts';
import {
	buildOntologyUpdateInfo,
	confinedPath,
	copySanityCheck,
	downloadRemoteOntologyFile,
	getOntologyIoPath,
	gunzipWithCaps,
	importFromCopyFile,
} from '../../src/core/ontology/data_io_import.ts';
import { saveSimpleSchemaFile, updateOntology } from '../../src/core/ontology/ontology_update.ts';

const SCRATCH_ROOT = join(
	process.env.TMPDIR ?? '/tmp',
	`dedalo_ontology_ingest_${process.pid}_${Math.random().toString(36).slice(2)}`,
);
const VENDORED = join(process.cwd(), 'install', 'import', 'ontology', '7.0');

beforeAll(() => {
	mkdirSync(SCRATCH_ROOT, { recursive: true });
});
afterAll(() => {
	rmSync(SCRATCH_ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// path confinement + sanity + gunzip guards (pure)
// ---------------------------------------------------------------------------

describe('confinement + COPY sanity + gunzip guards', () => {
	test('confinedPath refuses traversal, separators, NUL and shell bytes', () => {
		expect(confinedPath(SCRATCH_ROOT, '../evil')).toBeNull();
		expect(confinedPath(SCRATCH_ROOT, 'a/b')).toBeNull();
		expect(confinedPath(SCRATCH_ROOT, 'a\0b')).toBeNull();
		expect(confinedPath(SCRATCH_ROOT, "a'b")).toBeNull();
		expect(confinedPath(SCRATCH_ROOT, 'dd.copy.gz')).toBe(join(SCRATCH_ROOT, 'dd.copy.gz'));
	});

	test('copySanityCheck: empty ok, NUL rejected, arity enforced', () => {
		const arity = MATRIX_COPY_COLUMNS.length;
		const good = join(SCRATCH_ROOT, 'good.copy');
		writeFileSync(good, `${Array(arity).fill('x').join('\t')}\n`);
		expect(copySanityCheck(good, arity)).toBeNull();

		const empty = join(SCRATCH_ROOT, 'empty.copy');
		writeFileSync(empty, '');
		expect(copySanityCheck(empty, arity)).toBeNull();

		const nul = join(SCRATCH_ROOT, 'nul.copy');
		writeFileSync(nul, 'a\tb\0c\n');
		expect(copySanityCheck(nul, arity)).toContain('NUL');

		const short = join(SCRATCH_ROOT, 'short.copy');
		writeFileSync(short, 'only\tthree\tcols\nx\ty\tz\n');
		expect(copySanityCheck(short, arity)).toContain('arity');
	});

	test('gunzipWithCaps round-trips real gzip and throws on corrupt input', async () => {
		const payload = Buffer.from('hello\tworld\n');
		const gz = join(SCRATCH_ROOT, 'roundtrip.gz');
		writeFileSync(gz, gzipSync(payload));
		const out = join(SCRATCH_ROOT, 'roundtrip.txt');
		const bytes = await gunzipWithCaps(gz, out);
		expect(bytes).toBe(payload.byteLength);
		expect(readFileSync(out, 'utf8')).toBe('hello\tworld\n');

		const corrupt = join(SCRATCH_ROOT, 'corrupt.gz');
		writeFileSync(corrupt, Buffer.from('not gzip at all'));
		expect(gunzipWithCaps(corrupt, join(SCRATCH_ROOT, 'corrupt.out'))).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// hardened download (local Bun.serve fixture)
// ---------------------------------------------------------------------------

describe('downloadRemoteOntologyFile hardening', () => {
	const dir = join(SCRATCH_ROOT, 'downloads');

	async function withServer(
		handler: (req: Request) => Response,
		run: (origin: string) => Promise<void>,
	) {
		const server = Bun.serve({ port: 0, fetch: handler });
		try {
			await run(`http://localhost:${server.port}`);
		} finally {
			server.stop(true);
		}
	}

	test('happy path stores the constructed basename under the target dir', async () => {
		await withServer(
			() => new Response(gzipSync(Buffer.from('data'))),
			async (origin) => {
				const out = await downloadRemoteOntologyFile({
					url: `${origin}/io/7.0/dd.copy.gz`,
					configuredOrigin: origin,
					expectedBasename: 'dd.copy.gz',
					targetDir: dir,
				});
				expect(out.result).toBe(true);
				expect(existsSync(join(dir, 'dd.copy.gz'))).toBe(true);
			},
		);
	});

	test('origin mismatch is refused (manifest URLs never choose the target)', async () => {
		const out = await downloadRemoteOntologyFile({
			url: 'http://evil.example.com/dd.copy.gz',
			configuredOrigin: 'http://localhost:9',
			expectedBasename: 'dd.copy.gz',
			targetDir: dir,
		});
		expect(out.result).toBe(false);
		expect(out.errors[0]).toContain('origin mismatch');
	});

	test('basename mismatch and disallowed names are refused', async () => {
		const out = await downloadRemoteOntologyFile({
			url: 'http://localhost:9/other.copy.gz',
			configuredOrigin: 'http://localhost:9',
			expectedBasename: 'dd.copy.gz',
			targetDir: dir,
		});
		expect(out.result).toBe(false);
		expect(out.errors[0]).toContain('basename mismatch');
	});

	test('redirects are a hard failure', async () => {
		await withServer(
			() => new Response(null, { status: 302, headers: { Location: 'http://x/' } }),
			async (origin) => {
				const out = await downloadRemoteOntologyFile({
					url: `${origin}/dd.copy.gz`,
					configuredOrigin: origin,
					expectedBasename: 'dd.copy.gz',
					targetDir: dir,
				});
				expect(out.result).toBe(false);
			},
		);
	});

	test('a lying oversize Content-Length is rejected before reading', async () => {
		// Bun.serve normalizes Content-Length, so the lying header needs a raw
		// TCP fixture that hand-writes the response head.
		const raw = Bun.listen({
			hostname: '127.0.0.1',
			port: 0,
			socket: {
				data(socket) {
					socket.write(
						`HTTP/1.1 200 OK\r\nContent-Length: ${1024 * 1024 * 1024}\r\nConnection: close\r\n\r\n`,
					);
					socket.flush();
				},
			},
		});
		try {
			const origin = `http://127.0.0.1:${raw.port}`;
			const out = await downloadRemoteOntologyFile({
				url: `${origin}/dd.copy.gz`,
				configuredOrigin: origin,
				expectedBasename: 'dd.copy.gz',
				targetDir: dir,
			});
			expect(out.result).toBe(false);
			expect(out.msg).toContain('size cap');
		} finally {
			raw.stop(true);
		}
	});

	test('an empty body is refused (PHP empty-data parity)', async () => {
		await withServer(
			() => new Response(''),
			async (origin) => {
				const out = await downloadRemoteOntologyFile({
					url: `${origin}/dd.copy.gz`,
					configuredOrigin: origin,
					expectedBasename: 'dd.copy.gz',
					targetDir: dir,
				});
				expect(out.result).toBe(false);
				expect(out.errors).toContain('empty data');
			},
		);
	});
});

// ---------------------------------------------------------------------------
// manifest builder (server side)
// ---------------------------------------------------------------------------

describe('buildOntologyUpdateInfo (manifest from a local IO dir)', () => {
	test('info + per-tld files with constructed URLs; junk ignored; matrix special-case', () => {
		const io = join(SCRATCH_ROOT, 'io', '9.9');
		mkdirSync(io, { recursive: true });
		writeFileSync(join(io, 'ontology.json'), JSON.stringify({ version: '9.9.0' }));
		writeFileSync(join(io, 'es.copy.gz'), 'x');
		writeFileSync(join(io, 'matrix.copy.gz'), 'x');
		writeFileSync(join(io, 'junk.txt'), 'x');
		writeFileSync(join(io, 'UPPER.copy.gz'), 'x');

		expect(getOntologyIoPath(join(SCRATCH_ROOT, 'io'), [9, 9])).toBe(io);
		expect(getOntologyIoPath(join(SCRATCH_ROOT, 'io'), [1, 2])).toBe(false);

		const manifest = buildOntologyUpdateInfo(
			io,
			'http://master.example/dedalo/install/import/ontology/9.9',
		);
		expect(manifest.msg).toBe('OK. request done');
		expect((manifest.result.info as { version: string }).version).toBe('9.9.0');
		expect(manifest.result.files).toEqual([
			{
				tld: 'es',
				section_tipo: 'es0',
				url: 'http://master.example/dedalo/install/import/ontology/9.9/es.copy.gz',
			},
			{
				tld: 'matrix',
				section_tipo: 'matrix',
				url: 'http://master.example/dedalo/install/import/ontology/9.9/matrix.copy.gz',
			},
		]);
	});
});

// ---------------------------------------------------------------------------
// schema-changes diff (pure)
// ---------------------------------------------------------------------------

describe('saveSimpleSchemaFile (additions-only diff, PHP bytes)', () => {
	test('writes only added children; filesystem success shape', () => {
		const dir = join(SCRATCH_ROOT, 'changes');
		const out = saveSimpleSchemaFile(
			{ dd6: ['a', 'b'], es0: [] },
			{ dd6: ['a', 'b', 'c'], es0: [], zz0: ['q'] },
			dir,
		);
		expect(out.result).toBe(true);
		expect(out.msg).toBe('OK. Request successfully processed');
		const written = JSON.parse(readFileSync(out.filepath as string, 'utf8'));
		expect(written).toEqual([
			{ tipo: 'dd6', children_added: ['c'] },
			{ tipo: 'zz0', children_added: ['q'] },
		]);
	});
});

// ---------------------------------------------------------------------------
// orchestrator refusal paths (no DB writes). The ownership refusal retired at
// the 2026-07-11 cutover (engineOwnsInstall() collapsed to true); the
// config-catalog server allowlist (WC-023 D5) is the surviving first guard.
// ---------------------------------------------------------------------------

describe('updateOntology refusals', () => {
	test('refuses a server code missing from the config catalog (WC-023 D5)', async () => {
		const out = await updateOntology(
			{
				server: { name: 'x', url: 'http://localhost:9/', code: 'zz' },
				files: [{ tld: 'dd', url: 'http://localhost:9/dd.copy.gz' }],
			},
			-1,
		);
		expect(out.result).toBe(false);
		expect(out.errors).toContain('unknown ontology server code: zz');
	});
});

// ---------------------------------------------------------------------------
// DESTRUCTIVE copy-file import — throwaway scratch DATABASE only
// ---------------------------------------------------------------------------

const SCRATCH_DB = `dedalo_ontology_ingest_${process.pid}`;
const admin: DbConnDescriptor = {
	database: 'postgres',
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.password,
};
const scratch: DbConnDescriptor = { ...admin, database: SCRATCH_DB };
let scratchAvailable = false;

beforeAll(async () => {
	const probe = await runPsql(admin, ['-tAc', 'SELECT 1']);
	if (probe.exitCode !== 0) return;
	await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}"`]);
	const created = await runPsql(admin, ['-c', `CREATE DATABASE "${SCRATCH_DB}"`]);
	scratchAvailable = created.exitCode === 0;
	if (scratchAvailable) await installDbFromSeed(scratch);
}, 120000);

afterAll(async () => {
	if (scratchAvailable) await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${SCRATCH_DB}"`]);
});

async function scratchCount(table: string, where = ''): Promise<number> {
	const out = await runPsql(scratch, ['-tAc', `SELECT count(*) FROM "${table}"${where}`]);
	return Number(out.stdout.trim());
}

describe('importFromCopyFile on the scratch database', () => {
	test('vendored dd.copy.gz loads into matrix_ontology (scoped delete + copy + txn)', async () => {
		if (!scratchAvailable) {
			console.warn('[UNCOVERED] no admin Postgres connection — scratch ingest skipped');
			return;
		}
		// stage a private copy — never gunzip next to the vendored package
		const work = join(SCRATCH_ROOT, 'stage');
		mkdirSync(work, { recursive: true });
		const gz = join(work, 'dd.copy.gz');
		writeFileSync(gz, readFileSync(join(VENDORED, 'dd.copy.gz')));

		const before = await scratchCount('matrix_ontology', ` WHERE section_tipo = 'dd0'`);
		const out = await importFromCopyFile({
			sectionTipo: 'dd0',
			filePath: gz,
			matrixTable: 'matrix_ontology',
			conn: scratch,
		});
		expect(out.result).toBe(true);
		expect(out.msg).toStartWith('OK. Request done successfully [import_from_copy_file] dd.copy.gz');
		const after = await scratchCount('matrix_ontology', ` WHERE section_tipo = 'dd0'`);
		expect(after).toBeGreaterThan(0);
		// idempotent replace: importing again lands the same count (DELETE+COPY)
		const again = await importFromCopyFile({
			sectionTipo: 'dd0',
			filePath: gz,
			matrixTable: 'matrix_ontology',
			conn: scratch,
		});
		expect(again.result).toBe(true);
		expect(await scratchCount('matrix_ontology', ` WHERE section_tipo = 'dd0'`)).toBe(after);
		// the seed had rows too — replace must not be smaller than fresh-load
		expect(after).toBeGreaterThanOrEqual(before > 0 ? 1 : 0);
	}, 120000);

	test('a payload that breaks mid-COPY rolls the DELETE back (single txn)', async () => {
		if (!scratchAvailable) return;
		const work = join(SCRATCH_ROOT, 'stage2');
		mkdirSync(work, { recursive: true });
		// arity-valid first lines (passes the sanity window) then a broken tail
		const arity = MATRIX_COPY_COLUMNS.length;
		const goodLine = ['1', 'dd0', ...Array(arity - 2).fill('\\N')].join('\t');
		const lines = Array(60).fill(goodLine);
		lines[55] = 'broken\tline';
		const gz = join(work, 'dd.copy.gz');
		writeFileSync(gz, gzipSync(Buffer.from(`${lines.join('\n')}\n`)));

		const before = await scratchCount('matrix_ontology', ` WHERE section_tipo = 'dd0'`);
		expect(before).toBeGreaterThan(0); // loaded by the previous test
		const out = await importFromCopyFile({
			sectionTipo: 'dd0',
			filePath: gz,
			matrixTable: 'matrix_ontology',
			conn: scratch,
		});
		expect(out.result).toBe(false);
		expect(out.msg).toBe('Error. Failed to copy data from file');
		// the scoped DELETE was rolled back with the failed COPY
		expect(await scratchCount('matrix_ontology', ` WHERE section_tipo = 'dd0'`)).toBe(before);
	}, 60000);

	test('empty export short-circuits without touching the table (PHP bytes)', async () => {
		if (!scratchAvailable) return;
		const work = join(SCRATCH_ROOT, 'stage3');
		mkdirSync(work, { recursive: true });
		const gz = join(work, 'zz.copy.gz');
		writeFileSync(gz, gzipSync(Buffer.alloc(0)));
		const before = await scratchCount('matrix_ontology');
		const out = await importFromCopyFile({
			sectionTipo: 'zz0',
			filePath: gz,
			matrixTable: 'matrix_ontology',
			conn: scratch,
		});
		expect(out.result).toBe(true);
		expect(out.msg).toBe('OK. Empty export, nothing to import [import_from_copy_file] zz.copy.gz');
		expect(await scratchCount('matrix_ontology')).toBe(before);
	});

	test('matrix_dd whole-table replace via the vendored private lists', async () => {
		if (!scratchAvailable) return;
		const work = join(SCRATCH_ROOT, 'stage4');
		mkdirSync(work, { recursive: true });
		const gz = join(work, 'matrix_dd.copy.gz');
		writeFileSync(gz, readFileSync(join(VENDORED, 'matrix_dd.copy.gz')));
		const out = await importFromCopyFile({
			filePath: gz,
			matrixTable: 'matrix_dd',
			deleteTable: true,
			conn: scratch,
		});
		expect(out.result).toBe(true);
		expect(await scratchCount('matrix_dd')).toBeGreaterThan(0);
	}, 60000);
});
