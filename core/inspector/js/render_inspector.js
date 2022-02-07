/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {download_url} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
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
			class_name		: 'label',
			inner_html		: 'Inspector'
		})

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id				: 'inspector',
			class_name		: 'wrapper_inspector',
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
				if (e.target.matches('.label')) {

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
				}

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
			class_name		: 'content_data inspector_content_data',
		})

	// paginator container
		const paginator_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator',
			parent			: content_data
		})
		// fix pointer to node placeholder
		self.paginator_container = paginator_container

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: content_data
		})

		// button_search. Show and hide all search elements
			const button_search = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light search',
				inner_html		: get_label.buscar || "Search",
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
				inner_html		: get_label.nuevo || "New",
				parent			: buttons_container
			})
			button_new.addEventListener('click', (e) => {
				e.stopPropagation()
				event_manager.publish('new_section_' + self.caller.id)
			})

	// element_info
		const element_info = render_element_info(self)
		content_data.appendChild(element_info)

	// project container
		const project_block = render_project_block(self)
		content_data.appendChild(project_block)

	// indexation_list container
		// if (self.caller.context.indexation_list) {
			const indexation_list = render_indexation_list(self)
			content_data.appendChild(indexation_list)
		// }

	// relation_list container
		if (self.caller.context.relation_list) {
			const relation_list = render_relation_list(self)
			content_data.appendChild(relation_list)
		}//end if (self.caller.context.relation_list)

	// time_machine_list container
		if (self.caller.context.time_machine_list) {
			const time_machine_list = render_time_machine_list(self)
			content_data.appendChild(time_machine_list)
		}//end if (self.caller.context.time_machine_list)

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
				// window.open( DEDALO_CORE_URL + '/json/' + self.section_tipo + '/' + self.section_id )
				window.open( DEDALO_CORE_URL + '/json/json_display.php?url_locator=' + self.section_tipo + '/' + self.section_id )
			})
		// tool register files.	dd1340
			const section_tipo = self.caller.tipo
			if (section_tipo==="dd1340") {
				const register_download = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning download register_download',
					text_content	: "Download register file",
					parent			: buttons_bottom_container
				})
				register_download.addEventListener("click", (e)=>{
					e.preventDefault()
					const url		= DEDALO_CORE_URL + '/json/json_display.php?url_locator=' + self.section_tipo + '/' + self.section_id
					const file_name	= "register.json"
					// download_url (import from data_manager) temporal link create and click
					if (confirm(`Donwload file: ${file_name} ?`)) {
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
			text_content	: get_label.seccion || 'Section',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: label,
			parent			: fragment
		})

	// tipo
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			text_content	: get_label.tipo || 'Tipo',
			parent			: fragment
		})
		// value
		const tipo_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: section_tipo,
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
			text_content	: get_label.creado || 'Created',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: created_date + ' ' + created_by_user_name,
			parent			: fragment
		})

	// section modified
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			text_content	: get_label.modificado || 'Modified',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: modified_date + ' ' + modified_by_user_name,
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
* RENDER_component_INFO
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
		const value			= component.data.value
			? JSON.stringify(component.data.value, null, 1)
			: ''

	const fragment = new DocumentFragment();

	// section name
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			text_content	: get_label.componente || 'Component',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: label,
			parent			: fragment
		})

	// tipo
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			text_content	: get_label.tipo || 'Tipo',
			parent			: fragment
		})
		// value
		const tipo_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: tipo,
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
			text_content	: get_label.modelo || 'Model',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: model,
			parent			: fragment
		})

	// translatable
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			text_content	: get_label.traducible || 'Translatable',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: translatable,
			parent			: fragment
		})

	// value
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key wide',
			text_content	: get_label.dato || 'Data',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value wide code',
			text_content	: value,
			parent			: fragment
		})


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

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			header				: project_head,
			content_data		: project_container_body,
			collapsed_id		: 'inspector_project_block',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			console.log("collapsed project:", this);
			project_head.classList.remove('up')
		}
		function expose() {
			project_head.classList.add('up')
		}


	return project_wrap
};//end render_project_block



/**
* RENDER_INDEXATION_LIST
* @return DOM node relation_list_wrap
*/
const render_indexation_list = function(self) {

	// wrapper
		const indexation_list_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'indexation_list'
		})

	// indexation_list_head
		const indexation_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'indexation_list_head icon_arrow',
			inner_html		: get_label.indexaciones || 'Indexations',
			parent			: indexation_list_wrap
		})

	// indexation_list_body
		const indexation_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'indexation_list_body hide',
			inner_html		: 'Working here..',
			parent			: indexation_list_wrap
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


	return indexation_list_wrap
};//end render_indexation_list



/**
* RENDER_RELATION_LIST
* @return DOM node relation_list_wrap
*/
const render_relation_list = function(self) {

	// wrapper
		const relation_list_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list'
		})

	// relation_list_head
		const relation_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_head icon_arrow',
			inner_html		: get_label.relaciones || "Relations",
			parent			: relation_list_wrap
		})

	// relation_list_body
		const relation_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_body hide',
			parent			: relation_list_wrap
		})

	// relation_list events
		self.events_tokens.push(
			event_manager.subscribe('relation_list_paginator', fn_relation_list_paginator),
			event_manager.subscribe('render_' + self.caller.id, fn_updated_section)
		)
		function fn_relation_list_paginator(relation_list) {
			relation_list_body.classList.add('loading')
			load_relation_list(relation_list)
			.then(function(){
				relation_list_body.classList.remove('loading')
			})
		}
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
			const relation_list_wrap = await relation_list.render()
			while (relation_list_body.firstChild) {
				relation_list_body.removeChild(relation_list_body.firstChild)
			}
			relation_list_body.appendChild(relation_list_wrap)
		}
		function unload_relation_list() {
			self.section_id = self.caller.section_id

			while (relation_list_body.firstChild) {
				relation_list_body.removeChild(relation_list_body.firstChild);
			}
			relation_list_head.classList.remove('up')
		}


	return relation_list_wrap
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
			// options
				const instance		= options.instance
				const api_response	= options.api_response

			// node_info. create temporal node info
				const node_info = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'node_info_save_msg'
				})
				// add at top
				activity_info_body.prepend(node_info)
				node_info.addEventListener("click", function(){
					node_info.remove()
				})

			// msg. Based on API response result
				if (api_response.result===false) {
					node_info.classList.add('error')
					const text = `${get_label.fail_to_save || 'Failed to save'} <br>${instance.label}`
					node_info.insertAdjacentHTML('afterbegin', text)
					// error msg
						const msg = []
						if (api_response.error) {
							msg.push(api_response.error)
						}
						if (api_response.msg) {
							msg.push(api_response.msg)
						}
						if (msg.length>0) {
							node_info.insertAdjacentHTML('beforeend', '<br>' + msg.join('<br>') )
						}
				}else{
					node_info.classList.add('ok')
					const text = `${instance.label} ${get_label.guardado || 'Saved'}`
					node_info.insertAdjacentHTML('afterbegin', text)
					setTimeout(function(){
						node_info.remove()
					}, 15000)
				}
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


