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
 * - interruptLive marks every live job interrupted (the shutdown hook).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratchDir = mkdtempSync(join(tmpdir(), 'dedalo_media_pfiles_'));
process.env.DEDALO_MEDIA_PROCESSES_DIR = scratchDir;

// Import AFTER the env override so every processesDir() call lands in scratch.
const { MediaJobManager, jobFilePath, reconcileProcessFiles } = await import(
	'../../src/core/media/jobs.ts'
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
	// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
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
		const manager = new MediaJobManager(1); // fresh = post-restart registry
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
		const manager = new MediaJobManager(1);
		let release: () => void = () => {};
		const gate = new Promise<void>((resolvePromise) => {
			release = resolvePromise;
		});
		const record = manager.submit('av', async ({ signal }) => {
			await gate;
			if (signal.aborted) throw new Error('aborted');
			return null;
		});
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
