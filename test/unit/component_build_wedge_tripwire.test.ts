/**
 * TRIPWIRE — a component build never wedges forever (P2-1 / CLI-05).
 *
 * `component_common.build` used an ASYNC PROMISE EXECUTOR:
 * `new Promise(async (resolve) => { const result = await do_build(...) ... })`.
 * Biome names the shape `suspicious/noAsyncPromiseExecutor`, and this is what it
 * costs: a throw inside `do_build` becomes an ORPHAN REJECTION. Nothing rejects
 * `_build_waiter`, so it NEVER SETTLES, `status` stays 'building' forever, and
 * every later `build()` returns that same dead promise. The component is wedged
 * for the life of the page and no error reaches anywhere a curator can see.
 *
 * An async function already returns a promise, so the executor bought nothing
 * and cost the entire rejection path.
 *
 * A FAILED BUILD IS NOT A BUILT ONE. The obvious repair — try/finally marking
 * 'built' either way — trades the wedge for a lie: every later build() would
 * return true without rebuilding, leaving the component empty and declaring
 * itself fine. So the catch RESETS status, clears the waiter so a retry is
 * possible, records `build_error`, publishes `built_<id>` as a RELEASE (not a
 * success — render()'s 'building' branch waits on that event and would
 * otherwise park forever), and rethrows.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// String-literal aware, and comment-stripping — this file's own fix quotes the
// old `new Promise(async …)` in a comment to record what changed, so an
// unstripped match finds the QUOTATION and reports the defect present.
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const COMPONENT_COMMON = 'client/dedalo/core/component_common/js/component_common.js';

const read = (): string => readFileSync(join(REPO_ROOT, COMPONENT_COMMON), 'utf8');

/** The body of component_common.prototype.build, bounded to its definition. */
function buildBody(): string {
	const source = read();
	const start = source.indexOf('component_common.prototype.build = async function');
	expect(start, 'build definition not found — the gate is reading nothing').toBeGreaterThan(-1);
	const end = source.indexOf('//end component_common.prototype.build', start);
	expect(end).toBeGreaterThan(start);
	return stripComments(source.slice(start, end));
}

describe('a component build never wedges', () => {
	test('no async Promise executor', () => {
		const body = buildBody();
		expect(body.length).toBeGreaterThan(300);
		expect(
			body,
			'new Promise(async …) — a throw inside becomes an orphan rejection, _build_waiter ' +
				"never settles, and status stays 'building' for the life of the page",
		).not.toMatch(/new Promise\(\s*async/);
	});

	test('the failure path resets rather than claiming success', () => {
		const body = buildBody();
		const failure = body.slice(body.indexOf('catch'));
		expect(body, 'no catch at all — the rejection path is still unhandled').toMatch(/catch\s*\(/);
		// Reset, so a later build() can genuinely retry.
		expect(failure).toMatch(/self\.status\s*=\s*null/);
		expect(failure).toMatch(/self\._build_waiter\s*=\s*null/);
		// Recorded, so the failure is inspectable.
		expect(failure).toMatch(/self\.build_error\s*=\s*error/);
		// Rethrown, so callers see it instead of an undefined result.
		expect(failure).toMatch(/throw error/);
	});

	test('waiters are released even when the build fails', () => {
		// render()'s 'building' branch subscribes to built_<id>. Without a publish
		// on the failure path it parks forever — the wedge moved rather than fixed.
		const failure = buildBody().slice(buildBody().indexOf('catch'));
		expect(failure).toMatch(/event_manager\.publish\('built_'/);
	});

	test("success still marks 'built' and publishes", () => {
		// The happy path must be unchanged: a gate that only checks the failure
		// path would accept a build that never reports success.
		const body = buildBody();
		const success = body.slice(body.indexOf('const result = await do_build'));
		expect(success.slice(0, 400)).toMatch(/self\.status\s*=\s*'built'/);
		expect(success.slice(0, 400)).toMatch(/event_manager\.publish\('built_'/);
	});
});
