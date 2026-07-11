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
 * - the answer arrives well inside the 2 s probe race + margin (< 8000 ms) —
 *   a wedged pool must degrade the probe, never hang it.
 *
 * Isolation mirrors ops_shutdown.test.ts: scheduler off, scratch
 * media-processes dir, RAG hooks off, and the preload's scratch session DB /
 * state file inherited through the child env.
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

afterAll(() => {
	// ALWAYS kill the child — a leaked subprocess keeps the scratch socket and
	// the bun process alive across runs. SIGKILL: there is nothing to drain.
	try {
		server?.kill('SIGKILL');
	} catch {
		/* already gone */
	}
	rmSync(scratch, { recursive: true, force: true });
});

describe('/health with the database DOWN (S3-48 db:down branch)', () => {
	test('server boots, /health answers 503 db:down, and fast (2 s probe race)', async () => {
		server = Bun.spawn(['bun', 'run', 'src/server.ts'], {
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

		// Timing bound on a request that actually PROBES (the 5 s result cache
		// has expired by then): the 2 s Promise.race must bound the answer —
		// assert < 8000 ms so a hung probe fails loudly without flaking.
		await Bun.sleep(5100);
		const startedAt = performance.now();
		const probed = await fetch('http://localhost/health', { unix: SOCKET });
		const elapsedMs = performance.now() - startedAt;
		expect(probed.status).toBe(503);
		const probedBody = (await probed.json()) as Record<string, unknown>;
		expect(probedBody.result).toBe('error');
		expect(probedBody.db).toBe('down');
		expect(elapsedMs).toBeLessThan(8000);
	}, 60000);
});
