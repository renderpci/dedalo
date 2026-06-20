// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_UPLOAD
 * Client-side coverage for the file-upload tool.
 *
 * The tool's deeper build/render path instantiates a live `service_upload`
 * child (drag-and-drop file picker) and needs a host section with a configured
 * upload caller plus a real browser file dialog, none of which is guaranteed in
 * the headless harness. This suite therefore asserts the reliable, fixture-free
 * contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_upload} from '../../../tools/tool_upload/js/tool_upload.js'



describe('TOOL_UPLOAD CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_upload, 'function', 'expected tool_upload to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_upload()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.events_tokens, null, 'expected events_tokens null')
		assert.equal(instance.type, null, 'expected type null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.service_upload, null, 'expected service_upload null')
		assert.equal(instance.max_size_bytes, null, 'expected max_size_bytes null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_upload.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_upload.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_upload.prototype.refresh, 'function', 'expected refresh wired')
		// render modes delegated to render_tool_upload
		assert.equal(typeof tool_upload.prototype.edit, 'function', 'expected edit wired')
		assert.equal(typeof tool_upload.prototype.list, 'function', 'expected list wired')
		assert.equal(typeof tool_upload.prototype.mini, 'function', 'expected mini wired')
		assert.equal(typeof tool_upload.prototype.upload_done, 'function', 'expected upload_done wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_upload.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_upload.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_upload.prototype.process_uploaded_file_controller, 'function', 'expected process_uploaded_file_controller defined')
	})

})

// @license-end
