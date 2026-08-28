/**
 * MULTI-HOP SEARCH PATH ACL — the SEC-02 gate (audit 2026-08-26, item P1-1).
 *
 * WHAT WAS WRONG. A search filter (or ORDER) leaf whose `path` has more than
 * one step makes the assembler emit, per hop, a `LEFT JOIN LATERAL
 * jsonb_array_elements(<prev>.relation->'<hopTipo>')` plus a `LEFT JOIN
 * <stepTable>`, and it builds the leaf predicate against the LAST alias.
 * Neither `conformLeaf` nor `buildJoinChain` received a principal, and
 * `buildSearchSql` emitted its ACL clauses — the projects containment and the
 * dd478 record filter — against the MAIN alias ONLY. So the WHERE clause of a
 * listing the caller IS allowed to run could name a component of a record the
 * caller is NOT allowed to see, and the row's presence answered a question
 * about that hidden record. Begins-with, ends-with, contains and `==` are all
 * reachable through the string builder, which makes it a PREFIX ORACLE: the
 * hidden value comes out character by character.
 *
 * WHAT THIS GATE PROVES, in the two halves the finding demands:
 *
 *  (a) STRUCTURAL CENSUS — TOTAL over the join aliases the builder emits. The
 *      SQL is PARSED: every `LEFT JOIN <table> AS j_… ON …` is found, its ON
 *      clause is isolated, and an alias whose ON clause carries no
 *      `<alias>.relation @> …` project containment is RED. A count assertion
 *      alone would pass on zero aliases, so the alias count is asserted too,
 *      at one hop AND at two.
 *  (b) BEHAVIOURAL — the oracle itself. A scoped non-admin probes a value
 *      stored on a record of a project she does not hold. HIT and MISS must be
 *      byte-identical answers. Non-degeneracy is proved in the same test: the
 *      admin running the SAME hit query DOES get the row, so the value really
 *      is there and the equality is not vacuous.
 *
 * AND THE OTHER DIRECTION, which is half the point: an over-eager refusal here
 * would break ordinary searching for every user. So this file also pins that
 *   - the same non-admin's hop into a record IN HER OWN project still returns
 *     it (legitimate multi-hop traffic is untouched),
 *   - an INTERNAL search (no principal) emits a join with NO ACL conjuncts —
 *     byte-identical to the pre-fix shape,
 *   - a global admin's hop carries no projects predicate.
 *
 * THE COMPONENT HALF. A path step beyond the main section also needs the
 * caller's per-component read grant (`ddoIsAuthorized(principal, step.section,
 * step.component)`) — the same predicate `filterAuthorizedRelated` runs when it
 * decides which of a target section's components may enter a portal's ddo_map,
 * i.e. the gate that decides whether a client can legitimately BUILD this path.
 * An unauthorized leaf answers `1=0`: not a throw (a refusal is itself a signal,
 * and it would break the one unauthorized leaf of an autocomplete's `$or`
 * filter_free for every user) and not a drop (dropping a conjunct WIDENS an
 * `$and`).
 *
 * THE SITUATION IS BUILT, NEVER ASSUMED (AGENTS.md): this file mints its own
 * user / profile / projects / records in the reserved band 931000-931099 on the
 * generic `test` TLD, with the grants it needs and no others, and sweeps them
 * in afterAll with a throw-if-nothing-deleted. It does NOT reuse
 * acl_identity_fixture: that fixture's reader profile grants `test3.test92`
 * (a component_publication) and nothing else on test3, so neither the hop
 * component nor a searchable leaf component would be authorized and every
 * assertion here would be satisfiable at empty-versus-empty.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sanitizeClientSqo } from '../../src/core/concepts/sqo.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';
import { clearUserFilterRecordsCache } from '../../src/core/security/filter_records.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
	getPermissions,
	type Principal,
} from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { DB_READY } from '../helpers/db_ready.ts';

// --- the situation ---------------------------------------------------------

/** The reserved scratch band this file owns (SEC-02 gate). */
const SCRATCH_FLOOR = 931000;
const SCRATCH_CEILING = 931099;

const USERS_SECTION = 'dd128';
const PROFILES_SECTION = 'dd234';
const PROJECTS_SECTION = 'dd153';
const YES_NO_SECTION = 'dd64';

/** The playground section: project-gated by `test101`, table `matrix_test`. */
const SECTION = 'test3';
const SECTION_TABLE = 'matrix_test';
/** test3's component_filter — the tipo the projects containment probes, and
 * the column whose ENGINE-MINTED sort path hops into the projects section
 * (PHP component_filter::get_order_path). */
const FILTER_COMPONENT = 'test101';
/** component_relation_related — the HOP: it stores the locator we traverse. */
const HOP_COMPONENT = 'test54';
/** component_input_text — the LEAF whose value the oracle used to extract. */
const LEAF_COMPONENT = 'test52';
/** A component of the same section the profile grants NOTHING on. */
const DENIED_LEAF_COMPONENT = 'test91';
/** lg1 / hierarchy25 — component_select_lang's engine-minted sort target. */
const LANGS_SECTION = 'lg1';
const THESAURUS_TERM = 'hierarchy25';

const SCOPED_USER_ID = 931001;
const ADMIN_USER_ID = 931002;
const SCOPED_PROFILE_ID = 931011;
const ADMIN_PROFILE_ID = 931012;
/** The one project the scoped user holds. */
const MY_PROJECT_ID = 931021;
/** A project she does NOT hold — the hidden record's project. */
const OTHER_PROJECT_ID = 931022;

/** test3 record the scoped user MAY list; it hops to {@link HIDDEN_ID}. */
const MAIN_TO_HIDDEN_ID = 931031;
/** test3 record in OTHER_PROJECT_ID holding the value she may not read. */
const HIDDEN_ID = 931032;
/** test3 record she MAY list; it hops to {@link VISIBLE_ID}. */
const MAIN_TO_VISIBLE_ID = 931033;
/** test3 record in HER OWN project — the legitimate-traffic control. */
const VISIBLE_ID = 931034;

/** The value on the record she cannot read. Never shares a prefix with… */
const HIDDEN_VALUE = 'zzhop02 hidden heritage note';
/** …the value on the record she CAN read. */
const VISIBLE_VALUE = 'zzhop02 visible heritage note';

const SCOPED: Principal = { userId: SCOPED_USER_ID, isGlobalAdmin: false, isDeveloper: false };
const ADMIN: Principal = { userId: ADMIN_USER_ID, isGlobalAdmin: true, isDeveloper: false };

/** Every (table, section_tipo, section_id) this file owns, in sweep order. */
const OWNED: { table: string; sectionTipo: string; sectionId: number }[] = [
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: SCOPED_USER_ID },
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: ADMIN_USER_ID },
	{ table: 'matrix_profiles', sectionTipo: PROFILES_SECTION, sectionId: SCOPED_PROFILE_ID },
	{ table: 'matrix_profiles', sectionTipo: PROFILES_SECTION, sectionId: ADMIN_PROFILE_ID },
	{ table: 'matrix_projects', sectionTipo: PROJECTS_SECTION, sectionId: MY_PROJECT_ID },
	{ table: 'matrix_projects', sectionTipo: PROJECTS_SECTION, sectionId: OTHER_PROJECT_ID },
	{ table: SECTION_TABLE, sectionTipo: SECTION, sectionId: MAIN_TO_HIDDEN_ID },
	{ table: SECTION_TABLE, sectionTipo: SECTION, sectionId: HIDDEN_ID },
	{ table: SECTION_TABLE, sectionTipo: SECTION, sectionId: MAIN_TO_VISIBLE_ID },
	{ table: SECTION_TABLE, sectionTipo: SECTION, sectionId: VISIBLE_ID },
];

/**
 * The scratch band, ENFORCED before any INSERT or DELETE runs. The sweep
 * deletes by (section_tipo, section_id) on the SHARED suite database, so an id
 * edited down into the installed band would destroy a real users/profiles/
 * projects/test3 record (this is not hypothetical — see the same guard's
 * docblock in acl_identity_fixture.ts).
 */
function assertScratchIds(): void {
	for (const record of OWNED) {
		if (
			!Number.isInteger(record.sectionId) ||
			record.sectionId < SCRATCH_FLOOR ||
			record.sectionId > SCRATCH_CEILING
		) {
			throw new Error(
				`search_path_acl gate: ${record.table}/${record.sectionTipo} id ${record.sectionId} is outside the reserved band ${SCRATCH_FLOOR}-${SCRATCH_CEILING} — refusing to touch a record this gate does not own`,
			);
		}
	}
}

/** A locator as the live records carry it. */
function locator(componentTipo: string, sectionTipo: string, sectionId: number, type = 'dd151') {
	return {
		id: 1,
		type,
		section_id: sectionId,
		section_tipo: sectionTipo,
		from_component_tipo: componentTipo,
	};
}

/** Insert one record at an EXPLICIT section_id — no counter, no advisory lock. */
async function insertScratch(
	table: string,
	sectionTipo: string,
	sectionId: number,
	columns: Record<string, unknown>,
): Promise<void> {
	const names = ['"section_tipo"', '"section_id"'];
	const placeholders = ['$1', '$2'];
	const params: (string | number)[] = [sectionTipo, sectionId];
	let index = 3;
	for (const [column, value] of Object.entries(columns)) {
		names.push(`"${column}"`);
		placeholders.push(`$${index}::text::jsonb`);
		params.push(encodeForJsonb(value));
		index++;
	}
	await sql.unsafe(
		`INSERT INTO "${table}" (${names.join(', ')}) VALUES (${placeholders.join(', ')})`,
		params,
	);
}

function clearCaches(): void {
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
	clearUserFilterRecordsCache();
}

/** One dd774 grant row as getPermissionsTable reads it off `misc`. */
function grant(id: number, sectionTipo: string, tipo: string, value: number) {
	return { id, tipo, section_tipo: sectionTipo, value };
}

async function purge(strict: boolean): Promise<void> {
	assertScratchIds();
	const missing: string[] = [];
	for (const record of OWNED) {
		const removed = await deleteMatrixRecord(record.table, record.sectionTipo, record.sectionId);
		if (removed === 0) missing.push(`${record.table}/${record.sectionTipo}/${record.sectionId}`);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[record.sectionTipo, record.sectionId],
		);
	}
	if (strict && missing.length > 0) {
		throw new Error(
			`search_path_acl gate: the sweep deleted NOTHING for ${missing.join(', ')} — a filter that matches nothing is the bug, not a clean tree`,
		);
	}
}

async function install(): Promise<void> {
	await assertTestDatabase('search_path_acl_native');
	assertScratchIds();
	await purge(false); // a crashed previous run

	for (const projectId of [MY_PROJECT_ID, OTHER_PROJECT_ID]) {
		await insertScratch('matrix_projects', PROJECTS_SECTION, projectId, {
			string: { dd156: [{ id: 1, lang: 'lg-eng', value: `zzhop02 project ${projectId}` }] },
		});
	}

	// The scoped profile grants EXACTLY what a legitimate multi-hop needs: the
	// section, the hop component and the leaf component — and nothing on
	// DENIED_LEAF_COMPONENT, so "granted" can be told from "the gate never ran".
	await insertScratch('matrix_profiles', PROFILES_SECTION, SCOPED_PROFILE_ID, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'zzhop02 scoped profile' }] },
		misc: {
			dd774: [
				grant(1, SECTION, SECTION, 1),
				grant(2, SECTION, HOP_COMPONENT, 1),
				grant(3, SECTION, LEAF_COMPONENT, 1),
			],
		},
	});
	await insertScratch('matrix_profiles', PROFILES_SECTION, ADMIN_PROFILE_ID, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'zzhop02 admin profile' }] },
		misc: {
			dd774: [
				grant(1, SECTION, SECTION, 3),
				grant(2, SECTION, HOP_COMPONENT, 3),
				grant(3, SECTION, LEAF_COMPONENT, 3),
			],
		},
	});

	await insertScratch('matrix_users', USERS_SECTION, SCOPED_USER_ID, {
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: 'zzhop02_scoped' }] },
		relation: {
			dd131: [locator('dd131', YES_NO_SECTION, 1)],
			dd244: [locator('dd244', YES_NO_SECTION, 2)], // present-but-negative admin flag
			dd515: [locator('dd515', YES_NO_SECTION, 2)],
			dd1725: [locator('dd1725', PROFILES_SECTION, SCOPED_PROFILE_ID)],
			dd170: [locator('dd170', PROJECTS_SECTION, MY_PROJECT_ID)],
		},
	});
	await insertScratch('matrix_users', USERS_SECTION, ADMIN_USER_ID, {
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: 'zzhop02_admin' }] },
		relation: {
			dd131: [locator('dd131', YES_NO_SECTION, 1)],
			dd244: [locator('dd244', YES_NO_SECTION, 1)],
			dd515: [locator('dd515', YES_NO_SECTION, 2)],
			dd1725: [locator('dd1725', PROFILES_SECTION, ADMIN_PROFILE_ID)],
			dd170: [locator('dd170', PROJECTS_SECTION, MY_PROJECT_ID)],
		},
	});

	// The four test3 records. The `test101` locator is the project membership the
	// projects containment probes; `type` is dd675 exactly as the live rows carry
	// it (the predicate matches on section_id alone — see
	// WC-2026-08-09-users-section-record-scope).
	const inProject = (projectId: number) => [
		locator(FILTER_COMPONENT, PROJECTS_SECTION, projectId, 'dd675'),
	];
	await insertScratch(SECTION_TABLE, SECTION, MAIN_TO_HIDDEN_ID, {
		relation: {
			[FILTER_COMPONENT]: inProject(MY_PROJECT_ID),
			[HOP_COMPONENT]: [locator(HOP_COMPONENT, SECTION, HIDDEN_ID)],
		},
		string: { [LEAF_COMPONENT]: [{ id: 1, lang: 'lg-eng', value: 'zzhop02 main to hidden' }] },
	});
	await insertScratch(SECTION_TABLE, SECTION, HIDDEN_ID, {
		relation: { [FILTER_COMPONENT]: inProject(OTHER_PROJECT_ID) },
		string: { [LEAF_COMPONENT]: [{ id: 1, lang: 'lg-eng', value: HIDDEN_VALUE }] },
	});
	await insertScratch(SECTION_TABLE, SECTION, MAIN_TO_VISIBLE_ID, {
		relation: {
			[FILTER_COMPONENT]: inProject(MY_PROJECT_ID),
			[HOP_COMPONENT]: [locator(HOP_COMPONENT, SECTION, VISIBLE_ID)],
		},
		string: { [LEAF_COMPONENT]: [{ id: 1, lang: 'lg-eng', value: 'zzhop02 main to visible' }] },
	});
	await insertScratch(SECTION_TABLE, SECTION, VISIBLE_ID, {
		relation: { [FILTER_COMPONENT]: inProject(MY_PROJECT_ID) },
		string: { [LEAF_COMPONENT]: [{ id: 1, lang: 'lg-eng', value: VISIBLE_VALUE }] },
	});

	clearCaches();
}

// --- the query shapes ------------------------------------------------------

/** A two-hop filter: SECTION.HOP → SECTION.<leaf> begins-with `q`. */
function twoHopSqo(q: string, leafComponent: string = LEAF_COMPONENT) {
	return sanitizeClientSqo({
		section_tipo: [SECTION],
		limit: 50,
		offset: 0,
		filter: {
			$and: [
				{
					q,
					path: [
						{ section_tipo: SECTION, component_tipo: HOP_COMPONENT },
						{ section_tipo: SECTION, component_tipo: leafComponent },
					],
				},
			],
		},
	} as never);
}

/** A three-hop filter over the same relation, twice — two join aliases. */
function threeHopSqo(q: string) {
	return sanitizeClientSqo({
		section_tipo: [SECTION],
		limit: 50,
		offset: 0,
		filter: {
			$and: [
				{
					q,
					path: [
						{ section_tipo: SECTION, component_tipo: HOP_COMPONENT },
						{ section_tipo: SECTION, component_tipo: HOP_COMPONENT },
						{ section_tipo: SECTION, component_tipo: LEAF_COMPONENT },
					],
				},
			],
		},
	} as never);
}

/** Every hop alias the builder emitted, in emission order. */
function joinAliases(builtSql: string): string[] {
	return [...builtSql.matchAll(/LEFT JOIN \S+ AS (j_[A-Za-z0-9_]+) ON /g)].map(
		(match) => match[1] as string,
	);
}

/** The ON clause the builder gave one hop alias (one line, by construction). */
function onClauseOf(builtSql: string, alias: string): string {
	const marker = ` AS ${alias} ON `;
	const start = builtSql.indexOf(marker);
	if (start === -1) throw new Error(`no join for alias ${alias}`);
	const from = start + marker.length;
	const end = builtSql.indexOf('\n', from);
	return builtSql.slice(from, end === -1 ? undefined : end);
}

/** Run a built query and return the matched section_ids, sorted. */
async function idsOf(built: { sql: string; params: unknown[] }): Promise<number[]> {
	const rows = (await sql.unsafe(built.sql, built.params as (string | number | null)[])) as {
		section_id: number | string;
	}[];
	return rows.map((row) => Number(row.section_id)).sort((a, b) => a - b);
}

describe.if(DB_READY)('SEC-02 — the ACL holds at EVERY hop of a search path', () => {
	beforeAll(install);
	afterAll(async () => {
		await purge(true);
		clearCaches();
	});

	// --- (a) the structural census -----------------------------------------

	test('CENSUS: every join alias a two-hop filter emits carries the projects predicate', async () => {
		const built = await buildSearchSql(twoHopSqo('zzhop02*'), { principal: SCOPED });
		const aliases = joinAliases(built.sql);
		// Non-degeneracy: a census over zero aliases proves nothing.
		expect(aliases.length).toBe(1);
		const uncovered = aliases.filter(
			(alias) => !onClauseOf(built.sql, alias).includes(`${alias}.relation @> `),
		);
		expect(
			uncovered,
			`hop aliases with NO record-ACL predicate in their ON clause: ${uncovered.join(', ')}\n${built.sql}`,
		).toEqual([]);
		// …and the bound payload is this caller's OWN project, not some other id.
		const payload = `{"${FILTER_COMPONENT}":[{"section_id":${MY_PROJECT_ID}}]}`;
		expect(built.params).toContain(payload);
	});

	test('CENSUS: a three-hop filter emits TWO aliases and both are covered', async () => {
		const built = await buildSearchSql(threeHopSqo('zzhop02*'), { principal: SCOPED });
		const aliases = joinAliases(built.sql);
		expect(aliases.length).toBe(2);
		const uncovered = aliases.filter(
			(alias) => !onClauseOf(built.sql, alias).includes(`${alias}.relation @> `),
		);
		expect(
			uncovered,
			`hop aliases with NO record-ACL predicate in their ON clause: ${uncovered.join(', ')}\n${built.sql}`,
		).toEqual([]);
	});

	test('CENSUS: the ORDER path twin is covered too (it shares buildJoinChain)', async () => {
		const built = await buildSearchSql(
			sanitizeClientSqo({
				section_tipo: [SECTION],
				limit: 50,
				offset: 0,
				order: [
					{
						direction: 'ASC',
						path: [
							{ section_tipo: SECTION, component_tipo: HOP_COMPONENT },
							{ section_tipo: SECTION, component_tipo: LEAF_COMPONENT },
						],
					},
				],
			} as never),
			{ principal: SCOPED },
		);
		const aliases = joinAliases(built.sql);
		expect(aliases.length).toBe(1);
		for (const alias of aliases) {
			expect(onClauseOf(built.sql, alias)).toContain(`${alias}.relation @> `);
		}
	});

	test('CENSUS: the dd478 record allow-list rides every hop alias as well', async () => {
		await sql.unsafe(
			`UPDATE matrix_users SET misc = $1::text::jsonb WHERE section_tipo = $2 AND section_id = $3`,
			[
				encodeForJsonb({ dd478: [{ id: 1, tipo: SECTION, value: [VISIBLE_ID] }] }),
				USERS_SECTION,
				SCOPED_USER_ID,
			],
		);
		clearUserFilterRecordsCache(SCOPED_USER_ID);
		try {
			const built = await buildSearchSql(twoHopSqo('zzhop02*'), { principal: SCOPED });
			const aliases = joinAliases(built.sql);
			expect(aliases.length).toBe(1);
			for (const alias of aliases) {
				expect(onClauseOf(built.sql, alias)).toContain(`${alias}.section_id IN (${VISIBLE_ID})`);
			}
		} finally {
			await sql.unsafe(
				`UPDATE matrix_users SET misc = NULL WHERE section_tipo = $1 AND section_id = $2`,
				[USERS_SECTION, SCOPED_USER_ID],
			);
			clearUserFilterRecordsCache(SCOPED_USER_ID);
		}
	});

	test('CENSUS: the audit repro shape — a hop into dd128 — carries the users rule', async () => {
		// The finding's literal repro: `path [{test3,test54},{dd128,dd132}]` run by
		// a caller the read door answers 403 for. dd128 carries no component_filter,
		// so the GENERIC branch emits nothing for it — the users-section visibility
		// rule (own record / created_by / shared project) is what must ride the hop
		// alias, and it is the only statement of that rule in the engine.
		const built = await buildSearchSql(
			sanitizeClientSqo({
				section_tipo: [SECTION],
				limit: 50,
				offset: 0,
				filter: {
					$and: [
						{
							q: 'zzhop02*',
							path: [
								{ section_tipo: SECTION, component_tipo: HOP_COMPONENT },
								{ section_tipo: USERS_SECTION, component_tipo: 'dd132' },
							],
						},
					],
				},
			} as never),
			{ principal: SCOPED },
		);
		const aliases = joinAliases(built.sql);
		expect(aliases.length).toBe(1);
		const on = onClauseOf(built.sql, aliases[0] as string);
		expect(on).toContain(`${aliases[0]}.section_id > 0`);
		expect(on).toContain(`${aliases[0]}.data @> `);
		expect(on).toContain(`${aliases[0]}.relation @> `);
		// dd132 is not granted to this profile either, so the leaf is 1=0 as well —
		// the two halves of the fix are independent and BOTH fire here.
		expect(built.sql).toContain('1=0');
		expect(await idsOf(built)).toEqual([]);
	});

	// --- (b) the oracle itself ---------------------------------------------

	test('ORACLE CLOSED: HIT and MISS are the same answer for a value she cannot read', async () => {
		// The prefix probe an attacker walks character by character.
		const hit = await idsOf(
			await buildSearchSql(twoHopSqo('zzhop02 hidden*'), { principal: SCOPED }),
		);
		const miss = await idsOf(
			await buildSearchSql(twoHopSqo('zzhop02 hiddex*'), { principal: SCOPED }),
		);
		expect(hit).toEqual(miss);
		expect(hit).not.toContain(MAIN_TO_HIDDEN_ID);

		// NON-DEGENERACY. The value IS there and the query DOES discriminate — an
		// admin running the same two probes gets different answers.
		const adminHit = await idsOf(
			await buildSearchSql(twoHopSqo('zzhop02 hidden*'), { principal: ADMIN }),
		);
		const adminMiss = await idsOf(
			await buildSearchSql(twoHopSqo('zzhop02 hiddex*'), { principal: ADMIN }),
		);
		expect(adminHit).toContain(MAIN_TO_HIDDEN_ID);
		expect(adminMiss).not.toContain(MAIN_TO_HIDDEN_ID);
	});

	test('ORACLE CLOSED: equality and contains answer identically too', async () => {
		for (const [probe, control] of [
			[`'${HIDDEN_VALUE}'`, `'${HIDDEN_VALUE}x'`],
			['*hidden heritage*', '*hiddex heritage*'],
		] as const) {
			const hit = await idsOf(await buildSearchSql(twoHopSqo(probe), { principal: SCOPED }));
			const miss = await idsOf(await buildSearchSql(twoHopSqo(control), { principal: SCOPED }));
			expect(hit, `probe ${probe}`).toEqual(miss);
			expect(hit, `probe ${probe}`).not.toContain(MAIN_TO_HIDDEN_ID);
		}
	});

	// --- the other direction: legitimate traffic is untouched ---------------

	test('NOT OVER-EAGER: the same hop into a record in HER OWN project still matches', async () => {
		const found = await idsOf(
			await buildSearchSql(twoHopSqo('zzhop02 visible*'), { principal: SCOPED }),
		);
		expect(found).toContain(MAIN_TO_VISIBLE_ID);
		// …and the admin sees exactly the same row, so the scoped answer is not a
		// coincidence of some other predicate.
		const adminFound = await idsOf(
			await buildSearchSql(twoHopSqo('zzhop02 visible*'), { principal: ADMIN }),
		);
		expect(adminFound).toContain(MAIN_TO_VISIBLE_ID);
	});

	test('NOT OVER-EAGER: an internal search (no principal) emits the bare join', async () => {
		const built = await buildSearchSql(twoHopSqo('zzhop02*'), {});
		const aliases = joinAliases(built.sql);
		expect(aliases.length).toBe(1);
		for (const alias of aliases) {
			const on = onClauseOf(built.sql, alias);
			expect(on).not.toContain('@>');
			expect(on).toBe(
				`${alias}.section_id = NULLIF((rel_${alias}->>'section_id'), '')::bigint AND ${alias}.section_tipo = (rel_${alias}->>'section_tipo')::text`,
			);
		}
		// It still finds the hidden record — an internal resolution is not scoped.
		expect(await idsOf(await buildSearchSql(twoHopSqo('zzhop02 hidden*'), {}))).toContain(
			MAIN_TO_HIDDEN_ID,
		);
	});

	test('NOT OVER-EAGER: a global admin hop carries no projects predicate', async () => {
		const built = await buildSearchSql(twoHopSqo('zzhop02*'), { principal: ADMIN });
		for (const alias of joinAliases(built.sql)) {
			expect(onClauseOf(built.sql, alias)).not.toContain('@>');
		}
	});

	// --- the component half -------------------------------------------------

	test('a hop leaf the principal holds 0 on answers 1=0, and the granted twin does not', async () => {
		const denied = await buildSearchSql(twoHopSqo('zzhop02*', DENIED_LEAF_COMPONENT), {
			principal: SCOPED,
		});
		expect(denied.sql).toContain('1=0');
		expect(await idsOf(denied)).toEqual([]);

		// The SAME shape on the GRANTED leaf is a real predicate and matches.
		const granted = await buildSearchSql(twoHopSqo('zzhop02 visible*'), { principal: SCOPED });
		expect(granted.sql).not.toContain('1=0');
		expect(await idsOf(granted)).toContain(MAIN_TO_VISIBLE_ID);
	});

	test('the component gate does not fire for an internal search', async () => {
		const built = await buildSearchSql(twoHopSqo('zzhop02*', DENIED_LEAF_COMPONENT), {});
		expect(built.sql).not.toContain('1=0');
	});

	// --- THE OVER-REFUSAL, and why the exemption exists ---------------------
	//
	// The component half over-refused on first landing. MEASURED on this suite
	// database with this file's own non-admin principal (2026-08-28): the
	// ENGINE-MINTED order path of every `component_filter` column is
	// `[self, dd156@dd153]` (search/order_path.ts, PHP
	// component_filter::get_order_path), no profile in any install grants
	// `dd153_dd156` — dd153 is engine infrastructure, not curator-configured —
	// so the grant resolved false, buildOrderClauses dropped the entry and the
	// sort SILENTLY became `section_id ASC` for every non-admin. Same wall for
	// `component_select_lang`'s `[self, hierarchy25@lg1]`.
	//
	// The fix is not a hole: `buildProjectsFilter` already returns '' for dd153
	// BECAUSE projects are globally visible, and PROJECTS_FILTER_EXEMPT_TABLES
	// already exempts matrix_langs. The component key now reads the SAME
	// declaration the record key does (security/frontier_scope.ts).

	test('NOT OVER-EAGER: the engine-minted component_filter ORDER path SURVIVES', async () => {
		// Non-degeneracy FIRST: the grant really is absent, so what saves the
		// sort below is the frontier exemption and nothing else.
		expect(await getPermissions(SCOPED, PROJECTS_SECTION, 'dd156')).toBe(0);

		const built = await buildSearchSql(
			sanitizeClientSqo({
				section_tipo: [SECTION],
				limit: 50,
				offset: 0,
				order: [
					{
						direction: 'ASC',
						path: [
							{ section_tipo: SECTION, component_tipo: FILTER_COMPONENT },
							{ section_tipo: PROJECTS_SECTION, component_tipo: 'dd156' },
						],
					},
				],
			} as never),
			{ principal: SCOPED },
		);
		// The join is emitted AND the sort really orders by the project name —
		// `expect(joins).toBe(1)` alone would pass on a query that then fell back
		// to section_id.
		expect(joinAliases(built.sql).length).toBe(1);
		expect(built.sql).toContain('dd156_order');
		expect(built.sql).toContain('ORDER BY dd156_order');
		// The ADMIN's query is the same shape — the scoped caller is not being
		// served a quietly different sort.
		const adminBuilt = await buildSearchSql(
			sanitizeClientSqo({
				section_tipo: [SECTION],
				limit: 50,
				offset: 0,
				order: [
					{
						direction: 'ASC',
						path: [
							{ section_tipo: SECTION, component_tipo: FILTER_COMPONENT },
							{ section_tipo: PROJECTS_SECTION, component_tipo: 'dd156' },
						],
					},
				],
			} as never),
			{ principal: ADMIN },
		);
		expect(adminBuilt.sql).toContain('ORDER BY dd156_order');
	});

	test('NOT OVER-EAGER: the component_select_lang ORDER twin survives too (lg1)', async () => {
		expect(await getPermissions(SCOPED, LANGS_SECTION, THESAURUS_TERM)).toBe(0);
		const built = await buildSearchSql(
			sanitizeClientSqo({
				section_tipo: [SECTION],
				limit: 50,
				offset: 0,
				order: [
					{
						direction: 'ASC',
						path: [
							{ section_tipo: SECTION, component_tipo: HOP_COMPONENT },
							{ section_tipo: LANGS_SECTION, component_tipo: THESAURUS_TERM },
						],
					},
				],
			} as never),
			{ principal: SCOPED },
		);
		expect(joinAliases(built.sql).length).toBe(1);
		expect(built.sql).toContain(`${THESAURUS_TERM}_order`);
	});

	test('the exemption does NOT reach the profiles or users sections', async () => {
		// dd234 and dd128 are named by buildProjectsFilter but are DELIBERATELY
		// not frontier-exempt (frontier_scope.ts): dd774 is the grant matrix, and
		// the users rule is a restriction rather than an exemption. A hop naming
		// either still needs the grant, and this caller has none.
		for (const [section, component] of [
			[PROFILES_SECTION, 'dd774'],
			[USERS_SECTION, 'dd132'],
		] as const) {
			const built = await buildSearchSql(
				sanitizeClientSqo({
					section_tipo: [SECTION],
					limit: 50,
					offset: 0,
					filter: {
						$and: [
							{
								q: 'zzhop02*',
								path: [
									{ section_tipo: SECTION, component_tipo: HOP_COMPONENT },
									{ section_tipo: section, component_tipo: component },
								],
							},
						],
					},
				} as never),
				{ principal: SCOPED },
			);
			expect(built.sql, `${section}.${component}`).toContain('1=0');
		}
	});

	// --- the refusal is LOUD ------------------------------------------------

	test('a surviving refusal records a request notice, never a silent narrowing', async () => {
		// AGENTS.md forbids a silent narrowing even when the narrowing is
		// correct. The CALLER's answer stays identical for hit and miss (the
		// oracle); the OPERATOR gets a named log line and the request carries a
		// `perm.out_of_scope` notice for the envelope.
		const { runWithRequestContext } = await import('../../src/core/security/request_context.ts');
		const { currentFrontierRefusals, frontierRefusalNotice } = await import(
			'../../src/core/security/frontier_scope.ts'
		);
		await runWithRequestContext(
			{ session: null, requestId: 'zzhop02-loud', clientIp: '', principal: SCOPED },
			async () => {
				// Before: nothing narrowed, so no notice may be invented.
				expect(currentFrontierRefusals()).toEqual([]);
				expect(frontierRefusalNotice()).toBeUndefined();

				await buildSearchSql(twoHopSqo('zzhop02*', DENIED_LEAF_COMPONENT), {
					principal: SCOPED,
				});

				const refusals = currentFrontierRefusals();
				expect(refusals.length).toBeGreaterThan(0);
				expect(refusals[0]?.surface).toBe('search');
				expect(refusals[0]?.key).toBe('component');
				expect(refusals[0]?.componentTipo).toBe(DENIED_LEAF_COMPONENT);
				expect(frontierRefusalNotice()?.code).toBe('perm.out_of_scope');
			},
		);
		// The sink is REQUEST-scoped: outside the scope there is nothing to read,
		// so one caller's narrowing can never appear on another's envelope.
		expect(currentFrontierRefusals()).toEqual([]);
	});
});
