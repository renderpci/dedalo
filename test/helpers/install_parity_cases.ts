/**
 * THE INTERACTIVE PARITY MATRIX (terminal installer phases 2–3) — the cases
 * BOTH interactive front ends are held to (install_plain_parity_tripwire,
 * install_tui_parity_tripwire): every phase-1 case + the route cases
 * (install_answer_cases.ts), minus the ones the SCREENS cannot express
 * (NOT_PLAIN, each with a reason the plain gate MEASURES). One list, so the
 * full-screen gate cannot silently run a smaller matrix than the plain one.
 */

import { expect } from 'bun:test';
import { answersFromCliArgs, SECRET_ANSWER_KEYS } from '../../src/core/install/install_plan.ts';
import type { Secrets } from '../../src/core/install/run_files.ts';
import { CASES, routeCases } from './install_answer_cases.ts';

/**
 * The phase-1 cases the SCREENS cannot express, each with why (measured in
 * install_plain_parity_tripwire (a)): the interactive modes are held to every other one.
 */
export const NOT_PLAIN: Readonly<Record<string, 'route_fixed' | 'core_tld' | 'declared_named'>> = {
	// media_path / unix_socket / media_access_mode on the developer route: ROUTE_FIXED (flag-settable).
	'+serving keys': 'route_fixed',
	// lg is not an option of the thesaurus screen (core: always installed) — the note is the flag's.
	'thesauri: with the core lg': 'core_tld',
	// dd is not an option of the ontology screen (core: always installed) — the note is the flag's.
	'ontologies: a core TLD dropped with a note': 'core_tld',
	// A thesaurus an ontology DECLARES, also named in --hierarchies: on the screen it is
	// pre-ticked by its declarer — the SAME thesauri install; naming it moves it in the
	// install ORDER (and a self-decline of a named one drops its dependency row), which
	// a tick cannot say. Re-answering the screen over such answers keeps their plan
	// (install_screen_model_tripwire, "explicit roots").
	'thesauri: a declared one named explicitly': 'declared_named',
	'thesauri: a declared one named explicitly AND declined': 'declared_named',
};

export interface ParityCase {
	name: string;
	argv: string[];
	wizard: Record<string, unknown> | null;
	local: boolean;
}

/** Every case (the route cases read the local ontology source at `sourceDir`). */
export function allCases(sourceDir: string): ParityCase[] {
	return [
		...CASES.map((item) => ({ ...item, local: false })),
		...routeCases(sourceDir).map((item) => ({ ...item, wizard: null })),
	];
}

const SECRET_SET: ReadonlySet<string> = new Set(SECRET_ANSWER_KEYS);

/** The case's raw answers (flags) split into the plain answers and the secrets. */
export function splitCase(argv: readonly string[]): {
	raw: Record<string, unknown>;
	plain: Record<string, unknown>;
	secrets: Secrets;
} {
	const invocation = answersFromCliArgs(argv);
	expect(invocation.errors, argv.join(' ')).toEqual([]);
	const plain: Record<string, unknown> = {};
	const secrets: Record<string, string> = {};
	for (const [key, value] of Object.entries(invocation.raw)) {
		if (SECRET_SET.has(key)) secrets[key] = String(value);
		else plain[key] = value;
	}
	return { raw: invocation.raw, plain, secrets: secrets as Secrets };
}
