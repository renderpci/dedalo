/**
 * SECTION_RECORD — one matrix row's lifecycle contract (SECTION_SPEC §4).
 *
 * A section_record is one row of a matrix table, addressed by the pair
 * (section_tipo, section_id). That pair is the base of every locator
 * (locator.ts). This module is the PURE contract home for the lifecycle
 * invariants; the I/O engine lives in src/core/section/record/ and the
 * concept chokepoints in src/core/section_record/.
 *
 * PHP reference: core/section_record/class.section_record.php.
 *
 * CONCEPT MAPPING (how the PHP middleware class becomes idiomatic TS):
 * PHP hands consumers ONE stateful object per row — lazy JSONB decode,
 * model→column routing, uniform get/set, save pipeline, and on-the-fly column
 * substitution (the matrix_time_machine/dd15 case). TS preserves each
 * GUARANTEE, not the shape:
 *   - uniform record interface = the passive MatrixRecord struct
 *     (db/matrix.ts), threaded EXPLICITLY through the call tree;
 *   - write chokepoint = section_record/record_write.ts (persistRecordKeys /
 *     persistRecordColumns): value + dd197/dd201 modified-audit stamps in ONE
 *     update, PHP key-removal semantics (last key leaves '{}', NULL column
 *     stays NULL — oracle-verified), save-event fan-out;
 *   - substitution = section_record/virtual_record.ts (makeVirtualRecord /
 *     cloneRecord / injectComponentData via MODEL_COLUMN_MAP);
 *   - dd15 materializer = src/core/tm_record/ (PHP tm_record::get_section_record).
 * INTENTIONALLY NOT PORTED: per-column lazy JSON decode (Bun's driver parses
 * jsonb natively — laziness lives at the row level: read once, pass down);
 * the per-request instance singleton (explicit record passing replaces it —
 * spec §4 forbids ambient request state; a request-scoped read-memo remains an
 * optional future perf seam); section_record_temp / the temp table (unported
 * service, seam); delete_column() (PHP no-op stub); and the PHP bugs
 * ('invalid_table' silent fallback, __destruct '_temp' cache-key eviction,
 * undeclared $instances).
 *
 * COUNTER LAW (PHP allocate_component_ids :1284, the identity-critical rule):
 * component item-ids are allocated under a pg_advisory_lock keyed
 * "{table}_{section_tipo}_{section_id}_{tipo}"; the base is
 * max(persisted meta counter, in-memory) — RAISE NEVER LOWER — so a seeded or
 * imported id can never be re-allocated. The TS allocators
 * (db/matrix_write.ts insertMatrixRecordWithCounter / allocateComponentItemId /
 * absorbComponentItemIds) implement this — the section engine reuses them.
 *
 * DELETE PIPELINE ORDER (PHP delete :860, load-bearing sequence):
 *   1. Time-Machine snapshot ALWAYS first, then re-read + verify (abort on
 *      mismatch — a safety gate; TS uses canonical-JSON compare, stronger than
 *      PHP's loose `==`).
 *   2. row delete.
 *   3. remove inverse references + remove media files.
 *   4. diffusion unpublish (per-target failures non-blocking).
 *   5. RAG delete enqueue (seam).
 *
 * WHERE THE ENGINE LIVES: src/core/section/record/ (create_record.ts,
 * duplicate_record.ts, delete_record.ts, save_component.ts); the write
 * chokepoint + substitution API in src/core/section_record/; counters in
 * src/core/db/matrix_write.ts; TM audit in src/core/db/time_machine.ts;
 * the dd15 virtual-record builder in src/core/tm_record/.
 */

import { AUDIT_TIPOS } from './section.ts';

/**
 * The delete modes the section delete verb accepts (PHP sections::delete
 * option `delete_mode`, class.sections.php:429). `delete_data` (default) clears
 * the record's component data + backfills TM; `delete_record` removes the row.
 */
export type DeleteMode = 'delete_data' | 'delete_record';

/** The default delete mode (PHP :429). */
export const DEFAULT_DELETE_MODE: DeleteMode = 'delete_data';

/**
 * The audit tipos re-exported for lifecycle callers (canonical home is
 * concepts/section.ts AUDIT_TIPOS). created_* stamped on new_record,
 * modified_* on update_record (PHP build_modification_data :1622/:1636).
 */
export const RECORD_AUDIT_TIPOS = AUDIT_TIPOS;
