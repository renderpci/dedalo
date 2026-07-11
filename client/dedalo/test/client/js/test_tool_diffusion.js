// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_DIFFUSION
 * Client-side coverage for the diffusion tool.
 *
 * The tool's deeper build/render path fires live API requests to the Bun
 * diffusion server (get_diffusion_info / get_diffusion_status / list_processes)
 * and needs a host section with diffusion targets, neither of which is available
 * in the headless harness. This suite therefore asserts the reliable, fixture-free
 * contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_diffusion} from '../../../tools/tool_diffusion/js/tool_diffusion.js'



describe('TOOL_DIFFUSION CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_diffusion, 'function', 'expected tool_diffusion to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_diffusion()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.caller, null, 'expected caller null')
		// tool-specific null-seeded state
		assert.equal(instance.diffusion_info, null, 'expected diffusion_info null')
		assert.equal(instance.bun_status, null, 'expected bun_status null')
		// optional options object seeded by the constructor
		assert.equal(typeof instance.additions_options, 'object', 'expected additions_options object')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_diffusion.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_diffusion.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_diffusion.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_diffusion
		assert.equal(typeof tool_diffusion.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_diffusion.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_diffusion.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_diffusion.prototype.get_diffusion_info, 'function', 'expected get_diffusion_info defined')
		assert.equal(typeof tool_diffusion.prototype.export, 'function', 'expected export defined')
		assert.equal(typeof tool_diffusion.prototype.get_active_processes, 'function', 'expected get_active_processes defined')
		assert.equal(typeof tool_diffusion.prototype.on_close_actions, 'function', 'expected on_close_actions defined')
		assert.equal(typeof tool_diffusion.prototype.get_diffusion_status, 'function', 'expected get_diffusion_status defined')
		assert.equal(typeof tool_diffusion.prototype.retry_pending_deletions, 'function', 'expected retry_pending_deletions defined')
	})

})

// @license-end
