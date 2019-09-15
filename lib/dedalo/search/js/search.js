// import
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_search} from './render_search.js'
	import event_manager from '../../page/js/page.js'
	import * as instances from '../../common/js/instances.js'
	import {create_cookie, read_cookie, erase_cookie} from '../../common/js/utils/cookie.js'


/**
* SEARCH
*/
export const search = function() {

	// render prototypes
		this.render_base 				= render_search.prototype.render_base
		this.render_components_list 	= render_search.prototype.render_components_list
		this.render_search_buttons 		= render_search.prototype.render_search_buttons
		this.build_search_group 		= render_search.prototype.build_search_group
		this.build_search_component 	= render_search.prototype.build_search_component



	/**
	* OBJECT VARS
	*/
		//this.url_trigger = DEDALO_LIB_BASE_URL + '/search/trigger.search2.php'

		this.search_presets_section_tipo = "dd623" // Search Presets

		this.search_layout_state

		this.initied = false

		this.search_panel_is_open = false

		this.modo = null
		// 	main_object is the JSON object used for init the search
		this.main_object
		// call back on submit search
		this.search_callback
		// layout_map of the select for procesing the columns of the result of the search
		this.ar_list_map
		// get the components in the result_query_object with a concrect mode, by default parse_mode = list
		this.parse_mode
		// search_options_store . Store current sections search options var
		//this.search_options_store = {}



	/**
	* INIT
	* @return
	*/
	this.init = async function(options) {

		const self = this

		self.instance_caller	= options.caller
		self.context			= options.caller.context
		self.section_tipo 	 	= self.instance_caller.section_tipo
		self.events_tokens		= []
		self.parent_node 		= null
		self.components_list 	= {}
		self.ar_instances 		= []
		self.sqo 				= self.instance_caller.sqo_context.show.find(el => el.typo==='sqo')
		self.limit 				= self.sqo.limit || 10
		
		// events subscription
		// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('change_search_element', (instance)=>{
				self.parse_dom_to_json_filter({mode:self.mode})
				// Set as changed
				self.update_state({state:'changed'})
			})
		)
		

		return true
	}//end init



	/**
	* BUILD
	* @return dom element filter_wrapper
	*/
	this.build = async function(){

		const self = this

		// load editing preset
			const current_data_manager 	= new data_manager()
			const editing_preset 		= await current_data_manager.request({
				//url  : self.url_trigger,
				body : {
					action 	 	 		: "filter_get_editing_preset",
					target_section_tipo : self.section_tipo,
				}
			})

			const json_filter 	= JSON.parse(editing_preset.result.json_filter)
			self.json_filter 	= json_filter
		
		// get the section_tipo from editing_preset
			/*
			const load_all_section_elements_context = async () => {

				const editing_preset_sections 	= self.get_ar_sections_from_editing_preset(json_filter)
				const ar_sections_raw 			= [self.section_tipo, ...editing_preset_sections]
				const ar_sections 				= []
				for (let i = 0; i < ar_sections_raw.length; i++) {
					if(ar_sections.indexOf(ar_sections_raw[i])===-1){
						ar_sections.push(ar_sections_raw[i])
					}
				}

				// load data
					//const current_data_manager 	= new data_manager()
					const api_response 			= await current_data_manager.request({
						//url  : self.url_trigger,
						body : {
							action 	 	 	: "get_section_elements_context",
							context_type	: 'simple',
							ar_section_tipo : ar_sections
						}
					})
					for (let i = 0; i < ar_sections.length; i++) {
						// fix
						self.components_list[ar_sections[i]] = api_response.result.filter(element => element.section_tipo === ar_sections[i])
					}
					console.log("*****self.components_list:",self.components_list);

				return self.components_list
			}
			//load_all_section_elements_context()
			*/

		// load user preset
			//const current_data_manager 	= new data_manager()
			const user_presets 			= await current_data_manager.request({
				//url  : self.url_trigger,
				body : {
					action 	 	 		: "filter_get_user_presets",
					target_section_tipo : self.section_tipo
				}
			})

		// render base html bounds
			const filter_wrapper = await self.render_base()


		// render left section component list
			self.render_components_list({
				section_tipo : self.section_tipo,
				target_div 	 : self.search_container_selector,
				path 		 : []
			})

		// render components from preset
			self.parse_json_query_obj_to_dom({
				editing_preset 		: json_filter,
				allow_duplicates 	: true
			})

		// render buttons
			self.render_search_buttons()


		return filter_wrapper
	}//end build



	/**
	* LOAD_COMPONENTS_FROM_SECTION
	* Call to dd_api to obtain the list of components associated to current options section_tipo
	* @param object options
	*	string options.section_tipo
	* @return promise
	*/
	this.load_components_from_section = async function(options) {

		const self = this

		// section_tipo (string|array)
			const section_tipo 	= options.section_tipo

		// components
			const get_components = async () => {
				if (self.components_list[section_tipo]) {

					return self.components_list[section_tipo]

				}else{

					// load data
						const current_data_manager 	= new data_manager()
						const api_response 			= await current_data_manager.request({
							//url  : self.url_trigger,
							body : {
								action 	 	 	: "get_section_elements_context",
								context_type	: 'simple',
								ar_section_tipo : [section_tipo]
							}
						})

					// fix
						self.components_list[section_tipo] = api_response.result

					return api_response.result
				}
			}
			const components = get_components()


		return components
	}//end load_components_from_section



	/**
	* LOAD_COMPONENT_CONTEXT
	* Call to dd_api to obtain the list of components associated to current options section_tipo
	* @param object options
	*	string options.section_tipo
	* @return promise
	*/
	this.load_component_context = async function(options) {

		const self = this

		// vars
			const section_tipo 	= options.section_tipo

		// components
			const get_components = async () => {
				if (self.components_list[section_tipo]) {

					return self.components_list[section_tipo]

				}else{

					// load data
						const current_data_manager 	= new data_manager()
						const api_response 			= await current_data_manager.request({
							//url  : self.url_trigger,
							body : {
								action 	 	 	: "get_section_components",
								ar_section_tipo : [section_tipo]
							}
						})

					// fix
						self.components_list[section_tipo] = api_response.result

					return api_response.result
				}
			}
			const components = get_components()


		return components
	}//end load_component_context



	/**
	* CALCULATE_COMPONENT_PATH
	* Resolve component full search path. Used to build json_search_object and
	* create later the filters and selectors for search
	* @param object element
	*	Contains all component data collected from trigger
	* @param array path
	*	Contains all paths prom previous click loads
	* @return array component_path
	*	Array of objects
	*/
	this.calculate_component_path = function(component_context, path) {

		if (!Array.isArray(path)) {
			console.log("[search2.calculate_component_path] Fixed bad path as array! :",path);
			path = []
		}

		const calculate_component_path = []

		// Add current path data
		const path_len = path.length
		for (let i = 0; i < path_len; i++) {
			calculate_component_path.push(path[i])
		}

		// Add component path data
		calculate_component_path.push({
			section_tipo 	: component_context.section_tipo,
			component_tipo 	: component_context.tipo,
			modelo  		: component_context.model,
			name  			: component_context.label.replace(/<[^>]+>/g, '')
		})

		return calculate_component_path
	}//end calculate_component_path



	/**
	* GET_AR_SECTIONS_FROM_EDITING_PRESET
	* @return
	*//*
	this.get_ar_sections_from_editing_preset = function(editing_preset) {

		const self = this

		let ar_sections = []

			console.log("editing_preset:",editing_preset);

		for (const key in editing_preset) {

			if (key.indexOf('$')!==-1) {

				const ar_data = editing_preset[key]

				// Recursions
					const ar_data_len = ar_data.length
					for (let i = 0; i < ar_data_len; i++) {
						console.log("ar_data[i]:",ar_data[i]);
						if(ar_data[i].path){
							const current_path = ar_data[i].path
							const last_item  = current_path[current_path.length-1]
							if(ar_sections.indexOf(last_item.section_tipo)===-1 ){
								ar_sections.push(last_item.section_tipo)
							}
						}else{
							for (const current_operator_filter in ar_data[i]) {
								if (current_operator_filter.indexOf('$')!==-1) {
									const current_sections = self.get_ar_sections_from_editing_preset(ar_data[i])
									for (let k = 0; k < current_sections.length; k++) {
										if(ar_sections.indexOf(current_sections[k])===-1){
											ar_sections.push(current_sections[k])
										}
									}
								}// end if (ar_data[i].indexOf('$')!==-1)
							}
						}
					}// end for (let i = 0; i < ar_data_len; i++)
			}// end if (key.indexOf('$')!==-1)
		}

		return ar_sections
	}//end get_ar_sections_from_editing_preset
	*/



	/**
	* ONDRAG_START
	* Get element dataset path as event.dataTransfer from selected component
	* @return bool true
	*/
	this.on_dragstart = function(obj, event) {
		event.stopPropagation();

		//console.log("dragstart:",obj);
		
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', obj.dataset.path);

		return true
	}//end ondrag_start


	/**
	* ON_DRAGOVER
	*/
	this.on_dragover = function(obj, event) {
		event.preventDefault();
		event.stopPropagation();
		//console.log("dragover");
		//event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

		// Add drag_over class
		//	obj.classList.add('drag_over')
	}//end on_dragover



	/**
	* ON_DRAGLEAVE
	*/
	this.on_dragleave = function(obj, event) {

		//console.log("dragleave");
		//obj.classList.remove('drag_over')
	}//end on_dragleave



	/**
	* ON_DROP
	* Get data path from event.dataTransfer and call to build required component html
	* @return bool true
	*/
	this.on_drop = function(obj, event) {
		event.preventDefault() // Necessary. Allows us to drop.
		event.stopPropagation()

		const self = this

		//console.log("on_drop:",obj);
		//console.log("on_drop event:", event.dataTransfer.getData('text/plain'));		
		const path 		  = event.dataTransfer.getData('text/plain');// element thats move
		const wrap_target = obj 	 // element on user leaves source wrap

		// Build component html
		self.build_search_component(wrap_target, path).then(()=>{
			//Update the state and save
			self.update_state({state:'changed'})
		});

		return true
	}//end on_drop



	/**
	* PARSE_JSON_QUERY_OBJ_TO_DOM
	* @return bool
	*/
	this.parse_json_query_obj_to_dom = function(options) {
		
		const self = this

		const editing_preset 			= options.editing_preset
		const clean_q 					= options.clean_q || false
		const allow_duplicates 			= options.allow_duplicates || false
		const search_group_container 	= self.search_group_container

		// Clean target_div
			while (search_group_container.hasChildNodes()) {
				search_group_container.removeChild(search_group_container.lastChild);
			}

		// Reset resolved
			this.ar_resolved_elements = []

		// Build global_group
			self.build_dom_group(editing_preset, search_group_container, {
				is_root 		 : true,
				clean_q 		 : clean_q,
				allow_duplicates : allow_duplicates
			})
			//console.log("global_group:",global_group);


		return true
	}//end parse_json_query_obj_to_dom



	/**
	* BUILD_DOM_GROUP
	* @return
	*/
	this.ar_resolved_elements = []
	this.build_dom_group = async function(editing_preset, dom_element, options) {

		const self = this

		let   dom_group 		= null
		const allow_duplicates 	= (options && options.allow_duplicates) ? options.allow_duplicates : false


		for (const key in editing_preset) {

			// Case is component, only add when key is path
			if (key==='path') {

				let current_value 	= editing_preset.q
					//console.log("current_value:",current_value, editing_preset);
				let q_operator 		= editing_preset.q_operator
					//console.log("q_operator:",editing_preset);

				// Resolved check (useful for sequences or split strings)
					const resolved_string = JSON.stringify(editing_preset.path) + current_value
					if (self.ar_resolved_elements.indexOf(resolved_string)===-1) {

						if (options.clean_q===true) {
							current_value 	= ''
							q_operator 		= ''
						}

						// Add. If not already resolved, add
							self.build_search_component( dom_element, JSON.stringify(editing_preset.path), current_value, q_operator)

						// Set as resolved
							if (allow_duplicates!==true) {
								self.ar_resolved_elements.push(resolved_string)
							}
					}

			}else
			// If key contains $ is a group
			if (key.indexOf('$')!==-1) {

				// Case is group
					const ar_data = editing_preset[key]
					//console.log("key,ar_data:",key,ar_data);

				// Build dom search_group
					const current_search_group = await self.build_search_group( dom_element, {
						operator : key,
						is_root	 : options.is_root ? options.is_root : false
					})

				// Recursions
					const ar_data_len = ar_data.length
					for (let i = 0; i < ar_data_len; i++) {
						const current_json_object = ar_data[i]
						options.is_root = false
						self.build_dom_group(current_json_object, current_search_group, options)
					}
			}
		}//end for (const key in editing_preset) 


		return dom_group
	}//end build_dom_group


	// TOGGLES 

		/**
		* TOGGLE_OPERATOR_VALUE
		* @return bool true
		*/
		this.toggle_operator_value = function(element) {

			const self = this

			const text 	  = element.innerHTML
			const ar_text = text.split(" ");
			const number  = ar_text[1]

			if (element.dataset.value==="$and") {
				// Replace dataset value
				element.dataset.value = "$or";

				// Inject new html value
				element.innerHTML = self.localize_operator(element.dataset.value) + " " + number

				element.classList.remove("and")
				element.classList.add("or")

			}else{
				// Replace dataset value
				element.dataset.value = "$and";

				// Inject new html value
				element.innerHTML = self.localize_operator(element.dataset.value) + " " + number

				element.classList.remove("or")
				element.classList.add("and")
			}

			return true
		}//end toggle_operator_value



		/**
		* TOGGLE_FIELDS
		* @return
		*/
		this.toggle_fields = function(button) {

			const search_container_selector = button.parentNode.querySelector(".search_container_selector")

			// Read cookie to track state
			const cookie_name = "fields_open_panel"

			if (search_container_selector.classList.contains("display_none")) {
				search_container_selector.classList.remove("display_none")
				create_cookie(cookie_name, "true", 365)
			}else{
				search_container_selector.classList.add("display_none")
				create_cookie(cookie_name, "false", 365)
			}


			return true
		}//end toggle_fields



		/**
		* TOGGLE_PRESETS
		* @return
		*/
		this.toggle_presets = function(button, mode) {

			const search_container_selection_presets = button.parentNode.querySelector(".search_container_selection_presets")

			// Read cookie to track state
			const cookie_name = "search_presets_open_panel"

			if (search_container_selection_presets.classList.contains("display_none")) {
				search_container_selection_presets.classList.remove("display_none")
				create_cookie(cookie_name, "true", 365)
			}else{
				search_container_selection_presets.classList.add("display_none")
				create_cookie(cookie_name, "false", 365)
			}


			return true
		}//end toggle_presets



	/**
	* LOCALIZE_OPERATOR
	* @return
	*/
	this.localize_operator = function(operator) {

		// Remove $ (first char)
		operator = operator.slice(1)

		let localized = '';//operator

		let name = operator
		if (operator==="and") {
			name = "y"
		}else if(operator==="or"){
			name = "o"
		}

		let label = get_label[name]
		if (label) {
			localized = label
		}

		return localized
	}//end localize_operator



	/**
	* GET_COMPONENT_HTML
	* @return promise
	*/
	this.get_component = async function(options) {
		
		const self = this

		const source = {
				model 			: options.model,
				tipo 			: options.component_tipo,
				section_tipo 	: options.section_tipo,
				section_id 		: null,
				mode 			: 'search'
		}
		const current_data_manager 	= new data_manager()
		const api_response 			= await current_data_manager.request({
			body : {
				action : "get_element_context",
				source : source
			}
		})

		const current_component_context 	= api_response.result[0]
		const current_lang 					= current_component_context.lang

		const serial = performance.now() //Date.now()
		const key 	 = options.section_tipo +'_'+ options.component_tipo +'_search_'+ current_lang +'_'+ serial

		const current_data 	= {value : options.value || []}
		const current_datum = {context : current_component_context, data : current_data}

		const component_instance = await instances.get_instance({
			key 			: key,
			model 			: current_component_context.model,
			tipo 			: current_component_context.tipo,
			section_tipo 	: current_component_context.section_tipo,
			section_id 		: null,
			mode 			: 'search',
			lang 			: current_lang,

			context 		: current_component_context,
			data 			: current_data,
			datum 			: current_datum,
			sqo_context 	: current_component_context.sqo_context
		})
			
		//add search options to the instance
		component_instance.data.q_operator 	= options.q_operator
		component_instance.path 			= options.path
		// add
		self.ar_instances.push(component_instance)


		return component_instance
	}//end get_component



	// GET the SQO from DOM components
		/**
		* PARSE_DOM_TO_JSON_FILTER
		* @return object json_query_obj
		*/
		this.parse_dom_to_json_filter = function(options) {

			const self = this

			// Mode. Used to indicate that q values for search must be converted to usable search values by the components (search)
			const mode 				= options.mode || 'default'
			const save_arguments 	= options.save_arguments

			const json_query_obj = {
				id 		: "temp",
				filter 	: {}
			}

			// First level
				const root_search_group = self.root_search_group

			// Add arguments. Used to exclude search arguments on save preset in this mode
				let add_arguments = true // Default is true
				if ( typeof save_arguments!=="undefined" && (save_arguments==="true" || save_arguments==="false")) {
					add_arguments = JSON.parse(save_arguments)
				}
			
			// Calculate recursively all groups inside
				const filter_obj = self.recursive_groups(root_search_group, add_arguments, mode)
				if(SHOW_DEBUG===true) {
					console.log("++++++++ [parse_dom_to_json_filter] filter_obj: ", filter_obj);
				}

			// Add object with groups fo filter array
				json_query_obj.filter = filter_obj


			return json_query_obj
		}//end parse_dom_to_json_filter



		/**
		* RECURSIVE_GROUPS
		* @return object query_group
		*/
		this.recursive_groups = function(group_dom_obj, add_arguments, mode) {
			
			const self = this

			const operator = self.get_search_group_operator(group_dom_obj)

			const query_group = {}
				  query_group[operator] = []

			// elements inside
			// let ar_elements = group_dom_obj.querySelectorAll(":scope > .search_component,:scope > .search_group") //
			const ar_elements = group_dom_obj.children			
			const len = ar_elements.length
			for (let i = 0; i < len; i++) {

				const element = ar_elements[i]

				// if the element is a search_group (the element with the operator) do a recursion
				if (element.classList.contains('search_group') ) {
					// Add group (recursion)
					query_group[operator].push( self.recursive_groups(element, add_arguments, mode) )				
				}
				// else the element is a component element
				else if( element.classList.contains('search_component') ) {

					// Q . Search argument
					// Get value from component wrapper dataset (previously fixed on change value)
					let q 			= null // default
					let q_operator 	= null // default
					// add_arguments . if true, calculate and save inputs value to preset (temp preset)
					if (add_arguments!==false) {

						const component_wrapper 	= element.querySelector('.wrapper_component')						
						const component_instance 	= self.ar_instances.find(instance => instance.id===component_wrapper.id)
						// overwrite
						if (typeof component_instance!=="undefined") {
							q 						= component_instance.data.value
							q_operator 				= component_instance.data.q_operator
						}			
					}

					// Add component
					if (mode==="search") {
						// Add only if not empty
						if ( (q && q.length>0 && q!=='[]') || (q_operator && q_operator.length>0) ) {
							// If empty q but not q_operator, set q as 'only_operator' for avoid send empty q value
							if( (!q || q.length===0 || q==='[]') && (q_operator && q_operator.length>0) ) {
								q = "only_operator"
							}
							query_group[operator].push({
								q 	 		: q,
								q_operator 	: q_operator,
								path 		: JSON.parse(element.dataset.path),
								type 		: "jsonb"
							})
						}
					}else{
						// Add always
						query_group[operator].push({
							q 	 		: q,
							q_operator 	: q_operator,
							path 		: JSON.parse(element.dataset.path),
							type 		: "jsonb"
						})
					}

				}
			}//end for (let i = 0; i < len; i++) {

			return query_group
		}//end recursive_groups



		/**
		* GET_SEARCH_GROUP_OPERATOR
		* @return string search_group_operator (Like '$and' | '$or')
		*/
		this.get_search_group_operator = function(search_group) {

			let operator_value = '$and' // Default (first level)

			// Get search_group direct childrens
			const childrens = search_group.children
				//console.log("childrens:",childrens);

			// Iterate to find .search_group_operator div
			const len = childrens.length
			for (let i = 0; i < len; i++) {
				if(childrens[i].classList.contains('search_group_operator')) {
					operator_value = childrens[i].dataset.value;
					break;
				}
			}

			return operator_value
		}//end get_search_group_operator


		/**
		* GET_SEARCH_JSON_OBJECT
		* Resolve and configure the final search json object used for build sql query
		* @return object search_json_object
		*//*
		this.get_search_json_object = function() {

			const self = this

			// Always blur active component to force set dato Important (!)
				document.activeElement.blur()

			// json_filter
				const json_filter = self.parse_dom_to_json_filter({
					mode : "search"
				})

			// global_container
				const search2_global_container 	= document.getElementById("search2_global_container")
				const max_input 				= search2_global_container.querySelector("input.max_input")
				//const select_path 			= decodeURIComponent(search2_global_container.dataset.select_path)
				//const select 					= JSON.parse(select_path)

			// modo default
				const modo = "list"

			// table_rows_list base search options
				// Changed 21-03-2018
				const table_rows_list 			= document.querySelector(".table_rows_list")
				const search_options  			= decodeURIComponent(table_rows_list.dataset.search_options)
				const search_options_object 	= JSON.parse(search_options)
				const base_search_query_object 	= search_options_object.search_query_object

				const select 					= base_search_query_object.select
				let section_tipo 	  			= base_search_query_object.section_tipo

			// Thesaurus mode
				if (self.modo==="thesaurus") {
					// Selected sections to search. From checkboxes
					const thesaurus_search_selector_ul = document.getElementById("thesaurus_search_selector_ul")
					const ar_checkboxes = thesaurus_search_selector_ul.querySelectorAll("input")
					let ar_sections = []
					const ar_checkboxes_len = ar_checkboxes.length
					for (let i = 0; i < ar_checkboxes_len; i++) {
						if(ar_checkboxes[i].checked === true) {
							ar_sections.push(ar_checkboxes[i].value)
						}
					}
					//console.log("ar_sections:",ar_sections);
					if (ar_sections.length<1) {
						alert("Please select at least one section to search")
						return false
					}
					// Replace search_query_object section with user selected values
					section_tipo = ar_sections
				}

			// Final search_json_object
			const search_json_object = {
					id 			 : base_search_query_object.id, //section_tipo + "_" + modo,
					modo 		 : modo,
					parsed 		 : false,
					section_tipo : section_tipo,
					limit 		 : parseInt(max_input.value) || 10,
					offset 		 : 0,
					type 		 : "search_json_object",
					//context 	 : {context_name:false},
					full_count   : (self.modo==="thesaurus") ? false : true,
					order 	 	 : false,
					filter 		 : json_filter.filter,
					select 		 : select
				}

			return search_json_object
		}//end get_search_json_object
		*/



	// Save editing preset
		/**
		* UPDATE_STATE
		* get the save state of the presets
		* @return bool true
		*/
		this.update_state = function(options) {

			if(SHOW_DEBUG===true) {
				//console.log("[search2.update_state] options:",options);
			}

			const self = this

			self.search_layout_state = options.state
				//console.log("self.search_layout_state:",self.search_layout_state);

			// Store current editing section_id in search_container_selection_presets dataset
				const search_container_selection_presets 	= self.search_container_selection_presets
				const button_save_preset 				  	= document.getElementById("button_save_preset")

			if (self.modo==="thesaurus") {
				button_save_preset.classList.add("in_thesaurus")
			}

			// editing_section_id set
				if (options.editing_section_id) {
					// Set dataset section_id
					search_container_selection_presets.dataset.section_id 		= options.editing_section_id
					// Set dataset save_arguments
					search_container_selection_presets.dataset.save_arguments 	= options.editing_save_arguments
				}

			const editing_section_id = search_container_selection_presets.dataset.section_id
			//const editing_section_id = self.loaded_preset ? self.loaded_preset.section_id : null

			if (button_save_preset) {
				if (options.state==="changed" && editing_section_id) {
					// Show save preset button
					button_save_preset.classList.add("show")
				}else{
					// Hide save preset button
					button_save_preset.classList.remove("show")
				}
			}

			if (options.state==="changed") {
				const section_tipo = search_container_selection_presets.dataset.section_tipo
				// Save temp preset
				self.save_temp_preset(section_tipo)
				if(SHOW_DEBUG===true) {
					console.log("[search2.update_state] Saved temp preset of section: ",section_tipo);
				}
			}


			return true
		}//end update_state


		/**
		* SAVE_TEMP_PRESET
		* @return
		*/
		this.save_temp_preset = async function(section_tipo) {

			const self = this

			// Recalculate filter_obj from DOM in default mode (include components with empty values)
			const filter_obj = self.parse_dom_to_json_filter({}).filter

			// save editing preset
				const current_data_manager 	= new data_manager()
				const api_response 			= await current_data_manager.request({
					//url  : self.url_trigger,
					body : {
						action 			: "filter_set_editing_preset",
						section_tipo 	: self.section_tipo,
						filter_obj 		: filter_obj
					}
				})

				//console.log("api_response:",api_response);
			
			return api_response
		}//end save_temp_preset



	// SEARCH
		/**
		* SEARCH
		* @return js_promise promise
		*/
		this.search = async function(button_obj) {

			const self = this

			// always blur active component to force set dato (!)
				document.activeElement.blur()

			// filter_obj. Recalculate filter_obj from DOM in default mode (include components with empty values)
				const filter_obj = self.parse_dom_to_json_filter({
					mode : "search"
				}).filter

			// sqo
				self.sqo.filter = filter_obj
				self.sqo.limit 	= self.limit

			// pagination
				self.instance_caller.pagination.total  = null
				self.instance_caller.pagination.offset = 0

			// section
				self.instance_caller.refresh()

			return true
		}//end search



		/**
		* SHOW_ALL
		* @return
		*/
		this.show_all = async function(button_obj) {

			const self = this			

			// sqo
				self.sqo.filter = null
				self.sqo.limit 	= self.limit

			// pagination
				self.instance_caller.pagination.total  = null
				self.instance_caller.pagination.offset = 0

			// section
				self.instance_caller.refresh()
		

			return true
		}//end show_all



		/**
		* RESET
		* @return bool
		*/
		this.reset = function(button_obj) {

			const self = this

			// self.clean_all_inputs()self.root_search_group
			//const container_selection = self.search_group_container.parentNode.querySelector("search_container_selection")
			

			// Get current search elements and convert to search_query_object
			//const search_query_object = self.parse_dom_to_json_filter({})
	
			// Re-parse to dom with options clean_q = true
			//self.parse_json_query_obj_to_dom(null, search_query_object.filter, {
			//	clean_q 		 : true,
			//	allow_duplicates :true
			//})

			self.parse_json_query_obj_to_dom({
				editing_preset 	 : self.json_filter,
				clean_q 		 : true,
				allow_duplicates : true
			})
			
			// render buttons
			self.render_search_buttons()

			return true
		}//end reset




//////////////////////////////////////////////////


	


	/**
	* TRACK_SHOW_SEARCH_PANEL
	* @return
	*/
	this.track_show_search_panel = function(options) {

		// Read cookie to auto open search_panel
			let cookie_name_search_panel  = "search_panel"
			let cookie_value_search_panel = read_cookie(cookie_name_search_panel) || '{}'
				cookie_value_search_panel = JSON.parse(cookie_value_search_panel)

		if (options.action==="open") {
			// Open
			// Set search panel as opened
			cookie_value_search_panel[options.section_tipo] = true
			create_cookie(cookie_name_search_panel, JSON.stringify(cookie_value_search_panel), 365)

		}else{
			// Close
			// Set search panel as closed
			cookie_value_search_panel[options.section_tipo] = false
			create_cookie(cookie_name_search_panel, JSON.stringify(cookie_value_search_panel), 365)
		}

		return true
	}//end track_show_search_panel



	/**
	* TOGGLE_SEARCH_PANEL
	* @return bool
	*/
	this.toggle_search_panel = function() {

		const self = this

		const global_container = document.getElementById("search2_global_container")

		const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
		const section_tipo = search2_container_selection_presets.dataset.section_tipo

		if (true===global_container.classList.contains("hide")) {

			global_container.classList.remove("hide")

			// Set search panel as opened
			self.track_show_search_panel({action:"open",section_tipo:section_tipo})

			// Thesaurus mode case
			if (self.modo==="thesaurus") {
				const thesaurus_search_selector = document.getElementById("thesaurus_search_selector")
					//thesaurus_search_selector.style.display = "block"
					thesaurus_search_selector.classList.remove("hide")
			}

			self.search_panel_is_open = true

		}else{

			global_container.classList.add("hide")

			// Set search panel as closed
			self.track_show_search_panel({action:"close",section_tipo:section_tipo})

			// Thesaurus mode case
			if (self.modo==="thesaurus") {
				const thesaurus_search_selector = document.getElementById("thesaurus_search_selector")
					//thesaurus_search_selector.style.display = "none"
					thesaurus_search_selector.classList.add("hide")
			}

			self.search_panel_is_open = false
		}

		return false;
	}//end toggle_search_panel



	/**
	* LOAD_SEARCH_PRESET
	* Onclick arrow button in search presets list, load jquery preset from db and apply to current canvas
	* @return true
	*/
	this.load_search_preset_DES = function(button_obj) {

		const self = this

		const li 		  	 = button_obj.parentNode
		const json_object 	 = JSON.parse(li.dataset.json_preset)
		const section_id  	 = li.dataset.section_id
		const save_arguments = JSON.parse(li.dataset.save_arguments)

		self.parse_json_query_obj_to_dom( button_obj, json_object, {allow_duplicates:true} )


		const search2_container_selection_presets 	= document.getElementById("search2_container_selection_presets")
		const section_tipo 							= search2_container_selection_presets.dataset.section_tipo

		// Set cookie
		// Save cookie to track preset selected
		const cookie_name 				= "search_presets"
		let cookie_value 				= read_cookie(cookie_name) || '{}'
			cookie_value 				= JSON.parse(cookie_value)
			cookie_value[section_tipo]  = section_id
			create_cookie(cookie_name, JSON.stringify(cookie_value), 365)

		// Re-Load user presets list
		// self.get_component_presets({target_section_tipo : section_tipo})

		// Reset all selections
		const all_selected = li.parentNode.childNodes
		const len = all_selected.length
			for (let i = len - 1; i >= 0; i--) {
				all_selected[i].classList.remove("selected")
			}
		// Select current
		li.classList.add("selected")

		// Set initial state as unchanged
		self.update_state({
				state 			   		: 'unchanged',
				editing_section_id 		: section_id,
				editing_save_arguments 	: save_arguments
			})


		return true
	}//end load_search_preset



	/**
	* NEW_PRESET
	* Creates a temp presets section to collect fileds data and save a new preset
	* @return promise
	*/
	this.new_preset = function(button_obj) {

		const self = this

		if (typeof button_obj==="undefined") {
			button_obj = document.getElementById("button_new_preset")
		}

		// Load component from trigger
		const section_tipo 	= self.search_presets_section_tipo //"dd623" // Search Presets
		const section_id 	= "tmp"

		const new_preset_div = document.getElementById("new_preset_div")
		if (new_preset_div.innerHTML.length>0) {
			// Clean
			while (new_preset_div.hasChildNodes()) {
				new_preset_div.removeChild(new_preset_div.lastChild);
			}
			button_obj.innerHTML = "+";
			return false
		}

		button_obj.innerHTML = "x";

		// Reset all div_edit
		//let all_div_edit = li.parentNode.querySelectorAll('.div_edit')
		const search2_container_selection_presets 	= document.getElementById("search2_container_selection_presets")
		const all_div_edit 							= search2_container_selection_presets.querySelectorAll('.div_edit')
		const len = all_div_edit.length
		for (let i = len - 1; i >= 0; i--) {
			// Clean
			while (all_div_edit[i].hasChildNodes()) {
				all_div_edit[i].removeChild(all_div_edit[i].lastChild);
			}
		}

		// Load component from trigger
		const trigger_vars = {
				mode 		: "load_components",
				components 	: [
				{
					component_tipo 	: "dd624", // Name
					section_tipo 	: section_tipo,
					section_id 		: section_id,
					modo 			: 'edit',// modo: search | edit
					clean 			: true // clean posible dato in temp sections
				},
				{
					component_tipo 	: "dd640", // Public
					section_tipo 	: section_tipo,
					section_id 		: section_id,
					modo 			: 'edit',// modo: search | edit
					clean 			: true // clean posible dato in temp sections
				},
				{
					component_tipo 	: "dd641", // Default
					section_tipo 	: section_tipo,
					section_id 		: section_id,
					modo 			: 'edit',// modo: search | edit
					clean 			: true // clean posible dato in temp sections
				},
				{
					component_tipo 	: "dd648", // Save arguments
					section_tipo 	: section_tipo,
					section_id 		: section_id,
					modo 			: 'edit',// modo: search | edit
					clean 			: true // clean posible dato in temp sections
				}
				]
		}
		//console.log("trigger_vars:",trigger_vars); return;

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("response:",response);;
			}

			if (response) {
				// Add component html to target div
				new_preset_div.innerHTML = response.result

				// Exec scripts of component
				exec_scripts_inside(new_preset_div)

				const button_label = (get_label["crear"] ? get_label["crear"] : "Create") + " " + (get_label["nuevo"] ? get_label["nuevo"] : "new")

				const button_new = ui.create_dom_element({
					element_type 		: "button",
					parent 		 		: new_preset_div,
					class_name 	 		: "btn btn-success",
					inner_html 			: button_label
				})
				button_new.addEventListener("click",function(e){
					self.save_new_preset(this)
				},false)

			}//end if (response)

		}, function(error) {
			console.log("[search2.new_preset] Error.", error);
			html_page.loading_content( wrap_div, 0 );
		})

		return js_promise
	}//end new_preset



	/**
	* SAVE_NEW_PRESET
	* Save temporal preset section across save_preset
	* @see save_preset
	* @return true
	*/
	this.save_new_preset = function(button_obj) {

		const self = this

		const input_preset_name = button_obj.parentNode.querySelector('input[type="text"]')
		if (input_preset_name.value.length<1) {
			input_preset_name.focus()
			input_preset_name.placeholder = "Empty preset name !"
			return false
		}

		const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
		const section_tipo = search2_container_selection_presets.dataset.section_tipo

		// Fix section tipo from temporal section (dd623_tmp)
		search2_container_selection_presets.dataset.section_id = self.search_presets_section_tipo + "_" +DEDALO_SECTION_ID_TEMP

		// save_preset
		self.save_preset(button_obj, {}).then(function(response){
			console.log("[search2.save_new_preset] response:",response);

			// Close new_preset_div
			self.new_preset()
		})


		return true
	}//end save_new_preset



	/**
	* SAVE_PRESET
	* Save a full section preset
	* Builds a parsed object search from dom and send to trigger to save
	* @return promise
	*/
	this.save_preset = function(button_obj) {

		const self = this

		const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
		const section_tipo 	 = search2_container_selection_presets.dataset.section_tipo
		const section_id 	 = search2_container_selection_presets.dataset.section_id
		const save_arguments = search2_container_selection_presets.dataset.save_arguments

		// parse_dom_to_json_filter (use save_arguments to true to save user search values)
		const json_query_obj = self.parse_dom_to_json_filter({save_arguments:save_arguments})

		const wrap_div = search2_container_selection_presets // document.getElementById("component_presets_list")

		html_page.loading_content( wrap_div, 1 )

		// Save preset
		const trigger_vars = {
			mode   		 		: "save_preset",
			filter 		 		: json_query_obj.filter,
			data_section_tipo 	: section_tipo, // Like oh1 (current working section)
			preset_section_id 	: section_id // preset section_id
		}
		//return console.log("trigger_vars:",trigger_vars);

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("save_preset response:",response);
				}

				if (response && response.result!==false) {

					// Save cookie to track preset selected
					const cookie_name 				= "search_presets"
					let cookie_value 				= read_cookie(cookie_name) || '{}'
						cookie_value 				= JSON.parse(cookie_value)
						cookie_value[section_tipo]  = response.result
						create_cookie(cookie_name, JSON.stringify(cookie_value), 365)

					// Re-Load user presets list
					self.get_component_presets({target_section_tipo : section_tipo})

					// Hide button
					button_obj.classList.remove("show")

				}//end if (response)

				html_page.loading_content( wrap_div, 0 );

			}, function(error) {
				console.log("[search2.save_preset] Error.", error);
				html_page.loading_content( wrap_div, 0 );
			})


		return js_promise
	}//end save_preset



	/**
	* DELETE_PRESET
	* @return
	*/
	this.delete_preset = function(button_obj) {

		const self = this

		// Confirm delete by user
		if (!confirm(get_label.seguro)) {
			return false
		}

		const li		 = button_obj.parentNode
		const section_id = li.dataset.section_id

		const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
		const section_tipo = search2_container_selection_presets.dataset.section_tipo

		const wrap_div = search2_container_selection_presets // document.getElementById("component_presets_list")
		html_page.loading_content( wrap_div, 1 )

		// Save preset
		const trigger_vars = {
			mode   		 : "delete_preset",
			section_id 	 : section_id
		}
		//return console.log("trigger_vars:",trigger_vars);

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("[search2.delete_preset] response:",response);
				}

				if (response && response.result!==false) {

					// Update state
					self.update_state({
						state 				:'unchanged',
						editing_section_id 	: null
					})

					// Save cookie to track preset selected
					const cookie_name 				= "search_presets"
					let cookie_value 				= read_cookie(cookie_name) || '{}'
						cookie_value 				= JSON.parse(cookie_value)
						if (cookie_value[section_tipo]==section_id) {
							delete cookie_value[section_tipo]
							create_cookie(cookie_name, JSON.stringify(cookie_value), 365);
						}

					// Re-Load user presets list
					self.get_component_presets({target_section_tipo : section_tipo})

				}//end if (response)

				html_page.loading_content( wrap_div, 0 );

			}, function(error) {
				console.log("[search2.delete_preset] Error.", error);
				html_page.loading_content( wrap_div, 0 );
			})


		return js_promise
	}//end delete_preset



	/**
	* EDIT_PRESET
	* Load a customized presets section with all required components to edit
	* @return promise
	*/
	this.edit_preset = function(button) {

		const self = this

		const li 		= button.parentNode
		const div_edit 	= li.querySelector('.div_edit')
		let json_preset = {}

		if (div_edit.innerHTML.length>1) {
			// Clean
			while (div_edit.hasChildNodes()) {
				div_edit.removeChild(div_edit.lastChild);
			}
			return false;
		}

		// Reset all div_edit
		//let all_div_edit = li.parentNode.querySelectorAll('.div_edit')
		const search2_container_selection_presets 	= document.getElementById("search2_container_selection_presets")
		const all_div_edit 							= search2_container_selection_presets.querySelectorAll('.div_edit')
		const len = all_div_edit.length
		for (let i = len - 1; i >= 0; i--) {
			// Clean
			while (all_div_edit[i].hasChildNodes()) {
				all_div_edit[i].removeChild(all_div_edit[i].lastChild);
			}
		}

		const section_tipo = self.search_presets_section_tipo //"dd623" // Search Presets

		// Load component from trigger
		const trigger_vars = {
				mode 		: "load_components",
				components 	: [
				{
					component_tipo 	: "dd624", // Name
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					modo 			: 'edit'// modo: search | edit
				},
				{
					component_tipo 	: "dd640", // Public
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					modo 			: 'edit'// modo: search | edit
				},
				{
					component_tipo 	: "dd641", // Default
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					modo 			: 'edit'// modo: search | edit
				},
				{
					component_tipo 	: "dd648", // Save arguments
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					modo 			: 'edit'// modo: search | edit
				}
				]
		}
		//console.log("trigger_vars:",trigger_vars); return;

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response){

			if (response) {

				// Add component html to target div
				div_edit.innerHTML = response.result

				// Exec comonents scripts
				exec_scripts_inside(div_edit)

				// Locate wrap_component_dd648 inside html and add an listerner to radio button save_arguments
				const wrapper_dd648  = div_edit.querySelector("div.wrap_component_dd648")
				const radio_buttons  = wrapper_dd648.querySelectorAll(".css_radio_button")
				for (let i = radio_buttons.length - 1; i >= 0; i--) {
					radio_buttons[i].addEventListener("change",function(e){
						//console.log("radio_button:",this, this.checked, this.value);
						if (this.checked===true) {
							let seleted_value_obj = JSON.parse(this.value)
							let save_arguments 	  = false
							if (seleted_value_obj.section_id==1) {
								save_arguments = true
							}
							// Update state
							self.update_state({
								state 					:'changed',
								editing_section_id 		: li.dataset.section_id,
								editing_save_arguments 	: save_arguments
							})
							// Update li dataset
							li.dataset.save_arguments = save_arguments
						}
					})
				}

			}//end if (response)

		}, function(error) {
			console.log("[search2.edit_preset] Error.", error);
			html_page.loading_content( wrap_div, 0 );
		})

		return js_promise
	}//end edit_preset



	/**
	* CLEAN_ALL_INPUTS
	* @return
	*/
	this.clean_all_inputs = function() {

		const self = this

		const container_selection = document.getElementById("search_container_selection")

		// Get current search elements and convert to search_query_object
		const search_query_object = self.parse_dom_to_json_filter({})

		// Re-parse to dom with options clean_q = true
		self.parse_json_query_obj_to_dom(null, search_query_object.filter, {clean_q:true, allow_duplicates:true})

		return true
	}//end clean_all_inputs



	



	



	



	/**
	* STATIC_SEARCH
	* Search method without dependencies
	* @return js_promise promise
	*/
	this.static_search = function(search_json_object, ar_list_map, search_callback) {

		const self = this

		// promise
			const js_promise = new Promise((resolve, reject) => {

				// search_json_object. Check the search_json_object
					if (typeof search_json_object==="undefined" || !search_json_object) {
						if(SHOW_DEBUG===true) {
							console.error("[search2.static_search] invalid search_json_object. ", JSON.stringify(search_json_object));
						}
						reject(false)
					}

				// search_options
					const search_options = {
						modo 				: 'list',
						context 			: {context_name:'default'},
						search_query_object : search_json_object
					}

				// exec database search an get the result rows
					const url_trigger  = DEDALO_LIB_BASE_URL + '/section_records/trigger.section_records.php'
					const trigger_vars = {
							mode 	 			: 'search_rows',
							search_query_object	: search_json_object,
							result_parse_mode	: 'list', // list | edit
							ar_list_map 		: ar_list_map
						}
					const current_js_promise = common.get_json_data(url_trigger, trigger_vars).then(function(response){
						if(SHOW_DEBUG===true) {
							console.log("++++++ static_search response:",response);
						}

						if (response===null || response.result===false) {
							// Notify to log messages in top of page
							console.error("[search2.static_search] Error. response is invalid.", response);
							reject(false)
						}

						// exec callback with the result of the search to the component /tool that init the filter search.
							if(search_callback){
								//common.execute_function_by_name(search_callback, window, response)
								[search_callback](response)
							}

						resolve(response)
					})
			})


		return js_promise
	}//end static_search






	/**
	* COOKIE_TRACK
	* Check if cookie value for this section is true/false
	* @return bool
	*/
	this.cookie_track = function(cookie_name) {

		const search_container_selection_presets = document.getElementById("search_container_selection_presets")
		if (search_container_selection_presets) {

			const section_tipo = search_container_selection_presets.dataset.section_tipo // page_globals.section_tipo

			// Read cookie to auto open search_panel
			let cookie_value = read_cookie(cookie_name) || '{}'
				cookie_value = JSON.parse(cookie_value)
				//console.log("cookie_value:",cookie_value);
			const cookie_track = cookie_value[section_tipo] || false

			return cookie_track
		}

		return false
	}//end cookie_track





	/**
	* SEARCH_FROM_ENTER_KEY
	* @return
	*/
	this.search_from_enter_key = function(button_submit) {
		if(SHOW_DEBUG===true) {
			//console.log("[saerch2.search_from_enter_key] search_panel_is_open:",button_submit, search2.search_panel_is_open);
		}

		//button_submit.click()

		if (search2.search_panel_is_open===true) {
			button_submit.click()
		}else{
			this.toggle_search_panel()
		}

		return true
	}//end search_from_enter_key



	/**
	* FILTER_IS_EMPTY
	* Check if filter is empty
	* @return bool is_empty
	*/
	this.filter_is_empty = function(filter_obj) {

		const first_property = filter_obj[Object.keys(filter_obj)[0]]
		const is_empty 		 = (first_property.length<1) ? true : false


		return is_empty
	}//end filter_is_empty



	/**
	* SHOW_SECTIONS_CHECKBOXES
	* @return
	*/
	this.show_sections_checkboxes = function(select_value, ar_data_string) {
		//
		//ar_data_string = decodeURIComponent(ar_data_string)

		//	const ar_data = JSON.parse(ar_data_string)

		const ar_data = ar_data_string

		if(SHOW_DEBUG===true) {
			// console.log("[show_sections_checkboxes] ar_data:",ar_data);
		}

		if (ar_data.length===0) {
			console.warn("[search2.show_sections_checkboxes] Empty ar_data:",ar_data)
			return false
		}

		// ul
			const ul = document.getElementById("thesaurus_search_selector_ul")
			if (!ul) {
				console.warn("[search2.show_sections_checkboxes] DOM element not found: #thesaurus_search_selector_ul")
				return false
			}
			// clean ul
				while (ul.hasChildNodes()) {
					ul.removeChild(ul.lastChild);
				}

		const ar_items = ar_data[select_value]
		if(typeof ar_items==="undefined") {
			if(SHOW_DEBUG===true) {
				console.warn("[show_sections_checkboxes] ar_items is undefined for ar_data:",ar_data,select_value);
			}
			return false
		}

		const ar_items_len = ar_items.length
		for (let i = 0; i < ar_items_len; i++) {

			const item = ar_items[i]

			// li
				let li = ui.create_dom_element({
					element_type 	: 'li',
					parent 		 	: ul,
					//class_name 	: "",
					//data_set 		: {id:counter},
					//id 			: options.is_root ? 'root_search_group' : null
				})

			// checkbox
				let input = ui.create_dom_element({
					element_type 	: 'input',
					parent 		 	: li,
					id 				: item.hierarchy_target_section_tipo,
					name 			: item.hierarchy_target_section_tipo,
					value 			: item.hierarchy_target_section_tipo,
				})
				input.type = "checkbox"
				input.checked = true

			// label
				let label = ui.create_dom_element({
					element_type 	: 'label',
					parent 		 	: li,
					inner_html 		: item.hierarchy_target_section_name,
					//class_name 		: "checkbox-inline"
				})
				label.setAttribute("for", item.hierarchy_target_section_tipo)
		}

		// Store selected value as cookie to recover later
		const cookie_name  = "selected_tipology"
		create_cookie(cookie_name, select_value, 365)


		return ul
	}//end show_sections_checkboxes



	/**
	* init_tipology_selector
	* @return
	*/
	this.init_tipology_selector = function(options) {

		const thesaurus_typology_selector = document.getElementById("thesaurus_typology_selector");

		const selected_value = read_cookie("selected_tipology") || thesaurus_typology_selector.value;

		// Force update selector with selected value
			thesaurus_typology_selector.value = selected_value;

		// Build checkboxes
			this.show_sections_checkboxes(selected_value, options.ar_data_string);


		return true;
	}//end init_tipology_selector



	/**
	* GET_SEARCH_OPTIONS
	* @return object search_options_object
	*/
	this.get_search_options = function() {

		const table_rows_list 		= document.querySelector(".table_rows_list")
		const search_options_string	= decodeURIComponent(table_rows_list.dataset.search_options)
		const search_options_object = JSON.parse(search_options_string)

		return search_options_object
	}//end get_search_options



	/**
	* GET_SEARCH_QUERY_OBJECT
	* @return object search_query_object
	*/
	this.get_search_query_object = function() {
		const search_options 		= this.get_search_options()
		const search_query_object 	= search_options.search_query_object

		return search_query_object
	}//end get_search_query_object



	/**
	* UPDATE_SEARCH_OPTIONS
	* @return bool
	*/
	this.update_search_options = function(search_query_object) {

		const search_options = this.get_search_options()

		// Update
			search_options.search_query_object = search_query_object

		// set updated value
			const table_rows_list 		 = document.querySelector(".table_rows_list")
			const search_options_string  = JSON.stringify(search_options)
			const search_options_encoded = decodeURIComponent(search_options_string)
			table_rows_list.dataset.search_options = search_options_encoded

		return true
	}//end update_search_options



	/**
	* LOAD_TEMP_FILTER
	* @return
	*/
	this.load_temp_filter = function(section_tipo) {

		const self = this

		// Trigger vars
			const trigger_url  = self.url_trigger
			const trigger_vars = {
					mode 	 	 : "load_temp_filter",
					section_tipo : section_tipo
				};	//console.log("[search2.load_components_from_section] trigger_vars", trigger_vars); return;

		// Promise JSON XMLHttpRequest
			const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
				if (SHOW_DEBUG===true) {
					if (response) {
						console.log("[search2.load_temp_filter] response:",response);
					}
				}

				if (!response) {
					// Notify to log messages in top of page
					console.error("[search2.load_temp_filter] Error. response is null", response)
					return false
				}else{
					const filter_temp = JSON.parse(response.result)
					return filter_temp
				}//end if (!response)

			}, function(error) {
				console.log("[search2.load_temp_filter] Error.", error);
			})


		return js_promise
	}//end load_temp_filter



}//end search
