/**
 * Media job reconcile + residue GC gate (audit S2-15/DEC-22 mandatory half +
 * S3-46/62; WS-E item 8).
 *
 * THE GUARANTEES under test (hermetic: DEDALO_MEDIA_PROCESSES_DIR points at a
 * temp dir — the live ../private/processes tree is never touched):
 * - a 'running' pfile whose owning process is DEAD reads back 'interrupted'
 *   (lazy reconcile on the status() pfile fallback) and frame() stops saying
 *   is_running — D4's probe3 scenario, inverted to the fixed behavior;
 * - the boot sweep (reconcileProcessFiles) flips the same class and prunes
 *   ancient terminal pfiles;
 * - a live-owner pfile (another instance, pid alive) is LEFT ALONE;
 * - interruptLive marks every live job interrupted (the shutdown hook);
 * - a job is detached from its submitter's transaction stores (S2-14);
 * - a job runs under its OWN identity, pinned at submit (JobRunScope): the
 *   submitter's langs + principal snapshot, a null session, its own request id
 *   and refusal log — whatever scope the manager calls its worker from
 *   (engineering/REQUEST_ISOLATION.md rule 3).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JobRecord, JobRunScope, JobWorker } from '../../src/core/media/jobs.ts';
import type { FrontierRefusal, FrontierScope } from '../../src/core/security/frontier_scope.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { RequestContext } from '../../src/core/security/request_context.ts';
import type { Session } from '../../src/core/security/session_store.ts';
import { markProcessesDir } from '../helpers/test_media_root.ts';

const scratchDir = mkdtempSync(join(tmpdir(), 'dedalo_media_pfiles_'));
process.env.DEDALO_MEDIA_PROCESSES_DIR = markProcessesDir(scratchDir);

// Import AFTER the env override so every processesDir() call lands in scratch.
const { MediaJobManager, jobFilePath, reconcileProcessFiles } = await import(
	'../../src/core/media/jobs.ts'
);
const { isInTransaction, withTransaction } = await import('../../src/core/db/postgres.ts');
const { config } = await import('../../src/config/config.ts');
const { currentApplicationLang, currentDataLang, runWithRequestLangs } = await import(
	'../../src/core/resolve/request_lang.ts'
);
const {
	currentPrincipal,
	currentRequestContext,
	currentRequestId,
	currentSession,
	runWithRequestContext,
} = await import('../../src/core/security/request_context.ts');
const { currentFrontierRefusals, noteFrontierRefusal } = await import(
	'../../src/core/security/frontier_scope.ts'
);

/** A pid that is certainly dead (init-adjacent huge pid never allocated on macOS/Linux dev boxes). */
const DEAD_PID = 999999901;

function writePfile(id: string, record: Record<string, unknown>): string {
	const path = jobFilePath(id);
	writeFileSync(path, JSON.stringify(record));
	return path;
}

beforeAll(() => {
	expect(jobFilePath('probe').startsWith(scratchDir)).toBe(true);
});
afterAll(() => {
	// assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
	delete process.env.DEDALO_MEDIA_PROCESSES_DIR;
	rmSync(scratchDir, { recursive: true, force: true });
});

describe('lazy reconcile on pfile fallback (S2-15)', () => {
	test("a crashed process's 'running' pfile reads back interrupted, not is_running", () => {
		const id = `av_${DEAD_PID}_1`;
		writePfile(id, {
			id,
			kind: 'av',
			pid: null,
			owner_pid: DEAD_PID,
			status: 'running',
			progress: 42,
			data: null,
			errors: [],
			startedAt: 0,
			updatedAt: 10,
		});
		const manager = new MediaJobManager({ budgets: { media: 1 } }); // fresh = post-restart registry
		const record = manager.status(id);
		expect(record?.status).toBe('interrupted');
		expect(record?.errors.join(' ')).toContain('owning server process died');
		// The flip is PERSISTED (the next poll must not re-diagnose).
		expect((JSON.parse(readFileSync(jobFilePath(id), 'utf-8')) as { status: string }).status).toBe(
			'interrupted',
		);
		const frame = manager.frame(id);
		expect(frame?.is_running).toBe(false);
		// stop() on a dead job stays false (no live controller) — the old trap
		// was is_running:true + stop()=false forever.
		expect(manager.stop(id)).toBe(false);
	});

	test("another LIVE instance's running pfile is left alone", () => {
		const id = 'av_live_1';
		writePfile(id, {
			id,
			kind: 'av',
			pid: null,
			owner_pid: process.pid, // provably alive — but see below: a registry
			status: 'running', //        miss in the OWNER process means pid reuse
			progress: 1,
			data: null,
			errors: [],
			startedAt: 0,
			updatedAt: 10,
		});
		// From the owner's own registry-missed read this IS stale (pid-reuse rule),
		// so simulate the OTHER-instance view with a pid that is alive and not us:
		// the parent shell of the test run.
		const otherLivePid = process.ppid;
		const id2 = 'av_live_2';
		writePfile(id2, {
			id: id2,
			kind: 'av',
			pid: null,
			owner_pid: otherLivePid,
			status: 'running',
			progress: 1,
			data: null,
			errors: [],
			startedAt: 0,
			updatedAt: 10,
		});
		const swept = reconcileProcessFiles();
		expect(swept.interrupted).not.toContain(id2);
		const record = JSON.parse(readFileSync(jobFilePath(id2), 'utf-8')) as { status: string };
		expect(record.status).toBe('running');
	});
});

describe('boot sweep + pfile GC (S3-46/62)', () => {
	test('flips dead-owner running pfiles and prunes ancient terminal pfiles', () => {
		const staleId = `image_${DEAD_PID}_2`;
		writePfile(staleId, {
			id: staleId,
			kind: 'image',
			pid: null,
			owner_pid: DEAD_PID,
			status: 'running',
			progress: null,
			data: null,
			errors: [],
			startedAt: 0,
			updatedAt: 5,
		});
		const ancientId = 'image_done_old';
		const ancientPath = writePfile(ancientId, {
			id: ancientId,
			kind: 'image',
			pid: null,
			owner_pid: DEAD_PID,
			status: 'done',
			progress: 100,
			data: null,
			errors: [],
			startedAt: 0,
			updatedAt: 5,
		});
		// Age the terminal pfile past the 30-day retention.
		const ancient = (Date.now() - 40 * 24 * 60 * 60 * 1000) / 1000;
		utimesSync(ancientPath, ancient, ancient);

		const swept = reconcileProcessFiles();
		expect(swept.interrupted).toContain(staleId);
		expect(swept.pruned).toBeGreaterThanOrEqual(1);
		expect(() => readFileSync(ancientPath)).toThrow(); // pruned from disk
	});
});

describe('shutdown hook (S2-17)', () => {
	test('interruptLive marks live jobs interrupted and persists the pfiles', async () => {
		const manager = new MediaJobManager({ budgets: { media: 1 } });
		let release: () => void = () => {};
		const gate = new Promise<void>((resolvePromise) => {
			release = resolvePromise;
		});
		const record = manager.submit(
			'av',
			async ({ signal }) => {
				await gate;
				if (signal.aborted) throw new Error('aborted');
				return null;
			},
			{ lane: 'media' },
		);
		await Bun.sleep(10); // let it enter 'running'
		const interrupted = manager.interruptLive('server shutdown');
		expect(interrupted).toContain(record.id);
		expect(manager.status(record.id)?.status).toBe('interrupted');
		const persisted = JSON.parse(readFileSync(jobFilePath(record.id), 'utf-8')) as {
			status: string;
			errors: string[];
		};
		expect(persisted.status).toBe('interrupted');
		expect(persisted.errors.join(' ')).toContain('server shutdown');
		release();
	});
});

/**
 * A job OUTLIVES the request that submitted it, so it must not inherit that
 * request's transaction handle: `withTransaction` expires the handle when the
 * request commits (S2-14), minutes before a transcode ends, and the job's first
 * query would then throw instead of running on the pool — swallowed into a
 * `persist_error`, reinstating exactly the bug the write-back fixes.
 */
describe("jobs are detached from the submitter's transaction scope", () => {
	test('a job submitted INSIDE withTransaction runs outside it', async () => {
		const manager = new MediaJobManager({ budgets: { media: 1 }, clock: () => 0 });
		let jobId = '';
		let submittedInTx = false;
		await withTransaction(async () => {
			submittedInTx = isInTransaction();
			jobId = manager.submit('detach_probe', async () => ({ inTx: isInTransaction() }), {
				lane: 'media',
			}).id;
		});
		expect(submittedInTx).toBe(true); // the submit really was inside a tx
		for (let i = 0; i < 100 && manager.status(jobId)?.status !== 'done'; i++) {
			await Bun.sleep(5);
		}
		expect(manager.status(jobId)?.status).toBe('done');
		expect(manager.status(jobId)?.data).toEqual({ inTx: false });
	});
});

/**
 * A JOB RUNS UNDER ITS OWN PINNED IDENTITY (media/jobs.ts JobRunScope).
 *
 * Bun restores the submitter's ALS scope after an await, so a job used to
 * INHERIT its submitter's langs and RequestContext OBJECT — by accident of the
 * runtime, and only while the manager's internals keep that true. Two defects
 * hid there: (1) the job's identity was whatever scope the code calling the
 * worker ran in (a dispatcher / worker-pool refactor would silently change it);
 * (2) noteFrontierRefusal pushed a job's refusals onto the submitting request's
 * `frontierRefusals` — a request whose envelope was answered long ago.
 *
 * THE MODEL OF THE REFACTOR: a subclass overrides the protected `runWorker` seam
 * and calls `super.runWorker` from inside a FOREIGN scope (foreign langs, a
 * foreign global-admin principal, a foreign session, request id and ip). The
 * worker must still read the SUBMITTER's langs and principal, a null session,
 * its OWN request id, and keep its refusals on its own context. Mutation-proven:
 * with the pin removed from runWorker, every leg below goes red.
 *
 * Waits are a deferred raced against a 2 s reject — a worker that never runs
 * fails loudly, it does not poll out green.
 */
describe('a job runs under its OWN pinned identity, whatever scope calls its worker', () => {
	interface Observed {
		applicationLang: string;
		dataLang: string;
		principal: Principal | undefined;
		session: Session | null | undefined;
		requestId: string;
		clientIp: string | undefined;
		context: RequestContext | undefined;
		ownRefusals: number;
	}

	const FOREIGN_LANGS = { applicationLang: 'lg-zzforeign', dataLang: 'lg-zzforeigndata' };
	const foreignPrincipal: Principal = { userId: 777001, isGlobalAdmin: true, isDeveloper: true };
	const foreignContext: RequestContext = {
		principal: foreignPrincipal,
		session: { userId: 777001, username: 'zz_foreign' } as Session,
		requestId: 'zz-foreign-req',
		clientIp: '203.0.113.9',
	};
	const SUBMITTER_LANGS = { applicationLang: 'lg-zzsubmitter', dataLang: 'lg-zzsubmitdata' };
	const REFUSAL: FrontierRefusal = {
		surface: 'door',
		door: 'zz_job_pin_probe',
		sectionTipo: 'test3',
		key: 'record',
	};

	/** The scope the override entered, read just before it calls super (non-vacuity). */
	const overrideSaw: { lang?: string } = {};

	/** Models a dispatcher / pool refactor: the worker is called from a FOREIGN scope. */
	class ForeignScopeManager extends MediaJobManager {
		protected override runWorker(
			record: JobRecord,
			controller: AbortController,
			worker: JobWorker,
			ctx: Parameters<JobWorker>[0],
			scope: JobRunScope,
		): Promise<unknown> {
			return runWithRequestContext(foreignContext, () =>
				runWithRequestLangs(FOREIGN_LANGS, () => {
					overrideSaw.lang = currentApplicationLang();
					return super.runWorker(record, controller, worker, ctx, scope);
				}),
			);
		}
	}

	/** A deferred raced against a 2 s reject. */
	function deferredWithin<T>(label: string): {
		resolve: (value: T) => void;
		reject: (error: unknown) => void;
		settled: Promise<T>;
	} {
		let resolve!: (value: T) => void;
		let reject!: (error: unknown) => void;
		const promise = new Promise<T>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		const timeout = new Promise<never>((_, rej) => {
			const timer = setTimeout(
				() => rej(new Error(`${label}: the worker never ran within 2 s`)),
				2000,
			);
			void promise.finally(() => clearTimeout(timer)).catch(() => undefined);
		});
		return { resolve, reject, settled: Promise.race([promise, timeout]) };
	}

	/** The worker every leg submits: notes one refusal, then reports what it sees. */
	function probeWorker(observed: ReturnType<typeof deferredWithin<Observed>>): JobWorker {
		return async () => {
			try {
				// An await first: the reads below run in a CONTINUATION, the shape a
				// real worker's leaf reads have.
				await Promise.resolve();
				noteFrontierRefusal(
					{ surface: 'door', door: 'zz_job_pin_probe' } as FrontierScope,
					REFUSAL,
				);
				observed.resolve({
					applicationLang: currentApplicationLang(),
					dataLang: currentDataLang(),
					principal: currentPrincipal(),
					session: currentSession(),
					requestId: currentRequestId(),
					clientIp: currentRequestContext()?.clientIp,
					context: currentRequestContext(),
					ownRefusals: currentFrontierRefusals().length,
				});
			} catch (error) {
				observed.reject(error);
			}
			return null;
		};
	}

	test("submitted under a request scope: the SUBMITTER's langs + principal, null session, its own request id and refusal log — not the foreign caller's", async () => {
		const submitterPrincipal: Principal = {
			userId: 777002,
			isGlobalAdmin: false,
			isDeveloper: false,
		};
		const submitter: RequestContext = {
			principal: submitterPrincipal,
			session: { userId: 777002, username: 'zz_submitter' } as Session,
			requestId: 'zz-submitter-req',
			clientIp: '198.51.100.7',
		};
		const manager = new ForeignScopeManager({ budgets: { media: 1 } });
		const observed = deferredWithin<Observed>('pinned leg');
		Reflect.deleteProperty(overrideSaw, 'lang');
		const jobId = runWithRequestContext(submitter, () =>
			runWithRequestLangs(SUBMITTER_LANGS, () =>
				manager.submit('pin_probe', probeWorker(observed), { lane: 'media' }),
			),
		).id;
		const seen = await observed.settled;
		// Non-vacuous: the override really called the worker from the FOREIGN scope.
		expect(overrideSaw.lang).toBe(FOREIGN_LANGS.applicationLang);

		expect({ applicationLang: seen.applicationLang, dataLang: seen.dataLang }).toEqual(
			SUBMITTER_LANGS,
		);
		// The SAME principal snapshot the submit saw — authorization unchanged.
		expect(seen.principal).toBe(submitterPrincipal);
		expect(seen.session).toBeNull();
		expect(seen.requestId).toBe(`job:${jobId}`);
		expect(seen.clientIp).toBe(submitter.clientIp);
		// The job's context is its OWN object, neither the submitter's nor the caller's.
		expect(seen.context).not.toBe(submitter);
		expect(seen.context).not.toBe(foreignContext);
		// The refusal stays on the job's own context: never on the answered request,
		// never on whatever scope happened to call the worker.
		expect(seen.ownRefusals).toBe(1);
		expect(submitter.frontierRefusals).toBeUndefined();
		expect(foreignContext.frontierRefusals).toBeUndefined();
	});

	test("submitted with NO scope: the install defaults (and no principal), not the foreign caller's", async () => {
		const manager = new ForeignScopeManager({ budgets: { media: 1 } });
		const observed = deferredWithin<Observed>('no-scope leg');
		Reflect.deleteProperty(overrideSaw, 'lang');
		expect(currentRequestContext()).toBeUndefined(); // the submit really is scope-less
		const jobId = manager.submit('pin_probe', probeWorker(observed), { lane: 'media' }).id;
		const seen = await observed.settled;
		expect(overrideSaw.lang).toBe(FOREIGN_LANGS.applicationLang);
		expect(seen.applicationLang).toBe(config.menu.applicationLang);
		expect(seen.dataLang).toBe(config.lang.dataLangDefault);
		expect(seen.principal).toBeUndefined();
		expect(seen.session).toBeNull();
		expect(seen.requestId).toBe(`job:${jobId}`);
		expect(seen.clientIp).toBe('');
		expect(foreignContext.frontierRefusals).toBeUndefined();
	});

	test("the plain manager (no foreign caller): a job's refusal never lands on the submitting request", async () => {
		// The confirmed defect, reproduced at its own shape: with inheritance the
		// job's context IS the submitter's object, so the refusal was appended to
		// a request whose envelope had already been answered.
		const submitter: RequestContext = {
			principal: { userId: 777003, isGlobalAdmin: false, isDeveloper: false },
			session: null,
			requestId: 'zz-answered-req',
			clientIp: '',
		};
		const manager = new MediaJobManager({ budgets: { media: 1 } });
		const observed = deferredWithin<Observed>('plain-manager leg');
		const jobId = runWithRequestContext(submitter, () =>
			manager.submit('pin_probe', probeWorker(observed), { lane: 'media' }),
		).id;
		const seen = await observed.settled;
		expect(seen.ownRefusals).toBe(1);
		expect(submitter.frontierRefusals).toBeUndefined();
		expect(seen.requestId).toBe(`job:${jobId}`);
		expect(seen.principal).toBe(submitter.principal);
	});
});
