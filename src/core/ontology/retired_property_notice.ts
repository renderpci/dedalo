/**
 * THE RETIRED-PROPERTY LINE, ONCE PER PROPERTY (install campaign 3, C3-72).
 *
 * The resolver's tripline (resolver.ts reportRetiredProperties) printed one line
 * per (node, retired key). The install seed's own ontology carries some retired
 * keys on many nodes, so a developer install printed 165 such lines in a
 * 247-line run and `test:db:setup` 185 of 278 — the operator's real output
 * drowned in a warning about data they cannot change. Now each retired key is
 * announced ONCE per process, naming the first node seen and where the full list
 * is (`bun run scripts/ontology_property_report.ts`); every later node carrying
 * it is counted, not printed.
 *
 * PROCESS-LIFETIME on purpose, not an ontology cache: an install writes
 * dd_ontology many times and every write clears the ontology caches — a dedupe
 * cleared with them would announce the same key again after each write. The
 * state is request-independent (a key name and a count; no request identity).
 * Gate: test/unit/ontology_property_report_native.test.ts ('the resolver
 * tripline').
 */

import { formatRetiredPropertyLine } from './property_census.ts';

/** Retired key → the number of nodes seen carrying it in this process. */
const nodesPerRetiredKey = new Map<string, number>();

/** Where the full (node, key) list comes from. */
export const RETIRED_PROPERTY_REPORT_COMMAND = 'bun run scripts/ontology_property_report.ts';

/** The lines to print for `tipo`'s retired keys: one for each key not announced before. */
export function retiredPropertyAnnouncements(tipo: string, keys: readonly string[]): string[] {
	const lines: string[] = [];
	for (const key of keys) {
		const seen = nodesPerRetiredKey.get(key) ?? 0;
		nodesPerRetiredKey.set(key, seen + 1);
		if (seen > 0) continue;
		lines.push(
			`${formatRetiredPropertyLine(tipo, key)} Shown once: other nodes carrying properties.${key} are counted, not listed — every one: ${RETIRED_PROPERTY_REPORT_COMMAND}`,
		);
	}
	return lines;
}

/** Nodes seen per retired key so far (a snapshot). */
export function retiredPropertyCounts(): ReadonlyMap<string, number> {
	return new Map(nodesPerRetiredKey);
}

/** Forget what was announced (a gate that needs a fresh process view). */
export function resetRetiredPropertyAnnouncements(): void {
	nodesPerRetiredKey.clear();
}
