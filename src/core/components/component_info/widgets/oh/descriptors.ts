/**
 * descriptors widget (PHP core/widgets/oh/descriptors) — edit-mode
 * indexation summary.
 *
 * Indexation count + merged term grid over the records linked by the source
 * relation (e.g. oh25 → rsc167 tapes, each holding rsc860 descriptor
 * locators). LIST mode short-circuits to [] (PHP: data loads on demand).
 * The 'terms' grid value is the target component's grid-value object with the
 * merged rows — its exact shape is fixture-gated against the live oracle.
 */

import { buildPortalGridValue } from '../grid.ts';
import {
	type InfoWidgetDescriptor,
	type TypedInput,
	type WidgetContext,
	type WidgetItem,
	readWidgetComponentData,
	resolveCurrent,
} from '../widget_common.ts';

async function computeDescriptors(ipo: unknown[], context: WidgetContext): Promise<WidgetItem[]> {
	if (context.mode === 'list') return [];
	const data: WidgetItem[] = [];
	for (const [key, entry] of ipo.entries()) {
		const block = entry as {
			input?: { source?: TypedInput[]; paths?: { component_tipo?: string }[][] };
			output?: { id?: string }[];
		};
		const output = Array.isArray(block.output) ? block.output : [];
		const paths = block.input?.paths ?? [];

		// source locators (merged across source descriptors)
		const arLocator: { section_tipo?: unknown; section_id?: unknown }[] = [];
		for (const source of block.input?.source ?? []) {
			if (source.component_tipo === undefined) continue;
			const sourceSection = String(resolveCurrent(source.section_tipo, context.sectionTipo));
			const sourceId = resolveCurrent(source.section_id, context.sectionId);
			const sourceData = (await readWidgetComponentData(
				sourceSection,
				sourceId,
				source.component_tipo,
			)) as { section_tipo?: unknown; section_id?: unknown }[];
			arLocator.push(...sourceData);
		}

		for (const path of paths) {
			const lastHop = path[path.length - 1];
			const componentTipo = lastHop?.component_tipo;
			if (componentTipo === undefined) continue;

			// per-locator instance grids: rows merge; the LAST instance's outer
			// object carries the merged rows (PHP keeps its row_count — quirk).
			const arComponentData: unknown[] = [];
			const mergedRows: unknown[] = [];
			let lastGrid: Record<string, unknown> | null = null;
			for (const locator of arLocator) {
				const hostSection = String(locator.section_tipo ?? '');
				const hostId = locator.section_id as number | string;
				const items = await readWidgetComponentData(hostSection, hostId, componentTipo);
				arComponentData.push(...items);
				const { grid, rows } = await buildPortalGridValue(
					componentTipo,
					hostSection,
					hostId,
					context.lang,
				);
				mergedRows.push(...rows);
				lastGrid = grid;
			}
			if (lastGrid === null) continue; // PHP: grid value never set → skip path
			lastGrid.value = mergedRows;

			const lastLocator = arLocator[arLocator.length - 1] ?? null;
			for (const dataMap of output) {
				const id = dataMap.id ?? '';
				const value = id === 'indexation' ? arComponentData.length : lastGrid;
				data.push({
					widget: 'descriptors',
					key,
					widget_id: id,
					value,
					locator: lastLocator,
				});
			}
		}
	}
	return data;
}

export const descriptors: InfoWidgetDescriptor = {
	name: 'descriptors',
	path: '/oh/descriptors',
	computeData: computeDescriptors,
};
