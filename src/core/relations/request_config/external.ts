/**
 * request_config EXTERNAL ENGINE resolution (RELATIONS_SPEC.md §6.5):
 * an explicit config item whose `api_engine` is not 'dedalo' (zenon, isad, …)
 * resolves its records through a third-party adapter. The adapter's
 * connection settings (base URL, tokens, field mappings) are NOT on the
 * component — they live on the TARGET SECTION's ontology properties under
 * `api_config`, identified from the first show ddo's section_tipo.
 *
 * PHP reference: trait.request_config_v6.php resolve_external_config (:628).
 * The read-side proxy that consumes this config (component_external
 * load_data_from_remote, class.component_external.php:110 — read-only,
 * refuses local writes) is Phase B follow-through in the external model
 * resolver; this module only attaches the config during parse.
 */

import { getNode } from '../../ontology/resolver.ts';
import type { ParsedRequestConfigItem } from './explicit.ts';

/**
 * Attach the target section's `api_config` to a non-dedalo config item (PHP
 * resolve_external_config). No-op when the show ddo_map is empty or its
 * first ddo carries no section_tipo — there is no safe way to guess which
 * section's api_config applies.
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
		(parsedItem as ParsedRequestConfigItem & { api_config?: unknown }).api_config =
			properties.api_config;
	}
}
