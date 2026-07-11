/**
 * calculation widget (PHP core/widgets/calculation + formulas.php / mdcat.php).
 *
 * The generic calculation engine: resolve each declared input component to
 * its get_calculation_data value (get_value — the atoms flat string; null
 * when the component holds nothing), run the declared formula, and emit one
 * {widget, key, id, value} item per output id the formula produced.
 *
 * Formulas live in the STATIC fn registry (./functions.ts — the TS answer to
 * PHP SEC-052 dynamic includes); each carries its own defect pins.
 *
 * Input scopes: only section_id 'current' iterates components (as PHP);
 * literal ids resolve NO components (PHP default branch). The 'all' /
 * 'search_session' aggregate scopes and filter:true SQO inputs are UNPORTED
 * (no ontology instance uses them) — they resolve like the empty map.
 * The 'date' summarize type is likewise unported (no instance).
 */

import {
	type InfoWidgetDescriptor,
	type WidgetContext,
	type WidgetItem,
	readWidgetComponentData,
	resolveCurrent,
} from '../widget_common.ts';
import { CALCULATION_FUNCTIONS } from './functions.ts';

async function computeCalculation(ipo: unknown[], context: WidgetContext): Promise<WidgetItem[]> {
	const data: WidgetItem[] = [];
	for (const [key, entry] of ipo.entries()) {
		const block = entry as {
			input?: {
				section_tipo?: string;
				section_id?: string;
				components?: { tipo?: string; var_name?: string }[];
			};
			process?: { fn?: string; options?: { type?: string; precision?: number } };
			output?: { id?: string }[];
		};
		const output = Array.isArray(block.output) ? block.output : [];
		const input = block.input ?? {};
		const sectionTipo = String(resolveCurrent(input.section_tipo, context.sectionTipo));

		// data map: var_name → flat value string | null (get_calculation_data)
		const dataMap: Record<string, string | null> = {};
		if (input.section_id === 'current' || input.section_id === undefined) {
			for (const component of input.components ?? []) {
				if (component.tipo === undefined || component.var_name === undefined) continue;
				const items = (await readWidgetComponentData(
					sectionTipo,
					context.sectionId,
					component.tipo,
				)) as { value?: unknown }[];
				const values = items
					.map((item) => item?.value)
					.filter((value) => value !== undefined && value !== null && value !== '');
				dataMap[component.var_name] = values.length > 0 ? values.join(', ') : null;
			}
		}

		// formula — static registry dispatch (unknown fn → PHP resolve_logic
		// refuses, SEC-052 → no output)
		const fn =
			block.process?.fn !== undefined ? CALCULATION_FUNCTIONS[block.process.fn] : undefined;
		const result = fn !== undefined ? fn({ dataMap, options: block.process?.options }) : [];

		for (const dataMap2 of output) {
			const id = dataMap2.id ?? '';
			const found = result.find((item) => item.id === id);
			if (found !== undefined) {
				data.push({ widget: 'calculation', key, id, value: found.value });
			}
		}
	}
	return data;
}

export const calculation: InfoWidgetDescriptor = {
	name: 'calculation',
	path: '/calculation',
	computeData: computeCalculation,
};
