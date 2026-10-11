/**
 * PROVENANCE SURVIVES A RE-LOGIN (P1-19 / CLI-09).
 *
 * THE DEFECT. The re-login overlay appears when a session dies MID-USE, on a
 * page that may be holding a queued save. Its `custom_action_dispatch` destroyed
 * the overlay and resolved `on_success` with NO check that the account which
 * just authenticated is the account the page belongs to.
 *
 * So after a relogin as a different user B, A's queued save commits under B's
 * session: A's text lands on the record with B as the author in the Time Machine
 * audit and the `modified_by` stamp, while the page keeps A's menu, A's
 * `is_developer` and A's cached structure contexts until the next full load.
 *
 * Server-side authorization is intact throughout — nothing is granted that
 * should not be. What is lost is PROVENANCE, and in a heritage archive the
 * question "who changed this" is part of the record, not metadata about it.
 *
 * THE RULE. Every injected `custom_action_dispatch` either goes through the one
 * identity door (below) before resolving anything, or is listed here with the
 * reason it has no page identity to lose. The dispatch
 * REPLACES the login component's whole post-login flow (login.js: "stop here!"),
 * so each one is its own decision about what happens next.
 *
 * THE ONE DOOR (LEAD-2 + CLIENT-5, 2026-10-11). The overlay guard was right and
 * still protected nothing: `error_dispatch.relogin()` resolved `recovered:true`
 * from a `login_successful` SUBSCRIBER, and login.js publishes that event BEFORE
 * it calls the injected dispatch — so every queued save and `build_autoload`
 * retried as B while the guard was still deciding to reload.
 *
 * The first repair then decided identity TWICE — in the overlay guard and again
 * in the recovery promise — and each copy masked the other: removing either
 * check left every outcome gate green, so neither was load-bearing. Now there is
 * ONE decision site, `error_dispatch.settle_relogin_attempt(api_response)` →
 * `'resume' | 'retry_form' | 'refused'`: it alone calls `relogin_identity`,
 * latches or clears the page identity, settles the pending recovery and reloads.
 * The overlay is TRANSPORT — it hands the envelope to the door and resumes only
 * on `'resume'`. `login_successful` is a notification and never an authorisation
 * to resume: zero subscribers, and Mocha case (m) fences the OUTCOME (the event
 * moves no queued save and no recovery, whatever a subscriber's spelling).
 *
 * THE CENSUS below keeps it ONE door: the four identity primitives
 * (`relogin_identity`, `revoke_page_identity`, `clear_page_identity_revoked`,
 * `reload_page`) are called — or imported, so an alias cannot hide a call — only
 * in error_dispatch.js and the client test suite. A second caller is a second
 * decision site, which is exactly the masking pair this replaced.
 *
 * THE OUTCOME GATES are the Mocha suite
 * client/dedalo/test/client/js/test_relogin_identity.js (`bun run test:client`):
 * a real component save and a real build_autoload, a real overlay dispatched as
 * another user, the number of requests that followed, and the transport latch
 * (case s); and test/unit/relogin_identity_wire_native.test.ts: the key the
 * client primitive reads, measured on a real login body. This file is the
 * census that keeps every dispatch, and the door itself, in that shape.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SCAN_ROOTS = ['client', 'tools'] as const;
const ERROR_DISPATCH = 'client/dedalo/core/common/js/error_dispatch.js';

/** A handler INJECTED as the post-login flow — not the plumbing that carries it. */
const DISPATCH_DEFINITION =
	/custom_action_dispatch\s*[:=]\s*(?:async\s+)?(?:function\s*\(|\([^)]*\)\s*=>|[A-Za-z0-9_$]+\s*=>)/g;

/**
 * Dispatches with no page identity to protect, each with the reason. SHRINK-ONLY.
 */
const EXEMPT_DISPATCHES: Readonly<Record<string, string>> = {
	'client/dedalo/core/installer/js/render_installer.js':
		'THE INSTALL WIZARD, which authenticates a box that has no session, no page_globals.user_id and no queued save — there is no previous identity for a re-login to differ from. It also never resolves a pending user action: it reveals the next wizard step.',
};

function scanFiles(): string[] {
	const files: string[] = [];
	for (const dir of SCAN_ROOTS) {
		const glob = new Glob('**/*.js');
		for (const match of glob.scanSync({ cwd: join(REPO_ROOT, dir) })) {
			files.push(relative(REPO_ROOT, join(REPO_ROOT, dir, match)));
		}
	}
	return files.sort();
}

/** Source without block and line comments (a comment naming a call is not a call). */
function stripComments(src: string): string {
	return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
}

/**
 * The body of the injected dispatch — from its definition to the end of the
 * enclosing function literal, bounded so a match elsewhere in a 2,000-line
 * render file cannot stand in for one inside the handler.
 */
function dispatchBody(src: string): string {
	DISPATCH_DEFINITION.lastIndex = 0;
	const match = DISPATCH_DEFINITION.exec(src);
	if (match === null) return '';
	return src.slice(match.index, match.index + 3000);
}

function dispatchFiles(): { file: string; comparesIdentity: boolean }[] {
	const found: { file: string; comparesIdentity: boolean }[] = [];
	for (const file of scanFiles()) {
		const src = readFileSync(join(REPO_ROOT, file), 'utf8');
		DISPATCH_DEFINITION.lastIndex = 0;
		if (!DISPATCH_DEFINITION.test(src)) continue;
		// The COMPARISON, not one key spelling. An earlier version of this gate
		// required `result_options?.user_id` — the PHP-era path, which the TS
		// server never emits — so it was GREEN over an inert guard and would have
		// gone RED on the correct fix. It now accepts either accessor and looks
		// only inside the dispatch body, so an unrelated `location.reload()`
		// elsewhere in the file cannot satisfy it.
		const body = dispatchBody(src);
		// Through the ONE door (error_dispatch.js `settle_relogin_attempt`), which
		// alone decides, latches, settles and reloads. An inline comparison is a
		// second decision site — refused here AND by the census below.
		const comparesIdentity = body.includes('settle_relogin_attempt(');
		found.push({ file, comparesIdentity });
	}
	return found;
}

describe('re-login identity — a queued save must not change author', () => {
	const dispatches = dispatchFiles();

	test('the scan finds the injected dispatches (anti-vacuity)', () => {
		expect(dispatches.length).toBeGreaterThanOrEqual(2);
		const files = dispatches.map((entry) => entry.file);
		expect(files).toContain('client/dedalo/core/login/js/render_login.js');
		expect(files).toContain('client/dedalo/core/installer/js/render_installer.js');
	});

	test('every injected dispatch compares identity, or is exempt with a reason', () => {
		const offenders = dispatches
			.filter((entry) => !entry.comparesIdentity && EXEMPT_DISPATCHES[entry.file] === undefined)
			.map((entry) => entry.file);
		expect(
			offenders,
			'A post-login dispatch that resolves a pending action without checking WHO logged in ' +
				"commits the previous user's queued edit under the new user's name — the audit trail " +
				'then names the wrong person. Hand the envelope to `settle_relogin_attempt(api_response)` ' +
				"(error_dispatch.js) and resume only on 'resume', or add an entry to " +
				`EXEMPT_DISPATCHES saying which page identity it has none of.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	// THE KEY THE GUARD READS IS THE KEY THE LOGIN EMITS — gated as an OUTCOME in
	// relogin_identity_wire_native.test.ts (a real login over HTTP, the real
	// client primitive asked about the parsed body), not by spelling here: a
	// spelling pin on the handler and the primitive stayed green with the key
	// moved on the wire.

	test('no exemption is stale', () => {
		const files = new Set(dispatches.map((entry) => entry.file));
		const stale = Object.keys(EXEMPT_DISPATCHES).filter((file) => !files.has(file));
		expect(stale).toEqual([]);
	});

	test('ONE decision site: the identity primitives are called only by error_dispatch.js', () => {
		// A second caller of any of them is a second place that decides who logged
		// in — the masking pair (overlay guard + recovery promise) this replaced.
		// Imports count too: `import {relogin_identity as decide}` hides every call.
		const PRIMITIVES = [
			'relogin_identity',
			'revoke_page_identity',
			'clear_page_identity_revoked',
			'reload_page',
		] as const;
		const allowed = (file: string): boolean =>
			file === ERROR_DISPATCH || file.startsWith('client/dedalo/test/');
		const offenders: string[] = [];
		let seenInDoor = 0;
		for (const file of scanFiles()) {
			const code = stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'));
			for (const name of PRIMITIVES) {
				const called = new RegExp(`(?<![\\w$])${name}\\s*\\(`).test(code);
				const imported = new RegExp(
					`import\\s*\\{[^}]*(?<![\\w$])${name}(?![\\w$])[^}]*\\}\\s*from\\s*['"][^'"]*error_dispatch\\.js['"]`,
				).test(code);
				if (file === ERROR_DISPATCH && called) seenInDoor++;
				if (!allowed(file) && (called || imported)) {
					offenders.push(`${file}: ${called ? 'calls' : 'imports'} ${name}`);
				}
			}
		}
		// anti-vacuity: the door itself must be where the calls are
		expect(seenInDoor, `${ERROR_DISPATCH} calls none of the identity primitives`).toBeGreaterThan(
			0,
		);
		expect(
			offenders,
			'An identity primitive used outside error_dispatch.js is a SECOND decision site: route it ' +
				'through `settle_relogin_attempt(api_response)` (resume | retry_form | refused) instead.',
		).toEqual([]);
	});

	test('the door exists and is the only caller of relogin_identity in error_dispatch.js', () => {
		// the //end marker is itself a comment: locate on the raw source, judge the
		// comment-stripped slices
		const raw = readFileSync(join(REPO_ROOT, ERROR_DISPATCH), 'utf8');
		expect(raw, `${ERROR_DISPATCH}: export const settle_relogin_attempt not found`).toMatch(
			/export\s+const\s+settle_relogin_attempt\s*=/,
		);
		const start = raw.indexOf('export const settle_relogin_attempt');
		const end = raw.indexOf('//end settle_relogin_attempt', start);
		expect(end, `${ERROR_DISPATCH}: //end settle_relogin_attempt marker not found`).toBeGreaterThan(
			start,
		);
		const door = stripComments(raw.slice(start, end));
		const outside = stripComments(raw.slice(0, start) + raw.slice(end));
		expect(door).toMatch(/(?<![\w$])relogin_identity\s*\(/);
		expect(
			(outside.match(/(?<![\w$])relogin_identity\s*\(/g) ?? []).length,
			'relogin_identity is called outside settle_relogin_attempt — a second decision site in the module',
		).toBe(0);
	});

	test('zero login_successful subscribers in client/ and tools/', () => {
		// The event is published BEFORE the door decides: a subscriber that resumes
		// work on it resumes as whoever logged in. (The OUTCOME fence is Mocha case
		// (m); this is the spelling half, cheap and loud.)
		const offenders = scanFiles().filter((file) =>
			/subscribe\(\s*['"`]login_successful['"`]/.test(
				stripComments(readFileSync(join(REPO_ROOT, file), 'utf8')),
			),
		);
		expect(offenders).toEqual([]);
	});
});
