/**
 * RELATION_CHILDREN resolver (RELATIONS_SPEC.md §6.3): the component owns NO
 * stored rows — its data is COMPUTED per read from the inverse question "who
 * declares me as parent?" (relations/children.ts engine, sibling-ordered by
 * the id_key order dataframe). Writes never touch this component's own
 * column: they redirect to each child's component_relation_parent (PHP
 * set_data :208 diff-sync via update_parent — Phase D write scope is the
 * READ side; the tree mutations live in dd_ts_api).
 *
 * Emission strategy: compute the child locators, graft them into a synthetic
 * copy of the record under this component's tipo, and delegate to the
 * PORTAL resolver — pagination, child-ddo expansion, per-locator section
 * grouping and the outer re-stamp all behave exactly like any relation
 * (PHP renders children through the same portal machinery once get_data
 * returns the computed locators).
 *
 * PHP reference: class.component_relation_children.php get_data :113
 * (search mode reads STORED data — parent::get_data — matching set_data).
 */

import { getChildren } from '../children.ts';
import type { RelationEmitContext, RelationModelResolver } from '../registry.ts';
import { portalResolver } from './portal.ts';

export const relationChildrenResolver: RelationModelResolver = {
	model: 'component_relation_children',

	async emitDdoItems(context: RelationEmitContext): Promise<void> {
		// SEARCH mode reads the stored matrix value (PHP :122 delegates to the
		// parent class) — the generic portal path does exactly that.
		if (context.ddoMode === 'search') {
			await portalResolver.emitDdoItems(context);
			return;
		}

		const computed = await getChildren(
			context.record.section_id,
			context.record.section_tipo,
			context.ddo.tipo,
		);

		// EMPTY children still answer with their own item (PHP emits entries []
		// with total 0 in every non-search mode — the numisdata998 §2 pin);
		// the generic portal path would skip the empty relation entirely.
		if (computed.length === 0) {
			const { buildDataItem } = await import('../../resolve/component_data.ts');
			const emptyItem = buildDataItem(
				context.ddo.tipo,
				context.row.section_tipo,
				context.row.section_id,
				context.ddoMode,
				'lg-nolan',
				[],
			);
			emptyItem.pagination = { total: 0, limit: context.ddo.limit ?? 10, offset: 0 };
			emptyItem.parent_tipo = context.callerTipo;
			emptyItem.parent_section_id = context.row.section_id;
			emptyItem.row_section_id = context.row.section_id;
			context.emission.items.push(emptyItem);
			return;
		}

		// Synthetic record: the computed locators grafted under this tipo (via the
		// substitution API — clone so the shared original is never mutated) so the
		// shared portal machinery (paging, subdatum, re-stamp) runs unchanged.
		const { cloneRecord, injectComponentData } = await import('../../section_record/index.ts');
		const syntheticRecord = cloneRecord(context.record);
		injectComponentData(syntheticRecord, context.ddo.tipo, 'component_relation_children', computed);

		await portalResolver.emitDdoItems({ ...context, record: syntheticRecord });
	},
};
