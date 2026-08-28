/**
 * EXPORT GATE B — the per-DDO component read grant, BEHAVIOURALLY.
 *
 * WHAT IT GUARDS. `exportGridUnified` (src/diffusion/export/grid.ts) re-applies
 * the read path's authorization before it reads a record: Gate A on every SQO
 * target section, Gate B on every exported ddo-path segment. Gate B is, in the
 * code's own words, the only thing between an authenticated non-admin and the
 * dd128 → dd133 password hashes and the dd996 API keys — neither is
 * projects-gated, so the record selection does not narrow them. The material it
 * releases converts directly into write access to the whole catalogue.
 *
 * WHY THIS FILE EXISTS (SEC-01 + GATE-24, deep audit 2026-08-26; TOOLS-02
 * re-opened). Two defects, one fix:
 *
 *  1. Gate B ran only inside
 *     `typeof seg.section_tipo === 'string' && typeof seg.component_tipo === 'string'`,
 *     so a segment whose `section_tipo` was absent, null or ARRAY-shaped was
 *     SKIPPED — not refused — while every consumer resolved it anyway:
 *     compile_columns maps a non-string to '' (which the resolver reads as "no
 *     section whitelist"), `resolveRecordAtoms` never reads the declared section
 *     at all, and the record guard in `buildEntries` reads the first step's
 *     section with explicit ARRAY TOLERANCE — so `['test3']` satisfied that
 *     guard while defeating the gate. Measured on this fixture before the fix:
 *     `[{section_tipo:['test3'], component_tipo:'test91'}]` returned `ok:true`
 *     for a principal holding level 0 on test91.
 *  2. Gate B's ONLY assertion in the whole tree was a source substring
 *     (`human_write_scope_tripwire.test.ts`: `src.includes('getPermissions(context.principal, seg.section_tipo, seg.component_tipo)')`).
 *     A substring cannot see the enclosing `typeof` guard, and it survives
 *     neutering: `< 1` → `< 0`, `if (false)` around the loop, `throw` → `continue`
 *     all leave it byte-identical and green. THIS file is the gate that reds on
 *     each of those three — verified, see MUTATION below.
 *
 * THE SITUATION IS BUILT, NOT BORROWED (generic `test` TLD law). The principal
 * is the synthetic ACL fixture's reader — a REAL non-admin resolved through
 * `resolvePrincipal`, whose profile grants `test3` = 1 and `test3.test92` = 1
 * and NOTHING on `test3.test91`. The non-degeneracy of that contrast is
 * asserted here (a fixture drift that granted test91, or that left the reader
 * at 0 on test92, would make every case below vacuous), and the record the
 * control exports is minted by this file in its own reserved id band with the
 * project locator the reader's dd170 resolves to — without it the projects
 * filter selects zero records and "it still emits" would assert nothing.
 *
 * MEASURED 2026-08-28 (12 tests, 29 expect() calls, green with the fix in place).
 * MUTATION, each applied alone to `src/diffusion/export/grid.ts` and reverted:
 *   `< 1` → `< 0`                          → 9 pass / 3 fail
 *   the segment loop neutered (`if (false)`)→ 6 pass / 6 fail
 *   the permission `throw` → `continue`     → 9 pass / 3 fail
 *   the whole SEC-01 normalization reverted → 7 pass / 5 fail
 *   and, in `permissions.ts`, ddoIsAuthorized's fail-CLOSED branch reverted to
 *   its `return true`                       → 11 pass / 1 fail
 * `human_write_scope_tripwire` — Gate B's only previous assertion — was RUN under
 * the first three and stayed 6 pass / 0 fail on every one of them.
 *
 * WHAT THE DEFECT ACTUALLY RELEASED, executed on this fixture before the fix:
 * the reader (level 0 on test91) posting
 * `path:[{section_tipo:['test3'], component_tipo:'test91'}]` got `ok:true` with
 * `rows:[{rec:'931501', c:{0:'Sí'}}]` — the restricted component's REAL value,
 * under a column keyed `test3_test91`. Not a theoretical bypass.
 *
 * Scratch band 931500-931599 (this file's own), swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	ddoIsAuthorized,
	getPermissions,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { toolExportGetExportGrid } from '../../tools/tool_export/server/tool_export.ts';
import {
	ACL_ADMIN_USER_ID,
	ACL_DENIED_COMPONENT,
	ACL_GRANTED_COMPONENT,
	ACL_GRANTED_SECTION,
	ACL_NON_ADMIN_USER_ID,
	ACL_PROJECT_ID,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { refusalOf } from '../helpers/refusal.ts';

/** The suite section the ACL fixture grants (`test3`) and its matrix table. */
const SECTION = ACL_GRANTED_SECTION;
const SECTION_TABLE = 'matrix_test';
/** test3's `component_filter` — the per-record projects gate the reader passes. */
const FILTER_COMPONENT = 'test101';
/** dd153 — the projects section a component_filter locator points into. */
const PROJECTS_SECTION = 'dd153';
/** dd64 — the yes/no list both test91 and test92 point into on a real record. */
const YES_NO_SECTION = 'dd64';
/** A SECOND, real section tipo — only ever the second element of an ambiguous
 * `section_tipo` array, never a target this file exports from. */
const USERS_SECTION = 'dd128';
/** This file's OWN scratch record (band 931500-931599, ≥ the 900000 floor). */
const SCRATCH_RECORD_ID = 931501;
const SCRATCH_ID_FLOOR = 900000;

/** A relation locator in the stored shape the suite's real records carry. */
const locator = (componentTipo: string, sectionTipo: string, sectionId: number) => ({
	id: 1,
	type: 'dd151',
	section_id: sectionId,
	section_tipo: sectionTipo,
	from_component_tipo: componentTipo,
});

/**
 * Mint the one record the CONTROL exports.
 *
 * It carries the fixture project on `test101` so the non-admin's per-record
 * projects filter selects it (the canonical playground records carry no
 * project at all, so without this the control would export zero records and
 * "the gate is not a blanket deny" would be satisfiable at empty-vs-empty),
 * plus real values on BOTH the granted and the denied component, so a run that
 * wrongly emits test91 emits an actual restricted value.
 */
async function installScratchRecord(): Promise<void> {
	await assertTestDatabase('export_gate_b_native');
	if (SCRATCH_RECORD_ID < SCRATCH_ID_FLOOR) {
		throw new Error(
			`export_gate_b_native: id ${SCRATCH_RECORD_ID} is below the scratch floor ${SCRATCH_ID_FLOOR} — refusing to touch an installed record`,
		);
	}
	await removeScratchRecord({ strict: false });
	const relation = {
		[FILTER_COMPONENT]: [locator(FILTER_COMPONENT, PROJECTS_SECTION, ACL_PROJECT_ID)],
		[ACL_GRANTED_COMPONENT]: [locator(ACL_GRANTED_COMPONENT, YES_NO_SECTION, 1)],
		[ACL_DENIED_COMPONENT]: [locator(ACL_DENIED_COMPONENT, YES_NO_SECTION, 1)],
	};
	await sql.unsafe(
		`INSERT INTO "${SECTION_TABLE}" ("section_tipo", "section_id", "relation", "data")
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			SECTION,
			SCRATCH_RECORD_ID,
			encodeForJsonb(relation),
			encodeForJsonb({ label: 'zzgateb01 export gate b', section_tipo: SECTION }),
		],
	);
}

/** Sweep it. A sweep that deletes nothing means the filter is wrong (strict). */
async function removeScratchRecord({ strict = true }: { strict?: boolean } = {}): Promise<void> {
	const deleted = (await sql.unsafe(
		`DELETE FROM "${SECTION_TABLE}" WHERE section_tipo = $1 AND section_id = $2 RETURNING section_id`,
		[SECTION, SCRATCH_RECORD_ID],
	)) as unknown[];
	if (strict && deleted.length === 0) {
		throw new Error(
			`export_gate_b_native: the sweep deleted 0 rows for ${SECTION}/${SCRATCH_RECORD_ID} — the filter is wrong, so the suite database keeps scratch residue`,
		);
	}
}

const contextOf = (options: Record<string, unknown>, principal: Principal): ToolActionContext =>
	({ principal, userId: principal.userId, options, background: false }) as ToolActionContext;

/**
 * One export request over the fixture record, with the given ddo path.
 *
 * The refusal cases ride the DEFAULT 'value' format — the one the SEC-01 leak
 * was measured in. The two emission controls ask for 'dedalo_raw' instead,
 * because the granted component is a `component_publication`, which declares no
 * export VALUE resolver (the grid reports it under `unresolved` and the cell
 * comes out empty): 'value' could only prove "no refusal", while the raw dump
 * puts the component's stored data in the cell, so the control proves the
 * authorized caller really does receive the material.
 */
const exportOf = (path: unknown[], dataFormat = 'value'): Record<string, unknown> => ({
	section_tipo: SECTION,
	lang: 'lg-spa',
	data_format: dataFormat,
	breakdown: 'default',
	ar_ddo_to_export: [{ path }],
	sqo: { section_tipo: [SECTION], limit: 10, offset: 0 },
});

/** The emitted grid, narrowed to what an emission assertion needs. */
const gridOf = (response: ToolResponse) =>
	response.data as {
		columns?: { key?: string }[];
		rows?: { rec?: string; c?: Record<string, unknown> }[];
		end?: { records?: number };
	};

/**
 * The CELLS the fixture record contributed, by column ordinal — the emission
 * assertion. Keyed on THIS file's record rather than on a count, so a stray
 * row left by another file can neither satisfy nor break it.
 */
const scratchCellsOf = (response: ToolResponse): Record<string, unknown> => {
	const row = (gridOf(response).rows ?? []).find(
		(candidate) => String(candidate.rec) === String(SCRATCH_RECORD_ID),
	);
	return row?.c ?? {};
};

describe.if(DB_READY)('export Gate B — an unauthorized ddo segment is REFUSED', () => {
	let reader: Principal;
	let admin: Principal;

	beforeAll(async () => {
		await installAclIdentityFixture();
		await installScratchRecord();
		reader = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
		admin = await resolvePrincipal(ACL_ADMIN_USER_ID);
	});
	afterAll(async () => {
		await removeScratchRecord();
		await removeAclIdentityFixture();
	});

	test('the contrast is non-degenerate: the reader holds ≥1 on one component and 0 on the other', async () => {
		expect(reader.isGlobalAdmin).toBe(false);
		expect(await getPermissions(reader, SECTION, ACL_GRANTED_COMPONENT)).toBeGreaterThanOrEqual(1);
		expect(await getPermissions(reader, SECTION, ACL_DENIED_COMPONENT)).toBe(0);
		// Gate A must PASS for this principal, or every refusal below could be
		// Gate A's and Gate B would never run.
		expect(await getPermissions(reader, SECTION, SECTION)).toBeGreaterThanOrEqual(1);
	});

	test('(c) CONTROL — a plain-string authorized segment still EMITS the record', async () => {
		const response = await toolExportGetExportGrid(
			contextOf(
				exportOf([{ section_tipo: SECTION, component_tipo: ACL_GRANTED_COMPONENT }], 'dedalo_raw'),
				reader,
			),
		);
		expect(response.ok).toBe(true);
		const grid = gridOf(response);
		// The fixture record survived the projects filter, minted its column and
		// carried a VALUE: the gate refuses the unauthorized, never the
		// authorized. (An `ok:true` alone would also be true of an export that
		// selected nothing — which is what this principal gets without the
		// project locator the fixture record carries.)
		expect((grid.columns ?? []).map((column) => column.key)).toContain(
			`${SECTION}_${ACL_GRANTED_COMPONENT}`,
		);
		expect(String(Object.values(scratchCellsOf(response))[0] ?? '')).toContain(
			ACL_GRANTED_COMPONENT,
		);
	});

	test('(a) an ARRAY-shaped section_tipo on an unauthorized component is refused', async () => {
		// `typeof ['test3'] === 'string'` is false — the pre-fix loop body never
		// ran and the restricted value was emitted. The record guard in
		// buildEntries reads this same first-step section with array tolerance,
		// so the shape resolves; the gate now reads it the same way.
		const refusal = await refusalOf(
			toolExportGetExportGrid(
				contextOf(
					exportOf([{ section_tipo: [SECTION], component_tipo: ACL_DENIED_COMPONENT }]),
					reader,
				),
			),
		);
		expect(refusal.code).toBe('perm.denied');
	});

	test('(b) an ABSENT section_tipo on a DEEP segment is refused', async () => {
		const refusal = await refusalOf(
			toolExportGetExportGrid(
				contextOf(
					exportOf([
						{ section_tipo: SECTION, component_tipo: ACL_GRANTED_COMPONENT },
						{ component_tipo: ACL_DENIED_COMPONENT },
					]),
					reader,
				),
			),
		);
		expect(refusal.code).toBe('perm.denied');
	});

	test('an ABSENT section_tipo on the FIRST segment is refused too', async () => {
		const refusal = await refusalOf(
			toolExportGetExportGrid(
				contextOf(exportOf([{ component_tipo: ACL_DENIED_COMPONENT }]), reader),
			),
		);
		expect(refusal.code).toBe('perm.denied');
	});

	test('a null / non-string section_tipo is refused (no shape is a free pass)', async () => {
		for (const shape of [null, 42, { evil: true }, [], ['']]) {
			const refusal = await refusalOf(
				toolExportGetExportGrid(
					contextOf(
						exportOf([{ section_tipo: shape, component_tipo: ACL_GRANTED_COMPONENT }]),
						reader,
					),
				),
			);
			expect(refusal.code).toBe('perm.denied');
		}
	});

	test('a non-string component_tipo is refused (the same reading, both fields)', async () => {
		// `String(['test91'])` is 'test91', so atoms.ts resolves a one-element
		// array component_tipo exactly like the string — the gate must too.
		for (const shape of [undefined, null, [ACL_DENIED_COMPONENT]]) {
			const refusal = await refusalOf(
				toolExportGetExportGrid(
					contextOf(exportOf([{ section_tipo: SECTION, component_tipo: shape }]), reader),
				),
			);
			expect(refusal.code).toBe('perm.denied');
		}
	});

	test('the PLAIN-STRING denied pair is refused (the TOOLS-02 case itself)', async () => {
		const refusal = await refusalOf(
			toolExportGetExportGrid(
				contextOf(
					exportOf([{ section_tipo: SECTION, component_tipo: ACL_DENIED_COMPONENT }]),
					reader,
				),
			),
		);
		expect(refusal.code).toBe('perm.denied');
	});

	test('the guard is NOT a blanket array refusal: an array-shaped AUTHORIZED segment emits', async () => {
		// The eagerness control. Normalization takes the first element — the
		// reading ddoIsAuthorized and the buildEntries record guard already
		// apply — so an array whose target the caller may read still exports.
		const response = await toolExportGetExportGrid(
			contextOf(
				exportOf(
					[{ section_tipo: [SECTION], component_tipo: ACL_GRANTED_COMPONENT }],
					'dedalo_raw',
				),
				reader,
			),
		);
		expect(response.ok).toBe(true);
		expect(String(Object.values(scratchCellsOf(response))[0] ?? '')).toContain(
			ACL_GRANTED_COMPONENT,
		);
	});

	test('a MULTI-ELEMENT section_tipo array is refused even on an AUTHORIZED component', async () => {
		// The re-open this closes: normalization takes `value[0]`, and nothing
		// stops the next reader taking `value.at(-1)` — a gate that authorizes
		// `a` while the walk resolves `b` is the S1 all over again. `['a','b']`
		// names no ONE pair, so the AMBIGUITY itself is refused, not resolved.
		// The component here is the GRANTED one and the first array element is a
		// section the caller may read: the refusal can only come from the arity.
		const refusal = await refusalOf(
			toolExportGetExportGrid(
				contextOf(
					exportOf([
						{ section_tipo: [SECTION, USERS_SECTION], component_tipo: ACL_GRANTED_COMPONENT },
					]),
					reader,
				),
			),
		);
		expect(refusal.code).toBe('perm.denied');
		// …and the message names the AMBIGUOUS shape, not a missing grant — the
		// two refusals are different facts and an operator must be able to tell
		// them apart.
		expect(refusal.message).toContain('no resolvable');
	});

	test('a MULTI-ELEMENT component_tipo array is refused too (same reading, both fields)', async () => {
		const refusal = await refusalOf(
			toolExportGetExportGrid(
				contextOf(
					exportOf([
						{
							section_tipo: SECTION,
							component_tipo: [ACL_GRANTED_COMPONENT, ACL_DENIED_COMPONENT],
						},
					]),
					reader,
				),
			),
		);
		expect(refusal.code).toBe('perm.denied');
		expect(refusal.message).toContain('no resolvable');
	});

	test('a GLOBAL ADMIN is exempt by design (the refusal is scoped, not universal)', async () => {
		const response = await toolExportGetExportGrid(
			contextOf(
				exportOf([{ section_tipo: [SECTION], component_tipo: ACL_DENIED_COMPONENT }]),
				admin,
			),
		);
		expect(response.ok).toBe(true);
	});
});

describe('ddoIsAuthorized — an unresolvable section fails CLOSED (SEC-01)', () => {
	// DB-free by construction: every case below short-circuits before
	// getPermissions, so this describe runs on a runner with no Postgres too.
	const principal: Principal = {
		userId: ACL_NON_ADMIN_USER_ID,
		isGlobalAdmin: false,
		isDeveloper: false,
	};

	test('a DEFINED principal is DENIED when the section resolves to nothing', async () => {
		// The predicate used to `return true` here — "no section to check" read as
		// "allowed". Every caller supplies its own fallback before asking, so what
		// arrives unresolvable is degenerate input, and the answer must be no.
		for (const section of [undefined, '', [], [''], [undefined] as unknown as string[]]) {
			expect(await ddoIsAuthorized(principal, section, 'dd133')).toBe(false);
		}
	});

	test('an UNDEFINED principal still applies NO filter (the internal-resolution posture)', async () => {
		// Unit harnesses, background warmups and internal datalist/order-path
		// resolution run without a request scope; denying them would empty the
		// resolutions PHP's not-logged-in→0 posture was never applied to.
		expect(await ddoIsAuthorized(undefined, '', 'dd133')).toBe(true);
		expect(await ddoIsAuthorized(undefined, undefined, 'dd133')).toBe(true);
	});
});
