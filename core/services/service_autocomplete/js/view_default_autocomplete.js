/*global get_label, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../common/js/ui.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {clone} from '../../../common/js/utils/index.js'
	import * as instances from '../../../common/js/instances.js'
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
* @return DOM node
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

	// fix node
		self.node = wrapper


	return wrapper
}//end view_default_autocomplete



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
			const ontology_link = ui.get_ontoly_term_link(self.tipo)
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
		button_options.addEventListener('mouseup',function(){
			options_container.classList.toggle('visible');
		})

	// datalist
		const datalist = ui.create_dom_element({
			element_type	: 'ul',
			id				: self.list_name,
			class_name		: 'autocomplete_data',
			parent			: fragment
		})
		document.addEventListener('keydown', fn_service_autocomplete_keys, false)
		function fn_service_autocomplete_keys(e) {
			self.service_autocomplete_keys(e)
		}

	// fix main nodes pointers
		self.search_input		= search_input
		self.datalist			= datalist
		self.options_container	= options_container


	return fragment
}//end render



/**
* RENDER_SOURCE_SELECTOR
* @param object self
* @return DOM node source_selector
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
			inner_html		: get_label.origen || 'Source',
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
				const current_sqo		= source.sqo//find(item => item.typo === 'sqo')
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
* @return DOM node search_input
*/
const render_search_input = function(self) {

	// search field
		const search_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'autocomplete_input'
		})
		search_input.setAttribute('list', self.list_name)
		search_input.setAttribute('placeholder', get_label.buscar + '...')
		// search_input.setAttribute('autocomplete', 'off')
		search_input.setAttribute('autocorrect', 'off')

		// Init a timeout variable to be used below
			let timeout = null;

		// event input. changes the input value fire the search
			search_input.addEventListener('keyup', async function(e){

				// arrow keys
					if(e.which===40 || e.which===38 || e.which===13){
						return
					}

				// q
					const q = search_input.value
					self.filter_free_nodes.map(el => {
						el.filter_item.q = ''
						el.value = ''
					})

				const filter_free_nodes_len = self.filter_free_nodes.length

				// ar q split iterate
					const split_q	= self.split_q(q)
					const ar_q		= split_q.ar_q
					if (split_q.divisor!==false) {
						// PROPAGATE TO FILTER FIELDS
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
			    	clearTimeout(timeout);

				// search fire is delayed to enable multiple simultaneous selections
				// get final value (input events are fired one by one)
					timeout = setTimeout(async()=>{

						const api_response	= await self.autocomplete_search()
						await render_datalist(self, api_response)

						// console.log('///// fired:');
					}, 350)
			});

	return search_input
}//end render_search_input



/**
* RENDER_FILTERS_SELECTOR
* @param object self
* @return DOM node filters_container
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
				// const id				= ddo_section.tipo
				// const request_ddo	= self.request_config_object.find(item => item.typo === 'request_ddo').value
				// const ddo_section	= request_ddo.find((item) => item.tipo===section && item.type==='section' && item.typo==='ddo')
				const datalist_item	= {
					grouper	: 'sections',
					id		: section_tipo,
					value	: section_tipo,
					label	: label,
					change	: function(input_node){
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
			const filter_label	= get_label.secciones
			const filter_node	= build_filter(self, filter_items, filter_label, filter_id)
			filters_container.appendChild(filter_node)
		}

	// filter_by_list . if the component caller has a filter_by_list we add the datalist of the component
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
					// {
						// section_id			: current_datalist.value.section_id,
						// section_tipo		: current_datalist.value.section_tipo,
						// from_component_tipo	: component_tipo
					// }
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

		// console.log('localStorage.getItem(self.id)', JSON.parse(localStorage.getItem(self.id)) );
		// console.log('ar_filter_by_list 2:',self.ar_filter_by_list);


	return filters_container
}//end render_filters_selector



/**
* BUILD_FILTER
*
* @param object self
* @param array filter_items
* @param string filter_name
* @param string filter_id
* @return DOM node filter_node
*/
const build_filter = function(self, filter_items, filter_name, filter_id) {

	const filter_node = ui.create_dom_element({
		element_type	: 'ul',
		class_name		: 'filter_node' // css_autocomplete_hi_search_field
	})

	// select all
		const all_selector = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'all_selector', // css_autocomplete_hi_search_field
			parent			: filter_node
		})
		const all_section_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: get_label.todos + ' ' + filter_name, //ddo_section.label ||
			parent			: all_selector
		})
		all_section_label.setAttribute('for', filter_id + '_all')

		const all_section_input = ui.create_dom_element({
			element_type	: 'input',
			id				: filter_id + '_all',
			type			: 'checkbox',
			parent			: all_selector
		})
		all_section_input.checked = false
		all_section_input.addEventListener('change', function(e){
			const checked_value	= e.target.checked
			const container		= e.target.parentNode.parentNode
			const inputs		= container.querySelectorAll('input')
			for (let i = 0; i < inputs.length; i++) {
				if (inputs[i]==all_section_input) continue;
				if (inputs[i].checked!==checked_value) {
					inputs[i].checked = checked_value
					inputs[i].dispatchEvent(new Event('change'));
				}
			}
		});

	// items
		for (let i = 0; i < filter_items.length; i++) {
			const chekbox_node = render_option_chekbox(self, filter_items[i])
			filter_node.appendChild(chekbox_node)
		}

	return filter_node
}//end build_filter



/**
* RENDER_OPTION_CHEKBOX
* @param object datalist_item
* @return DOM node li
*/
const render_option_chekbox = function(self, datalist_item) {

	const label		= datalist_item.label
	const value		= datalist_item.value
	const id		= datalist_item.id
	const change	= datalist_item.change

	// li container
		const li = ui.create_dom_element({
			element_type	: 'li'
		})

	// label
		const section_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label,
			parent			: li
		})
		section_label.setAttribute('for', id)

	// input
		const input_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			id				: id,
			parent			: li
		})
		input_checkbox.checked	= true; // default value is true
		input_checkbox.dd_value	= value

		// local storage check. If exists, use it to update checked status
			const local_storage_ar_id = localStorage.getItem(self.id)
			if (local_storage_ar_id) {

				const current_state = input_checkbox.checked

				if(local_storage_ar_id.indexOf(id)!==-1){
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
			input_checkbox.addEventListener('change', async function(){

				change(this) // caller callback function

				update_local_storage_ar_id(this)

				// force re-search with new options
					const api_response	= await self.autocomplete_search()
					render_datalist(self, api_response)

					// if (self.search_fired===false) {
					// 	// search fire is delayed to enable multiple simultaneous selections
					// 	// get final value (input events are fired one by one)
					// 	setTimeout(()=>{
					// 		self.search_fired = true
					// 		self.search_input.dispatchEvent(new Event('input'))

					// 		// restore state after 250 milliseconds.
					// 		// prevents fire multiple events when user selects 'All' option
					// 		// setTimeout(()=>{
					// 			self.search_fired = false
					// 		// },250)
					// 		console.log('///// fired:');
					// 	},250)
					// }
			});

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


	return li
}//end render_option_chekbox



/**
* RENDER_INPUTS_LIST
* @param object self
* @return DOM node inputs_list
*/
const render_inputs_list = function(self) {

	const inputs_list = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'inputs_list' // css_autocomplete_hi_search_field
	})

	const filter_free = self.rqo_search.sqo_options.filter_free
	for (const operator in filter_free) {

		const filter_group			= filter_free[operator]
		const filter_group_length	= filter_group.length
		for (let i = 0; i < filter_group_length; i++) {

			const filter_item = filter_group[i]

			const current_ddo = filter_item.path[filter_item.path.length-1]

			const component_input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				parent			: inputs_list
			})
			// placeholder
			const component_label = current_ddo.label.replace(/(<([^>]+)>)/ig,"");
			component_input.setAttribute('placeholder', component_label )

			// set pointer
			component_input.filter_item = filter_item

			// change event
			component_input.addEventListener('change',async function () {
				filter_item.q = component_input.value
				const api_response	= await self.autocomplete_search()
				render_datalist(self, api_response)
			})

			// add node
			self.filter_free_nodes.push(component_input)
		}
		// check if the current ddo is a dataframe node,
		//if the caller is a portal the dataframe it's necessary remove it, because dataframes nodes has his own sqo (it's outside of the portal sqo )
			//if(current_ddo.is_dataframe && current_ddo.is_dataframe===true ) continue;
	}//end for (let operator in filter_free)


	return inputs_list
}//end render_inputs_list



/**
* RENDER_OPERATOR_SELECTOR
* @param object self
* @return DOM node operator_selector
*/
const render_operator_selector = function(self) {

	// operator selector. Get the operator to use into the filter free
		const operator	= self.operator

	// operator_selector
		const operator_selector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_operators_div'
		})

	// label
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'css_label label',
			inner_html		: get_label.operadores_de_busqueda || 'Search operators',
			parent			: operator_selector,
		})
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'operator_selector',
			parent			: operator_selector
		})
		select.addEventListener('change',async function(e){
			// set the new operator selected
			self.operator	= e.target.value

			const api_response	= await self.autocomplete_search()
			await render_datalist(self, api_response)
		})
		const option_or = ui.create_dom_element({
			element_type	: 'option',
			value			: '$or',
			inner_html		: get_label.o || 'o',
			parent			: select
		})
		const option_and = ui.create_dom_element({
			element_type	: 'option',
			value			: '$and',
			inner_html		: get_label.y || 'y',
			parent			: select
		})
		if (operator==='$or') {
			option_or.setAttribute('selected', true)
		}else{
			option_and.setAttribute('selected', true)
		}

	return operator_selector
}//end render_operator_selector



/**
* AUTOCOMPLETE_BUILD_OPTIONS to choose it by user
* Render result data as DOM nodes and place it into self.datalist container
* @param object self
* @param object api_response
* @return DOM node datalist
*/
const render_datalist = async function(self, api_response) {

	// datalist container node
		const datalist = self.datalist

	// clean the last list
		while (datalist.firstChild) {
			datalist.removeChild(datalist.firstChild)
		}

	// get the result from the API response
		const result = api_response.result

	// data. if the api doesn't send any data, do not continue, return empty datalist
		const data = result.data.find(el=> el.tipo ===self.tipo && el.typo==='sections')
		if(!data){
			return datalist
		}

	// context
		// const context	= result.context

	// get the sections that was searched
		// const ar_search_sections = self.ar_search_section_tipo

	// get dd objects from the context that will be used to build the lists in correct order
	const rqo_search =  await self.rqo_search

	// get the fields_separator between columns
	const fields_separator = (rqo_search.show.fields_separator)
		? rqo_search.show.fields_separator
		: ' | '

	// const columns = rqo_search.show.columns

	// get the ar_locator founded in sections
		// const data_locator	= data.find((item)=> item.tipo === rqo_search.source.tipo && item.typo === 'sections');
		// const ar_locator	= (data_locator) ? data_locator.value : []

	// reset ar_instances
		self.ar_instances = []

	// ar_section_record
		const ar_section_record	= await get_section_records({
			caller				: self,
			mode				: 'list',
			view				: 'default',
			datum				: result,
			value				: data.value,
			request_config		: [self.rqo_search],
			columns_map			: self.columns_map,
			fields_separator	: fields_separator
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// iterate the section_records
		for (let i = 0; i < ar_section_record.length; i++) {

			const current_section_record = ar_section_record[i]

			// locator
				const locator = current_section_record.locator

			// id_variant add to force unique components before render
				current_section_record.id_variant = locator.section_tipo + '_' + locator.section_id

			// get data that mach with the current section from the global data sent by the API
			// get the full row with all items in the ddo that mach with the section_id
			// const current_row = data.filter((item)=> item.section_tipo===section_tipo && item.section_id===section_id )

			const section_record_node = await current_section_record.render()
			// create the li node container
			const li_node = ui.create_dom_element({
				element_type	: 'li',
				class_name		: 'autocomplete_data_li',
				title			: ' [' + locator.section_tipo + '-' + locator.section_id + ']',
				parent			: datalist
			})
			li_node.locator = locator

			li_node.appendChild(section_record_node)

			// click event. When the user do click in one row send the data to the caller_instance for save it.
			li_node.addEventListener('click', async function(e){
				e.stopPropagation()
				const value = this.locator

				// if(self.caller.mode==='search'){
					// self.caller.datum.data.push({value: current_locator})
				// }
				const events = self.properties.events || null
				if(events){
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
						}else{
							console.warn('Function sent is not defined to be exec by service autocomplete:', self.add_value);
						}
						return
					}
				}
				// default action
				self.caller.add_value(value)
			});
			// mouseenter event
			li_node.addEventListener('mouseenter', async function(e){
				const children = e.target.parentNode.children;
				await [...children].map((el)=>{
					if(el.classList.contains('selected')) el.classList.remove('selected')
				})
				e.target.classList.add('selected')
			});
			// mouseleave event
			li_node.addEventListener('mouseleave', function(e){
				e.target.classList.remove('selected')
			});

			// DES
				// const instance_options = {
				// 	model			: 'section_record',
				// 	tipo			: self.caller.tipo,
				// 	section_tipo	: section_tipo,
				// 	section_id		: section_id,
				// 	mode			: 'list',
				// 	lang			: self.caller.lang,
				// 	context			: {
				// 			view				: 'text',
				// 			request_config		: self.request_config,
				// 			fields_separator	: fields_separator
				// 		},
				// 	caller			: self,
				// 	// data			: current_element_data,
				// 	datum			: result,
				// 	columns_map		: self.columns_map,
				// 	row_key			: i,
				// 	locator			: current_locator,
				// 	id_variant		: section_tipo +'_'+section_id+'_'+new Date().getTime()
				// }

				// const current_instance = await instances.get_instance(instance_options)
				// current_instance.build(false)
				// const node = await current_instance.render()

				// li_node.appendChild(node)
				// li_node.instance = current_instance


				// // values. build the text of the row with label nodes in correct order (the ddo order in context).
				// 	const columns_length = columns.length
				// 	for (let i = 0; i < columns_length; i++) {
				// 			const current_path = columns[i]
				// 		// the columns has the last element in the chain in the first position of the array,
				// 		// the first position is the only component that is necessary to build and show
				// 			const ddo_item = current_path[0]
				// 			const current_element_data = get_last_ddo_data_value(current_path, [current_locator], data)
				// 		// if the element doesn't has data continue to the next element.
				// 			if(current_element_data === false) continue;

				// 		// context of the element
				// 			const current_element_context = context.find( (item) =>
				// 				item.tipo===ddo_item.tipo &&
				// 				item.section_tipo===current_element_data.section_tipo
				// 			)
				// 			if (!current_element_context) {
				// 				console.error('Ignored element: context not found. ddo_item:', ddo_item, 'context:', context);
				// 				continue;
				// 			}

				// 			// mode and view
				// 				current_element_context.mode	= 'list'
				// 				current_element_context.view	= 'mini'

				// 			if (typeof current_element_data==='undefined') {
				// 				console.warn('[render_datalist] Ignored tipo not found in row:', ddo_item.tipo, ddo_item);
				// 				continue
				// 			}

				// 			const instance_options = {
				// 				context			: current_element_context,
				// 				data			: current_element_data,
				// 				datum			: {data : data, context: context},
				// 				tipo			: current_element_context.tipo,
				// 				section_tipo	: current_element_context.section_tipo,
				// 				model			: current_element_context.model,
				// 				section_id		: current_element_data.section_id,
				// 				mode			: current_element_context.mode, // 'mini',
				// 				lang			: current_element_context.lang,
				// 				id_variant		: section_tipo +'_'+section_id+'_'+new Date().getTime()
				// 			}

				// 			const current_instance = await instances.get_instance(instance_options)
				// 			// current_instance.build(false)
				// 			const node = await current_instance.render()

				// 			// append node (span)
				// 			li_node.appendChild(node)
				// 			li_node.instance = current_instance

				// 		// span node
				// 			// const current_value = current_value_element.value
				// 			// ui.create_dom_element({
				// 			// 	element_type	: 'span',
				// 			// 	inner_html		: current_value,
				// 			// 	parent			: li_node
				// 			// })// end create dom node
				// 	}//end for ddo_item

			// dd_info: information about the row, like parents, model, etc, that help to identify the data.
				// const current_dd_info = current_row.find((item)=> item.tipo==='ddinfo')
				// if(current_dd_info){
				// 	const current_dd_info_value = '- ' + current_dd_info.value.join(fields_separator)
				// 	ui.create_dom_element({
				// 		element_type	: 'span',
				// 		class_name		: 'attenuated',
				// 		inner_html		: current_dd_info_value,
				// 		parent			: li_node
				// 	})// end create dom node
				// }// end if of check current_dd_info

			// debug
				// if(SHOW_DEBUG===true) {
				// 	ui.create_dom_element({
				// 		element_type	: 'span',
				// 		class_name		: 'attenuated',
				// 		inner_html		: ' [' + locator.section_tipo + '-' + locator.section_id + ']',
				// 		parent			: li_node
				// 	});
				// }
		}// end for of current_section (section_tipo)


	return datalist
}//end render_datalist



/**
 * GET_LAST_DDO_DATA_VALUE
 * Recursive function
 * follow the path of the columns to get the correct data to the last component in the chain, the last component has the text to show.
 * all others ddo in the middle of the chain are portals with locator value, and only will show the last component.
 * @param array current_path
 * @param array value
 * @param array data
 * @return ddo object current_element_data
 * */
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
* @param object self
* @param object selected_instance
* 	Current section_record
* @param object params
* @return DOM node grid_choose_container
*/
view_default_autocomplete.render_grid_choose = async function( self, selected_instance, params ) {

	// data from API
		const grid_choose_data = await get_grid_choose_data(self, selected_instance, params)

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
		const label = selected_instance.node
			? selected_instance.node.firstChild.innerHTML
			: ''

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'grid_choose_header text_unselectable dragger',
			inner_html		: label,
			parent			: grid_choose_container
		});
		// drag move set
		(function(){
			let x, y, target, margin_left, margin_top = null
			// header is the drag area
			header.addEventListener('mousedown', function(e) {

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
			});

			document.addEventListener('mouseup', function() {
				// if (target !== null) {
				if (target) {
					target.classList.remove('dragging');
				}
				target = null;
			});

			document.addEventListener('mousemove', function(e) {

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
			});
		})();

	// button_close
		const button_close = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button close white',
			parent			: header
		})
		button_close.addEventListener('click', function(e) {
			e.stopPropagation()
			while (grid_choose_container.firstChild) {
				grid_choose_container.removeChild(grid_choose_container.firstChild)
			}
			grid_choose_container.remove()
			if (self.node && self.node.grid_choose_container) {
				delete self.node.grid_choose_container
			}
		})

	// ar_search_sections. get the sections that was searched
		// const ar_search_sections = rqo_search.sqo.section_tipo

	// columns
		const columns = rqo_search.show.columns

	// get the ar_locator founded in sections
		const data_locator	= data.find((item)=> item.tipo === rqo_search.source.tipo && item.typo==='sections');
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
						const ddo_item = current_path[0]
						const current_element_data = get_last_ddo_data_value(current_path, [current_locator], data)
					// if the element doesn't has data continue to the next element.
						if(current_element_data === false) continue;

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

						if (typeof current_element_data==='undefined') {
							console.warn('[render_datalist] Ignored tipo not found in row:', ddo_item.tipo, ddo_item);
							continue
						}

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

						const current_instance = await instances.get_instance(instance_options)
						current_instance.build(false)
						const node = await current_instance.render()

						// append node
						grid_choose_container.appendChild(node)
				}//end for ddo_item
		}//end for (const current_locator of ar_locator)


	return grid_choose_container
}//end render_grid_choose



/**
* GET_GRID_CHOOSE_DATA
* @return object grid_choose_data
*/
const get_grid_choose_data = async function(self, selected_instance, params) {

	// request_config
		const request_config = self.request_config.find(el => el.type === params.request_config_type)
		if(!request_config){
			console.warn("Called request_config is not defined with type: ", params.request_config_type);
			return
		}

	// rqo
		const rqo_search = await self.caller.build_rqo_search(request_config, 'search')

		delete rqo_search.sqo_options.filter_free
		delete rqo_search.sqo_options.filter_by_list
		// const rqo = await self.rebuild_search_query_object({
		// 	rqo_search		: rqo_search
		// });
		rqo_search.sqo.filter_by_locators = [{
			section_id		: selected_instance.section_id,
			section_tipo	: selected_instance.section_tipo
		}]

	// API read request
		const api_response	= await data_manager.request({
			body : rqo_search
		})

	// grid_choose_data
		const grid_choose_data = {
			rqo_search	: rqo_search,
			data		: api_response.result.data,
			context		: api_response.result.context
		}


	return grid_choose_data
}//end get_grid_choose_data
