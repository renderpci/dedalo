// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_TOOL_PROPAGATE_COMPONENT_DATA
 * Client-side coverage for the propagate-component-data tool.
 *
 * The tool's deeper init/build/render path needs a live caller chain
 * (tool_button → component → section in edit mode) with an active SQO plus
 * the temporal clone component built via get_instance, none of which is
 * guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_propagate_component_data} from '../../../tools/tool_propagate_component_data/js/tool_propagate_component_data.js'



describe('TOOL_PROPAGATE_COMPONENT_DATA CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_propagate_component_data, 'function', 'expected tool_propagate_component_data to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_propagate_component_data()

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
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.component_list, null, 'expected component_list null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_propagate_component_data.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_propagate_component_data.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_propagate_component_data.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_propagate_component_data
		assert.equal(typeof tool_propagate_component_data.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_propagate_component_data.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_propagate_component_data.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_propagate_component_data.prototype.get_component_to_propagate, 'function', 'expected get_component_to_propagate defined')
		assert.equal(typeof tool_propagate_component_data.prototype.propagate_component_data, 'function', 'expected propagate_component_data defined')
		assert.equal(typeof tool_propagate_component_data.prototype.on_close_actions, 'function', 'expected on_close_actions defined')
	})

})

// @license-end
