/**
 * TYPE PROMOTION — the WRITE path's five refused shortcuts.
 *
 * Promotion turns "these thirty coins are the same thing" into data: a canonical
 * Type record and thirty ordinary component saves pointing at it. The saves
 * themselves are deliberately not special (`change_value`, the tool_cataloging
 * precedent), which is exactly why everything AROUND them has to be exact — a
 * bulk write is a bulk mistake, and a bulk mistake reported as a success is
 * worse than one reported as a failure.
 *
 * This gate covers the five ways that went wrong (adversarial review of the
 * promotion path). Each test states the scenario it refuses:
 *
 *  A1  A FOREIGN SECTION'S COMPONENT OFFERED AS THE WRITABLE TYPE LINK.
 *      `typeLinkCandidates` read `path[0].component_tipo` without checking
 *      `path[0].section_tipo` — and a profile covers SEVERAL sections
 *      (`sectionTipos`), so a criterion entering through the numismatic
 *      inventory's portal was emitted as the writable link for the coin
 *      section, whose records do not have that component at all. Its sibling
 *      `resolveAcceptTarget` had always checked exactly this
 *      (`foreign_section`): one file, two answers. Now one rule.
 *  A2  A HAND-TYPED TYPE ID THAT NAMES NOTHING. The Check button armed the
 *      confirm step on a title lookup that renders "tipo / id" for a hit and a
 *      miss alike, so `4321` for `432` wrote thirty locators onto a record that
 *      does not exist (a portal insert does not check its target). The server
 *      now answers existence AND readability, and only `exists:true` may arm.
 *  A3  'attached' DERIVED FROM THE ENVELOPE MERELY BEING OK, and 'already'
 *      derived from the LOADED PORTAL PAGE. A member whose existing link sat on
 *      page 2 was reported attached with nothing written. The outcome is now
 *      the server's echoed total, the same signal component_portal.link_record
 *      uses.
 *  A4  A RUN THAT ONLY DISABLED CONFIRM AND CANCEL. The review button
 *      (`stage.replaceChildren()`) and the promote toggle stayed live: clicking
 *      review mid-run detached the node the outcomes were being written into
 *      and allowed a second concurrent attach over the same members.
 *  A5  `data_limit` BYPASSED. It is a client-side guard inside
 *      `component_portal.link_record`; this path calls `change_value` directly,
 *      so a Type-link portal with `data_limit: 1` silently took a second
 *      locator — not "indistinguishable from a hand-entered value", which is
 *      the whole contract the bulk path is built on.
 *
 * The client half is vanilla JS with no type checking, so the decisions live in
 * a dependency-free leaf module (`tools/tool_identify/js/promote_rules.js`) that
 * is imported and exercised here directly — the posture
 * `test/unit/search_preset_scope.test.ts` set for client leaf modules — plus
 * source gates that keep the call sites from drifting back inline.
 *
 * WRITES NOTHING: every server case runs on injected fakes.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiRequestContext } from '../../src/core/api/dispatch.ts';
import {
	buildResolveTypeLink,
	type IdentifyTypeLinkDeps,
	typeLinkCandidates,
} from '../../src/core/api/handlers/dd_identify_api.ts';
import type { ApiResult } from '../../src/core/api/response.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import type { Criterion, IdentificationProfile } from '../../src/core/identify/types.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	attach_outcome,
	data_limit_refusal,
	lock_flow_controls,
	server_total,
} from '../../tools/tool_identify/js/promote_rules.js';

const REPO_ROOT = join(import.meta.dir, '..', '..');

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

const rqo = (options: Record<string, unknown>): Rqo => ({ options }) as unknown as Rqo;

const ctx = (principal: Principal): ApiRequestContext =>
	({
		requestId: 'test',
		clientIp: '127.0.0.1',
		session: null,
		csrfCandidate: null,
		principal,
	}) as ApiRequestContext;

const body = (res: ApiResult): Record<string, unknown> => res.body.data as Record<string, unknown>;

const criterion = (overrides: Partial<Criterion> & Pick<Criterion, 'id' | 'path'>): Criterion => ({
	label: overrides.id,
	role: 'identifying',
	weight: 1,
	mode: 'same_locator',
	required: false,
	...overrides,
});

/**
 * A MULTI-SECTION profile — the shape that makes A1 reachable, and an ordinary
 * one: 'numisdata9' (the inventory entries) and 'numisdata4' (the coins) are
 * identified by the same curatorial rules and share one descriptor, so a
 * criterion may legitimately enter on EITHER of them.
 */
function twoSectionProfile(overrides: Partial<IdentificationProfile> = {}): IdentificationProfile {
	return {
		id: 'coins',
		label: 'Coins',
		sectionTipos: ['numisdata4', 'numisdata9'],
		typeSectionTipo: 'numisdata3',
		previewComponent: null,
		thresholds: { sameType: 0.8, candidate: 0.5 },
		exactSetIdentity: false,
		criteria: [
			// enters on the COIN section — a real Type link for numisdata4
			criterion({
				id: 'obverse_legend',
				path: [
					{ section_tipo: 'numisdata4', component_tipo: 'numisdata161' },
					{ section_tipo: 'numisdata3', component_tipo: 'numisdata40' },
				],
			}),
			// enters on the INVENTORY section — numisdata4 has no such component
			criterion({
				id: 'entry_type',
				path: [
					{ section_tipo: 'numisdata9', component_tipo: 'numisdata900' },
					{ section_tipo: 'numisdata3', component_tipo: 'numisdata40' },
				],
			}),
		],
		...overrides,
	};
}

function typeLinkDeps(overrides: Partial<IdentifyTypeLinkDeps> = {}): IdentifyTypeLinkDeps {
	return {
		loadProfile: async () => twoSectionProfile(),
		canReadSection: async () => true,
		componentGrant: async () => 2,
		componentModel: async () => 'component_portal',
		modelColumn: () => 'relation',
		labelComponent: async () => 'numisdata3_term',
		readValues: async () => ({ kind: 'text', values: ['Athena / palm'] }),
		scopeRecords: async (records) => records,
		recordExists: async () => true,
		...overrides,
	};
}

/* ══════════════ A1 — the writable link is a component of THIS section ══════════════ */

describe('A1 — a foreign section’s component is never offered as the Type link', () => {
	test('typeLinkCandidates only reveals criteria that ENTER on the asked-for section', () => {
		// The coin section: only its own criterion reveals a link component.
		expect(
			typeLinkCandidates(twoSectionProfile(), 'numisdata4').map((c) => c.componentTipo),
		).toEqual(['numisdata161']);
		// The inventory section: only ITS own. The two never cross.
		expect(
			typeLinkCandidates(twoSectionProfile(), 'numisdata9').map((c) => c.componentTipo),
		).toEqual(['numisdata900']);
	});

	test('resolve_type_link never emits the other section’s component as writable', async () => {
		const handler = buildResolveTypeLink(typeLinkDeps());
		const res = await handler(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER));
		const links = body(res).links as Record<string, unknown>[];
		// THE SCENARIO: a criterion that enters through numisdata9's portal must
		// not be handed to the panel as the field thirty numisdata4 records will
		// be written into — those records do not have it.
		expect(links.map((link) => link.component_tipo)).toEqual(['numisdata161']);
		expect(links.every((link) => link.section_tipo === 'numisdata4')).toBe(true);
	});

	test('a profile whose ONLY Type criterion belongs to a sibling section refuses, it does not guess', async () => {
		const handler = buildResolveTypeLink(
			typeLinkDeps({
				loadProfile: async () =>
					twoSectionProfile({
						criteria: [
							criterion({
								id: 'entry_type',
								path: [
									{ section_tipo: 'numisdata9', component_tipo: 'numisdata900' },
									{ section_tipo: 'numisdata3', component_tipo: 'numisdata40' },
								],
							}),
						],
					}),
			}),
		);
		// ENVELOPE v2: the decline is a THROWN `identify.no_link_component` (400).
		const outcome = await handler(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER)).then(
			(value) => ({ threw: false as const, value }),
			(error: unknown) => ({ threw: true as const, error }),
		);
		if (!outcome.threw) throw new Error(`expected a decline, got ${JSON.stringify(outcome.value)}`);
		expect(outcome.error).toBeInstanceOf(DedaloError);
		expect((outcome.error as DedaloError).code).toBe('identify.no_link_component');
		expect((outcome.error as DedaloError).spec.status).toBe(400);
	});
});

/* ══════════════ A2 — the Check confirms the record is really there ══════════════ */

describe('A2 — a hand-typed Type id is verified before it can arm a confirm', () => {
	test('no check asked, no answer invented', async () => {
		const handler = buildResolveTypeLink(typeLinkDeps());
		const res = await handler(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER));
		expect(body(res).type_record).toBeNull();
	});

	test('an id that names no record: exists:false, whoever is asking', async () => {
		// A GLOBAL ADMIN is the case the scope gate alone gets wrong: it answers
		// "yes, you may see it" about a record that was never created.
		const handler = buildResolveTypeLink(typeLinkDeps({ recordExists: async () => false }));
		const res = await handler(
			rqo({ section_tipo: 'numisdata4', check_type_id: 4321 }),
			ctx(SUPERUSER),
		);
		const check = body(res).type_record as Record<string, unknown>;
		expect(check.exists).toBe(false);
		expect(check.reason).toBe('not_found');
		expect(String(check.detail)).toContain('4321');
	});

	test('a record that exists but is outside the caller’s scope reads the same', async () => {
		const handler = buildResolveTypeLink(
			typeLinkDeps({ recordExists: async () => true, scopeRecords: async () => [] }),
		);
		const res = await handler(
			rqo({ section_tipo: 'numisdata4', check_type_id: 432 }),
			ctx(SUPERUSER),
		);
		const check = body(res).type_record as Record<string, unknown>;
		expect(check.exists).toBe(false);
		// Deliberately indistinguishable from "no such record": the difference is
		// an existence oracle for records outside the projects filter.
		expect(check.reason).toBe('not_found');
	});

	test('a real, readable record: exists:true and NAMED, so the confirm quotes a title', async () => {
		const handler = buildResolveTypeLink(typeLinkDeps());
		const res = await handler(
			rqo({ section_tipo: 'numisdata4', check_type_id: '432' }),
			ctx(SUPERUSER),
		);
		const check = body(res).type_record as Record<string, unknown>;
		expect(check).toMatchObject({
			section_tipo: 'numisdata3',
			section_id: 432,
			exists: true,
			label: 'Athena / palm',
			reason: 'ok',
		});
	});

	test('what is not a record id is refused as such, and never as a record', async () => {
		const handler = buildResolveTypeLink(typeLinkDeps());
		for (const raw of ['abc', 0, -3, '4.5.6']) {
			const res = await handler(
				rqo({ section_tipo: 'numisdata4', check_type_id: raw }),
				ctx(SUPERUSER),
			);
			const check = body(res).type_record as Record<string, unknown>;
			expect(check.exists).toBe(false);
			expect(check.reason).toBe('invalid_id');
		}
	});

	test('the check does not require members, so it costs no survey', async () => {
		let surveyed = 0;
		const handler = buildResolveTypeLink(
			typeLinkDeps({
				scopeRecords: async (records) => {
					surveyed += records.length;
					return records;
				},
			}),
		);
		await handler(rqo({ section_tipo: 'numisdata4', check_type_id: 432 }), ctx(SUPERUSER));
		// exactly one record scoped: the Type being checked
		expect(surveyed).toBe(1);
	});
});

/* ══════════════ A3 — the outcome is the server's answer ══════════════ */

describe('A3 — attach_outcome reports what the save DID, not that it returned', () => {
	// envelope v2 (ERRORS_SPEC §3): the payload is `data`, the component rows are
	// `data.data[]` — the compat `result` mirror is gone from the client reads.
	const ok = (total: number, tipo = 'numisdata161') => ({
		ok: true,
		data: { data: [{ tipo, pagination: { total, limit: 10, offset: 0 } }] },
	});

	test('THE SCENARIO: the existing link sits on page 2 — the total does not grow ⇒ already', () => {
		// The client saw 10 loaded entries, none of them the Type; the server holds
		// 47 and drops the duplicate, so the total is unchanged. Before this rule
		// the run reported 'attached' and NOTHING was written.
		expect(
			attach_outcome({
				api_response: ok(47),
				component_tipo: 'numisdata161',
				total_before: 47,
			}),
		).toMatchObject({ status: 'already' });
	});

	test('the total grew by one ⇒ attached', () => {
		expect(
			attach_outcome({
				api_response: ok(48),
				component_tipo: 'numisdata161',
				total_before: 47,
			}),
		).toEqual({ status: 'attached', detail: '' });
	});

	test('a truthy result with NO reported total is unconfirmed — never attached', () => {
		const outcome = attach_outcome({
			api_response: { ok: true, data: { data: [{ tipo: 'numisdata161' }] } },
			component_tipo: 'numisdata161',
			total_before: 47,
		});
		expect(outcome.status).toBe('unconfirmed');
		expect(outcome.detail).toContain('open the record');
	});

	test('the saved component is matched by TIPO: another component’s echo confirms nothing', () => {
		expect(
			attach_outcome({
				api_response: ok(48, 'some_other_component'),
				component_tipo: 'numisdata161',
				total_before: 47,
			}).status,
		).toBe('unconfirmed');
	});

	test('no total BEFORE is equally unconfirmable', () => {
		expect(
			attach_outcome({
				api_response: ok(1),
				component_tipo: 'numisdata161',
				total_before: null,
			}).status,
		).toBe('unconfirmed');
	});

	test('a component holding nothing after a “successful” save is a failure, not a link', () => {
		expect(
			attach_outcome({
				api_response: ok(0),
				component_tipo: 'numisdata161',
				total_before: 0,
			}).status,
		).toBe('failed');
	});

	test('a refusal travels with the server’s own words; a cancel says so', () => {
		expect(
			attach_outcome({
				api_response: {
					ok: false,
					error: {
						code: 'perm.out_of_scope',
						category: 'permission',
						message: 'Record is out of the user scope',
						label_key: 'error_perm_out_of_scope',
						retryable: false,
					},
				},
				component_tipo: 'numisdata161',
				total_before: 3,
			}),
		).toEqual({ status: 'failed', detail: 'Record is out of the user scope' });
		expect(
			attach_outcome({ api_response: false, component_tipo: 'numisdata161', total_before: 3 }),
		).toEqual({ status: 'failed', detail: 'the save was cancelled' });
	});

	test('a missing count is never read as zero', () => {
		// 0 would make every save look like a first link.
		expect(server_total({ pagination: { total: undefined } })).toBeNull();
		expect(server_total({ pagination: { total: 0 } })).toBe(0);
		expect(server_total(null)).toBeNull();
	});
});

/* ══════════════ A5 — the portal's own capacity rule is honoured ══════════════ */

describe('A5 — data_limit is honoured by the bulk path, or refused with the reason', () => {
	test('THE SCENARIO: a data_limit:1 Type portal that already holds one link', () => {
		const refusal = data_limit_refusal({ data_limit: 1, current_total: 1 });
		expect(refusal).not.toBeNull();
		expect(String(refusal)).toContain('at most 1');
		// It must SAY why, because by hand the same click gets an alert.
		expect(String(refusal)).toContain('refused');
	});

	test('room left, no limit declared, or no trustworthy count ⇒ no refusal', () => {
		expect(data_limit_refusal({ data_limit: 2, current_total: 1 })).toBeNull();
		expect(data_limit_refusal({ data_limit: null, current_total: 9 })).toBeNull();
		expect(data_limit_refusal({ data_limit: 0, current_total: 9 })).toBeNull();
		// unknown total: refusing on a guess would block a legitimate promotion
		expect(data_limit_refusal({ data_limit: 1, current_total: null })).toBeNull();
	});

	test('the count that decides is the WHOLE dataset, not a page', () => {
		// 1 loaded entry, 3 held: at a limit of 2 this must refuse.
		expect(data_limit_refusal({ data_limit: 2, current_total: 3 })).not.toBeNull();
	});
});

/* ══════════════ A4 — a run locks the whole flow ══════════════ */

/** A control that behaves like the DOM properties the lock touches. */
const control = (disabled = false): { disabled: boolean } => ({ disabled });

/** A block node with just enough surface for lock_flow_controls. */
function fakeBlock(controls: { disabled: boolean }[]): {
	querySelectorAll: () => { disabled: boolean }[];
	classList: { add: (name: string) => void; remove: (name: string) => void; names: string[] };
} {
	const names: string[] = [];
	return {
		querySelectorAll: () => controls,
		classList: {
			names,
			add: (name: string) => {
				names.push(name);
			},
			remove: (name: string) => {
				const index = names.indexOf(name);
				if (index > -1) names.splice(index, 1);
			},
		},
	};
}

describe('A4 — a promotion run freezes the whole promote block', () => {
	test('THE SCENARIO: review and the promote toggle are locked too, not just confirm/cancel', () => {
		const review = control();
		const promote_toggle = control();
		const confirm = control();
		const cancel = control();
		const block = fakeBlock([promote_toggle, review, confirm, cancel]);

		const unlock = lock_flow_controls(block);

		// Clicking review mid-run replaceChildren()s the stage the outcomes are
		// being written into, and starts a second concurrent attach.
		expect(review.disabled).toBe(true);
		expect(promote_toggle.disabled).toBe(true);
		expect(confirm.disabled).toBe(true);
		expect(cancel.disabled).toBe(true);
		expect(block.classList.names).toContain('identify_promote_running');

		unlock();
		expect([review, promote_toggle, confirm, cancel].every((c) => c.disabled === false)).toBe(true);
		expect(block.classList.names).not.toContain('identify_promote_running');
	});

	test('a control that was ALREADY disabled stays disabled after the run', () => {
		const already_off = control(true);
		const live = control();
		const unlock = lock_flow_controls(fakeBlock([already_off, live]));
		unlock();
		expect(already_off.disabled).toBe(true);
		expect(live.disabled).toBe(false);
	});

	test('unlock is idempotent, and a missing block is not a crash', () => {
		const live = control();
		const unlock = lock_flow_controls(fakeBlock([live]));
		unlock();
		live.disabled = true; // e.g. the confirm button removed/disabled afterwards
		unlock();
		expect(live.disabled).toBe(true);
		expect(() => lock_flow_controls(null)()).not.toThrow();
	});
});

/* ══════════════ the call sites cannot drift back ══════════════ */

const read = (file: string): string => readFileSync(join(REPO_ROOT, file), 'utf-8');

describe('the promotion client uses these rules, and decides nothing itself', () => {
	test('attach_members derives its outcome and its capacity check from promote_rules', () => {
		const source = read('tools/tool_identify/js/tool_identify.js');
		expect(source).toContain("from './promote_rules.js'");
		expect(source).toContain('attach_outcome({');
		expect(source).toContain('data_limit_refusal({');
		// the old shortcut: 'attached' asserted by the client on a truthy result
		expect(source).not.toContain("outcome.status\t= 'attached'");
	});

	test('the Check asks the server, and arms nothing on its own', () => {
		const source = read('tools/tool_identify/js/render_tool_identify_clusters.js');
		expect(source).toContain('self.check_type_record(');
		expect(source).toContain('checked.exists!==true');
		// the old shortcut: the typed locator accepted unconditionally
		expect(source).not.toContain(
			'const labels = await self.resolve_labels([locator])\n\t\t\t\tself.labels',
		);
	});

	test('both write runs — confirm and retry — lock the whole block', () => {
		const source = read('tools/tool_identify/js/render_tool_identify_clusters.js');
		const locks = source.match(/lock_flow_controls\(/g) ?? [];
		expect(locks.length).toBe(2);
		// the block, not the button that was pressed
		expect(source).toContain("closest('.identify_promote')");
		// and always released
		expect((source.match(/unlock\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
	});

	test('the tool ships the rules module it imports (staleness self-test)', () => {
		expect(read('tools/tool_identify/js/promote_rules.js')).toContain(
			'export const attach_outcome',
		);
	});
});
