// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-unused-vars: "error"*/
/*global get_label, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {render_components_list} from '../../../core/common/js/render_common.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {dd_request_idle_callback, when_in_viewport} from '../../../core/common/js/events.js'
	import {downloadZip} from './lib/client-zip/index.js'
	import {
		presets_section_tipo,
		load_user_export_presets,
		create_new_export_preset,
		save_export_preset,
		edit_user_export_preset
	} from './export_user_presets.js'
	import {render_preset_modal, select_preset} from '../../../core/section/js/view_export_user_presets.js'



/**
* RENDER_TOOL_EXPORT
* Manages the component's logic and appearance in client side
*/
export const render_tool_export = function() {
}//end render_tool_export



/**
* RELATION_MODELS
* Mirror of component_relation_common::get_components_with_relations() (PHP).
* Used to decide which selected export components get the per-component
* 'parents' checkbox (ancestor chain export of their locator targets)
*/
const relation_models = new Set([
	'component_autocomplete',
	'component_autocomplete_hi',
	


	'component_relation_children',
	'component_relation_index',
	'component_relation_model',
	'component_relation_parent',


])



/**
* EDIT
* Render DOM nodes of the tool
* @param object options
* @return HTMLElement wrapper
*/
render_tool_export.prototype.edit = async function (options) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render_tool_export



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// grid_top
		const grid_top = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'grid_top no_print',
			parent			: fragment
		})

	// components_list_container (left side)
		const components_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_list_container',
			parent			: grid_top
		})
		self.components_list_container = components_list_container;
		// components_list. render section component list [left]
		const ar_components_exclude = ['component_password']
		const section_elements = await self.get_section_elements_context({
			section_tipo			: self.target_section_tipo,
			ar_components_exclude	: ar_components_exclude
		})
		// render_components_list (common shared render by render_common.js)
		const ar_components = render_components_list({
			self					: self,
			section_tipo			: self.target_section_tipo,
			target_div				: components_list_container,
			path					: [],
			section_elements		: self.section_elements,
			ar_components_exclude	: self.section_elements_components_exclude
		})

	// user_selection_list (right side)
		const selection_list_contaniner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'selection_list_contaniner',
			parent			: grid_top
		})
		self.selection_list_contaniner = selection_list_contaniner;
		// title
		ui.create_dom_element({
			element_type	: 'h1',
			class_name		: 'list_title',
			inner_html		: get_label.active_elements || 'Active elements',
			parent			: selection_list_contaniner
		})
		// user_selection_list
		const user_selection_list = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_selection_list',
			parent			: selection_list_contaniner
		})
		// store reference so user presets (apply_export_preset) can rebuild the selection
		self.user_selection_list = user_selection_list
		// empty_space
		const empty_space = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'empty_space',
			parent			: selection_list_contaniner
		})

		// empty_space drag and drop events
		empty_space.addEventListener('dragover', function(e){self.on_dragover(user_selection_list,e)})
		empty_space.addEventListener('dragleave', function(e){self.on_dragleave(this,e)})
		empty_space.addEventListener('drop', function(e){self.on_drop(user_selection_list,e)})

		// read saved ddo in local DB and restore elements if found
			const id = 'tool_export_config'
			data_manager.get_local_db_data(
				id,
				'data'
			)
			.then(function(response){
				const target_section_tipo = Array.isArray(self.target_section_tipo)
					? self.target_section_tipo[0]
					: self.target_section_tipo
				if (response?.value && response.value[target_section_tipo]) {
					// call for each saved ddo
					for (let i = 0; i < response.value[target_section_tipo].length; i++) {
						const ddo = response.value[target_section_tipo][i]
						self.build_export_component(ddo)
						.then((export_component_node)=>{
							// add DOM node
							user_selection_list.appendChild(export_component_node)
							// Update the ddo_export
							self.ar_ddo_to_export.push(ddo)
						})
					}
					if(SHOW_DEBUG===true) {
						console.log(`Added ddo items from saved local db ${target_section_tipo}. Items:`, response.value[target_section_tipo]);
					}
				}
			})

	// export_buttons_config
		const export_buttons_config = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_buttons_config',
			parent			: grid_top
		})

		// user presets (save/load export configurations per user, DB backed)
			render_presets_ui(self, export_buttons_config)

		// records info
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'records_info',
				parent			: export_buttons_config
			})
			ui.create_dom_element({
				element_type	: 'h1',
				class_name		: 'section_label',
				inner_html		: self.caller.label,
				parent			: export_buttons_config
			})
			const total_records_label = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'total_records_label',
				inner_html		: (get_label.total_records || 'Total records:') + ': ',
				parent			: export_buttons_config
			})
			const total_records = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'total_records',
				parent			: total_records_label
			})
			// section get total
			self.caller.get_total()
			.then(function(total){
				self.total_records = total;
				const locale		= 'es-ES' // (page_globals.locale ?? 'es-CL').replace('_', '-')
				const total_label	= new Intl.NumberFormat(locale, {}).format(total);
				total_records.insertAdjacentHTML('afterbegin', total_label)
			})

		// Progress Bar Container
		// Uses a dual-layer strategy for the "inverted color" text effect.
		// text_bg is dark and sits at the bottom.
		// text_fg is white and sits at the top, clipped dynamically to match the bar's progress.
			const progress_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'export_progress_container no_visible',
				parent			: export_buttons_config
			})
			// Background text (dark)
			const progress_text_bg = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'export_progress_text bg',
				parent			: progress_container
			})
			const progress_bar = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'export_progress_bar',
				parent			: progress_container
			})
			// Foreground text (white, will be clipped)
			const progress_text_fg = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'export_progress_text fg',
				parent			: progress_container
			})
			self.progress_ui = { container: progress_container, bar: progress_bar, text_bg: progress_text_bg, text_fg: progress_text_fg };

		// data_format selectors
			const data_format = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'data_format',
				inner_html		: (get_label.format || 'Format'),
				parent			: export_buttons_config
			})
			// select
				const select_data_format_export = ui.create_dom_element({
					element_type	: 'select',
					class_name		: 'select_data_format_export',
					parent			: data_format
				})
				const change_handler = () => {
					// fix value
					self.data_format = select_data_format_export.value
					// store to preserve across reloads
					localStorage.setItem('selected_data_format_export', select_data_format_export.value);
					// breakdown mode only applies to the breakdown format
					update_breakdown_state()
				}
				select_data_format_export.addEventListener('change', change_handler)

				// select_option_standard
				ui.create_dom_element({
					element_type	: 'option',
					inner_html		: get_label.standard || 'standard',
					value			: 'value',
					parent			: select_data_format_export
				})
				// select_option_breakdown
				ui.create_dom_element({
					element_type	: 'option',
					inner_html		: get_label.breakdown || 'Breakdown',
					value			: 'grid_value',
					parent			: select_data_format_export
				})
				// select_option_dedalo
				ui.create_dom_element({
					element_type	: 'option',
					inner_html		: 'Dédalo (Raw)',
					value			: 'dedalo_raw',
					parent			: select_data_format_export
				})

				// fix selector value (note: stored legacy 'standard' value maps to 'value')
				const stored_data_format = localStorage.getItem('selected_data_format_export')
				self.data_format = (stored_data_format && ['value','grid_value','dedalo_raw'].includes(stored_data_format))
					? stored_data_format
					: 'value'
				select_data_format_export.value = self.data_format

		// breakdown mode selector (relation explosion, only for the breakdown format)
			const breakdown_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'data_format breakdown_mode',
				inner_html		: (get_label.breakdown || 'Breakdown'),
				parent			: export_buttons_config
			})
			const select_breakdown_export = ui.create_dom_element({
				element_type	: 'select',
				class_name		: 'select_breakdown_export',
				parent			: breakdown_container
			})
			const breakdown_change_handler = () => {
				self.breakdown = select_breakdown_export.value
				localStorage.setItem('selected_breakdown_export', select_breakdown_export.value);
			}
			select_breakdown_export.addEventListener('change', breakdown_change_handler)

			// default: legacy semantics (first relation level rows, nested columns)
			ui.create_dom_element({
				element_type	: 'option',
				inner_html		: get_label.standard || 'Default',
				value			: 'default',
				parent			: select_breakdown_export
			})
			// rows: every relation item becomes an extra row
			ui.create_dom_element({
				element_type	: 'option',
				inner_html		: get_label.rows || 'Rows',
				value			: 'rows',
				parent			: select_breakdown_export
			})
			// columns: every relation item becomes extra columns (one row per record)
			ui.create_dom_element({
				element_type	: 'option',
				inner_html		: get_label.columns || 'Columns',
				value			: 'columns',
				parent			: select_breakdown_export
			})

			const stored_breakdown = localStorage.getItem('selected_breakdown_export')
			self.breakdown = (stored_breakdown && ['default','rows','columns'].includes(stored_breakdown))
				? stored_breakdown
				: 'default'
			select_breakdown_export.value = self.breakdown

			// enable the selector only when the breakdown format is active;
			// the parents checkbox applies to value/breakdown formats only
			// (dedalo_raw exports the dato as is)
			const update_breakdown_state = () => {
				select_breakdown_export.disabled = (self.data_format!=='grid_value')
				const parents_check = document.querySelector('.value_with_parents_check')
				if (parents_check) {
					parents_check.disabled = (self.data_format==='dedalo_raw')
				}
			}
			update_breakdown_state()

		// Options to check
			const options_to_check = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'options_to_check',
				parent			: export_buttons_config
			})
			// Fill the gaps check_box
				const fill_the_gaps_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'check_label fill_the_gaps',
					inner_html		: self.get_tool_label('fill_the_gaps') || 'Fill the gaps',
					parent			: options_to_check
				})
				const fill_the_gaps_check = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					class_name		: 'option_check_box fill_the_gaps_check',
					parent			: fill_the_gaps_node
				})
				fill_the_gaps_check.checked = true

			// show labels check_box
				const show_tipo_in_label = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'check_label show_tipo_in_label',
					inner_html		: self.get_tool_label('show_tipo_in_label') || 'Show ontology tipo',
					parent			: options_to_check
				})
				const show_tipo_in_label_check = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					class_name		: 'option_check_box show_tipo_in_label_check',
					parent			: show_tipo_in_label
				})

			// value_with_parents check_box. Export the ancestor chain of
			// relation targets (thesaurus/hierarchy, e.g. component_autocomplete_hi)
			// as sibling 'parents' columns. Default unchecked (disallow).
			// Not applicable to the dedalo_raw format (raw exports the dato as is).
				const value_with_parents_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'check_label value_with_parents',
					inner_html		: self.get_tool_label('value_with_parents') || 'Export parents',
					parent			: options_to_check
				})
				const value_with_parents_check = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					class_name		: 'option_check_box value_with_parents_check',
					parent			: value_with_parents_node
				})
				value_with_parents_check.checked	= false
				// initial state (update_breakdown_state ran before this node existed)
				value_with_parents_check.disabled	= (self.data_format==='dedalo_raw')

		// button_export
			const button_export = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'button_export table success',
				inner_html		: get_label.tool_export || 'Export',
				parent			: export_buttons_config
			})
			button_export.addEventListener('click', async function(e) {
				e.stopPropagation()

				// clean target_div
					while (export_data_container.hasChildNodes()) {
						export_data_container.removeChild(export_data_container.lastChild);
					}

				// clean response_container
					while (response_container.hasChildNodes()) {
						response_container.removeChild(response_container.lastChild);
					}

				// data_spinner add
					const data_spinner = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner',
						parent			: export_data_container
					});

				// styles
					[activate_all_columns, deactivate_all_columns].forEach(
						el => el?.classList.add('hide')
					)

				// spinner add
					const spinner = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner',
						parent			: export_buttons_config
					})
					const show_tipo_in_label	= show_tipo_in_label_check.checked;
					const fill_the_gaps			= fill_the_gaps_check.checked;
					const value_with_parents	= value_with_parents_check.checked;

				// loading class elements
					[button_export, components_list_container, selection_list_contaniner, export_buttons_options].forEach(
						el => el?.classList.add('loading')
					)

				// export_grid (flat table protocol)
					const export_grid_options = {
						data_format			: self.data_format,
						breakdown			: self.breakdown,
						ar_ddo_to_export	: self.ar_ddo_to_export,
						show_tipo_in_label	: show_tipo_in_label,
						fill_the_gaps		: fill_the_gaps,
						value_with_parents	: value_with_parents
					}
					const flat_table = await self.get_export_grid(export_grid_options)

					if (flat_table) {
						// mount the live preview table; streamed rows append into it
						const table_node = flat_table.render_table()
						export_data_container.appendChild(table_node)

						// media availability is recomputed when the stream ends:
						// breakdown columns (and their leaf models) can arrive mid-stream
						flat_table.on_end = () => {
							if (button_download_media) {
								self.media_components_in_data = get_media_models_in_data(self)
								const style_action = self.media_components_in_data.length ? 'remove' : 'add'
								button_download_media.classList[style_action]('loading')
							}
						}
					}else{
						response_container.innerHTML = 'No data to export'
					}

				// spinners remove
					if(data_spinner) {
						data_spinner.remove()
					}
					if(spinner) {
						spinner.remove()
					}

				// hide class remove
					[activate_all_columns, deactivate_all_columns].forEach(
						el => el?.classList.remove('hide')
					);

				// loading class elements
					[components_list_container, selection_list_contaniner].forEach(
						el => el?.classList.remove('loading')
					);
					// Note: export_buttons_options remains in loading state until stream finishes
			})
			self.button_export = button_export

		// response container
			const response_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'response_container',
				parent			: export_buttons_config
			})

		// activate_all_columns
			const activate_all_columns = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'activation light activate_all_columns',
				inner_html		: get_label.activate_all_columns || 'Activate all columns',
				parent			: export_buttons_config
			})
			activate_all_columns.addEventListener('click', function(e) {
				e.stopPropagation()

				const ar_components_length = ar_components.length
				for (let i = 0; i < ar_components_length; i++) {

					const item = ar_components[i]

					// short vars
						const path	= item.path
						const ddo	= item.ddo
						const id	= self.compose_id(ddo, path)

					// rebuild ddo
						const new_ddo = {
							id				: id,
							tipo			: ddo.tipo,
							section_tipo	: ddo.section_tipo,
							model			: ddo.model,
							parent			: ddo.parent,
							lang			: ddo.lang,
							mode			: ddo.mode,
							label			: ddo.label,
							value_with_parents	: false, // per-component parents export (checkbox in the item)
							path			: path // full path from current section replaces ddo single path
						}

					// exists
						const found = self.ar_ddo_to_export.find(el => el.id===new_ddo.id)
						if (found) {
							// Ignored already included item ddo
							continue;
						}

					// Build component html
						self.build_export_component(new_ddo)
						.then((export_component_node)=>{

							// add DOM node
							user_selection_list.appendChild(export_component_node)

							// Update the ddo_export list
							self.ar_ddo_to_export.push(new_ddo)

							// save local db data
							self.update_local_db_data()
						})
				}//end for (let i = 0; i < ar_components_length; i++)
			})

		// deactivate_all_columns
			const deactivate_all_columns = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'activation light deactivate_all_columns',
				inner_html		: get_label.disable_all_columns || 'Disable all columns',
				parent			: export_buttons_config
			})
			deactivate_all_columns.addEventListener('click', function(e) {
				e.stopPropagation()

				const close_buttons = user_selection_list.querySelectorAll('.close') || []
				const close_buttons_length = close_buttons.length
				for (let i = 0; i < close_buttons_length; i++) {
					const item = close_buttons[i]
					item.click()
				}
			})

	// download_buttons_options
		const export_buttons_options = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_buttons_options no_print loading',
			parent			: fragment
		})
		self.export_buttons_options = export_buttons_options;

		// filename base name
		const filename = 'export_' +self.caller.label +'_'+ new Date().toLocaleDateString()+'-'+ self.caller.section_tipo

		// csv. button_export_csv
			const button_export_csv = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success download',
				inner_html		: (get_label.download || 'Download') + ' CSV',
				parent			: export_buttons_options
			})
			button_export_csv.addEventListener('click', async function() {

				if (!self.flat_table) return

				// flat table to CSV (';' separated, RFC quoted)
					const csv_string = self.flat_table.to_delimited(';', true)

				// Download it
					const file	= filename + '.csv';
					const link	= document.createElement('a');
					link.style.display = 'none';
					link.setAttribute('target', '_blank');
					link.setAttribute('href', 'data	:text/csv;charset=utf-8,' + encodeURIComponent(csv_string));
					link.setAttribute('download', file);
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
			})

		// tsv. button_export_tsv
			const button_export_tsv = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success download',
				inner_html		: (get_label.download || 'Export') + ' TSV',
				parent			: export_buttons_options
			})
			button_export_tsv.addEventListener('click', async function() {

				if (!self.flat_table) return

				// flat table to TSV (tab separated, unquoted)
					const tsv_string = self.flat_table.to_delimited('\t', false)

				// Download it
					const file	= filename + '.tsv';
					const link	= document.createElement('a');
					link.style.display = 'none';
					link.setAttribute('target', '_blank');
					link.setAttribute('href', 'data	:text/tsv;charset=utf-8,' + encodeURIComponent(tsv_string));
					link.setAttribute('download', file);
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
			})

		// ods. button_export ODS Libre office
			const button_export_ods = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success download',
				inner_html		: (get_label.download || 'Export') + ' ODS',
				parent			: export_buttons_options
			})
			button_export_ods.addEventListener('click', async function() {

				if (!self.flat_table) return

				// Download it
					const file	= filename+ '.ods';

					// plain text-only table (sheetjs input)
					const table_export = self.flat_table.render_table({plain: true})

					self.export_table_with_xlsx_lib({
						table		: table_export,
						filename	: file
					})
			})

		// xlsx. button_export Excel
			const button_export_excel = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success download',
				inner_html		: (get_label.download || 'Export') + ' XLSX',
				parent			: export_buttons_options
			})
			button_export_excel.addEventListener('click', async function() {

				if (!self.flat_table) return

				// Download it
				const file	= filename+ '.xlsx';

				// plain text-only table (sheetjs input)
				const table_export = self.flat_table.render_table({plain: true})

				self.export_table_with_xlsx_lib({
					table		: table_export,
					filename	: file
				})
			})

		// html. button export html
			const button_export_html = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success download',
				inner_html		: (get_label.download || 'Export') + ' HTML',
				parent			: export_buttons_options
			})
			button_export_html.addEventListener('click', function() {

				// Download it
					const file	= filename + '.html';

					const html	= document.createElement('html');
					const head	= document.createElement('head');
					const meta	= document.createElement('meta');
					meta.setAttribute('charset', 'utf-8');
					const body	= document.createElement('body');

					html.appendChild(head);
					head.appendChild(meta);
					head.appendChild(body);
					body.appendChild(export_data_container);

					// Download it
					const link	= document.createElement('a');
					link.style.display = 'none';
					link.setAttribute('target', '_blank');
					link.setAttribute('href', 'data	:text/text;charset=utf-8,' + html.outerHTML);
					link.setAttribute('download', file);
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
			})

		// media. button download media (images, pdf, av, 3d, svg)
			const button_download_media = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success download loading',
				inner_html		: (get_label.download || 'Download') + ' media',
				parent			: export_buttons_options
			})
			const download_media_click_handler = (e) => {
				e.stopPropagation()
				e.target.blur()
				// modal with quality selection options
				render_download_modal(self)
			}
			button_download_media.addEventListener('click', download_media_click_handler)

		// print. button export print
			const button_export_print = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'processing_import success print',
				inner_html		: get_label.print || 'Print',
				parent			: export_buttons_options
			})
			button_export_print.addEventListener('click', function(e) {
				e.stopPropagation()
				e.preventDefault()
				window.print()
				return false;
			})

	// grid data container
		const export_data_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_data_container',
			parent			: fragment
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* RENDER_PRESETS_UI
* Builds the user export presets toolbar: a panel (hidden by default) holding
* the presets list plus 'New preset' / 'Save preset' buttons, and a toggle
* button that opens the panel and lazy-loads the list.
* Mirrors the search presets UI (core/search/js/render_search.js).
* @param object self - The tool_export instance
* @param HTMLElement parent
* @return HTMLElement presets_block
*/
const render_presets_ui = function(self, parent) {

	// presets_block. Themed, collapsible block placed at the top of the config column
		const presets_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_presets',
			parent			: parent
		})

	// header. Always visible: title + New + collapse toggle
		const presets_header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_presets_header',
			parent			: presets_block
		})
		// title
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'export_presets_title',
			inner_html		: get_label.presets_de_exportacion || 'Export presets',
			parent			: presets_header
		})
		// button_new_preset
		const button_add_preset = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'export_presets_new',
			inner_html		: '+',
			title			: get_label.new || 'New',
			parent			: presets_header
		})
		// toggle chevron (visual; the whole header is the click target)
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'export_presets_toggle',
			title			: get_label.preset || 'Presets',
			parent			: presets_header
		})

	// panel. Collapsible body: save button + presets list (collapsed by default)
		const presets_panel = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_presets_panel display_none',
			parent			: presets_block
		})
		self.export_presets_panel = presets_panel

		// button_save_preset (hidden until a preset is selected)
		const button_save_preset = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'export_presets_save button_save_preset hide',
			inner_html		: (get_label.save || 'Save') + ' ' + (get_label.changes || 'changes'),
			parent			: presets_panel
		})
		self.button_save_preset = button_save_preset

		// list container (the presets section list mounts here)
		const presets_list = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_presets_list',
			parent			: presets_panel
		})
		self.export_presets_list = presets_list

	// events

		// new preset
		button_add_preset.addEventListener('click', async (e) => {
			e.stopPropagation()

			// make sure the panel is open so the new preset is visible in the list
			open_export_presets(self)

			// create_new_export_preset (stores current config as the new preset)
			const section_id = await create_new_export_preset({
				self			: self,
				section_tipo	: presets_section_tipo
			})
			if (!section_id) {
				return
			}

			// launch the editor for name / public / default
			const section = await edit_user_export_preset(self, section_id)

			// open modal to edit the new preset
			render_preset_modal({
				caller		: section,
				section_id	: section_id,
				on_close	: async () => {

					// force refresh the presets list
					if (self.user_presets_section) {
						self.user_presets_section.total = null
						await self.user_presets_section.refresh()
					}

					// activate created preset (mark selected, do not re-apply)
					dd_request_idle_callback(
						() => {
							const button_apply = document.getElementById('apply_preset_' + section_id)
							if (button_apply) {
								select_preset({
									self			: self,
									section_id		: section_id,
									button_apply	: button_apply,
									load_preset		: false
								})
							}
						}
					)
				}
			})
		})

		// save current config to the selected preset
		button_save_preset.addEventListener('click', (e) => {
			e.stopPropagation()

			// check user_preset_section_id is already set
			if (!self.user_preset_section_id) {
				return
			}

			save_export_preset({
				self			: self,
				section_id		: self.user_preset_section_id,
				section_tipo	: presets_section_tipo
			})
			.then(function(response){
				if (response && response.result) {
					button_save_preset.classList.add('hide')
				}
			})
		})

		// toggle the panel (clicking anywhere on the header except the New button)
		presets_header.addEventListener('click', function(){
			toggle_export_presets(self)
		})


	return presets_block
}//end render_presets_ui



/**
* TOGGLE_EXPORT_PRESETS
* Shows or hides the export presets panel and lazy-loads the presets list on
* first open.
* @param object self - The tool_export instance
* @return promise bool
*/
const toggle_export_presets = async function(self) {

	const panel = self.export_presets_panel

	// validate
		if (!panel || !(panel instanceof HTMLElement)) {
			console.error('toggle_export_presets: panel not found or invalid');
			return
		}

	// close case
		if (!panel.classList.contains('display_none')) {
			panel.classList.add('display_none')
			self.export_presets_panel.parentNode?.classList.remove('open')
			return true
		}

	// open case
		await open_export_presets(self)


	return true
}//end toggle_export_presets



/**
* OPEN_EXPORT_PRESETS
* Opens the export presets panel and lazy-loads the presets list on first open.
* @param object self - The tool_export instance
* @return promise bool
*/
const open_export_presets = async function(self) {

	const panel	= self.export_presets_panel
	const list	= self.export_presets_list

	// validate
		if (!panel || !(panel instanceof HTMLElement)) {
			return false
		}

	// reveal panel
		panel.classList.remove('display_none')
		panel.parentNode?.classList.add('open')

	// load presets list on first open
		if (!self.user_presets_section && list) {

			// loading message
			const loading_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'export_presets_loading notes loading',
				inner_html		: (get_label.loading || 'Loading') + '..',
				parent			: list
			})

			self.user_presets_section = await load_user_export_presets(self)
			const user_presets_node = await self.user_presets_section.render()
			loading_node.remove()
			list.appendChild(user_presets_node)
		}


	return true
}//end open_export_presets



/**
* BUILD_EXPORT_COMPONENT
* Creates export_component DOM item
* @param object ddo
* @return HTMLElement export_component
*/
render_tool_export.prototype.build_export_component = async function(ddo) {

	const self = this

	// short vars
		const path = ddo.path

	// export_component container. Create DOM element before load html from trigger
		const export_component = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_component'
		})
		export_component.ddo = ddo
		do_sortable(export_component, self)

		// export_component component_label
			const label = path.map((el)=>{
				return el.name
			}).join(' > ')
			ui.create_dom_element({
				element_type	: 'li',
				class_name		: 'component_label',
				inner_html		: label + '<span> [' + ddo.tipo + '] ' + ddo.model + '</span>',
				parent			: export_component
			})

	// parents check (relation components only). Per-component override of the
	// global 'Export parents' option: exports the ancestor chain of this
	// component locator targets as a sibling 'parents' column. Persisted with
	// the ddo in the local DB config (update_local_db_data saves whole ddos).
		if (relation_models.has(ddo.model)) {
			const parents_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'export_component_parents',
				title			: self.get_tool_label('value_with_parents') || 'Export parents',
				parent			: export_component
			})
			const parents_check = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				class_name		: 'option_check_box export_component_parents_check',
				parent			: parents_label
			})
			parents_check.checked = ddo.value_with_parents===true
			ui.create_dom_element({
				element_type	: 'span',
				inner_html		: get_label.parents || 'parents',
				parent			: parents_label
			})
			// prevent the click/drag of the checkbox from triggering the
			// item sort drag handlers (the export_component is draggable)
			parents_label.addEventListener('click', e => e.stopPropagation())
			parents_label.addEventListener('mousedown', e => e.stopPropagation())
			parents_label.draggable = false
			parents_check.addEventListener('change', () => {
				ddo.value_with_parents = parents_check.checked
				// save local db data (ddo reference is shared with ar_ddo_to_export)
				self.update_local_db_data()
			})
		}

	// button close
		const export_component_button_close = ui.create_dom_element({
			element_type	: 'span',
			parent			: export_component,
			class_name		: 'button close'
		})
		export_component_button_close.addEventListener('click', function(e) {
			e.stopPropagation()

			// remove search box and content (component) from DOM
			export_component.parentNode.removeChild(export_component)

			// derive the ddo_export list from the remaining DOM order
			self.sync_ar_ddo_to_export()

			// save local db data
			self.update_local_db_data()
		})


	return export_component
}//end build_export_component



/**
* SYNC_AR_DDO_TO_EXPORT
* Rebuilds ar_ddo_to_export from the current DOM order of the selection list.
* The DOM is the single source of truth for column order: deriving the array
* from it after every add / sort / remove keeps the export column order exactly
* equal to the user order, and removes the fragile index math (and its off-by-one
* / stale-index / async-race bugs) that previously kept the two in sync by hand.
* @return void
*/
render_tool_export.prototype.sync_ar_ddo_to_export = function() {

	const self = this

	const container = self.user_selection_list
	if (!container) {
		return
	}

	self.ar_ddo_to_export = [...container.children]
		.filter(node => node.classList && node.classList.contains('export_component') && node.ddo)
		.map(node => node.ddo)
}//end sync_ar_ddo_to_export



/**
* DO_SORTABLE
* Add drag and drop features to the element
* @param DOM node element
* @return void
*/
const do_sortable = function(element, self) {

	// sortable
		element.draggable = true

	// reset all items
		function reset() {
			const element_children_length = element.parentNode.children.length
			for (let i = 0; i < element_children_length; i++) {
				const item = element.parentNode.children[i]
				if (item.classList.contains('displaced')) {
					item.classList.remove('displaced')
				}
			}
		}

	// events fired on the draggable target

		// drag start. Fix dragged element to recover later
			element.addEventListener('dragstart', (event) => {
				event.stopPropagation()

				reset()

				element.classList.add('dragging');

				// fix dragged element
					self.dragged = element

				// dataTransfer
					const data = {
						drag_type : 'sort'
					}
					// event.dataTransfer.effectAllowed = 'move';
					event.dataTransfer.dropEffect = 'move';
					event.dataTransfer.setData(
						'text/plain',
						JSON.stringify(data)
					)
			});

		// drag end
			element.addEventListener('dragend', (event) => {
				reset()
				// reset the dragging style
				event.target.classList.remove('dragging');
			});

	//  events fired on the drop targets

		// drag enter - add displaced padding
			element.addEventListener('dragenter', (event) => {
				event.preventDefault();

				reset()
				// const new_empty_node = document.createElement('div')
				// new_empty_node.classList.add('new_empty_node')
				// element.parentNode.insertBefore(new_empty_node, element)

				element.classList.add('displaced')
			});

		// allow to be dropable the element
		element.addEventListener('dragover', (event) => {
			event.preventDefault();
		})
		// on drop
			element.addEventListener('drop', (event) => {
				event.preventDefault();
				event.stopPropagation()

				reset()

				// remove dragover class from user_selection_list container
				element.parentNode.classList.remove('dragover')

				// data transfer
					const data			= event.dataTransfer.getData('text/plain');// element that move
					const parsed_data	= JSON.parse(data)

				if (parsed_data.drag_type==='sort') {

					// sort case
					// place drag item, then derive the order from the DOM
					const dragged = self.dragged
					element.parentNode.insertBefore(dragged, element)
					dragged.classList.add('active')

					// Update the ddo_export from the new DOM order
						self.sync_ar_ddo_to_export()

						// save local db data
						self.update_local_db_data()

				}else if (parsed_data.drag_type==='add') {

					// add case

					// short vars
						const path	= parsed_data.path
						const ddo	= parsed_data.ddo
						const id	= self.compose_id(ddo, path)

					// rebuild ddo
						const new_ddo = {
							id				: id,
							tipo			: ddo.tipo,
							section_tipo	: ddo.section_tipo,
							model			: ddo.model,
							parent			: ddo.parent,
							lang			: ddo.lang,
							mode			: ddo.mode,
							label			: ddo.label,
							value_with_parents	: false, // per-component parents export (checkbox in the item)
							path			: path // full path from current section replaces ddo single path
						}

					// exists
						const found = self.ar_ddo_to_export.find(el => el.id===new_ddo.id)
						if (found) {
							// Ignored already included item ddo
							return
						}

					// Build component html
					self.build_export_component(new_ddo)
					.then((export_component_node)=>{

						// add DOM node at the drop position, then derive order from DOM
						element.parentNode.insertBefore(export_component_node, element)

						export_component_node.classList.add('active')

						// Update the ddo_export from the new DOM order
						self.sync_ar_ddo_to_export()

						// save local db data
						self.update_local_db_data()
					})
				}
			});
}//end do_sortable



/**
* GET_MEDIA_COLUMNS
* Flat table columns holding media values. The column 'model' is the
* LEAF component model resolved by the server (portals deep-resolve
* correctly: a portal>image column reports component_image)
* @param object self
* 	tool_export instance
* @return array columns
*/
export const get_media_columns = (self) => {

	if (!self.flat_table) return []

	const media_columns = []
	for (const col of self.flat_table.cols.values()) {
		if (col.model && self.media_components.has(col.model)) {
			media_columns.push(col)
		}
	}

	return media_columns
}//end get_media_columns



/**
* GET_MEDIA_MODELS_IN_DATA
* Unique media component models present in the export columns
* @param object self
* 	tool_export instance
* @return array models
*/
export const get_media_models_in_data = (self) => {

	const models = get_media_columns(self).map(col => col.model)

	return [...new Set(models)]
}//end get_media_models_in_data



/**
* RENDER_DOWNLOAD_MODAL
* Creates a standard dd_modal to allow quality selection for media
* download files before collect the files
* @param object self
* 	tool_export instance
* @return HTMLElement modal
*/
export const render_download_modal = (self) => {

	// body
	const body = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'body content'
	})
	// quality selectors
	const quality_parse = {}
	const models_unique = self.media_components_in_data;
	const models_unique_length = models_unique.length
	for (let i = 0; i < models_unique_length; i++) {

		const model = models_unique[i]

		// selector_container
			const selector_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'selector_container',
				parent			: body
			})

		// selector_title
			ui.create_dom_element({
				element_type	: 'h3',
				class_name		: 'selector_title',
				inner_html		: 'Quality for ' + model,
				parent			: selector_container
			})

		// quality_selector
			const quality_selector = ui.create_dom_element({
				element_type	: 'select',
				class_name		: 'quality_selector for_' + model,
				parent			: selector_container
			})
			switch (model) {

				case 'component_image':
					// Get the context of the default component image from resources
					// (Any is valid to get the a generic context)
					data_manager.get_element_context({
						model			: 'component_image',
						tipo			: 'rsc29',
						section_tipo	: 'rsc170'
					})
					.then(function(api_response){
						if(!api_response.result) {
							console.error('Failed component image context request:', api_response);
							return
						}

						const ar_quality = api_response.result?.[0].features?.ar_quality || []

						quality_parse[model] = {
							source : page_globals.dedalo_image_quality_default,
							target : page_globals.dedalo_image_quality_default
						}

						ar_quality.map(quality => {
							const select_option = ui.create_dom_element({
								element_type	: 'option',
								value			: quality,
								text_node		: quality,
								parent			: quality_selector
							})
							if (quality === page_globals.dedalo_image_quality_default) {
								select_option.selected = true
							}
						})
					})
					break;

				case 'component_av':
					quality_parse[model] = {
						source : page_globals.dedalo_av_quality_default,
						target : page_globals.dedalo_av_quality_default
					}
					ui.create_dom_element({
						element_type	: 'option',
						value			: page_globals.dedalo_av_quality_default,
						text_node		: page_globals.dedalo_av_quality_default,
						parent			: quality_selector
					})
					ui.create_dom_element({
						element_type	: 'option',
						value			: 'original',
						text_node		: 'original',
						parent			: quality_selector
					})
					break;

				case 'component_3d':
				case 'component_pdf':
				case 'component_svg':
					quality_parse[model] = {
						source : 'web',
						target : 'web'
					}
					ui.create_dom_element({
						element_type	: 'option',
						value			: 'web',
						text_node		: 'web',
						parent			: quality_selector
					})
					ui.create_dom_element({
						element_type	: 'option',
						value			: 'original',
						text_node		: 'original',
						parent			: quality_selector
					})
					break;

				default:
					// not yet implemented
					break;
			}
			const change_handler = (e) => {
				quality_parse[model].target = e.target.value
			}
			quality_selector.addEventListener('change', change_handler)
	}

	// footer
	const footer = ui.create_dom_element({
		element_type	: 'div',
		class_name 		: 'content'
	})

	// button_ok
	const button_ok = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'success',
		inner_html		: get_label.ok || 'OK',
		parent			: footer
	})
	const click_handler = async (e) => {
		e.stopPropagation()

		body.classList.add('loading')
		button_ok.classList.add('button_spinner')

		try {
			await download_media(
				self,
				quality_parse
			)
		} catch (error) {
			console.error(error)
		}

		body.classList.remove('loading')
		button_ok.classList.remove('button_spinner')
	}
	button_ok.addEventListener('click', click_handler)
	when_in_viewport(button_ok, () => {
		button_ok.focus()
	})

	const modal = ui.attach_to_modal({
		header		: get_label.download_media || 'Download media',
		body		: body,
		footer		: footer,
		size		: 'normal',
		callback	: (dd_modal) => {
			dd_modal.modal_content.style.width = '50rem'
			dd_modal.classList.add('tool_export_modal')
		},
		on_close : () => {

		}
	})


	return modal
}//end render_download_modal



/**
* DOWNLOAD_MEDIA
* Search media files in the export flat table and download the found media
* files fetching the URL.
* Default quality is used (e.g. '1.5MB' in images) in the cells. If we want
* to map to another quality (e.g. 'original') we set the 'quality_parse'
* object value.
* @param object self
* 	tool_export instance
* @param object|undefined quality_parse
* 	sample: {
*		component_image : {
*			source : '1.5MB',
*			target : 'original'
*		}
*	}
* @return
*/
const download_media = async function (self, quality_parse) {

	// quality_parse. Defines source and target quality for each model
	if (!quality_parse) {
		// default value
		quality_parse = {
			component_image : {
				source : '1.5MB',
				target : 'original'
			},
			component_av : {
				source : '404',
				target : 'original'
			}
		}
	}
	// calculate quality from quality_parse definition
	const get_quality = (model, type) => {
		if (quality_parse[model]) {
			return quality_parse[model][type] ?? false
		}
		return false
	}

	// list of media models to parse
	const ar_models_set = new Set(self.media_components_in_data)

	// media columns of the flat table (leaf model resolved by the server)
	const media_columns = get_media_columns(self).filter(col => ar_models_set.has(col.model))

	const rows = self.flat_table ? self.flat_table.rows : []
	if (!media_columns.length || !rows.length) {
		return null
	}

	const is_raw = self.flat_table.meta && self.flat_table.meta.data_format==='dedalo_raw'

	const failed_files = []
	const url_list = []

	for (const row of rows) {
		for (const col of media_columns) {

			const cell = row.c[col.i]
			if (cell===null || cell===undefined || cell==='') {
				continue
			}

			const source_quality = get_quality(col.model, 'source')
			const target_quality = get_quality(col.model, 'target')

			if (is_raw) {
				// dedalo_raw case: the cell is the pre-encoded {"dedalo_data": <dato>}
				// string (or {dato, dataframe}); the URL is inside 'files_info'
				try {
					const parsed = JSON.parse(String(cell))
					let dato = parsed ? parsed.dedalo_data : null
					if (dato && !Array.isArray(dato) && dato.dato) {
						dato = dato.dato // {dato, dataframe} variant
					}
					const item			= Array.isArray(dato) ? dato[0] : null
					const files_info	= item && item.files_info ? item.files_info : null
					if (!files_info) {
						continue
					}
					const found = files_info.find(el => el.quality===target_quality)
					if (found) {
						url_list.push(DEDALO_MEDIA_URL + found.file_path)
					}else{
						// find thumb
						const thumb = files_info.find(el => el.quality===page_globals.dedalo_quality_thumb)
						failed_files.push(thumb ? thumb.file_name : JSON.stringify(files_info))
					}
				} catch (error) {
					if(SHOW_DEBUG===true) {
						console.log('Ignored unparsable raw media cell:', cell, error);
					}
				}
				continue
			}

			// standard/breakdown case: the cell holds the media URL(s),
			// records_separator joined when multiple
			const ar_url = String(cell).split(' | ')
			for (const item of ar_url) {

				if (!item || !item.length) {
					continue
				}

				const url = (source_quality && target_quality && source_quality!==target_quality)
					? item.replace('/'+source_quality+'/','/'+target_quality+'/')
					: item

				url_list.push(url)
			}
		}
	}

	const fetch_list = []
	url_list.flat().forEach(function(url) {

		const current_fetch = fetch(url)
			.then((res)=>{
				if (res.ok) {
					return res
				}
				failed_files.push(url)
			})
			.catch((error) => {
				if(SHOW_DEBUG===true) {
					console.log(error)
				}
			})

		fetch_list.push(current_fetch)
	});

	const promise_items = await Promise.all(fetch_list)

	// filter valid files (exclude not downloadable)
	const files = promise_items.filter(el => el)

	const downloaded_files = files.map(el => el.url)

	// info text file add to download file
	const info = {
		name: "info.txt",
		lastModified: new Date(),
		input: "Downloaded files: " + JSON.stringify(downloaded_files, null, 2) + "\nFailed files: " + JSON.stringify(failed_files, null, 2)
	}
	files.push(info)

	// get the ZIP stream in a Blob
	// Using lib client-zip @see https://github.com/Touffy/client-zip?tab=readme-ov-file
	const blob = await downloadZip(files).blob()

	// make and click a temporary link to download the Blob
	const link = document.createElement('a')
	link.href = URL.createObjectURL(blob)
	link.download = 'export_media.zip'
	link.click()
	link.remove()


	return true
}//end download_media



// @license-end
