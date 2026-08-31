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
const DISPATCH_DEFINITION = /custom_action_dispatch\s*[:=]\s*(?:async\s+)?function\s*\(/g;

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

function dispatchFiles(): { file: string; comparesIdentity: boolean }[] {
	const found: { file: string; comparesIdentity: boolean }[] = [];
	for (const file of scanFiles()) {
		const src = readFileSync(join(REPO_ROOT, file), 'utf8');
		DISPATCH_DEFINITION.lastIndex = 0;
		if (!DISPATCH_DEFINITION.test(src)) continue;
		// An identity comparison reads BOTH the authenticated id and the page's,
		// and does something other than continue.
		const comparesIdentity =
			src.includes('result_options?.user_id') &&
			src.includes('page_globals') &&
			/location\.reload\(\)/.test(src);
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
		expect(guard).toContain('result_options?.user_id');
		expect(guard).toContain('page_globals');
		expect(guard).toContain('window.location.reload()');
		// The guard must come BEFORE the resolve, or it protects nothing.
		expect(guard).not.toContain('on_success(');
	});
});
