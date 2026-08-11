/**
 * updateOntology — what a FAILED ontology import is allowed to claim
 * (CRAP defect D7, fixed 2026-08-09;
 * WC-2026-08-09-ontology-update-partial-restore).
 *
 * Every Phase-C failure branch used to set
 * `'Error. Import failed — previous state restored'`. Phase B snapshots
 * `matrix_ontology` / `matrix_dd` and nothing else, while Phase C provisions a
 * `matrix_ontology_main` registry record and the `<tld>0` dd_ontology root node
 * (+ its ontologytype grouper) BEFORE each TLD's row import — raw matrix writes
 * with no Time Machine trail, which `restoreSnapshots` cannot revert. The
 * message was therefore a FALSE statement about the database in exactly the
 * case where an operator acting on it (do nothing, the DB is fine) costs most.
 *
 * The fix chosen was the honest message, not a real rollback: reverting the
 * provisioning means a new DELETE path over the ontology tables on a pipeline
 * with no injectable seam. That stays open in the ledger; the lie does not.
 *
 * Pure function, no DB, no filesystem.
 */

import { expect, test } from 'bun:test';
import { restoreFailureMessage } from '../../src/core/ontology/ontology_update.ts';

test('nothing provisioned → the PHP byte message survives verbatim, and it is true (D7)', () => {
	const errors: string[] = ['some earlier import error'];
	const msg = restoreFailureMessage([], errors);

	expect(msg).toBe('Error. Import failed — previous state restored');
	// no unreverted objects ⇒ nothing added to errors.
	expect(errors).toEqual(['some earlier import error']);
});

test('a provisioned TLD downgrades the claim and NAMES what was not reverted (D7)', () => {
	const errors: string[] = [];
	const msg = restoreFailureMessage(['zz'], errors);

	expect(msg).toBe(
		'Error. Import failed — matrix rows restored; registry and dd_ontology state may be partial',
	);
	// the claim must never again be that the DB is back to its previous state.
	expect(msg).not.toContain('previous state restored');
	expect(errors).toEqual([
		'registry record (matrix_ontology_main) and dd_ontology root node NOT reverted for: zz — MANUAL REVIEW REQUIRED',
	]);
});

test('every provisioned TLD is listed, in order (D7)', () => {
	const errors: string[] = [];
	restoreFailureMessage(['zz', 'yy', 'xx'], errors);

	expect(errors[0]).toContain('for: zz, yy, xx —');
	expect(errors.length).toBe(1);
});

test('the false claim is gone from every failure branch of updateOntology (D7)', async () => {
	const source = await Bun.file(
		new URL('../../src/core/ontology/ontology_update.ts', import.meta.url).pathname,
	).text();

	// the string survives in exactly ONE place: inside restoreFailureMessage,
	// where it is guarded by `provisioned.length === 0`. A second literal would
	// mean a failure branch bypassing the guard.
	expect(source.split("'Error. Import failed — previous state restored'").length - 1).toBe(1);
	// and every restore site routes through the helper.
	expect(source.split('restoreFailureMessage(provisioned, response.errors)').length - 1).toBe(3);
});
