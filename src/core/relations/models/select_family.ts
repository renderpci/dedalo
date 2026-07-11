/**
 * SELECT family resolver (RELATIONS_SPEC.md §6.1, list-of-values models):
 * component_select, component_select_lang, component_radio_button,
 * component_check_box, component_publication, component_relation_model.
 *
 * These relations offer the FULL records of the target section as options:
 * - list mode → the datalist LABEL strings of the stored locators
 *   (PHP component_relation_common::get_list_value);
 * - edit mode → the stored locators as entries + the full datalist of options
 *   (PHP component_common::get_list_of_values, class.component_common.php:2740);
 * - every other mode → the generic portal path, exactly like the PHP
 *   controllers fall through.
 */

import { getNode } from '../../ontology/resolver.ts';
import { buildDataItem } from '../../resolve/component_data.ts';
import { getDatalist, getRelationListValue } from '../datalist.ts';
import type { RelationEmitContext, RelationModelResolver } from '../registry.ts';
import { portalResolver } from './portal.ts';

/** Relation models whose LIST value is label strings (relation_common get_list_value). */
export const SELECT_FAMILY_MODELS: ReadonlySet<string> = new Set([
	'component_select',
	'component_select_lang',
	'component_radio_button',
	'component_check_box',
	'component_publication',
	'component_relation_model',
]);

export const selectFamilyResolver: RelationModelResolver = {
	model: 'component_select',

	async emitDdoItems(context: RelationEmitContext): Promise<void> {
		const { ddo, record, row, ddoMode, ddoLang, callerTipo, emission } = context;

		// list/edit/search have option-datalist semantics; other modes take portal.
		if (ddoMode !== 'list' && ddoMode !== 'edit' && ddoMode !== 'search') {
			await portalResolver.emitDdoItems(context);
			return;
		}

		const storedLocators =
			((record.columns.relation as Record<string, unknown[]> | null)?.[context.dataTipo] as {
				section_tipo?: unknown;
				section_id?: unknown;
			}[]) ?? [];
		const node = await getNode(ddo.tipo);
		// component_select_lang overrides the option source: the project default
		// languages, not the records of a target section (PHP get_list_of_values /
		// get_list_value are overridden in class.component_select_lang).
		const isSelectLang = context.model === 'component_select_lang';
		if (ddoMode === 'list') {
			const { currentDataLang } = await import('../../resolve/request_lang.ts');
			const labels = isSelectLang
				? await (await import('../select_lang.ts')).getSelectLangListValue(
						storedLocators,
						currentDataLang(),
					)
				: await getRelationListValue(
						ddo.tipo,
						node?.properties ?? null,
						row.section_tipo,
						ddoLang,
						storedLocators,
					);
			const item = buildDataItem(
				ddo.tipo,
				row.section_tipo,
				row.section_id,
				ddoMode,
				'lg-nolan',
				labels.length > 0 ? labels : null,
			);
			item.row_section_id = row.section_id;
			item.parent_tipo = callerTipo;
			emission.items.push(item);
			return;
		}
		// edit/search: stored locators as entries + the option datalist. Empty →
		// [] (NOT null) so the client's data.entries is always an array (life-cycle
		// suites assert Array.isArray(entries), e.g. test_component_check_box:222 —
		// which fails once a prior test clears the shared record's value).
		const datalist = isSelectLang
			? await (await import('../select_lang.ts')).getSelectLangDatalist(ddoLang)
			: await getDatalist(ddo.tipo, node?.properties ?? null, row.section_tipo, ddoLang);
		const item = buildDataItem(
			ddo.tipo,
			row.section_tipo,
			row.section_id,
			ddoMode,
			'lg-nolan',
			storedLocators.length > 0 ? storedLocators : [],
		);
		item.datalist = datalist;
		item.row_section_id = row.section_id;
		item.parent_tipo = callerTipo;
		emission.items.push(item);
	},
};
