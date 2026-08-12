// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_ONTOLOGY_PARSER
 * Client-side coverage for the developer-only ontology parser tool.
 *
 * The tool's deeper build/render path needs a live caller plus the server
 * get_ontologies API action and localStorage, none of which is guaranteed in
 * the headless harness. This suite therefore asserts the reliable, fixture-free
 * contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_ontology_parser} from '../../../tools/tool_ontology_parser/js/tool_ontology_parser.js'
import {filter_ontologies, normalize_text, ontology_matches, parse_query} from '../../../tools/tool_ontology_parser/js/ontologies_filter.js'



describe('TOOL_ONTOLOGY_PARSER CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_ontology_parser, 'function', 'expected tool_ontology_parser to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_ontology_parser()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.caller, null, 'expected caller null')
		// tool-specific properties seeded in the constructor
		assert.equal(instance.ontologies, null, 'expected ontologies null')
		assert.deepEqual(instance.selected_ontologies, [], 'expected selected_ontologies empty array')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_ontology_parser.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_ontology_parser.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_ontology_parser.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_ontology_parser
		assert.equal(typeof tool_ontology_parser.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_ontology_parser.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_ontology_parser.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_ontology_parser.prototype.get_ontologies, 'function', 'expected get_ontologies defined')
		assert.equal(typeof tool_ontology_parser.prototype.export_ontologies, 'function', 'expected export_ontologies defined')
		assert.equal(typeof tool_ontology_parser.prototype.regenerate_ontologies, 'function', 'expected regenerate_ontologies defined')
		assert.equal(typeof tool_ontology_parser.prototype.on_close_actions, 'function', 'expected on_close_actions defined')
	})

})



/**
* The TLD picker's search layer. ontologies_filter.js is DOM-free precisely so it can be
* asserted here, where the render path (live caller + get_ontologies + localStorage) is not
* available. The census fixture below mirrors the real wire shape of get_ontologies:
* {target_section_tipo, tld, name, typology_id, typology_name}, including a null name — the
* server maps a missing term in the app lang to null, and that row must still be searchable.
*/
describe('TOOL_ONTOLOGY_PARSER ONTOLOGIES FILTER', function() {

	const census = [
		{target_section_tipo:'es1',    tld:'es',    name:'España | Spain', typology_id:1, typology_name:'Countries'},
		{target_section_tipo:'fr1',    tld:'fr',    name:'France',         typology_id:1, typology_name:'Countries'},
		{target_section_tipo:'ceram1', tld:'ceramics', name:'Ceramics',    typology_id:2, typology_name:'Thesaurus'},
		{target_section_tipo:'nn1',    tld:'nameless', name:null,          typology_id:2, typology_name:'Thesaurus'}
	]

	const visible = (options) => [...filter_ontologies(census, options).visible_tlds].sort()

	it('normalize_text folds case and diacritics', function() {
		assert.equal(normalize_text('España'), 'espana', 'expected diacritics stripped and lowercased')
		assert.equal(normalize_text('ÀÉÎÕÜ'), 'aeiou', 'expected every combining mark stripped')
		assert.equal(normalize_text(null), '', 'expected null to fold to empty string')
		assert.equal(normalize_text(undefined), '', 'expected undefined to fold to empty string')
	})

	it('parse_query splits on whitespace and drops empties', function() {
		assert.deepEqual(parse_query('  Spain  ES '), ['spain','es'], 'expected trimmed normalized tokens')
		assert.deepEqual(parse_query('   '), [], 'expected whitespace-only query to yield no tokens')
		assert.deepEqual(parse_query(''), [], 'expected empty query to yield no tokens')
	})

	it('an empty query matches everything', function() {
		assert.equal(ontology_matches(census[0], []), true, 'expected no tokens to match')
		assert.deepEqual(visible({query:''}), ['ceramics','es','fr','nameless'], 'expected the whole census')
		assert.deepEqual(visible({query:'   '}), ['ceramics','es','fr','nameless'], 'expected whitespace-only to match all')
		assert.deepEqual(visible({}), ['ceramics','es','fr','nameless'], 'expected a missing query to match all')
	})

	it('matches on tld, on name and diacritic-insensitively', function() {
		assert.deepEqual(visible({query:'ceram'}), ['ceramics'], 'expected the tld substring to match')
		assert.deepEqual(visible({query:'FRANCE'}), ['fr'], 'expected case-insensitive name match')
		assert.deepEqual(visible({query:'espana'}), ['es'], 'expected an unaccented query to find the accented name')
		assert.deepEqual(visible({query:'España'}), ['es'], 'expected the accented query to match too')
	})

	it('matches a name segment the UI does not display', function() {
		// only the first ' | ' segment is rendered; a user who remembers a later one still finds it
		assert.deepEqual(visible({query:'spain'}), ['es'], 'expected the second name segment to be searchable')
	})

	it('a typology name reveals its whole group', function() {
		assert.deepEqual(visible({query:'countries'}), ['es','fr'], 'expected every child of the typology')
		assert.deepEqual(visible({query:'thesaurus'}), ['ceramics','nameless'], 'expected the other group')
	})

	it('tokens are ANDed and order-independent', function() {
		assert.deepEqual(visible({query:'es spain'}), ['es'], 'expected both tokens to have to match')
		assert.deepEqual(visible({query:'spain es'}), ['es'], 'expected token order not to matter')
		assert.deepEqual(visible({query:'spain france'}), [], 'expected an unsatisfiable token pair to match nothing')
	})

	it('a null name neither throws nor blocks the row', function() {
		assert.equal(ontology_matches(census[3], parse_query('nameless')), true, 'expected a null-name row to match on its tld')
		assert.deepEqual(visible({query:'nameless'}), ['nameless'], 'expected the null-name row to be findable')
	})

	it('selected_only restricts to the checked tlds', function() {
		assert.deepEqual(visible({selected_only:true, selected:['es','ceramics']}), ['ceramics','es'], 'expected only the checked rows')
		assert.deepEqual(visible({selected_only:true, selected:[]}), [], 'expected nothing when nothing is checked')
		assert.deepEqual(visible({selected_only:false, selected:['es']}), ['ceramics','es','fr','nameless'], 'expected the toggle off to ignore the selection')
	})

	it('selected_only and the text query compose', function() {
		assert.deepEqual(
			visible({query:'countries', selected_only:true, selected:['es','ceramics']}),
			['es'],
			'expected the intersection of the group match and the selection'
		)
	})

	it('match_count reports the visible rows', function() {
		assert.equal(filter_ontologies(census, {query:''}).match_count, 4, 'expected the full census count')
		assert.equal(filter_ontologies(census, {query:'zzz'}).match_count, 0, 'expected zero on a dead end')
	})

	it('a missing or empty census is not an error', function() {
		assert.equal(filter_ontologies(null, {query:'es'}).match_count, 0, 'expected null ontologies to yield no matches')
		assert.equal(filter_ontologies([], {query:''}).match_count, 0, 'expected an empty census to yield no matches')
	})

})

// @license-end
