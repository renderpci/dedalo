/**
 * LABEL NODES ARE NEVER RESOLVED THROUGH THE ONTOLOGY (owner decision
 * 2026-10-12). Program strings come from the labels engine (src/core/labels/,
 * getLabels(lang)); dd_ontology model='label' rows are inert, and the v7 master
 * ontology MAY REUSE a retired label tipo (dd660-669, dd692-699 are AI-usage
 * nodes now) — so a term lookup on one serves whatever node owns that tipo
 * TODAY. A PHP-era label tipo surviving in stored data is a read-only id its
 * reader maps to a label KEY, never a term lookup.
 *
 * A label node reaching a term resolver is therefore a caller defect: a test
 * process or a DEDALO_DEV_MODE server refuses it loudly (internal.invariant);
 * production logs it once per tipo and the resolver answers its own
 * "no term" value, so a page never breaks over it. The ONLY list of guarded
 * homes (and of every other term-reading dd_ontology SQL literal in src/, with
 * its checked basis) is TERM_READ_LEDGER in
 * test/unit/term_by_tipo_label_guard.test.ts.
 *
 * A refusal is never cached by any of them (a dev/test throw recurs on every
 * call). LEAF module on purpose: every guarded home imports it, so it imports
 * none of them (import_scc_tripwire).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { readBool } from '../../config/readers.ts';
import { isTestProcess } from '../../config/suite_database.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { logError } from '../errors/log.ts';
import { createOntologyCache } from './cache_factory.ts';

/** The dd_ontology model the guard refuses. */
export const LABEL_NODE_MODEL = 'label';

/**
 * Tipos already logged by the production branch (log once per tipo). Factory-
 * created: an ontology write clears it, so a tipo reused since is re-judged.
 */
const loggedLabelTipos = createOntologyCache<string, true>();

/**
 * TEST SEAM — the posture the gate drives the production branch under. Scoped
 * to one async call tree (never module state: nothing to clear, nothing to
 * bleed into a concurrent request or the next test). `testProcess: false`
 * makes the guard decide as a non-test process would, so DEDALO_DEV_MODE alone
 * arms fail-loud and its absence selects the log-once branch.
 */
export interface LabelGuardTestPosture {
	readonly testProcess: boolean;
}
const testPostureStore = new AsyncLocalStorage<LabelGuardTestPosture>();

/**
 * Run `fn` under a simulated guard posture. Refused outside a test process: a
 * server can never talk itself out of the dev/test refusal through this door.
 */
export function runWithLabelGuardTestPosture<T>(posture: LabelGuardTestPosture, fn: () => T): T {
	if (!isTestProcess()) {
		throw new DedaloError('internal.invariant', {
			message: 'runWithLabelGuardTestPosture is a test seam; refused outside a test process',
		});
	}
	return testPostureStore.run(posture, fn);
}

/** Fail loud in a test process or on a development server; read per call. */
function labelGuardFailsLoud(): boolean {
	const testProcess = testPostureStore.getStore()?.testProcess ?? isTestProcess();
	return testProcess || readBool('DEDALO_DEV_MODE');
}

/**
 * The guard: false for any non-label node (resolve normally); for a label node
 * throws when failing loud, else logs once per tipo and returns true (the
 * caller answers its unresolved value and does NOT cache it).
 */
export function refuseLabelNode(tipo: string, model: unknown): boolean {
	if (model !== LABEL_NODE_MODEL) return false;
	const error = new DedaloError('internal.invariant', {
		message: `ontology term lookup on label node '${tipo}': program strings come from the labels engine (getLabels), never dd_ontology`,
		coordinates: { tipo, model: LABEL_NODE_MODEL },
	});
	if (labelGuardFailsLoud()) throw error;
	if (loggedLabelTipos.get(tipo) === undefined) {
		loggedLabelTipos.set(tipo, true);
		logError(error, { subsystem: 'ontology' });
	}
	return true;
}
