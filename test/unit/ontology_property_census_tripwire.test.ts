/**
 * ONTOLOGY PROPERTY CENSUS TRIPWIRE (P2-27 / DEAD-08) — a `properties` key the
 * engine does not read is ENUMERATED with a reason, or the gate is RED.
 *
 * THE DEFECT. `properties` is a free-form JSONB bag an ontology author edits by
 * hand: a key nothing reads looks exactly like one the engine honours. The
 * audit measured 404 distinct top-level keys across the shipped ontology and
 * 17+ of them read by NEITHER the server nor the browser, on ~250 nodes —
 * `portal_link_open` on 90, `hard_delete` on 58, `multi_value` on 48. Nothing
 * told anyone.
 *
 * THE CENSUS IS TOTAL over what an install SHIPS: every dd_ontology row of
 * `install/db/dedalo_install.pgsql.gz` plus every node of the generic `test`
 * TLD (`src/core/test_data/test_tld_ontology.json`), crossed with a
 * comment-stripped word scan of the registered code corpora —
 * `writePathSourceFiles()` (src + tools + scripts) and `firstPartyClientFiles()`
 * (the browser trees). Each derivation carries a floor. The corpus a repo gate
 * CANNOT see is an install's own authored nodes; that half is
 * `scripts/ontology_property_report.ts`, covered by
 * `ontology_property_report_native`.
 *
 * THE ANSWER IS EXACT, NOT A CEILING: the unread set is held EQUAL to
 * `RETIRED_PROPERTY_KEYS` (minus the `reportedAtUse` entries, whose consumer
 * names them). A newly-dead key is RED; a key that becomes read again must
 * leave the registry; an entry invented to launder something the code DOES read
 * is RED too. So the list can only shrink honestly.
 *
 * FOUR CLASSES ARE NOT OFFENDERS, each derived rather than asserted:
 * honoured (named in code — held EQUAL to `HONOURED_PROPERTY_KEYS`), the author
 * DEACTIVATION conventions (`DES_`, `_DES`, `…99`, `______TEST_`, `_info`),
 * tipo-keyed maps (self-tested: every shape-matching key in the corpus IS a
 * node tipo of the corpus), and the `reportedAtUse` keys.
 *
 * HONEST LIMIT. "Read" is a word scan, so readership is OVER-approximated: the
 * unread set is a LOWER bound (everything it names is truly dead; a key spelled
 * like an ordinary word — `name`, `row`, `key` — may be dead and counted
 * honoured). Comments are stripped, which is what makes `hard_delete`'s
 * commented-out client branch count as dead. The gate reads no database.
 *
 * Hermetic: repo files only.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
	buildPropertyCensusReport,
	classifyPropertyKey,
	formatRetiredPropertyLine,
	HONOURED_PROPERTY_KEYS,
	RETIRED_PROPERTY_KEYS,
	retiredKeysOf,
} from '../../src/core/ontology/property_census.ts';
import {
	CODE_SCAN_EXCLUSIONS,
	codeCorpusFiles,
	firstPartyCodeWords,
	PROPERTY_KEY_FLOOR,
	SEED_NODE_FLOOR,
	seedOntologyNodes,
	shippedOntologyNodes,
	shippedPropertyKeyUsage,
	shippedTipos,
} from '../helpers/ontology_property_corpus.ts';
import { REPO_ROOT } from '../helpers/write_path_corpus.ts';

/** Floor for the code-word scan (38,996 distinct words measured 2026-09-05). */
const CODE_WORD_FLOOR = 20000;

const usage = shippedPropertyKeyUsage();
const codeWords = firstPartyCodeWords();

/** The keys the registry claims are unread (the `reportedAtUse` ones are read, by their reporter). */
const censusRetiredKeys = Object.keys(RETIRED_PROPERTY_KEYS)
	.filter((key) => RETIRED_PROPERTY_KEYS[key]?.reportedAtUse !== true)
	.sort();

/** THE derivation: a shipped key that is a real property name and no code word. */
function deriveUnreadKeys(): string[] {
	return [...usage.keys()]
		.filter((key) => {
			const verdict = classifyPropertyKey(key);
			if (verdict === 'deactivated' || verdict === 'keyed_map') return false;
			return !codeWords.has(key);
		})
		.sort();
}

describe('ontology property census — the corpus is real', () => {
	test('the shipped corpus and the code corpus both have a floor', () => {
		const nodes = shippedOntologyNodes();
		expect(seedOntologyNodes().length).toBeGreaterThan(SEED_NODE_FLOOR);
		expect(nodes.length).toBeGreaterThan(SEED_NODE_FLOOR);
		expect(usage.size).toBeGreaterThan(PROPERTY_KEY_FLOOR);
		expect(codeWords.size).toBeGreaterThan(CODE_WORD_FLOOR);
	});

	test('every code-scan exclusion is a real corpus file, and carries its reason', () => {
		const files = codeCorpusFiles();
		expect(files.length).toBeGreaterThan(1000);
		const stale = Object.entries(CODE_SCAN_EXCLUSIONS).filter(
			([file, reason]) =>
				!existsSync(join(REPO_ROOT, file)) || files.includes(file) || reason.length < 40,
		);
		expect(
			stale.map(([file]) => file),
			'A CODE_SCAN_EXCLUSIONS entry names a file the corpus no longer lists, or states no reason. The list is shrink-only: only the registry that DECLARES the dead keys may be excluded from the reader scan.',
		).toEqual([]);
		expect(Object.keys(CODE_SCAN_EXCLUSIONS).length).toBeLessThanOrEqual(1);
	});

	test('a tipo-keyed property key is a REAL node tipo of the corpus (the classifier’s keyed_map leg)', () => {
		const tipos = shippedTipos();
		const shaped = [...usage.keys()].filter((key) => classifyPropertyKey(key) === 'keyed_map');
		expect(shaped.length).toBeGreaterThan(100);
		const notATipo = shaped.filter((key) => !tipos.has(key) && !/^[0-9]+$/.test(key));
		expect(
			notATipo,
			`These keys look like a tipo-keyed map but name no node of the shipped ontology — they are property names the census must judge: ${notATipo.join(', ')}`,
		).toEqual([]);
	});
});

describe('ontology property census — every unread key is enumerated', () => {
	test('the unread set EQUALS the retired registry (no new dead key, no stale entry, no laundering)', () => {
		const unread = deriveUnreadKeys();
		expect(unread.length).toBeGreaterThan(20);
		expect(
			unread,
			'The shipped ontology carries property keys nothing reads that are NOT in RETIRED_PROPERTY_KEYS (src/core/ontology/property_census.ts) — wire the key, or enumerate it with a reason and the replacement. An entry that is no longer unread must be DELETED (the list is shrink-only).',
		).toEqual(censusRetiredKeys);
	});

	test('every retired key is actually carried by the shipped ontology', () => {
		const orphans = Object.keys(RETIRED_PROPERTY_KEYS).filter((key) => !usage.has(key));
		expect(usage.size).toBeGreaterThan(PROPERTY_KEY_FLOOR);
		expect(
			orphans,
			`Stale RETIRED_PROPERTY_KEYS entries — no shipped node carries these any more; delete them: ${orphans.join(', ')}`,
		).toEqual([]);
	});

	test('every registry entry carries a reason, and a replacement or an explicit null', () => {
		const keys = Object.keys(RETIRED_PROPERTY_KEYS);
		expect(keys.length).toBeGreaterThan(20);
		const thin = keys.filter((key) => {
			const entry = RETIRED_PROPERTY_KEYS[key];
			return (
				entry === undefined ||
				entry.reason.length < 40 ||
				!('replacement' in entry) ||
				(entry.replacement !== null && entry.replacement.length < 4)
			);
		});
		expect(
			thin,
			`These retired entries state no usable reason or replacement: ${thin.join(', ')}`,
		).toEqual([]);
	});

	test('a reportedAtUse key IS named in first-party code — its reporter is what excludes it', () => {
		const marked = Object.keys(RETIRED_PROPERTY_KEYS).filter(
			(key) => RETIRED_PROPERTY_KEYS[key]?.reportedAtUse === true,
		);
		expect(marked.length).toBeGreaterThan(1);
		const unreported = marked.filter((key) => !codeWords.has(key));
		expect(
			unreported,
			`These keys are marked reportedAtUse but no first-party file names them — the mark is false; drop it so the census covers them: ${unreported.join(', ')}`,
		).toEqual([]);
	});
});

describe('ontology property census — the honoured set is a measurement', () => {
	test('HONOURED_PROPERTY_KEYS equals the shipped keys first-party code names', () => {
		const derived = [...usage.keys()]
			.filter((key) => {
				const verdict = classifyPropertyKey(key);
				if (verdict === 'deactivated' || verdict === 'keyed_map') return false;
				if (RETIRED_PROPERTY_KEYS[key] !== undefined) return false;
				return codeWords.has(key);
			})
			.sort();
		expect(derived.length).toBeGreaterThan(50);
		expect(
			derived,
			'HONOURED_PROPERTY_KEYS (src/core/ontology/property_census.ts) no longer matches the shipped ontology crossed with the code trees. It is a measurement, not a wish list: re-derive it. A key that LEFT the set is a key nothing reads any more — enumerate it in RETIRED_PROPERTY_KEYS instead.',
		).toEqual([...HONOURED_PROPERTY_KEYS].sort());
	});

	test('no key is both honoured and retired, and neither class hides in a convention', () => {
		const both = HONOURED_PROPERTY_KEYS.filter((key) => RETIRED_PROPERTY_KEYS[key] !== undefined);
		expect(both, `Keys claimed honoured AND retired: ${both.join(', ')}`).toEqual([]);
		const misclassified = [...HONOURED_PROPERTY_KEYS, ...Object.keys(RETIRED_PROPERTY_KEYS)].filter(
			(key) => {
				const verdict = classifyPropertyKey(key);
				return verdict === 'deactivated' || verdict === 'keyed_map' || verdict === 'unknown';
			},
		);
		expect(HONOURED_PROPERTY_KEYS.length).toBeGreaterThan(50);
		expect(
			misclassified,
			`These census members classify as something else — the classifier and the lists disagree: ${misclassified.join(', ')}`,
		).toEqual([]);
	});
});

describe('ontology property census — the classifier is proven on planted offenders', () => {
	test('a planted dead key is UNKNOWN and reported; a live one and a parked one are not', () => {
		expect(classifyPropertyKey('zz_planted_dead_key')).toBe('unknown');
		expect(classifyPropertyKey('css')).toBe('honoured');
		expect(classifyPropertyKey('multi_value')).toBe('retired');
		expect(classifyPropertyKey('view_DES')).toBe('deactivated');
		expect(classifyPropertyKey('_info')).toBe('deactivated');
		expect(classifyPropertyKey('testterr1003')).toBe('keyed_map');

		const report = buildPropertyCensusReport([
			{
				tipo: 'zzpcens1',
				properties: { css: 'x', zz_planted_dead_key: true, multi_value: true, view_DES: 'y' },
			},
			{ tipo: 'zzpcens2', properties: null },
			{ tipo: 'zzpcens3', properties: ['not', 'an', 'object'] },
		]);
		expect(report.map((entry) => `${entry.verdict}:${entry.tipo}:${entry.key}`)).toEqual([
			'retired:zzpcens1:multi_value',
			'unknown:zzpcens1:zz_planted_dead_key',
		]);
		expect(report[0]?.replacement).toContain('single-value facet');
	});

	test('the tripline wording names the node, the key and the replacement', () => {
		const line = formatRetiredPropertyLine('zzpcens1', 'hard_delete');
		expect(line).toContain('zzpcens1');
		expect(line).toContain('properties.hard_delete');
		expect(line).toContain('dataframe.delete_policy');
		expect(formatRetiredPropertyLine('zzpcens1', 'portal_link_open')).toContain(
			'no v7 replacement',
		);
	});

	test('retiredKeysOf finds the retired keys of a node and can skip the reported-at-use ones', () => {
		const properties = { css: 'x', hard_delete: true, target_mode: 'free', multi_value: true };
		expect(retiredKeysOf(properties).sort()).toEqual(['hard_delete', 'multi_value', 'target_mode']);
		expect(retiredKeysOf(properties, { skipReportedAtUse: true }).sort()).toEqual([
			'hard_delete',
			'multi_value',
		]);
		expect(retiredKeysOf(null)).toEqual([]);
		expect(retiredKeysOf('a string')).toEqual([]);
	});
});
