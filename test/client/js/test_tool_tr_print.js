// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_TR_PRINT
 * Client-side coverage for the transcription print tool.
 *
 * The tool's deeper render/open path needs a host section with a live
 * component_text_area (the transcription component), the caller instance, and
 * page_globals.dedalo_projects_default_langs, none of which is guaranteed in the
 * headless harness. This suite therefore asserts the reliable, fixture-free
 * contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_tr_print} from '../../../tools/tool_tr_print/js/tool_tr_print.js'



describe('TOOL_TR_PRINT CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_tr_print, 'function', 'expected tool_tr_print to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_tr_print()

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
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_tr_print.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_tr_print.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_tr_print.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_tr_print
		assert.equal(typeof tool_tr_print.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_tr_print.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_tr_print.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_tr_print.prototype.load_relation_list, 'function', 'expected load_relation_list defined')
		assert.equal(typeof tool_tr_print.prototype.tags_to_html, 'function', 'expected tags_to_html defined')
		assert.equal(typeof tool_tr_print.prototype.build_subtitles, 'function', 'expected build_subtitles defined')
	})

})

// @license-end
