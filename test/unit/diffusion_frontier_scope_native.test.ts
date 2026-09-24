/**
 * DIFFUSION FRONTIER SCOPE — the public tier's frontier matches the matrix's
 * publication flag for EVERY record a publication run reaches, and the
 * frontier obeys the ELEMENT-scope policy DIFFUSION_SPEC §8.8 records
 * (audit 2026-08-26 P1-12: CARRY-03 / DIFF-C).
 *
 * TWO LAWS, on the repo-owned `zzdif` domain (test/helpers/zzdif_diffusion_domain.ts
 * — a primary section with a portal hop into a linked section, five primaries
 * of which one is flagged unpublishable, two linked records):
 *
 *   1. FLAG ↔ FRONTIER (census TOTAL over the run). A global-admin run over
 *      the sql element drains the frontier; for EVERY record it emits —
 *      primary AND frontier — the gate's status equals the matrix's own
 *      dd64 flag read raw from the record. Non-degenerate: the run must emit
 *      at least the fixture's seven records, both sections, both statuses.
 *      MUTATION CONTROL inside the test: flipping one FRONTIER record's flag
 *      to "no" in the matrix flips its status to 'unpublish' on the next run
 *      (the resolver reads the record, not a cache of the fixture).
 *
 *   2. ELEMENT SCOPE, DROP + LEDGER (the CARRY-03 policy). A non-admin
 *      principal holding a grant on the PRIMARY section and NONE on the
 *      linked one runs the same element: the primaries are emitted, the
 *      frontier records are DROPPED — never emitted, never 'unpublish'ed (a
 *      caller who cannot READ a record must not be able to REMOVE it from the
 *      public tier) — and a `[frontier] REFUSED` ledger line names the
 *      section. Non-degenerate: the same run as the admin emits the frontier.
 *
 *   3. MATRIX ADDRESSES ONLY (2026-09-24). A stored locator whose id is NOT a
 *      record address — a padded '0940101' (an external remote id's shape) or
 *      junk 'abc' — is DROPPED by the run with a ledger line: never
 *      Number()-ed into local record 940101, never emitted as 'unpublish'
 *      (that removed a public record the run never read), never throwing the
 *      run down. readMatrixRecords itself refuses a non-address.
 *
 * The scoped identity is the shared ACL fixture's non-admin user with ONE
 * grant added on the primary section by this file (removed with the fixture).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { compileElementPlan } from '../../src/diffusion/plan/compile.ts';
import type { PublicationPlan } from '../../src/diffusion/plan/types.ts';
import {
	buildVirtualDiffusionTree,
	type VirtualDiffusionTree,
} from '../../src/diffusion/plan/virtual_tree.ts';
import { resolvePublication } from '../../src/diffusion/resolve/resolver.ts';
import { readMatrixRecords } from '../../src/diffusion/resolve/selection.ts';
import {
	ACL_ADMIN_USER_ID,
	ACL_NON_ADMIN_PROFILE_ID,
	ACL_NON_ADMIN_USER_ID,
	clearAclIdentityCaches,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import {
	dropZzdifDomain,
	ensureZzdifDomain,
	ZZDIF_DOMAIN_NAME,
	ZZDIF_ELEMENT,
	ZZDIF_EXTRA_PUBLISHABLE_IDS,
	ZZDIF_LINKED_IDS,
	ZZDIF_LINKED_PUBLICATION,
	ZZDIF_LINKED_SECTION,
	ZZDIF_PORTAL,
	ZZDIF_PUBLICATION,
	ZZDIF_PUBLISHABLE_ID,
	ZZDIF_SECTION,
	ZZDIF_UNPUBLISHABLE_ID,
} from '../helpers/zzdif_diffusion_domain.ts';

const TABLE = 'matrix_test';
/** The fixture's component_publication tipos (primary / linked). */
const PUBLICATION_OF: Record<string, string> = {
	[ZZDIF_SECTION]: ZZDIF_PUBLICATION,
	[ZZDIF_LINKED_SECTION]: ZZDIF_LINKED_PUBLICATION,
};
/** dd64: 1 = yes, 2 = no. */
const YES = 1;
const NO = 2;

const ADMIN: Principal = { userId: ACL_ADMIN_USER_ID, isGlobalAdmin: true, isDeveloper: false };
const SCOPED: Principal = {
	userId: ACL_NON_ADMIN_USER_ID,
	isGlobalAdmin: false,
	isDeveloper: false,
};

let tree: VirtualDiffusionTree;
let plan: PublicationPlan;

interface Emitted {
	sectionTipo: string;
	sectionId: number;
	status: 'publish' | 'unpublish';
}

/** One full run (primaries + frontier) as the flat record list it emitted. */
async function run(principal: Principal): Promise<Emitted[]> {
	const out: Emitted[] = [];
	for await (const batch of resolvePublication(plan, {
		sectionTipo: ZZDIF_SECTION,
		runStartedAt: 1_751_700_000,
		tree,
		principal,
		maxLevels: 1,
	})) {
		for (const record of batch.records) {
			out.push({
				sectionTipo: record.sectionTipo,
				sectionId: Number(record.sectionId),
				status: record.status,
			});
		}
	}
	return out.sort(
		(a, b) => a.sectionTipo.localeCompare(b.sectionTipo) || a.sectionId - b.sectionId,
	);
}

/** The matrix's OWN flag for a record, read raw (the resolver's gate is NOT consulted). */
async function matrixFlag(
	sectionTipo: string,
	sectionId: number,
): Promise<'publish' | 'unpublish'> {
	const rows = (await sql.unsafe(
		`SELECT relation->$3->0 AS first FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[sectionTipo, sectionId, PUBLICATION_OF[sectionTipo] as string],
	)) as { first: { section_tipo?: string; section_id?: number | string } | string | null }[];
	const first = typeof rows[0]?.first === 'string' ? JSON.parse(rows[0].first) : rows[0]?.first;
	return first?.section_tipo === 'dd64' && Number(first?.section_id) === YES
		? 'publish'
		: 'unpublish';
}

async function setFlag(sectionTipo: string, sectionId: number, value: number): Promise<void> {
	const updated = (await sql.unsafe(
		`UPDATE "${TABLE}" SET relation = jsonb_set(COALESCE(relation, '{}'::jsonb), $4::text[], $3::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2 RETURNING section_id`,
		[
			sectionTipo,
			sectionId,
			encodeForJsonb([{ section_tipo: 'dd64', section_id: value }]),
			`{${PUBLICATION_OF[sectionTipo]}}`,
		],
	)) as unknown[];
	if (updated.length !== 1) {
		throw new Error(
			`frontier_scope gate: the flag write touched ${updated.length} rows — the fixture is not where this gate thinks`,
		);
	}
}

/** Grant the scoped profile the PRIMARY section (and nothing on the linked one). */
async function grantPrimaryToScopedProfile(): Promise<void> {
	await sql.unsafe(
		`UPDATE matrix_profiles
		 SET misc = jsonb_set(COALESCE(misc, '{}'::jsonb), '{dd774}', COALESCE(misc->'dd774', '[]'::jsonb) || $2::text::jsonb)
		 WHERE section_tipo = 'dd234' AND section_id = $1`,
		[
			ACL_NON_ADMIN_PROFILE_ID,
			encodeForJsonb([
				{ id: 90, tipo: ZZDIF_SECTION, section_tipo: ZZDIF_SECTION, value: 2 },
				{ id: 91, tipo: ZZDIF_PORTAL, section_tipo: ZZDIF_SECTION, value: 2 },
			]),
		],
	);
	clearAclIdentityCaches();
}

describe.if(DB_READY)(
	'diffusion frontier scope — flag ↔ frontier, element scope (P1-12 / CARRY-03)',
	() => {
		beforeAll(async () => {
			await ensureZzdifDomain();
			await installAclIdentityFixture();
			await grantPrimaryToScopedProfile();
			const built = await buildVirtualDiffusionTree(ZZDIF_DOMAIN_NAME);
			if (built === null) throw new Error(`no dd1190 domain node is named '${ZZDIF_DOMAIN_NAME}'`);
			tree = built;
			plan = await compileElementPlan(ZZDIF_ELEMENT, { tree });
		}, 180_000);

		afterAll(async () => {
			await removeAclIdentityFixture();
			clearAclIdentityCaches();
			expect(await dropZzdifDomain()).toBe(0);
		}, 120_000);

		test('LAW 1 — every emitted record (primary AND frontier) carries the status the matrix flag says; flipping a frontier flag flips the status', async () => {
			const emitted = await run(ADMIN);
			// Non-degenerate: the whole fixture, both sections, both statuses.
			const expectedIds = [
				ZZDIF_PUBLISHABLE_ID,
				ZZDIF_UNPUBLISHABLE_ID,
				...ZZDIF_EXTRA_PUBLISHABLE_IDS,
				...ZZDIF_LINKED_IDS,
			].sort((a, b) => a - b);
			expect(emitted.length).toBeGreaterThanOrEqual(7);
			expect(emitted.map((record) => record.sectionId).sort((a, b) => a - b)).toEqual(expectedIds);
			expect(emitted.filter((record) => record.sectionTipo === ZZDIF_LINKED_SECTION).length).toBe(
				ZZDIF_LINKED_IDS.length,
			);
			expect(new Set(emitted.map((record) => record.status))).toEqual(
				new Set(['publish', 'unpublish']),
			);

			// Census TOTAL: EVERY emitted record against the matrix's own flag.
			for (const record of emitted) {
				expect(
					record.status,
					`${record.sectionTipo}/${record.sectionId}: the tier's frontier disagrees with the matrix flag`,
				).toBe(await matrixFlag(record.sectionTipo, record.sectionId));
			}

			// MUTATION CONTROL: one FRONTIER record flips to "no" in the matrix.
			const flipped = ZZDIF_LINKED_IDS[1] as number;
			await setFlag(ZZDIF_LINKED_SECTION, flipped, NO);
			try {
				const after = await run(ADMIN);
				const record = after.find(
					(entry) => entry.sectionTipo === ZZDIF_LINKED_SECTION && entry.sectionId === flipped,
				);
				expect(record?.status).toBe('unpublish');
				// …and the OTHER frontier record is untouched.
				expect(
					after.find(
						(entry) =>
							entry.sectionTipo === ZZDIF_LINKED_SECTION && entry.sectionId === ZZDIF_LINKED_IDS[0],
					)?.status,
				).toBe('publish');
			} finally {
				await setFlag(ZZDIF_LINKED_SECTION, flipped, YES);
			}
			expect(await matrixFlag(ZZDIF_LINKED_SECTION, flipped)).toBe('publish');
		}, 60_000);

		test('LAW 2 — a scoped caller with no grant on the linked section: primaries emitted, frontier DROPPED (never unpublished), refusal ledgered', async () => {
			const refusals: string[] = [];
			const originalWarn = console.warn;
			console.warn = (...args: unknown[]) => {
				const line = args.map(String).join(' ');
				if (line.includes('[frontier] REFUSED')) refusals.push(line);
				originalWarn(...args);
			};
			let scoped: Emitted[];
			try {
				scoped = await run(SCOPED);
			} finally {
				console.warn = originalWarn;
			}
			const admin = await run(ADMIN);

			// Non-degenerate: the admin run DOES reach the frontier.
			expect(admin.filter((record) => record.sectionTipo === ZZDIF_LINKED_SECTION).length).toBe(2);
			// The scoped caller's primaries are emitted (the situation is real)…
			expect(
				scoped.filter((record) => record.sectionTipo === ZZDIF_SECTION).length,
			).toBeGreaterThan(0);
			// …the frontier is DROPPED: not emitted at all — in particular NOT as
			// 'unpublish', which would let a caller who cannot read a record remove it.
			expect(scoped.filter((record) => record.sectionTipo === ZZDIF_LINKED_SECTION)).toEqual([]);
			// …and the narrowing is LEDGERED, naming the section it refused.
			expect(refusals.length).toBeGreaterThan(0);
			expect(refusals.some((line) => line.includes(ZZDIF_LINKED_SECTION))).toBe(true);
			expect(refusals.some((line) => line.includes(`user ${ACL_NON_ADMIN_USER_ID}`))).toBe(true);
		}, 60_000);

		test('LAW 3 — a non-address locator id is dropped and ledgered: never read as another record, never unpublished, never fatal', async () => {
			// The reader itself: '0940101' is not record 940101.
			await expect(readMatrixRecords(TABLE, ZZDIF_LINKED_SECTION, ['0940101'])).rejects.toThrow(
				/not a record address/,
			);
			// Non-degenerate control: the canonical string form IS an address.
			expect(
				(await readMatrixRecords(TABLE, ZZDIF_LINKED_SECTION, ['940101'])).map(
					(record) => record.section_id,
				),
			).toEqual([940101]);

			const baseline = await run(ADMIN);
			const planted = [
				{ section_tipo: ZZDIF_LINKED_SECTION, section_id: '0940101' },
				{ section_tipo: ZZDIF_LINKED_SECTION, section_id: 'abc' },
			];
			await sql.unsafe(
				`UPDATE "${TABLE}" SET relation = jsonb_set(relation, $3::text[], (relation->$4) || $5::text::jsonb)
				 WHERE section_tipo = $1 AND section_id = $2`,
				[
					ZZDIF_SECTION,
					ZZDIF_PUBLISHABLE_ID,
					`{${ZZDIF_PORTAL}}`,
					ZZDIF_PORTAL,
					encodeForJsonb(planted),
				],
			);
			const dropped: string[] = [];
			const originalWarn = console.warn;
			console.warn = (...args: unknown[]) => {
				const line = args.map(String).join(' ');
				if (line.includes('is not a record address')) dropped.push(line);
				originalWarn(...args);
			};
			const raw: { sectionTipo: string; sectionId: unknown; status: string }[] = [];
			const adminRun: typeof raw = [];
			try {
				for (const principal of [ADMIN, SCOPED]) {
					for await (const batch of resolvePublication(plan, {
						sectionTipo: ZZDIF_SECTION,
						runStartedAt: 1_751_700_000,
						tree,
						principal,
						maxLevels: 1,
					})) {
						for (const record of batch.records) {
							const emitted = {
								sectionTipo: record.sectionTipo,
								sectionId: record.sectionId,
								status: record.status,
							};
							raw.push(emitted);
							if (principal === ADMIN) adminRun.push(emitted);
						}
						for (const id of batch.unpublishIds) {
							expect(['0940101', 'abc']).not.toContain(String(id));
						}
					}
				}
			} finally {
				console.warn = originalWarn;
				await sql.unsafe(
					`UPDATE "${TABLE}" SET relation = jsonb_set(relation, $3::text[], $4::text::jsonb)
					 WHERE section_tipo = $1 AND section_id = $2`,
					[
						ZZDIF_SECTION,
						ZZDIF_PUBLISHABLE_ID,
						`{${ZZDIF_PORTAL}}`,
						encodeForJsonb(
							ZZDIF_LINKED_IDS.map((id) => ({
								section_tipo: ZZDIF_LINKED_SECTION,
								section_id: id,
							})),
						),
					],
				);
			}
			// Neither planted id is emitted — in particular not as 'unpublish'.
			expect(
				raw.filter((record) => record.sectionId === '0940101' || record.sectionId === 'abc'),
			).toEqual([]);
			// The admin run emitted exactly what it emits without them: the same
			// records, 940101 once (through its own locator, never again through
			// the padded one).
			expect(
				adminRun
					.map((record) => `${record.sectionTipo}/${String(record.sectionId)}/${record.status}`)
					.sort(),
			).toEqual(
				baseline
					.map((record) => `${record.sectionTipo}/${record.sectionId}/${record.status}`)
					.sort(),
			);
			// Loud: the drop names each id.
			expect(dropped.some((line) => line.includes("'0940101'"))).toBe(true);
			expect(dropped.some((line) => line.includes("'abc'"))).toBe(true);
		}, 60_000);
	},
);
