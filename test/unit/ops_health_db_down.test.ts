/**
 * /health DB-DOWN gate (ops-test audit 2026-07-07; S3-48 counterpart of
 * ops_shutdown.test.ts). The db:'down' 503 branch, the 2 s wedged-pool race
 * and the boot-time cache sentinel had ZERO tests — inverting dbOk in
 * server.ts checkDbHealth kept the whole suite green.
 *
 * Spawns a REAL server process on an EPHEMERAL unix socket with DB_HOST/DB_PORT
 * pointed at a dead TCP target (127.0.0.1:1 — connection refused) and asserts:
 * - the server still BOOTS (fault-tolerant posture, S1-15: boot migrations log
 *   and continue on DB failure — a DB blip must not stop the process);
 * - /health answers HTTP 503 with result:'error', db:'down';
 * - the answer arrives well inside the 2 s probe race + margin — a wedged pool
 *   must degrade the probe, never hang it. The budget is 4x the race, NOT a
 *   number tuned to this desk: see PROBE_ANSWER_BUDGET_MS below.
 *
 * Isolation mirrors ops_shutdown.test.ts: scheduler off, scratch
 * media-processes dir, RAG hooks off, and the preload's scratch session DB /
 * state file inherited through the child env.
 *
 * WHY THIS GATE WAS ORDER-DEPENDENT — AND WHY THE DEFECT WAS NOT HERE
 * (2026-08-29, P0-1 of the deep audit). This test failed in full-tier runs at
 * ~2.0-2.5 s and passed alone, which reads exactly like a tight wall-clock
 * budget under load. It was not: the failure was a
 * `ReferenceError: window is not defined` thrown from
 * client/dedalo/core/common/js/data_manager.js, a FOREIGN uncaught exception
 * that bun attributes to whichever test is running when it lands.
 * client_request_coalescing_tripwire.test.ts drops a fetch on purpose, which
 * arms data_manager's 3000 ms transport-toast reset timer, and then deletes
 * the `window` global its harness installed; three seconds later the callback
 * fires into a stranger. THIS file is a likely stranger because its one test
 * lives >5 s, so it is running when many such timers land — but the victim is
 * ARBITRARY, which is exactly why the tier's failing SET moved between runs
 * rather than a single gate being reliably red. Fixed at the source (that file now
 * leashes and clears the timers the code under test schedules). Nothing here
 * needed loosening, and NOTHING HERE SHOULD BE LOOSENED to chase a repeat: if
 * this gate reddens again at ~2-3 s with a stack pointing outside this file,
 * the leak is in the neighbour, not in the budget.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const scratch = mkdtempSync(join(tmpdir(), 'dedalo_ops_db_down_'));
const SOCKET = join(scratch, `dedalo_ts_db_down_${process.pid}.sock`);

const childEnv: Record<string, string | undefined> = {
	...process.env,
	SERVER_UNIX_SOCKET: SOCKET,
	SERVER_TCP_PORT: '', // no dev listener — socket-only, like the smoke test
	// The dead DB: nothing listens on port 1 → immediate connection refused.
	DB_HOST: '127.0.0.1',
	DB_PORT: '1',
	// Neutralize background subsystems that would otherwise touch live surfaces
	// or add boot noise on top of the dead DB.
	DEDALO_DIFFUSION_SCHEDULER_ENABLED: 'false',
	DEDALO_RAG_ENABLED: 'false',
	DEDALO_MEDIA_PROCESSES_DIR: join(scratch, 'processes'),
};

/**
 * The two server-side constants this test is written AGAINST (server.ts
 * checkDbHealth). Spelled out here rather than imported: importing server.ts
 * into the test process would evaluate the whole boot module graph — the very
 * thing this file spawns a CHILD to avoid. They are named so the sleep and the
 * budget below are visibly derived from the product's own numbers instead of
 * being magic constants that drift silently when the product's change.
 */
const DB_HEALTH_CACHE_MS = 5000; // server.ts: cached probe result window
const DB_HEALTH_PROBE_RACE_MS = 2000; // server.ts: Promise.race bound on the ping

/**
 * Long enough to leave the cache window with margin, so the SECOND request
 * provably re-probes instead of being served the first answer's cached verdict.
 */
const CACHE_EXPIRY_SLEEP_MS = DB_HEALTH_CACHE_MS + 100;

/**
 * THE ANSWER BUDGET — what "fast" means, relative to the thing it must beat.
 *
 * The property under test is that /health does NOT block on a dead database:
 * the 2 s race must bound the answer, so a probe that hangs on the connection
 * attempt fails LOUDLY. 4x that race is the budget: generous enough that a
 * loaded, contended CI runner (slower than this desk by construction) cannot
 * flap it, and still an order of magnitude below a genuine hang, which would
 * run to the test timeout. A budget tuned tight to an idle laptop is a budget
 * that flakes in CI forever, and a flapping gate cannot block anything.
 */
const PROBE_ANSWER_BUDGET_MS = DB_HEALTH_PROBE_RACE_MS * 4;

let server: ReturnType<typeof Bun.spawn> | null = null;

/** Poll until the socket answers /health at all (boot may take a few seconds). */
async function waitForHealth(timeoutMs: number): Promise<Response> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown = null;
	while (Date.now() < deadline) {
		try {
			return await fetch('http://localhost/health', { unix: SOCKET });
		} catch (error) {
			lastError = error;
			await Bun.sleep(150);
		}
	}
	throw new Error(`server never answered /health: ${String(lastError)}`);
}

afterAll(async () => {
	// ALWAYS kill the child — a leaked subprocess keeps the scratch socket and
	// the bun process alive across runs. SIGKILL: there is nothing to drain.
	try {
		server?.kill('SIGKILL');
	} catch {
		/* already gone */
	}
	// AND WAIT FOR IT TO ACTUALLY GO. `kill` only delivers the signal; without
	// awaiting `exited` this file returns while a server process is still dying,
	// and the NEXT file starts against a machine that is still busy. Measured
	// 2026-08-21: export_hierarchy_export_native (a real pg_dump, 5 s budget)
	// timed out only when it ran straight after this file, and passed alone.
	// A test that leaves work running is a test that fails its neighbours.
	try {
		await server?.exited;
	} catch {
		/* already reaped */
	}
	rmSync(scratch, { recursive: true, force: true });
});

describe('/health with the database DOWN (S3-48 db:down branch)', () => {
	test('server boots, /health answers 503 db:down, and fast (2 s probe race)', async () => {
		server = Bun.spawn([process.execPath, 'run', 'src/server.ts'], {
			cwd: ROOT,
			env: childEnv as Record<string, string>,
			stdout: 'pipe',
			stderr: 'pipe',
		});

		// Fault-tolerant boot: the process must come up and serve /health even
		// though every DB touch (boot migrations included) fails.
		const first = await waitForHealth(30000);
		expect(first.status).toBe(503);
		const firstBody = (await first.json()) as Record<string, unknown>;
		expect(firstBody.result).toBe('error');
		expect(firstBody.db).toBe('down');
		expect(typeof firstBody.request_id).toBe('string');

		// Timing bound on a request that actually PROBES (the result cache has
		// expired by then): the Promise.race must bound the answer — see
		// PROBE_ANSWER_BUDGET_MS for what the number is relative to.
		await Bun.sleep(CACHE_EXPIRY_SLEEP_MS);
		const startedAt = performance.now();
		const probed = await fetch('http://localhost/health', { unix: SOCKET });
		const elapsedMs = performance.now() - startedAt;
		expect(probed.status).toBe(503);
		const probedBody = (await probed.json()) as Record<string, unknown>;
		expect(probedBody.result).toBe('error');
		expect(probedBody.db).toBe('down');
		expect(elapsedMs).toBeLessThan(PROBE_ANSWER_BUDGET_MS);
	}, 60000);
});
