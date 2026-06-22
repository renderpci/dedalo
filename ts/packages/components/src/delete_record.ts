/**
 * Port of the dd_core_api `delete` action — DELETE, the D in CRUD: remove a section
 * record (delete_mode 'delete_record') and clean up the inverse references that
 * other records hold to it.
 *
 * PHP path (class.dd_core_api.php::delete → sections::delete →
 * section_record::delete → matrix_db_manager::delete +
 * section_record::remove_all_inverse_references):
 *
 *   0. perm gate: section permission >= 2 (root → 3). sections::delete then resolves
 *      the target set from the sqo / source.section_id (a single-record delete here).
 *   1. TIME MACHINE snapshot of the DELETED record — tm_record::create with the FULL
 *      record data (all 11 JSONB columns), keyed by (section_id, section_tipo,
 *      tipo=section_tipo, lang=lg-nolan) + who/when. (PHP re-reads + byte-compares the
 *      saved snapshot; a mismatch aborts. We snapshot the row we read, so they match.)
 *   2. DB ROW DELETE — matrix_db_manager::delete (DELETE FROM <table> WHERE
 *      section_id=$1 AND section_tipo=$2).
 *   3. INVERSE-REF CLEANUP — remove_all_inverse_references: find every record whose
 *      `relation` column holds a locator pointing at the deleted record (the GIN
 *      `data_relations_flat_st_si` flat-key match + the breakdown locator refine),
 *      then for each owning record:
 *        - remove the matching locator from its relation component array (match on
 *          section_tipo + section_id + from_component_tipo); if the array empties, the
 *          component key is deleted (jsonb_set_lax 'delete_key'),
 *        - re-stamp that record's modified_by_user (dd197) + modified_date (dd201)
 *          (component_common::save → save_component_data merges the modified path),
 *        - write a matrix_time_machine row for the component (tipo=component tipo) and
 *          a matrix_activity 'SAVE' row — exactly the side effects of a normal save.
 *   4. ACTIVITY 'DELETE' row — logger_backend_activity → a dd542 row with WHAT=dd42
 *      section_id 4, WHERE=section_tipo, and the delete log_data bag. (Media-file
 *      removal + diffusion unpublish + RAG enqueue are best-effort side paths NOT
 *      reproduced here — they have no parity-relevant DB write for the gated sections.)
 *   5. response = { result:[<deleted_id_string>], delete_mode:'delete_record',
 *      msg:'OK. Request done successfully.', errors:[] }.
 *
 * Order verified live (test DB): the DELETED record's TM row, then the inverse-ref
 * cleanup TM + 'SAVE' activity rows on each referencing record, then the 'DELETE'
 * activity row.
 *
 * SCOPE — the NARROW first delete. The caller (canHandleDelete) declines anything but
 * a single-record delete_record of a SIMPLE content section (no relation_children /
 * relation_parent thesaurus handling, no ontology/hierarchy section, no media, no
 * diffusion). Everything declined proxies to PHP.
 */

import type { Db, DbSession, MatrixKeyUpdate, ComponentDatum, InverseReference } from '@dedalo/db';
import { MatrixDbManager, SaveSideEffectsDbManager } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import type { LangConfig } from './lang_config.ts';
import { resolveMatrixTable } from './matrix_table.ts';

/** The fixed audit-stamp tipos (PHP section::get_metadata_definition). */
const MODIFIED_BY_USER_TIPO = 'dd197'; // relation column
const MODIFIED_DATE_TIPO = 'dd201'; // date column
const DEDALO_SECTION_USERS_TIPO = 'dd128';
const DEDALO_RELATION_TYPE_LINK = 'dd151';
const DEDALO_DATA_NOLAN = 'lg-nolan';
/** The activity-log section (dd542) is never deleted through this path. */
const DEDALO_ACTIVITY_SECTION_TIPO = 'dd542';

/** All matrix JSONB payload columns, in PHP column order (the TM snapshot data shape). */
const PAYLOAD_COLUMNS = [
  'data',
  'relation',
  'string',
  'date',
  'iri',
  'geo',
  'number',
  'media',
  'misc',
  'relation_search',
  'meta',
] as const;

/** The delete RQO source block. */
export interface DeleteSource {
  tipo: string;
  section_tipo?: string;
  section_id?: number | string | null;
  delete_mode?: string;
  model?: string;
}

export interface DeleteRecordRequest {
  source: DeleteSource;
}

/** Session info needed to stamp audit metadata + gate permissions. */
export interface DeleteSessionInfo {
  /** The logged user's id (logged_user_id()): the modified_by_user locator section_id. */
  userId: number | null;
  /** Global-admin / root → permission 3 (write). */
  isGlobalAdmin: boolean;
  /** The request source IP for the activity IP column ('::1' → 'localhost'). */
  ip?: string;
}

export interface DeleteRecordOptions {
  db: Db;
  ontology: OntologyRepository;
  langConfig: LangConfig;
  session: DeleteSessionInfo;
  /** The read-side matrix manager (row read + inverse-ref discovery). */
  matrix: MatrixDbManager;
  /** The relation-bearing matrix tables to scan for inverse references. */
  relationTables: ReadonlyArray<string>;
}

export interface DeleteResult {
  result: unknown;
  msg: string;
  delete_mode?: string;
  errors: string[];
}

/** Thrown for an input the delete path declines (caller should proxy). */
export class UnsupportedDelete extends Error {}

/**
 * Build the modified_date (dd201) date item — component_date::get_date_now():
 * { start:{year,month,day,hour,minute,second,time}, id:1, lang:'lg-nolan' }. The
 * `time` integer is convert_date_to_seconds (virtual 372-day years, 31-day months,
 * month/day -1). Volatile clock; the harness normalizes it.
 */
function buildModifiedDateItem(now: Date): ComponentDatum {
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
  const start = { year, month, day, hour, minute, second, time };
  return { start, id: 1, lang: DEDALO_DATA_NOLAN } as unknown as ComponentDatum;
}

/** Build the modified_by_user (dd197) relation locator item (build_modification_data shape). */
function buildModifiedByUserItem(userId: number): ComponentDatum {
  return {
    id: 1,
    type: DEDALO_RELATION_TYPE_LINK,
    section_id: String(userId),
    section_tipo: DEDALO_SECTION_USERS_TIPO,
    from_component_tipo: MODIFIED_BY_USER_TIPO,
  } as unknown as ComponentDatum;
}

/**
 * Execute the section-record DELETE. The whole pipeline (TM snapshot → row DELETE →
 * inverse-ref cleanup → DELETE activity) runs on ONE reserved per-request connection,
 * matching PHP's order.
 *
 * @throws UnsupportedDelete when the input hits a declined case (activity section,
 *   no logged user, absent row, unsupported referencing component model). The caller
 *   proxies to PHP.
 */
export async function deleteRecord(
  req: DeleteRecordRequest,
  opts: DeleteRecordOptions,
): Promise<DeleteResult> {
  const source = req.source;
  const sectionTipo = source.section_tipo ?? source.tipo;
  if (typeof sectionTipo !== 'string' || sectionTipo === '') {
    return {
      result: false,
      msg: 'Error. Request failed. [1] Missing section_tipo.',
      errors: ['missing section_tipo'],
    };
  }

  const deleteMode = source.delete_mode ?? 'delete_data';
  if (deleteMode !== 'delete_record') {
    throw new UnsupportedDelete(`delete_mode ${deleteMode} not ported (only delete_record)`);
  }

  // ── permission gate (perm >= 2). Root/global-admin → 3. ──
  const permission = opts.session.isGlobalAdmin ? 3 : 0;
  if (permission < 2) {
    return {
      result: false,
      msg: `Error. You don't have enough permissions to delete this section (${sectionTipo}). permissions:${permission}`,
      errors: ['insufficient permissions to delete'],
    };
  }

  // The activity section is logger-managed; never deleted through this path.
  if (sectionTipo === DEDALO_ACTIVITY_SECTION_TIPO) {
    throw new UnsupportedDelete('activity section is not deleted through this path');
  }

  // modified stamps on referencing records need a logged user id.
  const userId = opts.session.userId;
  if (userId === null) {
    throw new UnsupportedDelete('no logged user id for the inverse-ref modified stamp');
  }

  const sidRaw = source.section_id;
  const sectionId =
    typeof sidRaw === 'number' ? sidRaw : Number.parseInt(String(sidRaw ?? ''), 10);
  if (!Number.isInteger(sectionId) || sectionId < 1) {
    // sections::delete with no sqo + empty section_id returns the '[3]' error.
    return {
      result: false,
      msg: 'Error. Request failed. [3] section_id = null and $sqo = null, impossible to determinate the sections to delete. ',
      errors: ['empty sqo section_id'],
    };
  }

  const matrixTable = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
  const reader = opts.matrix;

  // Read the FULL row (all payload columns) — the TM snapshot data + the existence
  // probe. An absent row → sections::delete returns 'No records found to delete'.
  const row = await reader.getRow(matrixTable, sectionTipo, sectionId);
  if (row === null) {
    return {
      result: [],
      msg: 'Error. Request failed. No records found to delete ',
      errors: [],
    };
  }
  // The full-record TM snapshot data: every payload column (PHP get_data()).
  const fullData: Record<string, unknown> = {};
  for (const c of PAYLOAD_COLUMNS) fullData[c] = (row as Record<string, unknown>)[c] ?? null;

  // ── find the inverse references BEFORE the delete (the GIN flat-key match) ──
  const inverseRefs: InverseReference[] = [];
  for (const table of opts.relationTables) {
    const hits = await reader.findInverseReferences(table, sectionTipo, sectionId);
    inverseRefs.push(...hits);
  }
  // Group the hits by owning record (one matrix UPDATE + one TM + one activity per
  // referencing record, exactly like PHP's per-component save — but the inverse-ref
  // loop saves PER COMPONENT. PHP iterates per inverse locator and saves the component
  // each time; for a single component holding one locator that is one save. We mirror
  // PHP's PER-(record,component) granularity: one save per referencing component.)
  const byComponent = new Map<string, InverseReference[]>();
  for (const ref of inverseRefs) {
    const key = `${ref.table} ${ref.fromSectionTipo} ${ref.fromSectionId} ${ref.fromComponentTipo}`;
    const list = byComponent.get(key);
    if (list) list.push(ref);
    else byComponent.set(key, [ref]);
  }

  // ── the whole pipeline on a RESERVED connection (PHP order) ──
  const writeSession: DbSession = await opts.db.reserve();
  try {
    // 1. TIME MACHINE snapshot of the deleted record (full data, tipo=section_tipo,
    //    lang=lg-nolan). PHP writes this BEFORE the row delete.
    await SaveSideEffectsDbManager.createTimeMachine(writeSession, {
      sectionId,
      sectionTipo,
      tipo: sectionTipo,
      lang: DEDALO_DATA_NOLAN,
      data: fullData,
      userId,
      bulkProcessId: null,
    });

    // 2. DB ROW DELETE.
    const deleted = await MatrixDbManager.delete(writeSession, matrixTable, sectionTipo, sectionId);
    if (!deleted) {
      return {
        result: false,
        msg: 'Error. Request failed. ',
        errors: ['unable to delete record: ' + String(sectionId)],
      };
    }

    // 3. INVERSE-REF CLEANUP — per referencing (record, component): remove the matching
    //    locator(s), re-stamp dd197/dd201, write TM + 'SAVE' activity.
    for (const [, refs] of byComponent) {
      const first = refs[0]!;
      const refTable = first.table;
      const refSectionTipo = first.fromSectionTipo;
      const refSectionId = first.fromSectionId;
      const refComponentTipo = first.fromComponentTipo;

      // Read the component's current locator array (the referenced record was the
      // ONLY mutation target; we re-read to get the authoritative array).
      const currentArr =
        (await reader.getComponentData(
          refTable,
          refSectionTipo,
          refSectionId,
          'relation',
          refComponentTipo,
        )) ?? [];

      // Remove every locator pointing at the deleted record (match on
      // section_tipo + section_id; the from_component_tipo already scoped this array).
      const remaining = currentArr.filter((loc) => {
        if (loc === null || typeof loc !== 'object') return true;
        const o = loc as Record<string, unknown>;
        return !(
          o.section_tipo === sectionTipo && String(o.section_id) === String(sectionId)
        );
      });
      // No change (defensive) — skip the save (PHP's remove_locator_from_data returned
      // false; no Save fires). Should not happen given the GIN match found it.
      if (remaining.length === currentArr.length) continue;

      // The component write: relation.<componentTipo> = remaining (or null → delete
      // the key when the array empties), PLUS the modified stamps (dd197/dd201). One
      // matrix UPDATE, mirroring save_component_data's merged save_key_data.
      const updates: MatrixKeyUpdate[] = [
        {
          column: 'relation',
          key: refComponentTipo,
          value: remaining.length > 0 ? remaining : null,
        },
        { column: 'date', key: MODIFIED_DATE_TIPO, value: [buildModifiedDateItem(new Date())] },
        {
          column: 'relation',
          key: MODIFIED_BY_USER_TIPO,
          value: [buildModifiedByUserItem(userId)],
        },
      ];
      await MatrixDbManager.updateByKey(
        writeSession,
        refTable,
        refSectionTipo,
        refSectionId,
        updates,
      );

      // TM row for the component (tipo=component tipo, the post-cleanup slice).
      await SaveSideEffectsDbManager.createTimeMachine(writeSession, {
        sectionId: refSectionId,
        sectionTipo: refSectionTipo,
        tipo: refComponentTipo,
        lang: DEDALO_DATA_NOLAN,
        data: remaining.length > 0 ? remaining : null,
        userId,
        bulkProcessId: null,
      });

      // 'SAVE' activity row for the cleaned component.
      const refComponentModel =
        (await opts.ontology.getModelByTipo(refComponentTipo)) ?? 'component_relation_common';
      await SaveSideEffectsDbManager.createSaveActivity(writeSession, {
        tipo: refComponentTipo,
        sectionId: refSectionId,
        sectionTipo: refSectionTipo,
        lang: DEDALO_DATA_NOLAN,
        componentName: refComponentModel,
        table: refTable,
        userId,
        ip: opts.session.ip ?? 'localhost',
      });
    }

    // 4. ACTIVITY 'DELETE' row (logger_backend_activity).
    await SaveSideEffectsDbManager.createDeleteActivity(writeSession, {
      sectionTipo,
      sectionId,
      table: matrixTable,
      userId,
      ip: opts.session.ip ?? 'localhost',
    });
  } finally {
    writeSession.release();
  }

  // 5. response envelope: result = [the deleted id as a STRING] (sections::delete
  //    pushes $current_section_id, the search row's string id), delete_mode top-level.
  return {
    result: [String(sectionId)],
    msg: 'OK. Request done successfully.',
    delete_mode: 'delete_record',
    errors: [],
  };
}
