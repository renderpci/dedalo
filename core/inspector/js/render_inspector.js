/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {download_url} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
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
			parent 			: content_data
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
		const element_info_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'element_info_wrap',
			parent			: content_data
		})
		// element_info_head
			const element_info_head = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'element_info_head icon_arrow up',
				inner_html		: get_label.info || "Info",
				parent			: element_info_wrap
			})
			element_info_head.addEventListener('click', async function(){
				element_info_container.classList.toggle('hide')
				element_info_head.classList.toggle('up')
			})
		// element_info_container
			const element_info_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'element_info',
				parent			: element_info_wrap
			})
			// fix pointer to node placeholder
			self.element_info_container = element_info_container

	// project container
		const project_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_wrap',
			parent			: content_data
		})
		// project_head
			const project_head = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'project_head icon_arrow up',
				inner_html		: get_label.proyecto || "Project",
				parent			: project_wrap
			})
			project_head.addEventListener('click', async function(){
				project_container.classList.toggle('hide')
				project_head.classList.toggle('up')
			})
		// project container
			const project_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'project_container',
				parent			: project_wrap
			})

	// indexation_list container
		if (self.caller.context.indexation_list) {
			const indexation_list = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'indexation_list',
				inner_html		: get_label.indexaciones || "Indexations",
				parent			: content_data
			})
		}

	// relation_list container
		if (self.caller.context.relation_list) {

			const relation_list_wrap = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'relation_list',
				parent			: content_data
			})
			// relation_list_head
				const relation_list_head = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'relation_list_head icon_arrow',
					inner_html		: get_label.relaciones || "Relations",
					parent			: relation_list_wrap
				})
				relation_list_head.addEventListener('click', async function(){

					while (relation_list_body.firstChild) {
						relation_list_body.removeChild(relation_list_body.firstChild);
					}
					if (relation_list_head.classList.contains('up')) {
						relation_list_head.classList.remove('up')
						return
					}
					relation_list_head.classList.add('up')
					self.section_id		= self.caller.section_id
					const relation_list	= await instances.get_instance({
						model			: 'relation_list',
						tipo			: self.caller.context['relation_list'],
						section_tipo	: self.section_tipo,
						section_id		: self.section_id,
						mode			: self.mode
					})
					await relation_list.build()
					const relation_list_wrap = await relation_list.render()
					relation_list_body.appendChild(relation_list_wrap)
				})
			// relation_list_body
				const relation_list_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'relation_list_body',
					parent			: relation_list_wrap
				})
			// relation_list events
				self.events_tokens.push(
					event_manager.subscribe('paginator_goto_paginator_' + self.caller.id, fn_paginator_goto),
					event_manager.subscribe('relation_list_paginator', fn_relation_list_paginator)
				)
				function fn_paginator_goto() {
					relation_list_head.classList.remove('up')
					self.section_id = self.caller.section_id
					while (relation_list_body.firstChild) {
						relation_list_body.removeChild(relation_list_body.firstChild)
					}
				}
				async function fn_relation_list_paginator(relation_list) {
					relation_list_body.classList.add('loading')
					self.section_id = self.caller.section_id
					await relation_list.build()
					const relation_list_wrap = await relation_list.render()
					while (relation_list_body.firstChild) {
						relation_list_body.removeChild(relation_list_body.firstChild)
					}
					await relation_list_body.appendChild(relation_list_wrap)
					relation_list_body.classList.remove('loading')
				}
		}//end if (self.caller.context.relation_list)

	// time_machine_list container
		if (self.caller.context.time_machine_list) {

			const time_machine_list_wrap = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'time_machine_list',
				parent			: content_data
			})
			// time_machine_list_head
				const time_machine_list_head = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'relation_list_head icon_arrow',
					inner_html		: get_label.latest_changes || "Latest changes",
					parent			: time_machine_list_wrap
				})
				time_machine_list_head.addEventListener('click', async function(){
					while (time_machine_list_body.firstChild) {
						time_machine_list_body.removeChild(time_machine_list_body.firstChild);
					}
					if (time_machine_list_head.classList.contains('up')) {
						time_machine_list_head.classList.remove('up')
						return
					}
					time_machine_list_head.classList.add('up')
					// do something

					self.section_id		= self.caller.section_id
					const time_machine_list	= await instances.get_instance({
						model			: 'time_machine_list',
						tipo			: self.caller.context['time_machine_list'],
						section_tipo	: self.section_tipo,
						section_id		: self.section_id,
						mode			: self.mode
					})
					await time_machine_list.build()
					const time_machine_list_wrap = await time_machine_list.render()
					time_machine_list_body.appendChild(time_machine_list_wrap)


				})
			// time_machine_list_body
				const time_machine_list_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'time_machine_list_body',
					parent			: time_machine_list_wrap
				})
		}//end if (self.caller.context.time_machine_list)

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
	console.log("component:",component);

	// values from caller (section)
		const tipo			= component.tipo
		const label			= component.label
		const model			= component.model
		const translatable	= JSON.stringify(component.context.translatable)
		const value			= JSON.stringify(component.data.value, null, 1)

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
		const model_info = ui.create_dom_element({
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