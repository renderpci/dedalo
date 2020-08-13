/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../common/js/data_manager.js'
	import {ui} from '../../../common/js/ui.js'



/**
* SERVICE_AUTOCOMPLETE
* Used as service by component_portal, (old component_autocomplete, component_autocomplete_hi)
* component_relation_parent, component_relation_children, component_relation_related
*
*/
export const service_autocomplete = function() {


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
		self.ar_dd_request			= self.instance_caller.dd_request.search
		self.dd_request				= self.ar_dd_request[0]
		self.sqo					= self.dd_request.find((current_item)=> current_item.typo==='sqo')
		self.ar_search_section_tipo	= self.sqo.section_tipo
		self.ar_filter_by_list		= []
		
		// engine. get the search_engine sended or set the default value
			const engine			= self.dd_request.find((current_item)=> current_item.typo==='search_engine').value
			self.search_engine		= (engine) ? engine : 'dedalo_engine';

		// Vars
			self.tipo		= self.instance_caller.tipo
			self.properties	= self.instance_caller.context.properties || {}
			self.list_name	= 's_'+new Date().getUTCMilliseconds()

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

		// build operator selector
		const source_selector = self.render_source_selector()
		options_container.appendChild(source_selector)
		// sections select
		const sections_selector = self.render_sections_selector()
		options_container.appendChild(sections_selector)

		// components fields for inputs_list
		const inputs_list = self.render_inputs_list()
		options_container.appendChild(inputs_list)
		// build operator selector
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

		self.searh_container 	= searh_container
		self.search_input 		= search_input
		self.datalist 			= datalist

		return true
	};// end render



	/**
	* RENDER_SOURCE_SELECTOR
	* @return
	*/
	this.render_source_selector = function() {

		const self = this

		// source elements
			const ar_source 	= self.ar_dd_request

		// switcher source
			const source_selector = ui.create_dom_element({
				element_type 	: "div",
				class_name 	 	: "source_selector"
			})
			// label
				ui.create_dom_element({
					element_type 	: "label",
					class_name 		: "css_label label",
					text_content 	: get_label["origen"] || "Source",
					parent 			: source_selector
				})

			const select = ui.create_dom_element({
						element_type 	: "select",
						class_name 		: "select_source_selector",
						parent 			: source_selector
					})

			// others
				const ar_search_length = ar_source.length
				for (let i = 0; i < ar_search_length; i++) {

					const source		= ar_source[i]
					const current_sqo	= source.find((item) => item.typo === 'sqo')
					const ar_section	= current_sqo.section_tipo
					const ddo_section	= source.find((item) => item.type === 'section' && item.typo === 'ddo')
					const search_engine	= source.find((current_item)=> current_item.typo==='search_engine').value

					const swicher_source = ui.create_dom_element({
						element_type	: "option",
						parent			: select,
						value			: i+'',
						inner_html		: ar_section.length > 1
							? ddo_section.label + ", etc."
							: ddo_section.label
					})
					if (search_engine===self.search_engine) {
						swicher_source.setAttribute("selected", true)
					}

				}

			// add listener to the select
			select.addEventListener('change',function(e){
				const key = e.target.value

				self.dd_request				= self.ar_dd_request[key]
				self.sqo					= self.dd_request.find((current_item)=> current_item.typo==='sqo')
				self.ar_search_section_tipo	= self.sqo.section_tipo
				self.search_engine			= self.dd_request.find((current_item)=> current_item.typo==='search_engine').value
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
	* BUILD_SECTIONS_SELECTOR
	* @return
	*/
	this.render_sections_selector = function(){

		const self = this

		const ar_section_nodes	= []
		const filter_by_list	= self.dd_request.find(item => item.typo === 'filter_by_list') || false		
		const local_storage_ar_id		= []

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
					const section		= ar_sections[i]
					const ddo_section	= self.dd_request.find((item) => item.type === 'section' && item.tipo === section && item.typo === 'ddo')
					const datalist_item = {
						grouper	: 'sections',
						id		: section,
						value	: section,
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

					local_storage_ar_id.push(section)
				}

				const filter_node = self.build_filter(filter_items)
				filters_container.appendChild(filter_node)
			}

		// filter_by_list . if the component caller has a filter_by_list we add the datalist of the compoment
			if(filter_by_list) {

				for (let i = 0; i < filter_by_list.value.length; i++) {
					const current_filter		= filter_by_list.value[i]
					const section				= current_filter.section_tipo
					const component_tipo		= current_filter.tipo
					const component_datalist	= current_filter.datalist

					const filter_items = []
					for (let j = 0; j < component_datalist.length; j++) {
						const current_datalist = component_datalist[j]
						const id = section +'_'+ component_tipo +'_'+ current_datalist.section_id
						const q = {
							section_id			: current_datalist.value.section_id,
							section_tipo		: current_datalist.value.section_tipo,
							from_component_tipo	: component_tipo
						}
						const path =[{
							section_tipo	: section,
							component_tipo	: component_tipo,
						}]
						const datalist_item = {
							grouper	: component_tipo,
							id		: id,
							value	: {
								q		: q,
								path	: path
							},
							label 	: current_datalist.label,
							change  : function(input_node){

								const index = self.ar_filter_by_list.findIndex(item => item.id===input_node.id)
								if (input_node.checked===true && index === -1) {
									self.ar_filter_by_list.push({
										id		: input_node.id,
										value	: input_node.dd_value
									})
								}else{
									self.ar_filter_by_list.splice(index, 1);
								}								
							}
						}
						filter_items.push(datalist_item)
						self.ar_filter_by_list.push(datalist_item)

						local_storage_ar_id.push(id)
					}
					const filter_node = self.build_filter(filter_items)
					filters_container.appendChild(filter_node)
				}
			}

		// localStorage
			if (!localStorage.getItem(self.id)) {
				// add full the first time
				localStorage.setItem(self.id, JSON.stringify(local_storage_ar_id) )
			}

			// console.log("localStorage.getItem(self.id)", JSON.parse(localStorage.getItem(self.id)) );

		return filters_container
	};//end render_sections_selector


	/**
	* build_filter
	* @return DOM node
	*/
	this.build_filter = function(filter_items) {

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
				inner_html		: get_label.todos, //ddo_section.label ||
				parent			: all_selector
			})
			all_section_label.setAttribute("for", self.list_name + "_all")

			const all_section_input = ui.create_dom_element({
				element_type	: "input",
				id				: self.list_name + "_all",
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
					if(local_storage_ar_id.indexOf(id)!==-1){
						input_checkbox.checked = true
					}else{
						input_checkbox.checked = false
					}
				}			

			input_checkbox.addEventListener('change', function(){

				change(this) // caller callback function
				
				update_local_storage_ar_id(this)
				
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

			const ar_components = []
			const sqo_length = self.dd_request.length


			for (let i = sqo_length - 1; i >= 0; i--) {
				const item = self.dd_request[i]
				if(item.type==='component' && item.typo==='ddo' && ar_components.indexOf(item.tipo)===-1){
					ar_components.push(item.tipo)
				}
			}

			for (let i = ar_components.length - 1; i >= 0; i--) {
				const compoment		= ar_components[i]
				const ddo_component	= self.dd_request.find((item) => item.type === 'component' && item.typo === 'ddo'&& item.tipo === compoment)

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
		const filter_free 	= self.dd_request.find(item => item.typo ==='filter_free')
		const operator 		= filter_free.operator
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
						// get the new operator selected
						const new_operator	= e.target.value
						const sqo_filter	= self.sqo.filter
						// get the old operator
						const ar_operators	= Object.keys(sqo_filter)
						const op_length		= ar_operators.length
						// change the operator with the new selected
						for (let i = op_length - 1; i >= 0; i--) {
							sqo_filter[new_operator] = sqo_filter[ar_operators[i]]
							delete sqo_filter[ar_operators[i]]
						}
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
	* AUTOCOMPLETE_BUILD_OPTIONS
	* @return
	*/
	this.render_datalist = function(api_response) {

		const self = this

		const datalist = self.datalist

		//delete the last list
		while (datalist.firstChild) {
			datalist.removeChild(datalist.firstChild)
		}
		// get the result from the api response
		const result	= api_response.result
		const data		= result.data
		// get the sections that was searched
		// const ar_search_sections = self.ar_search_section_tipo

		// get the ar_locator founded in section
		const data_locator	= data.find((item)=> item.tipo === item.section_tipo);
		const ar_locator	= (data_locator) ? data_locator.value : []

		// iterate the sections
		for (const current_locator of ar_locator) {

			const section_tipo	= current_locator.section_tipo
			const section_id	= current_locator.section_id

			// get data that mach with the current section from the global data sended by the api
			// get the full row with all items in the ddo that mach with the section_id
			const current_row = data.filter((item)=> item.section_tipo === section_tipo && item.section_id === section_id )
			// get dd objects from the context that will be used to build the lists in correct order
			const select = self.instance_caller.dd_request.select || self.instance_caller.dd_request.show

			const select_divisor = select.find(item => item.typo === 'divisor')
			const divisor = (select_divisor)
				? select_divisor.value
				: ' - '
			// const current_ddo = self.dd_request.filter((item) => item.typo === 'ddo'&& item.section_tipo === section_tipo)
			const current_ddo = select.filter((item) => item.typo === 'ddo'&& item.section_tipo === section_tipo)

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
				self.instance_caller.add_value(value)
			}, false);


			// values. build the text of the row with label nodes in correct order (the ddo order in context).
				for(const ddo_item of current_ddo){

					// value_element
						const current_value_element = current_row.find((item)=> item.tipo===ddo_item.tipo)
						if (typeof current_value_element==="undefined") {
							console.warn("[render_datalist] Ignored tipo not found in row:", ddo_item.tipo, ddo_item);
							continue
						}

					// span node
						const current_value = current_value_element.value
						ui.create_dom_element({
							element_type	: 'span',
							inner_html		: current_value,
							parent			: li_node
						})// end create dom node

				}//end for ddo_item

			// dd_info: information about the row, like parents, model, etc, that help to identify the data.
				const current_dd_info = current_row.find((item)=> item.tipo==='ddinfo')
				if(current_dd_info){
					const current_dd_info_value = divisor + current_dd_info.value.join(divisor)
					ui.create_dom_element({
						element_type	: 'span',
						inner_html		: current_dd_info_value,
						parent			: li_node
					})// end create dom node
				}// end if of check current_dd_info

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
			const q	= search_value
			self.rebuild_search_query_object(q);

		// debug
			if(SHOW_DEBUG===true) {
				console.log("[service_autocomplete.autocomplete_search] search_engine:", self.search_engine)
				console.log("self.dd_request", self.dd_request);
			}

		// check valid function name (defined in component properties search_engine)
			if (typeof self[self.search_engine]!=="function") {
				console.error("ERROR. Received search_engine function not exists. Review your component properties source->request_config->search_engine :", self.search_engine);
				return new Promise(()=>{})
			}
		//recombine the select ddo with the search ddo to get the list
			const select = self.instance_caller.dd_request.select
			const dd_request = (select)
				? self.dd_request.filter(item => item.typo!=='ddo')
				: [...self.dd_request]

			if(select){
				const ddo_select = select.filter(item => item.typo === 'ddo' || item.typo === 'value_with_parents')
				dd_request.push(...ddo_select)
			}

		// search options
			const options = {
				dd_request	: dd_request,
				q			: q
			}

		// exec search self.search_engine = dedalo_engine || zenon_engine, the method that will called
			const js_promise = self[self.search_engine]( options )


		return js_promise
	};//end autocomplete_search



	/**
	* REBUILD_SEARCH_QUERY_OBJECT
	* Re-combines filter by fields and by sections in one search_query_object
	* @return bool
	*/
	this.rebuild_search_query_object = function(q) {

		const self = this

		// search_query_object base stored in wrapper dataset
			const sqo = self.sqo

			if(SHOW_DEBUG===true) {
				//console.log("sqo:",sqo);
			}

		// search_sections. Mandatory. Always are defined, in a custom ul/li list or as default using wrapper dataset 'search_sections'
			const search_sections = self.ar_search_section_tipo

			const fixed_filter		= self.dd_request.find((current_item)=> current_item.typo==='fixed_filter')
			const filter_free		= self.dd_request.find((current_item)=> current_item.typo==='filter_free')
			const filter_by_list 	= self.ar_filter_by_list.map(item => item.value)

			if(filter_free){

				const filter_free_value = filter_free.value

				// Iterate current filter
					for (let operator in filter_free_value) {

						const current_filter = filter_free_value[operator]
						for (let i = 0; i < current_filter.length; i++) {

							// Update q property
							current_filter[i].q	= (q !== "")
								? "*" + q + "*"
								: "false_muyflase_de verdad"
							current_filter[i].q_split = false
						}
					}

				// filter rebuilded
					self.sqo.filter = {
						"$and" : [filter_free_value]
						// "$and" : []
					}
					if (fixed_filter) {
						for (let i = 0; i < fixed_filter.value.length; i++) {
							sqo.filter.$and.push(fixed_filter.value[i])
						}
					}
					if(filter_by_list){
						sqo.filter.$and.push(...filter_by_list)
					}
			}//end if(filter_free)
			console.log("sqo", sqo);

		// allow_sub_select_by_id set to false to allow select deep fields
			sqo.allow_sub_select_by_id = false

		// Debug
			if(SHOW_DEBUG===true) {
				//console.log("... sqo:",sqo, JSON.stringify(sqo));
				//console.log("... sqo filter:",sqo.filter);
				//if(typeof clean_filter!=="undefined") console.log("+++ rebuild_sqo final clean_filter ",clean_filter);
			}


		return sqo
	};//end rebuild_search_query_object



	/**
	* DEDALO_ENGINE
	* @return promise
	*/
	this.dedalo_engine = async function(options) {

		const dd_request 	= options.dd_request

		if(SHOW_DEBUG===true) {
			console.log("+++ [service_autocomplete.dedalo_engine] dd_request:", dd_request)
		}

		// verify source is in list mode to allow lang fallback
			const source	= dd_request.find(item => item.typo==="source")
			source.mode		= "list"

		// API read request
			const current_data_manager		= new data_manager()
			const load_section_data_promise	= current_data_manager.read(dd_request)

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

		const dd_request 	= options.dd_request
		const q 			= options.q

		if(SHOW_DEBUG===true) {
			//console.log("[zenon_engine] dd_request:",dd_request);
			console.log("[zenon_engine] source:", dd_request);
		}

		const ar_selected_fields		= dd_request.filter(item => item.model === 'component_external');
		const ar_fields					= ar_selected_fields.map(field => field.properties.fields_map[0].remote)

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
				const section_data 		= []
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
						section_tipo		: section_tipo,
						section_id			: record['id']
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
					value 			: section_data
				}

				// mix the section and component_data
				const data_formatted = [section, ...components_data]

				const response = {
					msg		: "Ok. Request done",
					result 	: {
						context : ar_selected_fields,
						data 	: data_formatted
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
