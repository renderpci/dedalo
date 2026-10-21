/**
 * tool_numisdata_acquisition — the test seam can rebind commit_lots' write
 * targets ONLY to the shipped tipos or to `zz` scratch tipos
 * (`withAcquisitionSeamForTests`; the twin of ai_spend's seamLedger/seamLimits).
 *
 * The dd128 write census records this tool as `not-dd128` because every write
 * target is a module constant, never the payload. The seam is the one other way
 * to name a target; unbounded, it could point commit_lots at ANY section
 * (dd128 users among them) and the census verdict would rest on a promise.
 * OUTCOMES:
 *  S1 a seam naming a non-scratch tipo that is not the shipped one (dd128 as the
 *     lot section) is REFUSED before the work runs (internal.invariant);
 *  S2 a seam of shipped tipos, or of `zz` scratch tipos, runs the work;
 *  S3 the shipped targets themselves name no `dd` tipo — the census's
 *     `not-dd128` verdict, measured.
 *
 * SITUATION: none — nothing is written; the work callbacks only report that
 * they ran.
 */

import { describe, expect, test } from 'bun:test';
import { getTldFromTipo } from '../../src/core/ontology/tld.ts';
import {
	NUMISDATA_ACQUISITION_TARGETS,
	withAcquisitionSeamForTests,
} from '../../tools/tool_numisdata_acquisition/server/index.ts';

async function outcomeOf(targets: Record<string, string>): Promise<string> {
	let ran = false;
	const result = await withAcquisitionSeamForTests(
		{ targets: targets as unknown as typeof NUMISDATA_ACQUISITION_TARGETS },
		async () => {
			ran = true;
			return 'ran';
		},
	).then(
		(value) => value,
		(error: unknown) => (error as { code?: string }).code ?? String(error),
	);
	if (result !== 'ran') expect(ran).toBe(false);
	return result;
}

describe('the acquisition seam is scratch-only', () => {
	test('S1 a seam naming dd128 (or any non-shipped, non-zz tipo) is refused before the work runs', async () => {
		expect(await outcomeOf({ ...NUMISDATA_ACQUISITION_TARGETS, object: 'dd128' })).toBe(
			'internal.invariant',
		);
		expect(await outcomeOf({ ...NUMISDATA_ACQUISITION_TARGETS, imageSection: 'test3' })).toBe(
			'internal.invariant',
		);
	});

	test('S2 shipped tipos, and zz scratch tipos, run the work', async () => {
		expect(await outcomeOf({ ...NUMISDATA_ACQUISITION_TARGETS })).toBe('ran');
		const scratch = Object.fromEntries(
			Object.keys(NUMISDATA_ACQUISITION_TARGETS).map((field, index) => [field, `zzsq${index + 1}`]),
		);
		expect(await outcomeOf(scratch)).toBe('ran');
	});

	test('S3 the shipped targets name no dd tipo (the census not-dd128 verdict)', () => {
		const tipos = Object.values(NUMISDATA_ACQUISITION_TARGETS);
		expect(tipos.length).toBeGreaterThan(0);
		expect(tipos.filter((tipo) => getTldFromTipo(tipo) === 'dd')).toEqual([]);
	});
});
