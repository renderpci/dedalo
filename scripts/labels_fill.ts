/**
 * LABELS FILL REPORT (WC-033) — the machine-translation backlog for the
 * repo-owned UI-label catalogs (src/core/labels/catalog/lg-<code>.json).
 *
 * Usage:
 *   bun run scripts/labels_fill.ts            # per-lang missing-key summary
 *   bun run scripts/labels_fill.ts --lang lg-ita   # that lang's missing keys + source strings
 *   bun run scripts/labels_fill.ts --json     # full backlog as JSON (agent/MT input)
 *
 * src/core/labels/master.json is the SOURCE OF DEFINITIONS (complete key set,
 * enforced by labels_tripwire); a key missing from a lang's catalog is served
 * through the runtime fallback chain (install default lang → master,
 * src/core/labels/catalog.ts) until a real translation lands here. Workflow:
 * generate the backlog, translate the source strings (human or MT), add the
 * keys to the lang's catalog (sorted, tab-indented), and review the diff in
 * the PR like any code change. Known editorial flags from the one-time
 * migration: rewrite/LABELS_RECONCILE.md.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MASTER_SOURCE_LANG } from '../src/core/labels/catalog.ts';

const LABELS_DIR = resolve(import.meta.dir, '../src/core/labels');
const CATALOG_DIR = join(LABELS_DIR, 'catalog');

const master = JSON.parse(readFileSync(join(LABELS_DIR, 'master.json'), 'utf8')) as Record<
	string,
	string
>;
const masterKeys = Object.keys(master);

const catalogs = new Map<string, Record<string, string>>();
for (const name of readdirSync(CATALOG_DIR).sort()) {
	catalogs.set(
		name.replace('.json', ''),
		JSON.parse(readFileSync(join(CATALOG_DIR, name), 'utf8')) as Record<string, string>,
	);
}

const args = process.argv.slice(2);
const langArg = args.includes('--lang') ? (args[args.indexOf('--lang') + 1] ?? null) : null;

if (langArg === MASTER_SOURCE_LANG) {
	console.log(
		`${langArg} is the master-source lang: its catalog is a sparse display-text override of master.json, not a translation backlog (${Object.keys(catalogs.get(langArg) ?? {}).length} override(s) present)`,
	);
} else if (langArg !== null) {
	const map = catalogs.get(langArg);
	if (map === undefined) {
		console.log(`no catalog for ${langArg} — every key is missing (${masterKeys.length})`);
	}
	const missing = masterKeys.filter((key) => map?.[key] === undefined);
	for (const key of missing) console.log(`${key}\t${master[key]}`);
	console.error(`\n${langArg}: ${missing.length} missing of ${masterKeys.length}`);
} else if (args.includes('--json')) {
	const backlog: Record<string, Record<string, string>> = {};
	for (const [lang, map] of catalogs) {
		if (lang === MASTER_SOURCE_LANG) continue; // override file, not a backlog
		const missing: Record<string, string> = {};
		for (const key of masterKeys) {
			if (map[key] === undefined) missing[key] = master[key] as string;
		}
		backlog[lang] = missing;
	}
	console.log(JSON.stringify(backlog, null, '\t'));
} else {
	console.log(`master (source of definitions): ${masterKeys.length} keys`);
	for (const [lang, map] of catalogs) {
		if (lang === MASTER_SOURCE_LANG) {
			// The master-source lang's catalog is a sparse display-text OVERRIDE of
			// the master, not a translation backlog — gaps are by design.
			console.log(`${lang}\t${Object.keys(map).length} override(s)\t(master-source lang)`);
			continue;
		}
		const have = masterKeys.filter((key) => map[key] !== undefined).length;
		console.log(`${lang}\t${have}/${masterKeys.length}\t(${masterKeys.length - have} missing)`);
	}
}
