/**
 * tool_tc server module — bulk-offset every timecode in a transcription text
 * component (PHP tool_tc::change_all_timecodes). Level>=2 on the record.
 *
 * Reads the text component's lang slice, offsets each item's TC marks
 * (replaceTimecodes: clamp ≥ 0, reverse-order for positive offsets), and saves
 * the updated items through the standard save path (TM-audited).
 */

import { readMatrixRecord } from '../../../src/core/db/matrix.ts';
import { replaceTimecodes } from '../../../src/core/media/tools/timecode.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../../../src/core/ontology/resolver.ts';
import { readComponentItems } from '../../../src/core/resolve/component_data.ts';
import { saveComponentData } from '../../../src/core/section/record/save_component.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';

async function changeAllTimecodes(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const componentTipo = String(ctx.options.component_tipo ?? ctx.options.tipo ?? '');
		const sectionTipo = String(ctx.options.section_tipo ?? '');
		const sectionId = Number(ctx.options.section_id);
		const lang = String(ctx.options.lang ?? 'lg-nolan');
		const offsetSeconds = Number(ctx.options.offset_seconds ?? 0);
		if (
			componentTipo === '' ||
			sectionTipo === '' ||
			!Number.isInteger(sectionId) ||
			sectionId <= 0
		) {
			return fail('component_tipo, section_tipo and a positive section_id are required');
		}
		if (!Number.isFinite(offsetSeconds)) return fail('offset_seconds must be a number');

		const model = await getModelByTipo(componentTipo);
		const table = await getMatrixTableFromTipo(sectionTipo);
		if (model === null || table === null) return fail('component or section not found');
		const record = await readMatrixRecord(table, sectionTipo, sectionId);
		if (record === null) return fail('record not found');
		const items = (readComponentItems(record, componentTipo, model) ?? []) as {
			id?: number | string;
			lang?: string;
			value?: unknown;
		}[];

		// Optional single-key filter, else every item of the requested lang.
		const keyFilter = ctx.options.key;
		const changesByKey: Record<string, Record<string, string>> = {};
		let changedCount = 0;
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			if (item === undefined) continue; // noUncheckedIndexedAccess: sparse slot can't apply

			if (item.lang !== undefined && item.lang !== lang) continue;
			if (keyFilter != null && String(keyFilter) !== String(index)) continue;
			const rawValue = typeof item.value === 'string' ? item.value : '';
			const { text, changes } = replaceTimecodes(rawValue, offsetSeconds);
			if (Object.keys(changes).length === 0 || text === rawValue) continue;
			const updated = { ...item, value: text };
			await saveComponentData({
				componentTipo,
				sectionTipo,
				sectionId,
				lang,
				changedData: [{ action: 'update', id: item.id ?? null, value: updated }],
				userId: ctx.userId,
			});
			changesByKey[String(index)] = changes;
			changedCount += 1;
		}

		return {
			result: changedCount > 0 ? changesByKey : false,
			msg: `ok. ${changedCount} item(s) updated`,
			errors: [],
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

function fail(message: string): ToolResponse {
	return { result: false, msg: message, errors: [message] };
}

export const tool: ToolServerModule = {
	name: 'tool_tc',
	apiActions: {
		change_all_timecodes: { permission: 'record', minLevel: 2, handler: changeAllTimecodes },
	},
};
