// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_IMPORT_ZOTERO
 * Client-side coverage for the Zotero bibliographic-import tool.
 *
 * The tool's deeper build/render path needs a live caller section plus the
 * service_dropzone and service_tmp_section instances, none of which are
 * guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_import_zotero} from '../../../tools/tool_import_zotero/js/tool_import_zotero.js'



describe('TOOL_IMPORT_ZOTERO CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_import_zotero, 'function', 'expected tool_import_zotero to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_import_zotero()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.key_dir, null, 'expected key_dir null')
		assert.equal(instance.service_dropzone, null, 'expected service_dropzone null')
		assert.equal(instance.service_tmp_section, null, 'expected service_tmp_section null')
		// files_data is seeded as an empty array
		assert.ok(Array.isArray(instance.files_data), 'expected files_data to be an array')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_import_zotero.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_import_zotero.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_import_zotero.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_import_zotero
		assert.equal(typeof tool_import_zotero.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_import_zotero.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_import_zotero.prototype.build, 'function', 'expected build defined')
	})

})

// @license-end
