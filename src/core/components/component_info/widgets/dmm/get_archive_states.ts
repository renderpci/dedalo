/**
 * get_archive_states widget (PHP core/widgets/dmm/get_archive_states).
 *
 * Aggregates radio_button state values from the records linked by the source
 * portal into two dimensions — "answer" and "closed": affirmative
 * (section_id '1') / negative (section_id '2') counts and percentages over
 * the FULL linked-record count (records without a datum are excluded from
 * their dimension's count, so totals may undershoot). 14 keyed outputs; the
 * first ('closed_afirmative') additionally carries closed_label /
 * answer_label resolved from the ontology.
 *
 * No instance in THIS install's ontology declares it (the PHP
 * get_widget_data path is equally unreachable here) — shape gate:
 * test/unit/info_widget_ports.test.ts against the PHP class contract.
 */

import { termByTipo } from '../../../../ontology/labels.ts';
import {
	type InfoWidgetDescriptor,
	type WidgetContext,
	type WidgetItem,
	findTyped,
	phpRound,
	readWidgetComponentData,
} from '../widget_common.ts';

async function computeGetArchiveStates(
	ipo: unknown[],
	context: WidgetContext,
): Promise<WidgetItem[]> {
	const data: WidgetItem[] = [];
	for (const [key, entry] of ipo.entries()) {
		const block = entry as { input?: unknown[]; output?: { id?: string }[] };
		const input = Array.isArray(block.input) ? block.input : [];
		const output = Array.isArray(block.output) ? block.output : [];

		const source = findTyped(input, 'source');
		if (source?.component_tipo === undefined) continue;
		const sourceSection =
			source.section_tipo === 'self' ? context.sectionTipo : (source.section_tipo ?? '');
		const portalData = (await readWidgetComponentData(
			sourceSection,
			context.sectionId,
			source.component_tipo,
		)) as { section_id?: unknown; section_tipo?: unknown }[];
		// early exit: PHP returns [] for the WHOLE widget when the portal is empty
		if (portalData.length === 0) return [];

		const answer = findTyped(input, 'answer');
		const closed = findTyped(input, 'closed');
		const answerTipo = answer?.component_tipo ?? '';
		const closedTipo = closed?.component_tipo ?? '';
		const answerLabel = await termByTipo(answerTipo, context.lang);
		const closedLabel = await termByTipo(closedTipo, context.lang);

		// harvest the FIRST datum of each linked record's answer/closed component
		const arAnswer: { section_id?: unknown }[] = [];
		const arClosed: { section_id?: unknown }[] = [];
		for (const locator of portalData) {
			const recordSection = String(locator.section_tipo ?? '');
			const recordId = locator.section_id as number | string;
			const answerData = (await readWidgetComponentData(recordSection, recordId, answerTipo)) as {
				section_id?: unknown;
			}[];
			if (answerData.length > 0 && answerData[0] !== undefined) arAnswer.push(answerData[0]);
			const closedData = (await readWidgetComponentData(recordSection, recordId, closedTipo)) as {
				section_id?: unknown;
			}[];
			if (closedData.length > 0 && closedData[0] !== undefined) arClosed.push(closedData[0]);
		}

		// array_count_values over section_id ('1' affirmative / '2' negative)
		const bucket = (items: { section_id?: unknown }[]): Record<string, number> => {
			const counts: Record<string, number> = {};
			for (const item of items) {
				const bucketKey = String(item.section_id);
				counts[bucketKey] = (counts[bucketKey] ?? 0) + 1;
			}
			return counts;
		};
		const totalData = portalData.length;
		const totalAnswer = arAnswer.length > 0 ? bucket(arAnswer) : {};
		const totalClosed = arClosed.length > 0 ? bucket(arClosed) : {};

		// output variables (PHP $$current_id: unset → null)
		const stats: Record<string, unknown> = {};
		if ((totalClosed['1'] ?? 0) > 0) {
			stats.closed_afirmative = totalClosed['1'];
			stats.closed_afirmative_percent = phpRound(
				((totalClosed['1'] as number) * 100) / totalData,
				1,
			);
		}
		if ((totalClosed['2'] ?? 0) > 0) {
			stats.closed_negative = totalClosed['2'];
			stats.closed_negative_percent = phpRound(((totalClosed['2'] as number) * 100) / totalData, 1);
		}
		if (arClosed.length > 0) {
			stats.closed_count = arClosed.length;
			stats.closed_count_percent = phpRound((arClosed.length * 100) / totalData, 1);
			stats.closed_total = totalData;
		}
		if ((totalAnswer['1'] ?? 0) > 0) {
			stats.answer_afirmative = totalAnswer['1'];
			stats.answer_afirmative_percent = phpRound(
				((totalAnswer['1'] as number) * 100) / totalData,
				1,
			);
		}
		if ((totalAnswer['2'] ?? 0) > 0) {
			stats.answer_negative = totalAnswer['2'];
			stats.answer_negative_percent = phpRound(((totalAnswer['2'] as number) * 100) / totalData, 1);
		}
		if (arAnswer.length > 0) {
			stats.answer_count = arAnswer.length;
			stats.answer_count_percent = phpRound((arAnswer.length * 100) / totalData, 1);
			stats.answer_total = totalData;
		}

		for (const dataMap of output) {
			const id = dataMap.id ?? '';
			const item: WidgetItem = {
				widget: 'get_archive_states',
				key,
				widget_id: id,
			};
			// the FIRST output item carries the human-readable dimension labels
			if (id === 'closed_afirmative') {
				item.closed_label = closedLabel;
				item.answer_label = answerLabel;
			}
			item.value = stats[id] ?? null;
			data.push(item);
		}
	}
	return data;
}

export const get_archive_states: InfoWidgetDescriptor = {
	name: 'get_archive_states',
	path: '/dmm/get_archive_states',
	computeData: computeGetArchiveStates,
};
