/**
 * dd_ts_api read differential (plan A6): get_node_data / get_children_data vs live
 * PHP. Fixture: the tchi1 thesaurus. Node 602 is a descriptor with a link_children
 * element; 620 is its parent (a node with several children → get_children_data
 * mode A). Assertions diff the full node payload byte-for-byte.
 *
 * The orchestrator owns running/debugging the differential sweep; this file pins
 * the two highest-value shapes (single-node build + paginated children build).
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay). The RQOs are
// written in `test`-TLD terms (`testimmovable1`, the clone of the old tchi1
// thesaurus) and reach the frozen install-term interaction through `unmapRqo`;
// the frozen body is read back in test terms through `adoptTipoIdMap`. The
// records come from the committed test corpus, torn down after.
//
// STILL RED, and NOT a TLD binding — the corpus cannot speak for these records
// (src/core/test_data/test_corpus/refused.json, kind `never_revealed`): the
// frozen store never revealed `tchi1/620` nor its twelve children (612-631), so
// get_children_data answers []; and the one node it did reveal (602) was
// RECONSTRUCTED from a read projection whose string item carries no `lang`, so
// the term resolves through the untranslated-lang fallback (`<mark>…</mark>`)
// and its childless state flips has_descriptor_children / is_indexable / order.
// The gate is left asserting the truth: it goes green when the corpus can hold
// those rows (derive_test_corpus.ts), never by relaxing the comparison.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptErrorEnvelopeV2, adoptTipoIdMap, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The cloned immovables thesaurus and its children component (was tchi1/tchi40). */
const SECTION = 'testimmovable1';
const NODE = { section_tipo: SECTION, section_id: 602 };
const PARENT = { section_tipo: SECTION, section_id: 620, children_tipo: 'testimmovable1038' };

let php: PhpApiClient;
let tsContext: Parameters<typeof dispatchRqo>[1];

async function callBoth(rqo: Record<string, unknown>) {
	// WC-2026-08-19-test-tld-replay: the RQO travels back to install terms in
	// `lookupInteraction` (unmapRqo), and the frozen body comes back through the
	// clone map. `matched` + a non-zero rewrite floor are the anti-vacuity check:
	// a body that needed no rewrite would mean this is not the migrated gate.
	const adoptedFrozen = adoptTipoIdMap(
		(await php.call(structuredClone(rqo))).body,
		'ts_node_read_differential',
	);
	expect(adoptedFrozen.matched).toBe(true);
	expect(adoptedFrozen.rewrites.tipos).toBeGreaterThan(0);
	expect(adoptedFrozen.rewrites.ids).toBeGreaterThan(0);
	// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
	const phpBody = normalizeSectionIdTypes(adoptedFrozen.body);
	const tsBody = normalizeSectionIdTypes(
		(await dispatchRqo(structuredClone(rqo) as never, tsContext)).body as Record<string, unknown>,
	);
	return { phpBody, tsBody };
}

beforeAll(async () => {
	await ensureTestCorpus([SECTION]);
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	} as never;
}, 120000);

afterAll(async () => {
	expect(await dropTestCorpus([SECTION])).toBe(0);
});

describe.if(hasPhpCredentials())('dd_ts_api.get_node_data differential', () => {
	test('descriptor node payload matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const rqo = {
			dd_api: 'dd_ts_api',
			action: 'get_node_data',
			prevent_lock: true,
			source: NODE,
			options: {},
		};
		const { phpBody, tsBody } = await callBoth(rqo);
		// The frozen PHP body speaks the dd_manager envelope; project it onto v2
		// and compare the PAYLOADS. `msg` is not a wire fact on TS (envelope v2:
		// success carries no prose), so the old msg byte-equality is restated as
		// "both engines answered a SUCCESS".
		const adopted = adoptErrorEnvelopeV2(phpBody);
		expect(adopted.matched).toBe(true);
		expect(adopted.kind).toBe('ok');
		expect(tsBody.ok).toBe(true);
		expect(tsBody.data).toEqual((adopted.projection as { data: unknown }).data);
	});
});

describe.if(hasPhpCredentials())('dd_ts_api.get_children_data differential (mode A)', () => {
	test('paginated children build matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const rqo = {
			dd_api: 'dd_ts_api',
			action: 'get_children_data',
			prevent_lock: true,
			source: PARENT,
			options: {},
		};
		const { phpBody, tsBody } = await callBoth(rqo);
		const adopted = adoptErrorEnvelopeV2(phpBody);
		expect(adopted.matched).toBe(true);
		expect(adopted.kind).toBe('ok');
		expect(tsBody.ok).toBe(true);
		const phpResult = (adopted.projection as { data: { ar_children_data?: unknown[] } }).data;
		const tsResult = tsBody.data as { ar_children_data?: unknown[] };
		expect(tsResult.ar_children_data).toEqual(phpResult.ar_children_data);
	});
});
