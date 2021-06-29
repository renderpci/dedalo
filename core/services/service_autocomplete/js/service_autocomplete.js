/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../common/js/data_manager.js'
	import {ui} from '../../../common/js/ui.js'
	import * as instances from '../../../common/js/instances.js'



/**
* SERVICE_AUTOCOMPLETE
* Used as service by component_portal, (old component_autocomplete, component_autocomplete_hi)
* component_relation_parent, component_relation_children, component_relation_related
*
*/
export const service_autocomplete = function() {



	/**
	* VARS
	*/
		// sections_without_filter_fields . exclude this section to build dom filter fields
		this.sections_without_filter_fields = ['zenon1']



	/**
	* INIT
	* @return bool
	*/
	this.init = function(options) {

		const self = this

		self.instance_caller		= options.caller
		self.id						= 'service_autocomplete' +'_'+ options.caller.tipo +'_'+ options.caller.section_tipo
		self.wrapper				= options.wrapper

		self.request_config			= JSON.parse(JSON.stringify(self.instance_caller.context.request_config))
		
		self.sqo 					= {}
		
		self.dd_request 			= self.request_config.find(el => el.api_engine==='dedalo')
		self.ar_search_section_tipo	= self.dd_request.sqo.section_tipo
		self.ar_filter_by_list		= []

		self.operator 				= null

		// self.ar_dd_request			= self.instance_caller.dd_request.search
		// self.dd_request				= self.ar_dd_request[0]
		// self.sqo						= self.dd_request.find(item => item.typo==='sqo')
		// self.ar_search_section_tipo	= self.sqo.section_tipo
		// self.ar_filter_by_list		= []

		// engine. get the search_engine sended or set the default value
			// const engine			= self.request_config.find(el => el.api_engine==='dedalo')
			self.search_engine		= (self.dd_request) ? self.dd_request.api_engine : 'dedalo';

		// vars
			self.tipo			= self.instance_caller.tipo
			self.properties		= self.instance_caller.context.properties || {}
			self.list_name		= 's_'+new Date().getUTCMilliseconds()
			self.search_fired	= false

		// Custom events defined in properties
			self.custom_events = (self.properties.custom_events) ? self.properties.custom_events : []

		// Build_autocomplete_input
		self.render()

		return true
	};//end init



	/**
	* DESTROY
	* @return bool
	*/
	this.destroy = function(){

		const self = this
		self.searh_container.remove()

		return true
	};//end destroy



	/**
	* RENDER
	* @return bool
	*/
	this.render = function(){

		const self = this

		// search container
			const searh_container = ui.create_dom_element({
				element_type	: "div",
				class_name		: "autocomplete_searh_container", // css_autocomplete_hi_search_field
				parent			: self.wrapper
			})

		// options container
			const options_container = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'options_hidden',
				parent			: searh_container
			})

		// source selector (Dédalo, Zenon, etc.)
			const source_selector = self.render_source_selector()
			options_container.appendChild(source_selector)
		
		// sections selector
			const sections_selector = self.render_filters_selector()
			options_container.appendChild(sections_selector)

		// components fields for inputs_list
			const inputs_list = self.render_inputs_list()
			options_container.appendChild(inputs_list)
		
		// operator selector
			const operator_selector = self.render_operator_selector()
			options_container.appendChild(operator_selector)
		
		// search_input
			const search_input = self.render_search_input()
			searh_container.appendChild(search_input)

		// button options
			const button_options = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button_options button gear',
				parent			: searh_container
			})
			// add listener to the select
			button_options.addEventListener('mouseup',function(){
				options_container.classList.toggle('visible');
			},false)

		// datalist
			const datalist = ui.create_dom_element({
				element_type	: 'ul',
				id				: self.list_name,
				class_name		: "autocomplete_data",
				parent			: searh_container
			})

		// fix main nodes
			self.searh_container	= searh_container
			self.search_input		= search_input
			self.datalist			= datalist


		return true
	};// end render



	/**
	* RENDER_SOURCE_SELECTOR
	* @return
	*/
	this.render_source_selector = function() {

		const self = this

		// source elements
			const ar_source = self.request_config

		// switcher source
			const source_selector = ui.create_dom_element({
				element_type	: "div",
				class_name		: "source_selector"
			})
			// label
			ui.create_dom_element({
				element_type	: "label",
				class_name		: "css_label label",
				text_content	: get_label["origen"] || "Source",
				parent			: source_selector
			})
			// select
			const select = ui.create_dom_element({
				element_type	: "select",
				class_name		: "select_source_selector",
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

					const swicher_source = ui.create_dom_element({
						element_type	: "option",
						parent			: select,
						value			: i+'',
						inner_html		: ar_section.length > 1
							? ar_section[0].label + ", etc."
							: ar_section[0].label
					})
					if (search_engine===self.search_engine) {
						swicher_source.setAttribute("selected", true)
					}
				}//end for (let i = 0; i < ar_search_length; i++)

			// add listener to the select
			select.addEventListener('change',function(e){
				const key = e.target.value

				self.dd_request				= JSON.parse(JSON.stringify(self.request_config[key]))
				self.ar_search_section_tipo	= self.dd_request.sqo.section_tipo
				self.search_engine			= self.dd_request.api_engine //.find((current_item)=> current_item.typo==='search_engine').value
				// console.log("self.ar_search_section_tipo", self.ar_search_section_tipo);
				self.destroy()
				self.render()
			},false)

		// set default value
			// self.build_filter_fields(select.value, options)

		return source_selector
	};//end render_source_selector



	/**
	* BUILD_AUTOCOMPLETE_INPUT
	* Create the html of input search autocomplete
	* @return
	*/
	this.render_search_input = function() {

		const self = this

		// search field
			const search_input = ui.create_dom_element({
				element_type	: "input",
				type			: 'text',
				class_name		: "autocomplete_input"
			})
			search_input.setAttribute("list", self.list_name)
			search_input.setAttribute("placeholder", get_label.buscar + '...')
			// search_input.setAttribute("autocomplete", "off")
			search_input.setAttribute("autocorrect", "off")

			// event input. changes the input value fire the search
				search_input.addEventListener('input', async function(){
					const api_response	= await self.autocomplete_search(this.value)
					self.render_datalist(api_response)
				}, false);

		return search_input
	};//end get_input



	/**
	* RENDER_FILTERS_SELECTOR
	* @return
	*/
	this.render_filters_selector = function(){

		const self = this

		const ar_id = []

		// container. Filters container
			const filters_container = ui.create_dom_element({
				element_type	: "div",
				class_name		: "filters_container" // css_autocomplete_hi_search_field
			})

		// sections filter
			const ar_sections			= self.ar_search_section_tipo // defined on init
			const ar_sections_length	= ar_sections.length
			if (ar_sections_length>0) {

				// get the datalist of all sections to create the checkbox
				const filter_items = []
				for (let i = 0; i < ar_sections_length; i++) {

					const ddo_section	= ar_sections[i]
					// const id			= ddo_section.tipo
					// const request_ddo 	= self.dd_request.find(item => item.typo === 'request_ddo').value
					// const ddo_section	= request_ddo.find((item) => item.tipo===section && item.type==='section' && item.typo==='ddo')
					const datalist_item	= {
						grouper	: 'sections',
						id		: ddo_section.tipo,
						value	: ddo_section,
						label	: ddo_section.label,
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

					ar_id.push(ddo_section.tipo) // add to global array of id
				}

				const filter_id		= self.list_name
				const filter_label	= get_label.secciones
				const filter_node	= self.build_filter(filter_items, filter_label, filter_id)
				filters_container.appendChild(filter_node)
			}

		// filter_by_list . if the component caller has a filter_by_list we add the datalist of the compoment
			const filter_by_list = self.dd_request.sqo.filter_by_list//find(item => item.typo==='filter_by_list') || false
			if(filter_by_list) {

				const ar_filter_by_list	= self.ar_filter_by_list

				const filter_by_list_value_length = filter_by_list.length
				for (let i = 0; i < filter_by_list_value_length; i++) {

					const current_filter		= filter_by_list[i]; 	//console.log("current_filter:",current_filter); 	console.log("self:",self);
					const section				= current_filter.context.section_tipo
					const component_tipo		= current_filter.context.tipo
					const component_datalist	= current_filter.datalist
					const filter_label			= current_filter.context.label

					const filter_items = []
					for (let j = 0; j < component_datalist.length; j++) {

						const current_datalist	= component_datalist[j]
						const id				= section +'_'+ component_tipo +'_'+ current_datalist.section_id
						const q					= {
							section_id			: current_datalist.value.section_id,
							section_tipo		: current_datalist.value.section_tipo,
							from_component_tipo	: component_tipo
						}
						const path				= [{
							section_tipo	: section,
							component_tipo	: component_tipo,
						}]
						const datalist_item		= {
							grouper	: component_tipo,
							id		: id,
							value	: {
								q		: q,
								path	: path
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
					const filter_id		= "filter_by_list_" + component_tipo + "_" + i
					const filter_node	= self.build_filter(filter_items, filter_label,  filter_id)
					filters_container.appendChild(filter_node)
				}
			}

		// localStorage
			if (!localStorage.getItem(self.id)) {
				// add full the first time
				localStorage.setItem(self.id, JSON.stringify(ar_id) )
			}

			// console.log("localStorage.getItem(self.id)", JSON.parse(localStorage.getItem(self.id)) );
			// console.log("ar_filter_by_list 2:",self.ar_filter_by_list);

		return filters_container
	};//end render_filters_selector



	/**
	* build_filter
	* @return DOM node
	*/
	this.build_filter = function(filter_items, filter_name, filter_id) {

		const self = this

		const filter_node = ui.create_dom_element({
			element_type	: "ul",
			class_name		: "filter_node" // css_autocomplete_hi_search_field
		})

		// select all
			const all_selector = ui.create_dom_element({
				element_type	: "li",
				class_name		: "all_selector", // css_autocomplete_hi_search_field
				parent			: filter_node
			})
			const all_section_label = ui.create_dom_element({
				element_type	: "label",
				inner_html		: get_label.todos + " " + filter_name, //ddo_section.label ||
				parent			: all_selector
			})
			all_section_label.setAttribute("for", filter_id + "_all")

			const all_section_input = ui.create_dom_element({
				element_type	: "input",
				id				: filter_id + "_all",
				type			: "checkbox",
				parent			: all_selector
			})
			all_section_input.checked = false
			all_section_input.addEventListener('change', function(e){
				const checked_value	= e.target.checked
				const container		= e.target.parentNode.parentNode
				const inputs		= container.querySelectorAll("input")
				for (let i = 0; i < inputs.length; i++) {
					if (inputs[i]==all_section_input) continue;
					if (inputs[i].checked!==checked_value) {
						inputs[i].checked = checked_value
						inputs[i].dispatchEvent(new Event('change'));
					}
				}
			}, false);

		// items
			for (let i = 0; i < filter_items.length; i++) {
				const chekbox_node = self.render_option_chekbox(filter_items[i])
				filter_node.appendChild(chekbox_node)
			}

		return filter_node
	};//end build_filter



	/**
	* RENDER_OPTION_CHEKBOX
	* @return
	*/
	this.render_option_chekbox = function(datalist_item) {

		const self = this

		const label		= datalist_item.label
		const value		= datalist_item.value
		const id		= datalist_item.id
		const change	= datalist_item.change


		const li = ui.create_dom_element({
			element_type	: "li"
		})

		// console.log("label", id, label, value);

		// label
			const section_label = ui.create_dom_element({
				element_type	: "label",
				inner_html		: label,
				parent			: li
			})
			section_label.setAttribute("for", id)

		// input
			const input_checkbox = ui.create_dom_element({
				element_type	: "input",
				type			: "checkbox",
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
				input_checkbox.addEventListener('change', function(){

					change(this) // caller callback function

					update_local_storage_ar_id(this)

					// force re-search with new options
						if (self.search_input.value.length>0) {
							if (self.search_fired===false) {
								// search fire is delayed to enable multiple simultaneous selections
								// get final value (input events are fired one by one)
								setTimeout(()=>{
									self.search_fired = true
									self.search_input.dispatchEvent(new Event('input'))

									// restore state after 250 miliseconds.
									// prevents fire multiple events when user selects 'All' option
									// setTimeout(()=>{
										self.search_fired = false
									// },250)
									console.log("///// fired:");
								},250)
							}
						}

				}, false);


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
	};//end render_option_chekbox



	/**
	* BUILD_INPUTS_LIST
	* @return
	*/
	this.render_inputs_list = function(){

		const self = this

		const inputs_list = ui.create_dom_element({
			element_type	: "div",
			class_name		: "inputs_list" // css_autocomplete_hi_search_field
		})

			const ddo_map = self.dd_request.show.ddo_map
			const ddo_map_length = ddo_map.length

			const ar_components = []

			for (let i = 0; i < ddo_map_length; i++) {
				const current_ddo = ddo_map[i]
				// check if the current ddo has children asociated, it's necesary identify the last ddo in the path chain, the last ddo is the component
				const current_ar_valid_ddo = ddo_map.filter(item => item.parent === current_ddo.tipo)
				if(current_ar_valid_ddo.length !== 0) continue

				ar_components.push(current_ddo)
			}

			// const request_ddo = self.dd_request.find(item => item.typo === 'request_ddo').value
			// const sqo_length = request_ddo.length


			// for (let i = sqo_length - 1; i >= 0; i--) {
			// 	const item = request_ddo[i]
			// 	if(item.type==='component' && item.typo==='ddo' && ar_components.indexOf(item.tipo)===-1){
			// 		ar_components.push(item.tipo)
			// 	}
			// }

			const ar_components_length = ar_components.length
			for (let i = 0; i < ar_components_length; i++) {
				const ddo_component		= ar_components[i]
				// const ddo_component	= request_ddo.find((item) => item.type === 'component' && item.typo === 'ddo'&& item.tipo === compoment)

				const component_input = ui.create_dom_element({
					element_type	: "input",
					type			: "text",
					parent			: inputs_list
				})
				const component_label = ddo_component.label.replace(/(<([^>]+)>)/ig,"");
				component_input.setAttribute("placeholder", component_label )
			}


		return inputs_list
	};//end render_inputs_list



	/**
	* BUILD_OPERATOR_SELECTOR
	* @return
	*/
	this.render_operator_selector = function(){
		const self = this
		// operator selector
		// get the operator to use into the filter free
		const operator	= self.dd_request.search && self.dd_request.search.sqo_config && self.dd_request.search.sqo_config.operator
			? rqo_config.search.sqo_config.operator 
			: '$and'
		
			const operator_selector = ui.create_dom_element({
				element_type 	: "div",
				class_name 	 	: "search_operators_div"
			})
				//label
				ui.create_dom_element({
					element_type	: "label",
					class_name		: "css_label label",
					parent			: operator_selector,
					text_content	: get_label["operadores_de_busqueda"] || "Search operators"
					})
				const select = ui.create_dom_element({
					element_type	: "select",
					class_name		: "operator_selector",
					parent			: operator_selector
					})
					select.addEventListener("change",function(e){
						// set the new operator selected
						self.operator 		= e.target.value
						
					},false)
					const option_or = ui.create_dom_element({
						element_type	: "option",
						parent			: select,
						value			: "$or",
						text_content	: get_label.o
						})
					const option_and = ui.create_dom_element({
						element_type	: "option",
						parent			: select,
						value			: "$and",
						text_content	: get_label.y
						})
					if (operator==='$or') {
						option_or.setAttribute("selected", true)
					}else{
						option_and.setAttribute("selected", true)
					}

		return operator_selector
	};//end render_operator_selector



	/**
	* AUTOCOMPLETE_BUILD_OPTIONS to choose it by user
	* @return
	*/
	this.render_datalist = async function(api_response) {

		const self = this

		const datalist = self.datalist

		//delete the last list
		while (datalist.firstChild) {
			datalist.removeChild(datalist.firstChild)
		}
		// get the result from the api response
		const result	= api_response.result
		const data		= result.data
		const context 	= result.context

		// get the sections that was searched
		// const ar_search_sections = self.ar_search_section_tipo

		// get dd objects from the context that will be used to build the lists in correct order
		const rqo_search =  self.rqo_search

		// get the divisor between columns
		const divisor = (rqo_search.show.divisor)
			? rqo_search.show.divisor
			: ' | '

		const columns 		= rqo_search.show.columns

		// get the ar_locator founded in sections
		const data_locator	= data.find((item)=> item.tipo === rqo_search.source.tipo && item.typo === 'sections');
		const ar_locator	= (data_locator) ? data_locator.value : []

		// folow the path of the columns to get the correct data to the last component in the chain, the last component has the text to show.
		// all others ddo in the midle of the chain are portals with locator value, and only will show the last component.
		function get_last_ddo_data_value(current_path, value){
			// check the path length sended, the first loop is the full path, but it is changed with the check data
			const current_path_length = current_path.length 
			for (var i = 0; i < value.length; i++) {
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
				}{
					return get_last_ddo_data_value(new_path, current_value)
				}				
			}
		}

		// iterate the sections
		for (const current_locator of ar_locator) {

			const section_tipo	= current_locator.section_tipo
			const section_id	= current_locator.section_id

			// get data that mach with the current section from the global data sended by the api
			// get the full row with all items in the ddo that mach with the section_id
			const current_row = data.filter((item)=> item.section_tipo === section_tipo && item.section_id === section_id )

			// const current_ddo 	= ddo_map.filter(item => item.model !== 'section' && item.typo === 'ddo' && item.section_tipo === section_tipo)

			// create the li node container
			const li_node = ui.create_dom_element({
				element_type	: 'li',
				class_name		: "autocomplete_data_li",
				dataset			: {value : JSON.stringify(current_locator)},
				parent			: self.datalist
			})

			// when the user do click in one row send the data to the caller_instance for save it.
			li_node.addEventListener('click', function(e){
				e.stopPropagation()
				const value = JSON.parse(this.dataset.value)
				if(self.instance_caller.mode === 'search'){
					// self.instance_caller.datum.data.push({value: current_locator})
				}
				self.instance_caller.add_value(value)
			}, false);

			// values. build the text of the row with label nodes in correct order (the ddo order in context).
				const columns_length = columns.length
				for (let i = 0; i < columns_length; i++) {
						const current_path = columns[i]
					// the columns has the last element in the chain in the first position of the array, 
					// the first position is the only component that is necesary to buil and show
						const ddo_item = current_path[0]
						const current_element_data = get_last_ddo_data_value(current_path, [current_locator])
					// if the element doesn't has data continue to the next element.
						if(current_element_data === false) continue;

					// context of the element
						const current_element_context	= context.find((item)=> item.tipo===ddo_item.tipo && item.section_tipo===current_element_data.section_tipo )

						if (typeof current_element_data==="undefined") {
							console.warn("[render_datalist] Ignored tipo not found in row:", ddo_item.tipo, ddo_item);
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
							mode			: 'mini',
							lang			: current_element_context.lang,
							id_variant		: self.id
						}

						const current_instance = await instances.get_instance(instance_options)
						// current_instance.build(false)
						const node = await current_instance.render()

						// append node (span)
						li_node.appendChild(node)

					// span node
						// const current_value = current_value_element.value
						// ui.create_dom_element({
						// 	element_type	: 'span',
						// 	inner_html		: current_value,
						// 	parent			: li_node
						// })// end create dom node

				}//end for ddo_item

			// dd_info: information about the row, like parents, model, etc, that help to identify the data.
				const current_dd_info = current_row.find((item)=> item.tipo==='ddinfo')
				if(current_dd_info){
					const current_dd_info_value = "- " + current_dd_info.value.join(divisor)
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'attenuated',
						inner_html		: current_dd_info_value,
						parent			: li_node
					})// end create dom node
				}// end if of check current_dd_info

			// debug
				if(SHOW_DEBUG===true) {

					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'attenuated',
						inner_html		: " [" + current_locator.section_tipo + "-" + current_locator.section_id + "]",
						parent			: li_node
					});
				}


		}// end for of current_section (section_tipo)
	};//end render_datalist



	/**
	* AUTOCOMPLETE_SEARCH
	* @param object options {
	* 	component_tipo, section_tipo, divisor, search_query_object
	* }
	*/
	this.autocomplete_search = function(search_value){

		const self = this

		// Request term
			const q		= search_value
			const rqo	= self.rebuild_search_query_object(q);

		// debug
			if(SHOW_DEBUG===true) {
				console.log("[service_autocomplete.autocomplete_search] search_engine:", self.search_engine)
				console.log("self.dd_request", self.dd_request);
			}

			const engine = self.search_engine+'_engine'

		// check valid function name (defined in component properties search_engine)
			if (typeof self[engine]!=="function") {
				console.error("ERROR. Received search_engine function not exists. Review your component properties source->request_config->search_engine :", self.search_engine);
				return new Promise(()=>{})
			}
		//recombine the select ddo with the search ddo to get the list
			// const select = self.instance_caller.dd_request.select
			// const dd_request = (select)
			// 	? self.dd_request.filter(item => item.typo!=='request_ddo')
			// 	: [...self.dd_request]

			// if(select){
			// 	const ddo_select = select.find(item => item.typo === 'request_ddo')
			// 	const value_with_parents = select.find(item => item.typo === 'value_with_parents')
			// 	dd_request.push(ddo_select)
			// 	if(value_with_parents){
			// 		dd_request.push(value_with_parents)
			// 	}
			// }


		// search options
			const options = {
				rqo	: rqo,
				q	: q
			}

		// exec search self.search_engine = dedalo_engine || zenon_engine, the method that will called
			const js_promise = self[engine]( options )


		return js_promise
	};//end autocomplete_search



	/**
	* REBUILD_SEARCH_QUERY_OBJECT
	* Re-combines filter by fields and by sections in one search_query_object
	* @return bool
	*/
	this.rebuild_search_query_object = async function(q) {

		const self = this

		// search_query_object base stored in wrapper dataset
			const original_rqo_search	= await self.instance_caller.rqo_search
			const rqo_search			= JSON.parse(JSON.stringify(original_rqo_search))
			self.rqo_search				= rqo_search
			self.sqo					= rqo_search.sqo
			

			const sqo_options = original_rqo_search.sqo_options
		// delete the sqo_options to the final rqo_options
			delete rqo_search.sqo_options

			if(SHOW_DEBUG===true) {
				console.log("sqo_options:",sqo_options);
			}

		// search_sections. Mandatory. Always are defined, in a custom ul/li list or as default using wrapper dataset 'search_sections'
			const search_sections	= self.ar_search_section_tipo
			self.sqo.section_tipo	= search_sections.map(el=>el.tipo)

			const fixed_filter		= sqo_options.fixed_filter //self.dd_request.find((current_item)=> current_item.typo==='fixed_filter')
			const filter_free		= sqo_options.filter_free	//self.dd_request.find((current_item)=> current_item.typo==='filter_free')
			const filter_by_list	= self.ar_filter_by_list.map(item => item.value)
			// rebuild the filter with the user imputs
			if(filter_free){

				const new_filter = {}
				// Iterate current filter
					for (let operator in filter_free) {
						// get the array of the filters objects, they have the default operator
						const current_filter = filter_free[operator]
						// set the operator with the user selection or the default operator defined in the config_sqo (it comes in the config_rqo)
						const new_operator		= self.operator || operator

						for (let i = 0; i < current_filter.length; i++) {
							// Update q property
							current_filter[i].q	= (q !== "")
								? "*" + q + "*"
								: "false_muyfake_de verdad!"
							current_filter[i].q_split = false
							// create the filter with the operator choosed by the user
							new_filter[new_operator] = current_filter
						}
					}
				
				// filter rebuilded
					self.sqo.filter = {
						"$and" : [new_filter]
						// "$and" : [filter_free]
					}
					if (fixed_filter) {
						for (let i = 0; i < fixed_filter.value.length; i++) {
							self.sqo.filter.$and.push(fixed_filter.value[i])
						}
					}
					if(filter_by_list){
						self.sqo.filter.$and.push({
							$or:[...filter_by_list]
						})
					}
			}//end if(filter_free)

		// allow_sub_select_by_id set to false to allow select deep fields
			self.sqo.allow_sub_select_by_id = true

		// Debug
			if(SHOW_DEBUG===true) {
				//console.log("... sqo:",sqo, JSON.stringify(sqo));
				//console.log("... sqo filter:",sqo.filter);
				//if(typeof clean_filter!=="undefined") console.log("+++ rebuild_sqo final clean_filter ",clean_filter);
			}


		return rqo_search
	};//end rebuild_search_query_object



	/**
	* DEDALO_ENGINE
	* @return promise
	*/
	this.dedalo_engine = async function(options) {

		const rqo = await options.rqo
			  rqo.prevent_lock = true

		if(SHOW_DEBUG===true) {
			console.log("+++ [service_autocomplete.dedalo_engine] rqo:", rqo)
		}

		// verify source is in list mode to allow lang fallback
			const source	= rqo.source
			source.mode		= "list"

		// API read request
			const current_data_manager		= new data_manager()
			const load_section_data_promise	= current_data_manager.request({body:rqo})

		// render section on load data
	 		const api_response = load_section_data_promise
	 		if(SHOW_DEBUG===true) {
	 			console.log("[service_autocomplete.dedalo_engine] api_response:", api_response);
	 		}

		return api_response
	};//end dedalo_engine



	/**
	* ZENON_ENGINE
	* @return
	*/
	this.zenon_engine = function(options) {

		const self = this

		const dd_request	= options.dd_request
		const q				= options.q

		if(SHOW_DEBUG===true) {
			//console.log("[zenon_engine] dd_request:",dd_request);
			console.log("[zenon_engine] source:", dd_request);
		}
		const request_ddo			= dd_request.find(item => item.typo === 'request_ddo').value
		const ar_selected_fields	= request_ddo.filter(item => item.model === 'component_external');
		const ar_fields				= ar_selected_fields.map(field => field.properties.fields_map[0].remote)

		// fields of Zenon "title" for zenon4
			const fields		= ar_fields
			const fields_length	= fields.length
		// section_tipo of Zenon zenon1
			const section_tipo	= ar_selected_fields[0].section_tipo


	  	// format data
	  		const format_data = function(data){
	  			if(SHOW_DEBUG===true) {
	  				console.log("+++ data 1:",data);
					//console.log("+++ dd_request 1:",dd_request);
					//console.log("+++ source 1:",source);
	  			}
				const section_data		= []
				const components_data	= []
				const records			= data.records || []
				const records_length	= records.length
				const separator = " - "
				for (let i = 0; i < records_length; i++) {
					const record 	= records[i]
					const ar_value 	= []
					for (let j = 0; j < fields_length; j++) {

						const field = fields[j]
						const authors_ar_value	= []

						switch(field) {
							case 'authors':
								// console.log("++ authors:",record[field]);

								if(SHOW_DEBUG===true) {
									//console.log("primary:",primary);	console.log("secondary:",secondary);	console.log("corporate:",corporate);
								}

								if (Object.keys(record[field].primary).length > 0) {
									authors_ar_value.push(Object.keys(record[field].primary).join(separator))
								}
								if (Object.keys(record[field].secondary).length > 0) {
									authors_ar_value.push(Object.keys(record[field].secondary).join(separator))
								}
								if (Object.keys(record[field].corporate).length > 0) {
									authors_ar_value.push(Object.keys(record[field].corporate).join(separator))
								}
								ar_value.push(authors_ar_value.join(separator))
								break;
							default:
								if (Array.isArray(record[field])) {
									if (record[field].length>0) {
										ar_value.push(record[field].join(', '))
									}
								}else{
									if (record[field].length>0) {
										ar_value.push(record[field])
									}
								}
								break;
						}
					}//end iterate fields

					// value
						const divisor = self.instance_caller.divisor || ' | '
						const value = ar_value.join(divisor)

					//locator
					const locator = {
						section_tipo	: section_tipo,
						section_id		: record['id']
					}
					// record_data
						const record_data = {
							section_tipo		: section_tipo,
							section_id			: record['id'],
							type				: 'dd687',
							// from_component_tipo	: ar_selected_fields[0].tipo,
							tipo				: ar_selected_fields[0].tipo,
							value				: value
						}


					// insert fomatted item
						section_data.push(locator)
						components_data.push(record_data)
				}//end iterate recoords
				// create the section and your data
				const section ={
					section_tipo	: section_tipo,
					tipo			: section_tipo,
					value			: section_data
				}

				// mix the section and component_data
				const data_formatted = [section, ...components_data]

				const response = {
					msg		: "Ok. Request done",
					result 	: {
						context	: ar_selected_fields,
						data	: data_formatted
					}
				}

				if(SHOW_DEBUG===true) {
					console.log("+++ data_formatted 2:",response);
				}

				return response
			}

		// trigger vars
			const url_trigger  = "https://zenon.dainst.org/api/v1/search"
			const trigger_vars = {
					lookfor		: (q==='') ? 'ñññññññ---!!!!!' : q, // when the q is empty, Zenon get the first 10 records of your DDBB, in that case we change the empty with a nonsense q
					type		: "AllFields", // search in all fields
					sort		: "relevance",
					limit		: 20,
					prettyPrint	: false,
					lng			: "de"
				}; // console.log("*** [zenon_engine] trigger_vars", trigger_vars, dd_request)

			const pairs = []
			for (var key in trigger_vars) {
				pairs.push( key+'='+trigger_vars[key] )
			}
			let url_arguments =  pairs.join("&")
			// const fields   = ["id","authors","title","urls","publicationDates"]
			for (let i = 0; i < fields_length; i++) {
				url_arguments += "&field[]=" + fields[i]
			}

		// XMLHttpRequest promise
			return new Promise(function(resolve, reject) {

				const request = new XMLHttpRequest();

					// ready state change event
						// request.onreadystatechange = function() {
						// 	if (request.readyState == 4 && request.status == 200) {
						// 		//console.dir(request.response)
						// 		//console.dir(request.responseText);
						// 	}
						// }

					// open xmlhttprequest
						//request.open("POST", "https://zenon.dainst.org/api/v1/search?type=AllFields&sort=relevance&page=1&limit=20&prettyPrint=false&lng=de&lookfor=david", true);
						request.responseType = 'json';
						request.open("POST", url_trigger + "?" + url_arguments, true);

					// onload event
						request.onload = function() {
							if (request.status === 200) {

								// data format
									const data = format_data(request.response)

								// If successful, resolve the promise by passing back the request response
									resolve(data);

							}else{
								// If it fails, reject the promise with a error message
								reject(Error('Reject error don\'t load successfully; error code: ' + request.statusText));
							}
						};

					// request error
						request.onerror = function() {
							// Also deal with the case when the entire request fails to begin with
							// This is probably a network error, so reject the promise with an appropriate message
							reject(Error('There was a network error. data_send: '+url_trigger+"?"+ url_arguments + "statusText:" + request.statusText));
						};

				// send the request
					request.send();

			})//end Promise
	};//end zenon_engine



};//end service_autocomplete
