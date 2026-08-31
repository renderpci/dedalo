/**
 * TRIPWIRE — the shipped stacks carry the operational policy the engine assumes
 * (P2-33 / OPS-10, OPS-11, OPS-12).
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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const STACKS = ['docker-compose.yml', 'docker-compose.simple.yml'] as const;
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

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

	test('anti-vacuity: the service slices are real', () => {
		for (const stack of STACKS) {
			const service = dedaloService(stack);
			expect(service.length, `${stack}: empty dedalo slice`).toBeGreaterThan(200);
			expect(service).toContain('restart: unless-stopped');
		}
	});
});
