// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	SCOPE_FALLBACK,
	DEFAULT_FIELDS_SEPARATOR,
	resolve_scope_name,
	get_scope,
	get_element_tipo,
	get_term_tipos,
	get_fields_separator
} from '../../../core/common/js/section_map.js'



// synthetic maps (mirror the PHP section_map_Test fixtures)
	const full = {
		main:			{ term: ['c_main'] },
		thesaurus:		{ term: ['c_t1','c_t2'], fields_separator: ' ', model: 'c_model', order: 'c_order', is_indexable: false },
		relation_list:	{ term: ['c_rl1','c_rl2','c_rl3'] }
	}
	const no_main = {
		thesaurus:		{ term: ['c_t1'] },
		relation_list:	{ term: ['c_rl1'] }
	}
	const str_map = {
		thesaurus: { term: 'c_single' }
	}
	const empty_map = {}



describe('SECTION_MAP (client) : ', function() {

	it('resolve_scope_name: requested-first, chain, strict', function() {

		assert.equal(resolve_scope_name(full, 'thesaurus'), 'thesaurus')
		assert.equal(resolve_scope_name(full, 'relation_list'), 'relation_list')

		// null scope starts the chain at main
		assert.equal(resolve_scope_name(full, null), 'main')

		// chain fallback when main absent (skip already-tried main)
		assert.equal(resolve_scope_name(no_main, null), 'thesaurus')
		assert.equal(resolve_scope_name(no_main, 'main'), 'thesaurus')

		// strict: no chain
		assert.equal(resolve_scope_name(no_main, null, true), null)
		assert.equal(resolve_scope_name(no_main, 'main', true), null)
		assert.equal(resolve_scope_name(no_main, 'thesaurus', true), 'thesaurus')

		// no map
		assert.equal(resolve_scope_name(empty_map, null), null)
	})

	it('get_scope: strict relation_list', function() {

		const rl = get_scope(full, 'relation_list', true)
		assert.ok(rl && Array.isArray(rl.term))

		assert.equal(get_scope(str_map, 'relation_list', true), null)
	})

	it('get_term_tipos: array + string normalization, empty', function() {

		assert.deepEqual(get_term_tipos(full, 'thesaurus'), ['c_t1','c_t2'])

		// null scope -> main first
		assert.deepEqual(get_term_tipos(full, null), ['c_main'])

		// string normalized to array
		assert.deepEqual(get_term_tipos(str_map, 'thesaurus'), ['c_single'])

		// empty map
		assert.deepEqual(get_term_tipos(empty_map, 'thesaurus'), [])
	})

	it('get_fields_separator: override, default, follows term scope', function() {

		assert.equal(get_fields_separator(full, 'thesaurus'), ' ')
		assert.equal(get_fields_separator(full, 'main'), DEFAULT_FIELDS_SEPARATOR)
		assert.equal(get_fields_separator(full, 'relation_list'), DEFAULT_FIELDS_SEPARATOR)
		assert.equal(get_fields_separator(empty_map, null), DEFAULT_FIELDS_SEPARATOR)
	})

	it('get_element_tipo: per-key chain walk, bool false passthrough', function() {

		// 'model' lives only in thesaurus: requesting main walks to thesaurus
		assert.equal(get_element_tipo(full, 'model', 'main'), 'c_model')

		// is_indexable:false passes through unchanged
		assert.equal(get_element_tipo(full, 'is_indexable', 'thesaurus'), false)

		// missing key -> null
		assert.equal(get_element_tipo(full, 'does_not_exist', 'thesaurus'), null)
	})

	it('SCOPE_FALLBACK order', function() {

		assert.deepEqual(SCOPE_FALLBACK, ['main','thesaurus','relation_list'])
	})

})//end describe SECTION_MAP (client)
