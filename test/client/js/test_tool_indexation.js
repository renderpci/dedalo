// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_INDEXATION
 * Client-side coverage for the indexation tool.
 *
 * The tool's deeper init/build/render path needs a host section with a configured
 * tool_config ddo_map (transcription_component, indexing_component, area_thesaurus,
 * etc.), live component/section instances and event_manager subscriptions, none of
 * which is guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_indexation} from '../../../tools/tool_indexation/js/tool_indexation.js'



describe('TOOL_INDEXATION CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_indexation, 'function', 'expected tool_indexation to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_indexation()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.transcription_component, null, 'expected transcription_component null')
		assert.equal(instance.indexing_component, null, 'expected indexing_component null')
		assert.equal(instance.related_sections_list, null, 'expected related_sections_list null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_indexation.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_indexation.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_indexation.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_indexation
		assert.equal(typeof tool_indexation.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_indexation.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_indexation.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_indexation.prototype.get_component, 'function', 'expected get_component defined')
		assert.equal(typeof tool_indexation.prototype.load_related_sections_list, 'function', 'expected load_related_sections_list defined')
		assert.equal(typeof tool_indexation.prototype.active_value, 'function', 'expected active_value defined')
		assert.equal(typeof tool_indexation.prototype.update_active_values, 'function', 'expected update_active_values defined')
		assert.equal(typeof tool_indexation.prototype.delete_tag, 'function', 'expected delete_tag defined')
		// tag_note mixin methods
		assert.equal(typeof tool_indexation.prototype.render_indexation_note, 'function', 'expected render_indexation_note wired')
		assert.equal(typeof tool_indexation.prototype.render_empty_note, 'function', 'expected render_empty_note wired')
		assert.equal(typeof tool_indexation.prototype.render_note, 'function', 'expected render_note wired')
		assert.equal(typeof tool_indexation.prototype.new_tag_note, 'function', 'expected new_tag_note wired')
	})

})

// @license-end
