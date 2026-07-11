/**
 * section_record — the TS expression of the PHP section_record concept.
 *
 * PHP wraps one matrix row in a stateful middleware object
 * (core/section_record/class.section_record.php): JSONB parsing, model→column
 * routing, uniform read/write API, and on-the-fly column substitution (the
 * matrix_time_machine/dd15 case). TS keeps the CONTRACTS but not the class
 * shape — see src/core/concepts/section_record.ts for the full mapping:
 *
 *   uniform record interface → the MatrixRecord struct (db/matrix.ts),
 *                              threaded explicitly through the call tree
 *   write chokepoint         → record_write.ts persistRecordKeys /
 *                              persistRecordColumns (audit merge, PHP
 *                              key-removal semantics, save events)
 *   substitution API         → virtual_record.ts makeVirtualRecord /
 *                              cloneRecord / injectComponentData
 *   post-write fan-out       → save_event.ts (cache invalidation + RAG seam)
 *   dd15 materializer        → src/core/tm_record/ (built on the above)
 */

export {
	type AuditStamp,
	type RecordWriteTarget,
	type SavePathItem,
	buildModifiedAuditWrites,
	persistModifiedStamp,
	persistRecordColumns,
	persistRecordKeys,
} from './record_write.ts';
export {
	type RagRecordEvent,
	fireRagRecordEvent,
	fireSaveEvent,
	registerRagRecordHook,
} from './save_event.ts';
export {
	VIRTUAL_RECORD_ID,
	cloneRecord,
	injectColumnData,
	injectComponentData,
	isVirtualRecord,
	makeVirtualRecord,
} from './virtual_record.ts';
