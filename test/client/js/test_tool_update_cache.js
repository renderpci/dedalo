// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_UPDATE_CACHE
 * Client-side coverage for the bulk cache-regeneration tool.
 *
 * The tool's deeper build/render path needs a host section/caller plus a live
 * server round-trip (get_components_list) to populate components_list, neither of
 * which is guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_update_cache} from '../../../tools/tool_update_cache/js/tool_update_cache.js'



describe('TOOL_UPDATE_CACHE CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_update_cache, 'function', 'expected tool_update_cache to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_update_cache()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.caller, null, 'expected caller null')
		// tool-specific seeded properties
		assert.deepEqual(instance.selected_tipos, [], 'expected selected_tipos empty array')
		assert.deepEqual(instance.regenerate_options, {}, 'expected regenerate_options empty object')
		assert.deepEqual(instance.components_list, [], 'expected components_list empty array')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_update_cache.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_update_cache.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_update_cache.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_update_cache
		assert.equal(typeof tool_update_cache.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_update_cache.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_update_cache.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_update_cache.prototype.get_components_list, 'function', 'expected get_components_list defined')
		assert.equal(typeof tool_update_cache.prototype.update_cache, 'function', 'expected update_cache defined')
	})

})

// @license-end
