// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_PRINT
 * Client-side coverage for the visual print-layout tool.
 *
 * The tool's deeper render/open path needs a live caller section (to build its
 * rqo / sqo), a resolved preview record and the lazily-imported flow/canvas
 * engine, none of which is guaranteed in the headless harness. This suite
 * therefore asserts the reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_print} from '../../../tools/tool_print/js/tool_print.js'



describe('TOOL_PRINT CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_print, 'function', 'expected tool_print to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_print()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.source, null, 'expected source null')
		assert.equal(instance.sqo, null, 'expected sqo null')
		assert.equal(instance.target_section_tipo, null, 'expected target_section_tipo null')
		assert.equal(instance.preview_section_id, null, 'expected preview_section_id null')
		assert.equal(instance.layout, null, 'expected layout null')
		assert.equal(instance.print_root, null, 'expected print_root null')
		assert.equal(instance.canvas_container, null, 'expected canvas_container null')
		assert.equal(instance.current_template_id, null, 'expected current_template_id null')
		// documented non-null seeds
		assert.equal(instance.fill_mode, false, 'expected fill_mode false')
		assert.equal(instance.dirty, false, 'expected dirty false')
		assert.equal(instance.zoom, 1, 'expected zoom 1')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_print.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_print.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_print.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_print
		assert.equal(typeof tool_print.prototype.edit, 'function', 'expected edit wired')
		// reused common helpers
		assert.equal(typeof tool_print.prototype.get_section_elements_context, 'function', 'expected get_section_elements_context wired')
		assert.equal(typeof tool_print.prototype.calculate_component_path, 'function', 'expected calculate_component_path wired')
		assert.equal(typeof tool_print.prototype.on_dragstart, 'function', 'expected on_dragstart wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_print.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_print.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_print.prototype.get_section_id, 'function', 'expected get_section_id defined')
		assert.equal(typeof tool_print.prototype.get_record_ids, 'function', 'expected get_record_ids defined')
		assert.equal(typeof tool_print.prototype.mark_dirty, 'function', 'expected mark_dirty defined')
		assert.equal(typeof tool_print.prototype.on_close_actions, 'function', 'expected on_close_actions defined')
	})

})

// @license-end
