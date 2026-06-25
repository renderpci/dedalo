// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_NUMISDATA_EPIGRAPHY
 * Client-side coverage for the numismatic-epigraphy transcription tool.
 *
 * The tool's deeper render/open path needs a live host section, a configured
 * ddo_map ontology, and the loaded component instances resolved from
 * self.ar_instances, none of which are guaranteed in the headless harness. This
 * suite therefore asserts the reliable, fixture-free contract that every tool
 * shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_numisdata_epigraphy} from '../../../tools/tool_numisdata_epigraphy/js/tool_numisdata_epigraphy.js'



describe('TOOL_NUMISDATA_EPIGRAPHY CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_numisdata_epigraphy, 'function', 'expected tool_numisdata_epigraphy to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_numisdata_epigraphy()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.media_component, null, 'expected media_component null')
		assert.equal(instance.epigraphy, null, 'expected epigraphy null')
		assert.equal(instance.relation_list, null, 'expected relation_list null')
		// events_tokens is seeded as an empty array
		assert.ok(Array.isArray(instance.events_tokens), 'expected events_tokens array')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_numisdata_epigraphy.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_numisdata_epigraphy.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_numisdata_epigraphy.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_numisdata_epigraphy
		assert.equal(typeof tool_numisdata_epigraphy.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_numisdata_epigraphy.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_numisdata_epigraphy.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_numisdata_epigraphy.prototype.get_component, 'function', 'expected get_component defined')
		assert.equal(typeof tool_numisdata_epigraphy.prototype.get_relations, 'function', 'expected get_relations defined')
		assert.equal(typeof tool_numisdata_epigraphy.prototype.get_user_tools, 'function', 'expected get_user_tools defined')
	})

})

// @license-end
