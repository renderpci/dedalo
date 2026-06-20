// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_USER_ADMIN
 * Client-side coverage for the self-service user-profile editor tool.
 *
 * The tool's deeper render/open path needs a live caller plus a built dd128
 * (users) section scoped to page_globals.user_id and the live component
 * instances of the ddo_map, none of which are guaranteed in the headless
 * harness. This suite therefore asserts the reliable, fixture-free contract
 * that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_user_admin} from '../../../tools/tool_user_admin/js/tool_user_admin.js'



describe('TOOL_USER_ADMIN CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_user_admin, 'function', 'expected tool_user_admin to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_user_admin()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.caller, null, 'expected caller null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_user_admin.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_user_admin.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_user_admin.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_user_admin
		assert.equal(typeof tool_user_admin.prototype.edit, 'function', 'expected edit wired')
		assert.equal(typeof tool_user_admin.prototype.list, 'function', 'expected list wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_user_admin.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_user_admin.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_user_admin.prototype.get_component, 'function', 'expected get_component defined')
		assert.equal(typeof tool_user_admin.prototype.get_ddo_map, 'function', 'expected get_ddo_map defined')
		assert.equal(typeof tool_user_admin.prototype.build_user_section, 'function', 'expected build_user_section defined')
		assert.equal(typeof tool_user_admin.prototype.on_close_actions, 'function', 'expected on_close_actions defined')
	})

})

// @license-end
