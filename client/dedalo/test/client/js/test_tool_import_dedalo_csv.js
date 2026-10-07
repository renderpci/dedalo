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

import * as render_module from '../../../tools/tool_import_dedalo_csv/js/render_tool_import_dedalo_csv.js'
import {
	import_mode_allowed,
	render_columns_mapper
} from '../../../tools/tool_import_dedalo_csv/js/render_tool_import_dedalo_csv.js'
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



describe('TOOL_IMPORT_DEDALO_CSV APPEND MODE SELECTOR', function() {

	this.timeout(10000)

	// a stub component list, as get_section_components_list answers it
	const components = [
		{label: 'Id', value: 'test102', model: 'component_section_id', import_append: null},
		{label: 'Portal', value: 'test80', model: 'component_portal', import_append: 'items'},
		{label: 'Geo', value: 'test100', model: 'component_geolocation', import_append: 'geo_layer'},
		{label: 'Select', value: 'test91', model: 'component_select', import_append: null},
		{label: 'Created', value: 'dd199', model: 'component_date', import_append: 'items'}
	]

	const build = async function() {
		const self = {
			get_section_components_list	: async () => ({label: 'Test', list: components}),
			get_tool_label				: () => null,
			csv_files_list				: []
		}
		const item = {
			file_info		: ['section_id', 'test80', 'test100', 'test91', 'dd199'],
			section_tipo	: 'test3',
			ar_columns_map	: [],
			sample_data		: []
		}
		self.csv_files_list.push({checked: true, ar_columns_map: item.ar_columns_map})
		const container = document.createElement('div')
		container.appendChild(await render_columns_mapper(self, item))
		const lines = [...container.querySelectorAll('.columns_mapper_line:not(.names)')]
		return {self, item, lines}
	}
	const mode_select = (line) => line.querySelector('.import_mode_container select.import_mode_select')
	const change = (node, value) => {
		node.value = value
		node.dispatchEvent(new Event('change'))
	}

	it('import_mode_allowed: a policy on a regular column only', function() {
		assert.equal(import_mode_allowed({tipo: 'test80', map_to: 'test80', model: 'component_portal'}, 'items'), true)
		assert.equal(import_mode_allowed({tipo: 'test100', map_to: 'test100', model: 'component_geolocation'}, 'geo_layer'), true)
		assert.equal(import_mode_allowed({tipo: 'test91', map_to: 'test91', model: 'component_select'}, null), false)
		assert.equal(import_mode_allowed({tipo: 'section_id', map_to: 'test102', model: 'component_section_id'}, 'items'), false)
		assert.equal(import_mode_allowed({tipo: 'x', map_to: 'x', model: 'section_id'}, 'items'), false)
		assert.equal(import_mode_allowed({tipo: 'dd199', map_to: 'dd199', model: 'component_date'}, 'items'), false)
		assert.equal(import_mode_allowed(null, 'items'), false)
	})

	it('the selector renders only where append is allowed; geolocation says "Add as new layer"', async function() {
		const {item, lines} = await build()
		assert.equal(lines.length, 5)
		assert.equal(mode_select(lines[0]), null, 'section_id: no selector')
		assert.notEqual(mode_select(lines[1]), null, 'portal: selector')
		assert.notEqual(mode_select(lines[2]), null, 'geolocation: selector')
		assert.equal(mode_select(lines[3]), null, 'select (policy null): no selector')
		assert.equal(mode_select(lines[4]), null, 'audit dd199: no selector')
		assert.equal(item.ar_columns_map[1].import_mode, 'replace')
		assert.equal(item.ar_columns_map[3].import_mode, undefined)
		const geo_options = [...mode_select(lines[2]).options].map(o => o.textContent)
		assert.include(geo_options, 'Add as new layer')
		const portal_options = [...mode_select(lines[1]).options].map(o => o.textContent)
		assert.include(portal_options, 'Append')
	})

	it('the choice is written to ar_columns_map and reset on a target change', async function() {
		const {item, lines} = await build()
		change(mode_select(lines[1]), 'append')
		assert.equal(item.ar_columns_map[1].import_mode, 'append')

		// a new target whose model refuses append: the selector goes, the mode is dropped
		change(lines[1].querySelector('select.column_select'), 'test91')
		assert.equal(mode_select(lines[1]), null)
		assert.equal(item.ar_columns_map[1].import_mode, undefined)

		// a new target that appends: the selector comes back at the default
		change(lines[3].querySelector('select.column_select'), 'test80')
		assert.notEqual(mode_select(lines[3]), null)
		assert.equal(item.ar_columns_map[3].import_mode, 'replace')
	})

	it('no time-machine switch and no TM-off warning: every import is revertible (D1)', function() {
		// WC-2026-09-27-bulk-revert-undo-log: a save under a bulk id always writes
		// its undo pair, so the opt-out and the warning it needed are gone. A
		// resurrected export would mean the switch came back.
		assert.equal(render_module.update_append_tm_warning, undefined, 'update_append_tm_warning must stay removed')
		// import_files takes the file list only (no time_machine_save argument)
		assert.equal(tool_import_dedalo_csv.prototype.import_files.length, 1, 'import_files(files)')
	})

	it('a re-render (section_tipo change) drops a refused append and keeps a preserved one', async function() {
		const {self, item, lines} = await build()
		change(mode_select(lines[1]), 'append')
		assert.equal(item.ar_columns_map[1].import_mode, 'append')

		// the new section refuses append on the portal: its mode is dropped
		const refusing = components.map(c => ({...c, import_append: null}))
		self.get_section_components_list = async () => ({label: 'Other', list: refusing})
		await render_columns_mapper(self, item)
		assert.equal(item.ar_columns_map[1].import_mode, undefined)

		// the reverse: a preserved 'append' on a re-matched column survives
		item.ar_columns_map[1].import_mode = 'append'
		self.get_section_components_list = async () => ({label: 'Test', list: components})
		await render_columns_mapper(self, item)
		assert.equal(item.ar_columns_map[1].import_mode, 'append')
	})

})

describe('TOOL_IMPORT_DEDALO_CSV SECTION-INFO COLUMNS', function() {

	this.timeout(10000)

	// get_section_components_list now appends dd196's children (the common
	// section-info components) after the section's own — for a global admin.
	// An exported CSV carries them as plain tipo headers (dd200) or suffixed
	// ones (dd199_dmy); both must be AUTO-checked and mapped, or the operator
	// re-maps every audit column by hand (the reported bug).
	const components = [
		{label: 'Id', value: 'test102', model: 'component_section_id', import_append: null},
		{label: 'Text', value: 'test52', model: 'component_input_text', import_append: 'items'},
		{label: 'Created by', value: 'dd200', model: 'component_select', import_append: null},
		{label: 'Created', value: 'dd199', model: 'component_date', import_append: null}
	]

	const build = async function(list) {
		const self = {
			get_section_components_list	: async () => ({label: 'Test', list}),
			get_tool_label				: () => null,
			csv_files_list				: []
		}
		const item = {
			file_info		: ['section_id', 'test52', 'dd200', 'dd199_dmy'],
			section_tipo	: 'test3',
			ar_columns_map	: [],
			sample_data		: []
		}
		self.csv_files_list.push({checked: true, ar_columns_map: item.ar_columns_map})
		const container = document.createElement('div')
		container.appendChild(await render_columns_mapper(self, item))
		const lines = [...container.querySelectorAll('.columns_mapper_line:not(.names)')]
		return {item, lines}
	}
	const checkbox = (line) => line.querySelector('input[type="checkbox"]')
	const target = (line) => line.querySelector('select.column_select')

	it('a dd200 header and a dd199_dmy header are auto-checked and mapped', async function() {
		const {item, lines} = await build(components)
		assert.equal(lines.length, 4)
		assert.equal(checkbox(lines[2]).checked, true, 'dd200: checked')
		assert.equal(target(lines[2]).value, 'dd200', 'dd200: selected in the dropdown')
		assert.equal(item.ar_columns_map[2].checked, true)
		assert.equal(item.ar_columns_map[2].map_to, 'dd200')
		assert.equal(item.ar_columns_map[2].model, 'component_select')
		assert.equal(checkbox(lines[3]).checked, true, 'dd199_dmy: checked')
		assert.equal(item.ar_columns_map[3].map_to, 'dd199')
	})

	it('without them in the list (the old server answer) the same headers stay unmapped', async function() {
		// the control: proves the assertions above are about the list, not the header
		const {item, lines} = await build(components.filter(c => !c.value.startsWith('dd')))
		assert.equal(checkbox(lines[2]).checked, false, 'dd200: unchecked')
		assert.notEqual(item.ar_columns_map[2].checked, true)
		assert.equal(item.ar_columns_map[2].map_to, undefined)
		assert.equal(checkbox(lines[3]).checked, false, 'dd199_dmy: unchecked')
	})

})

// @license-end
