// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_IMAGE_ROTATION
 * Client-side coverage for the image rotation / crop / background-removal tool.
 *
 * The tool's deeper render/open path needs a host section with a configured
 * component_image, plus the lazily-imported in-browser RMBG worker and
 * ImageMagick-backed server actions, none of which is guaranteed in the headless
 * harness. This suite therefore asserts the reliable, fixture-free contract that
 * every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_image_rotation} from '../../../tools/tool_image_rotation/js/tool_image_rotation.js'



describe('TOOL_IMAGE_ROTATION CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_image_rotation, 'function', 'expected tool_image_rotation to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_image_rotation()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.main_element, null, 'expected main_element null')
		assert.equal(instance.caller, null, 'expected caller null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_image_rotation.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_image_rotation.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_image_rotation.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_image_rotation
		assert.equal(typeof tool_image_rotation.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_image_rotation.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_image_rotation.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_image_rotation.prototype.apply_rotation, 'function', 'expected apply_rotation defined')
		assert.equal(typeof tool_image_rotation.prototype.automatic_background_removal, 'function', 'expected automatic_background_removal defined')
	})

})

// @license-end
