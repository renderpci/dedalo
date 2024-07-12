// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label*/
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'
	import {no_records_node} from '../../section/js/render_common_section.js'
	import {edit_user_search_preset, load_search_preset} from './search_user_presets.js'
	import {render_filter} from './render_search.js'



/**
* VIEW_SEARCH_USER_PRESETS
* Manages the component's logic and appearance in client side
*/
export const view_search_user_presets = function() {

	return true
}//end view_search_user_presets



/**
* RENDER
* Render wrapper node
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_search_user_presets.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map	= await rebuild_columns_map(self)
		self.columns_map	= columns_map

	// ar_section_record. section_record instances (init and built)
		self.ar_instances = self.ar_instances && self.ar_instances.length>0
			? self.ar_instances
			: await get_section_records({caller: self})

	// content_data
		const content_data = await get_content_data(self.ar_instances, self)
		if (render_level==='content') {
			return content_data
		}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// paginator container node
		if (self.paginator) {
			const paginator_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'paginator_container',
				parent			: fragment
			})

			self.paginator.build()
			.then(function(){
				self.paginator.mode = 'micro'
				self.paginator.render().then(paginator_wrapper => {
					paginator_container.appendChild(paginator_wrapper)
				})
			})
		}

	// list body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body',
			parent			: fragment
		})
		// fix last list_body (for pagination selection)
		self.node_body = list_body

		// list_body css
			const selector = `${self.section_tipo}_${self.tipo}.list`
		// custom properties defined css
			if (self.context.css) {
				// use defined section css
				set_element_css(selector, self.context.css)
			}else{
				// flat columns create a sequence of grid widths taking care of sub-column space
				// like 1fr 1fr 1fr 3fr 1fr
				// const css_object = {
				// 	'.list_body' : {
				// 		'grid-template-columns' : '1rem 1rem auto 1rem'
				// 	}
				// }
				// // use calculated css
				// set_element_css(selector, css_object)
				// (!) grid columns defined in search.css
			}

	// content_data append
		list_body.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			class_name		: `wrapper_${self.type} ${self.model} ${self.tipo} ${self.section_tipo+'_'+self.tipo} view_${self.view} list`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data	= content_data
		wrapper.list_body		= list_body


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render content data
* @param array ar_section_record
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(ar_section_record, self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length===0) {

			// no records found case
			const row_item = no_records_node()
			fragment.appendChild(row_item)

		}else{
			// rows
			// parallel mode
				const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {
					// render
					const render_promise_node = ar_section_record[i].render({
						add_hilite_row : false
					})
					ar_promises.push(render_promise_node)
				}
				await Promise.all(ar_promises).then(function(values) {
				  for (let i = 0; i < ar_section_record_length; i++) {
				  	const section_record_node = values[i]
					fragment.appendChild(section_record_node)
				  }
				});
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode, self.type) // ,"nowrap","full_width"
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @param object self
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	const columns_map = []

	// column apply_preset
		columns_map.push({
			id			: 'apply_preset',
			label		: 'Apply',
			tipo		: 'apply_preset', // used to sort only
			width		: 'auto',
			callback	: render_column_apply_preset
		})

	// column section_id check
		columns_map.push({
			id			: 'edit',
			label		: 'Id',
			tipo		: 'edit', // used to sort only
			width		: 'auto',
			path		: [{
				// note that component_tipo=section_id is valid here
				// because section_id is a direct column in search
				component_tipo	: 'section_id',
				// optional. Just added for aesthetics
				model			: 'component_section_id',
				name			: 'ID',
				section_tipo	: self.section_tipo
			}],
			callback	: render_column_id
		})

	// columns base
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)

	// button_remove
		if (self.permissions>1) {
			columns_map.push({
				id			: 'delete',
				label		: '',
				width 		: 'auto',
				callback	: render_column_remove
			})
		}


	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_APPLY_PRESET
* @param object options
* @return HTMLElement button_apply
*/
export const render_column_apply_preset = function(options) {

	// options
		const self			= options.caller.caller // object instance search
		const section_id	= options.section_id

	// button_apply
		const button_apply = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_apply_preset button icon arrow_link'
		})
		button_apply.addEventListener('click', async function(e) {
			e.stopPropagation()

			// load DDBB component_json data
			load_search_preset({
				section_id : section_id
			})
			.then(function(json_filter){

				// render_filter (into search_container_selection at center)
				render_filter({
					self				: self,
					editing_preset		: json_filter,
					allow_duplicates	: true
				})
				// render buttons (force to re-create the buttons)
				self.render_search_buttons()
				// set as selected
				const section_record	= button_apply.parentNode.parentNode
				const content_data		= section_record.parentNode
				content_data.querySelectorAll('.section_record').forEach((el) => {
					el.classList.remove('selected')
				});
				section_record.classList.add('selected')

				// fix user_preset_section_id
				self.user_preset_section_id = section_id
			})
		})


	return button_apply
}//end render_column_apply_preset



/**
* RENDER_COLUMN_ID
* @param object options
* {
* 	caller: instance,
* 	section:id: string|int
* }
* @return HTMLElement button_edit
*/
export const render_column_id = function(options) {

	// options
		const self			= options.caller // object instance section
		const section_id	= options.section_id

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_edit button icon edit button_view_' + self.context.view
		})
		button_edit.addEventListener('click', async function(e) {
			e.stopPropagation()

			// modal body
				const body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'container'
				})

			// modal attach to document
				const modal_container = ui.attach_to_modal({
					header	: get_label.search_presets || 'User search preset',
					body	: body,
					footer	: null,
					size 	: 'small'
				})
				modal_container.on_close = function(){
					// nothing to do
				}

			// load section
				ui.load_item_with_spinner({
					container	: body,
					label		: 'Preset ' + section_id,
					style : {
						height : '273px'
					},
					callback	: async function() {
						// section load
						const section		= await edit_user_search_preset(self, section_id)
						const section_node	= await section.render()
						return section_node
					}
				})
		})


	return button_edit
}//end render_column_id()



/**
* RENDER_COLUMN_REMOVE
* @param object options
* @return HTMLElement delete_button
*/
export const render_column_remove = function(options) {

	// options
		const self			= options.caller // object instance section
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	// delete_button
		const delete_button = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_delete button delete_light icon'
		})
		delete_button.addEventListener('click', function(e){
			e.stopPropagation()

			// delete_record
				self.delete_record({
					section			: self,
					section_id		: section_id,
					section_tipo	: section_tipo,
					sqo				: {
						section_tipo		: [section_tipo],
						filter_by_locators	: [{
							section_tipo	: section_tipo,
							section_id		: section_id
						}],
						limit				: 1
					}
				})
		})


	return delete_button
}//end render_column_remove()



// @license-end
