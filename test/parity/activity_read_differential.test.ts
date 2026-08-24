/**
 * Phase 6 gate: the ACTIVITY listing (dd542 over matrix_activity) vs live
 * PHP — the standard read pipeline must serve the activity area's grid:
 * the user portal (dd543 + its dd132 username subdatum), the what select
 * (dd545 → datalist label), and the where/ip input_texts. Oldest records
 * (ASC) keep the fixture stable while the log grows between engine calls.
 *
 * NOT A TLD-BOUND GATE (checked 2026-08-19): it names only seed-shipped `dd`
 * ontology. Its records now come from the committed corpus.
 *
 * ── MEASURED 2026-08-19: STILL RED, and the cause is the TABLE, not the engine ──
 * `matrix_activity` is the engine's own APPEND-ONLY AUDIT LOG: every API call
 * writes a row, including the calls this suite makes. The suite database held
 * 988 such rows at the time of writing, numbered from 1, while the corpus rows
 * this gate installs are the install's three OLDEST (69927997-9). An `ORDER BY
 * section_id ASC LIMIT 3` therefore returns the suite's OWN residue, never the
 * fixture — and the RQO cannot be narrowed to the corpus ids, because a changed
 * RQO no longer hashes to the frozen interaction (test/parity/oracle_fixtures.ts).
 *
 * The only situations that make this gate deterministic are (a) the suite owning
 * `matrix_activity` outright — truncating it around the gate, which destroys
 * audit rows other gates may be counting — or (b) retiring the wire differential
 * in favour of a TS-native activity read gate over rows the test writes itself
 * (the DEC-14b twin pattern). BOTH are decisions about shared surfaces, so this
 * file states the fact instead of pretending: do not "fix" it by comparing
 * fewer fields or by dropping the ordering.
 *
 * ── RETIRED 2026-08-23 → option (b) taken ──
 * THE HONEST REPLACEMENT EXISTS: `test/unit/activity_read_native.test.ts`
 * seeds three scratch dd542 rows in the reserved >= 900000 band (a DESC window
 * over the append-only log is deterministic there no matter how much residue
 * the run appends) and asserts the same wire facts through the same pipeline —
 * the dd543 locator entries + per-component pagination, the dd545 datalist
 * label resolution, the dd546/dd544 stored values, the sections envelope.
 * Mapping: engineering/ORACLE_HARVEST.md (generic-TLD replacement map). This
 * file stays as the frozen record of the PHP activity read and stays red on
 * the suite database by construction (the residue mechanism above).
 *
 * @twinned-by   test/unit/activity_read_native.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/**
 * The corpus this gate owns: the ACTIVITY section and the USERS section its
 * dd543 portal resolves into. Both are SEED-SHIPPED (`dd`) — every installation
 * has them — and the rows come from the committed corpus, never from whatever
 * the ambient log happens to hold.
 */
const CORPUS_SCOPE = [`dd${542}`, `dd${128}`];

const ACTIVITY_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'section',
		tipo: 'dd542',
		section_tipo: 'dd542',
		action: 'search',
		mode: 'list',
		lang: 'lg-spa',
	},
	sqo: {
		section_tipo: ['dd542'],
		limit: 3,
		offset: 0,
		order: [{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] }],
	},
	show: {
		ddo_map: [
			{ tipo: 'dd543', section_tipo: 'dd542', parent: 'dd542', mode: 'list' },
			{ tipo: 'dd545', section_tipo: 'dd542', parent: 'dd542', mode: 'list' },
			{ tipo: 'dd546', section_tipo: 'dd542', parent: 'dd542', mode: 'list' },
			{ tipo: 'dd544', section_tipo: 'dd542', parent: 'dd542', mode: 'list' },
		],
	},
};

function comparableItem(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_tipo: item.section_tipo,
		section_id: item.section_id,
		mode: item.mode,
		lang: item.lang,
		from_component_tipo: item.from_component_tipo ?? null,
		entries: item.entries ?? null,
		fallback_value: item.fallback_value ?? null,
		row_section_id: item.row_section_id ?? null,
		parent_tipo: item.parent_tipo ?? null,
		pagination: item.pagination ?? null,
	};
}

let phpData: Record<string, unknown>[] = [];
let tsData: Record<string, unknown>[] = [];

beforeAll(async () => {
	await ensureTestCorpus(CORPUS_SCOPE);
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
	phpData = normalizeSectionIdTypes(
		((
			(await php.call(structuredClone(ACTIVITY_RQO) as Record<string, unknown>)).body as {
				result?: { data?: unknown[] };
			}
		).result?.data ?? []) as Record<string, unknown>[],
	);

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		structuredClone(ACTIVITY_RQO) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
	tsData = normalizeSectionIdTypes(
		((tsResult.body as { data?: { data?: unknown[] } }).data?.data ?? []) as Record<
			string,
			unknown
		>[],
	);
});

afterAll(async () => {
	expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
});

describe.if(hasPhpCredentials())(
	'activity listing differential (dd542 over matrix_activity)',
	() => {
		test('envelope entries match PHP exactly', () => {
			if (!hasPhpCredentials()) return;
			const phpEnvelope = phpData[0] as { entries?: unknown[] };
			const tsEnvelope = tsData[0] as { entries?: unknown[] };
			expect(phpEnvelope?.entries?.length ?? 0).toBeGreaterThan(0);
			expect(tsEnvelope?.entries).toEqual(phpEnvelope?.entries);
		});

		test('every activity item matches PHP on the normalized fields', () => {
			if (!hasPhpCredentials()) return;
			const keyOf = (item: Record<string, unknown>): string =>
				`${item.row_section_id}|${item.tipo}|${item.section_id}`;
			const phpByKey = new Map(phpData.slice(1).map((item) => [keyOf(item), comparableItem(item)]));
			const tsByKey = new Map(tsData.slice(1).map((item) => [keyOf(item), comparableItem(item)]));
			expect([...tsByKey.keys()].sort()).toEqual([...phpByKey.keys()].sort());
			for (const [key, phpItem] of phpByKey) {
				expect(tsByKey.get(key)).toEqual(phpItem);
			}
		});
	},
);
