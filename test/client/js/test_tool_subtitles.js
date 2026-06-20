// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_SUBTITLES
 * Client-side coverage for the subtitles editing tool.
 *
 * The tool's deeper build/render/open path binds three live components resolved
 * from tool_config.ddo_map (transcription_component, media_component,
 * subtitles_component) plus the lazily-wired service_ckeditor, none of which is
 * guaranteed in the headless harness. This suite therefore asserts the reliable,
 * fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_subtitles} from '../../../tools/tool_subtitles/js/tool_subtitles.js'



describe('TOOL_SUBTITLES CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_subtitles, 'function', 'expected tool_subtitles to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_subtitles()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.type, null, 'expected type null')
		assert.equal(instance.source_lang, null, 'expected source_lang null')
		assert.equal(instance.target_lang, null, 'expected target_lang null')
		assert.equal(instance.langs, null, 'expected langs null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.transcription_component, null, 'expected transcription_component null')
		assert.equal(instance.media_component, null, 'expected media_component null')
		assert.equal(instance.subtitles_component, null, 'expected subtitles_component null')
		assert.equal(instance.relation_list, null, 'expected relation_list null')
		assert.equal(instance.service_text_editor, null, 'expected service_text_editor null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_subtitles.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_subtitles.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_subtitles.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_subtitles
		assert.equal(typeof tool_subtitles.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_subtitles.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_subtitles.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_subtitles.prototype.get_component, 'function', 'expected get_component defined')
		assert.equal(typeof tool_subtitles.prototype.get_subtitles_data, 'function', 'expected get_subtitles_data defined')
		assert.equal(typeof tool_subtitles.prototype.get_user_tools, 'function', 'expected get_user_tools defined')
		assert.equal(typeof tool_subtitles.prototype.save_value, 'function', 'expected save_value defined')
		assert.equal(typeof tool_subtitles.prototype.build_subtitles, 'function', 'expected build_subtitles defined')
	})

})

// @license-end
