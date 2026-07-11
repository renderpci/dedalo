/**
 * component_info emit hook (audit S2-24; extracted verbatim from
 * section/read.ts). Also serves component_calculation / component_state at
 * runtime (their descriptors alias to component_info).
 *
 * The STORED misc value wins (use_db_data — the client save cycle persists the
 * widget output as {id,key,value,widget} items); an empty row falls back to
 * LIVE widget compute (PHP get_db_data → get_data), which emits the
 * insertion-ordered {widget,key,widget_id,value} shape. Gated in
 * test/parity/info_widget_differential.test.ts.
 *
 * WC-026 (deliberate divergence): both branches then pass through
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

import { currentPrincipal } from '../../security/request_context.ts';
import type { ComponentEmitHook, EmitHookContext } from '../emit_hooks.ts';

export const infoEmitHook: ComponentEmitHook = {
	async transformValue(
		value: unknown[] | null,
		context: EmitHookContext,
	): Promise<unknown[] | null> {
		const { normalizeWidgetEntryKeys } = await import('./widgets/widget_common.ts');
		if (value !== null && value.length > 0) return normalizeWidgetEntryKeys(value);
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
