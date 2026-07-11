/**
 * media_icons widget (PHP core/widgets/oh/media_icons) — per-media icon rows.
 *
 * One row object per linked media record: id + tc value columns and one
 * tool-launch column per declared tool (transcription / indexation /
 * translation), whose tool_context is the user-tools simple context plus the
 * section_tool node's tool_config with 'self' expanded to the media record
 * and each ddo enriched with model/translatable/label (PHP
 * create_tool_simple_context).
 *
 * tc SLOW PATH divergence (deliberate): when the cached rsc54 duration is
 * missing, PHP probes the media FILE and WRITES the computed tc back during
 * the read (oracle-verified: missing file → '00:00:00.000' persisted to
 * rsc54). TS emits the same display value but NEVER writes — persisting an
 * unverified 0 duration would poison the cache for records whose real file
 * PHP could still measure. Both sides pinned in the gate.
 */

import { getModelByTipo, getNode } from '../../../../ontology/resolver.ts';
import { currentApplicationLang } from '../../../../resolve/request_lang.ts';
import {
	type InfoWidgetDescriptor,
	type TypedInput,
	type WidgetContext,
	type WidgetItem,
	readWidgetComponentData,
	resolveCurrent,
} from '../widget_common.ts';

/** The cached-duration component on media records (PHP hardcoded 'rsc54'). */
const MEDIA_DURATION_TIPO = 'rsc54';

async function computeMediaIcons(ipo: unknown[], context: WidgetContext): Promise<WidgetItem[]> {
	const data: WidgetItem[] = [];
	const { getUserTools, getSuperuserUserTools } = await import('../../../../tools/registry.ts');
	const { termByTipo } = await import('../../../../ontology/labels.ts');
	const { getTranslatableByTipo } = await import('../../../../ontology/resolver.ts');
	const userTools =
		context.userId === undefined || context.userId === null
			? await getSuperuserUserTools()
			: await getUserTools(context.userId, context.isAdmin === true);

	for (const [key, entry] of ipo.entries()) {
		const block = entry as {
			input?: { source?: TypedInput[]; paths?: { component_tipo?: string }[][] };
			output?: { id?: string; label?: string; process_section_tipo?: string }[];
		};
		const output = Array.isArray(block.output) ? block.output : [];
		const paths = block.input?.paths ?? [];

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
			void path; // only the last hop matters; the AV component itself is
			// needed only for the slow-path file probe (not taken here)
			for (const locator of arLocator) {
				const mediaSection = String(locator.section_tipo ?? '');
				const mediaId = locator.section_id as number | string;

				const row: Record<string, unknown> = {};
				for (const dataMap of output) {
					const columnId = dataMap.id ?? '';
					const cell: Record<string, unknown> = {
						widget: 'media_icons',
						key,
						widget_id: columnId,
						locator,
					};
					switch (columnId) {
						case 'id':
							cell.value = mediaId;
							break;
						case 'tc': {
							const durationItems = (await readWidgetComponentData(
								mediaSection,
								mediaId,
								MEDIA_DURATION_TIPO,
							)) as { value?: unknown }[];
							const cachedTc = durationItems[0]?.value;
							if (cachedTc !== undefined && cachedTc !== null) {
								cell.value = cachedTc;
							} else {
								// slow path (see doc): no file probe, no write-back
								const { secondsToTc } = await import('../../../../resolve/tr_marks.ts');
								cell.value = secondsToTc(0);
							}
							break;
						}
						default: {
							// tool column: value stays UNSET (PHP isset(null) === false)
							const toolName = dataMap.label ?? '';
							const tool = userTools.find((candidate) => candidate.name === toolName);
							if (tool !== undefined) {
								const sectionToolTipo = dataMap.process_section_tipo ?? '';
								const toolNode = await getNode(sectionToolTipo);
								const toolConfig = structuredClone(
									(
										toolNode?.properties as {
											tool_config?: Record<string, { ddo_map?: Record<string, unknown>[] }>;
										} | null
									)?.tool_config?.[toolName] ?? null,
								);
								if (toolConfig !== null && Array.isArray(toolConfig.ddo_map)) {
									for (const ddo of toolConfig.ddo_map) {
										if (ddo.section_id === 'self') ddo.section_id = mediaId;
										if (ddo.model === undefined) {
											ddo.model = await getModelByTipo(String(ddo.tipo));
										}
										ddo.translatable = await getTranslatableByTipo(String(ddo.tipo));
										ddo.label = await termByTipo(String(ddo.tipo), currentApplicationLang());
									}
								}
								cell.tool_context = { ...tool, tool_config: toolConfig };
							}
							break;
						}
					}
					row[columnId] = cell;
					row.widget = 'media_icons';
				}
				data.push(row);
			}
		}
	}
	return data;
}

export const media_icons: InfoWidgetDescriptor = {
	name: 'media_icons',
	path: '/oh/media_icons',
	computeData: computeMediaIcons,
};
