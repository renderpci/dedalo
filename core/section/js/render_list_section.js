/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	// import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {clone} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'
	import {get_ar_instances} from './section.js'



/**
* RENDER_LIST_SECTION
* Manages the component's logic and appearance in client side
*/
export const render_list_section = function() {

	return true
};//end render_list_section



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_section.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// columns_map
		const columns_map = await rebuild_columns_map(self)
		self.columns_map = columns_map

	// ar_section_record. section_record instances (initied and builded)
		self.ar_instances = self.ar_instances && self.ar_instances.length>0
			? self.ar_instances
			: await get_ar_instances(self)

	// content_data
		const content_data = await get_content_data(self.ar_instances, self)
		if (render_level==='content') {
			return content_data
		}

	const fragment = new DocumentFragment()

	// buttons
		if (self.mode!=='tm') {
			const buttons_node = get_buttons(self);
			if(buttons_node){
				fragment.appendChild(buttons_node)
			}
		}

	// search filter node
		if (self.filter && self.mode!=='tm') {
			const filter_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'search_container',
				parent			: fragment
			})
			self.filter_container = filter_container
			// self.filter.build().then(()=>{
			// 	self.filter.render().then(filter_wrapper =>{
			// 		filter_container.appendChild(filter_wrapper)
			// 	})
			// })
		}

	// paginator container node
		const paginator_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_container',
			parent			: fragment
		})
		self.paginator.build()
		.then(function(){
			self.paginator.render().then(paginator_wrapper =>{
				paginator_container.appendChild(paginator_wrapper)
			})
		})

	// list body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body',
			parent			: fragment
		})
		// fix last list_body (for pagination selection)
		self.node_body = list_body

		// flat columns create a sequence of grid widths taking care of sub-column space
		// like 1fr 1fr 1fr 3fr 1fr
		const items				= ui.flat_column_items(columns_map)
		const template_columns	= items.join(' ')
		// Object.assign(
		// 	list_body.style,
		// 	{
		// 		"grid-template-columns": template_columns
		// 	}
		// )
		const css_object = {
			'.list_body' : {
				'grid-template-columns': template_columns
			}
		}
		set_element_css(self.section_tipo+'_'+self.tipo, css_object)


	// list_header_node. Create and append if ar_instances is not empty
		if (self.ar_instances.length>0) {
			const list_header_node = ui.render_list_header(columns_map, self)
			list_body.appendChild(list_header_node)
		}

	// content_data append
		list_body.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			//class_name	: self.model + ' ' + self.tipo + ' ' + self.mode
			class_name		: 'wrapper_' + self.type + ' ' + self.model + ' ' + self.tipo + ' ' + self.mode
		})
		wrapper.appendChild(fragment)


	return wrapper
};//end list



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = async function(ar_section_record, self) {

	// section_record instances (initied and builded)
	// const ar_section_record = await self.get_ar_instances()

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
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.mode, self.type) // ,"nowrap","full_width"
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	const columns_map = []

	// column section_id check
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			width 		: 'auto',
			callback	: render_list_section.render_column_id
		})

	// button_remove
		// 	if (self.permissions>1) {
		// 		columns_map.push({
		// 			id			: 'remove',
		// 			label		: '', // get_label.delete || 'Delete',
		// 			width 		: 'auto',
		// 			callback	: render_column_remove
		// 		})
		// 	}

	// columns base
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)


	return columns_map
};//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* @param object options
* @return DOM DocumentFragment
*/
render_list_section.render_column_id = function(options){

	// options
		const self				= options.caller
		const section_id		= options.section_id
		const section_tipo		= options.section_tipo
		const offset			= options.offset
		const matrix_id			= options.matrix_id
		const modification_date	= options.modification_date

	// permissions
		const permissions = self.permissions

	const fragment = new DocumentFragment()

	// section_id
		ui.create_dom_element({
			element_type	: 'span',
			text_content	: section_id,
			class_name		: 'section_id',
			parent			: fragment
		})

	// buttons
		switch(true){

			case (self.initiator && self.initiator.indexOf('component_')!==-1):

				// component portal caller (link)
					const link_button = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button link',
						parent			: fragment
					})
					link_button.addEventListener("click", function(){
						// top window event
						top.event_manager.publish('initiator_link_' + self.initiator, {
							section_tipo	: section_tipo,
							section_id		: section_id
						})
					})

				// button edit (pen)
					if (permissions>1) {
						const edit_button = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button edit',
							parent			: fragment
						})
						edit_button.addEventListener("click", async function(){
							// navigate link
								// const user_navigation_options = {
								// 	tipo		: section_tipo,
								// 	section_id	: section_id,
								// 	model		: self.model,
								// 	mode		: 'edit'
								// }
								const user_navigation_rqo = {
									caller_id	: self.id,
									source		: {
										action			: 'search',
										model			: 'section',
										tipo			: section_tipo,
										section_tipo	: section_tipo,
										mode			: 'edit',
										lang			: self.lang
									},
									sqo : {
										section_tipo		: [{tipo : section_tipo}],
										limit				: 1,
										offset				: 0,
										filter_by_locators	: [{
											section_tipo : section_tipo,
											section_id : section_id
										}]
									}
								}
								if(SHOW_DEBUG===true) {
									console.log("// section_record build_id_column user_navigation_rqo initiator component:", user_navigation_rqo);
								}
								event_manager.publish('user_navigation', user_navigation_rqo)

							// detail_section
								// ( async () => {
								// 	const options = {
								// 		model 			: 'section',
								// 		type 			: 'section',
								// 		tipo  			: self.section_tipo,
								// 		section_tipo  	: self.section_tipo,
								// 		section_id 		: self.section_id,
								// 		mode 			: 'edit',
								// 		lang 			: page_globals.dedalo_data_lang
								// 	}
								// 	const current_data_manager	= new data_manager()
								// 	const page_element_call 	= await current_data_manager.get_page_element(options)
								// 	const page_element 			= page_element_call.result

								// 	// detail_section instance. Create target section page element and instance
								// 		const detail_section = await get_instance(page_element)

								// 		// set self as detail_section caller (!)
								// 			detail_section.caller = initiator

								// 		// load data and render wrapper
								// 			await detail_section.build(true)
								// 			const detail_section_wrapper = await detail_section.render()

								// 	// modal container (header, body, footer, size)
								// 		const header = ui.create_dom_element({
								// 			element_type	: 'div',
								// 			text_content 	: detail_section.label
								// 		})
								// 		const modal = ui.attach_to_modal(header, detail_section_wrapper, null, 'big')
								// 		modal.on_close = () => {
								// 			detail_section.destroy(true, true, true)
								// 		}
								// })()

							// iframe
								// ( async () => {
								// 	const iframe = ui.create_dom_element({
								// 		element_type	: 'iframe',
								// 		src 			: DEDALO_CORE_URL + '/page/?tipo=' + self.section_tipo + '&section_id=' + self.section_id + '&mode=edit'
								// 	})
								// 	// modal container (header, body, footer, size)
								// 		const header = ui.create_dom_element({
								// 			element_type	: 'div',
								// 			text_content 	: detail_section.label
								// 		})
								// 		const modal = ui.attach_to_modal(header, iframe, null, 'big')
								// 		modal.on_close = () => {
								// 			detail_section.destroy(true, true, true)
								// 	}
								// })()
						})
					}
				break

			case (self.initiator && self.initiator.indexOf('tool_time_machine')!==-1):
				// button time machine preview (eye)
					const edit_button_tm = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button eye',
						parent			: fragment
					})
					edit_button_tm.addEventListener("click", function(){
						// publish event
						event_manager.publish('tm_edit_record', {
							tipo		: section_tipo,
							section_id	: section_id,
							matrix_id	: matrix_id,
							date		: modification_date || null,
							mode		: 'tm'
						})
					})
				break

			case (self.config && self.config.source_model==='section_tool'):

				// edit button (pen)
					if (self.permissions>1) {
						const edit_button = ui.create_dom_element({
							element_type	: 'div',
							class_name		: '',
							inner_html 		: ' ' + self.config.tool_context.label,
							parent			: fragment
						})
						edit_button.addEventListener("click", function(e){
							e.stopPropagation();

							// tool_context (clone always to prevent modify original object)
								const tool_context = clone(self.config.tool_context)

							// parse ddo_map section_id
								tool_context.tool_config.ddo_map.map(el => {
									if (el.section_id==='self') {
										el.section_id = section_id
									}
								})

							// lang set
								tool_context.lang = self.lang

							event_manager.publish('load_tool', {
								tool_context	: tool_context,
								caller			: self
							})
						})
					}
				break;

			default:

				// edit button (pen)
					if (self.permissions>1) {
						const edit_button = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button edit',
							parent			: fragment
						})
						edit_button.addEventListener("click", function(){
							const user_navigation_rqo = {
								caller_id	: self.id,
								source		: {
									action			: 'search',
									model			: 'section',
									tipo			: section_tipo,
									section_tipo	: section_tipo,
									mode			: 'edit',
									lang			: self.lang
								},
								sqo : {
									section_tipo	: [{tipo : section_tipo}],
									limit			: 1,
									offset			: offset,
									filter			: self.rqo.sqo.filter || null
								}
							}
							event_manager.publish('user_navigation', user_navigation_rqo)
						})
					}

				// remove button
					const button_delete = self.context.buttons
						? self.context.buttons.find(el => el.model==='button_delete')
						: null
					if (button_delete) {
						const delete_button = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button remove',
							parent			: fragment
						})
						delete_button.addEventListener("click", function(){
							delete_record(this, options)
						})
					}
				break;
		}


	return fragment
};// end render_column_id()



/**
* GET_BUTTONS
* @return DOM node fragment
*/
const get_buttons = function(self) {

	const ar_buttons = self.context.buttons

	if(!ar_buttons) return null;

	const fragment = new DocumentFragment()

	// buttons node
		const buttons_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons',
			parent			: fragment
		})

		// filter button (search) . Show and hide all search elements
			const filter_button	= ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning search',
				inner_html		: get_label.buscar || 'Search',
				parent			: buttons_wrapper
			})
			filter_button.addEventListener("click", function() {
				event_manager.publish('toggle_search_panel', this)
			})
			// ui.create_dom_element({
			// 	element_type	: 'span',
			// 	class_name		: 'button white search',
			// 	parent			: filter_button
			// })
			// filter_button.insertAdjacentHTML('beforeend', get_label.buscar)

		const ar_buttons_length = ar_buttons.length;
		for (let i = 0; i < ar_buttons_length; i++) {

			const current_button = ar_buttons[i]

			if(current_button.model==='button_delete') continue

			// button node
				const class_name	= 'warning ' + current_button.model
				const button_node	= ui.create_dom_element({
					element_type	: 'button',
					class_name		: class_name,
					inner_html		: current_button.label,
					parent			: buttons_wrapper
				})
				button_node.addEventListener('click', (e) => {
					e.stopPropagation()

					switch(current_button.model){
						case 'button_new':
							event_manager.publish('new_section_' + self.id)
							break;
						// case 'button_import':
						// 	event_manager.publish('load_tool', {
						// 		tool_context	: current_button.tools[0],
						// 		caller			: self
						// 	})
							break;
						default:
							event_manager.publish('click_' + current_button.model)
							break;
					}
				})
		}//end for (let i = 0; i < ar_buttons_length; i++)

	// tools
		ui.add_tools(self, buttons_wrapper)


	return fragment
};//end get_buttons



/**
* LIST_TM
* Render node for use in list_tm
* @return DOM node
*/
	// render_list_section.prototype.list_tm = async function(options={render_level:'full'}) {

		// 	const self = this

		// 	const render_level 		= options.render_level
		// 	const ar_section_record = self.ar_instances


		// 	// content_data
		// 		const current_content_data = await content_data(self)
		// 		if (render_level==='content') {
		// 			return current_content_data
		// 		}

		// 	const fragment = new DocumentFragment()

		// 	// buttons node
		// 		const buttons = ui.create_dom_element({
		// 			element_type	: 'div',
		// 			class_name		: 'buttons',
		// 			parent 			: fragment
		// 		})

		// 	// filter node
		// 		const filter = ui.create_dom_element({
		// 			element_type	: 'div',
		// 			class_name		: 'filter',
		// 			parent 			: fragment
		// 		})
		// 		await self.filter.render().then(filter_wrapper =>{
		// 			filter.appendChild(filter_wrapper)
		// 		})

		// 	// paginator node
		// 		const paginator = ui.create_dom_element({
		// 			element_type	: 'div',
		// 			class_name		: 'paginator',
		// 			parent 			: fragment
		// 		})
		// 		self.paginator.render().then(paginator_wrapper =>{
		// 			paginator.appendChild(paginator_wrapper)
		// 		})

		// 	// list_header_node
		// 		const list_header_node = await self.list_header()
		// 		fragment.appendChild(list_header_node)

		// 	// content_data append
		// 		fragment.appendChild(current_content_data)


		// 	// wrapper
		// 		const wrapper = ui.create_dom_element({
		// 			element_type	: 'section',
		// 			id 				: self.id,
		// 			//class_name		: self.model + ' ' + self.tipo + ' ' + self.mode
		// 			class_name 		: 'wrapper_' + self.type + ' ' + self.model + ' ' + self.tipo + ' ' + self.mode
		// 		})
		// 		wrapper.appendChild(fragment)


		// 	return wrapper
	// };//end list_tm



/**
* NO_RECORDS_NODE
* @return DOM node
*/
const no_records_node = () => {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'no_records',
		inner_html		: get_label.no_records || "No records found"
	})

	return node
};//end no_records_node



/**
* DELETE_RECORD
* Navigate to selected record in edit mode
*/
const delete_record = (button, self) => {

	confirm(`delete_record:
		section_tipo: ${self.section_tipo}
		section_id: ${self.section_id}`)


	return false
};//end delete_record


