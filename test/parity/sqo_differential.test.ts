/**
 * Phase 3 gate (plan A3/A6): SQO DIFFERENTIAL testing — the TS search engine
 * versus the live PHP server, same SQO in, same records out (identity AND
 * order).
 *
 * TS side: buildSearchSql() → execute directly on the shared PostgreSQL.
 * PHP side: dd_core_api::read with the same SQO (logged in as the configured
 * dev user; global admin ⇒ PHP skips the projects ACL, matching the TS
 * engine's current uncovered-ACL state — see sql_assembler.ts header).
 *
 * Comparison: the ordered list of (section_tipo, section_id) of the returned
 * records. Fields/subdata are Phase 4's concern; row identity + order is what
 * the SQL engine owns.
 *
 * Corpus intent: cover plain listing, pagination, string operators (contains,
 * exact, not-empty, empty), multi-section IN, and component ordering.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { sanitizeClientSqo } from '../../src/core/concepts/sqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

interface RecordIdentity {
	section_tipo: string;
	section_id: number;
}

/** The corpus. Each case is one SQO; add cases as builders grow. */
const CORPUS: { name: string; sqo: Record<string, unknown> }[] = [
	{
		name: 'plain list, default order',
		sqo: { section_tipo: ['numisdata6'], limit: 10, offset: 0 },
	},
	{
		name: 'pagination offset',
		sqo: { section_tipo: ['numisdata6'], limit: 7, offset: 10 },
	},
	{
		name: 'string contains (input_text)',
		sqo: {
			section_tipo: ['numisdata6'],
			limit: 20,
			offset: 0,
			filter: {
				$and: [
					{
						q: 'ar',
						path: [{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' }],
						lang: 'lg-spa',
					},
				],
			},
		},
	},
	{
		name: 'string exact ==',
		sqo: {
			section_tipo: ['numisdata6'],
			limit: 10,
			offset: 0,
			filter: {
				$and: [
					{
						q: '==Arsa',
						path: [{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' }],
						lang: 'lg-spa',
					},
				],
			},
		},
	},
	{
		name: 'string not-empty *',
		sqo: {
			section_tipo: ['numisdata6'],
			limit: 15,
			offset: 0,
			filter: {
				$and: [
					{
						q: '*',
						path: [{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' }],
						lang: 'lg-spa',
					},
				],
			},
		},
	},
	{
		name: 'string empty !*',
		sqo: {
			section_tipo: ['numisdata6'],
			limit: 15,
			offset: 0,
			filter: {
				$and: [
					{
						q: '!*',
						path: [{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' }],
						lang: 'lg-spa',
					},
				],
			},
		},
	},
	{
		name: 'boolean $or of two string filters',
		sqo: {
			section_tipo: ['numisdata6'],
			limit: 25,
			offset: 0,
			filter: {
				$or: [
					{
						q: '==Arsa',
						path: [{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' }],
						lang: 'lg-spa',
					},
					{
						q: '==Burzau',
						path: [{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' }],
						lang: 'lg-spa',
					},
				],
			},
		},
	},
	{
		name: 'number comparison >= (component_number)',
		sqo: {
			section_tipo: ['numisdata4'],
			limit: 25,
			offset: 0,
			filter: {
				$and: [
					{
						q: '5',
						q_operator: '>=',
						path: [{ section_tipo: 'numisdata4', component_tipo: 'numisdata133' }],
					},
				],
			},
		},
	},
	{
		name: 'iri not-empty * (component_iri)',
		sqo: {
			section_tipo: ['numisdata300'],
			limit: 25,
			offset: 0,
			filter: {
				$and: [
					{
						q: '*',
						path: [{ section_tipo: 'numisdata300', component_tipo: 'numisdata99' }],
						lang: 'all',
					},
				],
			},
		},
	},
	{
		name: 'order by string component (window path + jsonb sort-select)',
		sqo: {
			section_tipo: ['numisdata6'],
			limit: 10,
			offset: 0,
			filter: {
				$and: [
					{
						q: '*',
						path: [{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' }],
						lang: 'lg-spa',
					},
				],
			},
			order: [
				{
					direction: 'ASC',
					path: [{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' }],
					lang: 'lg-spa',
				},
			],
		},
	},
	{
		// NOTE: with equal section_ids across sections, plain `ORDER BY
		// section_id` leaves the tie order unspecified (physical scan order) —
		// PHP and TS may legitimately differ. The corpus therefore orders
		// explicitly; tie nondeterminism is a property of the PHP engine, not
		// a parity bug.
		name: 'multi-section (same matrix table → IN, explicit order)',
		sqo: {
			section_tipo: ['numisdata6', 'numisdata5'],
			limit: 15,
			offset: 0,
			order: [
				{ direction: 'ASC', path: [{ component_tipo: 'section_tipo' }] },
				{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] },
			],
		},
	},
];

/** Run one SQO through the TS engine and return ordered record identities. */
async function runTsSearch(sqoInput: Record<string, unknown>): Promise<RecordIdentity[]> {
	const sqo = sanitizeClientSqo(structuredClone(sqoInput));
	const { sql: builtSql, params } = await buildSearchSql(sqo);
	const rows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as Record<
		string,
		unknown
	>[];
	return rows.map((row) => ({
		section_tipo: row.section_tipo as string,
		section_id: Number(row.section_id),
	}));
}

/** Run one SQO through the live PHP API and return ordered record identities. */
async function runPhpSearch(
	client: PhpApiClient,
	sqoInput: Record<string, unknown>,
): Promise<RecordIdentity[]> {
	const sectionTipos = sqoInput.section_tipo as string[];
	const { body } = await client.call({
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			model: 'section',
			tipo: sectionTipos[0],
			section_tipo: sectionTipos[0],
			mode: 'list',
			lang: 'lg-spa',
			action: 'search',
		},
		sqo: sqoInput,
	});
	const result = body.result as { data?: Record<string, unknown>[] } | false;
	if (result === false || result === null || !Array.isArray(result.data)) {
		throw new Error(`PHP search failed: ${JSON.stringify(body).slice(0, 300)}`);
	}
	// The list response carries one data entry PER COMPONENT PER RECORD, in
	// row order, each stamped with the record's section_tipo/section_id.
	// Record identity+order = unique (section_tipo, section_id) pairs in
	// first-appearance order.
	const seen = new Set<string>();
	const records: RecordIdentity[] = [];
	for (const entry of result.data) {
		const entrySectionTipo = entry.section_tipo;
		const entrySectionId = entry.section_id;
		if (typeof entrySectionTipo !== 'string' || !sectionTipos.includes(entrySectionTipo)) continue;
		if (entrySectionId === undefined || entrySectionId === null) continue;
		const key = `${entrySectionTipo}|${entrySectionId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		records.push({ section_tipo: entrySectionTipo, section_id: Number(entrySectionId) });
	}
	return records;
}

describe.if(hasPhpCredentials())('SQO differential: TS engine vs live PHP (Phase 3 gate)', () => {
	let client: PhpApiClient;

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		client = new PhpApiClient();
		const loggedIn = await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		if (!loggedIn) throw new Error('PHP login failed — cannot run the differential corpus');
	});

	for (const corpusCase of CORPUS) {
		test(corpusCase.name, async () => {
			if (!hasPhpCredentials()) {
				console.warn(`[UNCOVERED] '${corpusCase.name}' needs PHP credentials — skipped.`);
				return;
			}
			const [tsRecords, phpRecords] = await Promise.all([
				runTsSearch(corpusCase.sqo),
				runPhpSearch(client, corpusCase.sqo),
			]);
			expect(tsRecords.length).toBeGreaterThan(0); // corpus cases must actually match rows
			expect(tsRecords).toEqual(phpRecords);
		}, 30000);
	}

	test('number * / date comparisons agree with direct DB ground truth', async () => {
		// numisdata4 (147k) is not surfaced by the PHP list-read harness, so the
		// SHARED DB is the oracle here (still a real differential — both engines
		// read the same jsonb). Confirms the number '*' builder matches exactly.
		// full_count avoids the client limit clamp and gives the true match total.
		const sqo = sanitizeClientSqo({
			section_tipo: ['numisdata4'],
			full_count: true,
			limit: 1,
			filter: {
				$and: [{ q: '*', path: [{ section_tipo: 'numisdata4', component_tipo: 'numisdata133' }] }],
			},
		});
		const { sql: builtSql, params } = await buildSearchSql(sqo);
		const countRows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
			full_count: number | string;
		}[];
		const tsCount = Number(countRows[0]?.full_count);
		const truth = (await sql`
			SELECT count(DISTINCT section_id)::int AS n FROM matrix
			WHERE section_tipo = 'numisdata4'
			  AND number @? '$.numisdata133[*].value ? (@ != null)'
		`) as { n: number }[];
		expect(tsCount).toBe(truth[0]?.n as number);
		expect(tsCount).toBeGreaterThan(1000); // real, large result
	});

	test('full_count SQL agrees with a direct COUNT (PHP total deferred)', async () => {
		const sqo = sanitizeClientSqo({ section_tipo: ['numisdata6'], full_count: true, limit: 1 });
		const { sql: builtSql, params } = await buildSearchSql(sqo);
		const rows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
			full_count: number | string;
		}[];
		const tsCount = Number(rows[0]?.full_count);
		const direct = (await sql`
			SELECT count(DISTINCT section_id)::int AS n FROM matrix WHERE section_tipo = 'numisdata6'
		`) as { n: number }[];
		expect(tsCount).toBe(direct[0]?.n as number);
	});
});
