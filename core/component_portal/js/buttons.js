// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	import {object_to_url_vars, open_window, open_records_in_window, clone} from '../../common/js/utils/index.js'



/**
* BUTTONS
* Manages component buttons render
*/
export const buttons = () => {}



/**
* RENDER_BUTTON_UPDATE_DATA_EXTERNAL
* Builds the button nodes and events
* @param object self (component instance)
* @return HTMLElement button_update_data_external
*/
buttons.render_button_update_data_external = (self) => {

	// button_update data external
	const button_update_data_external = ui.create_dom_element({
		element_type	: 'span',
		title			: get_label.update || 'Update',
		class_name		: 'button sync'
	})

	// event click
	const update_data_external_click_handler = async function(e) {
		e.stopPropagation()

		// Validate source exists before modifying
		if (!self.rqo?.source) {
			console.error('Cannot update: source is not available');
			return;
		}

		// force server data to calculate external data
		const source = self.rqo.source
		source.build_options = {
			get_dato_external : true
		}
		// refresh
		self.refresh({
			build_autoload	: true,
			render_level	: 'content'
		})
	}
	button_update_data_external.addEventListener('click', update_data_external_click_handler)


	return button_update_data_external
}//end render_button_update_data_external



/**
* RENDER_BUTTON_ADD
* Builds the button nodes and events
* @param object self (component instance)
* @return HTMLElement button_add
*/
buttons.render_button_add = (self) => {

	const target_section		= self.target_section || []
	const target_section_length	= target_section.length

	// sort section by label ascendant
	target_section.sort((a, b) => (a.label > b.label) ? 1 : -1)

	const button_add = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'button add',
		title			: get_label.new || 'New'
	})

	// event click
	const add_click_handler = async function(e) {
		e.stopPropagation()

		if (target_section_length === 0) {
			alert('Error. No target sections available');
			return
		}

		// target_section_tipo. to add section selector
		const target_section_tipo = target_section_length > 1
			? false
			: target_section[0]?.tipo
		if (!target_section_tipo) {
			alert('Error. Empty or invalid target_section');
			return
		}

		// add_new_element
		try {
			const result = await self.add_new_element(target_section_tipo)
			if (result===true) {

				// Validate data structure
				if (!self.data?.value || !Array.isArray(self.data.value) || self.data.value.length === 0) {
					console.error('Invalid data structure');
					return;
				}

				// last_value. Get the last value of the portal to open the new section
				const last_value	= self.data.value[self.data.value.length-1]
				const section_tipo	= last_value.section_tipo
				const section_id	= last_value.section_id

				// section. Create the new section instance
				const section = await get_instance({
					model			: 'section',
					mode			: 'edit',
					tipo			: section_tipo,
					section_tipo	: section_tipo,
					section_id		: section_id,
					inspector		: false,
					session_save	: false,
					session_key		: 'section_' + section_tipo + '_' + self.tipo
				})
				await section.build(true)
				const section_node = await section.render()

				// header
				const header = (get_label.new || 'New section') + ' ' + target_section[0].label

				// modal. Create a modal to attach the section node
				const modal = ui.attach_to_modal({
					header		: header,
					body		: section_node
				})
				modal.on_close = function(){
					self.refresh().then(()=>{
						event_manager.publish('add_row_'+ self.id)
					})
				}

				// activate_first_component. Get the first ddo in ddo_map to be focused
				ui.activate_first_component({
					section	: section
				})
			}//end if (result===true)
		} catch (error) {
			console.error('Error adding new element:', error);
			alert('An error occurred while adding the new element');
		}

		// Clean up. Remove aux items
		if (window.page_globals.service_autocomplete) {
			window.page_globals.service_autocomplete.destroy(true, true, true)
		}
	}
	button_add.addEventListener('click', add_click_handler)


	return button_add
}//end render_button_add



/**
* RENDER_BUTTON_LINK
* Builds the button nodes and events
* @param object self (component instance)
* @return HTMLElement button_link
*/
buttons.render_button_link = (self) => {

	const target_section		= self.target_section || []
	const target_section_length	= target_section.length

	const button_link = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'button link',
		title			: get_label.vincular_recurso || 'Link resource'
	})
	// event mousedown
	const mousedown_handler = async function(e) {
		e.stopPropagation()

		const section_tipo = target_section[0]?.tipo;
		if (!section_tipo) {
			alert("Error on get section_tipo");
			return
		}

		// iframe
		( () => {

			const get_iframe_url = (tipo) => {

				const session_key = 'section_' + tipo + '_' + self.tipo

				const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
					tipo		: tipo,
					mode		: 'list',
					session_key	: session_key, // used to save server and local DDB custom SQO
					menu		: false,
					initiator	: self.id // initiator is the caller (self)
				})

				return url
			}

			// modal_body
				const iframe_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'iframe_container'
				})
				const iframe = ui.create_dom_element({
					element_type	: 'iframe',
					class_name		: 'fixed',
					src				: get_iframe_url(section_tipo),
					parent			: iframe_container
				})

			// modal_header
				// header_custom
				const header_custom = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'header_custom'
				})
				// header label
				ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.section,
					class_name		: 'label',
					parent			: header_custom
				})

			// select_section
				const select_section = ui.create_dom_element({
					element_type	: 'select',
					class_name		: 'select_section' + (target_section_length===1 ? ' mono' : ''),
					parent			: header_custom
				})
				select_section.addEventListener('click', function(e){
					e.stopPropagation()
				})
				select_section.addEventListener('mousedown', function(e){
					e.stopPropagation()
				})
				select_section.addEventListener('change', function(){
					iframe.src = get_iframe_url(this.value)
				})
				// options for select_section
					for (let i = 0; i < target_section_length; i++) {
						const item = target_section[i]
						ui.create_dom_element({
							element_type	: 'option',
							value			: item.tipo,
							inner_html		: item.label + ' [' + item.tipo + ']',
							parent			: select_section
						})
					}

			// fix modal to allow close later, on set value
				self.modal = ui.attach_to_modal({
					header	: header_custom,
					body	: iframe_container,
					footer	: null,
					size	: 'big'
				})

		})()
		return
	}
	button_link.addEventListener('mousedown', mousedown_handler)


	return button_link
}//end render_button_link



/**
* RENDER_BUTTON_LIST
* Builds the button nodes and events
* @param object self (component instance)
* @return HTMLElement button_list
*/
buttons.render_button_list = (self) => {

	const target_section	= self.target_section || []
	const first_section		= target_section[0] || null

	// Validate first_section exists
	if (!first_section) {
		console.error('No target section available for list button');
		return null;
	}

	// label
	const label = (SHOW_DEBUG === true)
		? `${first_section.label || 'Unknown'} [${first_section.tipo || 'Unknown'}]`
		: (first_section.label || 'Unknown')

	// Ensure label is a string before using replace
	const clean_label = typeof label === 'string'
		? label.replace(/(<([^>]+)>)/ig, '')
		: 'Unknown'

	const button_list = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'button pen',
		title			: clean_label
	})

	// event mousedown
	const mousedown_handler = function(e){
		e.stopPropagation()

		// Validate required dependencies
		if (typeof DEDALO_CORE_URL === 'undefined') {
			console.error('DEDALO_CORE_URL is not defined');
			return;
		}

		try {

			// open a new window
			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo	: first_section.tipo,
				mode	: 'list',
				menu	: false
			})
			open_window({
				url		: url,
				name	: 'section_view',
				width	: 1280,
				height	: 740,
				on_blur : () => {
					// refresh current instance
					self.refresh({
						build_autoload : true
					})
				}
			})

		} catch (error) {
			console.error('Error opening window:', error);
		}
	}//end mousedown_handler
	button_list.addEventListener('mousedown', mousedown_handler)


	return button_list
}//end render_button_list



/**
* RENDER_LIST_FROM_COMPONENT_DATA_BUTTON
* Builds the button nodes and events
* @param object self (component instance)
* @return HTMLElement list_from_component_data_button
*/
buttons.render_list_from_component_data_button = (self) => {

	const list_from_component_data_button = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'button list',
		title			: get_label.list_from_component_data || 'List from component data'
	})
	// event mousedown. Add listener to the button
	const mousedown_handler = async (e) => {
		e.stopPropagation()

		if (!self.request_config_object?.sqo) {
			console.error('Missing request config object');
			return;
		}

		try {

			const total = await self.get_total()
			const limit = self.request_config_object.sqo?.limit || 10
			const value = (total > limit)
				? await (async ()=>{
					// get component all data (without pagination)
					// data_manager request to API to obtain component data
					const rqo = clone(self.rqo)
						  rqo.sqo.limit = 0;
						  rqo.sqo.offset = 0;
						  rqo.prevent_lock = true;
					const api_response = await data_manager.request({
						body : rqo
					})
					if (!api_response?.result) {
						console.error('Failed api response:', api_response);
						return []
					}

					const datum	= api_response.result?.data || []
					const data	= datum.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo) || {}

					return data.value || []
				  })()
				: (self.data?.value || [])

			if (value.length === 0) {
				return
			}

			// section tipo
			const ar_section_tipo			= value.map(el => el?.section_tipo).filter(tipo => tipo !== undefined)
			const unique_ar_section_tipo	= [...new Set(ar_section_tipo)];

			if (unique_ar_section_tipo.length > 1) {
				alert('Multiple target sections. Displaying only ' + unique_ar_section_tipo[0] || 'Unknown');
			}

			const section_tipo = unique_ar_section_tipo[0]
			if (!section_tipo) {
				console.warn('No valid section_tipo found')
				return
			}

			// section_id list
			const ar_section_id = value
				.filter(el => el.section_tipo === section_tipo && el.section_id)
				.map(el => el.section_id)

			// open_records_in_window
			open_records_in_window(self, section_tipo, ar_section_id, null);

		} catch (error) {
            console.error('Error in mousedown_handler:', error);
        }
	}
	list_from_component_data_button.addEventListener('mousedown', mousedown_handler)

	// event change data
	const update_value_handler = () => {

		// Early return if required dependencies are missing
		if (!self?.data || !list_from_component_data_button) {
			console.warn('update_value_handler: Missing required dependencies');
			return;
		}

		const value		= self.data.value || [];
		const has_data	= value.length > 0;

		// Toggle for display the button
		list_from_component_data_button.classList.toggle('hide', !has_data);
	}
	self.events_tokens.push(
		event_manager.subscribe('update_value_' + self.id_base, update_value_handler)
	)

	// Initial display logic
	// Display only if contains data
    update_value_handler();


	return list_from_component_data_button
}//end render_list_from_component_data_button



/**
* RENDER_BUTTON_TREE_SELECTOR
* Builds the button nodes and events
* @param object self (component instance)
* @return HTMLElement button_tree_selector
*/
buttons.render_button_tree_selector = (self) => {

	const button_tree_selector = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'button tree',
		title			: get_label.vincular_recurso || 'Link resource'
	})

	// event mousedown. Add listener to the button
	const mousedown_handler = (e) => {
		e.stopPropagation()

		try {
            // open new area_thesaurus/area_ontology window for relation
            self.open_ontology_window('relation')
        } catch (error) {
            console.error('Error opening ontology window:', error);
        }
	}
	button_tree_selector.addEventListener('mousedown', mousedown_handler)


	return button_tree_selector
}//end render_button_tree_selector



// @license-end
