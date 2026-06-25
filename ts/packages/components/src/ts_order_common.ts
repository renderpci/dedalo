/**
 * Shared helpers for the dd_ts_api thesaurus WRITE ops that touch the sibling-order
 * component (update_parent_data + save_order). Both write the per-parent order value
 * as an id_key dataframe of the child's parent-link locator, and both emit the same
 * side-effect footprint per order save (a save-before-repair TM pair + a SAVE activity).
 *
 * These helpers reproduce, BYTE-EXACT (verified against live PHP on the test DB):
 *   - resolveThesaurusOrderMap: section_map->thesaurus.{order,parent} (the order
 *     component_number tipo + the component_relation_parent tipo).
 *   - resolveParentLinkIdKey: the child's parent-link locator id (the order id_key) —
 *     port of component_relation_children::resolve_parent_link_id_key.
 *   - appendOrderValueByIdKey: the matrix write that update_value_by_id_key + save()
 *     produces for the LIVE data (legacy order items carry `id`, NOT `id_key`, so the
 *     id_key match never hits → a NEW {id, value, id_key} item is APPENDED, the legacy
 *     {id:1,value:N} item left untouched; the new item id = meta.count+1, meta bumped).
 *   - writeOrderSaveSideEffects: the TM pair (synthetic previous-data row timestamped
 *     −1 minute + the new-data row, the tm_record save-before repair) + the SAVE
 *     activity, exactly as component_common::save() emits for a component_number.
 */

import type { Db, DbSession } from '@dedalo/db';
import { MatrixDbManager, SaveSideEffectsDbManager } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import { resolveMatrixTable } from './matrix_table.ts';

export const DEDALO_DATA_NOLAN = 'lg-nolan';
export const DEDALO_RELATION_TYPE_PARENT_TIPO = 'dd47';

/** The resolved thesaurus map tipos a tree write needs. */
export interface ThesaurusOrderMap {
  /** section_map->thesaurus.order — the sibling-order component_number tipo. */
  order: string;
  /** section_map->thesaurus.parent — the component_relation_parent tipo. */
  parent: string;
  /** section_map->thesaurus.is_descriptor — used for the descriptor-children count. */
  isDescriptor: string;
}

/**
 * Resolve the section's thesaurus map (order + parent + is_descriptor tipos) from the
 * section_map ontology node (model 'section_map', direct child of the section). Returns
 * null when not resolvable or when any required tipo is missing (→ the caller declines).
 */
export async function resolveThesaurusOrderMap(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<ThesaurusOrderMap | null> {
  const childTipos = await ontology.getChildren(sectionTipo);
  for (const childTipo of childTipos) {
    if ((await ontology.getModelByTipo(childTipo)) !== 'section_map') continue;
    const props = await ontology.getProperties(childTipo);
    const thesaurus = props?.['thesaurus'];
    if (thesaurus === null || typeof thesaurus !== 'object') return null;
    const th = thesaurus as Record<string, unknown>;
    const order = th['order'];
    const parent = th['parent'];
    const isDescriptor = th['is_descriptor'];
    if (
      typeof order === 'string' &&
      order !== '' &&
      typeof parent === 'string' &&
      parent !== '' &&
      typeof isDescriptor === 'string' &&
      isDescriptor !== ''
    ) {
      return { order, parent, isDescriptor };
    }
    return null;
  }
  return null;
}

/**
 * Port of component_relation_children::resolve_parent_link_id_key. Read the child's
 * component_relation_parent locators (relation column, parentRelationTipo key) and
 * return the `id` of the locator that targets (parentSectionTipo, parentSectionId) —
 * the id_key the order value pairs by. Returns 0 when not found.
 *
 * Uses the provided queryer (read pool or the reserved write session) so it can read
 * the POST-mutation parent link inside the move transaction.
 */
export async function resolveParentLinkIdKey(
  matrix: MatrixDbManager,
  childTable: string,
  childSectionTipo: string,
  childSectionId: number,
  parentRelationTipo: string,
  parentSectionTipo: string,
  parentSectionId: number,
): Promise<number> {
  const items = await matrix.getComponentData(
    childTable,
    childSectionTipo,
    childSectionId,
    'relation',
    parentRelationTipo,
  );
  if (items === null) return 0;
  for (const loc of items) {
    const l = loc as Record<string, unknown>;
    if (
      l['section_tipo'] === parentSectionTipo &&
      Number.parseInt(String(l['section_id']), 10) === parentSectionId &&
      l['id'] !== undefined
    ) {
      const id = Number.parseInt(String(l['id']), 10);
      return Number.isNaN(id) ? 0 : id;
    }
  }
  return 0;
}

/**
 * Read the current order value paired by id_key (port of get_value_by_id_key over the
 * number column). Returns the numeric value, or null when no item carries that id_key
 * (the live legacy data: items carry `id`, not `id_key`, so this returns null and the
 * caller treats the value as "changed" → an append).
 */
export async function readOrderValueByIdKey(
  matrix: MatrixDbManager,
  table: string,
  sectionTipo: string,
  sectionId: number,
  orderTipo: string,
  idKey: number,
): Promise<number | null> {
  const items = await matrix.getComponentData(table, sectionTipo, sectionId, 'number', orderTipo);
  if (items === null || items.length === 0) return null;
  for (const item of items) {
    const it = item as Record<string, unknown>;
    if (it['id_key'] !== undefined && Number.parseInt(String(it['id_key']), 10) === idKey) {
      const v = it['value'];
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
      return Number.isNaN(n) ? null : n;
    }
  }
  return null;
}

/** The pre-save order column + the post-save order column, for the TM repair pair. */
export interface OrderAppendResult {
  /** The number-column items BEFORE the append (the TM synthetic previous-data row). */
  previousItems: unknown[] | null;
  /** The number-column items AFTER the append (the TM new-data row + the stored value). */
  newItems: unknown[];
  /** The allocated id for the appended item (meta.count + 1). */
  newItemId: number;
}

/**
 * Port of update_value_by_id_key(value, idKey) + save() for the LIVE thesaurus order
 * data, on the reserved write session inside the transaction. The order item paired by
 * idKey does NOT exist (legacy items carry `id`), so a NEW item {id, value, id_key} is
 * APPENDED; the meta counter is allocated (count+1) for the new item id; the legacy
 * items are preserved verbatim. Returns the pre/post item arrays for the TM repair.
 *
 * NOTE: when an item with the id_key ALREADY exists (a node reordered twice in the same
 * data lifetime), PHP updates it in place instead of appending — reproduced here too.
 */
export async function appendOrderValueByIdKey(
  tx: DbSession,
  matrix: MatrixDbManager,
  table: string,
  sectionTipo: string,
  sectionId: number,
  orderTipo: string,
  value: number,
  idKey: number,
): Promise<OrderAppendResult> {
  const existing =
    (await matrix.getComponentData(table, sectionTipo, sectionId, 'number', orderTipo)) ?? [];
  const previousItems = existing.length > 0 ? existing.map((i) => ({ ...(i as object) })) : null;

  // In-place update when an item already pairs by id_key; else append a fresh item.
  let newItemId = 0;
  let updatedInPlace = false;
  const newItems = existing.map((i) => ({ ...(i as Record<string, unknown>) }));
  for (const it of newItems) {
    if (it['id_key'] !== undefined && Number.parseInt(String(it['id_key']), 10) === idKey) {
      it['value'] = value;
      updatedInPlace = true;
      break;
    }
  }

  if (!updatedInPlace) {
    // allocate the new item id from the meta counter (count + 1), persisting the bump.
    const { ids } = await MatrixDbManager.allocateComponentIds(
      tx,
      table,
      sectionTipo,
      sectionId,
      orderTipo,
      1,
    );
    newItemId = ids[0] ?? 1;
    newItems.push({ id: newItemId, value, id_key: idKey });
  }

  // write the number column. (The meta counter is already persisted by the allocator.)
  await MatrixDbManager.updateByKey(tx, table, sectionTipo, sectionId, [
    { column: 'number', key: orderTipo, value: newItems },
  ]);

  return { previousItems, newItems, newItemId };
}

/**
 * Emit the side effects of ONE component_number order save (component_common::save):
 *   - TM save-before repair: when NO matrix_time_machine row yet exists for
 *     (sectionId, sectionTipo, orderTipo, lg-nolan) AND the previous data differs, a
 *     SYNTHETIC row with data=previousItems and timestamp = now − 1 minute is written
 *     first; then the real row with data=newItems.
 *   - one SAVE activity (component_name 'component_number', log_data.section_id = the
 *     string section_id).
 *
 * Verified byte-exact against the live PHP save_order/update_parent_data on the test DB.
 */
export async function writeOrderSaveSideEffects(
  session: DbSession,
  table: string,
  sectionTipo: string,
  sectionId: number,
  orderTipo: string,
  previousItems: unknown[] | null,
  newItems: unknown[],
  userId: number,
  ip: string,
  now: Date,
): Promise<void> {
  // TM save-before repair: synthetic previous-data row when none exists and data differs.
  if (previousItems !== null && JSON.stringify(previousItems) !== JSON.stringify(newItems)) {
    const priorCount = await SaveSideEffectsDbManager.countTimeMachineRows(
      session,
      sectionId,
      sectionTipo,
      orderTipo,
      DEDALO_DATA_NOLAN,
    );
    if (priorCount === 0) {
      const minuteBack = new Date(now.getTime() - 60_000);
      await SaveSideEffectsDbManager.createTimeMachine(session, {
        sectionId,
        sectionTipo,
        tipo: orderTipo,
        lang: DEDALO_DATA_NOLAN,
        data: previousItems,
        userId,
        bulkProcessId: null,
        now: minuteBack,
      });
    }
  }

  // the real TM row (the new, post-append data).
  await SaveSideEffectsDbManager.createTimeMachine(session, {
    sectionId,
    sectionTipo,
    tipo: orderTipo,
    lang: DEDALO_DATA_NOLAN,
    data: newItems,
    userId,
    now,
  });

  // the SAVE activity for the component_number order save.
  await SaveSideEffectsDbManager.createSaveActivity(session, {
    tipo: orderTipo,
    sectionId,
    logSectionId: String(sectionId),
    sectionTipo,
    lang: DEDALO_DATA_NOLAN,
    componentName: 'component_number',
    table,
    userId,
    ip,
    now,
  });
}

/** Re-export resolveMatrixTable so the ops can resolve the child table. */
export { resolveMatrixTable };
