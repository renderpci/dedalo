/**
 * PORTAL DESCENDANT MAP — a grandchild declared in the CALLER's ddo_map must
 * resolve, and the recursion that resolves it must be BOUNDED.
 *
 * THE BUG THIS PINS (2026-08-31, numisdata3 list): `relation_core.expandPortal`
 * recurses with `options.descendantsMap ?? childDdos`, and
 * `relations/models/portal.ts` set `descendantsMap` ONLY when the portal's
 * children were built from the component's own request_config. When the
 * children came from the CALLER's map instead, it passed `undefined` — so the
 * fallback handed each nested portal the portal's DIRECT children only, and
 * every level below the first was silently dropped. On the live install the
 * chain numisdata77 → numisdata164 → rsc29 (component_image) lost its rsc29
 * ddo: the server shipped rsc29 in `context` but no rsc29 item in `data`, the
 * client synthesised its "No data found for this component" stub with
 * entries:[], and every coin in the list rendered the placeholder image.
 *
 * The failure is invisible from the outside — a portal that emits its own item
 * and its direct children looks entirely healthy — so it is exactly the shape a
 * stray `?? childDdos` reintroduces in silence. Hence a gate.
 *
 * CONTRACTS:
 *  (a) A THREE-LEVEL caller map (portal → nested portal → leaf) emits the LEAF
 *      item, stamped from_component_tipo = the NESTED portal and row_section_id
 *      = the leaf's own target. Two levels below the section, from a map the
 *      client sent — the regression, expressed at its shortest.
 *  (b) A FOUR-LEVEL caller map keeps going: depth is not the limit, the map is.
 *  (c) A TRUNCATED map (nested portal declared, leaf NOT) emits the nested
 *      portal's own item and NO leaf — the caller owns its map, and in list
 *      mode a nested portal does not fall back to its own config
 *      (portal.ts `ownConfig`, false for caller-map children). Documented
 *      behaviour, not the bug: pinned so the fix is not "corrected" into
 *      resolving levels the caller never asked for.
 *  (d) A CYCLIC map is REFUSED, loudly, instead of recursing until the stack
 *      dies. `[{A,parent:section},{B,parent:A},{A,parent:B}]` is a legal map
 *      shape and the map is client-supplied; before MAX_DDO_DEPTH
 *      (section/read.ts) nothing bounded the child recursion at all —
 *      relation_core's `depth < 4` gates the own-config lookup only. This is
 *      the half of the change that is a hardening, not a fix: the descendant
 *      map travelling down is what makes an arbitrary cycle reachable.
 *
 * Engine under test: src/core/relations/models/portal.ts (descendantsMap),
 * src/core/relations/relation_core.ts (expandPortal's child recursion),
 * src/core/section/read.ts (emitDdoData + MAX_DDO_DEPTH).
 *
 * SITUATION (`zzcm`, scratch TLD, ids >= 900000): HOST —portal→ MID —portal→
 * LEAF —portal→ TAIL, one record at each level, one locator per hop. Dropped
 * in afterAll with residue asserted 0.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const HOST = 'zzcm1';
const PORTAL = 'zzcm2';
const MID = 'zzcm3';
const NESTED_PORTAL = 'zzcm4';
const LEAF = 'zzcm5';
/** The GRANDCHILD — two levels below the section, the item the bug lost. */
const LEAF_TEXT = 'zzcm6';
const TAIL_PORTAL = 'zzcm7';
const TAIL = 'zzcm8';
const TAIL_TEXT = 'zzcm9';

const HOST_ID = 900601;
const MID_ID = 900602;
const LEAF_ID = 900603;
const TAIL_ID = 900604;

const LEAF_VALUE = 'the grandchild value';
const TAIL_VALUE = 'the great-grandchild value';

/** One locator, the only shape any hop in this situation needs. */
const locator = (tipo: string, sectionTipo: string, sectionId: number) => [
	{
		id: 1,
		type: 'dd151',
		section_id: sectionId,
		section_tipo: sectionTipo,
		from_component_tipo: tipo,
	},
];

const S = situation({
	name: 'portal caller map descendants',
	tld: 'zzcm',
	nodes: [
		{ tipo: HOST, parent: 'test1', model: 'section', relations: [{ tipo: 'test24' }] },
		// (!) NO request_config on any portal here. The whole point is that the
		// children arrive from the CALLER's map — a portal with its own config
		// would take the other branch in portal.ts and prove nothing.
		{ tipo: PORTAL, parent: HOST, model: 'component_portal' },
		{ tipo: MID, parent: 'test1', model: 'section', relations: [{ tipo: 'test24' }] },
		{ tipo: NESTED_PORTAL, parent: MID, model: 'component_portal' },
		{ tipo: LEAF, parent: 'test1', model: 'section', relations: [{ tipo: 'test24' }] },
		{ tipo: LEAF_TEXT, parent: LEAF, model: 'component_input_text' },
		{ tipo: TAIL_PORTAL, parent: LEAF, model: 'component_portal', order_number: 2 },
		{ tipo: TAIL, parent: 'test1', model: 'section', relations: [{ tipo: 'test24' }] },
		{ tipo: TAIL_TEXT, parent: TAIL, model: 'component_input_text' },
	],
	records: [
		{
			section_tipo: HOST,
			section_id: HOST_ID,
			columns: { relation: { [PORTAL]: locator(PORTAL, MID, MID_ID) } },
		},
		{
			section_tipo: MID,
			section_id: MID_ID,
			columns: { relation: { [NESTED_PORTAL]: locator(NESTED_PORTAL, LEAF, LEAF_ID) } },
		},
		{
			section_tipo: LEAF,
			section_id: LEAF_ID,
			columns: {
				string: { [LEAF_TEXT]: [{ id: 1, lang: 'lg-nolan', value: LEAF_VALUE }] },
				relation: {
					[TAIL_PORTAL]: locator(TAIL_PORTAL, TAIL, TAIL_ID),
					// The back-edge contract (d) needs: LEAF —PORTAL→ MID closes
					// the loop, so every hop of the cyclic map finds a locator and
					// only the depth bound can end the recursion. Unreachable from
					// every other map here, which never declares PORTAL this deep.
					[PORTAL]: locator(PORTAL, MID, MID_ID),
				},
			},
		},
		{
			section_tipo: TAIL,
			section_id: TAIL_ID,
			columns: { string: { [TAIL_TEXT]: [{ id: 1, lang: 'lg-nolan', value: TAIL_VALUE }] } },
		},
	],
});

let tsContext: Record<string, unknown>;

beforeAll(async () => {
	await ensureSituation(S);
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	tsContext = {
		requestId: 'portal-caller-map-descendants',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal: await resolvePrincipal(-1),
	};
}, 60000);

afterAll(async () => {
	expect(await dropSituation(S)).toBe(0);
});

interface Item {
	typo?: unknown;
	tipo?: unknown;
	section_tipo?: unknown;
	section_id?: unknown;
	from_component_tipo?: unknown;
	row_section_id?: unknown;
	entries?: unknown;
}

/** A LIST read of the host section through the real pipeline, with the given map. */
async function readWithMap(ddoMap: Record<string, unknown>[]): Promise<{
	ok: boolean;
	items: Item[];
	errorCode: string | null;
}> {
	const rqo = {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'section',
			tipo: HOST,
			section_tipo: HOST,
			action: 'search',
			mode: 'list',
			lang: 'lg-nolan',
		},
		sqo: { section_tipo: [HOST], limit: 1, offset: 0 },
		show: { ddo_map: ddoMap },
	};
	const body = (await dispatchRqo(structuredClone(rqo) as never, tsContext as never)).body as {
		ok?: boolean;
		data?: { data?: Item[] };
		error?: { code?: string };
	};
	return {
		ok: body.ok !== false,
		items: (body.data?.data ?? []).filter((item) => item.typo !== 'sections'),
		errorCode: body.error?.code ?? null,
	};
}

/** The map levels, as the client sends them (parent = the GENERATING ddo). */
const portalDdo = { tipo: PORTAL, section_tipo: HOST, parent: HOST, mode: 'list' };
const nestedDdo = { tipo: NESTED_PORTAL, section_tipo: MID, parent: PORTAL, mode: 'list' };
const leafDdo = { tipo: LEAF_TEXT, section_tipo: LEAF, parent: NESTED_PORTAL, mode: 'list' };
const tailPortalDdo = {
	tipo: TAIL_PORTAL,
	section_tipo: LEAF,
	parent: NESTED_PORTAL,
	mode: 'list',
};
const tailDdo = { tipo: TAIL_TEXT, section_tipo: TAIL, parent: TAIL_PORTAL, mode: 'list' };

const itemFor = (items: Item[], tipo: string): Item | undefined =>
	items.find((item) => item.tipo === tipo);

describe('portal caller-map descendants', () => {
	test('(a) a grandchild in the caller map resolves, stamped to its generating portal', async () => {
		const { ok, items } = await readWithMap([portalDdo, nestedDdo, leafDdo]);
		expect(ok).toBe(true);

		// Both portals emit their own item — that much was NEVER broken, and is
		// why the bug looked like a client fault.
		expect(itemFor(items, PORTAL)).toBeDefined();
		expect(itemFor(items, NESTED_PORTAL)).toBeDefined();

		// THE REGRESSION: the leaf, two levels down, from the caller's map.
		const leaf = itemFor(items, LEAF_TEXT);
		expect(leaf).toBeDefined();
		expect(leaf?.entries).toEqual([{ id: 1, lang: 'lg-nolan', value: LEAF_VALUE }]);
		// IDENTITY is the leaf's own record; GENERATOR is the nested portal.
		expect(leaf?.from_component_tipo).toBe(NESTED_PORTAL);
		expect(leaf?.section_tipo).toBe(LEAF);
		expect(leaf?.section_id).toBe(LEAF_ID);
		// row_section_id is the OUTER record, not the leaf's — every portal
		// descendant is re-stamped onto the row it hangs off in the section
		// read (relation_core's outer-subdatum re-stamp). Two levels down
		// changes nothing about that: the anchor stays the host row.
		expect(leaf?.row_section_id).toBe(HOST_ID);
	});

	test('(b) a four-level map keeps resolving — the map is the limit, not the depth', async () => {
		const { ok, items } = await readWithMap([
			portalDdo,
			nestedDdo,
			leafDdo,
			tailPortalDdo,
			tailDdo,
		]);
		expect(ok).toBe(true);
		expect(itemFor(items, LEAF_TEXT)?.entries).toEqual([
			{ id: 1, lang: 'lg-nolan', value: LEAF_VALUE },
		]);
		const tail = itemFor(items, TAIL_TEXT);
		expect(tail?.entries).toEqual([{ id: 1, lang: 'lg-nolan', value: TAIL_VALUE }]);
		expect(tail?.from_component_tipo).toBe(TAIL_PORTAL);
		expect(tail?.section_id).toBe(TAIL_ID);
	});

	test('(c) a truncated map resolves the levels it declares and no more', async () => {
		// The nested portal is declared; its leaf is NOT. The nested portal emits
		// its locator item and stops — in list mode a caller-map child never
		// falls back to its own config (portal.ts `ownConfig`). The caller owns
		// its map; the engine does not widen it.
		const { ok, items } = await readWithMap([portalDdo, nestedDdo]);
		expect(ok).toBe(true);
		expect(itemFor(items, NESTED_PORTAL)).toBeDefined();
		expect(itemFor(items, LEAF_TEXT)).toBeUndefined();
	});

	test('(d) a cyclic map is refused, not recursed to death', async () => {
		// PORTAL → NESTED_PORTAL → PORTAL → … Every hop has a stored locator, so
		// nothing runs out of data; only the depth bound ends this.
		const { ok, errorCode } = await readWithMap([
			portalDdo,
			nestedDdo,
			{ tipo: PORTAL, section_tipo: LEAF, parent: NESTED_PORTAL, mode: 'list' },
		]);
		expect(ok).toBe(false);
		expect(errorCode).toBe('request.invalid_rqo');
	}, 30000);
});
