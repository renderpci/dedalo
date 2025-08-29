// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../common/js/ui.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {event_manager} from '../../../common/js/event_manager.js'
	import {clone} from '../../../common/js/utils/index.js'
	import {get_instance} from '../../../common/js/instances.js'
	import {get_section_records} from '../../../section/js/section.js'



/**
* VIEW_DEFAULT_AUTOCOMPLETE
* Manages the service's logic and appearance in client side
*/
export const view_default_autocomplete = function() {

	return true
}//end view_default_autocomplete



/**
* RENDER
* Render node for use like button
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_autocomplete.render = async function (self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			// fix pointers
			self.node.content_data = content_data
			return content_data
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_service_autocomplete'
		})
		wrapper.appendChild(content_data)
		// fix pointers
		wrapper.content_data = content_data
		// prevent to deactivate component on autocomplete click
		wrapper.addEventListener('mousedown', function(e) {
			if (!e.altKey) {
				e.stopPropagation()
			}
		})
		wrapper.addEventListener('click', function(e) {
			e.stopPropagation()
		})

		if(self.caller.mode==='search'){
			wrapper.classList.add('search')
		}

		if(self.caller.node.classList.contains('hilite_element')){
			wrapper.classList.add('hilite_element')
		}

	// position calculate based on caller node (usually a component_portal wrapper)
		if (self.caller.node) {


			/*
				const reference_node = self.caller.node

				// set_size (and position too)
					function set_size(reference_node) {

						const rect	= reference_node.getBoundingClientRect();
						const top	= rect.bottom  + window.scrollY // + 20
						const left	= rect.left  + window.scrollX // + 20
						const width	= rect.width

						// set coordinates. Same as reference_node position
						wrapper.style.left	= left  + 'px'
						wrapper.style.top	= top   + 'px'
						wrapper.style.width	= width + 'px'
					}
					set_size(reference_node)

				// window resize event
					window.addEventListener('resize', fn_on_resize)
					function fn_on_resize(){
						ui.component.deactivate(self.caller)
						window.removeEventListener('resize', fn_on_resize)
					}

				// resize observer. If reference_node changes size, the wrapper size is recalculated
					const resizeObserver = new ResizeObserver((entries) => {
						set_size(reference_node)
					});
					resizeObserver.observe(reference_node);

				// scroll observer. On page scroll, update wrapper position
					function scroll_observer(node) {
						window.removeEventListener('scroll', fn_scroll)
						let lastKnownScrollPosition	= 0;
						let ticking					= false;
						function update_value(scrollPos) {
							const rect	= node.getBoundingClientRect();
							const top	= rect.bottom  + window.scrollY //- scrollPos
							// set coordinates. Same as node position
							wrapper.style.top = top + 'px'
						}
						window.addEventListener('scroll', fn_scroll)
						function fn_scroll(event) {
							lastKnownScrollPosition = window.scrollY;
							if (!ticking) {
								window.requestAnimationFrame(() => {
									update_value(lastKnownScrollPosition);
									ticking = false;
								});
								ticking = true;
							}
						};
					}//end scroll_observer

				// set z-index to 4 if any ancestor is dd-modal
					function set_zindex(node) {
						let el = node
						while (el.parentNode) {
							el = el.parentNode;
							if (el.tagName === 'DD-MODAL') {
								// is inside modal

								// increase z-index from 3 to 4 for modal
								wrapper.style.zIndex = 4

								// set wrapper position as fixed from absolute. Optionally use scroll_observer function
								// wrapper.style.position = 'fixed'

								scroll_observer(node)

								if(SHOW_DEBUG===true) {
									console.log(')))) DD-MODAL wrapper inside. Set z-index to 4:', wrapper);
								}
								return
							}
						}
					}
					set_zindex(reference_node)
					*/

		}//end if (self.caller.node)


	// fix node
		self.node = wrapper

	// event publish
		event_manager.publish('render_'+self.id, self.node)



	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Creates the DOM nodes of the service
* @param object self
* @return DocumentFragment fragment
*/
const get_content_data = function(self) {

	// fragment
		const fragment = new DocumentFragment()

	// check there exists valid target sections before create the options and selector
		const all_ar_section	= []
		const ar_source			= self.context.request_config || []
		const ar_source_length	= ar_source.length
		for (let i = 0; i < ar_source_length; i++) {
			const source		= ar_source[i]
			const current_sqo	= source.sqo
			const ar_section	= current_sqo.section_tipo
			if (ar_section) {
				all_ar_section.push(...ar_section)
			}
		}
		if (all_ar_section.length<1) {
			const ontology_link = ui.get_ontology_term_link(self.tipo)
			const msg = `Invalid target section tipo (empty).
						Please, configure at least one target section tipo for current component:
						${ontology_link.outerHTML}`
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'debug',
				inner_html		: msg,
				parent			: fragment
			})
			return fragment
		}

	// options container
		const options_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'options_hidden',
			parent			: fragment
		})

	// source selector (Dédalo, Zenon, etc.)
		const source_selector = render_source_selector(self)
		options_container.appendChild(source_selector)

	// sections selector
		const sections_selector = render_filters_selector(self)
		options_container.appendChild(sections_selector)

	// components fields for inputs_list
		const inputs_list = render_inputs_list(self)
		options_container.appendChild(inputs_list)

	// operator selector
		const operator_selector = render_operator_selector(self)
		options_container.appendChild(operator_selector)

	// search_input
		const search_input = render_search_input(self)
		fragment.appendChild(search_input)

		// scroll to search input
			// search_input.addEventListener('focus', function(e){
			// 	e.preventDefault()
			// 	search_input.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'nearest'})
			// })

	// button options
		const button_options = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_options button gear',
			parent			: fragment
		})
		// add listener to the select
		button_options.addEventListener('mouseup', function() {
			options_container.classList.toggle('visible');
		})

	// datalist_node
		const datalist_node = ui.create_dom_element({
			element_type	: 'ul',
			id				: self.list_name,
			class_name		: 'autocomplete_data',
			parent			: fragment
		})

		// keydown event (document)
		document.addEventListener('keydown', fn_service_autocomplete_keys, false)
		function fn_service_autocomplete_keys(e) {
			// deactivate when the caller is not focused, it block keydown of other components.
			if (!self.caller.active) {
				return
			}
			self.service_autocomplete_keys(e)
		}
		// remove the event when the caller is deactivate to avoid conflicts between events
		const deactivate_component_handler = (component) => {
			if (component.id===self.caller.id) {
				document.removeEventListener('keydown', fn_service_autocomplete_keys, false)
			}
		}
		self.events_tokens.push(
			event_manager.subscribe('deactivate_component', deactivate_component_handler)
		)

	// fix main nodes pointers
		self.search_input		= search_input
		self.datalist			= datalist_node
		self.options_container	= options_container


	return fragment
}//end render



/**
* RENDER_SOURCE_SELECTOR
* @param object self
* @return HTMLElement source_selector
*/
const render_source_selector = function(self) {

	// source elements
		const ar_source = self.context.request_config

	// switcher source
		const source_selector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'source_selector'
		})
		// label
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'css_label label',
			inner_html		: get_label.source || 'Source',
			parent			: source_selector
		})
		// select
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'select_source_selector',
			parent			: source_selector
		})

		// options
			const ar_search_length = ar_source.length
			for (let i = 0; i < ar_search_length; i++) {

				const source			= ar_source[i]
				const current_sqo		= source.sqo //find(item => item.typo === 'sqo')
				const ar_section		= current_sqo.section_tipo
				// const request_ddo	= source.find(item => item.typo === 'request_ddo').value
				// const ddo_section	= request_ddo.find(item => item.type === 'section' && item.typo === 'ddo')
				const search_engine		= source.api_engine//find(current_item=> current_item.typo==='search_engine').value

				const label = ar_section && ar_section.length > 1
					? (ar_section[0].label || ('Unknown label ' + ar_section[0])) + ', etc.'
					: ar_section && ar_section[0]
						? ar_section[0].label || ('Unknown label ' + ar_section[0])
						: 'Unknown label ' + JSON.stringify(ar_section)

				const swicher_source = ui.create_dom_element({
					element_type	: 'option',
					parent			: select,
					value			: i.toString(), // pass key as string option
					inner_html		: label
				})

				if (search_engine===self.search_engine) {
					swicher_source.setAttribute('selected', true)
				}
			}//end for (let i = 0; i < ar_search_length; i++)

		// add listener to the select
		select.addEventListener('change', async function(e){

			// reset search cache
			self.search_cache = []

			const key = e.target.value

			const request_config_object = clone(self.context.request_config[key])

			await self.build({
				request_config_object: request_config_object
			})
			const content_data = await self.render({
				render_level : 'content'
			})

			// clean the last list
			while (self.node.firstChild) {
				self.node.removeChild(self.node.firstChild)
			}
			self.node.appendChild(content_data)
			self.options_container.classList.add('visible');
		})

	// set default value
		// self.build_filter_fields(select.value, options)

	return source_selector
}//end render_source_selector



/**
* RENDER_SEARCH_INPUT
* Create the HTML of input search autocomplete
* @param object self
* @return HTMLElement search_input
*/
const render_search_input = function(self) {

	// search field
		const search_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'autocomplete_input'
		})
		search_input.setAttribute('list', self.list_name)
		search_input.setAttribute('placeholder', get_label.find + '...')
		// search_input.setAttribute('autocomplete', 'off')
		search_input.setAttribute('autocorrect', 'off')

		// Init a timeout variable to be used below
			let timeout = null
			let is_searching = false

		// input_handler
			const input_handler = async function(e) {
				e.stopPropagation();
				e.preventDefault();

				// is_searching. Search is locked until request finish
					if (is_searching === true) {
						return
					}

				// ignore keys
					const ignore_keys = [
						'Escape',
						'ArrowLeft',
						'ArrowRight',
						'ArrowUp',
						'ArrowDown',
						'Control',
						'Meta',
						'Alt',
						'Shift',
						'CapsLock',
						'Enter'
					]
					if (e.key && ignore_keys.includes(e.key)) {
						return
					}

				// is_paste
					const is_paste = (e.type && e.type==='paste')

				// paste case. Note that clipboard event trigger keyup event too. Because this,
				// lock search immediately after paste event to prevent search overlap
					if (is_paste) {
						// lock search until finish to prevent double search
						is_searching = true
						// Get pasted data via clipboard API (set e.preventDefault() before !)
						const clipboardData	= e.clipboardData || window.clipboardData;
						const pastedData	= clipboardData.getData('Text');
						search_input.value	= pastedData
					}

				// loading styles. class searching (remove icon magnifying glass)
					search_input.classList.add('searching')
					// spinner
					const prev_spinner = search_input.parentNode.querySelector('.spinner')
					if(prev_spinner){
						prev_spinner.remove()
					}
					const spinner = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner'
					})
					search_input.parentNode.insertBefore(spinner, search_input.nextSibling);

				// search prepare
					// q
						const q = search_input.value
						self.filter_free_nodes.map(el => {
							el.filter_item.q = ''
							el.value = ''
						})
					// split_q. ar q split iterate
						const split_q	= self.split_q(q)
						const ar_q		= split_q.ar_q
						if (split_q.divisor!==false) {
							// propagate to filter fields
							const filter_free_nodes_len	= self.filter_free_nodes.length
							for (let j = 0; j < filter_free_nodes_len; j++) {
								if (ar_q[j]) {
									self.filter_free_nodes[j].filter_item.q = ar_q[j]
									self.filter_free_nodes[j].value = ar_q[j]
								}
							}
						}else{
							self.filter_free_nodes.map(el => {
								el.filter_item.q = search_input.value
								el.value = search_input.value
							})
						}

				// Clear the timeout if it has already been set.
				// This will prevent the previous task from executing
				// if it has been less than <MILLISECONDS>
					if (timeout) {
						clearTimeout(timeout);
					}

				// datalist container node
					const datalist = self.datalist
					while (datalist.firstChild) {
						datalist.removeChild(datalist.firstChild);
					}
					const loading_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'loading_label',
						inner_html		: get_label.searching || 'Searching..',
						parent			: datalist
					})

				// search fire is delayed to enable multiple simultaneous selections
				// get final value (input events are fired one by one)
					const ms = self.search_cache[q] || is_paste===true
						? 1
						: 320 * 1
					timeout = setTimeout(async()=>{

						// api_response. Get from cache if exists
							const api_response = q.length && self.search_cache[q]
								? { result : self.search_cache[q] }
								: await self.autocomplete_search()

						// no result from API case
							if (api_response.result===false) {
								// loading styles. class searching
								search_input.classList.remove('searching')
								// spinner remove
								spinner.remove()
								// loading_label
								loading_label.remove()
								// unlock search
								is_searching = false
								return
							}

						// cache result. Add if not already exists
							if (!self.search_cache[q]) {
								self.search_cache[q] = api_response.result
							}

						// render datalist (call API and render the response result)
							await render_datalist(self, api_response.result)

						// loading styles. class searching
							search_input.classList.remove('searching')
							// spinner remove
							spinner.remove()

						// unlock search
						is_searching = false
					}, ms)
			}//end input_handler

		// event input. changes the input value fire the search
			search_input.addEventListener('keyup', input_handler);

		// event paste
			search_input.addEventListener('paste', input_handler);


	return search_input
}//end render_search_input



/**
* RENDER_FILTERS_SELECTOR
* @param object self
* @return HTMLElement filters_container
*/
const render_filters_selector = function(self) {

	const ar_id = []

	// container. Filters container
		const filters_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'filters_container' // css_autocomplete_hi_search_field
		})
		// fix
		self.filters_container = filters_container

	// sections filter
		const ar_sections			= self.ar_search_section_tipo // defined on init
		const ar_sections_length	= ar_sections.length
		if (ar_sections_length>0) {

			// get the datalist of all sections to create the checkbox
			const filter_items = []
			for (let i = 0; i < ar_sections_length; i++) {

				const section_tipo		= ar_sections[i]

				const label_find = self.request_config_object.sqo.section_tipo.find(el=> el.tipo===section_tipo)
				const label = label_find
					? label_find.label
					: ''

				const datalist_item	= {
					grouper	: 'sections',
					id		: section_tipo,
					value	: section_tipo,
					label	: label,
					change	: function(input_node){

						// reset search cache
						self.search_cache = []

						const index = ar_sections.indexOf(input_node.dd_value)
						if (input_node.checked===true && index===-1) {
							ar_sections.push(input_node.dd_value)
						}else{
							ar_sections.splice(index, 1);
						}
					}
				}
				filter_items.push(datalist_item)

				ar_id.push(section_tipo) // add to global array of id
			}

			const filter_id		= self.list_name
			const filter_label	= get_label.sections || "Sections"
			const filter_node	= build_filter(self, filter_items, filter_label, filter_id)
			filters_container.appendChild(filter_node)
		}

	// filter_by_list. if the component caller has a filter_by_list we add the datalist of the component
		const filter_by_list = self.rqo_search.sqo_options.filter_by_list//find(item => item.typo==='filter_by_list') || false
		if(filter_by_list) {

			const ar_filter_by_list	= self.ar_filter_by_list

			const filter_by_list_value_length = filter_by_list.length
			for (let i = 0; i < filter_by_list_value_length; i++) {

				const current_filter		= filter_by_list[i]
				const section				= current_filter.context.section_tipo
				const component_tipo		= current_filter.context.tipo
				const component_datalist	= current_filter.datalist
				const filter_label			= current_filter.context.label

				const filter_items = []
				for (let j = 0; j < component_datalist.length; j++) {

					const current_datalist	= component_datalist[j]
					const id				= section +'_'+ component_tipo +'_'+ current_datalist.section_id
					const q					= '"'+component_tipo +'_'+ current_datalist.value.section_tipo + '_' +current_datalist.value.section_id+'"'
					const path				= [{
						section_tipo	: section,
						component_tipo	: component_tipo
					}]
					const datalist_item		= {
						grouper	: component_tipo,
						id		: id,
						value	: {
							q				: q,
							path			: path,
							format 			: 'function',
							use_function	: 'relations_flat_fct_st_si'
						},
						label	: current_datalist.label,
						change	: function(input_node){

							// reset search cache
							self.search_cache = []

							const index = ar_filter_by_list.findIndex(item => item.id===input_node.id)
							if (input_node.checked===true && index===-1) {
								ar_filter_by_list.push({
									id		: input_node.id,
									value	: input_node.dd_value
								})
							}else{
								ar_filter_by_list.splice(index, 1);
							}
						}
					}
					filter_items.push(datalist_item)
					ar_filter_by_list.push(datalist_item)

					ar_id.push(id) // add to global array of id
				}
				const filter_id		= 'filter_by_list_' + component_tipo + '_' + i
				const filter_node	= build_filter(self, filter_items, filter_label,  filter_id)
				filters_container.appendChild(filter_node)
			}
		}

	// localStorage
		if (!localStorage.getItem(self.id)) {
			// add full the first time
			localStorage.setItem(self.id, JSON.stringify(ar_id) )
		}


	return filters_container
}//end render_filters_selector



/**
* BUILD_FILTER
* Render filter node checkbox items
* @param object self
* @param array filter_items
* @param string filter_name
* @param string filter_id
* @return HTMLElement filter_node
*/
const build_filter = function(self, filter_items, filter_name, filter_id) {

	const filter_node = ui.create_dom_element({
		element_type	: 'ul',
		class_name		: 'filter_node'
	})

	// all_selector li
		const all_selector = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'all_selector',
			parent			: filter_node
		})

	// label
		const label = get_label.all || 'All'
		const all_section_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label + ' ' + filter_name,
			parent			: all_selector
		})

	// all_section_checkbox
		const all_section_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			id				: filter_id + '_all'
		})
		all_section_checkbox.checked = false
		// change event
		const change_handler = (e) => {
			// reset search cache
			self.search_cache = []

			const checked_value	= e.target.checked
			const inputs		= filter_node.querySelectorAll('input')
			for (let i = 0; i < inputs.length; i++) {
				if (inputs[i]==all_section_checkbox) continue;
				if (inputs[i].checked!==checked_value) {
					inputs[i].checked = checked_value
					inputs[i].dispatchEvent(new Event('change'));
				}
			}
		}
		all_section_checkbox.addEventListener('change', change_handler);
		// prepend
		all_section_label.prepend(all_section_checkbox)

	// items
		filter_items.map(filter_item => {
			const chekbox_node = render_option_checkbox(self, filter_item)
			filter_node.appendChild(chekbox_node)
		})


	return filter_node
}//end build_filter



/**
* RENDER_OPTION_CHECKBOX
*
* @param object self
* @param object datalist_item
* @return HTMLElement li
*/
const render_option_checkbox = function(self, datalist_item) {

	const id		= datalist_item.id
	const value		= datalist_item.value
	const label		= datalist_item.label || value
	const change	= datalist_item.change

	// li container
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// label
		const section_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label,
			title			: label,
			parent			: li
		})

	// input_checkbox
		const input_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			id				: id

		})
		input_checkbox.checked	= true; // default value is true
		input_checkbox.dd_value	= value

		// local storage check. If exists, use it to update checked status
			const local_storage_ar_id = JSON.parse(localStorage.getItem(self.id))
			if (local_storage_ar_id) {

				const current_state = input_checkbox.checked

				if (local_storage_ar_id.includes(id)) {
					if (current_state!==true) {
						input_checkbox.checked = true
						change(input_checkbox) // caller callback function
					}
				}else{
					if (current_state!==false) {
						input_checkbox.checked = false
						change(input_checkbox) // caller callback function
					}
				}
			}

		// event change
			const change_handler = async function(e) {
				// reset search cache
				self.search_cache = []

				change(this) // caller callback function

				update_local_storage_ar_id(this)

				// force re-search with new options
					const api_response	= await self.autocomplete_search()
					render_datalist(self, api_response.result)
			}
			input_checkbox.addEventListener('change', change_handler);

		// local_storage update
			const update_local_storage_ar_id = function(element) {

				const id			= element.id
				const current_state	= element.checked

				const local_storage_ar_id = JSON.parse(localStorage.getItem(self.id))
				if (local_storage_ar_id) {
					// search current id in local_storage_ar_id array
					const key = local_storage_ar_id.indexOf(id)
					if (current_state===true && key===-1) {
						local_storage_ar_id.push(id)
					}else{
						local_storage_ar_id.splice(key, 1);
					}
					// save updated array
					localStorage.setItem(self.id, JSON.stringify(local_storage_ar_id) )

					return key
				}

				return false
			}

		// prepend
		section_label.prepend(input_checkbox)


	return li
}//end render_option_checkbox



/**
* RENDER_INPUTS_LIST
* @param object self
* @return HTMLElement inputs_list
*/
const render_inputs_list = function(self) {

	const inputs_list = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'inputs_list'
	})

	const filter_free = self.rqo_search.sqo_options.filter_free
	for (const operator in filter_free) {

		const filter_group			= filter_free[operator]
		const filter_group_length	= filter_group.length
		for (let i = 0; i < filter_group_length; i++) {

			const filter_item = filter_group[i]

			const current_ddo		= filter_item.path[filter_item.path.length-1]
			const component_label	= current_ddo.label
				? current_ddo.label.replace(/(<([^>]+)>)/ig, '')
				: '';

			// input_group
			const input_group = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'input_group',
				parent			: inputs_list
			})

			// input
			const component_input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				parent			: input_group
			})

			// placeholder (replaced by the label to allow to know what we are editing anytime)
				// component_input.setAttribute('placeholder', component_label )

			// label
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: component_label,
				parent			: input_group
			})

			// set pointer
			component_input.filter_item = filter_item

			// change event
			const change_handler = async () => {
				// update filter_item q value from input
				filter_item.q = component_input.value
				// force search
				const api_response = await self.autocomplete_search()
				// refresh datalist
				render_datalist(self, api_response.result)
			}
			component_input.addEventListener('change', change_handler)

			// keyup event
			const keyup_handler = (e) => {
				e.stopPropagation()
				if (e.key==='Enter') {
					change_handler()
				}
			}
			component_input.addEventListener('keyup', keyup_handler)

			// add node
			self.filter_free_nodes.push(component_input)
		}
	}//end for (let operator in filter_free)


	return inputs_list
}//end render_inputs_list



/**
* RENDER_OPERATOR_SELECTOR
* @param object self
* @return HTMLElement operator_selector
*/
const render_operator_selector = function(self) {

	// operator selector. Get the operator to use into the filter free
		const operator	= self.operator

	// operator_selector
		const operator_selector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_operators_div'
		})

	// select_container
		const select_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'select_container',
			parent			: operator_selector
		})
	// label
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'css_label label',
			inner_html		: get_label.search_operators || 'Search operators',
			parent			: select_container
		})
	// select
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'operator_selector',
			parent			: select_container
		})
		select.addEventListener('click', function(e) {
			e.stopPropagation()
		})
		select.addEventListener('change', async function(e){

			// reset search cache
			self.search_cache = []

			// set the new operator selected
			self.operator	= e.target.value

			// launch search again
			const api_response	= await self.autocomplete_search()
			await render_datalist(self, api_response.result)
		})
		const option_or = ui.create_dom_element({
			element_type	: 'option',
			value			: '$or',
			inner_html		: get_label.or || 'or',
			parent			: select
		})
		const option_and = ui.create_dom_element({
			element_type	: 'option',
			value			: '$and',
			inner_html		: get_label.and || 'and',
			parent			: select
		})
		if (operator==='$or') {
			option_or.setAttribute('selected', true)
		}else{
			option_and.setAttribute('selected', true)
		}

	// max_container
		const max_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'max_container',
			parent			: operator_selector
		})
	// label
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'css_label label_max',
			inner_html		: get_label.max || 'Max.',
			parent			: max_container
		})
	// input
		const input_max = ui.create_dom_element({
			element_type	: 'input',
			type			: 'number',
			class_name		: 'input_max',
			value			: self.limit,
			parent			: max_container
		})
		input_max.addEventListener('change', fn_change)
		async function fn_change(e) {

			// reset search cache
			self.search_cache = []

			const value = parseInt( e.target.value )
			if (value<1) {
				return
			}

			// update self limit
			self.limit = value

			// launch search again
			const api_response	= await self.autocomplete_search()
			await render_datalist(self, api_response.result)

			// update localStorage limit value
			localStorage.setItem('service_autocomplete_limit', self.limit )
		}
		input_max.addEventListener('keyup', fn_keyup)
		async function fn_keyup(e) {
			e.preventDefault()

			if (e.key==='Enter') {
				// Create the event
				const change_event = new CustomEvent("change", {});
				// Dispatch/Trigger/Fire the event
				input_max.dispatchEvent(change_event);
			}
		}


	return operator_selector
}//end render_operator_selector



/**
* RENDER_DATALIST
* Render result data as DOM nodes and place it into self.datalist container
* @param object self
* @param object result
* 	api_response result
* @return HTMLElement datalist
*/
const render_datalist = async function(self, result) {

	// datalist container node
		const datalist = self.datalist

	// clean the last list
		while (datalist.firstChild) {
			datalist.removeChild(datalist.firstChild)
		}

	// empty case
		if (!result.data || !result.data.length) {
			return datalist
		}

	// total
		const sections_data	= result.data.find(el => el.typo==='sections')
		const total			= sections_data
			? sections_data.value.length
			: 0
		// if the api doesn't send any data, do not continue, return empty datalist
		if (total===0) {
			return datalist
		}

	// datum. Added result as datum because will be necessary to render ddinfo column
	// ddinfo will get data from autocomplete service instead the section_record
	// ddinfo column is dependent of the caller (component_portal or in these case service autocomplete)
		self.datum = result

	// data. if the api doesn't send any data, do not continue, return empty datalist
		// const data = result.data.find(el=> el.tipo===self.tipo && el.typo==='sections')
		// if(!data){
		// 	return datalist
		// }

	// value. Remove unused value items properties (publication_first_date, publication_last_user, etc.)
		const value = sections_data.value.map(el => {
			const item = {
				section_tipo	: el.section_tipo,
				section_id		: el.section_id,
				paginated_key	: el.paginated_key
			}
			return item
		})

	// context
		// const context = result.context

	// get the sections that was searched
		// const ar_search_sections = self.ar_search_section_tipo

	// rqo_search. Get dd objects from the context that will be used to build the lists in correct order
		const rqo_search = await self.rqo_search

	// fields_separator. Get the fields_separator between columns
		const fields_separator = (rqo_search.show.fields_separator)
			? rqo_search.show.fields_separator
			: ' | '

	// get the ar_locator founded in sections
		// const data_locator	= data.find((item)=> item.tipo === rqo_search.source.tipo && item.typo === 'sections');
		// const ar_locator	= (data_locator) ? data_locator.value : []

	// reset ar_instances
		self.ar_instances = []

	// id_variant. Don't allow cache instances here because interact with page instances.
	// Use always a custom id_variant to prevent it
		const id_variant = (self.id_variant || '') + '_' + new Date().getTime()

	// ar_section_record
		const ar_section_record	= await get_section_records({
			caller				: self,
			mode				: 'list',
			view				: 'text',
			datum				: result,
			value				: value,
			request_config		: [self.rqo_search],
			columns_map			: self.columns_map,
			fields_separator	: fields_separator,
			id_variant			: id_variant
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// mouseenter_handler
		const mouseenter_handler = async (e) => {
			e.stopPropagation()
			// reset
				const children = e.target.parentNode.children || [];
				[...children].map((el)=>{
					if(el.classList.contains('selected')) {
						el.classList.remove('selected')
					}
				})
			// set as selected
				e.target.classList.add('selected')
		}

	// mouseleave_handler
		const mouseleave_handler = async (e) => {
			e.stopPropagation()
			e.target.classList.remove('selected')
		}

	// selection_handler
		const selection_handler = async (options) => {
			// options
				const e							= options.e
				const current_section_record	= options.current_section_record
				const locator					= options.locator
				const datalist					= options.datalist

			// value
				const value = locator

			// events
				const events = self.properties.events || null
				if(events){

					// custom events manager from properties

					const add_value = events.find(el => el.event === 'add_value')
					// caller is refreshed after add value
					if(add_value){
						if(typeof view_default_autocomplete[add_value.perform.function] === 'function'){

							const params	= add_value.perform.params
							const grid_node	= await view_default_autocomplete[add_value.perform.function](self, current_section_record , params)
							if(!self.node.grid_choose_container){
								self.node.grid_choose_container = grid_node
								document.body.appendChild(self.node.grid_choose_container)
							}

							// clean the last list
								while (datalist.firstChild) {
									datalist.removeChild(datalist.firstChild)
								}

							// clean the input value
								self.search_input.value = '';

							// hide service
								self.hide()

						}else{
							console.warn('Function sent is not defined to be exec by service autocomplete:', self.add_value);
						}
						return
					}
				}else{

					// default click action

					// add value. Don't wait here
						self.caller.add_value(value)

					// clean the last list
						while (datalist.firstChild) {
							datalist.removeChild(datalist.firstChild)
						}

					// clean the input value
						self.search_input.value = '';

					// hide service
						self.hide()
				}
		}//end selection_handler

	// iterate the section_records
		const ar_section_record_length = ar_section_record.length
		for (let i = 0; i < ar_section_record_length; i++) {

			// section_record
				const current_section_record = ar_section_record[i]

			// locator
				const locator = current_section_record.locator

			// id_variant add to force unique components before render
				// current_section_record.id_variant = locator.section_tipo + '_' + locator.section_id

			// get data that mach with the current section from the global data sent by the API
			// get the full row with all items in the ddo that mach with the section_id
			// const current_row = data.filter((item)=> item.section_tipo===section_tipo && item.section_id===section_id )
				// const section_record_node = await current_section_record.render()

			// li_node container
				const li_node = ui.create_dom_element({
					element_type	: 'li',
					class_name		: 'autocomplete_data_li',
					title			: ' [' + locator.section_tipo + '-' + locator.section_id + ']',
					parent			: datalist
				})
				li_node.locator = locator
				// click event. When the user do click in one row send the data to the caller_instance for save it.
				const click_handler = function(e) {
					e.stopPropagation()
					selection_handler({
						e						: e,
						current_section_record	: current_section_record,
						locator					: this.locator,
						datalist				: datalist
					})
				}
				li_node.addEventListener('click', click_handler)
				// mouseenter event
				li_node.addEventListener('mouseenter', mouseenter_handler)
				// mouseleave event
				li_node.addEventListener('mouseleave', mouseleave_handler);

			// render and add section_record_node
				// li_node.appendChild(section_record_node)
				current_section_record.render()
				.then(function(section_record_node){
					li_node.appendChild(section_record_node)
				})
		}//end for of current_section (section_tipo)


	return datalist
}//end render_datalist



/**
* SHOW
* Remove hide class from main node
* @return bool
*/
view_default_autocomplete.show = function () {

	if (this.node && this.node.classList.contains('hide')) {
		this.node.classList.remove('hide')
	}

	return true
}//end show



/**
* HIDE
* Add hide class to main node
* @return bool
*/
view_default_autocomplete.hide = function () {

	if (this.node && !this.node.classList.contains('hide')) {
		this.node.classList.add('hide')
	}

	return true
}//end hide



/**
* GET_LAST_DDO_DATA_VALUE
* Recursive function
* follow the path of the columns to get the correct data to the last component in the chain, the last component has the text to show.
* all others ddo in the middle of the chain are portals with locator value, and only will show the last component.
* @param array current_path
* @param array value
* @param array data
* @return ddo object current_element_data
*/
const get_last_ddo_data_value = function(current_path, value, data) {

	// check the path length sent, the first loop is the full path, but it is changed with the check data
	const current_path_length = current_path.length
	for (let i = 0; i < value.length; i++) {
		const section_tipo 	= value[i].section_tipo
		const section_id 	= value[i].section_id
		// get the column data with last ddo
		const ddo_item = current_path[current_path.length - 1];
		// get the data into the full data from API and get the value (locator or final data as input_text data)
		const current_element_data = data.find((item)=> item.tipo===ddo_item.tipo && item.section_tipo===section_tipo && item.section_id===section_id)
		const current_value = (current_element_data)
			? current_element_data.value
			: false
		// if the element doesn't has data stop the recursion.
		if(current_value === false) return false;
		// create new_path without and remove the current ddo
		const new_path = [...current_path]
		new_path.pop()
		// if it is the last ddo, the data is the correct data to build the column
		// else continue with the path doing recursion
		if (current_path_length===1) {
			return current_element_data
		}

		return get_last_ddo_data_value(new_path, current_value, data)
	}
}//end get_last_ddo_data_value



/**
* RENDER_GRID_CHOOSE
* Render result data as DOM grid nodes and place it into document body as
* float draggable div preserving position across calls
* Used by 'numisdata575'
* @param object self
* @param object section_record
* 	Current section_record instance
* @param object params
* sample:
* {
* 	mode: "list"
*	request_config_type: "secondary"
*	view: "tag"
* }
* @return HTMLElement grid_choose_container
*/
view_default_autocomplete.render_grid_choose = async function( self, section_record, params ) {

	// selection (from user selected section_record)
		const selected_section_id	= section_record.section_id
		const selected_section_tipo	= section_record.section_tipo
		const data_selection		= section_record.datum.data.find(
			el => el.section_id==selected_section_id && el.section_tipo==selected_section_tipo
		)
		const selected_label = data_selection
			? data_selection.value
			: selected_section_tipo + '_' + selected_section_tipo

	// data from API
		const grid_choose_data = await get_grid_choose_data(self, section_record, params)

	// get dd objects from the context that will be used to build the lists in correct order
		const rqo_search	= grid_choose_data.rqo_search
		const data			= grid_choose_data.data
		const context		= grid_choose_data.context

	// grid_choose_container
		const current_container		= document.getElementById('choose_container')
		const grid_choose_container	= current_container
			|| ui.create_dom_element({
				element_type	: 'div',
				id				: 'choose_container',
				class_name		: 'grid_choose_container draggable'
			})

		// clean the last list
			while (grid_choose_container.firstChild) {
				grid_choose_container.removeChild(grid_choose_container.firstChild)
			}

		// service node reference. Set bellow autocomplete search box when is created (once)
			if (!current_container) {
				const reference_node	= self.datalist
				const rect				= reference_node.getBoundingClientRect();
				const top				= rect.top  + window.scrollY + 20
				const left				= rect.left + window.scrollX + 20
				// set coordinates. Same as datalist position
				grid_choose_container.style.left	= left + 'px'
				grid_choose_container.style.top		= top + 'px'
			}

	// label. From section_record node
		const label = Array.isArray(selected_label)
			? selected_label.join(', ')
			: selected_label

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'grid_choose_header text_unselectable dragger',
			inner_html		: label,
			parent			: grid_choose_container
		});
		// drag move set
			let x, y, target, margin_left, margin_top = null

			// mousedown event
			// header is the drag area
			const fn_mousedown = function(e) {
				e.stopPropagation()

				const path = e.composedPath();

				let clickedDragger = false;
				for(let i = 0; path[i] !== document; i++) {

					if (path[i].classList.contains('dragger')) {
						// dragger is clicked (header)
						clickedDragger = true;
					}
					else if (clickedDragger===true && path[i].classList.contains('draggable')) {
						// draggable is set (all modal-content)
						target = path[i];
						target.classList.add('dragging');
						x = e.clientX - target.style.left.slice(0, -2);
						y = e.clientY - target.style.top.slice(0, -2);

						// this is calculated once, every time that user clicks on header
						// to get the whole container margin and use it as position offset
						const compStyles	= window.getComputedStyle(target);
						margin_left			= parseInt(compStyles.getPropertyValue('margin-left'))
						margin_top			= parseInt(compStyles.getPropertyValue('margin-top'))

						return;
					}
				}
			}//end fn_mousedown
			header.addEventListener('mousedown', fn_mousedown)

			// mouseup event
			const fn_mouseup = function(e) {
				e.stopPropagation()
				if (target) {
					target.classList.remove('dragging');
				}
				target = null;
			}
			document.addEventListener('mouseup', fn_mouseup)

			// end mousemove
			const fn_mousemove = function(e) {
				// no target case (mouse position changes but target is null or undefined)
					if (!target) {
						return;
					}

				// re-position element based on mouse position
					target.style.left	= e.clientX - x + 'px';
					target.style.top	= e.clientY - y + 'px';

				// limit boundaries. take care of initial margin offset
					const pRect		= target.parentElement.getBoundingClientRect();
					const tgtRect	= target.getBoundingClientRect();
					if (tgtRect.left < pRect.left) {
						target.style.left = (0 - margin_left) + 'px';
					}
					if (tgtRect.top < pRect.top) {
						target.style.top = (0 - margin_top) + 'px';
					}
					if (tgtRect.right > (pRect.right)) {
						target.style.left = (pRect.width - tgtRect.width - margin_left) + 'px';
					}
					if (tgtRect.bottom > (pRect.bottom)) {
						target.style.top = (pRect.height - tgtRect.height - margin_top - 1) + 'px';
					}
			}//end fn_mousemove
			document.addEventListener('mousemove', fn_mousemove)


	// button_close
		const button_close = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button close white',
			parent			: header
		})
		const fn_click = function(e) {
			e.stopPropagation()
			while (grid_choose_container.firstChild) {
				grid_choose_container.removeChild(grid_choose_container.firstChild)
			}
			grid_choose_container.remove()
			if (self.node && self.node.grid_choose_container) {
				delete self.node.grid_choose_container
			}

			document.removeEventListener('mouseup', fn_mouseup)
			document.removeEventListener('mousemove', fn_mousemove)
		}//end fn_click
		button_close.addEventListener('click', fn_click)

	// ar_search_sections. get the sections that was searched
		// const ar_search_sections = rqo_search.sqo.section_tipo

	// columns
		const columns = rqo_search.show.columns

	// get the ar_locator founded in sections
		const data_locator	= data.find((item)=> item.tipo===rqo_search.source.tipo && item.typo==='sections');
		const ar_locator	= (data_locator) ? data_locator.value : []

	// iterate the sections
		for (const current_locator of ar_locator) {

			// const section_tipo	= current_locator.section_tipo
			// const section_id	= current_locator.section_id

			// get data that mach with the current section from the global data sent by the API
			// get the full row with all items in the ddo that mach with the section_id
			// const current_row = data.filter((item)=> item.section_tipo===section_tipo && item.section_id===section_id )

			// grid_item
				// const grid_item = ui.create_dom_element({
				// 	element_type	: 'div',
				// 	class_name		: 'grid_item',
				// 	dataset			: {value : JSON.stringify(current_locator)},
				// 	parent			: grid_choose_container
				// })

			// values. build the text of the row with label nodes in correct order (the ddo order in context).
				const columns_length = columns.length
				for (let i = 0; i < columns_length; i++) {

					const current_path = columns[i]

					// the columns has the last element in the chain in the first position of the array,
					// the first position is the only component that is necessary to build and show
						const ddo_item				= current_path[0]
						const current_element_data	= get_last_ddo_data_value(current_path, [current_locator], data)
						// if the element doesn't has data continue to the next element.
						if (typeof current_element_data==='undefined' || current_element_data===false) {
							console.warn('[render_datalist] Ignored tipo not found in row:', ddo_item.tipo, ddo_item);
							continue
						}

					// context of the element
						const current_element_context = context.find( (item) =>
							item.tipo===ddo_item.tipo &&
							item.section_tipo===current_element_data.section_tipo
						)
						if (!current_element_context) {
							console.error('Ignored element: context not found. ddo_item:', ddo_item, 'context:', context);
							continue;
						}

					// mode and view
						current_element_context.mode	= params.mode || 'list'
						current_element_context.view	= params.view || 'default'

					// instance
						const instance_options = {
							context			: current_element_context,
							data			: current_element_data,
							datum			: {data : data, context: context},
							tipo			: current_element_context.tipo,
							section_tipo	: current_element_context.section_tipo,
							model			: current_element_context.model,
							section_id		: current_element_data.section_id,
							mode			: current_element_context.mode, // 'mini',
							lang			: current_element_context.lang,
							id_variant		: self.id
						}
						const current_instance = await get_instance(instance_options)
						current_instance.build(false)
						const node = await current_instance.render()

					// append instance rendered node
						grid_choose_container.appendChild(node)
				}//end for ddo_item
		}//end for (const current_locator of ar_locator)


	return grid_choose_container
}//end render_grid_choose



/**
* GET_GRID_CHOOSE_DATA
* Used by render_grid_choose to call API and resolve
* the data to display into the grid viewer
* @param object self
* @param object section_record
* Current section_record instance
* @param object params
* sample:
* {
* 	mode: "list"
*	request_config_type: "secondary"
*	view: "tag"
* }
* @return object grid_choose_data
*/
const get_grid_choose_data = async function(self, section_record, params) {

	// request_config
		const request_config = self.request_config.find(el => el.type===params.request_config_type)
		if(!request_config){
			console.warn("Called request_config is not defined with type: ", params.request_config_type);
			return
		}

	// rqo
		const rqo_search = await self.caller.build_rqo_search(request_config, 'search')

		// remove non used search params
		delete rqo_search.sqo_options.filter_free
		delete rqo_search.sqo_options.filter_by_list

		// const rqo = await self.rebuild_search_query_object({
		// 	rqo_search		: rqo_search
		// });

		rqo_search.sqo.filter_by_locators = [{
			section_id		: section_record.section_id,
			section_tipo	: section_record.section_tipo
		}]

		// limit. Increase default limit (25) to allow more results
		rqo_search.sqo.limit = 200

		// section_tipo. Search only in section tipo of selected instance
		rqo_search.sqo.section_tipo = [section_record.section_tipo]

	// API read request
		const api_response = await data_manager.request({
			body		: rqo_search,
			use_worker	: true
		})

	// grid_choose_data
		const grid_choose_data = {
			rqo_search	: rqo_search,
			data		: api_response.result.data,
			context		: api_response.result.context
		}


	return grid_choose_data
}//end get_grid_choose_data



// @license-end
