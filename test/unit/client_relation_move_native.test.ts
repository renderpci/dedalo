/**
 * THE RELATION MOVE CONTRACT — P0-11 (audit CLI-02 + CLI-03).
 *
 * WHY THIS FILE EXISTS. Two client flows moved or replaced a curated relation by
 * DESTROYING the value they held BEFORE the step that could fail, and neither one
 * read the answer of the step that could fail:
 *
 *   FLOW 1 — cross-portal move, drag_and_drop.js `on_drop`. It called
 *   `self.link_record(locator)` WITHOUT awaiting it, discarded the answer, and then
 *   called `source_instance.unlink_record(locator)` unconditionally.
 *   `link_records` never throws — it ANSWERS `{linked, refused, total}` and names
 *   every locator that did not land (data_limit, duplicate, api_error, not_stored,
 *   refused_by_server). On any refusal the relation was gone from the SOURCE portal
 *   and had never been created in the TARGET one, and the operator saw nothing.
 *
 *   FLOW 2 — `data_limit:1` picker replace, component_portal.js `link_terms_handler`.
 *   It looped `await self.delete_locator(locator)` over every stored locator, never
 *   inspected a single answer, and only then called `link_records`. A refused pick
 *   (non-selectable term, target outside the caller's declared sections, unreadable
 *   target, expired session) therefore left the single-valued field EMPTY, and the
 *   alert named only the pick refusal, never the destruction. On the HAPPY path the
 *   same code computed `landed = total_after - total_before` = 0 for a 1-out/1-in
 *   replace, reported a stored change as `duplicate`, and returned before the refresh.
 *
 * These records are irreplaceable cultural-heritage curation. A silent destruction is
 * the worst defect class this system has, because nobody is told to look.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS GATE PROVES, and it runs the REAL client modules — not re-implementations:
 *
 *  A. FLOW 1, SERVER ACCEPTANCE: the real `on_drop` drives the real
 *     `component_portal.prototype.link_records` on the target and the real
 *     `component_portal.prototype.unlink_record` on a source instance registered in
 *     the REAL instance registry (`instances.js` add_instance). The move lands in the
 *     target and the source is unlinked by a remove that NAMES the item id.
 *  B. FLOW 1, SERVER REFUSAL: the target's save refuses the insert. THE SOURCE
 *     RELATION STILL EXISTS — the source's save door is never called at all — and the
 *     operator is alerted.
 *  C. FLOW 1, the P0-8 reachable path: a dragged locator with no usable id never
 *     reaches the wire as `{action:'remove', id:null}`.
 *  D. FLOW 2, SERVER ACCEPTANCE: one save, `changed_data` = removes THEN inserts, the
 *     new value is stored, `linked.length===1`, nothing refused, and the component IS
 *     refreshed (the mis-report regression).
 *  E. FLOW 2, ORDERING IS LOAD-BEARING: the same batch emitted inserts-first against
 *     the same selection cap destroys the value. This is why D asserts an order.
 *  F. FLOW 2, SERVER REFUSAL: the insert is refused. The refusal is reported as
 *     `replace_failed — …` (never as `duplicate`), and THE PREVIOUS VALUE IS BACK in
 *     the store via the compensating re-link. A second case pins the honest failure
 *     of that compensation.
 *  G. FLOW 2, the P0-8 reachable path: a `replace_entries` entry without a usable id
 *     is refused with `replace_entry_without_id` and ZERO saves are issued.
 *  H. THE CENSUS (total, derived): no call site of `link_record` / `link_records`
 *     anywhere under `client/` or `tools/ ** /js` discards the return value, except a
 *     SHRINK-ONLY list with a reason per entry.
 *
 * THE SERVER DOOR IS THE REAL ONE WHERE IT MATTERS. Every `changed_data` this gate's
 * fake save receives is first passed through the ACTUAL server-side refusal predicate
 * `unnamedRemoveRefusal` (src/core/section/record/save_component.ts), so C and G are
 * not checked against a hand-written idea of the contract — they are checked against
 * the function the API door calls. The gate additionally pins, by reading the source,
 * that `save_component.ts` still refuses an id-less remove: if that ever relaxes back
 * into "clear ALL entries in all languages", the premise of the client's id guards is
 * gone and this gate says so.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS GATE DOES **NOT** PROVE — stated plainly, because a gate that overclaims
 * is worse than a missing one:
 *
 *  - NOT the real HTTP save. `change_value` is replaced by an in-memory store that
 *    applies `changed_data` the way `save_component.ts` does (in order, over one
 *    mutating array, a refused relation insert DROPPED rather than failing the save)
 *    and enforces a resulting-count selection cap the way `relations/save.ts` does.
 *    That is a MODEL of two server rules. It is anchored to the real
 *    `unnamedRemoveRefusal` and to source assertions, but it is not the server.
 *  - NOT rendering. `refresh()` here re-reads the store; it draws no DOM. Whether the
 *    new value is VISIBLE after an accepted move is not decided here.
 *  - NOT the drag gesture, the dataTransfer payload the render layer actually writes,
 *    or that `alert()` reaches a human.
 *  - NOT the dataframe cascade: `save_component.ts` removeDataframeDataById destroys
 *    paired frames on a remove and no compensating re-link brings them back. The
 *    client comment says so; nothing here exercises it.
 *
 * CLOSING THAT GAP is a `bun run test:client` spec (Mocha in headless Chrome, real
 * server, real DOM). It is writable: the generic `test` TLD already ships a compatible
 * portal pair — `src/core/test_data/test_tld_ontology.json` carries
 * `properties.draggable_to` on test1611 ↔ test1613 (73 nodes have the property). It is
 * NOT in this change: this agent was instructed not to run the client suite, and an
 * unexecuted browser spec asserting a destruction path is exactly the gate that proves
 * nothing. The behavioural defect itself was pure control flow inside these two
 * functions, which is why it is decidable — and mutation-proved — at this seam.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { plugin } from 'bun';
import { unnamedRemoveRefusal } from '../../src/core/section/record/save_component.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const CLIENT_ROOT = join(REPO_ROOT, 'client');
const TOOLS_ROOT = join(REPO_ROOT, 'tools');

/**
 * THE SERVING ALIAS, reproduced for the module loader ONLY.
 *
 * The client's import specifiers are browser URLs, not filesystem paths: `/dedalo/lib/*`
 * is served out of node_modules (src/core/client_libs/registry.ts — there is no
 * `client/dedalo/lib/` on disk) and `/dedalo/tools/*` out of the repo's top-level
 * `tools/` (src/core/tools/serving.ts), which then imports back into
 * `client/dedalo/core/`. Without this, importing component_portal.js under Bun dies on
 * `Cannot find module '../../../lib/codex-tooltip/dist/tooltip.js'`.
 *
 * SAFETY: the hook fires only for importers inside client/ or tools/, and only AFTER
 * plain relative resolution has been tried and the file does not exist — so it can
 * never shadow normal resolution for the rest of the suite. It rewrites nothing else.
 */
const SERVE_ALIAS: ReadonlyArray<readonly [RegExp, string]> = [
	[/(?:^|\/)core\/(.+)$/, `${join(CLIENT_ROOT, 'dedalo', 'core')}/`],
	[/(?:^|\/)lib\/(.+)$/, `${join(REPO_ROOT, 'node_modules')}/`],
	[/(?:^|\/)tools\/(.+)$/, `${TOOLS_ROOT}/`],
];
plugin({
	name: 'dedalo-client-serve-alias',
	setup(build) {
		build.onResolve({ filter: /^\.\.?\// }, (args) => {
			const importer = args.importer ?? '';
			if (!importer.startsWith(CLIENT_ROOT) && !importer.startsWith(TOOLS_ROOT)) return undefined;
			const direct = resolve(dirname(importer), args.path);
			if (existsSync(direct)) return { path: direct };
			for (const [pattern, base] of SERVE_ALIAS) {
				const matched = args.path.match(pattern);
				if (matched && existsSync(base + matched[1])) return { path: base + matched[1] };
			}
			return undefined;
		});
	},
});

// ── the page globals the two modules read at RUNTIME (never at import time) ──────────
const globals = globalThis as unknown as Record<string, unknown>;
const saved_globals: Record<string, unknown> = {};
let alerts: string[] = [];

// ── the modules under test, imported for real ───────────────────────────────────────
type Locator = {
	id?: number | string | null;
	section_tipo: string;
	section_id: string;
	from_component_tipo?: string;
	paginated_key?: number;
};
type LinkOutcome = {
	linked: Locator[];
	refused: Array<{ locator: Locator | null; reason: string }>;
	total: number | null;
};
type PortalInstance = {
	id: string;
	tipo: string;
	model: string;
	mode: string;
	total: number;
	data: { entries: Locator[]; pagination?: unknown };
	context: { properties: Record<string, unknown> };
	node: { classList: { add(c: string): void; remove(c: string): void } };
	change_value: (options: { changed_data: ChangedData }) => Promise<unknown>;
	refresh: (options?: unknown) => Promise<unknown>;
	link_records: (values: Locator[], options?: Record<string, unknown>) => Promise<LinkOutcome>;
	unlink_record: (locator: Locator) => Promise<boolean>;
};
type ChangedData = ReadonlyArray<{ action: string; id: number | string | null; value: unknown }>;

let component_portal: { prototype: PortalInstance };
let on_drop: (
	node: unknown,
	event: unknown,
	options: { caller: PortalInstance; paginated_key?: number },
) => Promise<boolean>;
let add_instance: (key: string, instance: unknown) => void;
let delete_instance: (key: string) => unknown;

beforeAll(async () => {
	for (const key of [
		'window',
		'SHOW_DEBUG',
		'SHOW_DEVELOPER',
		'DEDALO_CORE_URL',
		'get_label',
		'alert',
	])
		saved_globals[key] = globals[key];
	globals.window = globalThis;
	globals.SHOW_DEBUG = false;
	globals.SHOW_DEVELOPER = false;
	globals.DEDALO_CORE_URL = '/dedalo/core';
	globals.get_label = {};
	globals.alert = (message: string) => {
		alerts.push(String(message));
	};

	const portal_module = await import(
		join(CLIENT_ROOT, 'dedalo/core/component_portal/js/component_portal.js')
	);
	component_portal = portal_module.component_portal;
	const dnd_module = await import(
		join(CLIENT_ROOT, 'dedalo/core/component_portal/js/drag_and_drop.js')
	);
	on_drop = dnd_module.on_drop;
	const instances_module = await import(join(CLIENT_ROOT, 'dedalo/core/common/js/instances.js'));
	add_instance = instances_module.add_instance;
	delete_instance = instances_module.delete_instance;
});

afterAll(() => {
	for (const key of Object.keys(saved_globals)) {
		if (saved_globals[key] === undefined) delete globals[key];
		else globals[key] = saved_globals[key];
	}
});

// ────────────────────────────────────────────────────────────────────────────────────
// THE FAKE SAVE DOOR.
//
// A model of the two server rules this contract turns on, and of nothing else:
//
//   1. `save_component.ts` applies `changed_data` IN ORDER over one mutating `items`
//      array (remove at :1265, insert below it), and it DROPS a refused relation insert
//      (`if (validated === null) continue;`) instead of failing the save. That drop is
//      exactly what makes "destroy, then fail to create" reachable in one transaction.
//   2. `relations/save.ts` refuseByPickerConstraint judges the count the set would
//      RESULT in against the selection limit — which is why removes-first passes a
//      `data_limit:1` replace and inserts-first does not.
//
// Everything it receives is first run through the REAL `unnamedRemoveRefusal`, the
// predicate the API door itself calls, so an id-less remove is refused here by the
// production function and not by a local guess.
// ────────────────────────────────────────────────────────────────────────────────────
class FakeSaveDoor {
	items: Array<{ id: number; locator: Locator }> = [];
	next_id = 100;
	/** Every `changed_data` batch this door received, in order. */
	batches: ChangedData[] = [];
	/** Model of a server-side pick refusal (non-selectable term, unreadable target…). */
	refuse_insert: (locator: Locator) => boolean = () => false;
	/** Model of relations/save.ts gate 4; null = uncapped. */
	selection_limit: number | null = null;
	/** Set when the REAL unnamedRemoveRefusal rejected a batch. */
	door_refusals: string[] = [];

	constructor(public tipo: string) {}

	seed(locator: Locator, id: number): Locator {
		this.items.push({ id, locator: { ...locator, id } });
		if (id >= this.next_id) this.next_id = id + 1;
		return { ...locator, id };
	}

	entries(): Locator[] {
		return this.items.map((item) => ({ ...item.locator, id: item.id }));
	}

	/** Applies one batch. Returns the data_manager envelope shape the client reads. */
	apply(changed_data: ChangedData): unknown {
		this.batches.push(changed_data);

		// THE REAL SERVER DOOR, called first, exactly as the API handler calls it.
		const refusal = unnamedRemoveRefusal(
			changed_data as unknown as Parameters<typeof unnamedRemoveRefusal>[0],
		);
		if (refusal !== null) {
			this.door_refusals.push(refusal);
			return { ok: false, data: null };
		}

		for (const change of changed_data) {
			if (change.action === 'remove') {
				const index = this.items.findIndex((item) => item.id === Number(change.id));
				// save_component.ts:1293 — PHP fails the save when the id does not exist.
				if (index === -1) return { ok: false, data: null };
				this.items.splice(index, 1);
				continue;
			}
			if (change.action === 'insert') {
				const locator = change.value as Locator;
				// relations/save.ts gate 4: the RESULTING count is what is judged.
				if (this.selection_limit !== null && this.items.length + 1 > this.selection_limit) continue;
				if (this.refuse_insert(locator)) continue;
				this.items.push({ id: this.next_id++, locator: { ...locator, id: this.next_id - 1 } });
			}
		}
		return {
			ok: true,
			data: { data: [{ tipo: this.tipo, pagination: { total: this.items.length } }] },
		};
	}
}

/**
 * A portal instance carrying the REAL prototype. Only the two seams a unit gate cannot
 * own are replaced: `change_value` (the network) and `refresh` (the render layer, here
 * a re-read of the store so the compensating re-link sees post-save truth, which is
 * what the production refresh gives it).
 */
function make_portal(options: {
	id: string;
	tipo: string;
	door: FakeSaveDoor;
	properties?: Record<string, unknown>;
}): PortalInstance {
	const instance = Object.create(component_portal.prototype) as PortalInstance;
	instance.id = options.id;
	instance.tipo = options.tipo;
	instance.model = 'component_portal';
	instance.mode = 'edit';
	instance.context = { properties: options.properties ?? {} };
	instance.node = { classList: { add: () => undefined, remove: () => undefined } };
	instance.data = { entries: options.door.entries() };
	instance.total = options.door.items.length;
	instance.change_value = async ({ changed_data }) => options.door.apply(changed_data);
	instance.refresh = async () => {
		instance.data.entries = options.door.entries();
		instance.total = options.door.items.length;
		return true;
	};
	return instance;
}

function drag_event(payload: unknown) {
	return {
		preventDefault: () => undefined,
		stopPropagation: () => undefined,
		dataTransfer: { getData: () => JSON.stringify(payload) },
	};
}
const drop_node = { classList: { remove: () => undefined, add: () => undefined } };

const registered_keys: string[] = [];
function register(key: string, instance: unknown): void {
	add_instance(key, instance);
	registered_keys.push(key);
}
afterEach(() => {
	while (registered_keys.length > 0) delete_instance(registered_keys.pop() as string);
	alerts = [];
});

// ────────────────────────────────────────────────────────────────────────────────────
describe('P0-11 flow 1 — cross-portal move (drag_and_drop.on_drop)', () => {
	function build() {
		const source_door = new FakeSaveDoor('zzrelmv_source');
		const target_door = new FakeSaveDoor('zzrelmv_target');
		const stored = source_door.seed({ section_tipo: 'zzrelmv10', section_id: '5' }, 7);
		const source = make_portal({
			id: 'source_instance',
			tipo: 'zzrelmv_source',
			door: source_door,
		});
		const target = make_portal({
			id: 'target_instance',
			tipo: 'zzrelmv_target',
			door: target_door,
		});
		register('zz_client_relation_move_source', source);
		return { source_door, target_door, source, target, stored };
	}
	function drop_payload(locator: Locator) {
		return {
			source_tipo: 'zzrelmv_source',
			source_id: 'source_instance',
			draggable_to: ['zzrelmv_target'],
			locator: locator,
			paginated_key: 0,
		};
	}

	test('ACCEPTANCE: the record lands in the target and the source is unlinked by ID', async () => {
		const { source_door, target_door, target, stored } = build();

		const result = await on_drop(drop_node, drag_event(drop_payload({ ...stored })), {
			caller: target,
		});

		expect(result).toBe(true);
		// the new value is stored in the target…
		expect(target_door.items).toHaveLength(1);
		expect(target_door.items[0]?.locator.section_id).toBe('5');
		expect(target_door.items[0]?.locator.from_component_tipo).toBe('zzrelmv_target');
		// …and the source no longer holds it, removed by a change that NAMES the id.
		expect(source_door.items).toHaveLength(0);
		expect(source_door.batches).toHaveLength(1);
		expect(source_door.batches[0]).toEqual([{ action: 'remove', id: 7, value: null }]);
		// the real server door accepted every batch — no id-less remove was ever sent.
		expect(source_door.door_refusals).toEqual([]);
		expect(alerts).toEqual([]);
	});

	test('REFUSAL: THE SOURCE RELATION STILL EXISTS and the operator is told', async () => {
		const { source_door, target_door, target, stored } = build();
		// the target's save refuses the insert (non-selectable target, cap, …)
		target_door.refuse_insert = () => true;

		const result = await on_drop(drop_node, drag_event(drop_payload({ ...stored })), {
			caller: target,
		});

		expect(result).toBe(false);
		// THE ASSERTION THIS WHOLE FILE EXISTS FOR.
		expect(source_door.items).toHaveLength(1);
		expect(source_door.items[0]?.id).toBe(7);
		expect(source_door.items[0]?.locator.section_id).toBe('5');
		// the destructive door was never even opened
		expect(source_door.batches).toHaveLength(0);
		// nothing was created in the target either
		expect(target_door.items).toHaveLength(0);
		// and the gesture is not left looking successful
		expect(alerts).toHaveLength(1);
	});

	test('a dragged locator with NO id never reaches the wire as an id-less remove', async () => {
		const { source_door, target_door, target, stored } = build();
		const id_less = { ...stored };
		id_less.id = null;

		const result = await on_drop(drop_node, drag_event(drop_payload(id_less)), { caller: target });

		expect(result).toBe(false);
		// the link DID land — this is the belt-and-braces half: the target holds it…
		expect(target_door.items).toHaveLength(1);
		// …and the source was never asked to remove anything at all.
		expect(source_door.batches).toHaveLength(0);
		expect(source_door.items).toHaveLength(1);
		expect(source_door.door_refusals).toEqual([]);
	});
});

// ────────────────────────────────────────────────────────────────────────────────────
describe('P0-11 flow 2 — data_limit:1 picker replace (component_portal.link_records)', () => {
	function build() {
		const door = new FakeSaveDoor('zzrelmv_portal');
		door.selection_limit = 1;
		const stored = door.seed({ section_tipo: 'zzrelmv10', section_id: '5' }, 11);
		const portal = make_portal({
			id: 'portal_instance',
			tipo: 'zzrelmv_portal',
			door,
			properties: { data_limit: 1 },
		});
		let refreshes = 0;
		const real_refresh = portal.refresh;
		portal.refresh = async (opts?: unknown) => {
			refreshes++;
			return real_refresh(opts);
		};
		const picked: Locator = { section_tipo: 'zzrelmv10', section_id: '9' };
		return { door, portal, stored, picked, refreshed: () => refreshes };
	}

	test('ACCEPTANCE: one save, removes THEN inserts, new value stored, nothing refused', async () => {
		const { door, portal, stored, picked, refreshed } = build();

		const outcome = await portal.link_records([picked], {
			enforce_client_data_limit: false,
			replace_entries: [stored],
		});

		expect(outcome.refused).toEqual([]);
		expect(outcome.linked).toHaveLength(1);
		// ONE save carried the whole replace, removes first.
		expect(door.batches).toHaveLength(1);
		expect((door.batches[0] as ChangedData).map((c) => c.action)).toEqual(['remove', 'insert']);
		expect((door.batches[0] as ChangedData)[0]?.id).toBe(11);
		// the new value is what the component now holds
		expect(door.items).toHaveLength(1);
		expect(door.items[0]?.locator.section_id).toBe('9');
		// and the view was refreshed — the mis-report regression returned before this.
		expect(refreshed()).toBeGreaterThan(0);
	});

	test('the removes-first ORDER is load-bearing: inserts-first destroys the value', async () => {
		// Not a test of the client — a test of the reason the client emits that order.
		// The same batch, reordered, against the same resulting-count selection cap.
		const door = new FakeSaveDoor('zzrelmv_portal');
		door.selection_limit = 1;
		door.seed({ section_tipo: 'zzrelmv10', section_id: '5' }, 11);

		door.apply([
			{ action: 'insert', id: null, value: { section_tipo: 'zzrelmv10', section_id: '9' } },
			{ action: 'remove', id: 11, value: null },
		]);

		// the insert was refused as over-cap (resulting count 2 > 1), the remove stood.
		expect(door.items).toHaveLength(0);
	});

	test('REFUSAL: reported as replace_failed, and THE PREVIOUS VALUE IS BACK', async () => {
		const { door, portal, stored, picked } = build();
		// the server refuses the picked term only
		door.refuse_insert = (locator) => locator.section_id === '9';

		const outcome = await portal.link_records([picked], {
			enforce_client_data_limit: false,
			replace_entries: [stored],
		});

		expect(outcome.linked).toEqual([]);
		expect(outcome.refused).toHaveLength(1);
		// never 'duplicate': what happened is a deletion, and it must be named as one.
		expect(outcome.refused[0]?.reason.startsWith('replace_failed')).toBe(true);
		expect(outcome.refused[0]?.reason).toContain('the previous value was restored');
		// THE CURATED RELATION IS STILL THERE (re-linked; a NEW item id, by design —
		// the client strips `id` so the server mints one it owns).
		expect(door.items).toHaveLength(1);
		expect(door.items[0]?.locator.section_id).toBe('5');
	});

	test('REFUSAL whose compensation also fails is reported as unrestorable, not silent', async () => {
		const { door, portal, stored, picked } = build();
		// nothing can be inserted any more — the old target became unreadable too.
		door.refuse_insert = () => true;

		const outcome = await portal.link_records([picked], {
			enforce_client_data_limit: false,
			replace_entries: [stored],
		});

		expect(outcome.linked).toEqual([]);
		expect(outcome.refused[0]?.reason).toContain('COULD NOT BE RESTORED');
		expect(door.items).toHaveLength(0);
	});

	test('a replace_entry without a usable id is refused BEFORE anything is written', async () => {
		for (const bad_id of [null, undefined, 0, '', 'x']) {
			const { door, portal, stored, picked } = build();
			const bad_entry = { ...stored, id: bad_id as number | string | null };

			const outcome = await portal.link_records([picked], {
				enforce_client_data_limit: false,
				replace_entries: [bad_entry],
			});

			expect(outcome.linked).toEqual([]);
			expect(outcome.refused.map((r) => r.reason)).toEqual(['replace_entry_without_id']);
			// ZERO saves: the guard fires before the wire, not after.
			expect(door.batches).toHaveLength(0);
			expect(door.items).toHaveLength(1);
		}
	});
});

// ────────────────────────────────────────────────────────────────────────────────────
describe('the server premise the client id-guards rest on', () => {
	// If this relaxes, the client guards above stop being belt-and-braces and become
	// the only thing between a curator and an emptied component. A comment that states
	// a false premise is a defect here, so the premise is pinned mechanically.
	test("save_component.ts still refuses an id-less 'remove'", () => {
		expect(unnamedRemoveRefusal([{ action: 'remove', id: null, value: null }])).toContain(
			'must name the item id',
		);
		expect(unnamedRemoveRefusal([{ action: 'remove', id: undefined, value: null }])).not.toBeNull();
		expect(unnamedRemoveRefusal([{ action: 'remove', id: '', value: null }])).not.toBeNull();
		expect(unnamedRemoveRefusal([{ action: 'remove', id: 7, value: null }])).toBeNull();
	});
});

// ────────────────────────────────────────────────────────────────────────────────────
// THE CENSUS — TOTAL over client/ and tools/ ** /js, derived from the tree, never a list.
//
// A `link_record` / `link_records` call whose answer is thrown away is the P0-11 shape
// in miniature: both functions REPORT refusals instead of throwing, so a discarded
// return value is a refusal nobody will ever see. The rule is mechanical: the call
// expression may not START a statement.
// ────────────────────────────────────────────────────────────────────────────────────

/**
 * SHRINK-ONLY. Every entry is a live discarded-answer call site that this change did
 * not own. A file whose count DROPS is red too — fix it and delete its row.
 */
const DISCARDED_ANSWER_EXEMPTIONS: ReadonlyArray<{ path: string; count: number; reason: string }> =
	[
		{
			path: 'client/dedalo/core/component_text_area/js/render_reference.js',
			count: 1,
			reason:
				'Apply-reference awaits component_tags_reference.link_record(new_locator) and drops the answer. ' +
				'A `false` there means the locator did not land (duplicate, data_limit, or a server refusal), yet the ' +
				'code continues and stamps the reference attribute onto the text span regardless — the text then ' +
				'points at a relation the record does not hold. Not destructive, so not P0-11, but the same ' +
				'discarded-answer shape. Owned by the component_text_area reference flow, not by this change.',
		},
		{
			path: 'client/dedalo/core/services/service_autocomplete/js/view_default_autocomplete.js',
			count: 1,
			reason:
				'The default autocomplete click does `self.caller?.link_record(value)` with an explicit ' +
				'"Don\'t wait here" comment: not awaited, answer discarded, and the service then clears the input ' +
				'and hides itself. A refused pick (data_limit, duplicate, server refusal) is therefore reported to ' +
				'nobody and the operator sees the picker close as if it had worked. Owned by the autocomplete ' +
				'service, not by this change.',
		},
	];

/** Every .js file under client/, plus tools/ ** /js/. Derived by walking the tree. */
function census_files(): string[] {
	const found: string[] = [];
	const walk = (dir: string, keep: (file: string) => boolean): void => {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
				walk(full, keep);
				continue;
			}
			if (entry.endsWith('.js') && keep(full)) found.push(full);
		}
	};
	walk(CLIENT_ROOT, () => true);
	walk(TOOLS_ROOT, (file) => file.includes(`${'/'}js${'/'}`));
	return found.sort();
}

/**
 * Does this line DISCARD the answer? Yes when the call expression starts the statement:
 * the trimmed line, with a leading `await ` removed, begins with the callee chain.
 * A line that opens with `const`, `let`, `return`, `if (`, `=`, … consumes it.
 */
const CALL_RE = /\.link_records?\s*\(/;
const DISCARDS_RE = /^[\w$.?()[\]'"]*\.link_records?\s*\(/;
function discards(line: string): boolean {
	const trimmed = line.trim();
	// comments and docblocks are prose, not call sites
	if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return false;
	if (!CALL_RE.test(trimmed)) return false;
	const statement = trimmed.startsWith('await ') ? trimmed.slice(6).trim() : trimmed;
	return DISCARDS_RE.test(statement);
}

describe('census: no link_record/link_records call site discards its answer', () => {
	test('the census is total and the exemption list is exactly the live discards', () => {
		const counts = new Map<string, number>();
		for (const file of census_files()) {
			const lines = readFileSync(file, 'utf8').split('\n');
			let n = 0;
			for (const line of lines) if (discards(line)) n++;
			if (n > 0) counts.set(relative(REPO_ROOT, file), n);
		}

		const declared = new Map(DISCARDED_ANSWER_EXEMPTIONS.map((e) => [e.path, e.count]));
		const unexpected = [...counts].filter(([path, n]) => (declared.get(path) ?? 0) !== n);
		const stale = [...declared].filter(([path, n]) => (counts.get(path) ?? 0) !== n);

		expect({ unexpected, stale }).toEqual({ unexpected: [], stale: [] });
	});

	test('the census actually scans the files that hold the fixed call sites', () => {
		// A census that silently matched nothing would be green and worthless.
		const files = census_files().map((f) => relative(REPO_ROOT, f));
		expect(files).toContain('client/dedalo/core/component_portal/js/drag_and_drop.js');
		expect(files).toContain('client/dedalo/core/component_portal/js/component_portal.js');
		expect(files.some((f) => f.startsWith('tools/'))).toBe(true);
		// and that its discard rule can actually fire
		expect(discards('\t\t\tself.caller?.link_record(value)')).toBe(true);
		expect(discards('\t\t\tawait component_tags_reference.link_record(new_locator);')).toBe(true);
		expect(discards('\t\t\tconst outcome = await self.link_records([data_parse.locator])')).toBe(
			false,
		);
		expect(discards('*  - Default (no custom event): calls self.caller.link_record(locator)')).toBe(
			false,
		);
	});
});
