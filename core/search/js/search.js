/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'
	import * as instances from '../../common/js/instances.js'
	import {
		render_search,
		toggle_fields,
		toggle_search_panel,
		toggle_presets,
		// render_thesaurus_sections_checkboxes
	} from './render_search.js'
	import {
		on_dragstart,
		on_dragover,
		on_dragleave,
		on_drop
	} from './search_drag.js'
	import {
		load_search_preset,
		new_preset,
		save_new_preset,
		save_preset,
		delete_preset,
		edit_preset
	} from './search_user_presets.js'
	import {
		create_cookie,
		read_cookie,
		erase_cookie
	} from '../../common/js/utils/cookie.js'




/**
* SEARCH
*/
export const search = function() {
	
	this.id_variant	= null
	this.model		= 'search'

	return true
};//end search



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	search.prototype.refresh						= common.prototype.refresh
	search.prototype.destroy						= common.prototype.destroy
	// render	
	search.prototype.render							= common.prototype.render
	search.prototype.list							= render_search.prototype.list
	search.prototype.edit							= render_search.prototype.list
	search.prototype.render_base					= render_search.prototype.render_base
	search.prototype.render_components_list			= render_search.prototype.render_components_list
	search.prototype.render_search_buttons			= render_search.prototype.render_search_buttons
	search.prototype.render_filter					= render_search.prototype.render_filter
	search.prototype.render_search_group			= render_search.prototype.render_search_group
	search.prototype.build_search_component			= render_search.prototype.build_search_component
	// drag
	search.prototype.on_dragstart					= on_dragstart
	search.prototype.on_dragover					= on_dragover
	search.prototype.on_dragleave					= on_dragleave
	search.prototype.on_drop						= on_drop
	// user presets
	search.prototype.load_search_preset				= load_search_preset
	search.prototype.new_preset						= new_preset
	search.prototype.save_new_preset				= save_new_preset
	search.prototype.save_preset					= save_preset
	search.prototype.delete_preset					= delete_preset
	search.prototype.edit_preset					= edit_preset

	search.prototype.get_section_elements_context	= common.prototype.get_section_elements_context
	search.prototype.calculate_component_path		= common.prototype.calculate_component_path



/**
* INIT
* @return bool promise true
*/
search.prototype.init = async function(options) {

	const self = this

	// options
		self.caller					= options.caller
		self.context				= options.caller.context
		self.mode					= options.mode

	// short vars
		self.section_tipo			= self.caller.section_tipo
		self.events_tokens			= []
		self.ar_instances			= []
		self.parent_node			= null
		self.components_list		= {}
		self.source					= self.caller.rqo.source
		self.sqo					= self.caller.rqo.sqo
		self.target_section_tipo	= self.sqo.section_tipo // can be different to section_tipo like area_thesaurus
		self.limit					= self.sqo.limit || (self.caller.mode==='edit' ? 1 : 10)
		self.search_layout_state	= null
		self.search_panel_is_open	= false
		

	// sections_selector_data
		self.sections_selector_data = typeof self.caller.get_sections_selector_data!=="undefined"
			? self.caller.get_sections_selector_data()
			: null

	// dom stored pointers
		self.wrapper							= undefined
		self.search_global_container			= undefined
		self.search_container_selector			= undefined
		self.search_group_container				= undefined
		self.search_container_selection_presets	= undefined
		self.wrapper_sections_selector			= undefined

		self.node = []

		self.id			= 'search'
		self.section_id	= 0


	// events subscription
		// change_search_element. Update value, subscription to the changes: if the DOM input value was changed,
		// observers DOM elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('change_search_element', fn_change_search_element)
		)
		async function fn_change_search_element(instance) {
			await self.parse_dom_to_json_filter({mode:self.mode})
			// Set as changed, it will fire the event to save the temp search section (temp preset)
			self.update_state({state:'changed'})
			// show save animation. add save_success class to component wrappers (green line animation)
			ui.component.exec_save_successfully_animation(instance)
		}

		// toggle_search_panel. Triggered by button 'search' placed into section inspector buttons
		// self.events_tokens.push(
		// 	event_manager.subscribe('toggle_search_panel', fn_toggle_search_panel)
		// )
		// function fn_toggle_search_panel(button_node) {
		// 	toggle_search_panel(self)
		// }

	// status update
		self.status = 'initiated'


	return true
};//end init



/**
* BUILD
* Load from API the user editing_preset (current state) and user_presets (stored states)
* @return promise
*/
search.prototype.build = async function(){

	const self = this

	// status update
		self.status = 'building'

	const current_data_manager = new data_manager()

	const ar_promises = []

	// editing_preset
		ar_promises.push( new Promise(async function(resolve){

			// load editing preset data
				const editing_preset = await current_data_manager.request({
					body : {
						action				: "filter_get_editing_preset",
						target_section_tipo	: self.section_tipo
					}
				})

			// Set json_filter
				if (!editing_preset.result || !editing_preset.result.json_filter) {

					if(SHOW_DEBUG===true) {
						console.log("[search.build] No preset was found (search editing_preset):", self.section_tipo, editing_preset);
					}

					self.json_filter = {"$and":[]}

				}else{

					if (editing_preset.result.json_filter && typeof(editing_preset.result.json_filter)!=='object') {
						console.error("Editing_preset json_filter expected is object but received value is type:", typeof(editing_preset.result.json_filter));
					}

					self.json_filter = editing_preset.result.json_filter
				}
				// console.log("// SEARCH build stored self.json_filter:",self.json_filter);

			resolve(self.json_filter)
		}))

	// DES get the section_tipo from editing_preset
		/*
		const load_all_section_elements_context = async () => {

			const editing_preset_sections 	= self.get_ar_sections_from_editing_preset(self.json_filter)
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

	// user_presets. load user preset data
		ar_promises.push( new Promise(async function(resolve){
			
			const user_presets = await current_data_manager.request({
				body : {
					action				: "filter_get_user_presets",
					target_section_tipo	: self.section_tipo
				}
			})

			resolve(user_presets)
		}))

	// get_section_elements_context
		ar_promises.push( self.get_section_elements_context({
			section_tipo : self.section_tipo
		}) )

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("-> search build editing_preset:", editing_preset);
			// console.log("-> search build user_presets:", user_presets);
		}

	// wait until all request are resolved
		await Promise.allSettled(ar_promises);


	// status update
		self.status = 'builded'

	return true
};//end build



/**
* DES RENDER
* @return promise resolve dom element filter_wrapper
*/
	// search.prototype.render = async function() {

	// 	const self = this

	// 	// render base html bounds
	// 		const filter_wrapper = await self.render_base()

	// 	// render section component list [left]
	// 		await self.render_components_list({
	// 			section_tipo	: self.target_section_tipo,
	// 			target_div		: self.search_container_selector,
	// 			path			: []
	// 		})

	// 	// render components from temp preset [center]
	// 		await self.render_filter({
	// 			editing_preset		: self.json_filter,
	// 			allow_duplicates	: true
	// 		})

	// 	// render buttons
	// 		await self.render_search_buttons()

	// 	// search_panel cookie state track
	// 		if(self.cookie_track("search_panel")===true) {
	// 			// Open search panel
	// 			toggle_search_panel(self) // toggle to open from defult state close
	// 		}
	// 	// fields_panel cookie state track
	// 		if(self.cookie_track("fields_panel")===true) {
	// 			// Open search panel
	// 			toggle_fields(self) // toggle to open from defult state close
	// 		}
	// 	// presets_panel cookie state track
	// 		if(self.cookie_track("presets_panel")===true) {
	// 			// Open search panel
	// 			toggle_presets(self) // toggle to open from defult state close
	// 		}

	// 	// Set initial state as unchanged
	// 	//self.update_state({state:'unchanged'})


	// 	// status update
	// 		self.status = 'rendered'


	// 	return filter_wrapper
	// };//end render



/**
* DES GET_SECTION_ELEMENTS_CONTEXT
* Call to dd_core_api to obtain the list of components associated to current options section_tipo
* @param object options
*	string options.section_tipo
* @return promise
*/
	// search.prototype.get_section_elements_context = async function(options) {

	// 	const self = this

	// 	// section_tipo (string|array)
	// 		const section_tipo 	= options.section_tipo

	// 	// components
	// 		const get_components = async () => {
	// 			if (self.components_list[section_tipo]) {

	// 				return self.components_list[section_tipo]

	// 			}else{

	// 				// load data
	// 					const current_data_manager 	= new data_manager()
	// 					const api_response 			= await current_data_manager.request({
	// 						body : {
	// 							action			: "get_section_elements_context",
	// 							context_type	: 'simple',
	// 							ar_section_tipo	: section_tipo
	// 						}
	// 					})

	// 				// fix
	// 					self.components_list[section_tipo] = api_response.result

	// 				return api_response.result
	// 			}
	// 		}
	// 		const components = get_components()


	// 	return components
	// };//end get_section_elements_context



/**
* DES LOAD_COMPONENT_CONTEXT
* Call to dd_core_api to obtain the list of components associated to current options section_tipo
* @param object options
*	string options.section_tipo
* @return promise
*/
	// search.prototype.load_component_context = async function(options) {

	// 	const self = this

	// 	// vars
	// 		const section_tipo 	= options.section_tipo

	// 	// components
	// 		const get_components = async () => {
	// 			if (self.components_list[section_tipo]) {

	// 				return self.components_list[section_tipo]

	// 			}else{

	// 				// load data
	// 					const current_data_manager 	= new data_manager()
	// 					const api_response 			= await current_data_manager.request({
	// 						body : {
	// 							action			: "get_section_components",
	// 							ar_section_tipo	: [section_tipo]
	// 						}
	// 					})

	// 				// fix
	// 					self.components_list[section_tipo] = api_response.result

	// 				return api_response.result
	// 			}
	// 		}
	// 		const components = get_components()


	// 	return components
	// };//end load_component_context



/**
* DES CALCULATE_COMPONENT_PATH
* Resolve component full search path. Used to build json_search_object and
* create later the filters and selectors for search
* @param object element
*	Contains all component data collected from trigger
* @param array path
*	Contains all paths prom previous click loads
* @return array component_path
*	Array of objects
*/
	// search.prototype.calculate_component_path = function(component_context, path) {

	// 	if (!Array.isArray(path)) {
	// 		console.log("[search2.calculate_component_path] Fixed bad path as array! :",path);
	// 		path = []
	// 	}

	// 	const calculate_component_path = []

	// 	// Add current path data
	// 	const path_len = path.length
	// 	for (let i = 0; i < path_len; i++) {
	// 		calculate_component_path.push(path[i])
	// 	}

	// 	// Add component path data
	// 	calculate_component_path.push({
	// 		section_tipo 	: component_context.section_tipo,
	// 		component_tipo 	: component_context.tipo,
	// 		modelo  		: component_context.model,
	// 		name  			: component_context.label.replace(/<[^>]+>/g, '')
	// 	})

	// 	return calculate_component_path
	// };//end calculate_component_path



/**
* GET_SECTION_ID
* Calculate tmp section id (incremental id)
* @return string temp_section_id
*/
search.prototype.get_section_id = function() {

	const self = this

	// increment self section_id value
	self.section_id = ++self.section_id

	// build temp name
	// const temp_section_id = 'tmp_search_' + self.section_id
	const temp_section_id = 'search_' + self.section_id

	return temp_section_id
}//end get_section_id



/**
* BUILD_DOM_GROUP
* @return DOM node dom_group
*/
search.prototype.ar_resolved_elements = []
search.prototype.build_dom_group = function(filter, dom_element, options={}) {

	const self = this

	// options
		const allow_duplicates	= options.allow_duplicates || false
		const clean_q			= options.clean_q || false
		const is_root			= options.is_root || false

	let dom_group = null

	for (const key in filter) {

		// Case is component, only add when key is path
		if (key==='path') {

			let current_value 	= filter.q
				//console.log("current_value:",current_value, filter);
			let q_operator 		= filter.q_operator
				//console.log("q_operator:",filter);

			// Resolved check (useful for sequences or split strings)
				const resolved_string = JSON.stringify(filter.path) + current_value
				if (self.ar_resolved_elements.indexOf(resolved_string)===-1) {

					if (clean_q===true) {
						current_value	= ''
						q_operator		= ''
					}
					 const section_id = self.get_section_id()
					// Add. If not already resolved, add
						self.build_search_component( dom_element, JSON.stringify(filter.path), current_value, q_operator, section_id)

					// Set as resolved
						if (allow_duplicates!==true) {
							self.ar_resolved_elements.push(resolved_string)
						}
				}

		}else
		// If key contains $ is a group
		if (key.indexOf('$')!==-1) {

			// Case is group
				const ar_data = filter[key]
				//console.log("key,ar_data:",key,ar_data);

			// Build dom search_group
				const current_search_group = self.render_search_group( dom_element, {
					operator	: key,
					is_root		: is_root
				})

			// Recursions
				const ar_data_len = ar_data.length
				for (let i = 0; i < ar_data_len; i++) {
					const current_json_object = ar_data[i]
					options.is_root = false
					self.build_dom_group(current_json_object, current_search_group, options)
				}
		}
	}//end for (const key in filter)


	return dom_group
};//end build_dom_group



/**
* GET_COMPONENT_INSTANCE
* Called by render.build_search_component to create the component instance
* @return promise
*/
search.prototype.get_component_instance = async function(options) {

	const self = this

	// options
		const section_id		= options.section_id
		const section_tipo		= options.section_tipo
		const component_tipo	= options.component_tipo
		const model				= options.model
		const value				= options.value || []
		const q_operator		= options.q_operator
		const path				= options.path

	// instance
		// instance key. Custom to get unique key
			const lang		= page_globals.dedalo_data_lang
			const serial	= performance.now()
			const key		= section_tipo +'_'+ component_tipo +'_search_'+ lang +'_'+ serial
		// context
			const context = {
				model			: model,
				type			: 'component',
				tipo			: component_tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: 'search'
			}
		// instance
			const component_options = {
				key				: key,
				model			: model,
				tipo			: component_tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: 'search',
				lang			: lang,
				context			: context
				// data			: current_data,
				// datum		: current_datum
			}
			const component_instance = await instances.get_instance(component_options)

	// data. Inject value from search user preset before build is needed for portal 'resolve_data' API call
		component_instance.data = {
			value : value
		}

	// build component to force load datalist, portal resolve_data etc.
		await component_instance.build(true)

	// data. Inject value again from search user preset is needed for regular components
		component_instance.data.value = value

	// inject permissions. Search is always enable for all users
		component_instance.permissions = 2

	// add search options to the instance
		component_instance.data.q_operator	= q_operator
		component_instance.path				= path


	// add instance
		self.ar_instances.push(component_instance)

	
	return component_instance
};//end get_component_instance



// GET the SQO from DOM components
/**
* PARSE_DOM_TO_JSON_FILTER
* @return object json_query_obj
*/
search.prototype.parse_dom_to_json_filter = function(options) {

	const self = this

	// Mode. Used to indicate that q values for search must be converted to usable search values by the components (search)
	const mode				= options.mode || 'default'
	const save_arguments	= options.save_arguments

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
};//end parse_dom_to_json_filter



/**
* RECURSIVE_GROUPS
* @return object query_group
*/
search.prototype.recursive_groups = function(group_dom_obj, add_arguments, mode) {

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

				const component_wrapper		= element.querySelector('.wrapper_component')
				const component_instance	= self.ar_instances.find(instance => instance.id===component_wrapper.id)

				// get the search value
				// if the component has a specific function get the value from his function (ex: portal remove some properties from his locator before search)
				// else get the value as search value.
				const search_value = typeof component_instance.get_search_value === 'function'
					? component_instance.get_search_value()
					: component_instance.data.value

				// overwrite
				if (typeof component_instance!=="undefined") {
					q			= search_value
					q_operator	= component_instance.data.q_operator
				}
			}

			// Add component
			if (mode==="search") {
				// Add only if not empty
				if ( (q && q.length>0 && q[0]) || (q_operator && q_operator.length>0) ) { //

					// If empty q but not q_operator, set q as 'only_operator' for avoid send empty q value
					if( (!q || !q[0] || q[0].length===0) && (q_operator && q_operator.length>0) ) {
						q = "only_operator"
					}
					query_group[operator].push({
						q			: q,
						q_operator	: q_operator,
						path		: JSON.parse(element.dataset.path),
						type		: "jsonb"
					})
				}
			}else{
				// Add always
				query_group[operator].push({
					q			: q,
					q_operator	: q_operator,
					path		: JSON.parse(element.dataset.path),
					type		: "jsonb"
				})
			}

		}
	};//end for (let i = 0; i < len; i++) {

	return query_group
};//end recursive_groups



/**
* GET_SEARCH_GROUP_OPERATOR
* @return string search_group_operator (Like '$and' | '$or')
*/
search.prototype.get_search_group_operator = function(search_group) {

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
};//end get_search_group_operator



/**
* GET_SEARCH_JSON_OBJECT
* Resolve and configure the final search json object used for build sql query
* @return object search_json_object
*/
	// this.get_search_json_object = function() {

	// 	const self = this

	// 	// Always blur active component to force set dato Important (!)
	// 		document.activeElement.blur()

	// 	// json_filter
	// 		const json_filter = self.parse_dom_to_json_filter({
	// 			mode : "search"
	// 		})

	// 	// global_container
	// 		const search2_global_container 	= document.getElementById("search2_global_container")
	// 		const max_input 				= search2_global_container.querySelector("input.max_input")
	// 		//const select_path 			= decodeURIComponent(search2_global_container.dataset.select_path)
	// 		//const select 					= JSON.parse(select_path)

	// 	// modo default
	// 		const modo = "list"

	// 	// table_rows_list base search options
	// 		// Changed 21-03-2018
	// 		const table_rows_list 			= document.querySelector(".table_rows_list")
	// 		const search_options  			= decodeURIComponent(table_rows_list.dataset.search_options)
	// 		const search_options_object 	= JSON.parse(search_options)
	// 		const base_search_query_object 	= search_options_object.search_query_object

	// 		const select 					= base_search_query_object.select
	// 		let section_tipo 	  			= base_search_query_object.section_tipo

	// 	// Thesaurus mode
	// 		if (self.modo==="thesaurus") {
	// 			// Selected sections to search. From checkboxes
	// 			const wrapper_sections_selector_ul = document.getElementById("wrapper_sections_selector_ul")
	// 			const ar_checkboxes = wrapper_sections_selector_ul.querySelectorAll("input")
	// 			let ar_sections = []
	// 			const ar_checkboxes_len = ar_checkboxes.length
	// 			for (let i = 0; i < ar_checkboxes_len; i++) {
	// 				if(ar_checkboxes[i].checked === true) {
	// 					ar_sections.push(ar_checkboxes[i].value)
	// 				}
	// 			}
	// 			//console.log("ar_sections:",ar_sections);
	// 			if (ar_sections.length<1) {
	// 				alert("Please select at least one section to search")
	// 				return false
	// 			}
	// 			// Replace search_query_object section with user selected values
	// 			section_tipo = ar_sections
	// 		}

	// 	// Final search_json_object
	// 	const search_json_object = {
	// 			id 			 : base_search_query_object.id, //section_tipo + "_" + modo,
	// 			modo 		 : modo,
	// 			parsed 		 : false,
	// 			section_tipo : section_tipo,
	// 			limit 		 : parseInt(max_input.value) || 10,
	// 			offset 		 : 0,
	// 			type 		 : "search_json_object",
	// 			//context 	 : {context_name:false},
	// 			full_count   : (self.modo==="thesaurus") ? false : true,
	// 			order 	 	 : false,
	// 			filter 		 : json_filter.filter,
	// 			select 		 : select
	// 		}

	// 	return search_json_object
	// };//end get_search_json_object



// Save editing preset
	/**
	* UPDATE_STATE
	* get the save state of the presets
	* @return promise
	*/
	search.prototype.update_state = async function(options) {

		const self = this

		self.search_layout_state = options.state
			//console.log("self.search_layout_state:",self.search_layout_state);

		// Store current editing section_id in search_container_selection_presets dataset
			const search_container_selection_presets 	= self.search_container_selection_presets
			const button_save_preset 				  	= document.getElementById("button_save_preset")

		if (self.mode==="thesaurus") {
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
			await self.save_temp_preset(section_tipo)
		}


		return true
	};//end update_state



	/**
	* SAVE_TEMP_PRESET
	* @return
	*/
	search.prototype.save_temp_preset = async function(section_tipo) {

		const self = this

		// Recalculate filter_obj from DOM in default mode (include components with empty values)
		const filter_obj = await self.parse_dom_to_json_filter({}).filter

		// save editing preset
			const current_data_manager 	= new data_manager()
			const api_response 			= await current_data_manager.request({
				body : {
					action 			: "filter_set_editing_preset",
					section_tipo 	: self.section_tipo,
					filter_obj 		: filter_obj
				}
			})

		return api_response
	};//end save_temp_preset



// SEARCH
	/**
	* EXEC_SEARCH
	* @return promise
	*/
	search.prototype.exec_search = async function() {

		const self = this

		// source search_action
			self.source.search_action = 'search'

		// section
			const section = self.caller

		// filter_obj. Recalculate filter_obj from DOM in default mode (include components with empty values)
			const filter_obj = self.parse_dom_to_json_filter({
				mode : "search"
			}).filter

		const js_promise = update_section(section, filter_obj, self)

		return js_promise
	};//end exec_search



	/**
	* SHOW_ALL
	* @return promise
	*/
	search.prototype.show_all = async function(button_obj) {

		const self = this

		// source search_action
			self.source.search_action = 'show_all'

		// section
			const section = self.caller

		// filter reset
			const filter_obj = null

		// update_section
			const js_promise = update_section(section, filter_obj, self)

		return js_promise
	};//end show_all



	/**
	* UPDATE_SECTION
	* @return promise
	*/
	const update_section = async function(section_instance, filter_obj, self) {

		const section_node = section_instance.node[0]

		// loading css add
			section_node.classList.add('loading')

		// limit
			const limit = self.limit && self.limit>0 ? self.limit : 10

		// pagination
			section_instance.total			= null
			section_instance.rqo.sqo.limit	= limit
			section_instance.rqo.sqo.offset	= 0
			section_instance.rqo.sqo.filter	= filter_obj

		// paginator_node (could exist or not --area_thesaurus case--)
			const paginator_node = section_instance?.paginator?.node?.[0] || null
			if (paginator_node) {
				paginator_node.classList.add('hide')
			}

		// section
			const js_promise = section_instance.refresh()

			js_promise.then(()=>{
				// loading css remove
					section_node.classList.remove('loading')
				// refresh section paginator
					if (paginator_node) {
						section_instance.paginator.refresh()
						.then(function(){
							paginator_node.classList.remove('hide')
						})
					}
			})

		return js_promise
	}//end update_section



	/**
	* RESET
	* Force render filter again without add component values
	* @return bool true
	*/
	search.prototype.reset = function(button_obj) {

		const self = this

		self.render_filter({
			editing_preset		: self.json_filter,
			clean_q				: true,
			allow_duplicates	: true
		})

		// render buttons
		self.render_search_buttons()

		return true
	};//end reset



/**
* TRACK_SHOW_PANEL
* Manage cookies of user opened/closed panels
* @return bool true
*/
search.prototype.track_show_panel = async function(options) {

	const self = this

	// options
		const name		= options.name
		const action	= options.action

	const current_data_manager	= new data_manager();
	const saved_search_state	= await current_data_manager.get_local_db_data(self.id, 'context')
	const value = saved_search_state
		? saved_search_state.value
		: {}

	// update value
		value[name] = {
			is_open : (action==='open')
		}		

	// local_db_data save
		current_data_manager.set_local_db_data({
			id		: self.id,
			value	: value
		}, 'context')

	return true
};//end track_show_panel



/**
* GET_PANELS_STATUS
* Get local DDBB record if exists and return result object
* @return object | undefined
*/
search.prototype.get_panels_status = async function() {

	const self = this

	// local_db_data. get value if exists
		const current_data_manager	= new data_manager();
		const panels_status = await current_data_manager.get_local_db_data(self.id, 'context')
			
	return panels_status
};//end get_panels_status



/**
* COOKIE_TRACK
* Check if cookie value for this section is true/false
* @return bool
*/
	// search.prototype.cookie_track = async function(name) {

	// 	const self = this

	// 	const section_tipo = self.section_tipo // search.prototype.section_tipo

		

	// 	// // Read cookie to auto open search_panel
	// 	// const cookie_obj 	= JSON.parse( read_cookie("search") || '{"'+section_tipo+'":{}}' )
	// 	// const cookie_track 	= (cookie_obj[section_tipo]) ? cookie_obj[section_tipo][name] : false
		
	// 	// local_db_data. get value if exists
	// 		const current_data_manager	= new data_manager();
	// 		const saved_search_state = await current_data_manager.get_local_db_data(self.id, 'context')
			
	// 		const cookie_track = saved_search_state
	// 			? ((saved_search_state.value[name] && saved_search_state.value[name].is_open) || false)
	// 			: false

	// 	console.log("cookie_track is open:",name,cookie_track);
	// 	return cookie_track
	// };//end cookie_track



/**
* SEARCH_FROM_ENTER_KEY
* @return
*/
search.prototype.search_from_enter_key = function(button_submit) {

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
};//end search_from_enter_key



/**
* FILTER_IS_EMPTY
* Check if filter is empty
* @return bool is_empty
*/
search.prototype.filter_is_empty = function(filter_obj) {

	const first_property	= filter_obj[Object.keys(filter_obj)[0]]
	const is_empty			= (first_property.length<1) ? true : false


	return is_empty
};//end filter_is_empty



/**
* INIT_TIPOLOGY_SELECTOR
* @return
*/
	// search.prototype.init_tipology_selector = function(options) {

	// 	const thesaurus_typology_selector = self.wrapper_sections_selector.querySelector(".thesaurus_typology_selector")
	// 	const selected_value 			  = read_cookie("selected_tipology") || thesaurus_typology_selector.value;

	// 	// Force update selector with selected value
	// 		thesaurus_typology_selector.value = selected_value;

	// 	// Build checkboxes
	// 		render_thesaurus_sections_checkboxes(selected_value, options.ar_data_string);


	// 	return true;
	// };//end init_tipology_selector


