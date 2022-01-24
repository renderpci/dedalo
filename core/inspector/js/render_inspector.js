/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {download_url} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'



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
			class_name		: 'wrapper_inspector text_unselectable',
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
		// wrapper.addEventListener("mousedown", function(e){
		// 	e.stopPropagation()
		// 	//e.preventDefault()
		// 	// prevent buble event to container element
		// 	return false
		// })


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
					// console.log("relation_list_wrap.clientHeight:", e.target.parentNode.clientHeight);
					// relation_list_body.style.height = relation_list_body.style.height

					while (relation_list_body.firstChild) {
						relation_list_body.removeChild(relation_list_body.firstChild);
					}
					if (relation_list_head.classList.contains('up')) {
						relation_list_head.classList.remove('up')
						return
					}
					relation_list_head.classList.add('up')
					self.section_id = self.caller.section_id
					const relation_list = await self.get_instance('relation_list', self.section_tipo, self.section_tipo, self.section_id)
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
					// const relation_list = await self.get_instance('relation_list',self.section_tipo, self.section_tipo, self.section_id)
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
			// relation_list_head
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

				})
			// time_machine_list_body
				const time_machine_list_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'time_machine_list_body',
					parent			: time_machine_list_wrap
				})
		}//end if (self.caller.context.time_machine_list)

	// project container
		const project_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_container',
			parent			: content_data
		})

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


