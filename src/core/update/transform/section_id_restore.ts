/**
 * RESTORE-PATH section_id normalization (WC-2026-08-10-section-id-int-canonical, D6.2) — the convergence half of the int unification.
 *
 * Every door that writes a HISTORICAL payload back onto a live record (TM
 * restore, TM bulk revert — and any future old-backup import) routes the value
 * through the intify kernel first: string-form addresses the sweep would have
 * converted convert HERE too, so a restore can never re-inject the
 * pre-migration form. External remote ids and junk pass verbatim, exactly as
 * in the sweep (same kernel, same rule, same vector file).
 *
 * Resolution of the external tipo set is per call — restores are rare and the
 * set is small; a stale cache that mis-classed a newly-configured external
 * section as convertible would corrupt remote ids, which is the one
 * unacceptable failure. A THROW from a malformed api_config propagates: a
 * restore must not proceed with an unclassifiable externality set.
 */

import { listTiposWithApiConfig } from '../../db/dd_ontology.ts';
import { DedaloError } from '../../errors/index.ts';
import { intifySectionIdsInValue } from './section_id_intify.ts';

/**
 * The COMPLETE external-service tipo set, resolved and validated (D15).
 * Consumers that must never cast an external remote id (the repair driver,
 * the TM restore normalization below) prefetch this set BEFORE writing
 * anything. Lives HERE, not in src/external — the candidate query is db-layer
 * and src/external owns no SQL or table name (T4b); the validating predicate
 * is reached by dynamic import per the peer-boundary convention.
 *
 * THROWS on the first malformed api_config, tipo named — a sweep or restore
 * must abort pre-write rather than run with an unclassifiable externality set.
 */
export async function listExternalSectionTipos(): Promise<Set<string>> {
	const candidates = await listTiposWithApiConfig();
	// facade import (S3-02 boundary-seam rule: core→external goes through external/api/)
	const { isExternalSectionTipo } = await import('../../../external/api/index.ts');
	const externalTipos = new Set<string>();
	for (const tipo of candidates) {
		try {
			if (await isExternalSectionTipo(tipo)) externalTipos.add(tipo);
		} catch (error) {
			throw new DedaloError('update.refused', {
				message: `external-service config for tipo '${tipo}' is malformed — fix the ontology first: ${(error as Error).message}`,
				publicMessage: 'An external-service ontology config is malformed — fix the ontology first',
				coordinates: { tipo },
				cause: error,
			});
		}
	}
	return externalTipos;
}

/**
 * Normalize every value of `container` in place (the container itself is a
 * plain holder — a columns map or a `{ value }` wrapper — never locator data).
 */
export async function normalizeRestoredSectionIds(
	container: Record<string, unknown>,
): Promise<void> {
	const externalTipos = await listExternalSectionTipos();
	for (const key of Object.keys(container)) {
		intifySectionIdsInValue(container[key], { externalTipos });
	}
}
