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
 * THE RULE. Every injected `custom_action_dispatch` either compares the
 * authenticated identity against the page's before resolving anything, or is
 * listed here with the reason it has no page identity to lose. The dispatch
 * REPLACES the login component's whole post-login flow (login.js: "stop here!"),
 * so each one is its own decision about what happens next.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SCAN_ROOTS = ['client', 'tools'] as const;

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
		const comparesIdentity =
			/api_response\??\.?(?:\?\.)?user_id|result_options\?\.user_id/.test(body) &&
			body.includes('page_globals') &&
			/location\.reload\(\)/.test(body);
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
				'then names the wrong person. Compare `api_response.result_options.user_id` against ' +
				'`page_globals.user_id` and reload on a mismatch, or add an entry to ' +
				`EXEMPT_DISPATCHES saying which page identity it has none of.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	test('the key the guard reads is the key the login handler emits', () => {
		// A source census cannot catch a guard reading a key the server never
		// sends — which is exactly how the first version of this fix shipped
		// INERT. Pin the two halves against each other.
		const handler = readFileSync(join(REPO_ROOT, 'src/core/api/handlers/dd_utils_api.ts'), 'utf8');
		expect(
			/extend:\s*\{\s*user_id:/.test(handler),
			'src/core/api/handlers/dd_utils_api.ts no longer answers the login with `extend: { user_id }`. ' +
				'The re-login guard reads `api_response.user_id` on the strength of this — if the shape ' +
				'moved, the guard is inert again and the audit trail silently names the wrong person.',
		).toBe(true);
		// ...and it is NOT the PHP-era nesting, which is what made the guard inert.
		expect(handler).not.toContain('result_options');
	});

	test('no exemption is stale', () => {
		const files = new Set(dispatches.map((entry) => entry.file));
		const stale = Object.keys(EXEMPT_DISPATCHES).filter((file) => !files.has(file));
		expect(stale).toEqual([]);
	});

	test('the relogin overlay reloads rather than resuming across an identity change', () => {
		// The positive pin: it must not merely READ the ids, it must refuse to
		// resolve `on_success` when they differ.
		const src = readFileSync(
			join(REPO_ROOT, 'client/dedalo/core/login/js/render_login.js'),
			'utf8',
		);
		const dispatch = src.slice(src.indexOf('custom_action_dispatch\t: function('));
		const guard = dispatch.slice(0, dispatch.indexOf('login_instance.destroy'));
		// THE KEY THE SERVER ACTUALLY EMITS. Envelope v2 puts extension keys at
		// top level, so the login handler's user_id arrives as `api_response.user_id`
		// — see the sibling test, which reads the handler itself.
		expect(guard).toContain('api_response?.user_id');
		expect(guard).toContain('page_globals');
		expect(guard).toContain('window.location.reload()');
		// FAIL CLOSED: an unresolvable identity is not a verified match. Pin the
		// CONDITION, not the variable — declaring `identity_unknown` and then not
		// branching on it reads as closed and behaves as open.
		expect(guard.replace(/\s+/g, ' ')).toContain('identity_differs || identity_unknown');
		// The guard must come BEFORE the resolve, or it protects nothing.
		expect(guard).not.toContain('on_success(');
	});
});
