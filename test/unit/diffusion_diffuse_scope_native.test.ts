/**
 * DIFF-B — the `diffuse` publication scope is SERVER-AUTHORITATIVE, behaviourally.
 *
 * WHAT IT GUARDS. `diffuseAction` (src/diffusion/api/actions.ts) builds the job
 * spec the runner will execute from CLIENT options. Two of them widen the
 * publication scope past what the caller's read grant means:
 *   (a) `skip_publication_state_check` turns OFF the fail-closed per-record
 *       publication gate — a read-level caller could publish embargoed/draft
 *       records. It is a GLOBAL-ADMIN operation and must VANISH from a
 *       non-admin's spec (a present-but-undefined key still reads as
 *       "explicitly set" downstream, so absence is the contract);
 *   (b) `levels` is the relation-graph recursion budget — unclamped, a
 *       one-record run becomes a transitive-closure publication. It is clamped
 *       to `diffusionResolveLevels()`, the server ceiling, for everyone.
 *
 * WHY THIS FILE EXISTS (S-2 clause 4 / P0-15 — the SEC-01 lesson). DIFF-B's only
 * assertion in the tree was `diffusion_scope_tripwire`'s
 * `actions.includes('principal.isGlobalAdmin')` — a substring that stays green
 * when the branch is inverted (`if (principal.isGlobalAdmin)`), when the delete
 * is moved out of it, or when the clamp reads `Math.max`. This file drives the
 * action with a REAL non-admin and a REAL global admin and reads back the spec
 * the queue stored — the decision itself, not its spelling.
 *
 * THE SITUATION IS BUILT, NOT BORROWED. The principals are the synthetic ACL
 * fixture's reader (a non-admin holding read = 1 on `test3`, so Gate A passes
 * and the option normalization is reached) and its admin (dd244 set). The
 * element tipo is a fake this file owns (`zzdifb…`): the runner's stub mode
 * drives the queue without compiling a plan or writing to any target, and the
 * follow stream is cancelled at once — what is asserted is the durable job
 * spec, read back unscoped by the client label.
 *
 * NOT HERMETIC: enqueues on the suite database's diffusion jobs table and
 * resolves the fixture principals through matrix_users/matrix_profiles.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	getPermissions,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { diffuseAction } from '../../src/diffusion/api/actions.ts';
import {
	deleteJobsForTests,
	getJobByClientProcessId,
	getJobById,
	requestCancel,
} from '../../src/diffusion/jobs/queue.ts';
import { DIFFUSION_JOBS_TABLE } from '../../src/diffusion/jobs/schema.ts';
import { diffusionResolveLevels } from '../../src/diffusion/plan/compile.ts';
import {
	ACL_ADMIN_USER_ID,
	ACL_GRANTED_SECTION,
	ACL_NON_ADMIN_USER_ID,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';

/** This file's OWN fake element prefix — never a compilable plan. */
const ELEMENT_PREFIX = 'zzdifb';
const SECTION = ACL_GRANTED_SECTION;
const createdJobIds: string[] = [];

/** Rerun hygiene: purge every job row this file's fake elements ever enqueued. */
async function purgeOwnRows(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM "${DIFFUSION_JOBS_TABLE}"
		 WHERE spec->>'diffusion_element_tipo' LIKE '${ELEMENT_PREFIX}%'
		    OR client_process_id LIKE 'process_diffusion_%_${ELEMENT_PREFIX}%'`,
	);
}

/** Is a process with this pid still alive (signal 0 probes without sending)? */
function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Poll until the job left the queued/running states AND the runner process
 * the scheduler may have spawned for it (recorded as `runner.pid`) has exited.
 * The cancel can land between the scheduler's claim and its spawn: the row is
 * then terminal at once while a child still boots — and a child that boots
 * after the purge logs a stray `job not found`.
 */
async function settled(jobId: string): Promise<void> {
	const deadline = Date.now() + 10_000;
	let done = false;
	while (!done && Date.now() < deadline) {
		const row = await getJobById(jobId);
		const terminal = row === null || (row.state !== 'queued' && row.state !== 'running');
		// A claim stamps `runner.host` at once and `runner.pid` only after the
		// spawn returns: a claimed row without a pid yet is a child on its way.
		const claimed = row?.runner.host !== undefined;
		const pid = row?.runner.pid;
		const runnerGone = !claimed || (pid !== undefined && !alive(pid));
		done = terminal && runnerGone;
		if (!done) await new Promise((resolve) => setTimeout(resolve, 50));
	}
	if (!done) throw new Error(`diffusion job ${jobId} did not settle after cancel`);
}

/**
 * One `diffuse` request as the given principal, with the scope-widening
 * options under test. Returns the runner options the queue STORED — the
 * artefact the runner will read, which is the decision's only observable.
 */
async function storedRunnerOptions(
	principal: Principal,
	element: string,
	options: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const label = `process_diffusion_${principal.userId}_${element}_${SECTION}`;
	const result = await diffuseAction(
		{
			action: 'diffuse',
			dd_api: 'dd_diffusion_api',
			source: { section_tipo: SECTION },
			sqo: { section_tipo: [SECTION], limit: 1 },
			options: {
				type: 'sql',
				diffusion_element_tipo: element,
				total: 1,
				process_id: label,
				// The stub runner drives the queue without a plan or a target write.
				stub_run: true,
				...options,
			},
		} as never,
		principal,
	);
	// The follow stream is not what is under test; release it at once.
	void (result.stream as ReadableStream<Uint8Array>).cancel();
	const job = await getJobByClientProcessId(label, null);
	if (job === null) throw new Error(`diffuse enqueued no job for ${label}`);
	createdJobIds.push(job.job_id);
	// Nothing is being published: stop the stub runner the enqueue spawned, and
	// WAIT for it to land — a row purged under a live runner leaves a stray
	// worker logging `job not found` after this file is done.
	await requestCancel(label, null);
	await settled(job.job_id);
	return ((job.spec as { options?: Record<string, unknown> }).options ?? {}) as Record<
		string,
		unknown
	>;
}

describe.if(DB_READY)('DIFF-B — diffuse publication scope is server-authoritative', () => {
	let reader: Principal;
	let admin: Principal;

	beforeAll(async () => {
		await installAclIdentityFixture();
		await purgeOwnRows();
		reader = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
		admin = await resolvePrincipal(ACL_ADMIN_USER_ID);
	});
	afterAll(async () => {
		await deleteJobsForTests(createdJobIds);
		await purgeOwnRows();
		await removeAclIdentityFixture();
	});

	test('the contrast is non-degenerate: a non-admin who passes Gate A, and a global admin', async () => {
		// Without read on the section the refusal is Gate A's and the option
		// normalization is never reached — every case below would be vacuous.
		expect(reader.isGlobalAdmin).toBe(false);
		expect(await getPermissions(reader, SECTION, SECTION)).toBeGreaterThanOrEqual(1);
		expect(admin.isGlobalAdmin).toBe(true);
	});

	test("(a) a non-admin's skip_publication_state_check VANISHES from the stored spec", async () => {
		const stored = await storedRunnerOptions(reader, `${ELEMENT_PREFIX}1`, {
			skip_publication_state_check: true,
		});
		// Absence, not falsiness: a present-but-undefined key reads as "set".
		expect(Object.hasOwn(stored, 'skip_publication_state_check')).toBe(false);
	});

	test('(a) CONTROL — a global admin KEEPS skip_publication_state_check', async () => {
		const stored = await storedRunnerOptions(admin, `${ELEMENT_PREFIX}2`, {
			skip_publication_state_check: true,
		});
		expect(stored.skip_publication_state_check).toBe(true);
	});

	test("(b) a non-admin's levels is CLAMPED to the server ceiling", async () => {
		const ceiling = diffusionResolveLevels();
		const stored = await storedRunnerOptions(reader, `${ELEMENT_PREFIX}3`, {
			levels: ceiling + 1000,
		});
		expect(stored.levels).toBe(ceiling);
	});

	test('(b) the clamp is a ceiling, not a constant: a smaller request survives', async () => {
		const ceiling = diffusionResolveLevels();
		// A ceiling of 1 leaves no room below it; the contrast then degenerates
		// and the case must say so rather than assert nothing.
		if (ceiling < 2) {
			throw new Error(
				`DEDALO_DIFFUSION_RESOLVE_LEVELS=${ceiling} leaves no value strictly below the ceiling to contrast with`,
			);
		}
		const stored = await storedRunnerOptions(reader, `${ELEMENT_PREFIX}4`, { levels: 1 });
		expect(stored.levels).toBe(1);
	});

	test('(b) the ceiling binds the admin too — the budget is a server ceiling, not a role', async () => {
		const ceiling = diffusionResolveLevels();
		const stored = await storedRunnerOptions(admin, `${ELEMENT_PREFIX}5`, {
			levels: ceiling + 1000,
		});
		expect(stored.levels).toBe(ceiling);
	});

	test('(b) a non-positive levels is DROPPED, so the runner default applies', async () => {
		const stored = await storedRunnerOptions(reader, `${ELEMENT_PREFIX}6`, { levels: -3 });
		expect(Object.hasOwn(stored, 'levels')).toBe(false);
	});
});
