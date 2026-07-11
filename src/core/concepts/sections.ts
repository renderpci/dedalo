/**
 * SECTIONS — a group of section_records instantiated from an SQO (SECTION_SPEC §5).
 *
 * "sections" is the search→rows→per-record fan-out: one or many section_tipos,
 * selected by an SQO, resolved to the API {context, data} envelope. This module
 * is the PURE contract home for the envelope shape and the SQO-normalization
 * law; the engine lives in src/core/section/read.ts.
 *
 * PHP reference: core/sections/class.sections.php + core/sections/sections_json.php.
 *
 * SQO NORMALIZATION (PHP sections::set_up :167): the SQO is CLONED (the caller's
 * object is never mutated); limit is normalized — edit mode → 1, a section
 * caller inherits its own request_config limit, else default 10; select is
 * forced to [] (sections fetches only section_tipo/section_id, all values
 * resolve later per record through the context machinery).
 *
 * ENVELOPE (PHP sections_json.php :136): the data[] array leads with one
 * envelope item {typo:'sections', tipo, section_tipo:[], entries:[...]}. Each
 * entry is a locator carrying paginated_key = row_index + sqo.offset (PHP :292).
 * The empty-result path emits CONTEXT ONLY (PHP :94-127).
 *
 * WHERE THE ENGINE LIVES: src/core/section/read.ts (readSection, readSectionRows,
 * deriveSectionDdoMap); the per-ddo component emission it drives is the shared
 * emitDdoData in src/core/section/read.ts (re-entered by relations/).
 */

/** The default page limit for a sections read (PHP sections::set_up :204). */
export const SECTIONS_DEFAULT_LIMIT = 10;

/** Edit mode always resolves exactly ONE record (PHP :178, dd_core_api:2259). */
export const SECTIONS_EDIT_LIMIT = 1;

/** The envelope marker for the leading data[] item (PHP sections_json.php :136). */
export const SECTIONS_ENVELOPE_TYPO = 'sections';
