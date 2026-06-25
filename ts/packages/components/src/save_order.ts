/**
 * Port of the dd_ts_api `save_order` action — persist a user-reordered sibling list.
 *
 * PHP (core/api/v1/common/class.dd_ts_api.php::save_order →
 * component_relation_children::sort_children): inside ONE transaction holding the parent
 * node lock, iterate the ordered child locators (position 1..N) and, per child:
 *   1. resolve the child's parent-link locator id (the order id_key) for THIS parent.
 *   2. read the current order value paired by that id_key (get_value_by_id_key).
 *   3. skip when it already equals the new position.
 *   4. else update_value_by_id_key(position, id_key) + save() → the order component_number
 *      gains/updates the {value, id_key} item, and emits a TM repair pair + SAVE activity.
 *
 * For the live thesaurus data the order items carry the legacy `id` (NOT `id_key`), so
 * get_value_by_id_key returns null (≠ position) → EVERY listed sibling is written, each
 * APPENDING a new {id, value, id_key} order item (the legacy {id:1,value:N} preserved).
 *
 * Response: result is the array of changed {value, locator} (in input order); msg is
 * 'OK. Order saved successfully. Changed values: <N>'. The PARENT row is NEVER touched.
 * (PHP also mirrors the order into the separate dd_ontology table via
 * sync_order_to_dd_ontology — that touches NO matrix row and is a different surface;
 * for the ds-thesaurus children that are not ontology nodes it is a no-op, so the
 * matrix footprint is byte-identical without it. The handler only accepts the
 * non-ontology tree section, where it is a no-op.)
 */

import type { Db, DbSession } from '@dedalo/db';
import { MatrixDbManager } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import {
  appendOrderValueByIdKey,
  readOrderValueByIdKey,
  resolveMatrixTable,
  resolveParentLinkIdKey,
  resolveThesaurusOrderMap,
  writeOrderSaveSideEffects,
} from './ts_order_common.ts';

/** One incoming child locator from ar_locators. section_id is ALWAYS a string. */
export interface SaveOrderLocator {
  type?: string;
  section_id: string | number;
  section_tipo: string;
  from_component_tipo?: string;
}

export interface SaveOrderSource {
  section_tipo: string;
  ar_locators: SaveOrderLocator[];
  parent_section_tipo?: string;
  parent_section_id?: string | number;
}

export interface SaveOrderSessionInfo {
  userId: number | null;
  isGlobalAdmin: boolean;
  ip?: string;
}

export interface SaveOrderOptions {
  db: Db;
  ontology: OntologyRepository;
  session: SaveOrderSessionInfo;
}

export interface SaveOrderResult {
  result: unknown;
  msg: string;
  errors: string[];
}

/** Thrown for an input the save_order path declines (caller proxies to PHP). */
export class UnsupportedSaveOrder extends Error {}

export async function saveOrder(
  source: SaveOrderSource,
  opts: SaveOrderOptions,
): Promise<SaveOrderResult> {
  const sectionTipo = source.section_tipo;
  const arLocators = source.ar_locators;
  const parentSectionTipo = source.parent_section_tipo ?? null;
  const parentSectionIdRaw = source.parent_section_id ?? null;

  // permission gate (perm >= 2). Root/global-admin only in this slice.
  if (opts.session.isGlobalAdmin !== true) {
    return {
      result: false,
      msg: `Error. Insufficient permissions to update order in section (${sectionTipo})`,
      errors: ['insufficient permissions'],
    };
  }

  // validate parent context (PHP returns this exact error early).
  if (
    parentSectionTipo === null ||
    parentSectionTipo === '' ||
    parentSectionIdRaw === null ||
    parentSectionIdRaw === '' ||
    String(parentSectionIdRaw) === '0'
  ) {
    return {
      result: false,
      msg: 'Error. parent_section_tipo and parent_section_id are required',
      errors: ['missing parent context'],
    };
  }
  const parentSectionId = Number.parseInt(String(parentSectionIdRaw), 10);

  const userId = opts.session.userId;
  if (userId === null) {
    throw new UnsupportedSaveOrder('no logged user id for the audit stamp');
  }

  // resolve the order/parent map. A missing order tipo → PHP returns false; here we
  // decline (proxy) so the false-path msg is produced by PHP verbatim.
  const map = await resolveThesaurusOrderMap(opts.ontology, sectionTipo);
  if (map === null) {
    throw new UnsupportedSaveOrder(`no resolvable thesaurus order map for ${sectionTipo}`);
  }
  const orderTipo = map.order;
  const parentRelationTipo = map.parent;

  const table = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
  const ip = opts.session.ip ?? 'localhost';
  const matrix = new MatrixDbManager(opts.db);

  const changed: Array<{ value: number; locator: SaveOrderLocator }> = [];

  /** Per-child order-save side-effect inputs, collected in the tx, emitted after commit. */
  const sideEffectQueue: Array<{
    table: string;
    sectionTipo: string;
    sectionId: number;
    previousItems: unknown[] | null;
    newItems: unknown[];
  }> = [];

  const session: DbSession = await opts.db.reserve();
  try {
    await session.transaction(async (tx) => {
      const txMatrix = new MatrixDbManager(tx);
      let order = 0;
      for (const locator of arLocators) {
        order++;
        const childSectionTipo = locator.section_tipo;
        const childSectionId = Number.parseInt(String(locator.section_id), 10);
        if (!Number.isInteger(childSectionId)) continue;

        const childTable = (await resolveMatrixTable(opts.ontology, childSectionTipo)) ?? table;

        // resolve the child's parent-link id (the order id_key). Read with the tx
        // matrix so an interleaved move within the same request would be seen.
        const idKey = await resolveParentLinkIdKey(
          txMatrix,
          childTable,
          childSectionTipo,
          childSectionId,
          parentRelationTipo,
          parentSectionTipo,
          parentSectionId,
        );
        if (idKey <= 0) continue; // PHP logs + skips when the id_key cannot resolve.

        // skip when the order value already equals the target position.
        const current = await readOrderValueByIdKey(
          txMatrix,
          childTable,
          childSectionTipo,
          childSectionId,
          orderTipo,
          idKey,
        );
        if (current !== null && current === order) continue;

        const { previousItems, newItems } = await appendOrderValueByIdKey(
          tx,
          txMatrix,
          childTable,
          childSectionTipo,
          childSectionId,
          orderTipo,
          order,
          idKey,
        );

        changed.push({ value: order, locator });

        // record the per-child save state for the side effects (emitted post-commit).
        sideEffectQueue.push({
          table: childTable,
          sectionTipo: childSectionTipo,
          sectionId: childSectionId,
          previousItems,
          newItems,
        });
      }
    });

    // side rows on the same reserved session (post-commit, PHP emits them inside save()).
    const now = new Date();
    for (const s of sideEffectQueue) {
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

  return {
    result: changed,
    msg: `OK. Order saved successfully. Changed values: ${changed.length}`,
    errors: [],
  };
}
