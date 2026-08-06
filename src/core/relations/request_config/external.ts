/**
 * request_config EXTERNAL ENGINE resolution (RELATIONS_SPEC.md §6.5):
 * an explicit config item whose `api_engine` is not 'dedalo' (zenon, isad, …)
 * resolves its records through a third-party adapter. The adapter's
 * connection settings (base URL, field mappings) are NOT on the component —
 * they live on the TARGET SECTION's ontology properties under `api_config`,
 * identified from the first show ddo's section_tipo.
 *
 * THE TARGET SECTION IS THE SOURCE OF TRUTH. rsc205 also carries an
 * `api_config` (its own `info` says it was pasted there in 2024 "from reference
 * in component_external->load_data_from_remote"), but no engine path reads a
 * CALLER's copy — the ddo names zenon1 and zenon1's copy is what binds. That
 * makes rsc205's duplicate inert rather than a second, drifting truth. It is
 * the user's catalogue data, so it is not deleted; whether to remove it is an
 * open question for the operator.
 *
 * PHP reference: trait.request_config_v6.php resolve_external_config (:628).
 * The read-side proxy that consumes this config lives in src/external/.
 */

import { publishApiConfig } from '../../../external/api/index.ts';
import { getNode } from '../../ontology/resolver.ts';
import type { ParsedRequestConfigItem } from './explicit.ts';

/**
 * Attach the target section's `api_config` to a non-dedalo config item (PHP
 * resolve_external_config), SHAPED for publication — the raw ontology object
 * never reaches the wire (publishApiConfig: credential strip, key allowlist,
 * http(s)-only URLs). No-op when the show ddo_map is empty or its first ddo
 * carries no section_tipo — there is no safe way to guess which section's
 * api_config applies; the item keeps the `null` every item is born with.
 */
export async function resolveExternalConfig(parsedItem: ParsedRequestConfigItem): Promise<void> {
	const firstDdo = parsedItem.show?.ddo_map[0];
	if (firstDdo === undefined) return;
	const rawSection = firstDdo.section_tipo;
	const engineSectionTipo = Array.isArray(rawSection) ? rawSection[0] : rawSection;
	if (typeof engineSectionTipo !== 'string' || engineSectionTipo === '') return;

	const node = await getNode(engineSectionTipo);
	const properties = node?.properties as { api_config?: unknown } | null;
	if (properties !== null && typeof properties === 'object' && 'api_config' in properties) {
		parsedItem.api_config = publishApiConfig(properties.api_config, {
			sectionTipo: engineSectionTipo,
		});
	}
}
