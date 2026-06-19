// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

/**
 * TEST_TOOL_EXPORT
 * Client-side coverage for the data-export tool.
 *
 * The tool's deeper init/build/render path needs a live caller section (it reads
 * `self.caller.rqo.sqo`, calls `self.caller.build(true)`, and streams NDJSON from
 * dd_tools_api), plus the lazily-imported SheetJS vendor library for XLSX export,
 * neither of which is guaranteed in the headless harness. This suite therefore
 * asserts the reliable, fixture-free contract that every tool shares:
 *   - the module exports a constructor named exactly as its model,
 *   - construction seeds the documented instance properties,
 *   - the prototype is wired with the common + tool-specific lifecycle methods.
 *
 * This is the locked client template (layer 1: module-load + construct + wiring).
 */

import {tool_export} from '../../../tools/tool_export/js/tool_export.js'



describe('TOOL_EXPORT CLIENT TEST', function() {

	this.timeout(10000)

	it('module exports the tool constructor', function() {
		assert.equal(typeof tool_export, 'function', 'expected tool_export to be a constructor function')
	})

	it('construct seeds the documented instance properties', function() {
		const instance = new tool_export()

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
		assert.equal(instance.caller, null, 'expected caller null')
		assert.equal(instance.data_format, null, 'expected data_format null')
	})

	it('prototype is wired with the lifecycle methods', function() {
		// common lifecycle delegated from tool_common / common
		assert.equal(typeof tool_export.prototype.render, 'function', 'expected render wired')
		assert.equal(typeof tool_export.prototype.destroy, 'function', 'expected destroy wired')
		assert.equal(typeof tool_export.prototype.refresh, 'function', 'expected refresh wired')
		// render mode delegated to render_tool_export
		assert.equal(typeof tool_export.prototype.edit, 'function', 'expected edit wired')
		assert.equal(typeof tool_export.prototype.build_export_component, 'function', 'expected build_export_component wired')
		assert.equal(typeof tool_export.prototype.sync_ar_ddo_to_export, 'function', 'expected sync_ar_ddo_to_export wired')
		// section element helpers delegated from common
		assert.equal(typeof tool_export.prototype.get_section_elements_context, 'function', 'expected get_section_elements_context wired')
		assert.equal(typeof tool_export.prototype.calculate_component_path, 'function', 'expected calculate_component_path wired')
		// drag-and-drop handlers
		assert.equal(typeof tool_export.prototype.on_dragstart, 'function', 'expected on_dragstart wired')
		assert.equal(typeof tool_export.prototype.on_dragover, 'function', 'expected on_dragover wired')
		assert.equal(typeof tool_export.prototype.on_dragleave, 'function', 'expected on_dragleave wired')
		assert.equal(typeof tool_export.prototype.on_drop, 'function', 'expected on_drop wired')
		// tool-specific overrides defined on the module
		assert.equal(typeof tool_export.prototype.init, 'function', 'expected init defined')
		assert.equal(typeof tool_export.prototype.build, 'function', 'expected build defined')
		assert.equal(typeof tool_export.prototype.get_section_id, 'function', 'expected get_section_id defined')
		assert.equal(typeof tool_export.prototype.get_export_grid, 'function', 'expected get_export_grid defined')
		assert.equal(typeof tool_export.prototype.get_export_xsl, 'function', 'expected get_export_xsl defined')
		assert.equal(typeof tool_export.prototype.export_table_with_xlsx_lib, 'function', 'expected export_table_with_xlsx_lib defined')
		assert.equal(typeof tool_export.prototype.on_close_actions, 'function', 'expected on_close_actions defined')
		assert.equal(typeof tool_export.prototype.update_local_db_data, 'function', 'expected update_local_db_data defined')
		assert.equal(typeof tool_export.prototype.compose_id, 'function', 'expected compose_id defined')
	})

})

// @license-end
