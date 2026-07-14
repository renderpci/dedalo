/**
 * MariaDB target + SQL-writer integration gate (DIFFUSION_PLAN D3-P2;
 * DIFFUSION_SPEC §9-P2) — against the REAL MariaDB deployment.
 *
 * Exercises the full WriterSession lifecycle on a synthetic PublicationPlan
 * with a SCRATCH table (`dedalo_ts_test_writer` in web_numisdata_mib):
 * open (loud missing-db posture) → ensureSchema (table anatomy: typed
 * columns, composite PK, indexes) → writeRows (multi-row upsert per lang;
 * re-write updates in place) → additive schema EVOLUTION (extended plan →
 * new column, existing data intact) → removeRecords (all lang variants gone;
 * missing table tolerated as no-op) → close (old engine_response.tables
 * counts). Plus the pure statement-shape assertions (no DB needed) for the
 * sql_generator builders and the writer registry's loud unknown-format error.
 *
 * SAFETY: this suite only ever touches tables named `dedalo_ts_test_*` —
 * web_numisdata_mib holds REAL published data. The scratch table is dropped
 * in afterAll unconditionally.
 *
 * Credentials: DEDALO_DIFFUSION_DB_* from ../private/.env (db.ts), same as
 * the runtime — the old per-user fallback to the OLD engine's env file at a
 * hardcoded /Users/… path was removed (S3-67 machine decoupling; the keys now
 * live in ../private/.env). When the keys are absent (or the socket is) the
 * suite skips with a logged message (test.if pattern,
 * media_processing.test.ts precedent).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readEnv } from '../../src/config/env.ts';
import type { FieldPlan, PublicationPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import type { ProjectedRow } from '../../src/diffusion/project/lang_ladder.ts';
import {
	MissingTargetDatabaseError,
	closeAllTargetPools,
	getTargetPool,
} from '../../src/diffusion/targets/mariadb/db.ts';
import {
	generateBatchUpsert,
	generateCreateTable,
	generateDelete,
	planUpsertBatches,
} from '../../src/diffusion/targets/mariadb/sql_generator.ts';
import { mariadbSqlWriter } from '../../src/diffusion/writers/mariadb_sql.ts';
import {
	UnknownDiffusionFormatError,
	getDiffusionWriter,
} from '../../src/diffusion/writers/registry.ts';

// ---------------------------------------------------------------------------
// Environment gating: DEDALO_DIFFUSION_DB_* from ../private/.env, like the
// runtime (S3-67: no machine-specific fallback paths).
// ---------------------------------------------------------------------------

const RESOLVED_SOCKET = (readEnv('DEDALO_DIFFUSION_DB_SOCKET') ?? '/tmp/mysql.sock') as string;
const HAVE_DB =
	readEnv('DEDALO_DIFFUSION_DB_USER') !== undefined &&
	(readEnv('DEDALO_DIFFUSION_DB_HOST') !== undefined || existsSync(RESOLVED_SOCKET));
if (!HAVE_DB) {
	console.warn(
		`[SKIPPED] diffusion_mariadb integration: no MariaDB credentials/socket available (set DEDALO_DIFFUSION_DB_USER/_DB_PASSWORD/_DB_SOCKET; probed socket: ${RESOLVED_SOCKET})`,
	);
}

// ---------------------------------------------------------------------------
// Synthetic PublicationPlan fixtures (2 fields; evolution adds a third).
// ---------------------------------------------------------------------------

const TARGET_DATABASE = 'web_numisdata_mib';
const SCRATCH_TABLE = 'dedalo_ts_test_writer';
const MISSING_TABLE = 'dedalo_ts_test_writer_missing';

function makeField(partial: Partial<FieldPlan> & Pick<FieldPlan, 'id' | 'columnName'>): FieldPlan {
	return {
		sourceChain: [],
		transform: [],
		column: { fieldModel: 'field_text' },
		policy: {},
		...partial,
	};
}

const BASE_FIELDS: FieldPlan[] = [
	makeField({
		id: 'testdd1',
		columnName: 'title',
		column: { fieldModel: 'field_varchar', varcharLength: 100 },
	}),
	makeField({ id: 'testdd2', columnName: 'description', column: { fieldModel: 'field_text' } }),
	// Resolution-only field: must never become a column (excludeColumn).
	makeField({ id: 'testdd3', columnName: 'internal_only', excludeColumn: true }),
];

const EVOLVED_FIELDS: FieldPlan[] = [
	...BASE_FIELDS,
	makeField({
		id: 'testdd4',
		columnName: 'extra_note',
		column: { fieldModel: 'field_varchar', varcharLength: 50 },
	}),
];

function makePlan(fields: FieldPlan[], tableName = SCRATCH_TABLE): PublicationPlan {
	const section: SectionPlan = {
		sectionTipo: 'test1',
		tableName,
		tableTipo: 'testdd0',
		fields,
	};
	return {
		planId: `test-plan-${tableName}-${fields.length}`,
		elementTipo: 'testdd_element',
		format: 'sql',
		serviceName: null,
		target: { kind: 'table', database: TARGET_DATABASE },
		sections: [section],
		recursion: { maxLevels: 2 },
		langPolicy: { langs: ['lg-eng', 'lg-spa'], mainLang: 'lg-eng' },
		warnings: [],
	};
}

/** 2 records × 2 langs of projected rows, values tagged per (id, lang). */
function makeRows(titlePrefix: string): ProjectedRow[] {
	const rows: ProjectedRow[] = [];
	for (const sectionId of [1, 2]) {
		for (const lang of ['lg-eng', 'lg-spa']) {
			rows.push({
				sectionId,
				lang,
				columns: {
					title: `${titlePrefix} ${sectionId} ${lang}`,
					description: `Description ${sectionId} ${lang} — utf8mb4 çedille 🏛️`,
				},
			});
		}
	}
	return rows;
}

/** Direct scratch-table read for assertions (goes through the target pool). */
async function selectScratchRows(): Promise<
	{
		section_id: number;
		lang: string;
		title: string | null;
		description: string | null;
		extra_note?: string | null;
	}[]
> {
	const pool = getTargetPool(TARGET_DATABASE);
	return (await pool.unsafe(
		`SELECT * FROM ${SCRATCH_TABLE} ORDER BY section_id, lang`,
		[],
	)) as never;
}

afterAll(async () => {
	if (HAVE_DB) {
		// ALWAYS drop the scratch table — never leave residue in the real database.
		const pool = getTargetPool(TARGET_DATABASE);
		await pool.unsafe(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`, []).catch(() => {});
		await pool.unsafe(`DROP TABLE IF EXISTS ${MISSING_TABLE}`, []).catch(() => {});
	}
	await closeAllTargetPools();
});

// ---------------------------------------------------------------------------
// Pure statement shapes + registry (no DB required — always run).
// ---------------------------------------------------------------------------

describe('sql_generator statement shapes (pure, oracle anatomy)', () => {
	const plan = makePlan(BASE_FIELDS);
	const section = plan.sections[0] as SectionPlan;

	test('CREATE TABLE: composite PK, typed columns, indexes, excludeColumn skipped', () => {
		const createSql = generateCreateTable(section);
		expect(createSql).toContain(`CREATE TABLE IF NOT EXISTS \`${SCRATCH_TABLE}\``);
		expect(createSql).toContain('`section_id` INT(12) NOT NULL');
		expect(createSql).toContain('`lang` VARCHAR(16) DEFAULT NULL');
		expect(createSql).toContain('`title` VARCHAR(100) DEFAULT NULL');
		expect(createSql).toContain('`description` TEXT DEFAULT NULL');
		expect(createSql).toContain('PRIMARY KEY (section_id, lang)');
		expect(createSql).toContain('KEY `title` (`title`)'); // varchar<250: no prefix
		expect(createSql).toContain('FULLTEXT KEY `description` (`description`)');
		expect(createSql).toContain('ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
		expect(createSql).not.toContain('internal_only'); // excludeColumn: no column
	});

	test('multi-row upsert: one statement, flat params, VALUES(col) update clause', () => {
		const rows = makeRows('Title').slice(0, 2);
		const statement = generateBatchUpsert(SCRATCH_TABLE, ['title', 'description'], rows);
		expect(statement.sql).toContain(
			`INSERT INTO \`${SCRATCH_TABLE}\` (\`section_id\`, \`lang\`, \`title\`, \`description\`)`,
		);
		expect(statement.sql).toContain('VALUES (?, ?, ?, ?),\n(?, ?, ?, ?)');
		expect(statement.sql).toContain(
			'ON DUPLICATE KEY UPDATE\n`title` = VALUES(`title`), `description` = VALUES(`description`)',
		);
		expect(statement.params).toHaveLength(8); // 2 rows × (id + lang + 2 cols)
		expect(statement.params[0]).toBe(1);
		expect(statement.params[1]).toBe('lg-eng');
	});

	test('batch planning honors row and byte caps', () => {
		const rows = makeRows('T'); // 4 rows
		expect(
			planUpsertBatches(rows, ['title'], { maxRowsPerStatement: 3, maxBytesPerStatement: 1e9 }).map(
				(b) => b.length,
			),
		).toEqual([3, 1]);
		// Tiny byte budget: every row must ship alone (oversized rows still ship).
		expect(
			planUpsertBatches(rows, ['title'], { maxRowsPerStatement: 200, maxBytesPerStatement: 1 }).map(
				(b) => b.length,
			),
		).toEqual([1, 1, 1, 1]);
	});

	test('delete: IN-list with stringified ids (oracle posture)', () => {
		const statement = generateDelete(SCRATCH_TABLE, [1, 'test1_2']);
		expect(statement.sql).toBe(`DELETE FROM \`${SCRATCH_TABLE}\` WHERE section_id IN (?, ?)`);
		expect(statement.params).toEqual(['1', 'test1_2']);
	});
});

describe('writer registry (loud unknown-format posture)', () => {
	test("'sql' resolves the mariadb writer; 'socrata' is its dormant alias", () => {
		expect(getDiffusionWriter('sql')).toBe(mariadbSqlWriter);
		expect(getDiffusionWriter('socrata')).toBe(mariadbSqlWriter);
	});

	test('unknown format throws the named error — never a silent no-op', () => {
		expect(() => getDiffusionWriter('carrier-pigeon')).toThrow(UnknownDiffusionFormatError);
	});
});

// ---------------------------------------------------------------------------
// Live-MariaDB session lifecycle (env-gated).
// ---------------------------------------------------------------------------

describe('mariadb_sql writer against the live target (env-gated)', () => {
	test.if(HAVE_DB)(
		'full session: ensureSchema → writeRows → upsert-rewrite → remove → close',
		async () => {
			const plan = makePlan(BASE_FIELDS);
			const section = plan.sections[0] as SectionPlan;

			// Clean slate (a previous aborted run may have left the scratch table).
			const pool = getTargetPool(TARGET_DATABASE);
			await pool.unsafe(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`, []);

			const session = await mariadbSqlWriter.open(plan);

			// Guard: DML before the schema critical section is a programming error.
			await expect(session.writeRows(section, makeRows('Early'))).rejects.toThrow(
				/before ensureSchema/,
			);

			// --- ensureSchema: table exists with the exact anatomy ---------------
			await session.ensureSchema();
			const columns = (await pool.unsafe(
				'SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
				[TARGET_DATABASE, SCRATCH_TABLE],
			)) as { COLUMN_NAME: string; DATA_TYPE: string }[];
			expect(columns.map((c) => c.COLUMN_NAME)).toEqual([
				'section_id',
				'lang',
				'title',
				'description',
			]);
			expect(columns.find((c) => c.COLUMN_NAME === 'title')?.DATA_TYPE).toBe('varchar');
			expect(columns.find((c) => c.COLUMN_NAME === 'description')?.DATA_TYPE).toBe('text');
			const primaryKey = (await pool.unsafe(
				"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY' ORDER BY SEQ_IN_INDEX",
				[TARGET_DATABASE, SCRATCH_TABLE],
			)) as { COLUMN_NAME: string }[];
			expect(primaryKey.map((c) => c.COLUMN_NAME)).toEqual(['section_id', 'lang']);

			// Idempotent: re-ensuring an up-to-date schema is a clean no-op.
			await session.ensureSchema();

			// --- writeRows: 2 records × 2 langs ----------------------------------
			const firstWrite = await session.writeRows(section, makeRows('Title'));
			expect(firstWrite).toEqual({ written: 4, deleted: 0 });
			const rowsAfterInsert = await selectScratchRows();
			expect(rowsAfterInsert).toHaveLength(4);
			expect(rowsAfterInsert[0]).toMatchObject({
				section_id: 1,
				lang: 'lg-eng',
				title: 'Title 1 lg-eng',
				description: 'Description 1 lg-eng — utf8mb4 çedille 🏛️', // 4-byte emoji intact
			});

			// --- upsert semantics: rewrite updates in place, no duplicates -------
			const rewrite = await session.writeRows(section, makeRows('Retitled'));
			expect(rewrite).toEqual({ written: 4, deleted: 0 });
			const rowsAfterRewrite = await selectScratchRows();
			expect(rowsAfterRewrite).toHaveLength(4); // still 4: PK (section_id, lang)
			expect(rowsAfterRewrite[3]?.title).toBe('Retitled 2 lg-spa');

			// --- removeRecords: all lang variants of section_id 1 gone ----------
			const removal = await session.removeRecords(section, [1]);
			expect(removal).toEqual({ written: 0, deleted: 2 });
			const rowsAfterRemove = await selectScratchRows();
			expect(rowsAfterRemove.map((r) => r.section_id)).toEqual([2, 2]);

			// --- close: old engine_response.tables shape -------------------------
			// records_affected: 4 inserts + 8 (MariaDB counts an ON-DUPLICATE update
			// as 2) + 2 deleted; records_count: 4 + 4 rows written.
			const summary = await session.close();
			expect(summary).toEqual({
				tables: [{ table_name: SCRATCH_TABLE, records_affected: 14, records_count: 8 }],
				errors: [],
			});
			await session.abort(); // no-op, must not throw after close
		},
	);

	test.if(HAVE_DB)('schema EVOLUTION: extended plan adds the new column additively', async () => {
		const evolvedPlan = makePlan(EVOLVED_FIELDS);
		const evolvedSection = evolvedPlan.sections[0] as SectionPlan;
		const session = await mariadbSqlWriter.open(evolvedPlan);
		await session.ensureSchema();

		const pool = getTargetPool(TARGET_DATABASE);
		const columns = (await pool.unsafe(
			'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
			[TARGET_DATABASE, SCRATCH_TABLE],
		)) as { COLUMN_NAME: string }[];
		expect(columns.map((c) => c.COLUMN_NAME)).toEqual([
			'section_id',
			'lang',
			'title',
			'description',
			'extra_note', // ADDED — existing columns untouched (additive only)
		]);

		// Survivors of the previous test are intact (ALTER ADD lost nothing).
		const survivors = await selectScratchRows();
		expect(survivors.map((r) => r.section_id)).toEqual([2, 2]);
		expect(survivors[0]?.extra_note).toBeNull();

		// New column is writable through the evolved plan.
		const write = await session.writeRows(evolvedSection, [
			{
				sectionId: 3,
				lang: 'lg-eng',
				columns: { title: 'Evolved', description: null, extra_note: 'note 3' },
			},
		]);
		expect(write).toEqual({ written: 1, deleted: 0 });
		const withNote = (await selectScratchRows()).find((r) => r.section_id === 3);
		expect(withNote?.extra_note).toBe('note 3');
		await session.close();
	});

	test.if(HAVE_DB)(
		'removeRecords on a missing table is a tolerated no-op (errno 1146)',
		async () => {
			const missingPlan = makePlan(BASE_FIELDS, MISSING_TABLE);
			const missingSection = missingPlan.sections[0] as SectionPlan;
			const session = await mariadbSqlWriter.open(missingPlan);
			// No ensureSchema on purpose: the table never exists.
			const removal = await session.removeRecords(missingSection, [1, 2, 3]);
			expect(removal).toEqual({ written: 0, deleted: 0 });
			const summary = await session.close();
			expect(summary.tables).toEqual([
				{ table_name: MISSING_TABLE, records_affected: 0, records_count: 0 },
			]);
		},
	);

	test.if(HAVE_DB)(
		'missing target database fails LOUDLY at open (never auto-created)',
		async () => {
			const badPlan: PublicationPlan = {
				...makePlan(BASE_FIELDS),
				target: { kind: 'table', database: 'dedalo_ts_test_no_such_db' },
			};
			await expect(mariadbSqlWriter.open(badPlan)).rejects.toThrow(MissingTargetDatabaseError);
		},
	);

	test.if(HAVE_DB)("non-'table' target is rejected at open", async () => {
		const filesPlan: PublicationPlan = {
			...makePlan(BASE_FIELDS),
			target: { kind: 'files', serviceName: 'test' },
		};
		await expect(mariadbSqlWriter.open(filesPlan)).rejects.toThrow(/requires a 'table' target/);
	});
});
