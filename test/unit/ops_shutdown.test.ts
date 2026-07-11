/**
 * Boot/shutdown smoke gate (audit S2-17 + S3-48 + S2-36 echo; WS-E item 3).
 *
 * Spawns a REAL server process on an EPHEMERAL unix socket and asserts:
 * - boot echoes the runtime version + pin (S2-36);
 * - /health answers ok WITH the db field (S3-48 — real Postgres behind it);
 * - a SECOND instance pointed at the live socket REFUSES to start (exit 1)
 *   instead of silently stealing it (S2-17b);
 * - SIGTERM drains and exits 0, unlinking the socket (S2-17).
 *
 * Isolation: DEDALO_DIFFUSION_SCHEDULER_ENABLED=false (an ephemeral instance
 * must never claim the live queue's jobs), scratch media-processes dir, and
 * the preload's scratch session DB inherited through the child env.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const scratch = mkdtempSync(join(tmpdir(), 'dedalo_ops_smoke_'));
const SOCKET = join(scratch, `dedalo_ts_ops_${process.pid}.sock`);

const childEnv: Record<string, string | undefined> = {
	...process.env,
	SERVER_UNIX_SOCKET: SOCKET,
	SERVER_TCP_PORT: '', // no dev listener — the smoke test is socket-only
	DEDALO_DIFFUSION_SCHEDULER_ENABLED: 'false',
	DEDALO_MEDIA_PROCESSES_DIR: join(scratch, 'processes'),
	DEDALO_ACCESS_LOG: 'true',
};

function spawnServer() {
	return Bun.spawn(['bun', 'run', 'src/server.ts'], {
		cwd: ROOT,
		env: childEnv as Record<string, string>,
		stdout: 'pipe',
		stderr: 'pipe',
	});
}

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

let server: ReturnType<typeof spawnServer> | null = null;

afterAll(() => {
	try {
		server?.kill('SIGKILL');
	} catch {
		/* already gone */
	}
	rmSync(scratch, { recursive: true, force: true });
});

describe('server boot/shutdown smoke (S2-17/S2-36/S3-48)', () => {
	test('boot → health(db) → double-start refusal → SIGTERM drain → socket unlinked', async () => {
		server = spawnServer();
		const health = await waitForHealth(20000);
		expect(health.status).toBe(200);
		const body = (await health.json()) as Record<string, unknown>;
		expect(body.result).toBe('ok');
		expect(body.db).toBe('ok'); // S3-48: the probe reaches Postgres
		expect(typeof body.request_id).toBe('string');

		// Double-start guard (S2-17b): a second instance on the SAME socket must
		// refuse loudly instead of unlinking the live socket.
		const usurper = Bun.spawn(['bun', 'run', 'src/server.ts'], {
			cwd: ROOT,
			env: childEnv as Record<string, string>,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const usurperExit = await usurper.exited;
		const usurperErr = await new Response(usurper.stderr).text();
		expect(usurperExit).toBe(1);
		expect(usurperErr).toContain('refusing');
		// The FIRST instance keeps serving after the refusal.
		const stillUp = await fetch('http://localhost/health', { unix: SOCKET });
		expect(stillUp.status).toBe(200);

		// Graceful shutdown (S2-17): SIGTERM → drain → exit 0 → socket gone.
		server.kill('SIGTERM');
		const exitCode = await server.exited;
		expect(exitCode).toBe(0);
		expect(existsSync(SOCKET)).toBe(false);

		const stdout = await new Response(server.stdout).text();
		// S2-36: the boot echo names the running Bun and the pin.
		expect(stdout).toContain(`starting on Bun ${Bun.version}`);
		expect(stdout).toContain('pinned:');
		// S2-17: the shutdown path announces and completes.
		expect(stdout).toContain('[shutdown] SIGTERM received');
		expect(stdout).toContain('[shutdown] complete');
		server = null;
	}, 60000);
});
