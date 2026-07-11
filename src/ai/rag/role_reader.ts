/**
 * The characterizer's metadata reader (reference `src/ai/rag2/src/role_reader.ts`,
 * Brick 5). Reads a neighbour's role value via this branch's get_value path
 * (readComponentText, READ-ONLY) and classifies it: a date component becomes an
 * ordinal-seconds range (for ordering periods), everything else a categorical label.
 */

import { getMatrixTableFromTipo, getModelByTipo } from '../../core/ontology/resolver.ts';
import type { RoleReader } from './characterizer.ts';
import { readComponentText } from './component_text.ts';

const SECONDS_PER_YEAR = 31_557_600;
const SECONDS_PER_MONTH = 2_629_800;
const SECONDS_PER_DAY = 86_400;

/**
 * A monotonic BCE-aware ordering surrogate (a ported stand-in for PHP
 * dd_date::convert_date_to_seconds). It is NOT a calendar — only the ORDER matters
 * (the label, not the seconds, is surfaced in the proposal).
 */
export function dateToSeconds(
	date: { year?: number; month?: number; day?: number } | null,
): number {
	if (date === null || date === undefined || date.year === undefined) return 0;
	return (
		date.year * SECONDS_PER_YEAR +
		(date.month ?? 0) * SECONDS_PER_MONTH +
		(date.day ?? 0) * SECONDS_PER_DAY
	);
}

/** Extract the first (optionally negative/BCE) year from a free-text date label. */
function parseYear(text: string): number | null {
	const match = /-?\d{1,4}/.exec(text);
	if (match === null) return null;
	const year = Number.parseInt(match[0], 10);
	return Number.isFinite(year) ? year : null;
}

/**
 * Build the production RoleReader over this branch's resolver + get_value. Reads
 * the neighbour's component text in the first data lang (or nolan). A date model
 * yields an ordinal range; anything else a categorical label. Soft failures → null.
 */
export function buildRoleReader(langs: readonly string[], nolan: string): RoleReader {
	const lang = langs[0] ?? nolan;
	return async (_role, componentTipo, neighbour) => {
		try {
			const model = await getModelByTipo(componentTipo);
			if (model === null) return null;
			const matrixTable = (await getMatrixTableFromTipo(neighbour.sectionTipo)) ?? 'matrix';
			const text = await readComponentText({
				matrixTable,
				componentTipo,
				model,
				sectionTipo: neighbour.sectionTipo,
				sectionId: neighbour.sectionId,
				lang,
			});
			if (text === '') return null;
			if (model === 'component_date') {
				const year = parseYear(text);
				if (year !== null) {
					const seconds = dateToSeconds({ year });
					return { kind: 'date', from: seconds, to: seconds, label: text };
				}
			}
			return { kind: 'categorical', value: text };
		} catch {
			return null;
		}
	};
}
