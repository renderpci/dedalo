/**
 * Port of the dd_ts_api `add_child` action — the PERSISTED thesaurus-tree write the
 * core-api save path does NOT cover: create a new child term under a parent node and
 * link it into the tree.
 *
 * PHP path (core/api/v1/common/class.dd_ts_api.php::add_child →
 * section::create_record + 3 component saves + component_relation_parent::add_parent):
 *
 *   1. Validate (BEFORE any write): the section_map thesaurus block exists with
 *      is_descriptor + is_indexable, and the component_relation_parent tipo resolves.
 *   2. Inside ONE DBi::transaction (advisory parent-node lock held):
 *      a. section::create_record → a fresh child row (data + relation.dd200 +
 *         date.dd199). The new section_id comes from the advisory-lock counter.
 *      b. save is_descriptor (radio_button) with its ontology default
 *         (properties.dato_default → a si_no dd64 locator). This is the FIRST save on
 *         the row, so it ALSO stamps the modification metadata (dd197 + dd201).
 *      c. save is_indexable (radio_button) with its ontology default.
 *      d. (ontology sections only — get_section_id_from_tipo===''0'') copy the TLD.
 *         NOT reproduced here; the gate only accepts NON-ontology tree sections.
 *      e. add_parent: allocate the parent-link item id (meta counter), set_child_order
 *         (count existing descriptor children + 1 → write the order component_number,
 *         paired by id_key), then save the component_relation_parent (relation column).
 *   3. ts_object::invalidate_node (cache; no DB effect — skipped here).
 *   4. response = { result:<new child section_id>, msg, errors:[] }.
 *
 * The PARENT row is NEVER mutated: children are a COMPUTED inverse
 * (component_relation_children, use_db_data=false). The bidirectional link lives
 * entirely on the CHILD (its component_relation_parent locator + per-parent order).
 *
 * Side-effects, in PHP order (verified live on the test DB):
 *   - matrix_activity: NEW (create) + SAVE×4 in order: is_descriptor, is_indexable,
 *     order (component_number), relation_parent.
 *   - matrix_time_machine: one row per component SAVE (is_descriptor, is_indexable,
 *     order, relation_parent) — NONE for the create, NONE for the dd197/dd201 stamp.
 *
 * SCOPE — the narrow first tree-write. The caller (canHandleAddChild) accepts only a
 * NON-ontology tree section whose section_map carries the full thesaurus block, with
 * is_descriptor/is_indexable being radio_button components that have a si_no
 * dato_default, and order being a component_number. Everything else → UnsupportedAddChild
 * → proxy to PHP.
 */

import type { Db, DbSession, MatrixFamily, MatrixKeyUpdate } from '@dedalo/db';
import { MatrixDbManager, SaveSideEffectsDbManager } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import type { SearchQueryer } from '@dedalo/search';
import type { LangConfig } from './lang_config.ts';
import { resolveMatrixTable } from './matrix_table.ts';

/** Fixed metadata / relation-type tipos (PHP dd_tipos + section_record). */
const CREATED_BY_USER_TIPO = 'dd200'; // relation column
const CREATED_DATE_TIPO = 'dd199'; // date column
const MODIFIED_BY_USER_TIPO = 'dd197'; // relation column
const MODIFIED_DATE_TIPO = 'dd201'; // date column
const DEDALO_SECTION_USERS_TIPO = 'dd128';
const DEDALO_RELATION_TYPE_LINK = 'dd151';
const DEDALO_RELATION_TYPE_PARENT_TIPO = 'dd47';
const DEDALO_DATA_NOLAN = 'lg-nolan';
const DEDALO_SECTION_SI_NO_TIPO = 'dd64';
const NUMERICAL_MATRIX_VALUE_YES = 1;

/** The add_child RQO source block (the frontend sends only these two). */
export interface AddChildSource {
  section_tipo: string;
  section_id: string | number;
}

export interface AddChildRequest {
  source: AddChildSource;
}

/** Session info needed to stamp audit metadata + gate permissions. */
export interface AddChildSessionInfo {
  /** The logged user's id (logged_user_id()). */
  userId: number | null;
  /** Global-admin / root → write permission. */
  isGlobalAdmin: boolean;
  /** The request source IP for the activity rows ('::1' → 'localhost'). */
  ip?: string;
}

export interface AddChildOptions {
  db: Db;
  ontology: OntologyRepository;
  langConfig: LangConfig;
  /** SQL queryer for the existing-descriptor-children count (set_child_order). */
  searchQueryer: SearchQueryer;
  session: AddChildSessionInfo;
}

export interface AddChildResult {
  result: unknown;
  msg: string;
  errors: string[];
}

/** Thrown for an input the add_child path declines (caller should proxy). */
export class UnsupportedAddChild extends Error {}

/** The resolved thesaurus section_map block (tipos this write needs). */
interface ThesaurusMap {
  is_descriptor: string;
  is_indexable: string;
  order: string;
  parent: string;
}

/** Format a JS Date as the PostgreSQL timestamp string PHP writes (Y-m-d H:i:s). */
function formatDbTimestamp(now: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return (
    `${p(now.getFullYear(), 4)}-${p(now.getMonth() + 1)}-${p(now.getDate())} ` +
    `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  );
}

/** The dd_date 'start' leaf — component_date::get_date_now / convert_date_to_seconds. */
function buildDateNowStart(now: Date): Record<string, number> {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();
  const cMonth = month > 0 ? month - 1 : 0;
  const cDay = day > 0 ? day - 1 : 0;
  const time =
    year * 372 * 24 * 60 * 60 +
    cMonth * 31 * 24 * 60 * 60 +
    cDay * 24 * 60 * 60 +
    hour * 60 * 60 +
    minute * 60 +
    second;
  return { year, month, day, hour, minute, second, time };
}

/**
 * Resolve the section's thesaurus map (PHP section::get_section_map().thesaurus).
 * The section_map lives in the ontology node whose model is 'section_map' and whose
 * parent is the section_tipo (direct child); its properties.thesaurus carries the
 * tipo map. Returns null when not resolvable (→ decline).
 */
async function resolveThesaurusMap(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<ThesaurusMap | null> {
  const childTipos = await ontology.getChildren(sectionTipo);
  for (const childTipo of childTipos) {
    const model = await ontology.getModelByTipo(childTipo);
    if (model !== 'section_map') continue;
    const props = await ontology.getProperties(childTipo);
    const thesaurus = props?.['thesaurus'];
    if (thesaurus === null || typeof thesaurus !== 'object') return null;
    const th = thesaurus as Record<string, unknown>;
    const is_descriptor = th['is_descriptor'];
    const is_indexable = th['is_indexable'];
    const order = th['order'];
    const parent = th['parent'];
    if (
      typeof is_descriptor === 'string' &&
      typeof is_indexable === 'string' &&
      typeof order === 'string' &&
      typeof parent === 'string'
    ) {
      return { is_descriptor, is_indexable, order, parent };
    }
    return null;
  }
  return null;
}

/**
 * Resolve the si_no default locator a radio_button (is_descriptor/is_indexable) writes
 * from properties.dato_default. PHP stores `[{section_id, section_tipo}]`; the saved
 * locator adds id (the allocated item id), type (LINK), from_component_tipo. Returns
 * null when the component has no usable dato_default (→ decline: PHP would write
 * nothing, a different footprint).
 */
async function resolveSiNoDefault(
  ontology: OntologyRepository,
  componentTipo: string,
): Promise<{ section_id: string; section_tipo: string } | null> {
  const props = await ontology.getProperties(componentTipo);
  const def = props?.['dato_default'];
  if (!Array.isArray(def) || def.length !== 1) return null;
  const first = def[0];
  if (first === null || typeof first !== 'object') return null;
  const f = first as Record<string, unknown>;
  if (f['section_tipo'] !== DEDALO_SECTION_SI_NO_TIPO) return null;
  const sid = f['section_id'];
  if (typeof sid !== 'string' && typeof sid !== 'number') return null;
  return { section_id: String(sid), section_tipo: DEDALO_SECTION_SI_NO_TIPO };
}

/**
 * Count the EXISTING descriptor children of the parent (set_child_order base).
 * Mirrors get_children_of_type(parent, 'descriptor'): records in the parent's table
 * whose component_relation_parent locator points at (parent_tipo, parent_id) AND whose
 * is_descriptor first-locator points at si_no/YES. Returns the count (the order value
 * is count + 1).
 */
async function countDescriptorChildren(
  queryer: SearchQueryer,
  table: string,
  parentTipo: string,
  parentId: number,
  parentRelationTipo: string,
  isDescriptorTipo: string,
): Promise<number> {
  const flatKey = `${parentTipo}_${parentId}`;
  // data_relations_flat_st_si pre-filters by the GIN-indexed flat key; the locator
  // breakdown + is_descriptor leaf refine to the exact descriptor children.
  const sql =
    `SELECT count(*)::int AS n FROM "${table}" ` +
    `WHERE data_relations_flat_st_si(relation) @> $1::jsonb ` +
    `AND relation -> $2 @> $3::jsonb ` +
    `AND relation -> $4 -> 0 ->> 'section_id' = $5 ` +
    `AND relation -> $4 -> 0 ->> 'section_tipo' = $6`;
  const params: unknown[] = [
    [flatKey],
    parentRelationTipo,
    [{ section_id: String(parentId), section_tipo: parentTipo }],
    isDescriptorTipo,
    String(NUMERICAL_MATRIX_VALUE_YES),
    DEDALO_SECTION_SI_NO_TIPO,
  ];
  const rows = await queryer.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

/**
 * Execute the thesaurus add_child. Create + 3 component saves + the parent link, all
 * on the RESERVED per-request connection inside ONE transaction (the advisory-lock
 * allocator + the per-component saves must share the transaction, matching PHP's
 * DBi::transaction). Side rows (TM + activity) are written on the same session.
 *
 * @throws UnsupportedAddChild for a declined case (the caller proxies to PHP).
 */
export async function addChild(
  req: AddChildRequest,
  opts: AddChildOptions,
): Promise<AddChildResult> {
  const sectionTipo = req.source.section_tipo;
  const parentId = Number.parseInt(String(req.source.section_id), 10);
  if (typeof sectionTipo !== 'string' || sectionTipo === '' || !Number.isInteger(parentId)) {
    return { result: false, msg: 'Error. Request failed [add_child]', errors: ['bad source'] };
  }

  // permission gate (perm >= 2). Root/global-admin only in this slice.
  if (opts.session.isGlobalAdmin !== true) {
    return {
      result: false,
      msg: `Error. Insufficient permissions to create in section (${sectionTipo})`,
      errors: ['insufficient permissions'],
    };
  }
  const userId = opts.session.userId;
  if (userId === null) {
    throw new UnsupportedAddChild('no logged user id for the audit stamp');
  }

  // ── validations (BEFORE any write) ──
  // ontology sections (section_id===0 path) copy the TLD — NOT reproduced; decline.
  // (We detect via the thesaurus map presence; a real ontology section is gated out
  //  by the handler's canHandleAddChild, which only accepts the supported sections.)
  const thesaurus = await resolveThesaurusMap(opts.ontology, sectionTipo);
  if (thesaurus === null) {
    throw new UnsupportedAddChild(`no resolvable thesaurus section_map for ${sectionTipo}`);
  }
  const isDescriptorDefault = await resolveSiNoDefault(opts.ontology, thesaurus.is_descriptor);
  const isIndexableDefault = await resolveSiNoDefault(opts.ontology, thesaurus.is_indexable);
  if (isDescriptorDefault === null || isIndexableDefault === null) {
    throw new UnsupportedAddChild('is_descriptor/is_indexable have no si_no dato_default');
  }
  // The parent component tipo (component_relation_parent) — section_map.thesaurus.parent.
  const parentRelationTipo = thesaurus.parent;
  const parentModel = await opts.ontology.getModelByTipo(parentRelationTipo);
  if (parentModel !== 'component_relation_parent') {
    throw new UnsupportedAddChild(`section_map.parent ${parentRelationTipo} is not a relation_parent`);
  }

  const table = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
  const ip = opts.session.ip ?? 'localhost';
  const label = (await opts.ontology.getLabel(sectionTipo, opts.langConfig.dataLang, [], true)) ?? '';

  // existing descriptor children of the parent → order value (count + 1).
  const existingCount = await countDescriptorChildren(
    opts.searchQueryer,
    table,
    sectionTipo,
    parentId,
    parentRelationTipo,
    thesaurus.is_descriptor,
  );
  const orderValue = existingCount + 1;

  const writeSession: DbSession = await opts.db.reserve();
  let newSectionId: number;
  try {
    // ── the transactional create + column writes (advisory lock held to commit) ──
    newSectionId = await writeSession.transaction(async (tx) => {
      const now = new Date();

      // a. create_record: data + relation.dd200 + date.dd199. The section_id is the
      //    advisory-lock counter value (allocated identically to PHP).
      const dataColumn = {
        label,
        created_date: formatDbTimestamp(now),
        section_id: null,
        section_tipo: sectionTipo,
        diffusion_info: null,
        created_by_user_id: userId,
      };
      const createValues = {
        data: dataColumn,
        relation: {
          [CREATED_BY_USER_TIPO]: [
            {
              id: 1,
              type: DEDALO_RELATION_TYPE_LINK,
              section_id: String(userId),
              section_tipo: DEDALO_SECTION_USERS_TIPO,
              from_component_tipo: CREATED_BY_USER_TIPO,
            },
          ],
        },
        date: {
          [CREATED_DATE_TIPO]: [{ start: buildDateNowStart(now), id: 1, lang: DEDALO_DATA_NOLAN }],
        },
      };
      const childId = await MatrixDbManager.create(tx, table, sectionTipo, createValues);

      // The first component save stamps the modification metadata (dd197 + dd201) on
      // the record; it is written ONCE (idempotent) with the first column write.
      const modifiedDate: MatrixKeyUpdate = {
        column: 'date',
        key: MODIFIED_DATE_TIPO,
        value: [{ start: buildDateNowStart(now), id: 1, lang: DEDALO_DATA_NOLAN }],
      };
      const modifiedByUser: MatrixKeyUpdate = {
        column: 'relation',
        key: MODIFIED_BY_USER_TIPO,
        value: [
          {
            id: 1,
            type: DEDALO_RELATION_TYPE_LINK,
            section_id: String(userId),
            section_tipo: DEDALO_SECTION_USERS_TIPO,
            from_component_tipo: MODIFIED_BY_USER_TIPO,
          },
        ],
      };

      // b. is_descriptor (radio_button) save: the si_no default locator + its meta
      //    counter (id 1) + the modification stamp.
      const descLocator = {
        id: 1,
        type: DEDALO_RELATION_TYPE_LINK,
        section_id: isDescriptorDefault.section_id,
        section_tipo: isDescriptorDefault.section_tipo,
        from_component_tipo: thesaurus.is_descriptor,
      };
      await MatrixDbManager.updateByKey(tx, table, sectionTipo, childId, [
        { column: 'relation', key: thesaurus.is_descriptor, value: [descLocator] },
        { column: 'meta', key: thesaurus.is_descriptor, value: [{ count: 1 }] },
        modifiedDate,
        modifiedByUser,
      ]);

      // c. is_indexable (radio_button) save: same shape.
      const idxLocator = {
        id: 1,
        type: DEDALO_RELATION_TYPE_LINK,
        section_id: isIndexableDefault.section_id,
        section_tipo: isIndexableDefault.section_tipo,
        from_component_tipo: thesaurus.is_indexable,
      };
      await MatrixDbManager.updateByKey(tx, table, sectionTipo, childId, [
        { column: 'relation', key: thesaurus.is_indexable, value: [idxLocator] },
        { column: 'meta', key: thesaurus.is_indexable, value: [{ count: 1 }] },
      ]);

      // e. add_parent: order component_number (set_child_order, paired by id_key=1) +
      //    the parent locator (relation) + their meta counters (each id 1).
      await MatrixDbManager.updateByKey(tx, table, sectionTipo, childId, [
        { column: 'number', key: thesaurus.order, value: [{ id: 1, value: orderValue, id_key: 1 }] },
        { column: 'meta', key: thesaurus.order, value: [{ count: 1 }] },
      ]);
      const parentLocator = {
        id: 1,
        type: DEDALO_RELATION_TYPE_PARENT_TIPO,
        section_id: String(parentId),
        section_tipo: sectionTipo,
        from_component_tipo: parentRelationTipo,
      };
      await MatrixDbManager.updateByKey(tx, table, sectionTipo, childId, [
        { column: 'relation', key: parentRelationTipo, value: [parentLocator] },
        { column: 'meta', key: parentRelationTipo, value: [{ count: 1 }] },
      ]);

      return childId;
    });

    // ── side rows on the same reserved session (PHP order). ──
    const now2 = new Date();
    // NEW activity (create). No TM on create.
    await SaveSideEffectsDbManager.createNewActivity(writeSession, {
      sectionTipo,
      sectionId: newSectionId,
      table,
      userId,
      ip,
      now: now2,
    });
    // SAVE activity + TM, one per component save, in PHP order:
    // is_descriptor, is_indexable, order, relation_parent.
    const saves: Array<{ tipo: string; componentName: string; data: unknown }> = [
      {
        tipo: thesaurus.is_descriptor,
        componentName: 'component_radio_button',
        data: [
          {
            id: 1,
            type: DEDALO_RELATION_TYPE_LINK,
            section_id: isDescriptorDefault.section_id,
            section_tipo: isDescriptorDefault.section_tipo,
            from_component_tipo: thesaurus.is_descriptor,
          },
        ],
      },
      {
        tipo: thesaurus.is_indexable,
        componentName: 'component_radio_button',
        data: [
          {
            id: 1,
            type: DEDALO_RELATION_TYPE_LINK,
            section_id: isIndexableDefault.section_id,
            section_tipo: isIndexableDefault.section_tipo,
            from_component_tipo: thesaurus.is_indexable,
          },
        ],
      },
      {
        tipo: thesaurus.order,
        componentName: 'component_number',
        data: [{ id: 1, value: orderValue, id_key: 1 }],
      },
      {
        tipo: parentRelationTipo,
        componentName: 'component_relation_parent',
        data: [
          {
            id: 1,
            type: DEDALO_RELATION_TYPE_PARENT_TIPO,
            section_id: String(parentId),
            section_tipo: sectionTipo,
            from_component_tipo: parentRelationTipo,
          },
        ],
      },
    ];
    for (const s of saves) {
      await SaveSideEffectsDbManager.createTimeMachine(writeSession, {
        sectionId: newSectionId,
        sectionTipo,
        tipo: s.tipo,
        lang: DEDALO_DATA_NOLAN,
        data: s.data,
        userId,
        now: now2,
      });
      await SaveSideEffectsDbManager.createSaveActivity(writeSession, {
        tipo: s.tipo,
        sectionId: newSectionId,
        // add_child's internal saves carry the just-allocated INTEGER section_id in
        // the log_data bag (PHP instantiates the component with the int new id).
        logSectionId: newSectionId,
        sectionTipo,
        lang: DEDALO_DATA_NOLAN,
        componentName: s.componentName,
        table,
        userId,
        ip,
        now: now2,
      });
    }
  } finally {
    writeSession.release();
  }

  return { result: newSectionId, msg: 'OK. Added child successfully', errors: [] };
}

/** Re-export so the handler can type the queryer dependency. */
export type { SearchQueryer };

/** The matrix family type, re-exported for callers that build updates. */
export type { MatrixFamily };
