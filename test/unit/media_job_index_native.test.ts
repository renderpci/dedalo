/**
 * MEDIA JOB INDEX — the target index, the record/owner lookups, and the
 * duplicate-target guard (the media-job-visibility change, 2026-08-12).
 *
 * These are the behavioural twin of `media_job_target_tripwire`: that gate proves
 * a target is PASSED, this one proves the index built from it answers correctly —
 * including the two answers that are easy to get subtly wrong and impossible to
 * notice in the UI: a terminal job must LEAVE the live set (or the panel disables
 * a build button forever), and a job orphaned by a dead server process must be
 * reported `interrupted` rather than eternally `running`.
 *
 * Every test drives its own MediaJobManager against a SCRATCH processes dir
 * (DEDALO_MEDIA_PROCESSES_DIR — the documented test seam), never the live
 * ../private/processes tree.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type JobRecord,
	type JobTarget,
	jobTargetKey,
	MediaJobManager,
} from '../../src/core/media/jobs.ts';

let scratchDir = '';
let previous: string | undefined;

beforeEach(() => {
	scratchDir = mkdtempSync(join(tmpdir(), 'dd-jobs-'));
	previous = process.env.DEDALO_MEDIA_PROCESSES_DIR;
	process.env.DEDALO_MEDIA_PROCESSES_DIR = scratchDir;
});

afterEach(() => {
	if (previous === undefined) delete process.env.DEDALO_MEDIA_PROCESSES_DIR;
	else process.env.DEDALO_MEDIA_PROCESSES_DIR = previous;
	rmSync(scratchDir, { recursive: true, force: true });
});

const target = (quality: string, sectionId = 7): JobTarget => ({
	section_tipo: 'test94',
	section_id: sectionId,
	component_tipo: 'test95',
	lang: null,
	quality,
});

/** A worker that blocks until the returned release() is called. */
function blockingWorker(): { worker: () => Promise<unknown>; release: () => void } {
	let release = (): void => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { worker: async () => await gate, release };
}

describe('job target key', () => {
	test('distinguishes tiers of the same component', () => {
		expect(jobTargetKey(target('404'))).not.toBe(jobTargetKey(target('720')));
	});

	test('distinguishes records of the same tier', () => {
		expect(jobTargetKey(target('404', 7))).not.toBe(jobTargetKey(target('404', 8)));
	});

	test('ignores the display label — it is not identity', () => {
		const a = { ...target('404'), label: 'Audiovisual 404' };
		const b = { ...target('404'), label: 'something else' };
		expect(jobTargetKey(a)).toBe(jobTargetKey(b));
	});
});

describe('live-by-target index', () => {
	test('a submitted job makes its target live', () => {
		const manager = new MediaJobManager(2);
		const { worker, release } = blockingWorker();
		manager.submit('av_transcode', worker, { target: target('404') });
		expect(manager.hasLiveJobForTarget(target('404'))).toBe(true);
		// A DIFFERENT tier of the same record is NOT blocked — the guard is per
		// tier, or building 720 while 404 runs would be refused for no reason.
		expect(manager.hasLiveJobForTarget(target('720'))).toBe(false);
		release();
	});

	test('a finished job leaves the live set', async () => {
		const manager = new MediaJobManager(2);
		const { worker, release } = blockingWorker();
		manager.submit('av_transcode', worker, { target: target('404') });
		release();
		await Bun.sleep(20);
		// THE regression this exists for: a target left in the index after its job
		// ended disables the panel's build button forever, and the operator's only
		// remedy is a server restart.
		expect(manager.hasLiveJobForTarget(target('404'))).toBe(false);
	});

	test('a FAILED job also leaves the live set', async () => {
		const manager = new MediaJobManager(2);
		manager.submit(
			'av_transcode',
			async () => {
				throw new Error('encode blew up');
			},
			{ target: target('404') },
		);
		await Bun.sleep(20);
		// A failure must not wedge the tier: retry is exactly what the operator
		// does next, and it would be refused.
		expect(manager.hasLiveJobForTarget(target('404'))).toBe(false);
	});

	test('interruptLive clears targets so a restart does not wedge a tier', () => {
		const manager = new MediaJobManager(2);
		const { worker, release } = blockingWorker();
		manager.submit('av_transcode', worker, { target: target('404') });
		manager.interruptLive('server shutdown');
		expect(manager.hasLiveJobForTarget(target('404'))).toBe(false);
		release();
	});

	test('a companion tier is blocked too (also_qualities)', () => {
		// MEASURED HOLE: the INGEST job builds the default quality AND the audio
		// tier in one job. Stamping only `quality` left audio wide open, so a click
		// on the audio gear mid-ingest started a second ffmpeg writing the file the
		// running job was about to produce — the very race the guard exists for,
		// surviving in the one path that motivated this whole change.
		const manager = new MediaJobManager(2);
		const { worker, release } = blockingWorker();
		manager.submit('av_transcode', worker, {
			target: { ...target('404'), also_qualities: ['audio'] },
		});
		expect(manager.hasLiveJobForTarget(target('404'))).toBe(true);
		expect(manager.hasLiveJobForTarget(target('audio'))).toBe(true);
		// A tier the job does NOT write stays buildable.
		expect(manager.hasLiveJobForTarget(target('720'))).toBe(false);
		release();
	});

	test('a companion tier is released when the job ends', async () => {
		const manager = new MediaJobManager(2);
		const { worker, release } = blockingWorker();
		manager.submit('av_transcode', worker, {
			target: { ...target('404'), also_qualities: ['audio'] },
		});
		release();
		await Bun.sleep(20);
		// Both keys must clear, or the audio tier is wedged until a restart.
		expect(manager.hasLiveJobForTarget(target('404'))).toBe(false);
		expect(manager.hasLiveJobForTarget(target('audio'))).toBe(false);
	});

	test('an untargeted job never blocks anything', () => {
		const manager = new MediaJobManager(2);
		const { worker, release } = blockingWorker();
		manager.submit('backup', worker, {});
		expect(manager.hasLiveJobForTarget(target('404'))).toBe(false);
		release();
	});
});

describe('jobsForRecord', () => {
	test('returns the record’s jobs and excludes other records', () => {
		const manager = new MediaJobManager(3);
		const { worker, release } = blockingWorker();
		manager.submit('av_transcode', worker, { target: target('404', 7) });
		manager.submit('av_transcode', worker, { target: target('720', 7) });
		manager.submit('av_transcode', worker, { target: target('404', 99) });

		const found = manager.jobsForRecord('test94', 7);
		expect(found.map((job) => job.target?.quality).sort()).toEqual(['404', '720']);
		release();
	});

	test('keeps TERMINAL jobs visible — a failed tier must stay readable', async () => {
		const manager = new MediaJobManager(2);
		manager.submit(
			'av_transcode',
			async () => {
				throw new Error('no profile for this source');
			},
			{ target: target('404') },
		);
		await Bun.sleep(20);
		const found = manager.jobsForRecord('test94', 7);
		expect(found).toHaveLength(1);
		expect(found[0]?.status).toBe('error');
		// Reverting an errored tier to a blank cell is the "never built" lie this
		// whole change exists to remove.
		expect(found[0]?.errors.join(' ')).toContain('no profile');
	});

	test('an untargeted job is not attributed to any record', async () => {
		const manager = new MediaJobManager(2);
		manager.submit('backup', async () => 'done', {});
		await Bun.sleep(20);
		expect(manager.jobsForRecord('test94', 7)).toEqual([]);
	});
});

describe('jobsForUser', () => {
	test('returns only the caller’s jobs', async () => {
		const manager = new MediaJobManager(3);
		const { worker, release } = blockingWorker();
		manager.submit('av_transcode', worker, { userId: 42, target: target('404') });
		manager.submit('av_transcode', worker, { userId: 99, target: target('720') });

		expect(manager.jobsForUser(42).map((job) => job.target?.quality)).toEqual(['404']);
		expect(manager.jobsForUser(99).map((job) => job.target?.quality)).toEqual(['720']);
		release();
	});
});

describe('pfile discovery across a process life', () => {
	test('a running pfile from a DEAD process is discovered as interrupted', () => {
		// A job the registry never owned: written by a server that has since died.
		// Its owner_pid cannot be alive, so reporting it 'running' would leave the
		// panel blinking Processing against work nobody is doing.
		const orphan: JobRecord = {
			id: 'av_transcode_999999_1',
			kind: 'av_transcode',
			pid: null,
			owner_pid: 999999,
			user_id: 42,
			status: 'running',
			progress: 40,
			target: target('404'),
			data: null,
			errors: [],
			startedAt: 0,
			updatedAt: 0,
			startedAtWall: Date.now(),
		};
		writeFileSync(join(scratchDir, `${orphan.id}.json`), JSON.stringify(orphan));

		const manager = new MediaJobManager(2);
		const found = manager.jobsForRecord('test94', 7);
		expect(found).toHaveLength(1);
		expect(found[0]?.status).toBe('interrupted');

		// And it must NOT hold the tier hostage: the in-memory live index knows
		// nothing about it, so the operator can rebuild.
		expect(manager.hasLiveJobForTarget(target('404'))).toBe(false);
	});

	test('the owner lookup also sees a previous life’s pfile', () => {
		const orphan: JobRecord = {
			id: 'av_transcode_999999_2',
			kind: 'av_transcode',
			pid: null,
			owner_pid: 999999,
			user_id: 7,
			status: 'running',
			progress: null,
			target: target('720'),
			data: null,
			errors: [],
			startedAt: 0,
			updatedAt: 0,
			startedAtWall: Date.now(),
		};
		writeFileSync(join(scratchDir, `${orphan.id}.json`), JSON.stringify(orphan));

		const manager = new MediaJobManager(2);
		const found = manager.jobsForUser(7);
		expect(found).toHaveLength(1);
		expect(found[0]?.status).toBe('interrupted');
	});
});
