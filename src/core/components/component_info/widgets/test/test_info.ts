/**
 * test_info widget (PHP core/widgets/test/test_info).
 *
 * Test stub widget: resolve the first source component value ('current'
 * sentinels honored) and emit one item per output id — the value, or a
 * deterministic placeholder encoding the section context.
 */

import {
	type InfoWidgetDescriptor,
	type TypedInput,
	type WidgetContext,
	type WidgetItem,
	readWidgetComponentData,
	resolveCurrent,
} from '../widget_common.ts';

async function computeTestInfo(ipo: unknown[], context: WidgetContext): Promise<WidgetItem[]> {
	const data: WidgetItem[] = [];
	for (const [key, entry] of ipo.entries()) {
		const block = entry as {
			input?: { source?: TypedInput[] };
			output?: { id?: string }[];
		};
		const output = Array.isArray(block.output) ? block.output : [];

		let sourceValue: unknown = null;
		for (const source of block.input?.source ?? []) {
			const sourceSection = String(resolveCurrent(source.section_tipo, context.sectionTipo));
			const sourceId = resolveCurrent(source.section_id, context.sectionId);
			const sourceComponent = source.component_tipo;
			if (sourceComponent === undefined || sourceComponent === null) continue;
			const sourceData = (await readWidgetComponentData(
				sourceSection,
				sourceId,
				sourceComponent,
			)) as { value?: unknown }[];
			if (sourceData.length > 0) {
				sourceValue = sourceData[0]?.value ?? null;
			}
		}

		for (const dataMap of output) {
			const id = dataMap.id ?? '';
			data.push({
				widget: 'test_info',
				key,
				widget_id: id,
				id,
				value:
					sourceValue ??
					`test_info widget value for section ${context.sectionTipo} - ${context.sectionId}`,
			});
		}
	}
	return data;
}

export const test_info: InfoWidgetDescriptor = {
	name: 'test_info',
	path: '/test/test_info',
	computeData: computeTestInfo,
};
