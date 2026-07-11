/**
 * component_filter_records get_datalist (PHP
 * class.component_filter_records.php::get_datalist :142). The misc-column
 * component stores, per authorized section, a list of record ids the user is
 * allowed to filter on; the edit/search views render one text-input row per
 * datalist entry. The datalist is the set of SECTIONS the CURRENT user can
 * access at level >= 2, each {tipo, permissions, label}, sorted by label.
 */

import { labelByTipo } from '../../ontology/labels.ts';
import { getModelByTipo } from '../../ontology/resolver.ts';
import { getAuthorizedAreasForUser } from '../../security/permissions.ts';

export interface FilterRecordsDatalistItem {
	tipo: string;
	permissions: number;
	label: string | null;
}

/**
 * Build the filter-records datalist for a user (PHP get_datalist): the
 * authorized areas filtered to real sections at level >= 2, labelled in the
 * active data language, sorted by label. Labels resolve in the data lang so
 * they match the interface (PHP uses DEDALO_DATA_LANG).
 */
export async function getFilterRecordsDatalist(
	userId: number,
	lang: string,
): Promise<FilterRecordsDatalistItem[]> {
	const areas = await getAuthorizedAreasForUser(userId);
	const items: FilterRecordsDatalistItem[] = [];
	for (const area of areas) {
		// ignore non authorized for user (PHP :158)
		if (area.value < 2) continue;
		// ignore non-section area/grouper nodes (PHP :168) — they share the
		// permission table but are not sections users can filter records for.
		if ((await getModelByTipo(area.tipo)) !== 'section') continue;
		items.push({
			tipo: area.tipo,
			permissions: area.value,
			label: await labelByTipo(area.tipo, lang),
		});
	}
	// sort by label (PHP uasort on label, then array_values)
	items.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
	return items;
}
