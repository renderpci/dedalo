/**
 * BEHAVIOURAL GATE — the container watchdog is the consumer of /health's 503
 * on a docker host (P2-33 / OPS-09).
 *
 * The tripwire next door asserts that both shipped stacks CALL
 * scripts/ops/container_watchdog.sh and that its threshold matches their
 * `retries`. That is a wiring claim. This gate RUNS the script — with the probe
 * and the escalation injected, so it needs neither an engine nor docker — and
 * asserts the four behaviours the stacks depend on:
 *
 *   1. green            → exit 0, nothing escalated (the healthy path);
 *   2. red after green  → exit non-zero every time, escalating EXACTLY at the
 *                         declared threshold, exactly once;
 *   3. never green      → never escalates, however long it stays red (the boot
 *                         and browser-wizard case: no database yet, /health red
 *                         for as long as the operator takes to fill the form);
 *   4. a green RESETS the counter, so intermittent reds do not accumulate into
 *      a recycle.
 *
 * THE LIMIT, stated: the escalation is injected here, so what is measured is
 * the DECISION, not that `kill -TERM 1` reaches the engine in a container.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'ops', 'container_watchdog.sh');

const source = readFileSync(SCRIPT, 'utf8');
const THRESHOLD = Number(/^WATCHDOG_THRESHOLD=(\d+)$/m.exec(source)?.[1]);

/** One probe run. Returns the exit code and how many escalations exist so far. */
function probe(dir: string, green: boolean): { code: number; escalations: number } {
	const state = join(dir, 'state');
	const marker = join(dir, 'escalations');
	const run = Bun.spawnSync([
		SCRIPT,
		'--state-file',
		state,
		'--probe-cmd',
		green ? 'true' : 'false',
		'--escalate-cmd',
		`echo recycled >> ${marker}`,
	]);
	const escalations = existsSync(marker)
		? readFileSync(marker, 'utf8').split('\n').filter(Boolean).length
		: 0;
	return { code: run.exitCode, escalations };
}

describe('the container watchdog acts on a red /health', () => {
	test('anti-vacuity: the script under test is real and declares a threshold', () => {
		expect(source.length, 'the watchdog script is empty').toBeGreaterThan(800);
		expect(THRESHOLD, 'no WATCHDOG_THRESHOLD literal in the script').toBeGreaterThanOrEqual(2);
	});

	test('a green probe exits 0 and escalates nothing', () => {
		const dir = mkdtempSync(join(tmpdir(), 'dedalo-watchdog-'));
		try {
			const first = probe(dir, true);
			expect(first.code).toBe(0);
			expect(first.escalations).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('red after a green escalates exactly at the threshold, exactly once', () => {
		const dir = mkdtempSync(join(tmpdir(), 'dedalo-watchdog-'));
		try {
			expect(probe(dir, true).code).toBe(0); // arm
			for (let red = 1; red < THRESHOLD; red++) {
				const step = probe(dir, false);
				expect(step.code, `red #${red} must report unhealthy`).not.toBe(0);
				expect(
					step.escalations,
					`red #${red} of ${THRESHOLD} escalated early — one blip would recycle the engine`,
				).toBe(0);
			}
			const last = probe(dir, false);
			expect(last.code).not.toBe(0);
			expect(
				last.escalations,
				`red #${THRESHOLD} did not recycle the engine — nothing consumes the 503`,
			).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('a container that never answered green is never recycled', () => {
		// The install wizard has no database, so /health is red for as long as the
		// operator takes. Recycling underneath them would be sabotage.
		const dir = mkdtempSync(join(tmpdir(), 'dedalo-watchdog-'));
		try {
			let last = { code: 0, escalations: 0 };
			for (let red = 0; red < THRESHOLD * 3; red++) last = probe(dir, false);
			expect(last.code).not.toBe(0);
			expect(
				last.escalations,
				`${THRESHOLD * 3} reds with no green ever recycled the container — that is a boot or ` +
					'install problem, not a wedged engine',
			).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('a green resets the consecutive-red counter', () => {
		const dir = mkdtempSync(join(tmpdir(), 'dedalo-watchdog-'));
		try {
			probe(dir, true);
			for (let cycle = 0; cycle < 3; cycle++) {
				for (let red = 1; red < THRESHOLD; red++) expect(probe(dir, false).escalations).toBe(0);
				expect(probe(dir, true).code).toBe(0);
			}
			expect(
				probe(dir, false).escalations,
				'intermittent reds accumulated into a recycle — only CONSECUTIVE reds may',
			).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
