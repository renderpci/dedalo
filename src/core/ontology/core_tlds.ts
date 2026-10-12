/**
 * THE CORE ONTOLOGY TLDs — the ontologies every Dédalo installation carries,
 * whatever its domain.
 *
 * The install seed (`install/db/dedalo_install.pgsql.gz`) carries EXACTLY these
 * TLDs in `dd_ontology` / `matrix_ontology` and nothing else: every domain
 * ontology (`oh`, `tch`, `utoponymy`, `nexus`, …) is an install ANSWER, imported
 * by the installer from the vendored file or an ontology server. The engine owns
 * NO TLD: every definition, the sections the engine itself writes included (the
 * AI usage ledger, `dd660`), belongs to the master ontology (AGENTS.md
 * "Ontology definitions belong to the MASTER ontology").
 *
 * The config catalog's `ACTIVE_ONTOLOGY_TLDS` default
 * (src/config/catalog/defaults.ts) is a GATED TWIN of this list, not an import:
 * config may not import core. The seed gate (install_seed_drift_tripwire) holds
 * the three equal — this list, the catalog default (same order) and the seed's
 * `dd_ontology` TLD set.
 *
 * A LEAF module: it imports nothing, so any layer (installer, gates, scripts)
 * may read it without pulling the engine in.
 */

/** The core TLDs, in the order the catalog default lists them. */
export const CORE_ONTOLOGY_TLDS: readonly string[] = Object.freeze([
	'dd',
	'rsc',
	'ontology',
	'ontologytype',
	'hierarchy',
	'lg',
]);

const CORE_SET: ReadonlySet<string> = new Set(CORE_ONTOLOGY_TLDS);

/** True when `tld` (trimmed, any case) is one of the core TLDs. */
export function isCoreOntologyTld(tld: string): boolean {
	return CORE_SET.has(tld.trim().toLowerCase());
}
