/**
 * calculation PROCESS FUNCTION registry — the TS answer to PHP SEC-052.
 *
 * PHP's calculation widget loads external fn files declared in the ontology
 * (`process: {engine:'php', file, fn, options}` → include under
 * DEDALO_WIDGETS_PATH with realpath confinement + fn-name regex +
 * ReflectionFunction file check). TS NEVER loads code from ontology-authored
 * paths: every process function is a STATIC registry entry here; `file` and
 * `engine` keys are ignored (verification data only). An unknown fn resolves
 * to no output — the same effective outcome as PHP resolve_logic's refusal.
 *
 * Ported functions (the ones the shared ontology declares — behavior pinned
 * in test/parity/info_widget_differential.test.ts):
 *  - summarize (core formulas.php): sums the inputs. (!) PHP LIVE DEFECT
 *    (#5 family): any NON-EMPTY input crashes the whole PHP request
 *    (array_sum on the flat STRING get_calculation_data returns) — TS emits
 *    no output for that case (the effective outcome); with ALL inputs empty
 *    both engines emit total 0. When PHP fixes the type error, implement the
 *    real sum here and reconcile.
 *  - to_euros (mdcat/calculation/mdcat.php): reads the 'number' var
 *    specifically (the ontology declares 'numero'/'numero2', so the var is
 *    always absent → total 0); a non-empty 'number' hits the same crash pin.
 *  - calculate_period (core formulas.php): is_array-guards its input
 *    (strings never sum) → total_days 0 → no period buckets → no output.
 */

import { phpRound } from '../widget_common.ts';

export interface CalculationFnArgs {
	/** var_name → flat value string | null (PHP get_calculation_data). */
	dataMap: Record<string, string | null>;
	options?: { type?: string; precision?: number };
}

export type CalculationFn = (args: CalculationFnArgs) => { id: string; value: unknown }[];

export const CALCULATION_FUNCTIONS: Readonly<Record<string, CalculationFn>> = {
	summarize({ dataMap, options }) {
		const hasData = Object.values(dataMap).some((value) => value !== null);
		if (hasData) {
			// (!) PHP crashes the whole request here (array_sum on string) —
			// defect pin in info_widget_differential.test.ts; emit nothing.
			return [];
		}
		const precision = options?.precision ?? 2;
		const zero = options?.type === 'float' ? phpRound(0, precision) : 0;
		return [{ id: 'total', value: zero }];
	},
	to_euros({ dataMap }) {
		const number = dataMap.number ?? null;
		if (number !== null) {
			// non-empty 'number' var → same PHP array_sum(string) crash
			return [];
		}
		return [{ id: 'total', value: 0 }];
	},
	calculate_period() {
		// string inputs never pass is_array → total_days 0 → no buckets
		return [];
	},
};
