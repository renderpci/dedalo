// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_POSTERFRAME
 * Client-side coverage for the posterframe extraction tool.
 *
 * The tool's deeper render/build path needs a host section with a configured
 * component_av / component_3d main_element (resolved from tool_config.ddo_map),
 * plus a live AV player and the server-side FFmpeg pipeline, none of which is
 * guaranteed in the headless harness. This suite therefore asserts the reliable,
 * fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_posterframe} from '../../../tools/tool_posterframe/js/tool_posterframe.js'



describe('TOOL_POSTERFRAME CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_posterframe, 'function', 'expected tool_posterframe to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_posterframe()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.main_element, null, 'expected main_element null')
		assert.equal(instance.caller, null, 'expected caller null')
		// tool-specific allowed-models allow-list seeded in the constructor
		assert.ok(Array.isArray(instance.ar_allowed), 'expected ar_allowed array')
		assert.ok(instance.ar_allowed.includes('component_av'), 'expected component_av allowed')
		assert.ok(instance.ar_allowed.includes('component_3d'), 'expected component_3d allowed')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_posterframe.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_posterframe.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_posterframe.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_posterframe
		assert.equal(typeof tool_posterframe.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_posterframe.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_posterframe.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_posterframe.prototype.create_posterframe, 'function', 'expected create_posterframe defined')
		assert.equal(typeof tool_posterframe.prototype.delete_posterframe, 'function', 'expected delete_posterframe defined')
		assert.equal(typeof tool_posterframe.prototype.get_ar_identifying_image, 'function', 'expected get_ar_identifying_image defined')
		assert.equal(typeof tool_posterframe.prototype.create_identifying_image, 'function', 'expected create_identifying_image defined')
	})

})

// @license-end
