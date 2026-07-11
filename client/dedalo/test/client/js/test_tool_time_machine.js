// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_TOOL_TIME_MACHINE
 * Client-side coverage for the Time Machine tool.
 *
 * The tool's deeper render/open path needs a host section with a configured
 * caller component plus a live service_time_machine + API dispatch, none of
 * which is guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_time_machine} from '../../../tools/tool_time_machine/js/tool_time_machine.js'



describe('TOOL_TIME_MACHINE CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_time_machine, 'function', 'expected tool_time_machine to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_time_machine()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.service_time_machine, null, 'expected service_time_machine null')
		assert.equal(instance.button_apply, null, 'expected button_apply null')
		assert.equal(instance.selected_matrix_id, null, 'expected selected_matrix_id null')
		assert.equal(instance.modal_container, null, 'expected modal_container null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_time_machine.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_time_machine.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_time_machine.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_time_machine
		assert.equal(typeof tool_time_machine.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_time_machine.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_time_machine.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_time_machine.prototype.get_component, 'function', 'expected get_component defined')
		assert.equal(typeof tool_time_machine.prototype.apply_value, 'function', 'expected apply_value defined')
		assert.equal(typeof tool_time_machine.prototype.bulk_revert_process, 'function', 'expected bulk_revert_process defined')
		assert.equal(typeof tool_time_machine.prototype.get_bulk_process_label, 'function', 'expected get_bulk_process_label defined')
	})

})

// @license-end
