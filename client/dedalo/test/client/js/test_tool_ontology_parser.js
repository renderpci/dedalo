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

// @license-end
