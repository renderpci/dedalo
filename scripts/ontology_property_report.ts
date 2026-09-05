/**
 * ============================================================================
 * ONTOLOGY PROPERTY REPORT — which `properties` keys of THIS install does the
 * engine read, and which does it silently ignore? (DEAD-08 / P2-27)
 * ============================================================================
 *
 * `properties` is a free-form JSONB bag an ontology author edits by hand, so a
 * key the engine no longer reads is indistinguishable from one it honours: the
 * node saves and nothing complains. The repo-side census
 * (`test/unit/ontology_property_census_tripwire.test.ts`) covers what an
 * install SHIPS; this script covers what an install has AUTHORED since — its
 * own dd_ontology, node by node.
 *
 * TWO verdicts are reported (the classifier lives in
 * src/core/ontology/property_census.ts):
 *   RETIRED — this repo knows the key and knows nothing reads it; the line
 *             names the node, the key, why it is inert and the replacement.
 *   UNKNOWN — the key is in neither the honoured nor the retired census. Most
 *             likely an author's typo or a local invention nothing reads;
 *             verify before trusting it.
 * Honoured keys, the author deactivation conventions (`DES_`, `_DES`, `…99`,
 * `______TEST_`, `_info`) and tipo-keyed maps are NOT reported — working
 * configuration, a deliberate park, and not property names at all.
 *
 * USAGE (read-only — this script never writes):
 *
 *     bun scripts/ontology_property_report.ts             # human report
 *     bun scripts/ontology_property_report.ts --json      # one JSON per line
 *     bun scripts/ontology_property_report.ts --retired   # retired only
 *     bun scripts/ontology_property_report.ts --unknown   # unknown only
 *     bun scripts/ontology_property_report.ts --strict    # exit 1 if any found
 *
 * The node scan is `listNodesWithProperties()` from src/core/ontology/ — the
 * exempt canonical home for direct dd_ontology queries; a script never grows
 * its own (sql_confinement T3).
 */

import {
	buildPropertyCensusReport,
	type PropertyCensusEntry,
} from '../src/core/ontology/property_census.ts';
import { listNodesWithProperties } from '../src/core/ontology/resolver.ts';

/** Filter the report to the verdicts the flags asked for (both when neither). */
export function selectVerdicts(
	entries: readonly PropertyCensusEntry[],
	options: { retired: boolean; unknown: boolean },
): PropertyCensusEntry[] {
	const both = options.retired === options.unknown;
	return entries.filter(
		(entry) =>
			both ||
			(options.retired && entry.verdict === 'retired') ||
			(options.unknown && entry.verdict === 'unknown'),
	);
}

/** The human report: one line per (node, key), then a per-key summary. */
export function formatReport(entries: readonly PropertyCensusEntry[]): string {
	if (entries.length === 0) {
		return 'ontology property report: no retired or unknown property keys — every authored key is one the engine reads.';
	}
	const lines = entries.map((entry) =>
		entry.verdict === 'retired'
			? `RETIRED  ${entry.tipo}\tproperties.${entry.key}\t${entry.reason} ${
					entry.replacement === null
						? 'There is no v7 replacement: remove it.'
						: `Replace it with ${entry.replacement}.`
				}`
			: `UNKNOWN  ${entry.tipo}\tproperties.${entry.key}\tin neither the honoured nor the retired census — verify it is read before relying on it.`,
	);
	const perKey = new Map<string, number>();
	for (const entry of entries) {
		perKey.set(
			`${entry.verdict} ${entry.key}`,
			(perKey.get(`${entry.verdict} ${entry.key}`) ?? 0) + 1,
		);
	}
	const summary = [...perKey.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([key, count]) => `  ${count}\t${key}`)
		.join('\n');
	return `${lines.join('\n')}\n\nTOTAL: ${entries.length} (node, key) pair(s) nothing reads:\n${summary}`;
}

if (import.meta.main) {
	const json = process.argv.includes('--json');
	const entries = selectVerdicts(buildPropertyCensusReport(await listNodesWithProperties()), {
		retired: process.argv.includes('--retired'),
		unknown: process.argv.includes('--unknown'),
	});
	if (json) {
		for (const entry of entries) console.log(JSON.stringify(entry));
	} else {
		console.log(formatReport(entries));
	}
	if (process.argv.includes('--strict') && entries.length > 0) process.exit(1);
	process.exit(0);
}
