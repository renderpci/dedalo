/**
 * component_info emit hook (audit S2-24; extracted verbatim from
 * section/read.ts). Also serves component_calculation / component_state at
 * runtime (their descriptors alias to component_info).
 *
 * THE VALUE IS DERIVED, NEVER STORED (P1-8 / DATA-15, 2026-09-03,
 * WC-2026-09-03-info-stored-value-never-served — repeals the stored-wins rule
 * of WC-2026-08-09-info-legacy-stored-value-fallthrough). A component_info
 * value is what its widgets compute for THIS record for THIS principal at read
 * time (the media_icons tool columns are user-scoped); the engine has no door
 * that authors it — no client widget saves, and the server-side observer
 * (section/record/observers.ts recomputeInfoObserver) writes only a Time
 * Machine row. What CAN land in the `misc` column is v5 residue, a Time Machine
 * restore of one of those observer rows, or a PHP-era client save — and under
 * PHP's `use_db_data` rule (get_db_data: any non-empty stored array wins) each
 * of those FROZE the served value at a snapshot the observer could never again
 * correct, while it kept writing correct TM rows nobody read. So the read
 * ALWAYS emits the live compute (the insertion-ordered {widget,key,widget_id,
 * value} shape), and a non-empty stored array is ignored and COUNTED
 * (`component_info_stored_value_ignored`; the v5 blob additionally under
 * `component_info_legacy_stored_value`, so the residue corpus stays visible
 * to ops). NO data migration: nothing is rewritten, and a stored value is
 * never at risk — it is simply not what is served. Gated in
 * test/unit/info_widget_native.test.ts (the DEC-14b twin of the retired
 * differential) + test/unit/component_info_legacy_state_native.test.ts +
 * test/unit/write_obligations_native.test.ts.
 *
 * WC-026 (deliberate divergence): the computed entries pass through
 * normalizeWidgetEntryKeys — every top-level widget item carries BOTH `id`
 * and `widget_id` so the client renders (widget_id) AND the grid/export
 * matchers (id) resolve. PHP serves one key per widget class and its own
 * client renders stored archives + live calculations BLANK.
 *
 * EDIT datalist (PHP component_info_json.php:139 — get_data_list attached
 * only in edit mode and only when non-empty): decorateItem merges every
 * declared widget's computeDataList output (state is the only implementer).
 *
 * Identity threading: the request principal (ALS) provides userId/isAdmin
 * for user-scoped widget compute (media_icons tool columns) — absent
 * principal (background/test contexts) falls back to the superuser tool set.
 */

import { incrementCounter } from '../../api/counters.ts';
import { currentPrincipal } from '../../security/request_context.ts';
import type { ComponentEmitHook, EmitHookContext } from '../emit_hooks.ts';

export const infoEmitHook: ComponentEmitHook = {
	async transformValue(
		value: unknown[] | null,
		context: EmitHookContext,
	): Promise<unknown[] | null> {
		const { isLegacyStateResidue, normalizeWidgetEntryKeys } = await import(
			'./widgets/widget_common.ts'
		);
		if (value !== null && value.length > 0) {
			// A stored value is never served (module header). Counted, so the
			// corpus that still carries one stays visible to ops instead of
			// vanishing quietly; the v5 blob keeps its own sub-count.
			incrementCounter('component_info_stored_value_ignored');
			if (isLegacyStateResidue(value)) incrementCounter('component_info_legacy_stored_value');
		}
		const { computeInfoWidgets } = await import('./widgets/registry.ts');
		const principal = currentPrincipal();
		const computed = await computeInfoWidgets(context.ddo.tipo, {
			sectionTipo: context.row.section_tipo,
			sectionId: context.row.section_id,
			mode: context.ddoMode,
			lang: context.defaultLang,
			userId: principal?.userId,
			isAdmin: principal?.isGlobalAdmin,
		});
		return computed === null ? null : normalizeWidgetEntryKeys(computed);
	},

	async decorateItem(item, context: EmitHookContext): Promise<void> {
		// PHP: edit mode only; attach only when non-empty.
		if (context.ddoMode !== 'edit') return;
		const { computeInfoDataList } = await import('./widgets/registry.ts');
		const principal = currentPrincipal();
		const datalist = await computeInfoDataList(context.ddo.tipo, {
			sectionTipo: context.row.section_tipo,
			sectionId: context.row.section_id,
			mode: context.ddoMode,
			lang: context.defaultLang,
			userId: principal?.userId,
			isAdmin: principal?.isGlobalAdmin,
		});
		if (datalist.length > 0) {
			(item as { datalist?: unknown }).datalist = datalist;
		}
	},
};
