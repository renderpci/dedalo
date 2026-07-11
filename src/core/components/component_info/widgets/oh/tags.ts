/**
 * tags widget (PHP core/widgets/oh/tags) — transcription tag statistics.
 *
 * Tag statistics over the CURRENT record's transcription text (source entry
 * with var_name 'transcription'). Faithful quirk: PHP reuses $data — each IPO
 * iteration REPLACES the accumulator with the raw component data array and
 * then appends the widget items to it, so the returned array leads with the
 * raw text-area items of the LAST iterated IPO entry.
 */

import {
	type InfoWidgetDescriptor,
	type TypedInput,
	type WidgetContext,
	type WidgetItem,
	readWidgetComponentData,
} from '../widget_common.ts';

async function computeTags(ipo: unknown[], context: WidgetContext): Promise<WidgetItem[]> {
	const { tagStatistics } = await import('../../../../resolve/tr_marks.ts');
	let data: WidgetItem[] = [];
	for (const [key, entry] of ipo.entries()) {
		const block = entry as {
			input?: { source?: (TypedInput & { var_name?: string })[] };
			output?: { id?: string }[];
		};
		const output = Array.isArray(block.output) ? block.output : [];
		const transcription = (block.input?.source ?? []).find(
			(item) => item?.var_name === 'transcription',
		);
		if (transcription?.component_tipo === undefined) continue; // PHP logs + continue

		// raw text: get_data returns the FULL array; PHP reads item [0] verbatim
		// (the original-lang set_lang dance never re-filters get_data output).
		const componentItems = (await readWidgetComponentData(
			context.sectionTipo,
			context.sectionId,
			transcription.component_tipo,
		)) as { value?: unknown }[];
		const rawText = typeof componentItems[0]?.value === 'string' ? componentItems[0].value : '';

		const stats = tagStatistics(rawText) as unknown as Record<string, unknown>;

		// PHP quirk: $data is REPLACED with the raw component data array …
		data = [...(componentItems as WidgetItem[])];
		// … then the widget items are appended to it.
		for (const dataMap of output) {
			const id = dataMap.id ?? '';
			data.push({
				widget: 'tags',
				key,
				widget_id: id,
				value: stats[id] ?? null,
			});
		}
	}
	return data;
}

export const tags: InfoWidgetDescriptor = {
	name: 'tags',
	path: '/oh/tags',
	computeData: computeTags,
};
