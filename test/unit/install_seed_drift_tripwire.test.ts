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
 *
 * THE SEED DUMP ITSELF (installer unification A2, 2026-10-09). The seed is
 * CORE-ONLY, built by ONE script (scripts/build_install_seed.ts, `bun run
 * seed:build`) and described by a provenance sidecar. Measured here from the
 * committed bytes, with the SAME readers the builder refused on
 * (scripts/lib/install_seed.ts seedCensus + seedCoreViolations — never a second
 * parser):
 *  - the sidecar describes THESE bytes (sha256, COPY row counts, core list,
 *    dump options incl. both derived-store exclusions) and names a builder that
 *    exists — a hand-edited or hand-appended seed reddens here;
 *  - the dump is core-only: dd_ontology TLDs = matrix_ontology sections =
 *    registry TLDs = CORE (exactly); main_dd ⊆ CORE ∪ {localontology};
 *    matrix_dd ⊆ CORE; no matrix_test row (test3 is the suite's); the derived
 *    stores created and EMPTY (the installer refills them);
 *  - the catalog default of ACTIVE_ONTOLOGY_TLDS = CORE_ONTOLOGY_TLDS (same
 *    order) = the seed's dd_ontology TLD set — the config may not import core,
 *    so this equality is what keeps the two literals one list;
 *  - the core's structural DEPENDENCY-class references to tipos the seed does
 *    not hold (src/core/ontology/ontology_references.ts, diffusion model set
 *    derived from the seed's own model rows) equal
 *    engineering/install_seed_contract.json EXACTLY, every reason non-empty.
 *    Graft and diffusion references are soft by rule and never listed.
 * Anti-vacuity: floors on rows/references, and planted offenders (a domain TLD
 * row, a test3 row, a dangling dependency) must each be reported.
 */

import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
	SEED_BUILD_SIDECAR_PATH,
	SEED_DERIVED_STORE_TABLES,
	SEED_DUMP_OPTIONS,
	SEED_PATH,
	type SeedBuildSidecar,
	seedCensus,
	seedCoreViolations,
	seedOntologyRows,
} from '../../scripts/lib/install_seed.ts';
import { DEFAULTS_KEYS } from '../../src/config/catalog/defaults.ts';
import { CORE_ONTOLOGY_TLDS } from '../../src/core/ontology/core_tlds.ts';
import {
	danglingDependencies,
	diffusionModelSet,
	type OntologyReference,
	referencesOfRows,
} from '../../src/core/ontology/ontology_references.ts';

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

// ---------------------------------------------------------------------------
// The seed DUMP: core-only, reproducible, described by its sidecar.
// ---------------------------------------------------------------------------

interface ContractEntry {
	from: string;
	field: string;
	to: string;
	reason: string;
}

const seedBytes = readFileSync(join(ROOT, SEED_PATH));
const seedText = gunzipSync(seedBytes).toString('utf8');
const census = seedCensus(seedText);
const sidecar = JSON.parse(
	readFileSync(join(ROOT, SEED_BUILD_SIDECAR_PATH), 'utf8'),
) as SeedBuildSidecar;
const contract = JSON.parse(
	readFileSync(join(ROOT, 'engineering/install_seed_contract.json'), 'utf8'),
) as { known_dangling_dependencies: ContractEntry[] };

const ontologyRows = seedOntologyRows(seedText);
const presentTipos = new Set(ontologyRows.map((row) => row.tipo));
const seedDiffusionModels = diffusionModelSet(ontologyRows.filter((row) => row.is_model));
const coreSet = new Set(CORE_ONTOLOGY_TLDS);

/** The core's dependency-class references to tipos `present` does not hold, as stable keys. */
function danglingKeys(rows: typeof ontologyRows, present: ReadonlySet<string>): string[] {
	const dangling: OntologyReference[] = danglingDependencies(
		referencesOfRows(rows),
		coreSet,
		present,
		seedDiffusionModels,
	);
	return dangling.map((ref) => `${ref.from} ${ref.field} ${ref.to}`).sort();
}

describe('install seed dump — core-only, reproducible', () => {
	test('the readers see a real seed (a zero-length pass is not a pass)', () => {
		expect(ontologyRows.length).toBeGreaterThan(3000);
		expect(referencesOfRows(ontologyRows).length).toBeGreaterThan(5000);
		// The diffusion model grouper and its descendants are in the core.
		expect(seedDiffusionModels.size).toBeGreaterThan(10);
		expect(Object.keys(census.tables).length).toBeGreaterThan(20);
		expect(census.tables.matrix_langs ?? 0).toBeGreaterThan(1000);
	});

	test('the sidecar describes THESE bytes, built by a script that exists', () => {
		expect(sidecar.seed_sha256).toBe(createHash('sha256').update(seedBytes).digest('hex'));
		expect(existsSync(join(ROOT, sidecar.script))).toBe(true);
		expect(sidecar.core_tlds).toEqual([...CORE_ONTOLOGY_TLDS]);
		expect(sidecar.tables).toEqual(census.tables);
		expect(sidecar.dump_options).toEqual([...SEED_DUMP_OPTIONS]);
		for (const table of SEED_DERIVED_STORE_TABLES) {
			expect(sidecar.dump_options).toContain(`--exclude-table-data=public.${table}`);
		}
		expect(sidecar.source.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(sidecar.pg_dump).toMatch(/^pg_dump \(PostgreSQL\) \d+/);
	});

	test("the dump is core-only (the builder's own refusal list is empty)", () => {
		expect(seedCoreViolations(census, CORE_ONTOLOGY_TLDS)).toEqual([]);
		// Spelled out, so a reader of a red run sees the measured sets.
		expect(census.ddOntologyTlds).toEqual([...CORE_ONTOLOGY_TLDS].sort());
		expect(census.matrixOntologySections).toEqual(
			CORE_ONTOLOGY_TLDS.map((tld) => `${tld}0`).sort(),
		);
		expect(census.registryTlds).toEqual([...CORE_ONTOLOGY_TLDS].sort());
		expect(census.tables.matrix_test).toBe(0);
		for (const table of SEED_DERIVED_STORE_TABLES) {
			expect(census.createdTables).toContain(table);
			expect(census.tables[table] ?? 0).toBe(0);
		}
	});

	test('the refusal list is not vacuous: planted offenders are each reported', () => {
		const planted = {
			...census,
			ddOntologyTlds: [...census.ddOntologyTlds, 'zzseedplant'].sort(),
			mainDdTlds: [...census.mainDdTlds, 'zzseedplant'].sort(),
			matrixDdTlds: [...census.matrixDdTlds, 'zzseedplant'].sort(),
			tables: { ...census.tables, matrix_test: 1, [SEED_DERIVED_STORE_TABLES[0] as string]: 5 },
		};
		const violations = seedCoreViolations(planted, CORE_ONTOLOGY_TLDS);
		expect(violations.some((line) => line.startsWith('dd_ontology TLDs'))).toBe(true);
		expect(violations.some((line) => line.startsWith('main_dd TLDs'))).toBe(true);
		expect(violations.some((line) => line.startsWith('matrix_dd TLDs'))).toBe(true);
		expect(violations.some((line) => line.startsWith('matrix_test'))).toBe(true);
		expect(violations.some((line) => line.startsWith(SEED_DERIVED_STORE_TABLES[0] as string))).toBe(
			true,
		);
	});

	test('catalog default of ACTIVE_ONTOLOGY_TLDS = CORE_ONTOLOGY_TLDS (same order) = the seed TLD set', () => {
		expect<string[]>([...DEFAULTS_KEYS.ACTIVE_ONTOLOGY_TLDS.default]).toEqual([
			...CORE_ONTOLOGY_TLDS,
		]);
		expect([...CORE_ONTOLOGY_TLDS].sort()).toEqual(census.ddOntologyTlds);
	});

	test("the core's dangling DEPENDENCY references = engineering/install_seed_contract.json, exactly", () => {
		const pinned = contract.known_dangling_dependencies;
		const thin = pinned
			.filter((entry) => entry.reason.trim().length < 40)
			.map((entry) => entry.from);
		expect(thin, 'every pinned exception carries its reason').toEqual([]);
		expect(danglingKeys(ontologyRows, presentTipos)).toEqual(
			pinned.map((entry) => `${entry.from} ${entry.field} ${entry.to}`).sort(),
		);
	});

	test('the dangling measurement is not vacuous: a planted core reference to an absent tipo is reported', () => {
		// A WORKING node (a non-diffusion model) relating to a tipo of an absent TLD.
		const nonDiffusion = ontologyRows.find(
			(row) =>
				row.tld === 'dd' && row.model_tipo !== null && !seedDiffusionModels.has(row.model_tipo),
		);
		expect(nonDiffusion).toBeDefined();
		const planted = {
			...(nonDiffusion as (typeof ontologyRows)[number]),
			tipo: 'dd999999',
			relations: [{ tipo: 'zzseedplant1' }],
		};
		expect(danglingKeys([...ontologyRows, planted], presentTipos)).toContain(
			'dd999999 relations zzseedplant1',
		);
	});
});
