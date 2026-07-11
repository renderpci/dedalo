// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_IMPORT_DEDALO_CSV
 * Client-side coverage for the Dédalo CSV bulk-import tool.
 *
 * The tool's deeper build/render path needs a host section, a service_upload
 * child instance and live API round-trips (get_csv_files, etc.), none of which
 * are guaranteed in the headless harness. This suite therefore asserts the
 * reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_import_dedalo_csv} from '../../../tools/tool_import_dedalo_csv/js/tool_import_dedalo_csv.js'



describe('TOOL_IMPORT_DEDALO_CSV CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_import_dedalo_csv, 'function', 'expected tool_import_dedalo_csv to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_import_dedalo_csv()

		assert.equal(typeof instance, 'object', 'expected instance to be an object')
		// documented null-seeded common properties
		assert.equal(instance.id, null, 'expected id null')
		assert.equal(instance.model, null, 'expected model null')
		assert.equal(instance.mode, null, 'expected mode null')
		assert.equal(instance.node, null, 'expected node null')
		assert.equal(instance.ar_instances, null, 'expected ar_instances null')
		assert.equal(instance.events_tokens, null, 'expected events_tokens null')
		assert.equal(instance.status, null, 'expected status null')
		assert.equal(instance.caller, null, 'expected caller null')
		// tool-specific null-seeded property
		assert.equal(instance.csv_files_list, null, 'expected csv_files_list null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_import_dedalo_csv.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_import_dedalo_csv.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_import_dedalo_csv.prototype.refresh, 'function', 'expected refresh wired')
		// render modes delegated to render_tool_import_dedalo_csv
		assert.equal(typeof tool_import_dedalo_csv.prototype.edit, 'function', 'expected edit wired')
		assert.equal(typeof tool_import_dedalo_csv.prototype.upload_done, 'function', 'expected upload_done wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_import_dedalo_csv.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_import_dedalo_csv.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_import_dedalo_csv.prototype.load_csv_files_list, 'function', 'expected load_csv_files_list defined')
		assert.equal(typeof tool_import_dedalo_csv.prototype.remove_file, 'function', 'expected remove_file defined')
		assert.equal(typeof tool_import_dedalo_csv.prototype.import_files, 'function', 'expected import_files defined')
		assert.equal(typeof tool_import_dedalo_csv.prototype.get_section_components_list, 'function', 'expected get_section_components_list defined')
		assert.equal(typeof tool_import_dedalo_csv.prototype.process_uploaded_file, 'function', 'expected process_uploaded_file defined')
	})

})

// @license-end
