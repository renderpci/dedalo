/**
 * Resolve the ontology-driven path options for a media component in a section:
 * `max_items_folder` (the component's own property) and `initial_media_path`
 * (the SECTION's property keyed by the component tipo). PHP get_additional_path
 * (:801) / get_initial_media_path (:715).
 */

import { getNode } from '../ontology/resolver.ts';
import type { MediaPathOptions } from './path.ts';

/** Read a component + section node and derive the path-shaping options. */
export async function resolveMediaPathOptions(
	componentTipo: string,
	sectionTipo: string,
): Promise<MediaPathOptions> {
	const componentNode = await getNode(componentTipo);
	const sectionNode = await getNode(sectionTipo);

	const componentProps = (componentNode?.properties ?? {}) as Record<string, unknown>;
	const rawMax = componentProps.max_items_folder;
	const maxItemsFolder =
		typeof rawMax === 'number'
			? rawMax
			: typeof rawMax === 'string'
				? Number(rawMax) || null
				: null;

	// initial_media_path lives on the SECTION, keyed by component tipo (leading slash forced).
	let initialMediaPath = '';
	const sectionProps = (sectionNode?.properties ?? {}) as Record<string, unknown>;
	const initialMap = sectionProps.initial_media_path as Record<string, string> | undefined;
	if (initialMap && typeof initialMap === 'object') {
		const value = initialMap[componentTipo];
		if (typeof value === 'string' && value !== '') {
			initialMediaPath = value.startsWith('/') ? value : `/${value}`;
		}
	}

	return { initialMediaPath, maxItemsFolder };
}
