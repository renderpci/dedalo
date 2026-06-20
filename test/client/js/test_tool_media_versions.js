// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_MEDIA_VERSIONS
 * Client-side coverage for the media-version management tool.
 *
 * The tool's deeper build/render path needs a host section with a live media
 * component (component_av / component_image / component_pdf) plus a running tool
 * context API, none of which is guaranteed in the headless harness. This suite
 * therefore asserts the reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_media_versions} from '../../../tools/tool_media_versions/js/tool_media_versions.js'



describe('TOOL_MEDIA_VERSIONS CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_media_versions, 'function', 'expected tool_media_versions to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_media_versions()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common + tool-specific properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.events_tokens, null, 'expected events_tokens null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.main_element, null, 'expected main_element null')
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.timer, null, 'expected timer null')
		assert.equal(instance.main_element_quality, null, 'expected main_element_quality null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_media_versions.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_media_versions.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_media_versions.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_media_versions
		assert.equal(typeof tool_media_versions.prototype.edit, 'function', 'expected edit wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_media_versions.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_media_versions.prototype.build, 'function', 'expected build defined')
		// tool-specific API client methods
		assert.equal(typeof tool_media_versions.prototype.get_files_info, 'function', 'expected get_files_info defined')
		assert.equal(typeof tool_media_versions.prototype.delete_quality, 'function', 'expected delete_quality defined')
		assert.equal(typeof tool_media_versions.prototype.build_version, 'function', 'expected build_version defined')
		assert.equal(typeof tool_media_versions.prototype.conform_headers, 'function', 'expected conform_headers defined')
		assert.equal(typeof tool_media_versions.prototype.rotate, 'function', 'expected rotate defined')
		assert.equal(typeof tool_media_versions.prototype.sync_files, 'function', 'expected sync_files defined')
		assert.equal(typeof tool_media_versions.prototype.delete_version, 'function', 'expected delete_version defined')
	})

})

// @license-end
