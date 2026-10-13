/**
 * THE THESAURI'S DECLARED DEPENDENCIES, checked at import time.
 *
 * The installer decides its whole thesaurus set in the plan (install_plan.ts —
 * the vendored core declaration + the catalog entries of the install order),
 * and the plan warns about a declined mandatory thesaurus there
 * (`declined_dependencies`). What remains for import time is below.
 *
 * THE THESAURI'S OWN DECLARATIONS (2026-10-10 review): a chosen thesaurus's
 * hierarchy.json entry declares dependencies too (its registry row's
 * hierarchy60), and the same law applies — {@link withThesaurusDependencies}
 * checks a selection against them (nothing added: a mandatory thesaurus left
 * out is a warning; a declared MANDATORY ONTOLOGY that is not installed is
 * refused — the ontology law); hierarchy_import.ts installHierarchies runs it
 * before anything is imported, so every front end gets it through the one door.
 * Gate: test/unit/install_hierarchy_dependencies_native.test.ts.
 */

import { config } from '../../config/config.ts';
import { offeredHierarchies } from './hierarchy_meta.ts';
import {
	closeThesaurusChoice,
	type DependencyDeclarer,
	type ThesaurusChoiceClosure,
} from './ontology_choice.ts';

/**
 * A thesaurus selection checked against the chosen entries' OWN declared
 * dependencies (hierarchy.json — ontology_choice.ts closeThesaurusChoice, the
 * rule the CLI plan applies). The selection is the caller's ANSWER on every
 * thesaurus (the front ends pre-tick the declared ones): nothing is added — a
 * MANDATORY thesaurus it leaves out is a WARNING (strongly recommended,
 * installable later), an optional one is silent; a declared ONTOLOGY must be
 * one of the configured `installedOntologies` (mandatory → error). `dir` is the
 * gate seam (a scratch manifest). The manifest is read only when there is a
 * choice to close.
 */
export function withThesaurusDependencies(
	chosen: readonly string[],
	options: { installedOntologies?: readonly string[]; dir?: string } = {},
): ThesaurusChoiceClosure {
	if (chosen.length === 0) {
		return { hierarchies: [], dependencies: [], notes: [], warnings: [], errors: [] };
	}
	const declarers: DependencyDeclarer[] = offeredHierarchies(options.dir).map((meta) => ({
		tld: meta.tld,
		dependencies: meta.dependencies ?? null,
	}));
	return closeThesaurusChoice(
		chosen,
		declarers,
		new Set(options.installedOntologies ?? config.ontologyIo.activeOntologyTlds),
		{ accept: () => false },
	);
}
