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
 *
 * OUT OF THE OPERATOR'S TERMINAL DURING AN INSTALL (campaign 3b C3-72): the
 * lines are instructions to an ontology AUTHOR about the shipped data — no
 * install operator can act on them. While an install runs (executor.ts
 * executeInstall) they are DIVERTED: counted exactly as before, printed
 * nowhere; the full list stays one command away (the report script).
 */

import { formatRetiredPropertyLine } from './property_census.ts';

/** Retired key → the number of nodes seen carrying it in this process. */
const nodesPerRetiredKey = new Map<string, number>();

/**
 * Where announcements go instead of stderr while an install runs (null = stderr).
 * A process-wide output switch, like the console itself — no request identity.
 */
let divertedTo: ((line: string) => void) | null = null;

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

/**
 * Announce `tipo`'s retired keys (the resolver's tripline): each key not
 * announced before, on stderr — or to the diversion while an install runs.
 */
export function announceRetiredProperties(tipo: string, keys: readonly string[]): void {
	for (const line of retiredPropertyAnnouncements(tipo, keys)) {
		const text = `[ontology/resolver] ${line}`;
		if (divertedTo === null) console.error(text);
		else divertedTo(text);
	}
}

/**
 * Send the announcements to `sink` instead of stderr until the answered
 * function is called (it puts back the previous destination).
 */
export function divertRetiredPropertyNotices(sink: (line: string) => void): () => void {
	const previous = divertedTo;
	divertedTo = sink;
	return () => {
		divertedTo = previous;
	};
}

/** Nodes seen per retired key so far (a snapshot). */
export function retiredPropertyCounts(): ReadonlyMap<string, number> {
	return new Map(nodesPerRetiredKey);
}

/** Forget what was announced (a gate that needs a fresh process view). */
export function resetRetiredPropertyAnnouncements(): void {
	nodesPerRetiredKey.clear();
}
