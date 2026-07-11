// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_TOOL_TRANSCRIPTION
 * Client-side coverage for the transcription tool.
 *
 * The tool's deeper render/open path needs a host section with a configured
 * media + text_area ddo_map, plus the lazily-imported Whisper Web Worker
 * (browser_whisper.js) and WebGPU/WASM runtime, none of which are guaranteed in
 * the headless harness. This suite therefore asserts the reliable, fixture-free
 * contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_transcription} from '../../../tools/tool_transcription/js/tool_transcription.js'



describe('TOOL_TRANSCRIPTION CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_transcription, 'function', 'expected tool_transcription to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_transcription()

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
		assert.equal(instance.media_component, null, 'expected media_component null')
		assert.equal(instance.transcription_component, null, 'expected transcription_component null')
		assert.equal(instance.relation_list, null, 'expected relation_list null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_transcription.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_transcription.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_transcription.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_transcription
		assert.equal(typeof tool_transcription.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_transcription.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_transcription.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_transcription.prototype.load_relation_list, 'function', 'expected load_relation_list defined')
		assert.equal(typeof tool_transcription.prototype.get_user_tools, 'function', 'expected get_user_tools defined')
		assert.equal(typeof tool_transcription.prototype.build_subtitles_file, 'function', 'expected build_subtitles_file defined')
		assert.equal(typeof tool_transcription.prototype.automatic_transcription, 'function', 'expected automatic_transcription defined')
		assert.equal(typeof tool_transcription.prototype.automatic_transcription_server, 'function', 'expected automatic_transcription_server defined')
		assert.equal(typeof tool_transcription.prototype.check_server_transcriber_status, 'function', 'expected check_server_transcriber_status defined')
	})

})

// @license-end
