/**
 * TRIPWIRE — the shipped stacks carry the operational policy the engine assumes
 * (P2-33 / OPS-09, OPS-10, OPS-11, OPS-12).
 *
 * OPS-09. The engine's self-diagnosis assumes an external actor ("the watchdog
 * must recycle this process"). Under Compose a healthcheck has exactly two
 * consumers — start ordering and the `(unhealthy)` string in `docker ps`;
 * Docker Engine never restarts an unhealthy container and `restart:
 * unless-stopped` fires on process EXIT, which a poisoned or wedged process
 * never does. So NOTHING consumed /health's 503 on the deployment the installer
 * builds. Every shipped stack must now probe /health through the escalating
 * watchdog, at a threshold that EQUALS its own `retries`, and the systemd unit
 * must pull its health timer in rather than leaving it to a typed command.
 *
 * OPS-10. `SERVER_SHUTDOWN_GRACE_MS` defaults to 10000 and the config catalog
 * states the relation as a RULE: "Keep it BELOW the stop timeout of whatever
 * supervises the process, or the supervisor will kill the server before the
 * drain has finished — which defeats the purpose." Docker's default
 * stop_grace_period is 10s. EXACTLY EQUAL is not below: a restart that
 * genuinely needs the drain is SIGKILLed at the boundary, before
 * interruptLive() and closeDatabasePool() run, so a curator mid-save is cut off
 * by a routine `compose up -d` — the one thing the drain exists to prevent.
 *
 * OPS-11. The museum installer's stack omitted the three DB ops keys the
 * reference stack sets, landing operators on the unsafe side of a decision the
 * project had already made.
 *
 * OPS-12. Both stacks enable DEDALO_ACCESS_LOG and neither capped the log
 * driver. Docker's json-file default is UNBOUNDED and writes under
 * /var/lib/docker — the same volume as the database — so an access-logged
 * install fills the host disk and takes Postgres down with it.
 *
 * THE LIMIT OF THIS GATE, stated rather than implied: it reads the shipped
 * compose files and the catalog, exactly as the audit did. Nothing here was
 * measured against a running stack.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { shippedComposeStacks } from '../helpers/deploy_artifact_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

const STACKS = shippedComposeStacks();

const WATCHDOG = 'scripts/ops/container_watchdog.sh';

/** The `dedalo` service block of a compose file. */
function dedaloService(stack: string): string {
	const source = read(stack);
	const start = source.indexOf('\n  dedalo:');
	expect(start, `${stack}: no dedalo service`).toBeGreaterThan(-1);
	const next = source.indexOf('\n  ', source.indexOf('\n', start + 3));
	let end = start + 1;
	for (const match of source.slice(start + 3).matchAll(/\n {2}[a-z_]+:/g)) {
		end = start + 3 + (match.index as number);
		break;
	}
	void next;
	return source.slice(start, end);
}

/** Seconds in a compose duration like `30s` / `1m30s`. */
function seconds(value: string): number {
	let total = 0;
	for (const part of value.matchAll(/(\d+)([hms])/g)) {
		const n = Number(part[1]);
		total += part[2] === 'h' ? n * 3600 : part[2] === 'm' ? n * 60 : n;
	}
	return total;
}

describe('the shipped stacks keep the rules the engine states', () => {
	test('the supervisor OUTLASTS the drain, in every stack', () => {
		// The catalog's default, read from the catalog rather than assumed.
		const catalog = read('src/config/catalog/server.ts');
		const block = catalog.slice(catalog.indexOf('SERVER_SHUTDOWN_GRACE_MS:'));
		const drainMs = Number(/default:\s*(\d+)/.exec(block.slice(0, 400))?.[1]);
		expect(drainMs, 'SERVER_SHUTDOWN_GRACE_MS has no numeric default any more').toBeGreaterThan(0);

		for (const stack of STACKS) {
			const service = dedaloService(stack);
			const grace = /stop_grace_period:\s*(\S+)/.exec(service)?.[1];
			expect(
				grace,
				`${stack}: dedalo sets no stop_grace_period — Docker's 10s default EQUALS` +
					' the drain, so the drain is SIGKILLed at the boundary',
			).toBeDefined();
			expect(
				seconds(grace as string) * 1000,
				`${stack}: stop_grace_period must EXCEED SERVER_SHUTDOWN_GRACE_MS (${drainMs}ms), ` +
					'not equal it',
			).toBeGreaterThan(drainMs);
		}
	});

	test('the museum stack is not configured worse than the reference one', () => {
		// OPS-11 is a DIVERGENCE, so the assertion is a comparison: whatever DB ops
		// keys the reference sets, the simple stack sets too.
		const keysOf = (stack: string): string[] =>
			[...read(stack).matchAll(/^ {6}(DB_[A-Z_]+):/gm)].map((m) => m[1] as string).sort();
		const reference = keysOf('docker-compose.yml');
		const simple = new Set(keysOf('docker-compose.simple.yml'));
		expect(reference.length).toBeGreaterThan(3);
		const missing = reference.filter((key) => !simple.has(key));
		expect(
			missing,
			"the museum installer's stack omits DB ops keys the reference stack sets — operators " +
				`land on the unsafe side of a decision already made:\n  ${missing.join('\n  ')}`,
		).toEqual([]);
	});

	test('an access-logged stack caps its log driver', () => {
		for (const stack of STACKS) {
			const source = read(stack);
			if (!/DEDALO_ACCESS_LOG:\s*"true"/.test(source)) continue;
			const service = dedaloService(stack);
			expect(
				service,
				`${stack}: DEDALO_ACCESS_LOG is on and the log driver is uncapped. Docker's ` +
					'json-file default is UNBOUNDED and writes under /var/lib/docker — the same ' +
					'volume as the database.',
			).toMatch(/logging:/);
			expect(service).toMatch(/max-size:/);
			expect(service).toMatch(/max-file:/);
		}
	});

	test("every shipped stack's engine probes /health, and the probe ACTS", () => {
		// Three properties, because two of them alone are what the audit found:
		// a probe with no action, and an action with no probe.
		for (const stack of STACKS) {
			const service = dedaloService(stack);
			const probe = /healthcheck:[\s\S]*?test:\s*(\[.*\]|.+)/.exec(service)?.[1] ?? '';
			// WHAT THE PROBE ULTIMATELY CURLS. Either the compose line names
			// /health itself, or it delegates to the watchdog — whose own default
			// probe must then be the one that names it.
			const probed = probe.includes(WATCHDOG) ? `${probe}\n${read(WATCHDOG)}` : probe;
			expect(probed, `${stack}: dedalo's health probe never reaches /health`).toContain(
				'http://localhost/health',
			);
			expect(
				probe,
				`${stack}: the health probe does not run ${WATCHDOG}, so nothing CONSUMES the 503 — ` +
					'Docker Engine never restarts an unhealthy container and `restart: unless-stopped` ' +
					'fires on EXIT, which a poisoned or wedged process never does',
			).toContain(WATCHDOG);
			expect(
				service,
				`${stack}: the escalation lands on the restart policy, so the policy must be there`,
			).toMatch(/restart:\s*unless-stopped/);
			expect(
				/healthcheck:[\s\S]*?retries:\s*(\d+)/.exec(service)?.[1],
				`${stack}: the health probe declares no failure threshold`,
			).toBeDefined();
		}
	});

	test('the escalation threshold is the same number in the script and in every stack', () => {
		const script = read(WATCHDOG);
		const threshold = Number(/^WATCHDOG_THRESHOLD=(\d+)$/m.exec(script)?.[1]);
		expect(threshold, `${WATCHDOG}: no literal WATCHDOG_THRESHOLD any more`).toBeGreaterThan(0);
		for (const stack of STACKS) {
			const retries = Number(
				/healthcheck:[\s\S]*?retries:\s*(\d+)/.exec(dedaloService(stack))?.[1],
			);
			expect(
				retries,
				`${stack}: compose recycles after ${retries} reds and the script escalates after ` +
					`${threshold} — the two halves of one cadence must not drift`,
			).toBe(threshold);
		}
	});

	test('the watchdog script is runnable and inside the image', () => {
		const mode = statSync(join(REPO_ROOT, WATCHDOG)).mode;
		expect(
			mode & 0o111,
			`${WATCHDOG} is not executable — COPY preserves the mode, so the healthcheck would fail ` +
				'open on every container and the stack would look permanently unhealthy',
		).toBeGreaterThan(0);
		// The Dockerfile copies an ALLOWLIST of top-level entries; a healthcheck
		// pointing at a path the image does not carry is a probe that can never run.
		const top = WATCHDOG.split('/')[0] as string;
		expect(
			read('Dockerfile'),
			`Dockerfile: the build-context allowlist does not COPY ${top}/, so ${WATCHDOG} is not in the image`,
		).toMatch(new RegExp(`^COPY ${top} `, 'm'));
	});

	test('the systemd unit pulls its health consumer in with itself', () => {
		const unit = read('deploy/dedalo-ts.service');
		// systemd's WatchdogSec needs sd_notify, which Bun does not speak; the curl
		// timer IS the watchdog here — but a timer nobody enabled consumes nothing.
		expect(
			unit,
			'deploy/dedalo-ts.service: no Wants= on the health timer — the server would run with no ' +
				'consumer for its own 503 unless an operator typed a second enable command',
		).toMatch(/^Wants=dedalo-ts-watchdog\.timer$/m);
		expect(
			unit,
			'deploy/dedalo-ts.service: [Install] does not Also= the health timer, so `systemctl enable ' +
				'dedalo-ts` leaves the watchdog disabled',
		).toMatch(/^Also=dedalo-ts-watchdog\.timer$/m);
		for (const file of ['deploy/dedalo-ts-watchdog.timer', 'deploy/dedalo-ts-watchdog.service']) {
			expect(read(file).length, `${file}: empty`).toBeGreaterThan(100);
		}
	});

	test('census floor: the walk really found the shipped stacks', () => {
		// The floor lives HERE, in a live test, and not only inside the helper:
		// a floor a helper carries is only asserted where the helper is called.
		expect(
			STACKS.length,
			'census floor: the repo ships at least two compose stacks',
		).toBeGreaterThan(1);
	});

	test('anti-vacuity: the service slices are real', () => {
		for (const stack of STACKS) {
			const service = dedaloService(stack);
			expect(service.length, `${stack}: empty dedalo slice`).toBeGreaterThan(200);
			expect(service).toContain('restart: unless-stopped');
		}
	});
});
