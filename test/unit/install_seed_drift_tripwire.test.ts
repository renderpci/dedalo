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
 * placeholder typology), an unknown typology number renders an empty panel, and
 * an empty pre-checked set is a wizard that offers nothing.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const SERVER_DIR = join(ROOT, 'install/import/hierarchy');
const CLIENT_INSTALLER_DIR = join(ROOT, 'client/dedalo/core/installer');

/** PHP install_checked_default — mirrored from src/core/install/context.ts. */

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

	test('hierarchies_to_install names only tlds that exist', () => {
		const known = new Set(descriptors.map((d) => d.tld));
		expect(toInstall.filter((tld) => !known.has(tld))).toEqual([]);
	});

	test('the pre-checked default set is non-empty after the availability filter', async () => {
		// ASK THE ENGINE, do not re-implement it. This assertion used to filter a
		// hand-copied duplicate of `INSTALL_CHECKED_DEFAULT` against a re-derived
		// file list — a statement about the test's own literals, which would stay
		// green while the installer pre-checked nothing. Both the constant and
		// `effectiveDefaults()` are exported now, so the gate measures what the
		// wizard actually serves.
		// ts/utoponymy are legacy hints that ship no data file: the filter is the
		// point, but its RESULT must never be empty.
		const { INSTALL_CHECKED_DEFAULT, effectiveDefaults } = await import(
			'../../src/core/install/context.ts'
		);
		const effective = effectiveDefaults();
		expect(effective.length).toBeGreaterThan(0);
		expect(effective).toContain('es');
		expect(effective).toContain('lg');
		// and it really is a SUBSET of the declared defaults, filtered by what is
		// vendored — not some other list that happens to be non-empty.
		expect(effective.filter((tld) => !INSTALL_CHECKED_DEFAULT.includes(tld))).toEqual([]);
		expect(effective.filter((tld) => !dataFileTlds.has(tld))).toEqual([]);
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
