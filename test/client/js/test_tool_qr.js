// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_QR
 * Client-side coverage for the QR-code generation tool.
 *
 * The tool's deeper render/open path needs a host section with a configured QR
 * button (component tipo tch350) plus the lazily-imported EasyQRCodeJS vendor
 * library, neither of which is guaranteed in the headless harness. This suite
 * therefore asserts the reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_qr} from '../../../tools/tool_qr/js/tool_qr.js'



describe('TOOL_QR CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_qr, 'function', 'expected tool_qr to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_qr()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.section, null, 'expected section null')
		assert.equal(instance.qr_canvas, null, 'expected qr_canvas null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_qr.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_qr.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_qr.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_qr
		assert.equal(typeof tool_qr.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_qr.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_qr.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_qr.prototype.load_section, 'function', 'expected load_section defined')
	})

})

// @license-end
