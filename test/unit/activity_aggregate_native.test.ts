/**
 * ACTIVITY AGGREGATE — the read model behind the job tray (2026-08-12).
 *
 * The defect this guards is one of OMISSION, which no UI test would catch: a
 * tray fed from `mediaJobs` alone renders a video transcode perfectly while
 * silently dropping a running publication — the longest process in the system —
 * and an empty tray reads as "nothing is happening".
 *
 * The load-bearing assertion here is the DIFFUSION STATE MAPPING TOTALITY. The
 * `state` CHECK constraint lives in src/diffusion/jobs/schema.ts and the mapping
 * lives in src/core/api/activity.ts; they are edited in different files by
 * different hands. A state present in the constraint but missing from the map
 * would land as `undefined` in the row and render a FAILED publication as
 * running — the exact "it looks like it is still working" lie this change
 * exists to remove.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	activityRowFromMediaJob,
	collectActivity,
	DIFFUSION_STATUS,
	isLiveActivity,
} from '../../src/core/api/activity.ts';
import type { JobRecord } from '../../src/core/media/jobs.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** A media job record shaped like the ones the manager produces. */
function mediaRecord(overrides: Partial<JobRecord> = {}): JobRecord {
	return {
		id: 'av_transcode_1_1',
		kind: 'av_transcode',
		pid: null,
		owner_pid: process.pid,
		user_id: 42,
		status: 'running',
		progress: 37,
		target: {
			section_tipo: 'test94',
			section_id: 7,
			component_tipo: 'test95',
			lang: null,
			quality: '404',
			label: '404',
		},
		data: null,
		errors: [],
		startedAt: 0,
		updatedAt: 0,
		startedAtWall: 1_700_000_000_000,
		...overrides,
	};
}

describe('diffusion state mapping totality', () => {
	test('every state in the DB CHECK constraint has a tray status', () => {
		// Read the states out of the SCHEMA rather than restating them here: a copy
		// in this file would drift with the constraint and the gate would pass while
		// the mapping was incomplete — testing the test instead of the system.
		const schema = readFileSync(join(REPO_ROOT, 'src/diffusion/jobs/schema.ts'), 'utf-8');
		const check = /CHECK \(state IN \(([^)]*)\)\)/.exec(schema);
		expect(check, 'the state CHECK constraint moved — this gate must follow it').not.toBeNull();

		const states = [...(check?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
		expect(states.length).toBeGreaterThan(0);

		for (const state of states) {
			const mapped = DIFFUSION_STATUS[state as keyof typeof DIFFUSION_STATUS];
			expect(
				mapped,
				`diffusion state '${state}' has no tray status — it would render as undefined, and a failed publication would read as still running`,
			).toBeDefined();
		}
	});

	test('the mapping declares no state the constraint does not allow', () => {
		const schema = readFileSync(join(REPO_ROOT, 'src/diffusion/jobs/schema.ts'), 'utf-8');
		const check = /CHECK \(state IN \(([^)]*)\)\)/.exec(schema);
		const states = new Set(
			[...(check?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1]),
		);
		for (const declared of Object.keys(DIFFUSION_STATUS)) {
			expect(states.has(declared), `'${declared}' is mapped but no longer a real state`).toBe(true);
		}
	});

	test('terminal diffusion states are not reported as live', () => {
		expect(isLiveActivity(DIFFUSION_STATUS.failed)).toBe(false);
		expect(isLiveActivity(DIFFUSION_STATUS.completed)).toBe(false);
		expect(isLiveActivity(DIFFUSION_STATUS.cancelled)).toBe(false);
		expect(isLiveActivity(DIFFUSION_STATUS.interrupted)).toBe(false);
		expect(isLiveActivity(DIFFUSION_STATUS.running)).toBe(true);
		expect(isLiveActivity(DIFFUSION_STATUS.queued)).toBe(true);
	});
});

describe('collectActivity: live PLUS recently finished', () => {
	test('a job that finished inside the window is still reported, with its outcome', async () => {
		// THE FIX for a shipped defect: with a live-ONLY answer a finished job
		// simply stopped appearing, and the client had to INTERPRET the absence.
		// It guessed "done" — so failed and cancelled publications were painted
		// green and faded. Absence is not an outcome; the server states it.
		const scratch = mkdtempSync(join(tmpdir(), 'dd-activity-recent-'));
		const previous = process.env.DEDALO_MEDIA_PROCESSES_DIR;
		process.env.DEDALO_MEDIA_PROCESSES_DIR = scratch;
		try {
			writeFileSync(
				join(scratch, 'av_transcode_999999_9.json'),
				JSON.stringify({
					...mediaRecord({ status: 'error', user_id: 4243 }),
					id: 'av_transcode_999999_9',
					owner_pid: 999999,
					errors: ['no encode profile'],
					finishedAtWall: Date.now() - 1000,
				}),
			);
			const rows = await collectActivity(4243);
			expect(rows).toHaveLength(1);
			expect(rows[0]?.status).toBe('error');
			// And it must carry WHY, or the tray shows a red row with no reason.
			expect(rows[0]?.errors?.join(' ')).toContain('no encode profile');
		} finally {
			if (previous === undefined) delete process.env.DEDALO_MEDIA_PROCESSES_DIR;
			else process.env.DEDALO_MEDIA_PROCESSES_DIR = previous;
			rmSync(scratch, { recursive: true, force: true });
		}
	});

	test('a job that finished LONG ago is not reported', async () => {
		// MEASURED DEFECT (2026-08-12, found by probing a real server): the first
		// version returned everything jobsForUser knows, which includes the pfile
		// mirror back to the full 30-day retention — so the tray opened announcing
		// weeks-old `done`/`cancelled` rows as news. That is the invisibility bug
		// inverted, and no UI test would have caught it on a clean machine.
		const scratch = mkdtempSync(join(tmpdir(), 'dd-activity-'));
		const previous = process.env.DEDALO_MEDIA_PROCESSES_DIR;
		process.env.DEDALO_MEDIA_PROCESSES_DIR = scratch;
		try {
			// One finished job and one still running, both the same user's.
			for (const [id, status] of [
				['av_transcode_999999_1', 'done'],
				['av_transcode_999999_2', 'running'],
			] as const) {
				writeFileSync(
					join(scratch, `${id}.json`),
					JSON.stringify({
						...mediaRecord({ status, user_id: 4242 }),
						id,
						// A live-looking pfile under a DEAD pid reconciles to 'interrupted',
						// which is itself terminal — so this one proves the filter twice.
						owner_pid: status === 'running' ? process.pid : 999999,
					}),
				);
			}
			const rows = await collectActivity(4242);
			// The 'done' pfile carries no finishedAtWall, so it is far outside the
			// window: the answer must not become a history feed (an earlier version
			// leaked the full 30-day pfile retention and opened the tray on
			// weeks-old news).
			expect(rows.every((row) => row.status !== 'done')).toBe(true);
		} finally {
			if (previous === undefined) delete process.env.DEDALO_MEDIA_PROCESSES_DIR;
			else process.env.DEDALO_MEDIA_PROCESSES_DIR = previous;
			rmSync(scratch, { recursive: true, force: true });
		}
	});
});

describe('media job projection', () => {
	test('carries the tier, the record and the stream to subscribe to', () => {
		const row = activityRowFromMediaJob(mediaRecord());
		expect(row.source).toBe('media');
		expect(row.label).toBe('404');
		expect(row.record?.section_tipo).toBe('test94');
		expect(row.record?.section_id).toBe(7);
		expect(row.status).toBe('running');
		expect(row.progress).toBe(37);
		// The client subscribes to the ORIGINATING system's SSE — this field is how
		// it knows which, and is why neither pinned wire had to change.
		expect(row.stream).toBe('job_events');
	});

	test('a cancelled media job reads as cancelled, not as an error', () => {
		// 'stopped' is an operator's deliberate act. Showing it as a failure would
		// send someone hunting for a problem they caused on purpose.
		const row = activityRowFromMediaJob(mediaRecord({ status: 'stopped' }));
		expect(row.status).toBe('cancelled');
	});

	test('an interrupted job keeps its own status (a restart is not a success)', () => {
		const row = activityRowFromMediaJob(mediaRecord({ status: 'interrupted' }));
		expect(row.status).toBe('interrupted');
		expect(isLiveActivity(row.status)).toBe(false);
	});

	test('companion tiers travel to the client (the panel must agree with the guard)', () => {
		// The ingest job writes 404 AND audio. The server refuses a build of
		// either, so the panel needs both names or it renders an idle gear on the
		// audio column whose click is guaranteed to be refused.
		const row = activityRowFromMediaJob(
			mediaRecord({
				target: {
					section_tipo: 'test94',
					section_id: 7,
					component_tipo: 'test95',
					lang: null,
					quality: '404',
					label: '404',
					also_qualities: ['audio'],
				},
			}),
		);
		expect(row.also_qualities).toEqual(['audio']);
	});

	test('a job with no companion tiers reports an empty list, never undefined', () => {
		// The client does `(job.also_qualities || []).includes(...)`; an explicit
		// empty array keeps the wire shape uniform across every row.
		const row = activityRowFromMediaJob(mediaRecord());
		expect(row.also_qualities).toEqual([]);
	});

	test('a record-less job projects a null record rather than a fake one', () => {
		const row = activityRowFromMediaJob(mediaRecord({ target: undefined, kind: 'backup' }));
		expect(row.record).toBeNull();
		expect(row.label).toBe('backup');
	});

	test('progress stays null when nothing measurable was reported', () => {
		// An unprobeable source yields no percentage. Inventing one is the frozen-70%
		// bug in a new costume; null is what makes the client render indeterminate.
		const row = activityRowFromMediaJob(mediaRecord({ progress: null }));
		expect(row.progress).toBeNull();
	});

	test('wall-clock start survives for elapsed across a reload', () => {
		const row = activityRowFromMediaJob(mediaRecord());
		expect(row.started_at).toBe(1_700_000_000_000);
	});
});
