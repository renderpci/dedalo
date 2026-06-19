// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_IMPORT_RDF
 * Client-side coverage for the RDF import tool.
 *
 * The tool's deeper render/open path needs a host section with a configured
 * component_iri main_element plus a live caller locator and the server-side
 * EasyRdf dependency, none of which is guaranteed in the headless harness. This
 * suite therefore asserts the reliable, fixture-free contract that every tool
 * shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_import_rdf} from '../../../tools/tool_import_rdf/js/tool_import_rdf.js'



describe('TOOL_IMPORT_RDF CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_import_rdf, 'function', 'expected tool_import_rdf to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_import_rdf()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.events_tokens, null, 'expected events_tokens null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.active_dropzone, null, 'expected active_dropzone null')
		assert.equal(instance.tool_contanier, null, 'expected tool_contanier null')
		// files_data is seeded as an empty array (not null)
		assert.equal(Array.isArray(instance.files_data), true, 'expected files_data array')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_import_rdf.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_import_rdf.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_import_rdf.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_import_rdf
		assert.equal(typeof tool_import_rdf.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_import_rdf.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_import_rdf.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_import_rdf.prototype.get_rdf_data, 'function', 'expected get_rdf_data defined')
	})

})

// @license-end
