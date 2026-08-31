/**
 * A WAIVED BACKUP MUST LEAVE A DURABLE TRACE (P2-16 / LIFE-06).
 *
 * The code-update backup requirement is otherwise well gated: `waive_backup`
 * takes effect only after the superuser and maintenance-mode checks, and the
 * shipped client exposes no control for it. The residual was MEMORY. The
 * waiver's only record was a single `console.warn`, so once journald rotated
 * there was no evidence that a tree had been swapped with no restore point
 * behind it — which is the first question an incident asks.
 *
 * Both artifacts now carry it: the rollback SENTINEL (which outlives the
 * process and is what a post-incident reader opens) and every progress FRAME
 * (so the operator sees it while it happens). On every frame rather than one,
 * because the panel renders the current frame: a flag shown once, early, has
 * scrolled away by the time anything goes wrong.
 *
 * CENSUS: ENUMERATED over the two artifacts.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPhaseTracker, type UpdatePhaseFrame } from '../../src/core/update/code_update.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

describe('a waived backup leaves a durable trace', () => {
	test('every progress frame carries the waiver when one was given', () => {
		const frames: UpdatePhaseFrame[] = [];
		const phases = createPhaseTracker('7.0.9', (frame) => frames.push(frame), true);
		phases.start('preflight');
		phases.start('download');
		phases.start('swap');
		expect(frames.length).toBeGreaterThanOrEqual(3);
		for (const frame of frames) {
			expect(frame.backup_waived, `frame '${frame.phase}' lost the waiver`).toBe(true);
		}
	});

	test('an ordinary run carries no waiver flag at all', () => {
		// Absent, not `false`: a flag that is always present teaches a reader to
		// stop noticing it, and the client contract treats absence as "normal".
		const frames: UpdatePhaseFrame[] = [];
		const phases = createPhaseTracker('7.0.9', (frame) => frames.push(frame));
		phases.start('preflight');
		expect(frames.length).toBeGreaterThan(0);
		for (const frame of frames) expect(frame.backup_waived).toBeUndefined();
	});

	test('an explicit per-frame value still wins over the run-level flag', () => {
		// `extra` is how a phase says something specific about itself; the waiver
		// must not become a field a caller can no longer set.
		const frames: UpdatePhaseFrame[] = [];
		const phases = createPhaseTracker('7.0.9', (frame) => frames.push(frame), true);
		phases.start('restart', { backup_waived: false });
		expect(frames.at(-1)?.backup_waived).toBe(false);
	});

	test('the sentinel records the waiver, and both types declare the field', () => {
		// The sentinel is the artifact that OUTLIVES the process — the one a
		// post-incident reader opens. The writer must stamp it from the request,
		// and both the writer's type and the reader's type must know the field, or
		// it is dropped silently at one end.
		const updater = readFileSync(join(REPO_ROOT, 'src/core/update/code_update.ts'), 'utf8');
		expect(updater).toContain('backup_waived: request.backupWaived');
		expect(updater, 'the writer type must declare the field').toMatch(/backup_waived\?: boolean;/);
		const reader = readFileSync(join(REPO_ROOT, 'src/core/update/boot_confirm.ts'), 'utf8');
		expect(reader, 'the READER type must declare it too, or the field is lost').toMatch(
			/backup_waived\?: boolean;/,
		);
	});

	test('the waiver decision still reaches the request from the door', () => {
		// Anti-vacuity for the plumbing: the flag is only durable if the parsed
		// request actually carries the operator's choice.
		const updater = readFileSync(join(REPO_ROOT, 'src/core/update/code_update.ts'), 'utf8');
		expect(updater).toContain('backupWaived: waiveBackup');
		expect(updater).toContain('createPhaseTracker(version, seams.onPhase, request.backupWaived)');
	});
});
