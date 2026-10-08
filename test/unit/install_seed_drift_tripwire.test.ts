/**
 * Install seed integrity — the vendored hierarchy seed under
 * install/import/hierarchy/ must be INTERNALLY COHERENT, because that directory
 * is the only thing the install wizard has before an ontology exists.
 *
 * WHAT THIS GATE USED TO BE, AND WHY IT CHANGED (2026-08-22). It asserted the
 * three metadata JSONs were byte-identical to copies under
 * client/dedalo/core/installer/, on the rationale "a client re-sync must not
 * silently diverge them". That rationale died at the cutover: scripts/sync_client.sh
 * is retired, client/ is primary, and NOTHING read the client copies — the wizard
 * renders from `properties.hierarchies` the server delivers (src/core/install/context.ts).
 * They were dead duplicated data, and the byte-mirror froze them at their v6-era
 * content while the server copies were deliberately re-vendored (dc44aba484,
 * 07e1fcfa34). A gate that fails BECAUSE the real data was corrected is measuring
 * the fork, not the engine. The copies are deleted; the anti-fork assertion now
 * points the other way (no copy may come back).
 *
 * The invariants below are the ones whose violation actually breaks something:
 * a descriptor with no data file cannot be installed, a data file with no
 * descriptor is never offered (hierarchy_activate then falls back to a
 * placeholder typology), an unknown typology number renders an empty panel, an
 * empty pre-checked set is a wizard that offers nothing, and a CORE hierarchy
 * (lg — activated by the seed restore, never imported) that came back as a
 * vendored optional one would duplicate its terms where nothing reads them.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const SERVER_DIR = join(ROOT, 'install/import/hierarchy');
const CLIENT_INSTALLER_DIR = join(ROOT, 'client/dedalo/core/installer');

interface HierarchyMeta {
	tld: string;
	label: string;
	typology: number;
	active_in_thesaurus?: boolean;
}

const readJson = <T>(name: string): T =>
	JSON.parse(readFileSync(join(SERVER_DIR, name), 'utf8')) as T;

const descriptors = readJson<HierarchyMeta[]>('hierarchies.json');
const typologies = readJson<{ typology: number; label: string }[]>('hierarchies_typologies.json');
const toInstall = readJson<string[]>('hierarchies_to_install.json');

/** The tlds that actually ship data — the same rule as availableHierarchyTlds(). */
const dataFileTlds = new Set(
	readdirSync(SERVER_DIR)
		.filter((name) => /^[a-z]+1\.copy\.gz$/.test(name))
		.map((name) => name.replace(/1\.copy\.gz$/, '')),
);

describe('install seed tripwire', () => {
	test('the scan sees a real seed (a zero-length pass is not a pass)', () => {
		expect(descriptors.length).toBeGreaterThan(100);
		expect(dataFileTlds.size).toBeGreaterThan(100);
		expect(typologies.length).toBeGreaterThan(0);
	});

	test('every descriptor ships a data file', () => {
		const missing = descriptors.map((d) => d.tld).filter((tld) => !dataFileTlds.has(tld));
		expect(missing, 'descriptors the wizard offers but cannot install').toEqual([]);
	});

	test('every data file has a descriptor', () => {
		// Without one the tld is never offered, and hierarchy_activate falls back
		// to a placeholder typology (src/core/install/hierarchy_activate.ts:73).
		const known = new Set(descriptors.map((d) => d.tld));
		const orphans = [...dataFileTlds].filter((tld) => !known.has(tld)).sort();
		expect(orphans, 'vendored hierarchy data with no descriptor row').toEqual([]);
	});

	test('every descriptor typology is defined in hierarchies_typologies.json', () => {
		// An unknown number groups the hierarchy under a nonexistent header and
		// the install panel renders nothing (docs/management/install_new_hierarchies.md).
		const known = new Set(typologies.map((t) => t.typology));
		const unknown = [...new Set(descriptors.map((d) => d.typology))]
			.filter((n) => !known.has(n))
			.sort((a, b) => a - b);
		expect(unknown).toEqual([]);
	});

	test('the ONE optional-thesaurus default is the descriptors flagged install_checked_default — all offered', async () => {
		// ASK THE ENGINE, do not re-implement it: defaultOptionalHierarchies() is
		// what BOTH front ends read (the wizard's pre-ticked boxes via context.ts,
		// the CLI's omitted --hierarchies via install_plan.ts). The gate holds it
		// equal to the DATA — the descriptors flagged in hierarchies.json — so a
		// second list (the retired INSTALL_CHECKED_DEFAULT literal) cannot return
		// unnoticed, and a flagged descriptor without its data file reddens.
		const { defaultOptionalHierarchies } = await import('../../src/core/install/hierarchy_meta.ts');
		const flagged = descriptors
			.filter((d) => (d as { install_checked_default?: boolean }).install_checked_default === true)
			.map((d) => d.tld);
		const served = defaultOptionalHierarchies();
		expect(served.length, 'an empty default set is a wizard that offers nothing').toBeGreaterThan(
			0,
		);
		expect(served).toEqual(flagged);
		expect(served.filter((tld) => !dataFileTlds.has(tld))).toEqual([]);
	});

	test('no CORE hierarchy is vendored as an optional one (descriptor or <tld>1.copy.gz)', async () => {
		// A core tld (lg) is ACTIVATED by the seed restore against the terms the
		// seed ships in its own table; a descriptor would offer it as a choice and
		// a data file would let the importer write unread duplicates into
		// matrix_hierarchy (the defect retired 2026-10-08).
		const { CORE_HIERARCHIES } = await import('../../src/core/install/hierarchy_meta.ts');
		expect(CORE_HIERARCHIES.length).toBeGreaterThan(0);
		const core = CORE_HIERARCHIES.map((meta) => meta.tld);
		expect(core.filter((tld) => descriptors.some((d) => d.tld === tld))).toEqual([]);
		expect(core.filter((tld) => dataFileTlds.has(tld))).toEqual([]);
		expect(core.filter((tld) => existsSync(join(SERVER_DIR, `${tld}1.copy.gz`)))).toEqual([]);
	});

	test('hierarchies_to_install ⊆ descriptors ∪ CORE, and ⊇ CORE (the seed registry keeps them)', async () => {
		// hierarchies_to_install lists the registry records the seed builder ships;
		// a core tld's record (hierarchy1 for lg) must survive or there is nothing
		// for the seed restore to activate.
		const { CORE_HIERARCHIES } = await import('../../src/core/install/hierarchy_meta.ts');
		const core = CORE_HIERARCHIES.map((meta) => meta.tld);
		const known = new Set([...descriptors.map((d) => d.tld), ...core]);
		expect(toInstall.filter((tld) => !known.has(tld))).toEqual([]);
		expect(core.filter((tld) => !toInstall.includes(tld))).toEqual([]);
	});

	test('the seed dump is vendored', () => {
		expect(existsSync(join(ROOT, 'install/db/dedalo_install.pgsql.gz'))).toBe(true);
	});

	test('NO hierarchy metadata copy exists under client/', () => {
		// "Link, never duplicate". A re-introduced copy is drift by construction:
		// nothing reads it, so nothing would notice it going stale.
		const copies = readdirSync(CLIENT_INSTALLER_DIR).filter((name) =>
			/^hierarch(y|ies).*\.json$/.test(name),
		);
		expect(copies, 'dead duplicate of the install seed metadata').toEqual([]);
	});
});
