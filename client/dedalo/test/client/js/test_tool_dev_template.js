// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_TOOL_DEV_TEMPLATE
 * Client-side coverage for the canonical tool scaffolding template.
 *
 * The tool's deeper init/build/render path resolves a live caller, the server
 * tool_config (ddo_map) and live component/section instances, none of which are
 * guaranteed in the headless harness. This suite therefore asserts the reliable,
 * fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_dev_template} from '../../../tools/tool_dev_template/js/tool_dev_template.js'



describe('TOOL_DEV_TEMPLATE CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_dev_template, 'function', 'expected tool_dev_template to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_dev_template()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.events_tokens, null, 'expected events_tokens null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.main_element, null, 'expected main_element null')
		assert.equal(instance.type, null, 'expected type null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.langs, null, 'expected langs null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common via wire_tool
		assert.equal(typeof tool_dev_template.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_dev_template.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_dev_template.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_dev_template
		assert.equal(typeof tool_dev_template.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_dev_template.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_dev_template.prototype.build, 'function', 'expected build defined')
		// tool-specific action methods
		assert.equal(typeof tool_dev_template.prototype.get_some_data_from_server, 'function', 'expected get_some_data_from_server defined')
		assert.equal(typeof tool_dev_template.prototype.file_upload_handler, 'function', 'expected file_upload_handler defined')
		assert.equal(typeof tool_dev_template.prototype.run_background_demo, 'function', 'expected run_background_demo defined')
		assert.equal(typeof tool_dev_template.prototype.load_component_sample, 'function', 'expected load_component_sample defined')
	})

})

// @license-end
