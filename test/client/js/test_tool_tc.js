// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_TC
 * Client-side coverage for the timecode-offset tool.
 *
 * The tool's deeper render/open path needs a host section of type rsc36 with a
 * configured transcription component plus a live caller carrying section_tipo /
 * section_id / lang, none of which is guaranteed in the headless harness. This
 * suite therefore asserts the reliable, fixture-free contract that every tool
 * shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_tc} from '../../../tools/tool_tc/js/tool_tc.js'



describe('TOOL_TC CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_tc, 'function', 'expected tool_tc to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_tc()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.type, null, 'expected type null')
		// tool-specific null-seeded properties
		assert.equal(instance.source_lang, null, 'expected source_lang null')
		assert.equal(instance.langs, null, 'expected langs null')
		assert.equal(instance.caller, null, 'expected caller null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_tc.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_tc.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_tc.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_tc
		assert.equal(typeof tool_tc.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_tc.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_tc.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_tc.prototype.get_component, 'function', 'expected get_component defined')
		assert.equal(typeof tool_tc.prototype.change_all_time_codes, 'function', 'expected change_all_time_codes defined')
	})

})

// @license-end
