/**
 * TRIPWIRE — a client action reads its OWN OUTCOME before committing
 * (P2-2 / CLI-04).
 *
 * `ts_object.swap_parent` fired `update_parent_data` WITHOUT awaiting it, then
 * committed the re-parent locally regardless: instance reassignment, rekey,
 * destroy-cascade move between `ar_instances`, `appendChild`, `virtual_order`
 * recompute. The `.then()` it attached showed an error notification and
 * REVERTED NOTHING.
 *
 * So on a server failure a curator saw an error toast AND a thesaurus tree
 * showing the term under its new parent — the client and the database
 * disagreeing about where a heritage record sits, with the screen asserting the
 * version that did not happen. The next reload silently undoes it, which is the
 * worst way to find out.
 *
 * The audit's diagnosis was exact: the server side is atomic and correct, so the
 * divergence was entirely the client's refusal to wait. The fix is to wait, and
 * to refuse BEFORE anything local changes — then the tree stays as the server
 * still has it, and screen and database agree.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const TS_OBJECT = 'client/dedalo/core/ts_object/js/ts_object.js';

const read = (): string => readFileSync(join(REPO_ROOT, TS_OBJECT), 'utf8');

/** The body of swap_parent, bounded to its own function. */
function swapParentBody(source: string): string {
	// THE DEFINITION, not the first mention. `swap_parent` is named in five JSDoc
	// blocks before it is defined, so indexOf() started the slice ~1500 lines
	// early and the ordering assertions below compared against unrelated code.
	const start = source.indexOf('ts_object.prototype.swap_parent = async function');
	expect(start, 'swap_parent not found — the gate is reading nothing').toBeGreaterThan(-1);
	const end = source.indexOf('//end swap_parent', start);
	return source.slice(start, end === -1 ? start + 8000 : end);
}

describe('a re-parent commits only after the server agrees', () => {
	test('the server call is AWAITED, not fired and forgotten', () => {
		const body = swapParentBody(read());
		expect(body.length).toBeGreaterThan(500);
		expect(
			body,
			'update_parent_data is called without await — the local commit runs regardless of ' +
				'whether the server accepted the move',
		).toMatch(/await self\.update_parent_data\(/);
	});

	test('a failure returns BEFORE any local mutation', () => {
		// The ordering is the whole invariant. Every local mutation must come
		// after the refusal, or a failed move still half-lands on screen.
		const body = swapParentBody(read());
		const awaited = body.indexOf('await self.update_parent_data(');
		// The refusal that FOLLOWS the await, not the function's early guards —
		// swap_parent opens with several `return false` validity checks, and
		// indexOf() found the first of those instead (measured: index 281 against
		// an await at 2729, so this assertion failed on correct code).
		const refusal = body.indexOf('return false', awaited);
		expect(awaited).toBeGreaterThan(-1);
		for (const mutation of [
			'moving_instance.caller',
			'moving_instance.rekey()',
			'ar_instances.splice',
		]) {
			const at = body.indexOf(mutation);
			expect(at, `${mutation} not found — swap_parent changed shape`).toBeGreaterThan(-1);
			expect(
				at,
				`${mutation} runs BEFORE the awaited server call — a rejected move would still ` +
					'commit locally',
			).toBeGreaterThan(awaited);
		}
		expect(refusal).toBeGreaterThan(awaited);
	});

	test('the failure path still tells the curator', () => {
		// Refusing silently would trade one wrong screen for another.
		const body = swapParentBody(read());
		const failure = body.slice(body.indexOf('await self.update_parent_data('));
		expect(failure.slice(0, 1800)).toMatch(/response_data\(api_response\)/);
		expect(failure.slice(0, 1800)).toMatch(/type\s*:\s*'error'/);
	});

	test('the doc states the contract the code now keeps', () => {
		// The old block said "(!) Note: the await is intentionally omitted … the
		// caller attaches a .then() handler" — accurate about the mechanism, wrong
		// about it being safe, and a stale comment is how the next reader restores
		// the defect. Matched on the ORIGINAL PHRASING, not on the words, because
		// the replacement quotes the old text to record what changed: an
		// unanchored search finds the quotation and reports the defect present.
		const source = read();
		expect(source).not.toMatch(/\(!\) Note: the await is intentionally omitted/);
		expect(source, 'the doc must say the caller awaits').toMatch(/The caller AWAITS this/);
	});
});
