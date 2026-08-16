/**
 * TS-native gate for the UPDATE_PROCESS Phase 2 ORCHESTRATOR SHELL —
 * `updateOntology` (src/core/ontology/ontology_update.ts).
 *
 * The two pure-ish halves (resolveUpdateTarget / stageOntologyFiles) are gated
 * in `ontology_update_target_native.test.ts`; the D7 message and the D8 capture
 * ORDER are gated as pure/source assertions in
 * `ontology_update_restore_message_native.test.ts` and
 * `ontology_update_schema_capture_native.test.ts`. What stayed dark is the
 * SHELL's own decisions — which is where the blast radius lives, because this
 * function REPLACES ONTOLOGY.
 *
 * ── how this is made safe ──────────────────────────────────────────────────
 * Every case drives the REAL pipeline through the `deps` seam
 * (`{conn, catalog, ioBaseDir, changesDir}`), all four of which default to
 * exactly the production values — no test-only flag changes what an operator
 * runs (that is why `deps.optimize` was deliberately NOT added: a gate that
 * skipped `optimizeTables` would prove a configuration nobody ships).
 *
 *   - `catalog` is load-bearing, not convenience: the target catalog comes from
 *     `config.ontologyIo` (env `ONTOLOGY_SERVERS` / `IS_AN_ONTOLOGY_SERVER`),
 *     so WITHOUT injection this gate takes a different branch on a developer
 *     box than on a CI clone and is trivially green on the clone.
 *   - The destructive pipeline is confined to the scratch TLD `zzd` (and
 *     `zzdb`, deliberately under the same `zzd%` sweep prefix): both
 *     `importFromCopyFile` and `snapshotTableRows` are `section_tipo`-scoped and
 *     `stageOntologyFiles` RECOMPUTES `section_tipo` as `<tld>0`, so a `zzd`
 *     package can only ever aim at `zzd0` / `zzdb0`. Scratch section_ids stay in
 *     the 942000-942999 band. `assertScratchOnly` re-measures the non-scratch
 *     ontology-table counts around every destructive case and fails LOUDLY if
 *     one moves — a tld slip here would run a destructive per-TLD DELETE/COPY
 *     against real ontology data.
 *   - `ioBaseDir` / `changesDir` are per-test temp dirs, so nothing writes to
 *     the real ontology IO dir or the real recovery/changes slots.
 *   - The remote arm is driven against a local `Bun.serve` fixture (the
 *     configured origin IS that server), never the network.
 *
 * COVERAGE-EXEMPT, by construction and stated here rather than left implied:
 * the real remote-download arm (no network fetch in a test, ever — the fixture
 * server stands in for it) and the `engineOwnsInstall()` refusal (collapsed to
 * `true` at the 2026-07-11 cutover).
 *
 * Cost this gate deliberately pays (ledgered, not hidden): the success case
 * runs the real `optimizeTables` — REINDEX CONCURRENTLY + VACUUM ANALYZE over
 * the four shared ontology tables of the SUITE database. It cannot be
 * tipo-confined, and skipping it would mean gating a path production never
 * takes.
 *
 * Two defects are PINNED here, not fixed (each needs its own wire-contract
 * entry):
 *   - D9 restore-of-an-empty-snapshot is a NO-OP: `importFromCopyFile`
 *     short-circuits a zero-byte file ("Empty export, nothing to import")
 *     WITHOUT running its scoped DELETE, so a TLD that was EMPTY before the
 *     import keeps the imported rows after an auto-restore while the response
 *     still claims "matrix rows restored". Case 5 seeds a pre-existing row
 *     precisely so the restore it asserts is a real one.
 *   - The `matrix_ontology_main` counter (`ontology35`) consumed by
 *     `addMainSection` is a shared monotonic sequence; the sweep removes the
 *     minted row but cannot give the id back.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { config } from '../../src/config/config.ts';
import { MATRIX_COPY_COLUMNS } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { updateOntology } from '../../src/core/ontology/ontology_update.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';

// ---------------------------------------------------------------------------
// scratch surface
// ---------------------------------------------------------------------------

/** Scratch TLDs — BOTH under the one `zzd%` sweep prefix. */
const TLD = 'zzd';
const TLD_B = 'zzdb';
const SCRATCH_LIKE = 'zzd%';
/** Scratch section_id band (942000-942999). */
const SEEDED_ID = 942900;
const IMPORT_IDS = [942500, 942501];

const tempRoots: string[] = [];

function makeDirs(): { ioBaseDir: string; changesDir: string } {
	const root = mkdtempSync(join(tmpdir(), 'zzd_upd_shell_'));
	tempRoots.push(root);
	// confinedPath rejects any resolved path carrying whitespace — a temp root
	// with a space would make every case read as a staging refusal.
	expect(/[\s'"\\]/.test(root)).toBe(false);
	const ioBaseDir = join(root, 'io');
	mkdirSync(ioBaseDir, { recursive: true });
	return { ioBaseDir, changesDir: join(root, 'changes') };
}

/** The single versioned IO dir `setOntologyIoPath` creates under the base. */
function versionedIoDir(ioBaseDir: string): string | null {
	const entries = readdirSync(ioBaseDir);
	return entries.length === 1 ? join(ioBaseDir, entries[0] as string) : null;
}

// ---------------------------------------------------------------------------
// COPY payload fabrication — a `<tld>.copy.gz` that survives gunzipWithCaps
// and copySanityCheck(MATRIX_COPY_COLUMNS.length), and that parses into real
// dd_ontology child nodes of `<tld>0`.
// ---------------------------------------------------------------------------

function ontologyRow(sectionId: number, sectionTipo: string, term: string): string {
	const tld = sectionTipo.slice(0, -1);
	const cols = [
		String(sectionId),
		sectionTipo,
		JSON.stringify({ section_id: sectionId, section_tipo: sectionTipo }),
		// ontology15 = parent locator → `<tld>0`, so the imported record derives
		// a dd_ontology node whose parent is the TLD root.
		JSON.stringify({
			ontology15: [
				{
					id: 1,
					type: 'dd151',
					section_id: '0',
					section_tipo: sectionTipo,
					from_component_tipo: 'ontology15',
				},
			],
		}),
		JSON.stringify({
			ontology5: [{ id: 1, lang: 'lg-spa', value: term }],
			ontology7: [{ id: 1, lang: 'lg-nolan', value: tld }],
		}),
		...Array.from({ length: MATRIX_COPY_COLUMNS.length - 5 }, () => '\\N'),
	];
	expect(cols.length).toBe(MATRIX_COPY_COLUMNS.length);
	return cols.join('\t');
}

function validPayload(sectionTipo: string, ids: readonly number[] = IMPORT_IDS): Buffer {
	return Buffer.from(
		`${ids.map((id) => ontologyRow(id, sectionTipo, `zzd scratch ${id}`)).join('\n')}\n`,
		'utf8',
	);
}

/** Right arity (survives copySanityCheck) but `data` is not jsonb → COPY fails. */
function copyBreakingPayload(sectionTipo: string): Buffer {
	const cols = [
		'942700',
		sectionTipo,
		'not-json',
		...Array.from({ length: MATRIX_COPY_COLUMNS.length - 3 }, () => '\\N'),
	];
	return Buffer.from(`${cols.join('\t')}\n`, 'utf8');
}

/**
 * Wrong arity → copySanityCheck refuses in Phase A, before any DB statement.
 *
 * TWO DIFFERENT lines, deliberately — defect D10, pinned not fixed:
 * `copySanityCheck` exempts the final sampled line (it may be truncated
 * mid-row) but identifies it BY VALUE (`line !== lines[lines.length - 1]`), so
 * a one-line file — or any file whose bad lines are all byte-identical —
 * passes the check and reaches the destructive import.
 */
function unstageablePayload(): Buffer {
	return Buffer.from('a\tb\tc\nd\te\tf\n', 'utf8');
}

// ---------------------------------------------------------------------------
// the fixture "ontology master": a local server that IS the configured origin
// ---------------------------------------------------------------------------

interface Fixture {
	origin: string;
	stop: () => void;
}

function serveFiles(files: Record<string, Buffer>): Fixture {
	const server = Bun.serve({
		port: 0,
		fetch(request) {
			const name = new URL(request.url).pathname.split('/').pop() as string;
			const body = files[name];
			if (body === undefined) return new Response('nope', { status: 404 });
			return new Response(gzipSync(body));
		},
	});
	return { origin: `http://localhost:${server.port}`, stop: () => server.stop(true) };
}

function remoteCatalog(origin: string): {
	servers: { code: string; url: string }[];
	isOntologyServer: boolean;
} {
	return { servers: [{ code: 'zzdmaster', url: `${origin}/api/` }], isOntologyServer: false };
}

function optionsFor(origin: string, tlds: readonly string[]): unknown {
	return {
		// The client-supplied url is IGNORED (WC-023 D5) — point it somewhere
		// else entirely so a shell that trusted it would fetch the wrong host.
		server: { name: 'zzd master', url: 'http://never.trusted.example/', code: 'zzdmaster' },
		files: tlds.map((tld) => ({ tld, url: `${origin}/${tld}.copy.gz` })),
	};
}

// ---------------------------------------------------------------------------
// scratch-confinement measurement + sweep
// ---------------------------------------------------------------------------

interface OntologyCensus {
	ddOntology: number;
	matrixOntology: number;
	matrixOntologyMain: number;
	matrixDd: number;
}

/** Rows OUTSIDE the scratch surface — these must never move. */
async function nonScratchCensus(): Promise<OntologyCensus> {
	const one = async (query: Promise<unknown>): Promise<number> =>
		Number((((await query) as { c: number }[])[0] as { c: number }).c);
	return {
		ddOntology: await one(
			sql`SELECT count(*)::int AS c FROM dd_ontology WHERE tipo NOT LIKE ${SCRATCH_LIKE}`,
		),
		matrixOntology: await one(
			sql`SELECT count(*)::int AS c FROM matrix_ontology WHERE section_tipo NOT LIKE ${SCRATCH_LIKE}`,
		),
		matrixOntologyMain: await one(
			sql`SELECT count(*)::int AS c FROM matrix_ontology_main
			    WHERE NOT (string->'hierarchy6' @> '[{"value":"zzd"}]'::jsonb)
			      AND NOT (string->'hierarchy6' @> '[{"value":"zzdb"}]'::jsonb)`,
		),
		matrixDd: await one(sql`SELECT count(*)::int AS c FROM matrix_dd`),
	};
}

/**
 * The stop-the-world guard: run `work`, and if a NON-scratch ontology count
 * moved, fail loudly. This is the failure mode that would destroy the suite DB.
 */
async function assertScratchOnly(work: () => Promise<void>): Promise<void> {
	const before = await nonScratchCensus();
	try {
		await work();
	} finally {
		const after = await nonScratchCensus();
		expect({ where: 'non-scratch ontology rows', ...after }).toEqual({
			where: 'non-scratch ontology rows',
			...before,
		});
	}
}

async function scratchRows(): Promise<{ section_id: number; d: unknown; r: unknown }[]> {
	return (await sql`SELECT section_id, data AS d, relation AS r FROM matrix_ontology
	                  WHERE section_tipo LIKE ${SCRATCH_LIKE} ORDER BY section_id`) as unknown as {
		section_id: number;
		d: unknown;
		r: unknown;
	}[];
}

async function scratchOntologyTipos(): Promise<string[]> {
	const rows = (await sql`SELECT tipo FROM dd_ontology WHERE tipo LIKE ${SCRATCH_LIKE}
	                        ORDER BY tipo`) as unknown as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

/**
 * Remove every scratch row this file can mint. `expectRows` asserts the sweep
 * actually deleted something — a silent 0-row delete would mean the case never
 * wrote where it claimed to, and the assertions above it were measuring air.
 */
async function sweepScratch(expectRows: boolean): Promise<void> {
	const counts: number[] = [];
	const del = async (query: Promise<unknown>): Promise<void> => {
		const result = (await query) as unknown as { count?: number };
		counts.push(Number(result.count ?? 0));
	};
	await del(sql`DELETE FROM matrix_ontology WHERE section_tipo LIKE ${SCRATCH_LIKE}`);
	await del(sql`DELETE FROM dd_ontology WHERE tipo LIKE ${SCRATCH_LIKE}`);
	await del(sql`DELETE FROM matrix_counter WHERE tipo LIKE ${SCRATCH_LIKE}`);
	await del(sql`DELETE FROM matrix_ontology_main
	              WHERE string->'hierarchy6' @> '[{"value":"zzd"}]'::jsonb
	                 OR string->'hierarchy6' @> '[{"value":"zzdb"}]'::jsonb`);
	await del(sql`DELETE FROM matrix_time_machine WHERE section_tipo LIKE ${SCRATCH_LIKE}`);
	if (expectRows && counts.reduce((sum, n) => sum + n, 0) === 0) {
		throw new Error('scratch sweep deleted 0 rows — the case wrote nothing it claimed to write');
	}
}

/** One pre-existing `zzd0` record, so a restore has something real to restore. */
async function seedScratchRow(): Promise<void> {
	await sql`INSERT INTO matrix_ontology (section_id, section_tipo, data, relation, string)
	          VALUES (${SEEDED_ID}, 'zzd0',
	                  ${JSON.stringify({ section_id: SEEDED_ID, section_tipo: 'zzd0', marker: 'seeded-before-import' })}::text::jsonb,
	                  ${JSON.stringify({})}::text::jsonb,
	                  ${JSON.stringify({ ontology5: [{ id: 1, lang: 'lg-spa', value: 'zzd seeded' }] })}::text::jsonb)`;
}

beforeEach(async () => {
	await sweepScratch(false);
});

afterAll(async () => {
	await sweepScratch(false);
	for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Target refusal, observed AT THE SHELL
// ---------------------------------------------------------------------------

describe('target refusal short-circuits before any artifact exists', () => {
	test('an unknown server code is refused with NO io dir, staging dir or recovery dir', async () => {
		const { ioBaseDir, changesDir } = makeDirs();
		const out = await updateOntology(optionsFor('http://x.example', [TLD]), -1, {
			catalog: {
				servers: [{ code: 'other', url: 'https://other.example/' }],
				isOntologyServer: false,
			},
			ioBaseDir,
			changesDir,
		});

		expect(out.ok).toBe(false);
		expect(out.errors).toEqual(['unknown ontology server code: zzdmaster']);
		expect(out.msg).toBe('Error. The selected server is not configured on this instance');
		// The refusal is BEFORE setOntologyIoPath: nothing at all was created.
		// A future edit that trusted the client-supplied `server.url` (WC-023 D5
		// SSRF) would fall through and these artifacts would appear.
		expect(readdirSync(ioBaseDir)).toEqual([]);
		expect(existsSync(changesDir)).toBe(false);
	});

	test('the localhost pseudo-server is refused unless THIS instance is a master', async () => {
		const { ioBaseDir, changesDir } = makeDirs();
		const localhostOptions = {
			server: { name: 'local', url: 'http://localhost/', code: 'localhost' },
			files: [{ tld: TLD, url: 'http://localhost/zzd.copy.gz' }],
		};

		const refused = await updateOntology(localhostOptions, -1, {
			catalog: { servers: [], isOntologyServer: false },
			ioBaseDir,
			changesDir,
		});
		expect(refused.errors).toEqual(['unknown ontology server code: localhost']);
		expect(readdirSync(ioBaseDir)).toEqual([]);

		// Same call, same client bytes — only the INJECTED catalog differs. This
		// is the machine-shape guard: read from config.ontologyIo instead and the
		// answer depends on this developer's ../private/.env.
		const accepted = await updateOntology(localhostOptions, -1, {
			catalog: { servers: [], isOntologyServer: true },
			ioBaseDir,
			changesDir,
		});
		expect(accepted.ok).toBe(false);
		expect(accepted.msg).toBe('Error. Local ontology file missing: zzd.copy.gz');
		// It got past the guard into Phase A — the io dir now exists — but no
		// destructive phase ran: no recovery dir, and the staging dir is gone.
		const versioned = versionedIoDir(ioBaseDir);
		expect(versioned).not.toBeNull();
		expect(existsSync(join(versioned as string, 'recovery'))).toBe(false);
		expect(existsSync(join(versioned as string, '.staging'))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 2. Single-flight latch — refused WHILE running, and CLEARED afterwards
// ---------------------------------------------------------------------------

describe('single-flight latch', () => {
	test('a concurrent call is refused, and the latch is released for the next one', async () => {
		const { ioBaseDir, changesDir } = makeDirs();
		let release: () => void = () => undefined;
		let arrived: () => void = () => undefined;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const hasArrived = new Promise<void>((resolve) => {
			arrived = resolve;
		});
		// The first call parks inside Phase A's download, holding the latch: the
		// fixture server signals arrival, then blocks until `release()`.
		const inflightServer = Bun.serve({
			port: 0,
			async fetch() {
				arrived();
				await held;
				return new Response(gzipSync(unstageablePayload()));
			},
		});
		const origin = `http://localhost:${inflightServer.port}`;
		const deps = { catalog: remoteCatalog(origin), ioBaseDir, changesDir };

		const first = updateOntology(optionsFor(origin, [TLD]), -1, deps);
		await hasArrived;

		const concurrent = await updateOntology(optionsFor(origin, [TLD]), -1, deps);
		expect(concurrent.ok).toBe(false);
		expect(concurrent.errors).toEqual(['an ontology update is already running']);
		expect(concurrent.msg).toBe('Error. An ontology update is already running');

		release();
		const firstOut = await first;
		// The first call aborts in Phase A (bad COPY arity) — nothing destructive.
		expect(firstOut.msg).toBe('Error. Staged file failed validation: zzd.copy.gz');

		// …and the latch is CLEARED: the next call is NOT refused. Without this
		// half the case passes on a latch that never clears — an instance that
		// refuses every subsequent ontology update until restart.
		const afterwards = await updateOntology(optionsFor(origin, [TLD]), -1, deps);
		inflightServer.stop(true);
		expect(afterwards.errors).not.toContain('an ontology update is already running');
		expect(afterwards.msg).toBe('Error. Staged file failed validation: zzd.copy.gz');

		expect(await scratchRows()).toEqual([]);
	}, 30_000);
});

// ---------------------------------------------------------------------------
// 3. Phase B — a failed recovery snapshot leaves the database UNTOUCHED
// ---------------------------------------------------------------------------

describe('Phase B recovery snapshot', () => {
	test('a snapshot failure aborts BEFORE the first destructive statement', async () => {
		const { ioBaseDir, changesDir } = makeDirs();
		const fixture = serveFiles({ 'zzd.copy.gz': validPayload('zzd0') });
		// A conn that cannot connect: `snapshotTableRows` returns false. The
		// staged payload is VALID, so only the snapshot decides this outcome.
		const deadConn: DbConnDescriptor = {
			database: 'zzd_no_such_database',
			host: config.db.host,
			port: config.db.port,
			user: config.db.user,
			password: config.db.password,
		};

		await assertScratchOnly(async () => {
			const out = await updateOntology(optionsFor(fixture.origin, [TLD]), -1, {
				conn: deadConn,
				catalog: remoteCatalog(fixture.origin),
				ioBaseDir,
				changesDir,
			});
			fixture.stop();

			expect(out.ok).toBe(false);
			expect(out.msg).toBe('Error. Recovery snapshot failed — database untouched');
			expect(out.errors).toContain('recovery snapshot failed for zzd');
			// "database untouched" is a CLAIM — measure it. Moving the import
			// before the snapshot (or ignoring the snapshot's verdict) provisions
			// the registry record and the dd_ontology root before this point.
			expect(await scratchRows()).toEqual([]);
			expect(await scratchOntologyTipos()).toEqual([]);
			// no schema-changes artifact is written on an abort
			expect(existsSync(changesDir)).toBe(false);
		});
		await sweepScratch(false);
	}, 30_000);
});

// ---------------------------------------------------------------------------
// 4. Phase C — one file imported, the next fails ⇒ restore + the D7 message
// ---------------------------------------------------------------------------

describe('Phase C auto-restore', () => {
	test('an import failure restores the already-imported TLD and refuses to claim more', async () => {
		const { ioBaseDir, changesDir } = makeDirs();
		await seedScratchRow();
		const before = await scratchRows();
		expect(before.length).toBe(1);

		const fixture = serveFiles({
			'zzd.copy.gz': validPayload('zzd0'),
			'zzdb.copy.gz': copyBreakingPayload('zzdb0'),
		});

		await assertScratchOnly(async () => {
			const out = await updateOntology(optionsFor(fixture.origin, [TLD, TLD_B]), -1, {
				catalog: remoteCatalog(fixture.origin),
				ioBaseDir,
				changesDir,
			});
			fixture.stop();

			expect(out.ok).toBe(false);
			// D7: the message may NOT claim the previous state was restored — the
			// registry record and dd_ontology root node of every provisioned TLD
			// are NOT covered by the Phase-B snapshots.
			expect(out.msg).toBe(
				'Error. Import failed — matrix rows restored; registry and dd_ontology state may be partial',
			);
			expect(out.errors).toContain(
				'registry record (matrix_ontology_main) and dd_ontology root node NOT reverted for: zzd, zzdb — MANUAL REVIEW REQUIRED',
			);
			// TLD 1 is back to its pre-import content, row for row — the imported
			// 942500/942501 are gone and the seeded row is byte-identical.
			expect(await scratchRows()).toEqual(before);
			// and the provisioned roots the message names really are still there.
			expect(await scratchOntologyTipos()).toEqual(
				expect.arrayContaining(['zzd0', 'zzdb0']) as unknown as string[],
			);
		});
		await sweepScratch(true);
	}, 60_000);
});

// ---------------------------------------------------------------------------
// 5. The success tail — the artifact's CONTENT, and a non-colliding counter
// ---------------------------------------------------------------------------

describe('success tail', () => {
	test('the schema-changes artifact carries exactly this import, and the counter is consolidated', async () => {
		const { ioBaseDir, changesDir } = makeDirs();
		const fixture = serveFiles({ 'zzd.copy.gz': validPayload('zzd0') });
		// A STALE counter — the real shape of this hazard. Without it the case is
		// VACUOUS: insertMatrixRecordWithCounter seeds a MISSING counter row from
		// MAX(section_id)+1, so a first insert into a counter-less section is
		// safe whether or not consolidation ran. It is a counter row left BEHIND
		// the imported ids that hands out colliding ids (the D1 class).
		await sql`INSERT INTO matrix_counter (tipo, value) VALUES ('zzd0', 5)
		          ON CONFLICT (tipo) DO UPDATE SET value = 5`;

		await assertScratchOnly(async () => {
			const out = await updateOntology(optionsFor(fixture.origin, [TLD]), -1, {
				catalog: remoteCatalog(fixture.origin),
				ioBaseDir,
				changesDir,
			});
			fixture.stop();

			expect(out.errors).toEqual([]);
			expect(out.ok).toBe(true);
			expect(out.msg.startsWith('OK. Request done successfully')).toBe(true);

			// -- the imported rows landed, and dd_ontology was re-derived from them
			expect((await scratchRows()).map((row) => row.section_id)).toEqual(IMPORT_IDS);
			expect(await scratchOntologyTipos()).toEqual(['zzd0', 'zzd942500', 'zzd942501']);

			// -- the operator artifact. "it exists / is valid JSON" is vacuous:
			// the D8 re-regression (reading the BEFORE schema after the import)
			// writes a valid, permanently EMPTY artifact. Only content-equality
			// with the additions this import actually made kills it.
			const artifacts = readdirSync(changesDir);
			expect(artifacts.length).toBe(1);
			const changes = JSON.parse(
				readFileSync(join(changesDir, artifacts[0] as string), 'utf8'),
			) as { tipo: string; children_added: string[] }[];
			expect(changes.filter((entry) => entry.tipo.startsWith('zzd'))).toEqual([
				{ tipo: 'zzd0', children_added: ['zzd942500', 'zzd942501'] },
			]);

			// -- root_info read-back
			expect(out.root_info).not.toBeUndefined();

			// -- the counter was consolidated to MAX(section_id): the NEXT record
			// created in this section must not collide with an imported id.
			const nextId = await createSectionRecord('zzd0', -1);
			expect(nextId).toBe(Math.max(...IMPORT_IDS) + 1);
		});
		await sweepScratch(true);
	}, 120_000);
});
