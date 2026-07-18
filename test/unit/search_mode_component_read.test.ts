/**
 * Search-panel component READ in mode 'search' (the service_autocomplete
 * picker) — the dd543 "Who" portal of Activity (dd542). Reported 2026-07-18:
 * "the search of the who dd543 in activity section doesn't work".
 *
 * TWO stacked defects, both server-side:
 *
 * 1. The search-panel portal instance runs in mode 'search' and the client
 *    stamps it on the source (create_source) — readSectionRows THREW
 *    "mode 'search' not implemented yet (covered: 'list', 'edit', 'tm')" on
 *    every typeahead keystroke, so the picker never listed users. PHP serves
 *    the same RQO fine (dd_core_api.php:2256 case 'search'). The BUG-0 gate
 *    only covered the EDIT-form picker (source.mode 'list'), so the
 *    search-panel door stayed red. Fixed by normalizing source.mode
 *    'search' → 'list' in readSection/readSectionRows.
 *
 * 2. resolveSearchData echoed the picked locator VERBATIM, and the datalist
 *    publishes the envelope's NUMERIC section_id — so the chip entries fed
 *    get_search_value a numeric section_id and the final filter's JSONB
 *    containment missed the string-stored locators (0 rows). PHP's locator
 *    casts set_section_id to string (class.locator.php:338). Fixed by
 *    echoing section_id as string.
 *
 * 3. The REAL client pick lands on the SAVE action (link_record → change_value,
 *    host id 'search_1'), not resolve_data — and the dd_core_api search_ save
 *    branch looked the resolved main item up by section_id 'search_1', which
 *    resolveSearchData never stamps (synthetic record ⇒ null identity). The
 *    always-firing fallback rebuilt the chip from the RAW numeric picked
 *    locator, undoing fix 2 on the only path the client uses. Fixed by
 *    matching on tipo+section_tipo and re-stamping the synthetic id.
 *
 * Scratch twins (a fake user + two activity rows) are SQL-seeded and deleted
 * in afterAll — root is hidden from user searches by design
 * (root_user_hidden_tripwire), so a non-root twin is required for a positive
 * typeahead assertion.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { ApiRequestContext } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

const ACTIVITY = 'dd542'; // consultation-only
const WHO_PORTAL = 'dd543'; // component_portal → matrix_activity.relation
const USERS = 'dd128';
const USERNAME = 'dd132'; // the target's display component (resolved chip label)

const TWIN_USER_ID = 999901;
const TWIN_USERNAME = 'zz_search_twin';
const TWIN_ACTIVITY_IDS = [999901, 999902];

let ctx: ApiRequestContext;

async function deleteTwins(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM matrix_activity WHERE section_tipo = $1 AND section_id IN (${TWIN_ACTIVITY_IDS.join(',')})`,
		[ACTIVITY],
	);
	await sql.unsafe(`DELETE FROM matrix_users WHERE section_tipo = $1 AND section_id = $2`, [
		USERS,
		TWIN_USER_ID,
	]);
}

async function seedTwins(): Promise<void> {
	// Idempotent: clear any leftover from a crashed run first.
	await deleteTwins();
	await sql.unsafe(
		`INSERT INTO matrix_users (section_id, section_tipo, string, relation)
		 VALUES ($1, $2, $3::text::jsonb, '{}'::jsonb)`,
		[
			TWIN_USER_ID,
			USERS,
			JSON.stringify({ [USERNAME]: [{ lang: 'lg-nolan', value: TWIN_USERNAME }] }),
		],
	);
	for (const activityId of TWIN_ACTIVITY_IDS) {
		await sql.unsafe(
			`INSERT INTO matrix_activity (section_id, section_tipo, relation, string)
			 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
			[
				activityId,
				ACTIVITY,
				JSON.stringify({
					[WHO_PORTAL]: [
						{
							type: 'dd151',
							section_id: String(TWIN_USER_ID),
							section_tipo: USERS,
							from_component_tipo: WHO_PORTAL,
						},
					],
				}),
				JSON.stringify({ dd544: [{ lang: 'lg-nolan', value: 'search-mode-gate' }] }),
			],
		);
	}
}

beforeAll(async () => {
	const token = createSession(-1, 'root', true);
	registerSessionCleanup();
	const session = getSession(token);
	ctx = {
		requestId: 'search_mode_component_read_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal: await resolvePrincipal(-1),
	} as ApiRequestContext;
	await seedTwins();
}, 60000);

afterAll(async () => {
	await deleteTwins();
});

/** The exact client typeahead RQO (service_autocomplete from a search panel). */
function typeaheadRqo(q: string): Rqo {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_portal',
			tipo: WHO_PORTAL,
			section_tipo: ACTIVITY,
			section_id: 'search_1', // client-minted synthetic id (search.js get_section_id)
			mode: 'search', // the search-panel portal's mode — stamped onto the source
			lang: 'lg-eng',
			action: 'search',
		},
		show: {
			ddo_map: [
				{
					tipo: USERNAME,
					section_tipo: USERS,
					parent: WHO_PORTAL,
					mode: 'list',
					model: 'component_input_text',
				},
			],
			fields_separator: ', ',
			columns: [],
		},
		sqo: {
			mode: 'search',
			section_tipo: [USERS],
			filter: {
				$and: [
					{
						$or: [
							{
								q,
								path: [
									{
										tipo: USERNAME,
										section_tipo: USERS,
										parent: WHO_PORTAL,
										mode: 'list',
										model: 'component_input_text',
										component_tipo: USERNAME,
									},
								],
								q_split: true,
							},
						],
					},
				],
			},
			offset: 0,
			limit: 10,
			full_count: false,
			allow_sub_select_by_id: true,
		},
	} as unknown as Rqo;
}

/** The resolve_data chip echo (same shape as the search_ save echo). */
function echoRqo(injectedSectionId: number | string): Rqo {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_portal',
			tipo: WHO_PORTAL,
			section_tipo: ACTIVITY,
			section_id: 'search_1',
			mode: 'search',
			lang: 'lg-eng',
			action: 'resolve_data',
			value: [
				{
					section_tipo: USERS,
					section_id: injectedSectionId,
					from_component_tipo: WHO_PORTAL,
				},
			],
		},
	} as unknown as Rqo;
}

/**
 * The exact client PICK contract: link_record → change_value → action 'save' on
 * the client-minted 'search_1' host (component_portal.js:982 → component_common
 * .js:672). The response is reused verbatim via refresh({tmp_api_response}) —
 * whatever entries it carries become the search q.
 */
function pickSaveRqo(pickedSectionId: number | string): Rqo {
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_portal',
			tipo: WHO_PORTAL,
			section_tipo: ACTIVITY,
			section_id: 'search_1',
			mode: 'search',
			lang: 'lg-eng',
			action: 'save',
		},
		data: {
			changed_data: [
				{
					action: 'insert',
					id: null,
					value: {
						type: 'dd151',
						section_tipo: USERS,
						section_id: pickedSectionId,
						from_component_tipo: WHO_PORTAL,
					},
				},
			],
		},
	} as unknown as Rqo;
}

describe('search-mode component read (Activity dd542 Who picker)', () => {
	test('typeahead (source.mode search) resolves users instead of throwing', async () => {
		const { body } = await dispatchRqo(typeaheadRqo(TWIN_USERNAME), ctx);
		const result = (body as { result?: { data?: Record<string, unknown>[] } }).result;
		expect(result).toBeDefined();

		const data = result?.data ?? [];
		const usernames = data
			.filter((item) => item.tipo === USERNAME)
			.map((item) => (item.entries as { value?: unknown }[])?.[0]?.value);
		expect(usernames).toContain(TWIN_USERNAME);
		// root stays hidden from user searches by design (root_user_hidden_tripwire).
		const rootItems = data.filter(
			(item) => item.tipo === USERNAME && String(item.section_id) === '-1',
		);
		expect(rootItems.length).toBe(0);
	});

	test('chip echo casts a numeric injected section_id to string (PHP locator parity)', async () => {
		const { body } = await dispatchRqo(echoRqo(TWIN_USER_ID), ctx);
		const result = (body as { result?: { data?: Record<string, unknown>[] } }).result;
		expect(result).toBeDefined();

		const data = result?.data ?? [];
		const mainItem = data.find((item) => item.tipo === WHO_PORTAL) as
			| { entries?: Record<string, unknown>[] }
			| undefined;
		expect(mainItem).toBeDefined();
		const entry = mainItem?.entries?.[0];
		expect(typeof entry?.section_id).toBe('string');
		expect(String(entry?.section_id)).toBe(String(TWIN_USER_ID));

		// The chip label still resolves (the 2026-07-17 fix stays green).
		const usernameItem = data.find((item) => item.tipo === USERNAME) as
			| { entries?: { value?: unknown }[] }
			| undefined;
		expect(usernameItem?.entries?.[0]?.value).toBe(TWIN_USERNAME);
	});

	test("save on the 'search_1' host echoes string entries under the synthetic id", async () => {
		const { body } = await dispatchRqo(pickSaveRqo(TWIN_USER_ID), ctx);
		const result = (body as { result?: { data?: Record<string, unknown>[] } }).result;
		expect(result).toBeDefined();

		const data = result?.data ?? [];
		// The client picks its item by tipo + section_tipo + synthetic section_id
		// (component_common.js:400) — a null/absent section_id loses the chip.
		const mainItem = data.find(
			(item) =>
				item.tipo === WHO_PORTAL &&
				item.section_tipo === ACTIVITY &&
				String(item.section_id) === 'search_1',
		) as { entries?: Record<string, unknown>[]; pagination?: { total?: number } } | undefined;
		expect(mainItem).toBeDefined();

		// The echoed chip carries the STRING section_id the containment needs.
		const entry = mainItem?.entries?.[0];
		expect(typeof entry?.section_id).toBe('string');
		expect(String(entry?.section_id)).toBe(String(TWIN_USER_ID));

		// link_record's server-authoritative duplicate check reads pagination.total
		// and requires it to exceed the pre-insert count (component_portal.js:1063).
		expect(mainItem?.pagination?.total).toBe(1);

		// The chip label resolves (the picked user's username subdatum).
		const usernameItem = data.find((item) => item.tipo === USERNAME) as
			| { entries?: { value?: unknown }[] }
			| undefined;
		expect(usernameItem?.entries?.[0]?.value).toBe(TWIN_USERNAME);
	});

	test('end-to-end: the picked entries drive a section filter that finds the rows', async () => {
		// 1. The real pick: SAVE on the 'search_1' host (link_record). The response
		// is what lands in the component's data.entries (refresh tmp_api_response).
		const { body: echoBody } = await dispatchRqo(pickSaveRqo(TWIN_USER_ID), ctx);
		const echoData =
			((echoBody as { result?: { data?: Record<string, unknown>[] } }).result?.data ?? []);
		const echoMain = echoData.find(
			(item) => item.tipo === WHO_PORTAL && String(item.section_id) === 'search_1',
		) as {
			entries: Record<string, unknown>[];
		};
		// 2. The client's get_search_value + serialize_filter_model (id stamped to 1).
		const q = echoMain.entries.map((entry) => ({
			id: 1,
			section_tipo: entry.section_tipo,
			section_id: entry.section_id,
			from_component_tipo: entry.from_component_tipo,
		}));
		// 3. The section search read.
		const searchRqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			options: {},
			source: {
				typo: 'source',
				model: 'section',
				tipo: ACTIVITY,
				section_tipo: ACTIVITY,
				action: 'search',
				mode: 'list',
				lang: 'lg-spa',
			},
			sqo: {
				section_tipo: [ACTIVITY],
				limit: 10,
				offset: 0,
				order: [{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] }],
				filter: {
					$and: [
						{
							q,
							q_operator: null,
							path: [{ section_tipo: ACTIVITY, component_tipo: WHO_PORTAL }],
							q_split: false,
							type: 'jsonb',
						},
					],
				},
			},
			show: {
				ddo_map: [{ tipo: WHO_PORTAL, section_tipo: ACTIVITY, parent: ACTIVITY, mode: 'list' }],
			},
		} as unknown as Rqo;
		const { body } = await dispatchRqo(searchRqo, ctx);
		const data =
			((body as { result?: { data?: Record<string, unknown>[] } }).result?.data ?? []);
		const rows = data
			.filter((item) => item.tipo === WHO_PORTAL)
			.map((item) => Number(item.row_section_id))
			.sort((a, b) => a - b);
		expect(rows).toEqual(TWIN_ACTIVITY_IDS);
		// The Who column resolves the username subdatum for the found rows.
		const usernames = data
			.filter((item) => item.tipo === USERNAME)
			.map((item) => (item.entries as { value?: unknown }[])?.[0]?.value);
		expect(usernames).toContain(TWIN_USERNAME);
	});
});
