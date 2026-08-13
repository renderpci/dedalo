/**
 * component_filter_records emit hook — the DATALIST half of the component
 * (PHP component_filter_records_json.php:117-152).
 *
 * PHP builds the item in ONE place for every door (section read and the direct
 * component get_data both land in component_filter_records_json), and its rule
 * is mode-shaped:
 *   - 'list' / 'tm'      → get_list_value(), and NO `datalist` key at all;
 *   - everything else    → the stored entries + `datalist` = get_datalist(),
 *     the sections the LOGGED user administers (level >= 2).
 * Both client renders that consume the key are UNGUARDED
 * (view_default_edit_filter_records:142 `datalist.length`,
 * render_search_component_filter_records:165 the same), so an edit/search item
 * without it renders ZERO rows — the component looked empty for every user.
 *
 * The datalist is USER-scoped, not record-scoped: it describes what the caller
 * may grant, not what the edited user already holds. Identity therefore comes
 * from the request-scoped ALS (security/request_context.ts) — the backstop role
 * that module documents for leaf-position reads. FAIL-CLOSED: no principal
 * (unit tests, background jobs) serves the empty array, never another user's
 * authorized sections.
 */

import type { DataItem } from '../../resolve/component_data.ts';
import type { ComponentEmitHook, EmitHookContext } from '../emit_hooks.ts';

export const filterRecordsEmitHook: ComponentEmitHook = {
	async decorateItem(item: DataItem, context: EmitHookContext): Promise<void> {
		// PHP `case 'list': case 'tm':` — the list views read only entries
		// (view_default_list_filter_records:88), so the key stays ABSENT.
		if (context.ddoMode === 'list' || context.ddoMode === 'tm') return;

		const { currentPrincipal } = await import('../../security/request_context.ts');
		const principal = currentPrincipal();
		if (principal === undefined) {
			item.datalist = [];
			return;
		}
		const { getFilterRecordsDatalist } = await import(
			'../../api/handlers/filter_records_datalist.ts'
		);
		const { currentDataLang } = await import('../../resolve/request_lang.ts');
		item.datalist = await getFilterRecordsDatalist(principal.userId, currentDataLang());
	},
};
