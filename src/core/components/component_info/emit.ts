/**
 * component_info emit hook (audit S2-24; extracted verbatim from
 * section/read.ts). Also serves component_calculation / component_state at
 * runtime (their descriptors alias to component_info).
 *
 * The STORED misc value wins (use_db_data — the client save cycle persists the
 * widget output as {id,key,value,widget} items); an empty row falls back to
 * LIVE widget compute (PHP get_db_data → get_data), which emits the
 * insertion-ordered {widget,key,widget_id,value} shape. Gated in
 * test/unit/info_widget_native.test.ts (the DEC-14b twin of the retired
 * differential) + test/unit/component_info_legacy_state_native.test.ts.
 *
 * PHP's `empty($data)` is preserved verbatim for null and [] — the ONE
 * divergence (WC-2026-08-09-info-legacy-stored-value-fallthrough) is that a
 * stored array which is ENTIRELY v5 residue also falls through. "Residue" is
 * isLegacyStateResidue: a POSITIVE identification of the v5-era
 * `{id,state:{lg-…:{…}},value:null,section_id,section_tipo,component_tipo}`
 * blob — still on ~690 records of the reference install — which reached a
 * client that selects widget items by `widget`/`key`/`widget_id` and therefore
 * drew nothing. It is deliberately NOT the negative test "no entry carries a
 * widget tag": that would also discard every stored shape we have not
 * enumerated, and an unclassifiable stored array must keep PHP's generic
 * behaviour instead. The live compute the residue falls through to is correct,
 * cheap, and self-heals the row on its next save. The discarded value is
 * COUNTED (component_info_legacy_stored_value) so the remaining corpus stays
 * visible to ops instead of vanishing quietly. NO data migration: nothing is
 * rewritten, and a curator's stored values are never at risk. When the ddo
 * declares no widgets the live compute returns null, so such a record serves
 * null where PHP served the (unrenderable) blob.
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
			// PHP: any non-empty stored array wins. It still does — UNLESS every
			// entry is a positively identified v5 state blob, which no renderer
			// can read. Then fall through to the live compute and publish the fact.
			if (!isLegacyStateResidue(value)) return normalizeWidgetEntryKeys(value);
			incrementCounter('component_info_legacy_stored_value');
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
