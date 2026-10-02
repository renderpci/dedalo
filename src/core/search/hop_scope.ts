/**
 * THE SECTIONS A SEARCH HOP MAY REACH — the record side of a multi-hop path's
 * ACL (SEC-02), per joined SECTION rather than per declared one.
 *
 * A hop joins the record each stored locator names: `<alias>.section_tipo =
 * locator->>'section_tipo'`. The path step DECLARES one section (the client
 * writes `section_tipo[0]` of the ddo), and until 2026-10-01 both frontier keys
 * — the component grant and the record predicate — were evaluated for THAT
 * section only, while the join admitted whatever section a locator named. Two
 * sections sharing a table and a component (virtual siblings: rsc170/rsc2-style
 * twins, the ontology sections of matrix_ontology) could therefore be read
 * through each other: a user granted the component on A, not on B, declared A
 * and matched B's values — the prefix oracle SEC-02 closed for the declared
 * section, re-opened sideways.
 *
 * THE RULE (owner decision 2026-10-01, "option A"), for a search WITH a
 * principal — admins included:
 *   a hop reaches only the hop component's CONFIGURED target sections (its
 *   request_config sqo targets, the same set its cell displays — a locator
 *   outside them renders nothing, so it must not match either), resolved from
 *   EVERY section the previous step can hold (the search's sections for the
 *   first hop, the previous hop's admitted sections after it), in the step's
 *   table, and among those only the sections where the principal holds the read
 *   grant on the step's component, each under ITS OWN record predicate.
 * Emitted as one ON-clause conjunct `(alias.section_tipo IN (…) [AND pred]) OR …`
 * — sections sharing a predicate grouped, so a 200-target ontology picker stays
 * one IN list — and carried as the hop's `acl`, so the forward join and the
 * reversed relation-index shape (deep_path.ts) read the same rule. A denied
 * section is noted (`[frontier] REFUSED …`): the answer is narrowed, not
 * complete. No admissible section → `FALSE` (the hop matches nothing).
 *
 * An INTERNAL search (no principal) is unchanged: the declared section's record
 * predicate only, every locator followed.
 *
 * A hop component whose targets cannot be resolved (no source section, or a
 * config naming none) falls back to the DECLARED section — the one the
 * component grant already checked — so the rule never reaches wider than the
 * check that guards it.
 *
 * Ledger: engineering/wire_contract/WC-2026-10-01-search-hop-configured-targets.md.
 */

import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import {
	frontierComponentAllowed,
	noteFrontierRefusal,
	type SqlFrontierScope,
} from '../security/frontier_scope.ts';
import { assertValidTipo } from './identifier_gate.ts';

export interface HopScopeStep {
	/** The relation component the hop unnests (previous step's component). */
	hopComponent: string;
	/**
	 * Every section the hop component's records may belong to: the search's own
	 * sections for the first hop, the previous hop's admitted sections after
	 * that. A `self`-relative config (relation_parent/children/related…) targets
	 * a DIFFERENT set per source, so the union over all of them is what the hop
	 * may reach — resolving from the one section a client step declares
	 * (`section_tipo[0]`) dropped every other section of a multi-section search.
	 */
	sourceSections: readonly string[];
	/** The step's declared section and the component read through it. */
	stepSection: string;
	stepComponent: string | undefined;
	stepTable: string;
	alias: string;
}

/** Where a path's first hop starts: the search's sections, else the first step's declared one. */
export function firstHopSources(
	scope: SqlFrontierScope | undefined,
	path: readonly { section_tipo?: string }[],
): readonly string[] {
	if (scope !== undefined && scope.mainSectionTipos.length > 0) return scope.mainSectionTipos;
	const declared = path[0]?.section_tipo;
	return declared === undefined ? [] : [declared];
}

/**
 * The hop's record-side ON conjunct ('' = none), per the rule above, and the
 * sections it admits (the next hop's sources; [] for an internal search).
 */
export async function hopScopeClause(
	scope: SqlFrontierScope,
	step: HopScopeStep,
): Promise<{ clause: string; admitted: string[] }> {
	if (scope.principal === undefined) {
		const clause = await scope.recordPredicate({
			sectionTipo: step.stepSection,
			table: step.stepTable,
			alias: step.alias,
		});
		return { clause, admitted: [] };
	}
	const groups = new Map<string, string[]>();
	for (const section of await candidateSections(step)) {
		const predicate = await readablePredicate(scope, step, section);
		if (predicate !== null) groups.set(predicate, [...(groups.get(predicate) ?? []), section]);
	}
	const admitted = [...groups.values()].flat();
	return { clause: groups.size === 0 ? 'FALSE' : renderGroups(groups, step.alias), admitted };
}

/** The section's record predicate when the caller may read the step component there; null (noted) when not. */
async function readablePredicate(
	scope: SqlFrontierScope,
	step: HopScopeStep,
	section: string,
): Promise<string | null> {
	const allowed = await frontierComponentAllowed(scope, {
		sectionTipo: section,
		...(step.stepComponent === undefined ? {} : { componentTipo: step.stepComponent }),
		table: step.stepTable,
	});
	if (!allowed) {
		noteDenied(scope, section, step.stepComponent);
		return null;
	}
	return scope.recordPredicate({ sectionTipo: section, table: step.stepTable, alias: step.alias });
}

/** The hop component's configured targets in the step's table (else the declared section). */
async function candidateSections(step: HopScopeStep): Promise<string[]> {
	const targets = await configuredTargets(step);
	const sameTable: string[] = [];
	for (const section of new Set(targets)) {
		if ((await getMatrixTableFromTipo(section)) === step.stepTable) sameTable.push(section);
	}
	return targets.length === 0 ? [step.stepSection] : sameTable;
}

/** The union of the hop component's configured targets over every source section. */
async function configuredTargets(step: HopScopeStep): Promise<string[]> {
	const { getElementTargetSectionTipos } = await import('../relations/request_config/build.ts');
	const targets = new Set<string>();
	for (const source of new Set(step.sourceSections)) {
		if (source === '') continue;
		for (const target of await getElementTargetSectionTipos(step.hopComponent, source)) {
			targets.add(target);
		}
	}
	return [...targets];
}

function noteDenied(scope: SqlFrontierScope, section: string, component: string | undefined): void {
	noteFrontierRefusal(scope, {
		surface: scope.surface,
		door: scope.door,
		sectionTipo: section,
		...(component === undefined ? {} : { componentTipo: component }),
		key: 'component',
	});
}

/** `(alias.section_tipo IN ('a','b') AND (pred)) OR …` — sections sharing a predicate grouped. */
function renderGroups(groups: Map<string, string[]>, alias: string): string {
	const parts: string[] = [];
	for (const [predicate, sections] of groups) {
		for (const section of sections) assertValidTipo(section, 'search hop target');
		const inList = `${alias}.section_tipo IN (${sections.map((section) => `'${section}'`).join(', ')})`;
		parts.push(predicate === '' ? inList : `(${inList} AND (${predicate}))`);
	}
	return parts.length === 1 ? (parts[0] as string) : `(${parts.join(' OR ')})`;
}
