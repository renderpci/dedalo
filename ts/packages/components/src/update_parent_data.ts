/**
 * Port of the dd_ts_api `update_parent_data` action — move a node to a new parent.
 *
 * PHP (core/api/v1/common/class.dd_ts_api.php::update_parent_data): validate write
 * perm + the cycle guard (is_ancestor: the node may not move under itself or its own
 * descendant) BEFORE any mutation, then inside ONE transaction holding both parent
 * locks:
 *   a. remove_parent(old): remove_child_order (drop the order item paired to the OLD
 *      parent-link id — for the live legacy data, paired by `id` not `id_key`, so it
 *      removes NOTHING) + remove the old parent locator from the relation column.
 *   b. add_parent(new): allocate a fresh id for the new parent locator
 *      (set_data_item_counter) + set_child_order (count the NEW parent's existing
 *      descriptor children + 1 → append the order value paired by the NEW id_key) +
 *      add the new parent locator.
 *   c. save() the relation_parent (write the relation column; emit its TM pair + activity).
 *   d. recalculate_sibling_orders(OLD parent): renumber the OLD parent's REMAINING
 *      children 1..N (each appends/updates its order item paired by its own id_key) —
 *      the moved node is gone from that set.
 *
 * The MOVED node is the only row whose relation column changes (its parent locator).
 * The OLD PARENT row is NEVER touched (children are a computed inverse). The recalc
 * touches the OLD parent's OTHER children (their order column), never the parent.
 *
 * Response: { result:true, msg:'OK. Parent data updated successfully', errors:[] }.
 *
 * Side effects (verified byte-exact on the test DB, moving ds1/28 from ds1/1→ds1/2):
 *   moved node ds1/28: order save (TM pair + activity) + relation_parent save (TM pair
 *     [old locator]/[new locator] + activity).
 *   each remaining OLD-parent sibling: one order save (TM pair + activity).
 */

import type { Db, DbSession } from '@dedalo/db';
import { MatrixDbManager, SaveSideEffectsDbManager } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import {
  appendOrderValueByIdKey,
  readOrderValueByIdKey,
  resolveMatrixTable,
  resolveParentLinkIdKey,
  resolveThesaurusOrderMap,
  writeOrderSaveSideEffects,
  DEDALO_DATA_NOLAN,
  DEDALO_RELATION_TYPE_PARENT_TIPO,
} from './ts_order_common.ts';

const NUMERICAL_MATRIX_VALUE_YES = 1;
const DEDALO_SECTION_SI_NO_TIPO = 'dd64';

export interface UpdateParentSource {
  section_id: string | number;
  section_tipo: string;
  old_parent_section_id: string | number;
  old_parent_section_tipo: string;
  new_parent_section_id: string | number;
  new_parent_section_tipo: string;
  tipo?: string;
}

export interface UpdateParentSessionInfo {
  userId: number | null;
  isGlobalAdmin: boolean;
  ip?: string;
}

export interface UpdateParentOptions {
  db: Db;
  ontology: OntologyRepository;
  session: UpdateParentSessionInfo;
}

export interface UpdateParentResult {
  result: unknown;
  msg: string;
  errors: string[];
}

/** Thrown for an input the update_parent_data path declines (caller proxies to PHP). */
export class UnsupportedUpdateParent extends Error {}

/** A queued order-save side-effect (emitted after commit, matching add_child's pattern). */
interface OrderSideEffect {
  table: string;
  sectionTipo: string;
  sectionId: number;
  previousItems: unknown[] | null;
  newItems: unknown[];
}

/**
 * Walk the new parent's ancestor chain (component_relation_parent locators, recursively)
 * to detect a cycle: returns true when the MOVED node is itself the new parent or an
 * ancestor of the new parent. Port of the is_ancestor / self-target guard.
 */
async function isCycle(
  matrix: MatrixDbManager,
  ontology: OntologyRepository,
  movedSectionTipo: string,
  movedSectionId: number,
  parentRelationTipo: string,
  newParentSectionTipo: string,
  newParentSectionId: number,
): Promise<boolean> {
  // self-target.
  if (newParentSectionTipo === movedSectionTipo && newParentSectionId === movedSectionId) {
    return true;
  }
  const movedKey = `${movedSectionTipo}_${movedSectionId}`;
  const visited = new Set<string>();
  // BFS over ancestors of the new parent.
  let frontier: Array<{ tipo: string; id: number }> = [
    { tipo: newParentSectionTipo, id: newParentSectionId },
  ];
  while (frontier.length > 0) {
    const next: Array<{ tipo: string; id: number }> = [];
    for (const node of frontier) {
      const key = `${node.tipo}_${node.id}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const table = (await resolveMatrixTable(ontology, node.tipo)) ?? 'matrix';
      const items = await matrix.getComponentData(
        table,
        node.tipo,
        node.id,
        'relation',
        parentRelationTipo,
      );
      if (items === null) continue;
      for (const loc of items) {
        const l = loc as Record<string, unknown>;
        const pTipo = String(l['section_tipo']);
        const pId = Number.parseInt(String(l['section_id']), 10);
        if (!Number.isInteger(pId)) continue;
        if (`${pTipo}_${pId}` === movedKey) return true;
        next.push({ tipo: pTipo, id: pId });
      }
    }
    frontier = next;
  }
  return false;
}

/** Count the NEW parent's existing descriptor children (set_child_order base). */
async function countDescriptorChildren(
  matrix: MatrixDbManager,
  db: Db,
  table: string,
  parentTipo: string,
  parentId: number,
  parentRelationTipo: string,
  isDescriptorTipo: string,
): Promise<number> {
  const flatKey = `${parentTipo}_${parentId}`;
  const sql =
    `SELECT count(*)::int AS n FROM "${table}" ` +
    `WHERE data_relations_flat_st_si(relation) @> $1::text::jsonb ` +
    `AND relation -> $2 @> $3::text::jsonb ` +
    `AND relation -> $4 -> 0 ->> 'section_id' = $5 ` +
    `AND relation -> $4 -> 0 ->> 'section_tipo' = $6`;
  const params: unknown[] = [
    JSON.stringify([flatKey]),
    parentRelationTipo,
    JSON.stringify([{ section_id: String(parentId), section_tipo: parentTipo }]),
    isDescriptorTipo,
    String(NUMERICAL_MATRIX_VALUE_YES),
    DEDALO_SECTION_SI_NO_TIPO,
  ];
  const rows = await db.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

/**
 * List the OLD parent's children (section_id ASC), EXCLUDING the moved node — the set
 * recalculate_sibling_orders renumbers. Filters by the parent-link locator + is_descriptor
 * (descriptor children only, the same set get_children_of_type('descriptor') returns).
 */
async function listOldParentDescriptorChildren(
  db: Db,
  table: string,
  childSectionTipo: string,
  parentRelationTipo: string,
  isDescriptorTipo: string,
  oldParentTipo: string,
  oldParentId: number,
): Promise<Array<{ sectionTipo: string; sectionId: number }>> {
  const flatKey = `${oldParentTipo}_${oldParentId}`;
  const sql =
    `SELECT section_tipo, section_id FROM "${table}" ` +
    `WHERE data_relations_flat_st_si(relation) @> $1::text::jsonb ` +
    `AND relation -> $2 @> $3::text::jsonb ` +
    `AND relation -> $4 -> 0 ->> 'section_id' = $5 ` +
    `AND relation -> $4 -> 0 ->> 'section_tipo' = $6 ` +
    `AND section_tipo = $7 ` +
    `ORDER BY section_id ASC`;
  const params: unknown[] = [
    JSON.stringify([flatKey]),
    parentRelationTipo,
    JSON.stringify([{ section_id: String(oldParentId), section_tipo: oldParentTipo }]),
    isDescriptorTipo,
    String(NUMERICAL_MATRIX_VALUE_YES),
    DEDALO_SECTION_SI_NO_TIPO,
    childSectionTipo,
  ];
  const rows = await db.query<{ section_tipo: string; section_id: number }>(sql, params);
  return rows.map((r) => ({ sectionTipo: r.section_tipo, sectionId: r.section_id }));
}

export async function updateParentData(
  source: UpdateParentSource,
  opts: UpdateParentOptions,
): Promise<UpdateParentResult> {
  const sectionTipo = source.section_tipo;
  const sectionId = Number.parseInt(String(source.section_id), 10);
  const oldParentTipo = source.old_parent_section_tipo;
  const oldParentId = Number.parseInt(String(source.old_parent_section_id), 10);
  const newParentTipo = source.new_parent_section_tipo;
  const newParentId = Number.parseInt(String(source.new_parent_section_id), 10);

  // permission gate (perm >= 2). Root/global-admin only in this slice.
  if (opts.session.isGlobalAdmin !== true) {
    return {
      result: false,
      msg: `Error. Insufficient permissions to update in section (${sectionTipo})`,
      errors: ['insufficient permissions'],
    };
  }
  const userId = opts.session.userId;
  if (userId === null) {
    throw new UnsupportedUpdateParent('no logged user id for the audit stamp');
  }

  const map = await resolveThesaurusOrderMap(opts.ontology, sectionTipo);
  if (map === null) {
    throw new UnsupportedUpdateParent(`no resolvable thesaurus order map for ${sectionTipo}`);
  }
  const orderTipo = map.order;
  const parentRelationTipo = map.parent;
  const isDescriptorTipo = map.isDescriptor;

  const table = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
  const ip = opts.session.ip ?? 'localhost';
  const matrix = new MatrixDbManager(opts.db);

  // ── cycle guard (BEFORE any mutation) ──
  if (
    await isCycle(
      matrix,
      opts.ontology,
      sectionTipo,
      sectionId,
      parentRelationTipo,
      newParentTipo,
      newParentId,
    )
  ) {
    return {
      result: false,
      msg: 'Error. The node cannot be moved under itself or under its own descendant',
      errors: ['cycle'],
    };
  }

  // The moved node's current parent locator (to find its id and the old order id_key).
  const currentParentItems =
    (await matrix.getComponentData(table, sectionTipo, sectionId, 'relation', parentRelationTipo)) ??
    [];
  // The order value for the NEW parent link = count(new parent descriptor children) + 1.
  const newOrderValue =
    (await countDescriptorChildren(
      matrix,
      opts.db,
      table,
      newParentTipo,
      newParentId,
      parentRelationTipo,
      isDescriptorTipo,
    )) + 1;

  // The OLD parent's remaining descriptor children (excluding the moved node) to recalc.
  const oldSiblings = (
    await listOldParentDescriptorChildren(
      opts.db,
      table,
      sectionTipo,
      parentRelationTipo,
      isDescriptorTipo,
      oldParentTipo,
      oldParentId,
    )
  ).filter((c) => !(c.sectionTipo === sectionTipo && c.sectionId === sectionId));

  const orderSideEffects: OrderSideEffect[] = [];
  /** The relation_parent save's TM-pair + activity inputs (emitted after commit). */
  let relationSave: {
    previousLocators: unknown[] | null;
    newLocators: unknown[];
  } | null = null;

  const session: DbSession = await opts.db.reserve();
  try {
    await session.transaction(async (tx) => {
      const txMatrix = new MatrixDbManager(tx);

      // ── a. remove_parent(old): for the live legacy data the order item is paired by
      //    `id` (not id_key), so remove_child_order removes nothing; remove the old
      //    parent locator from the relation column. ──
      const previousLocators = currentParentItems.map((l) => ({ ...(l as object) }));
      const remaining = currentParentItems.filter((l) => {
        const o = l as Record<string, unknown>;
        return !(
          o['section_tipo'] === oldParentTipo &&
          Number.parseInt(String(o['section_id']), 10) === oldParentId
        );
      });

      // ── b. add_parent(new): allocate a fresh id for the new parent locator. ──
      const { ids } = await MatrixDbManager.allocateComponentIds(
        tx,
        table,
        sectionTipo,
        sectionId,
        parentRelationTipo,
        1,
      );
      const newLinkId = ids[0] ?? 1;
      const newLocator = {
        id: newLinkId,
        type: DEDALO_RELATION_TYPE_PARENT_TIPO,
        section_id: String(newParentId),
        section_tipo: newParentTipo,
        from_component_tipo: parentRelationTipo,
      };
      const newLocators = [...remaining, newLocator];

      // set_child_order: write the order value paired by the NEW parent-link id_key.
      const orderResult = await appendOrderValueByIdKey(
        tx,
        txMatrix,
        table,
        sectionTipo,
        sectionId,
        orderTipo,
        newOrderValue,
        newLinkId,
      );
      orderSideEffects.push({
        table,
        sectionTipo,
        sectionId,
        previousItems: orderResult.previousItems,
        newItems: orderResult.newItems,
      });

      // ── c. save() the relation_parent: write the relation column (new locator set). ──
      await MatrixDbManager.updateByKey(tx, table, sectionTipo, sectionId, [
        { column: 'relation', key: parentRelationTipo, value: newLocators },
      ]);
      relationSave = { previousLocators, newLocators };

      // ── d. recalculate_sibling_orders(OLD parent): renumber the remaining children. ──
      let pos = 0;
      for (const sib of oldSiblings) {
        pos++;
        const sibTable = (await resolveMatrixTable(opts.ontology, sib.sectionTipo)) ?? table;
        const idKey = await resolveParentLinkIdKey(
          txMatrix,
          sibTable,
          sib.sectionTipo,
          sib.sectionId,
          parentRelationTipo,
          oldParentTipo,
          oldParentId,
        );
        if (idKey <= 0) continue;
        const current = await readOrderValueByIdKey(
          txMatrix,
          sibTable,
          sib.sectionTipo,
          sib.sectionId,
          orderTipo,
          idKey,
        );
        if (current !== null && current === pos) continue;
        const r = await appendOrderValueByIdKey(
          tx,
          txMatrix,
          sibTable,
          sib.sectionTipo,
          sib.sectionId,
          orderTipo,
          pos,
          idKey,
        );
        orderSideEffects.push({
          table: sibTable,
          sectionTipo: sib.sectionTipo,
          sectionId: sib.sectionId,
          previousItems: r.previousItems,
          newItems: r.newItems,
        });
      }
    });

    // ── side rows on the same reserved session (PHP emits them inside each save()). ──
    const now = new Date();

    // The moved node's order save (set_child_order) comes FIRST (inside add_parent),
    // then the relation_parent save, then each recalc sibling — PHP order.
    const movedOrder = orderSideEffects[0];
    if (movedOrder !== undefined) {
      await writeOrderSaveSideEffects(
        session,
        movedOrder.table,
        movedOrder.sectionTipo,
        movedOrder.sectionId,
        orderTipo,
        movedOrder.previousItems,
        movedOrder.newItems,
        userId,
        ip,
        now,
      );
    }
    // The relation_parent save: TM pair (old locator state / new locator state) + activity.
    if (relationSave !== null) {
      const rs: { previousLocators: unknown[] | null; newLocators: unknown[] } = relationSave;
      await writeRelationParentSaveSideEffects(
        session,
        table,
        sectionTipo,
        sectionId,
        parentRelationTipo,
        rs.previousLocators,
        rs.newLocators,
        userId,
        ip,
        now,
      );
    }
    // The recalc siblings' order saves (in section_id ASC order).
    for (let i = 1; i < orderSideEffects.length; i++) {
      const s = orderSideEffects[i]!;
      await writeOrderSaveSideEffects(
        session,
        s.table,
        s.sectionTipo,
        s.sectionId,
        orderTipo,
        s.previousItems,
        s.newItems,
        userId,
        ip,
        now,
      );
    }
  } finally {
    session.release();
  }

  return { result: true, msg: 'OK. Parent data updated successfully', errors: [] };
}

/**
 * Emit the side effects of the relation_parent save (the moved node's parent-locator
 * column change): the tm_record save-before-repair TM pair (synthetic previous-data row
 * timestamped −1 minute when no prior TM exists + the new-data row) + a SAVE activity
 * (component_name 'component_relation_parent'). Verified byte-exact on the test DB.
 */
async function writeRelationParentSaveSideEffects(
  session: DbSession,
  table: string,
  sectionTipo: string,
  sectionId: number,
  parentRelationTipo: string,
  previousLocators: unknown[] | null,
  newLocators: unknown[],
  userId: number,
  ip: string,
  now: Date,
): Promise<void> {
  if (
    previousLocators !== null &&
    JSON.stringify(previousLocators) !== JSON.stringify(newLocators)
  ) {
    const priorCount = await SaveSideEffectsDbManager.countTimeMachineRows(
      session,
      sectionId,
      sectionTipo,
      parentRelationTipo,
      DEDALO_DATA_NOLAN,
    );
    if (priorCount === 0) {
      const minuteBack = new Date(now.getTime() - 60_000);
      await SaveSideEffectsDbManager.createTimeMachine(session, {
        sectionId,
        sectionTipo,
        tipo: parentRelationTipo,
        lang: DEDALO_DATA_NOLAN,
        data: previousLocators,
        userId,
        bulkProcessId: null,
        now: minuteBack,
      });
    }
  }
  await SaveSideEffectsDbManager.createTimeMachine(session, {
    sectionId,
    sectionTipo,
    tipo: parentRelationTipo,
    lang: DEDALO_DATA_NOLAN,
    data: newLocators,
    userId,
    now,
  });
  await SaveSideEffectsDbManager.createSaveActivity(session, {
    tipo: parentRelationTipo,
    sectionId,
    logSectionId: String(sectionId),
    sectionTipo,
    lang: DEDALO_DATA_NOLAN,
    componentName: 'component_relation_parent',
    table,
    userId,
    ip,
    now,
  });
}
