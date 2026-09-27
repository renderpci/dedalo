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

import {
	import_mode_allowed,
	render_columns_mapper,
	update_append_tm_warning
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
		const tm_checkbox = document.createElement('input')
		tm_checkbox.type = 'checkbox'
		tm_checkbox.checked = false
		const self = {
			get_section_components_list	: async () => ({label: 'Test', list: components}),
			get_tool_label				: () => null,
			append_tm_warning			: (() => { const node = document.createElement('div'); node.classList.add('hide'); return node })(),
			checkbox_time_machine_save	: tm_checkbox,
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

	it('the time-machine-off warning follows the append columns and the checkbox', async function() {
		const {self, lines} = await build()
		assert.isTrue(self.append_tm_warning.classList.contains('hide'))
		change(mode_select(lines[1]), 'append')
		assert.isFalse(self.append_tm_warning.classList.contains('hide'), 'append + TM off: warn')
		self.checkbox_time_machine_save.checked = true
		assert.equal(update_append_tm_warning(self), false)
		assert.isTrue(self.append_tm_warning.classList.contains('hide'), 'TM on: no warning')
		self.checkbox_time_machine_save.checked = false
		change(mode_select(lines[1]), 'replace')
		assert.equal(update_append_tm_warning(self), false, 'no append column: no warning')
	})

	it('a re-render (section_tipo change) re-syncs the time-machine-off warning', async function() {
		const {self, item, lines} = await build()
		change(mode_select(lines[1]), 'append')
		assert.isFalse(self.append_tm_warning.classList.contains('hide'), 'append + TM off: warn')

		// the new section refuses append on the portal: its mode is dropped, the warning goes
		const refusing = components.map(c => ({...c, import_append: null}))
		self.get_section_components_list = async () => ({label: 'Other', list: refusing})
		await render_columns_mapper(self, item)
		assert.equal(item.ar_columns_map[1].import_mode, undefined)
		assert.isTrue(self.append_tm_warning.classList.contains('hide'), 'no append column left: no warning')

		// the reverse: a preserved 'append' on a re-matched column shows the warning at once
		item.ar_columns_map[1].import_mode = 'append'
		self.get_section_components_list = async () => ({label: 'Test', list: components})
		await render_columns_mapper(self, item)
		assert.equal(item.ar_columns_map[1].import_mode, 'append')
		assert.isFalse(self.append_tm_warning.classList.contains('hide'), 'preserved append + TM off: warn')
	})

})

// @license-end
