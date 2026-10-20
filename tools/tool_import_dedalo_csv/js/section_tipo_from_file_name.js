// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* SECTION_TIPO_FROM_FILE_NAME
* Pure helpers (no imports, no DOM) that guess the target section_tipo of an
* uploaded CSV from its file name, plus the per-browser store of the user's
* manual corrections. Kept import-free so test/unit can load it directly.
*
* tool_export names its downloads `export_<label>_<YYYY-MM-DD>-<section_tipo>[_media].<ext>`,
* but real files drift: older exports, a `-raw` suffix, browser duplicates
* (` (1)`), renamed files, other date formats. Instead of one positional regex,
* the name is split into words and every word with the tipo grammar is a
* candidate; the LAST one wins (the exporter writes the tipo after the label).
*/



/**
* TIPO_GRAMMAR
* Same grammar as validate_tipo (core/common/js/common.js) — pinned by
* test/unit/tool_import_csv_section_tipo_client.test.ts.
* Case-sensitive on purpose: tipos are lowercase, so label words like 'Ceca'
* or 'Coins2023' are never candidates. Pure digits (dates) and words without
* digits ('raw', 'media', 'export') fail it too.
*/
export const TIPO_GRAMMAR = /^[a-z]{2,}[0-9]{1,}$/



/**
* MAX_SECTION_TIPO_CORRECTIONS
* Cap of remembered corrections; the oldest are dropped first.
*/
export const MAX_SECTION_TIPO_CORRECTIONS = 200



/**
* GET_SECTION_TIPO_CANDIDATES
* Every word of the file name (extension removed) matching TIPO_GRAMMAR,
* in file-name order, without duplicates.
* e.g. 'export_Ceca_07-10-2026-numisdata6-raw.csv' → ['numisdata6']
* @param {string} file_name
* @returns {string[]}
*/
export const get_section_tipo_candidates = function(file_name) {

	if (typeof file_name!=='string' || !file_name.length) {
		return []
	}

	const base_name	= file_name.replace(/\.[^.]*$/, '')
	const words		= base_name.split(/[^A-Za-z0-9]+/)

	const candidates = []
	for (const word of words) {
		if (TIPO_GRAMMAR.test(word) && !candidates.includes(word)) {
			candidates.push(word)
		}
	}

	return candidates
}//end get_section_tipo_candidates



/**
* GET_SECTION_TIPO_FROM_FILE_NAME
* The best guess: the last candidate, or null when the name holds none.
* @param {string} file_name
* @returns {string|null}
*/
export const get_section_tipo_from_file_name = function(file_name) {

	const candidates = get_section_tipo_candidates(file_name)

	return candidates.length ? candidates[candidates.length - 1] : null
}//end get_section_tipo_from_file_name



/**
* APPLY_SECTION_TIPO_CORRECTION
* Returns the updated corrections store ({file_name: section_tipo}, insertion
* order = age) after the user set `section_tipo` for `file_name`.
* A value equal to the file-name guess is not a correction: it removes the entry.
* A changed entry moves to the end (newest); past `max` the oldest are dropped.
* The input store is not mutated.
* @param {Object} store - current corrections
* @param {string} file_name
* @param {string|null} section_tipo - value now in the input
* @param {string|null} detected_section_tipo - guess from the file name
* @param {number} [max=MAX_SECTION_TIPO_CORRECTIONS]
* @returns {Object} new store
*/
export const apply_section_tipo_correction = function(store, file_name, section_tipo, detected_section_tipo, max=MAX_SECTION_TIPO_CORRECTIONS) {

	const next = Object.assign({}, store || {})
	delete next[file_name]

	if (section_tipo && section_tipo!==detected_section_tipo) {
		next[file_name] = section_tipo
	}

	const keys = Object.keys(next)
	for (let i = 0; i < keys.length - max; i++) {
		delete next[keys[i]]
	}

	return next
}//end apply_section_tipo_correction



// @license-end
