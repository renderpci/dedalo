/**
 * END-TO-END PUBLISH — the portable half, on a BUILT diffusion domain.
 *
 * `diffusion_publish_e2e.test.ts` does three things, and only one of them is
 * bound to an installation:
 *
 *   1. FUNCTIONAL — the run creates the table, adds the typed columns, writes
 *      per-lang rows. This asserts what OUR pipeline does. Portable.
 *   2. ORACLE SPOT-CHECK — the written rows are diffed against the rows the
 *      DECOMMISSIONED PHP engine actually published in that install's MariaDB.
 *      There is no generic twin of "what the old engine published", so it stays
 *      where it is, as the frozen record it is.
 *   3. RESUME BYTE-EQUIVALENCE — an interrupted run resumed from its checkpoint
 *      produces byte-identical rows to an uninterrupted one. Self-referential:
 *      it compares our output with our output. Portable.
 *
 * This file is 1 and 3, over the `zzdif` domain the suite builds
 * (test/helpers/zzdif_diffusion_domain.ts). It runs on any deployment with a
 * scratch MariaDB schema, which is what the install-bound original never could.
 *
 * ── THE TARGET SCHEMA ────────────────────────────────────────────────────────
 * `CREATE DATABASE` is deliberately NOT granted to the diffusion user
 * (src/diffusion/targets/mariadb/db.ts), so this gate cannot mint its own target
 * and has to find a disposable one: a schema whose name ends `_difftest`, which
 * is the naming this repo already uses for a throwaway publication target. If
 * there is none it SKIPS, visibly and with the reason — it never falls back to a
 * real publication database, because this gate writes tables and an
 * installation's published data is not ours to touch.
 *
 * That discovery is deliberately NOT an env key: `../private/.env` is
 * append-only with a typed catalog, and a whole new documented key naming a
 * throwaway schema would be a heavier contract than the convention it replaces.
 * Every table it creates is prefixed `dedalo_ts_zzdif_` and dropped in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { compileElementPlan } from '../../src/diffusion/plan/compile.ts';
import type { PublicationPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import { buildVirtualDiffusionTree } from '../../src/diffusion/plan/virtual_tree.ts';
import type { ProjectedRow } from '../../src/diffusion/project/lang_ladder.ts';
import { resolvePublication } from '../../src/diffusion/resolve/resolver.ts';
import { getTargetPool } from '../../src/diffusion/targets/mariadb/db.ts';
import { getDiffusionWriter } from '../../src/diffusion/writers/registry.ts';
import {
	dropZzdifDomain,
	ensureZzdifDomain,
	ZZDIF_DOMAIN_NAME,
	ZZDIF_ELEMENT,
	ZZDIF_PUBLISHABLE_ID,
	ZZDIF_SECTION,
	ZZDIF_UNPUBLISHABLE_ID,
} from '../helpers/zzdif_diffusion_domain.ts';

const TABLE_FRESH = 'dedalo_ts_zzdif_fresh';
const TABLE_RESUMED = 'dedalo_ts_zzdif_resumed';
/**
 * One instant (EPOCH SECONDS, the resolver's unit) for both runs: the resume
 * comparison is only meaningful if the publish timestamp is held equal, since a
 * run stamps it into the rows it writes.
 */
const RUN_STARTED_AT = Math.floor(Date.parse('2026-08-21T10:00:00.000Z') / 1000);

/** A disposable schema, or null — see the header. Never a real publication target. */
async function resolveScratchSchema(): Promise<{ database: string | null; reason: string }> {
	try {
		const pool = getTargetPool('information_schema');
		const rows = (await pool.unsafe(
			"SELECT schema_name FROM schemata WHERE schema_name LIKE '%\\_difftest' ORDER BY schema_name",
		)) as { schema_name: string }[];
		const found = rows[0]?.schema_name;
		if (found !== undefined) return { database: found, reason: `discovered '${found}'` };
		return {
			database: null,
			reason: 'no MariaDB schema named *_difftest — create one to run this gate',
		};
	} catch (error) {
		return { database: null, reason: `MariaDB unreachable: ${String(error).slice(0, 160)}` };
	}
}

const SCRATCH = await resolveScratchSchema();
const AVAILABLE = SCRATCH.database !== null;
if (!AVAILABLE) {
	console.warn(`[diffusion_publish_native] SKIPPED — ${SCRATCH.reason}`);
}

let plan: PublicationPlan;

/** Clone the plan down to ONE section under a scratch table name and schema. */
function scratchPlan(source: PublicationPlan, tableName: string): PublicationPlan {
	const section = source.sections.find((entry) => entry.sectionTipo === ZZDIF_SECTION);
	if (section === undefined) throw new Error(`plan has no section ${ZZDIF_SECTION}`);
	const cloned = JSON.parse(JSON.stringify(source)) as PublicationPlan;
	cloned.sections = [{ ...(JSON.parse(JSON.stringify(section)) as SectionPlan), tableName }];
	if (cloned.target.kind === 'table') {
		cloned.target.database = SCRATCH.database as string;
	}
	return cloned;
}

async function publish(
	target: PublicationPlan,
	options: { afterSectionId?: number; batchSize: number; stopAfterBatches?: number },
): Promise<{ cursor: number; rowsWritten: number }> {
	const writer = getDiffusionWriter(target.format);
	const session = await writer.open(target);
	let cursor = options.afterSectionId ?? 0;
	let rowsWritten = 0;
	let batchesDone = 0;
	try {
		await session.ensureSchema();
		const batches = resolvePublication(target, {
			sectionTipo: ZZDIF_SECTION,
			runStartedAt: RUN_STARTED_AT,
			afterSectionId: options.afterSectionId,
			batchSize: options.batchSize,
			maxLevels: 0, // primaries only — the clone carries a single section
		});
		for await (const batch of batches) {
			if (batch.rows.length > 0) {
				await session.writeRows(batch.section, batch.rows as ProjectedRow[]);
				rowsWritten += batch.rows.length;
			}
			if (batch.unpublishIds.length > 0) {
				await session.removeRecords(batch.section, batch.unpublishIds);
			}
			cursor = batch.cursor;
			batchesDone += 1;
			if (options.stopAfterBatches !== undefined && batchesDone >= options.stopAfterBatches) {
				break; // simulated interruption — the checkpoint IS this cursor
			}
		}
		await session.close();
	} catch (error) {
		await session.abort().catch(() => {});
		throw error;
	}
	return { cursor, rowsWritten };
}

async function tableRows(table: string): Promise<Record<string, unknown>[]> {
	const pool = getTargetPool(SCRATCH.database as string);
	return (await pool.unsafe(`SELECT * FROM \`${table}\` ORDER BY section_id, lang`)) as Record<
		string,
		unknown
	>[];
}

beforeAll(async () => {
	if (!AVAILABLE) return;
	await ensureZzdifDomain();
	const tree = await buildVirtualDiffusionTree(ZZDIF_DOMAIN_NAME);
	if (tree === null) throw new Error(`no dd1190 domain named '${ZZDIF_DOMAIN_NAME}' after ensure`);
	plan = await compileElementPlan(ZZDIF_ELEMENT, { tree });
});

afterAll(async () => {
	if (AVAILABLE) {
		const pool = getTargetPool(SCRATCH.database as string);
		for (const table of [TABLE_FRESH, TABLE_RESUMED]) {
			await pool.unsafe(`DROP TABLE IF EXISTS \`${table}\``).catch(() => {});
		}
	}
	// Residue asserted, not trusted — the scratch ontology goes whatever happened.
	expect(await dropZzdifDomain()).toBe(0);
});

describe('diffusion publish, end to end, on a BUILT domain', () => {
	test.if(AVAILABLE)(
		'FUNCTIONAL: the table is created, typed and filled per lang',
		async () => {
			const fresh = scratchPlan(plan, TABLE_FRESH);
			const outcome = await publish(fresh, { batchSize: 5 });

			// It wrote something — the floor every assertion below rests on.
			expect(outcome.rowsWritten).toBeGreaterThan(0);
			const rows = await tableRows(TABLE_FRESH);
			expect(rows.length).toBe(outcome.rowsWritten);

			// The PUBLISHABLE record is present, the UNPUBLISHABLE one is not: the
			// publication gate is part of the pipeline under test, not a detail.
			const ids = new Set(rows.map((row) => Number(row.section_id)));
			expect(ids.has(ZZDIF_PUBLISHABLE_ID)).toBe(true);
			expect(ids.has(ZZDIF_UNPUBLISHABLE_ID)).toBe(false);

			// The typed columns the plan declares all exist on the created table —
			// asserted against the PLAN, so a column silently dropped by the writer
			// reddens here rather than surfacing as a missing value much later.
			// `excludeColumn` fields are NOT a gap: they participate in the publication
			// decision and are deliberately never written (compile.ts:527) — the
			// fixture's `publication` enum is exactly one, so this assertion also pins
			// that exclusion, in both directions.
			const fields = (fresh.sections[0] as SectionPlan).fields;
			const present = new Set(Object.keys(rows[0] ?? {}));
			const planned = fields
				.filter((field) => field.excludeColumn !== true)
				.map((field) => field.columnName);
			expect(planned.length).toBeGreaterThan(0);
			expect(planned.filter((column) => !present.has(column))).toEqual([]);
			const excluded = fields.filter((field) => field.excludeColumn === true);
			expect(excluded.length).toBeGreaterThan(0); // or the rule above is untested
			expect(excluded.filter((field) => present.has(field.columnName))).toEqual([]);

			// One row per configured lang for the publishable record.
			const langs = rows
				.filter((row) => Number(row.section_id) === ZZDIF_PUBLISHABLE_ID)
				.map((row) => String(row.lang));
			expect(langs.length).toBeGreaterThan(0);
			expect(new Set(langs).size).toBe(langs.length); // no duplicate lang rows
		},
		120000,
	);

	test.if(AVAILABLE)(
		'RESUME: an interrupted run resumed from its checkpoint is byte-identical',
		async () => {
			const resumed = scratchPlan(plan, TABLE_RESUMED);
			// Interrupt after one batch, then continue from the checkpoint cursor.
			const first = await publish(resumed, { batchSize: 1, stopAfterBatches: 1 });
			expect(first.rowsWritten).toBeGreaterThan(0);
			await publish(resumed, { afterSectionId: first.cursor, batchSize: 5 });

			// Same instant, same plan, same section: the only difference was the
			// interruption. If resume double-wrote, skipped, or reordered, these
			// diverge.
			// PROVEN TO BITE (2026-08-21): a resume cursor advanced 1000 past its
			// checkpoint reddens this with a 120-line diff. A resume from 0 does
			// NOT redden, and should not — the writer upserts on (section_id, lang),
			// so re-publishing rows it already wrote is idempotent by design.
			const resumedRows = await tableRows(TABLE_RESUMED);
			const freshRows = await tableRows(TABLE_FRESH);
			// Two EMPTY tables are also equal, and would make the comparison free —
			// so the content floor is asserted before the comparison, not implied by
			// the sibling test having run first.
			expect(resumedRows.length).toBeGreaterThan(0);
			expect(resumedRows).toEqual(freshRows);
		},
		120000,
	);
});
