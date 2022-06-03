/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {create_source} from '../../common/js/common.js'
	import {download_url} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_node_info} from '../../common/js/utils/notifications.js'
	import * as instances from '../../common/js/instances.js'



/**
* RENDER_INSPECTOR
* Manages the component's logic and apperance in client side
*/
export const render_inspector = function() {

	return true
};//end render_inspector



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_inspector.prototype.edit = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// label
		const label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label icon_arrow up',
			inner_html		: 'Inspector'
		})
		// track collapse toggle state of content
		ui.collapse_toggle_track({
			header				: label,
			content_data		: content_data,
			collapsed_id		: 'inspector_element_info_block',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			label.classList.remove('up')
		}
		function expose() {
			label.classList.add('up')
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id				: 'inspector',
			class_name		: 'wrapper_inspector inspector',
		})

	// add elements
		wrapper.appendChild(label)
		wrapper.appendChild(content_data)

	// events
		add_events(wrapper, self)


	return wrapper
};//end edit



/**
* ADD_EVENTS
* Attach element generic events to wrapper
*/
const add_events = (wrapper, self) => {

	// mousedown
		wrapper.addEventListener("click", function(e){
			e.stopPropagation()
			//e.preventDefault()
			// prevent buble event to container element

			// label click collapse 'content_data'
				// if (e.target.matches('.label')) {

					// const collapsed_id		= e.target.id //.classList.join('_')
					// const collapsed_table	= 'context'

					// const content_data	= e.target.nextSibling
					// const collapsed		= content_data.classList.contains('hide')
					// if (!collapsed) {
					// 	// add record to local DB
					// 	data_manager.prototype.set_local_db_data({
					// 		id		: collapsed_id,
					// 		value	: !collapsed
					// 	}, collapsed_table)
					// 	content_data.classList.add('hide')
					// }else{
					// 	// remove record from local DB
					// 	data_manager.prototype.delete_local_db_data(collapsed_id, collapsed_table)
					// 	content_data.classList.remove('hide')
					// }
				// }

			return false
		})


	return true
};//end add_events



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data inspector_content_data hide',
		})

	// paginator container
		const paginator_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_container',
			parent			: content_data
		})
		// fix pointer to node placeholder
		self.paginator_container = paginator_container

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container top',
			parent			: content_data
		})

		// button_search. Show and hide all search elements
			const button_search = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light search',
				title			: get_label.buscar || "Search",
				parent			: buttons_container
			})
			button_search.addEventListener('click', function(e){
				e.stopPropagation()
				event_manager.publish('toggle_search_panel', this)
			})

		// button_new . Call API to create new section and navigate to the new record
			const button_new = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light add',
				title			: get_label.nuevo || "New",
				parent			: buttons_container
			})
			button_new.addEventListener('click', (e) => {
				e.stopPropagation()
				event_manager.publish('new_section_' + self.caller.id)
			})

		// button_delete . Call API to delete current record
			const button_delete = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light remove',
				title			: get_label.borrar || "Delete",
				parent			: buttons_container
			})
			button_delete.addEventListener('click', (e) => {
				e.stopPropagation()
				event_manager.publish('delete_section_' + self.caller.id, {
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					caller			: self.caller // section
				})
			})


	// project container
		// (!) Note that the filter node is collected from a subscribed
		// event 'render_component_filter_xx' from self inspector init event
		if (self.component_filter_node) {
			const project_block = render_project_block(self)
			content_data.appendChild(project_block)
		}

	// element_info
		const element_info = render_element_info(self)
		content_data.appendChild(element_info)

	// indexation_list container
		// if (self.caller.context.indexation_list) {
			const indexation_list = render_indexation_list(self)
			content_data.appendChild(indexation_list)
		// }

	// relation_list container
		if (self.caller.context.relation_list) {
			const relation_list = render_relation_list(self)
			content_data.appendChild(relation_list)
		}

	// time_machine_list container
		if (self.caller.context.time_machine_list) {
			const time_machine_list = render_time_machine_list(self)
			content_data.appendChild(time_machine_list)
		}

	// activity_info
		const activity_info = render_activity_info(self)
		content_data.appendChild(activity_info)

	// buttons_bottom_container
		const buttons_bottom_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container bottom',
			parent			: content_data
		})

		// data_link . Open window to full seciton JSON data
			const data_link = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light eye data_link',
				text_content	: 'View record data',
				parent			: buttons_bottom_container
			})
			data_link.addEventListener("click", (e)=>{
				e.preventDefault()

				// read from Dédlo API
				const rqo = {
					action	: 'read_raw',
					source	: create_source(self.caller)
				}
				data_manager.prototype.request({
					body : rqo
				})
				.then(function(api_response){

					// error case
						if (api_response.result===false || api_response.error) {
							// alert("An error occurred. " + api_response.error);
							return
						}

					// open window
						const target_window	= window.open('', 'raw_data', '');

					// raw_data_node
						const data_string = JSON.stringify(api_response.result, null, 2)
						const raw_data_node = ui.create_dom_element({
							element_type	: 'pre',
							inner_html		: data_string
						})

					// add data content to new window body
						const body = target_window.document.body
						if (body) {
							body.appendChild(raw_data_node)
						}
				})
			})//end data_link.addEventListener("click"

		// tool register files.	dd1340
			if (self.section_tipo==='dd1340') {
				const register_download = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning download register_download',
					text_content	: 'Download register file',
					parent			: buttons_bottom_container
				})
				register_download.addEventListener("click", (e)=>{
					e.preventDefault()
					const url		= DEDALO_CORE_URL + '/json/json_display.php?url_locator=' + self.section_tipo + '/' + self.caller.section_id
					const file_name	= 'register.json'
					// download_url (import from data_manager) temporal link create and click
					if (confirm(`Donwload file: ${file_name} ${self.caller.section_id} ?`)) {
						download_url(url, file_name)
					}
				})
			}


	return content_data
};//end get_content_data



/**
* RENDER_SECTION_INFO
* Called from info.js throw event manager: render_' + self.caller.id
* @return DOM DocumentFragment
*/
export const render_section_info = function(self) {

	const container		= self.element_info_container
	const section		= self.caller
	const section_data	= section.data.value && section.data.value[0]
		? section.data.value[0]
		: {}


	// values from caller (section)
		const section_tipo			= section.section_tipo
		const label					= section.label
		const created_date			= section_data.created_date
		const modified_date			= section_data.modified_date
		const created_by_user_name	= section_data.created_by_user_name
		const modified_by_user_name	= section_data.modified_by_user_name

	const fragment = new DocumentFragment();

	// section name
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: get_label.seccion || 'Section',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: label,
			parent			: fragment
		})

	// tipo
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: get_label.tipo || 'Tipo',
			parent			: fragment
		})
		// value
		const tipo_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: section_tipo,
			parent			: fragment
		})
		const docu_link = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'button link',
			title			: 'Documentation',
			parent			: tipo_info
		})
		docu_link.addEventListener("click", function(){
			open_ontology_window(section_tipo)
		})

	// section created
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: get_label.creado || 'Created',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: created_date + ' ' + created_by_user_name,
			parent			: fragment
		})

	// section modified
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: get_label.modificado || 'Modified',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: modified_date + ' ' + modified_by_user_name,
			parent			: fragment
		})


	// clean container
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

	container.appendChild(fragment)

	return fragment
};//end render_section_info



/**
* RENDER_COMPONENT_INFO
* @return DOM DocumentFragment
*/
export const render_component_info = function(self, component) {

	const container	= self.element_info_container
	// console.log("component:",component);

	// values from caller (section)
		const tipo			= component.tipo
		const label			= component.label
		const model			= component.model
		const translatable	= component.context.translatable
			? JSON.stringify(component.context.translatable)
			: 'no'
		// const value			= component.data && component.data.value
		// 	? JSON.stringify(component.data.value, null, 1)
		// 	: ''

	const fragment = new DocumentFragment();

	// section name
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html	: get_label.componente || 'Component',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html	: label,
			parent			: fragment
		})

	// tipo
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html	: get_label.tipo || 'Tipo',
			parent			: fragment
		})
		// value
		const tipo_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html	: tipo,
			parent			: fragment
		})
		const docu_link = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'button link',
			title			: 'Documentation',
			parent			: tipo_info
		})
		docu_link.addEventListener("click", function(){
			open_ontology_window(tipo)
		})

	// model
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html	: get_label.modelo || 'Model',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html	: model,
			parent			: fragment
		})

	// translatable
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: get_label.traducible || 'Translatable',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: translatable,
			parent			: fragment
		})

	// value
		// label
		const value_label_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key wide icon_arrow',
			inner_html		: get_label.dato || 'Data',
			parent			: fragment
		})
		// value
		const value_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value wide code hide',
			// text_content	: value,
			text_content	: 'Parsing data..',
			parent			: fragment
		})
		// parse data. This time out prevents lock component selection
		setTimeout(function(){
			const value = component.data && component.data.value
				? JSON.stringify(component.data.value, null, 1)
				: ''
			value_node.innerHTML = ''
			value_node.insertAdjacentHTML('afterbegin', value)
		}, 50)

		// track collapse toggle state of content
		ui.collapse_toggle_track({
			header				: value_label_node,
			content_data		: value_node,
			collapsed_id		: 'inspector_component_value',
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})
		function collapse() {
			value_label_node.classList.remove('up')
		}
		function expose() {
			value_label_node.classList.add('up')
		}


	// clean container
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

	container.appendChild(fragment)



	return fragment
};//end render_component_info



/**
* RENDER_ELEMENT_INFO
* Note that self.element_info_containe is fixed to allow inspector init event
* to locate the target node when is invoked
* @return DOM node element_info_wrap
*/
const render_element_info = function(self) {

	// wrapper
	const element_info_wrap = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'element_info_wrap'
	})

	// element_info_head
		const element_info_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'element_info_head label icon_arrow up',
			inner_html		: get_label.info || "Info",
			parent			: element_info_wrap
		})

	// element_info_container (body)
		const element_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'element_info hide',
			parent			: element_info_wrap
		})
		// fix pointer to node placeholder
		self.element_info_container = element_info_body

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			header				: element_info_head,
			content_data		: element_info_body,
			collapsed_id		: 'inspector_element_info_block',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			element_info_head.classList.remove('up')
		}
		function expose() {
			element_info_head.classList.add('up')
		}


	return element_info_wrap
};//end render_element_info



/**
* RENDER_PROJECT_BLOCK
* @return DOM node project_wrap
*/
const render_project_block = function(self) {

	// wrap
		const project_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_wrap'
		})

	// project_head
		const project_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_head icon_arrow up',
			inner_html		: get_label.proyecto || "Project",
			parent			: project_wrap
		})

	// project container
		const project_container_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_container hide',
			parent			: project_wrap
		})
		// fix project_container_body
		self.project_container_body = project_container_body
		// component_filter_node (collected in inspector init event 'render_component_filter_xx')
		update_project_container_body(self)

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			header				: project_head,
			content_data		: project_container_body,
			collapsed_id		: 'inspector_project_block',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			project_head.classList.remove('up')
		}
		function expose() {
			project_head.classList.add('up')
		}


	return project_wrap
};//end render_project_block



/**
* UPDATE_PROJECT_CONTAINER_BODY
* Clean project_container_body and add init event wath fixed node: 'self.component_filter_node'
* @return bool true
*/
export const update_project_container_body = function(self) {

	// clean self.project_container_body
		while (self.project_container_body.firstChild) {
			self.project_container_body.removeChild(self.project_container_body.firstChild);
		}

	// add the new component_filter_node
		self.project_container_body.appendChild(self.component_filter_node)

	return true
}//end update_project_container_body



/**
* RENDER_INDEXATION_LIST
* @return DOM node indexation_list_container
*/
const render_indexation_list = function(self) {

	// wrapper
		const indexation_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'indexation_list_container'
		})

	// indexation_list_head
		const indexation_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'indexation_list_head icon_arrow',
			inner_html		: get_label.indexaciones || 'Indexations',
			parent			: indexation_list_container
		})

	// indexation_list_body
		const indexation_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'indexation_list_body hide',
			inner_html		: 'Working here..',
			parent			: indexation_list_container
		})

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			header				: indexation_list_head,
			content_data		: indexation_list_body,
			collapsed_id		: 'inspector_indexation_list_block',
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})
		function collapse() {
			indexation_list_head.classList.remove('up')
		}
		function expose() {
			indexation_list_head.classList.add('up')
		}


	return indexation_list_container
};//end render_indexation_list



/**
* RENDER_RELATION_LIST
* @return DOM node relation_list_container
*/
const render_relation_list = function(self) {

	// wrapper
		const relation_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_container'
		})

	// relation_list_head
		const relation_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_head icon_arrow',
			inner_html		: get_label.relaciones || "Relations",
			parent			: relation_list_container
		})

	// relation_list_body
		const relation_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_body hide',
			parent			: relation_list_container
		})

	// relation_list events
		self.events_tokens.push(
			event_manager.subscribe('relation_list_paginator', fn_relation_list_paginator)
		)
		function fn_relation_list_paginator(relation_list) {
			relation_list_body.classList.add('loading')
			load_relation_list(relation_list)
			.then(function(){
				relation_list_body.classList.remove('loading')
			})
		}
		self.events_tokens.push(
			event_manager.subscribe('render_' + self.caller.id, fn_updated_section)
		)
		function fn_updated_section() {
			// triggered after section pagination, it forces relation list update
			const is_open = !relation_list_body.classList.contains('hide')
			if (is_open) {
				load_relation_list()
			}
		}

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			header				: relation_list_head,
			content_data		: relation_list_body,
			collapsed_id		: 'inspector_relation_list',
			collapse_callback	: unload_relation_list,
			expose_callback		: load_relation_list,
			default_state		: 'closed'
		})
		async function load_relation_list( instance ) {
			self.section_id	= self.caller.section_id

			relation_list_head.classList.add('up')

			const relation_list	= (instance && instance.model==='relation_list')
				? instance // pagination case do not need to init relation_list
				: await instances.get_instance({
					model			: 'relation_list',
					tipo			: self.caller.context['relation_list'],
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					mode			: self.mode
				})

			await relation_list.build()
			const relation_list_container = await relation_list.render()
			while (relation_list_body.firstChild) {
				relation_list_body.removeChild(relation_list_body.firstChild)
			}
			relation_list_body.appendChild(relation_list_container)
		}
		function unload_relation_list() {
			self.section_id = self.caller.section_id

			while (relation_list_body.firstChild) {
				relation_list_body.removeChild(relation_list_body.firstChild);
			}
			relation_list_head.classList.remove('up')
		}


	return relation_list_container
};//end render_relation_list



/**
* RENDER_TIME_MACHINE_LIST
* @return DOM node time_machine_list_wrap
*/
const render_time_machine_list = function(self) {

	// wrapper
		const time_machine_list_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_machine_list'
		})

	// time_machine_list_head
		const time_machine_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_machine_list_head icon_arrow',
			inner_html		: get_label.latest_changes || 'Latest changes',
			parent			: time_machine_list_wrap
		})

	// time_machine_list_body
		const time_machine_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_machine_list_body hide',
			parent			: time_machine_list_wrap
		})

	// time_machine_list events
		self.events_tokens.push(
			event_manager.subscribe('render_' + self.caller.id, fn_updated_section)
		)
		function fn_updated_section(){
			// triggered after section pagination, it forces relation list update
			const is_open = !time_machine_list_body.classList.contains('hide')
			if (is_open) {
				load_time_machine_list()
			}
		}

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			header				: time_machine_list_head,
			content_data		: time_machine_list_body,
			collapsed_id		: 'inspector_time_machine_list',
			collapse_callback	: unload_time_machine_list,
			expose_callback		: load_time_machine_list,
			default_state		: 'closed'
		})
		async function load_time_machine_list( instance ) {
			self.section_id	= self.caller.section_id

			const time_machine_list	= (instance && instance.model==='time_machine_list')
				? instance // pagination case do not need to init time_machine_list
				: await instances.get_instance({
					model			: 'time_machine_list',
					tipo			: self.caller.context['time_machine_list'],
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					mode			: self.mode
				})

			await time_machine_list.build()
			const time_machine_list_wrap = await time_machine_list.render()
			while (time_machine_list_body.firstChild) {
				time_machine_list_body.removeChild(time_machine_list_body.firstChild)
			}
			await time_machine_list_body.appendChild(time_machine_list_wrap)
			time_machine_list_head.classList.add('up')
		}
		function unload_time_machine_list() {
			self.section_id = self.caller.section_id

			while (time_machine_list_body.firstChild) {
				time_machine_list_body.removeChild(time_machine_list_body.firstChild);
			}
			time_machine_list_head.classList.remove('up')
		}


	return time_machine_list_wrap
};//end render_time_machine_list



/**
* RENDER_ACTIVITY_INFO
* @return DOM node time_machine_list_wrap
*/
const render_activity_info = function(self) {

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info'
		})

	// activity_info_head
		const activity_info_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_head icon_arrow',
			inner_html		: get_label.actividad || 'Activity',
			parent			: wrapper
		})

	// activity_info_body
		const activity_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_body hide',
			parent			: wrapper
		})

	// events
		self.events_tokens.push(
			event_manager.subscribe('save', fn_saved)
		)
		function fn_saved(options){
			const node_info = render_node_info(options)
			activity_info_body.prepend(node_info)
		}

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			header				: activity_info_head,
			content_data		: activity_info_body,
			collapsed_id		: 'inspector_activity_info',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			activity_info_head.classList.remove('up')
		}
		function expose() {
			activity_info_head.classList.add('up')
		}


	return wrapper
};//end render_activity_info



/**
* OPEN_ONTOLOGY_WINDOW
* @return
*/
const open_ontology_window = function(tipo) {

	window.docu_window = window.docu_window || null

	// case online documentation window https://dedalo.dev/ontology

	const url = 'https://dedalo.dev/ontology/' + tipo + '?lang=' + page_globals.dedalo_application_lang
	if (window.docu_window && !window.docu_window.closed) {
		window.docu_window.location = url
		window.docu_window.focus()
	}else{
		const window_width	= 1001
		const screen_width	= window.screen.width
		const screen_height	= window.screen.height
		window.docu_window	= window.open(
			url,
			'docu_window',
			`left=${screen_width-window_width},top=0,width=${window_width},height=${screen_height}`
		)
	}

	return true
};//end open_ontology_window


