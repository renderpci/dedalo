/**
 * sequenceVerdict — the PURE per-table decision extracted out of
 * checkSequences (plan §4.1.7), plus the SEQUENCE_SKIP_TABLES membership
 * contract.
 *
 * checkSequences() itself is NEVER called from a gate: it fires
 * `SELECT setval('public.<table>_id_seq', <lastId>, true)` on what is a panel
 * READ path (plan §4.4 D2, ledgered in the function header), so calling it
 * would advance sequences in the shared suite database.
 *
 * The extraction is REWIRED, not copied — the last test asserts the inline
 * predicates are gone from checkSequences, because an extraction that leaves
 * the original live gates a copy of the decision and nothing else.
 */

import { describe, expect, test } from 'bun:test';
import {
	SEQUENCE_SKIP_TABLES,
	sequenceVerdict,
} from '../../src/core/area_maintenance/widgets/sequences_status.ts';

describe('sequenceVerdict truth table', () => {
	test('a sequence BEHIND its table needs a setval — compared NUMERICALLY', () => {
		// The killer case: lexically '10' < '9', so a string compare would call
		// this healthy and the next INSERT would collide on the PK.
		const verdict = sequenceVerdict('10', '9', '1');
		expect(verdict.needsSetval).toBe(true);
		expect(verdict.advisoryMismatch).toBe(true);
		expect(verdict.warnStartValue).toBe(false);
		expect(verdict.resultFalse).toBe(false);
	});

	test('a sequence AHEAD of its table is advisory only, never a setval and never a failure', () => {
		// Normal after deletes: the sequence has burned ids the table no longer holds.
		const verdict = sequenceVerdict('9', '10', '1');
		expect(verdict.needsSetval).toBe(false);
		expect(verdict.advisoryMismatch).toBe(true);
		expect(verdict.resultFalse).toBe(false);
	});

	test('an in-sync sequence with start_value 1 is fully clean', () => {
		const verdict = sequenceVerdict('42', '42', '1');
		expect(verdict).toEqual({
			advisoryMismatch: false,
			needsSetval: false,
			warnStartValue: false,
			resultFalse: false,
		});
	});

	test('start_value != 1 is the ONLY arm that flips result to false', () => {
		const verdict = sequenceVerdict('42', '42', '8');
		expect(verdict.warnStartValue).toBe(true);
		expect(verdict.resultFalse).toBe(true);
		// ...and it is independent of the id/last_value comparison.
		expect(verdict.advisoryMismatch).toBe(false);
		expect(verdict.needsSetval).toBe(false);
	});

	test('the setval arm alone never flips result (PHP reports it, does not fail on it)', () => {
		const verdict = sequenceVerdict('10', '9', '1');
		expect(verdict.needsSetval).toBe(true);
		expect(verdict.resultFalse).toBe(false);
	});

	test('start_value 1 and a behind-sequence combine independently', () => {
		const behindAndBadStart = sequenceVerdict('100', '7', '3');
		expect(behindAndBadStart).toEqual({
			advisoryMismatch: true,
			needsSetval: true,
			warnStartValue: true,
			resultFalse: true,
		});
	});

	test('equal-but-differently-spelled values: the advisory is a STRING compare, the setval a numeric one', () => {
		// pg_sequences last_value NULL stringifies to 'null'; Number('null') is NaN,
		// so no setval is proposed, but the report line still flags the mismatch.
		const verdict = sequenceVerdict('7', 'null', '1');
		expect(verdict.advisoryMismatch).toBe(true);
		expect(verdict.needsSetval).toBe(false);
	});
});

describe('SEQUENCE_SKIP_TABLES membership', () => {
	test('matrix_counter and matrix_counter_dd are skipped — their value column is NOT an id sequence', () => {
		expect(SEQUENCE_SKIP_TABLES.has('matrix_counter')).toBe(true);
		expect(SEQUENCE_SKIP_TABLES.has('matrix_counter_dd')).toBe(true);
	});

	test('the remaining PHP-skipped tables are skipped', () => {
		for (const table of ['session_data', 'temp', 'relations', 'relations_DES']) {
			expect(SEQUENCE_SKIP_TABLES.has(table)).toBe(true);
		}
		expect(SEQUENCE_SKIP_TABLES.size).toBe(6);
	});

	test('the real id-bearing matrix tables are NOT skipped', () => {
		for (const table of ['matrix', 'matrix_dd', 'matrix_time_machine', 'matrix_users']) {
			expect(SEQUENCE_SKIP_TABLES.has(table)).toBe(false);
		}
	});

	test('membership is exact, not prefix-based', () => {
		// A `startsWith('matrix_counter')` skip rule would swallow this one too.
		expect(SEQUENCE_SKIP_TABLES.has('matrix_counter_history')).toBe(false);
		expect(SEQUENCE_SKIP_TABLES.has('relations_des')).toBe(false); // case-exact
	});
});

describe('the extraction is REWIRED, not duplicated', () => {
	test('checkSequences holds no inline copy of the verdict predicates', async () => {
		const source = await Bun.file(
			new URL('../../src/core/area_maintenance/widgets/sequences_status.ts', import.meta.url),
		).text();
		const body = source.slice(source.indexOf('export async function checkSequences'));
		expect(body).not.toBe('');
		// It calls the extraction...
		expect(body).toContain('sequenceVerdict(lastId, lastValue, startValue)');
		// ...and the inline decisions are gone (an extraction that leaves the
		// original live gates a copy and nothing that ships).
		expect(body).not.toContain('Number(lastId) > Number(lastValue)');
		expect(body).not.toContain("startValue !== '1'");
		expect(body).not.toContain('lastValue !== lastId');
	});
});
