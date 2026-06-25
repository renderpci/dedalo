// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_DD_LABEL
 * Client-side coverage for the multi-language tool-label editor.
 *
 * The tool's deeper init/render path needs a live caller (component_json dd1372
 * with an editor) plus page_globals.dedalo_projects_default_langs, neither of
 * which is guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction yields an object (the constructor only references the
 *     documented instance properties; it does not seed them),
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_dd_label} from '../../../tools/tool_dd_label/js/tool_dd_label.js'



describe('TOOL_DD_LABEL CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_dd_label, 'function', 'expected tool_dd_label to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_dd_label()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// The constructor only references the documented instance properties
		// (this.id, this.model, …) without assigning them, so they are undefined
		// until tool_common.prototype.init seeds them.
		assert.equal(typeof instance.id, 'undefined', 'expected id undefined before init')
		assert.equal(typeof instance.model, 'undefined', 'expected model undefined before init')
		assert.equal(typeof instance.mode, 'undefined', 'expected mode undefined before init')
		assert.equal(typeof instance.node, 'undefined', 'expected node undefined before init')
		assert.equal(typeof instance.caller, 'undefined', 'expected caller undefined before init')
		assert.equal(typeof instance.last_value, 'undefined', 'expected last_value undefined before init')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_dd_label.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_dd_label.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_dd_label.prototype.refresh, 'function', 'expected refresh wired')
		assert.equal(typeof tool_dd_label.prototype.build, 'function', 'expected build wired')
		// render mode delegated to render_tool_dd_label
		assert.equal(typeof tool_dd_label.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_dd_label.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_dd_label.prototype.update_data, 'function', 'expected update_data defined')
		assert.equal(typeof tool_dd_label.prototype.on_close_actions, 'function', 'expected on_close_actions defined')
		assert.equal(typeof tool_dd_label.prototype.save_label_lang_sequence, 'function', 'expected save_label_lang_sequence defined')
	})

})

// @license-end
