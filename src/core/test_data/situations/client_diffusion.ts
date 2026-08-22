/**
 * THE CLIENT RUN'S DIFFUSION SITUATION (`zzcd`) — the ontology that makes
 * `tool_diffusion` AVAILABLE for the generic `test3` playground section.
 *
 * WHY IT EXISTS. `client/dedalo/test/client/js/test_diffusion.js` asserts that
 * the inspector renders the diffusion opener and that the tool's publish button
 * is confirm-gated. The opener only exists when the server lists tool_diffusion
 * in the section's tools, and `tool_diffusion::is_available` answers from the
 * DIFFUSION SECTION MAP: the sections reachable from the domain node NAMED by
 * `DEDALO_DIFFUSION_DOMAIN` (src/core/diffusion_bridge/diffusion_map.ts). A
 * from-scratch suite database carries no such domain, so the map is empty, no
 * tool is offered and every case in that suite fails on a missing DOM node.
 *
 * Before the client run got its own server (2026-08-19) the suite drove the
 * developer's `bun run dev` on the APPLICATION database, where the install's own
 * domain happened to cover the install's own `rsc170` section — the suite was
 * green because of what that one machine held. That is precisely the situation
 * the generic-TLD law forbids: it BUILDS what it needs instead.
 *
 * SHAPE (one sql element is enough — availability is a map lookup, and the
 * suite never confirms a publish):
 *
 *   zzcd0  diffusion_domain   <DEDALO_DIFFUSION_DOMAIN>   (parent dd1190)
 *   zzcd1  diffusion_element  {"diffusion":{"type":"sql"}}
 *     zzcd2  database  'zzcd_client_db'
 *     zzcd3  table     'zzcd_client_table'  → section test3
 *       zzcd4  field_varchar 'label'  → test17 (the playground's component_text_area)
 *       zzcd5  field_int     'id'     → test142 (component_section_id)
 *
 * THE FIELD CHILDREN ARE LOAD-BEARING, not decoration: the tool renders a
 * panel's body — and with it the publish button — only for a node that HAS
 * children (`node.children?.length > 0`, render_tool_diffusion.js), because a
 * table with no field mapping publishes nothing. A childless table gives the
 * suite an opener that opens onto an empty panel.
 *
 * THE RUN NAMES ITS OWN DOMAIN — it does NOT borrow the configured one. The
 * engine resolves the domain BY NAME (`resolveDomainTipo`: the FIRST `dd1190`
 * child whose term matches, ordered by order_number then tipo), so a fixture
 * node carrying the installation's own domain name competes with the real node
 * for that lookup. Both outcomes are bad, and which one you get is ambient:
 *   - the fixture wins (what happened here: the suite database's real `mht`
 *     domain is order_number 16, the situation default is 1) and SHADOWS the
 *     install's whole diffusion map for the length of the run;
 *   - the real node wins (its order_number is 0, or it ties and sorts first)
 *     and the suite is red again, with the fixture sitting there looking right.
 * Worse, `test/helpers/zzd_diffusion_fixture.ts` mints a same-named `zzd0` for
 * the unit gates: leftover rows from an interrupted client run (Ctrl-C skips the
 * teardown) would then out-sort `zzd0` and send those gates looking for tables
 * this fixture does not have.
 *
 * So the domain is named `CLIENT_DIFFUSION_DOMAIN`, a name no installation
 * carries, and `scripts/client_test_server.ts` sets `DEDALO_DIFFUSION_DOMAIN` to
 * exactly that for the run's own server. Nothing is shadowed, nothing competes,
 * and the resolution no longer depends on sort order.
 *
 * Sibling: `test/helpers/zzd_diffusion_fixture.ts` does the same for the
 * diffusion-delete unit gates (and still borrows the configured name — same
 * latent weakness, its own change). This one lives under `src/` because the
 * CLIENT runner (a script, outside the `bun test` preload) provisions it.
 */

import { CLIENT_DIFFUSION_DOMAIN } from './client_diffusion_domain.ts';
import {
	dropSituation,
	ensureSituation,
	residueOf,
	type Situation,
	situation,
} from './situation.ts';

/** The section the client diffusion suite renders — the generic playground. */
export const CLIENT_DIFFUSION_SECTION = 'test3';

/**
 * THE RUN'S OWN DOMAIN NAME, re-exported from the import-free leaf that
 * `scripts/client_test_server.ts` reads before the engine is configured (it must
 * set `DEDALO_DIFFUSION_DOMAIN` to this for BOTH the runner process and the
 * spawned server, or the engine resolves some other domain and the situation is
 * invisible). One definition, two consumers.
 */
export { CLIENT_DIFFUSION_DOMAIN } from './client_diffusion_domain.ts';

export function clientDiffusionSituation(): Situation {
	const domainName = CLIENT_DIFFUSION_DOMAIN;
	return situation({
		name: 'client diffusion fixture',
		tld: 'zzcd',
		nodes: [
			{
				tipo: 'zzcd0',
				parent: 'dd1190',
				model: 'diffusion_domain',
				term: { 'lg-spa': domainName },
			},
			{
				tipo: 'zzcd1',
				parent: 'zzcd0',
				model: 'diffusion_element',
				term: { 'lg-spa': 'zzcd sql element' },
				properties: { diffusion: { type: 'sql' } },
			},
			{
				tipo: 'zzcd2',
				parent: 'zzcd1',
				model: 'database',
				term: { 'lg-spa': 'zzcd_client_db' },
			},
			{
				tipo: 'zzcd3',
				parent: 'zzcd1',
				model: 'table',
				term: { 'lg-spa': 'zzcd_client_table' },
				relations: [{ tipo: CLIENT_DIFFUSION_SECTION }],
				order_number: 1,
			},
			{
				tipo: 'zzcd4',
				parent: 'zzcd3',
				model: 'field_varchar',
				term: { 'lg-spa': 'label' },
				relations: [{ tipo: 'test17' }],
				properties: { varchar: 500 },
				order_number: 1,
			},
			{
				tipo: 'zzcd5',
				parent: 'zzcd3',
				model: 'field_int',
				term: { 'lg-spa': 'id' },
				relations: [{ tipo: 'test142' }],
				order_number: 2,
			},
		],
	});
}

/**
 * Provision it (idempotent: the situation is re-ensured, never duplicated), then
 * PROVE it took: the whole point is that `tool_diffusion` becomes available for
 * the section, and that is one map lookup away. Without this check a fixture
 * that silently lost the domain race would surface as six unexplained DOM
 * assertions in a browser suite instead of one sentence here.
 */
export async function ensureClientDiffusion(): Promise<void> {
	await ensureSituation(clientDiffusionSituation());
	const { getSectionDiffusionMap } = await import('../../diffusion_bridge/diffusion_map.ts');
	const map = await getSectionDiffusionMap();
	if (!map.has(CLIENT_DIFFUSION_SECTION)) {
		throw new Error(
			`client diffusion situation: '${CLIENT_DIFFUSION_SECTION}' is not in the diffusion section map after provisioning — the engine resolved a different '${CLIENT_DIFFUSION_DOMAIN}' domain node (map: ${[...map].join(', ') || 'empty'}).`,
		);
	}
}

/** Remove it. Returns the residue, which the caller asserts is 0. */
export async function dropClientDiffusion(): Promise<number> {
	const s = clientDiffusionSituation();
	await dropSituation(s);
	return residueOf(s);
}
