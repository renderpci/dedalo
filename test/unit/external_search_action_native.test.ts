/**
 * external_search_action_native — the two decisions `dd_external_api::search`
 * makes BEFORE anything leaves this installation.
 *
 *  1. `hydrateExternalSearchDdos` (extracted from `resolveExternalSearchTarget`
 *     2026-08-08, CRAP item 3.8): given the external ddos the target decision
 *     found, which ones RENDER, which `context` echo names their columns, and
 *     — the byte-level one — WHICH remote fields, IN WHICH ORDER, go on the
 *     `field[]=` query this engine sends to a live third party. Order and
 *     dedup here are wire form, not tidiness.
 *  2. The action's ARGUMENT VALIDATION: what the client may say, what it is
 *     refused for, and in which order existence and permission are decided.
 *
 * Credless and DB-light by construction: the hydration half injects its
 * fields_map reader, so no ontology is touched; the action half only needs
 * `test3`/`test61` to EXIST (they are in the suite database) and never reaches
 * an outbound socket — this DB has no resolvable external target, so every
 * resolved call lands in the bad_config envelope, which is itself one of the
 * asserted cases.
 *
 * The SOURCE-TEXT half of this file is the anti-revert gate for the
 * extraction: the inline loop must be GONE from `resolveExternalSearchTarget`,
 * not merely duplicated beside it (the extraction-without-rewire trap).
 */

import { describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import {
	type ExternalSearchDdoRef,
	externalApiActions,
	hydrateExternalSearchDdos,
} from '../../src/core/api/handlers/dd_external_api.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { toErrorEnvelope } from '../../src/core/errors/convert.ts';
import { SUPERUSER_ID } from '../../src/core/security/permissions.ts';
import type { FieldsMapEntry } from '../../src/external/api/index.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A ddo reference in the shape `selectExternalSearchTarget` emits. */
function ddoRef(tipo: string, section: string | null): ExternalSearchDdoRef {
	return { tipo, section, ddo: { tipo, section_tipo: section, label: `echo:${tipo}` } };
}

/** Only `local === 'dato'` rows carry a remote field (remoteFieldsOf). */
function dato(...remote: string[]): FieldsMapEntry[] {
	return remote.map((field) => ({ local: 'dato', remote: field }));
}

/** A loader built from a plain table, recording exactly what it was asked. */
function loaderFrom(
	table: Record<string, FieldsMapEntry[]>,
): ((tipo: string) => Promise<readonly FieldsMapEntry[]>) & { asked: string[] } {
	const asked: string[] = [];
	const load = async (tipo: string): Promise<readonly FieldsMapEntry[]> => {
		asked.push(tipo);
		return table[tipo] ?? [];
	};
	return Object.assign(load, { asked });
}

// ---------------------------------------------------------------------------
// hydrateExternalSearchDdos — the wire order
// ---------------------------------------------------------------------------

describe('hydrateExternalSearchDdos — which ddos render and which fields go out', () => {
	test('ddos declared on another section are excluded', async () => {
		const load = loaderFrom({
			zenon3: dato('id'),
			rsc368: dato('title'), // a portal ddo on the CALLER's own section
			other9: dato('authors'),
		});
		const { ddos, context, remoteFields } = await hydrateExternalSearchDdos(
			'rsc1285',
			'zenon1',
			[ddoRef('rsc368', 'rsc332'), ddoRef('zenon3', 'zenon1'), ddoRef('other9', 'other1')],
			load,
		);
		expect(ddos.map((entry) => entry.tipo)).toEqual(['zenon3']);
		// The off-section ddos are not even READ: hydration must never fetch a
		// node it is going to discard (this is the portal case that broke the
		// first cut of the action).
		expect(load.asked).toEqual(['zenon3']);
		expect(context).toHaveLength(1);
		expect((context[0] as { tipo: string }).tipo).toBe('zenon3');
		expect(remoteFields).toEqual(['id']);
	});

	/**
	 * THE HIGHEST-VALUE ASSERTION IN THIS FILE. `remoteFields` is the
	 * `field[]=` byte order this installation sends to a live third party. It
	 * keeps DECLARATION ORDER across ddos and dedupes on first sight — a sort,
	 * a `[...new Set(...)]` round trip that reorders, or a per-ddo reset all
	 * change the outbound request. Exact array equality, never membership.
	 */
	test('remoteFields keeps declaration order and dedupes across ddos', async () => {
		const load = loaderFrom({
			zenon3: dato('id', 'title'),
			zenon4: dato('title', 'authors'),
			zenon5: dato('id'),
		});
		const { remoteFields, ddos } = await hydrateExternalSearchDdos(
			'test61',
			'zenon1',
			[ddoRef('zenon3', 'zenon1'), ddoRef('zenon4', 'zenon1'), ddoRef('zenon5', 'zenon1')],
			load,
		);
		expect(remoteFields).toEqual(['id', 'title', 'authors']);
		// The dedup is on the FIELD list only — every ddo still renders, including
		// the one whose only field was already requested.
		expect(ddos.map((entry) => entry.tipo)).toEqual(['zenon3', 'zenon4', 'zenon5']);
	});

	test('a dotted / indexed remote path contributes only its HEAD, once', async () => {
		const { remoteFields } = await hydrateExternalSearchDdos(
			'test61',
			'zenon1',
			[ddoRef('zenon3', 'zenon1'), ddoRef('zenon4', 'zenon1')],
			loaderFrom({
				zenon3: dato('authors[0].name', 'publicationDates'),
				zenon4: dato('authors.primary'),
			}),
		);
		expect(remoteFields).toEqual(['authors', 'publicationDates']);
	});

	test('a non-dato fields_map row asks the service for nothing', async () => {
		const { ddos, remoteFields } = await hydrateExternalSearchDdos(
			'test61',
			'zenon1',
			[ddoRef('zenon3', 'zenon1'), ddoRef('zenon4', 'zenon1')],
			loaderFrom({
				zenon3: [{ local: 'label', remote: 'title' }],
				zenon4: dato('id'),
			}),
		);
		// The ddo still RENDERS (its map is non-empty) — it just adds no field.
		expect(ddos.map((entry) => entry.tipo)).toEqual(['zenon3', 'zenon4']);
		expect(remoteFields).toEqual(['id']);
	});

	/**
	 * If `ddos` is filtered and `context` is not, the client renders every value
	 * under the wrong column header — a silent, plausible-looking wrong answer.
	 * The pairing is positional, so it is asserted positionally.
	 */
	test('a ddo with an EMPTY fields_map is skipped and context stays index-paired', async () => {
		const { ddos, context, remoteFields } = await hydrateExternalSearchDdos(
			'test61',
			'zenon1',
			[
				ddoRef('zenon3', 'zenon1'),
				ddoRef('zenon_empty', 'zenon1'), // configured, but maps nothing
				ddoRef('zenon5', 'zenon1'),
			],
			loaderFrom({ zenon3: dato('id'), zenon_empty: [], zenon5: dato('authors') }),
		);
		expect(ddos.map((entry) => entry.tipo)).toEqual(['zenon3', 'zenon5']);
		expect(context).toHaveLength(ddos.length);
		for (const [index, ddo] of ddos.entries()) {
			expect((context[index] as { tipo: string }).tipo).toBe(ddo.tipo);
		}
		// The echo is the DDO OBJECT the target decision carried, not a rebuild.
		expect(context[0]).toEqual({
			tipo: 'zenon3',
			section_tipo: 'zenon1',
			label: 'echo:zenon3',
		});
		expect(remoteFields).toEqual(['id', 'authors']);
	});

	test('the fieldsMap on each ddo is the LOADED one, verbatim', async () => {
		const map = dato('id', 'title');
		const { ddos } = await hydrateExternalSearchDdos(
			'test61',
			'zenon1',
			[ddoRef('zenon3', 'zenon1')],
			loaderFrom({ zenon3: map }),
		);
		expect(ddos[0]?.fieldsMap).toBe(map);
	});

	test('all fields_maps empty → a loud refusal naming the caller', async () => {
		await expect(
			hydrateExternalSearchDdos(
				'test61',
				'zenon1',
				[ddoRef('zenon3', 'zenon1'), ddoRef('zenon4', 'zenon1')],
				loaderFrom({}),
			),
		).rejects.toThrow(/component test61 .*no external field with a fields_map/);
	});

	test('no ddo on the target section at all → the same refusal, never an empty search', async () => {
		await expect(
			hydrateExternalSearchDdos(
				'rsc1285',
				'zenon1',
				[ddoRef('rsc368', 'rsc332')],
				loaderFrom({ rsc368: dato('title') }),
			),
		).rejects.toThrow(
			'component rsc1285 external config shows no external field with a fields_map',
		);
	});

	test('an empty ddo list refuses rather than searching for nothing', async () => {
		await expect(hydrateExternalSearchDdos('test61', 'zenon1', [], loaderFrom({}))).rejects.toThrow(
			'no external field with a fields_map',
		);
	});
});

// ---------------------------------------------------------------------------
// The rewire — the inline loop is GONE, not duplicated
// ---------------------------------------------------------------------------

const HANDLER_PATH = `${import.meta.dir}/../../src/core/api/handlers/dd_external_api.ts`;

describe('resolveExternalSearchTarget CALLS the extraction — no inline twin', () => {
	test('the hydration loop no longer lives inside resolveExternalSearchTarget', async () => {
		const source = await Bun.file(HANDLER_PATH).text();
		const start = source.indexOf('export async function resolveExternalSearchTarget');
		expect(start).toBeGreaterThan(-1);
		const end = source.indexOf('\nexport ', start + 1);
		expect(end).toBeGreaterThan(start);
		const body = source.slice(start, end);

		// (a) it calls the extraction…
		expect(body).toContain('await hydrateExternalSearchDdos(');
		// (b) …and the moved code is gone from it: no second loop over the ddos,
		// no second wire-order/dedup implementation, no second refusal.
		for (const removed of [
			'for (const entry of externalDdos)',
			'remoteFieldsOf',
			'const seen = new Set<string>()',
			'no external field with a fields_map',
		]) {
			expect(body.includes(removed), `resolveExternalSearchTarget still inlines '${removed}'`).toBe(
				false,
			);
		}
		// (c) exactly ONE implementation of the wire order exists in the module.
		expect(source.split('remoteFieldsOf(').length - 1).toBe(1);
	});

	test('the injected loader still reads the ddo NODE (never the request)', async () => {
		const source = await Bun.file(HANDLER_PATH).text();
		// The sibling gate in external_search_native.test.ts asserts the same
		// property on the call shape; kept here too because THIS file is what a
		// future edit of the extraction would touch.
		expect(source).toContain('parseFieldsMap(nodeProperties?.fields_map');
		expect(/getPropertiesByTipo\(\s*(\w+\.)?tipo\s*\)/.test(source)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// externalApiActions.search — argument validation (cases 1-5)
// ---------------------------------------------------------------------------

const NON_ADMIN = { userId: 987654, isGlobalAdmin: false, isDeveloper: false };
const SUPERUSER = { userId: SUPERUSER_ID, isGlobalAdmin: true, isDeveloper: true };

function contextFor(principal: typeof NON_ADMIN): ApiRequestContext {
	return {
		requestId: 'external-search-action-test',
		clientIp: '127.0.0.1',
		session: null,
		csrfCandidate: null,
		principal,
	};
}

async function search(
	rqo: Record<string, unknown>,
	principal: typeof NON_ADMIN = SUPERUSER,
): Promise<{ status: number; body: Record<string, unknown> }> {
	const handler = externalApiActions.search;
	if (handler === undefined) throw new Error('dd_external_api has no search action');
	// The handler THROWS to refuse; the dispatch catch is the converter door —
	// mirrored here so the pinned status/code are the wire's.
	try {
		const result = await handler(rqo as unknown as Rqo, contextFor(principal));
		return { status: result.status, body: result.body as Record<string, unknown> };
	} catch (error) {
		const converted = toErrorEnvelope(error, { requestId: 'external-search-action-test' });
		return { status: converted.status, body: converted.body as Record<string, unknown> };
	}
}

/** `error.code` of a refusal body. */
function codeOf(body: Record<string, unknown>): string | undefined {
	return (body.error as { code?: string } | undefined)?.code;
}

describe('search refuses a caller it cannot identify', () => {
	test.each([
		['no source at all', {}],
		['tipo only', { source: { tipo: 'test61' } }],
		['section_tipo only', { source: { section_tipo: 'test3' } }],
		['a non-string tipo', { source: { tipo: 42, section_tipo: 'test3' } }],
		['an empty tipo', { source: { tipo: '', section_tipo: 'test3' } }],
	])('%s → 400', async (_name, rqo) => {
		const { status, body } = await search(rqo);
		expect(status).toBe(400);
		expect(codeOf(body)).toBe('request.invalid_source');
	});
});

describe('existence is decided BEFORE permission', () => {
	/**
	 * A 403 on an unknown tipo would answer "does this node exist?" to anyone
	 * who can call the action — the 400 is the non-disclosing answer, and the
	 * order (getNode, then getPermissions) is what produces it.
	 */
	test('an unknown source tipo → 400, not 403', async () => {
		const { status, body } = await search(
			{ source: { tipo: 'no_such_component_999', section_tipo: 'test3' }, options: { q: 'x' } },
			NON_ADMIN,
		);
		expect(status).toBe(400);
		// the SAME code as a missing source: the tipo's existence is not disclosed
		expect(codeOf(body)).toBe('request.invalid_source');
		// the tipo is LOG-ONLY (coordinates): outside the debug block it never reaches the wire
		const { debug: _debug, ...wireError } = body.error as Record<string, unknown>;
		expect(JSON.stringify(wireError)).not.toContain('no_such_component_999');
	});

	test('a known component the actor cannot read → 403', async () => {
		const { status, body } = await search(
			{ source: { tipo: 'test61', section_tipo: 'test3' }, options: { q: 'x' } },
			NON_ADMIN,
		);
		expect(status).toBe(403);
		expect(codeOf(body)).toBe('perm.denied');
	});

	/**
	 * The control that keeps the 403 above from being vacuous: the SAME request
	 * from an authorized actor gets past the permission gate (and then lands in
	 * the configuration envelope, this database having no resolvable external
	 * target for test61 — asserted as its own case below).
	 */
	test('the superuser control: the same request passes the gate', async () => {
		const { status } = await search(
			{ source: { tipo: 'test61', section_tipo: 'test3' }, options: { q: 'x' } },
			SUPERUSER,
		);
		expect(status).toBe(200);
	});
});

describe('an unreadable paging value is REFUSED, never quietly defaulted', () => {
	test.each([
		['limit', 'twenty', 'limit must be an integer'],
		['offset', 'x', 'offset must be an integer'],
		['limit', 1.5, 'limit must be an integer'],
		['offset', null as unknown as number, null],
		['limit', 0, 'limit must be positive'],
		['limit', -1, 'limit must be positive'],
		['offset', -1, 'offset must not be negative'],
	])('%s: %p', async (key, value, msg) => {
		const { status, body } = await search({
			source: { tipo: 'test61', section_tipo: 'test3' },
			options: { q: 'x', [key]: value },
		});
		if (msg === null) {
			// null is "absent", the same as undefined — it must NOT be refused.
			expect(status).toBe(200);
			return;
		}
		expect(status).toBe(400);
		// request.invalid_options is public-disclosure: the sentence names the field
		expect(codeOf(body)).toBe('request.invalid_options');
		expect((body.error as { message: string }).message).toBe(msg);
	});

	test('a numeric STRING and an absent value both pass', async () => {
		for (const options of [{ q: 'x', limit: '20', offset: '0' }, { q: 'x' }]) {
			const { status } = await search({
				source: { tipo: 'test61', section_tipo: 'test3' },
				options,
			});
			expect(status).toBe(200); // past validation, into the config envelope
		}
	});
});

describe('an unresolvable target is DEGRADATION: ok:true + a coded notice a search box can act on', () => {
	/**
	 * NOT a 4xx and NOT ok:false: the request was well-formed and authorized;
	 * the SOURCE is what is degraded (ERRORS_SPEC §3 — external degradation is
	 * `ok:true + notices[]`). `data_manager.request` discards a non-ok body, so
	 * everything the server said about WHY would be replaced by the generic
	 * network error this action exists to remove (WC-2026-08-06-external-search-request).
	 */
	test('bad_config → 200, ok:true, empty data, notice external.bad_config + a source_status the client can localize', async () => {
		const { status, body } = await search({
			source: { tipo: 'test61', section_tipo: 'test3' },
			options: { q: 'burnett' },
		});
		expect(status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.data).toEqual({ context: [], data: [] });
		const notices = body.notices as { code: string; details?: { service?: string } }[];
		expect(notices.map((notice) => notice.code)).toEqual(['external.bad_config']);
		expect(notices[0]?.details?.service).toBe('unknown');
		const sourceStatus = body.source_status as {
			state: string;
			label_key: string;
			service: string;
		};
		expect(sourceStatus.state).toBe('misconfigured');
		// The browser gets a CATALOG KEY, never prose — and the key must exist.
		const master = (await Bun.file(
			`${import.meta.dir}/../../src/core/labels/master.json`,
		).json()) as Record<string, unknown>;
		expect(Object.keys(master)).toContain(sourceStatus.label_key);
	});
});
