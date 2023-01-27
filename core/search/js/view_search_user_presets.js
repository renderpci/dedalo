/*global get_label*/
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {pause} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'
	import {
		render_server_response_error,
		no_records_node
	} from '../../section/js/render_common_section.js'
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
* @return DOM node wrapper
*/
view_search_user_presets.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// running_with_errors case
		if (self.running_with_errors) {
			return render_server_response_error(
				self.running_with_errors
			)
		}

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
* @return DOM node content_data
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
					const render_promise_node = ar_section_record[i].render()
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
			id			: 'section_id',
			label		: 'Id',
			tipo		: 'section_id', // used to sort only
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
				id			: 'remove',
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
* @return DOM DocumentFragment
*/
export const render_column_apply_preset = function(options) {

	// options
		const self				= options.caller.caller // object instance, usually section or portal
		const section_id		= options.section_id
		// const section_tipo	= options.section_tipo
		// const paginated_key	= options.paginated_key // int . Current item paginated_key in all result

	// DocumentFragment
		const fragment = new DocumentFragment()

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_edit',
			parent			: fragment
		})
		button_edit.addEventListener('click', async function(e) {
			e.stopPropagation()

			// load DDBB component data
			load_search_preset({
				section_id : section_id
			})
			.then(function(json_filter){
				// render_filter
				render_filter({
					self				: self,
					editing_preset		: json_filter,
					allow_duplicates	: true
				})
				// render buttons
				self.render_search_buttons()
			})
		})

	// edit icon
		ui.create_dom_element({
			element_type	: 'span',
			// class_name	: 'button pen icon grey',
			class_name		: 'button edit icon grey',
			parent			: button_edit
		})


	return fragment
}//end render_column_apply_preset



/**
* RENDER_COLUMN_ID
* @param object options
* @return DOM DocumentFragment
*/
export const render_column_id = function(options) {

	// options
		const self				= options.caller // object instance, usually section or portal
		const section_id		= options.section_id
		// const section_tipo	= options.section_tipo
		// const paginated_key	= options.paginated_key // int . Current item paginated_key in all result

	// permissions
		// const permissions = self.permissions

	// DocumentFragment
		const fragment = new DocumentFragment()

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_edit button_view_' + self.context.view,
			parent			: fragment
		})
		button_edit.addEventListener('click', async function(e) {
			e.stopPropagation()

			const section = await edit_user_search_preset(self, section_id)

			// modal
				const body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'container'
				})
				section.render()
				.then(function(section_node){
					body.appendChild(section_node)
					// modal attach
					ui.attach_to_modal({
						header	: 'User search preset',
						body	: body,
						footer	: null
					})
				})
		})

	// edit icon
		ui.create_dom_element({
			element_type	: 'span',
			// class_name	: 'button pen icon grey',
			class_name		: 'button edit icon grey',
			parent			: button_edit
		})


	return fragment
}//end render_column_id()



/**
* RENDER_COLUMN_REMOVE
* @param object options
* @return DOM DocumentFragment
*/
export const render_column_remove = function(options) {

	// options
		const self			= options.caller // object instance, usually section
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	// DocumentFragment
		const fragment = new DocumentFragment()

	// delete_button
		const delete_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_delete',
			parent			: fragment
		})
		delete_button.addEventListener('click', function(){
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
	// delete_icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button delete_light icon',
			parent			: delete_button
		})


	return fragment
}//end render_column_remove()
