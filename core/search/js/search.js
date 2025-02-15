// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'
	import {get_instance} from '../../common/js/instances.js'
	import {
		render_search
	} from './render_search.js'
	import {
		on_dragstart,
		on_dragover,
		on_dragleave,
		on_drop
	} from './search_drag.js'
	import {
		get_editing_preset_json_filter,
		load_search_preset,
		save_temp_preset
	} from './search_user_presets.js'



/**
* SEARCH
*/
export const search = function() {

	this.id_variant	= null
	this.model		= 'search'

	return true
}//end search



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
	search.prototype.get_section_elements_context	= common.prototype.get_section_elements_context
	search.prototype.calculate_component_path		= common.prototype.calculate_component_path



/**
* INIT
* @param object options
* @return bool
*/
search.prototype.init = async function(options) {

	const self = this

	// safe init double control. To detect duplicated events cases
		if (typeof this.is_init!=='undefined') {
			console.error('Duplicated init for element:', this);
			if(SHOW_DEBUG===true) {
				alert('Duplicated init element');
			}
			return false
		}
		this.is_init = true

	// status update
		self.status = 'initializing'

	// options
		self.caller		= options.caller
		self.context	= options.caller.context
		self.mode		= options.mode
		self.lang		= options.lang || page_globals.dedalo_data_lang

	// short vars
		self.type					= 'filter'
		self.section_tipo			= self.caller.section_tipo
		self.events_tokens			= []
		self.ar_instances			= []
		self.parent_node			= null
		self.components_list		= {}
		self.source					= self.caller.rqo.source
		self.sqo					= self.caller.rqo.sqo
		self.target_section_tipo	= self.sqo.section_tipo // can be different to section_tipo like area_thesaurus
		self.limit					= self.sqo.limit ?? (self.caller.mode==='edit' ? 1 : 10)
		self.search_layout_state	= null
		self.search_panel_is_open	= false


	// sections_selector_data
		self.sections_selector_data = typeof self.caller.get_sections_selector_data!=="undefined"
			? self.caller.get_sections_selector_data()
			: null

	// DOM stored pointers
		self.wrapper							= null
		self.search_global_container			= null
		self.search_container_selector			= null
		self.search_group_container				= null
		self.search_container_selection_presets	= null
		self.wrapper_sections_selector			= null
		self.search_children_recursive_node		= null

		self.node								= null

		self.id									= 'search'
		self.section_id							= 0

		// ar_components_exclude. Custom list of elements to exclude in the left list (section fields)
		self.ar_components_exclude = [
			'component_password',
			'component_image',
			'component_av',
			'component_pdf',
			'component_security_administrator',
			'component_geolocation',
			'component_info',
			'component_state',
			'component_semantic_node',
			'component_inverse',
			'section_tab'
		];

	// events subscription
		// change_search_element. Update value, subscription to the changes: if the DOM input value was changed,
		// observers DOM elements will be changed own value with the observable value
		const change_search_element_handler = async (instance) => {
			// parse filter to DOM
			self.parse_dom_to_json_filter({
				mode : self.mode
			})
			// Set as changed, it will fire the event to save the temp search section (temp preset)
			dd_request_idle_callback(
				() => {
					self.update_state({
						state : 'changed'
					})
				}
			)
			// show save animation. add save_success class to component wrappers (green line animation)
			ui.component.exec_save_successfully_animation(instance)
			// set instance as changed or not based on their value
			const hilite = (
				(instance.data.value && instance.data.value.length>0) ||
				(instance.data.q_operator && instance.data.q_operator.length>0)
			)
			ui.hilite({
				instance	: instance, // instance object
				hilite		: hilite // bool
			})
		}
		self.events_tokens.push(
			event_manager.subscribe('change_search_element', change_search_element_handler)
		)

	// permissions
		self.permissions = 2

	// status update
		self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* Load from API the user editing_preset (current state) and user_presets (stored states)
* @return bool
*/
search.prototype.build = async function() {

	const self = this

	// status update
		self.status = 'building'

	// ar_promises
		const ar_promises = []

	try {

		// editing_preset. Get json_filter from DDBB temp presets section
			ar_promises.push( new Promise(function(resolve){

				get_editing_preset_json_filter(self)
				.then(function(json_filter){

					// debug
						if(SHOW_DEBUG===true) {
							if (!json_filter) {
								console.log(
									'[search.build] No preset was found (search editing_preset). Using default filter:',
									self.section_tipo, json_filter
								);
							}
						}
					// fix value
					self.json_filter = json_filter || {"$and":[]}

					resolve(self.json_filter)
				})
			}))

		// wait until all request are resolved or rejected
		await Promise.allSettled(ar_promises);

	} catch (error) {
		self.error = error
		console.error(error)
	}


	// status update
		self.status = 'built'


	return true
}//end build



/**
* GET_SECTION_ELEMENTS
* @return promise
* 	resolve array section_elements
*/
search.prototype.get_section_elements = async function(options) {

	const self = this

	const default_options = {
		section_tipo			: self.target_section_tipo,
		ar_components_exclude	: self.ar_components_exclude,
		caller_tipo				: self.caller.tipo // used to skip permissions when caller is area_thesaurus
	}

	// section_elements_options
	const section_elements_options = Object.assign({}, default_options, options);

	const section_elements = await self.get_section_elements_context(section_elements_options)


	return section_elements
}//end get_section_elements



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
	// 					const api_response = await data_manager.request({
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
	// }//end load_component_context



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
	// 		model  			: component_context.model,
	// 		name  			: component_context.label.replace(/<[^>]+>/g, '')
	// 	})

	// 	return calculate_component_path
	// }//end calculate_component_path



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
* @param object filter
* @param HTMLElement dom_element
* @param object options = {}
* @return HTMLElement dom_group
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

			let current_value	= filter.q
			let q_operator		= filter.q_operator

			// Resolved check (useful for sequences or split strings)
				const section_id = self.get_section_id()

				if (self.ar_resolved_elements.indexOf(section_id)===-1) {

					if (clean_q===true) {
						current_value	= ''
						q_operator		= ''
					}

					// Add. If not already resolved, add
						self.build_search_component({
							parent_div		: dom_element,
							path_plain		: JSON.stringify(filter.path),
							current_value	: current_value,
							q_operator		: q_operator,
							section_id		: section_id
						})

					// Set as resolved
						if (allow_duplicates!==true) {
							self.ar_resolved_elements.push(section_id)
						}
				}

		// If key contains $ is a group
		}else if (key.indexOf('$')!==-1) {

			// Case is group
				const ar_data = filter[key]

			// Build DOM search_group
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
}//end build_dom_group



/**
* GET_COMPONENT_INSTANCE
* Called by render.build_search_component to create the component instance
* @param object options
* @return object component_instance
*/
search.prototype.get_component_instance = async function(options) {

	const self = this

	// options
		const section_id				= options.section_id
		const section_tipo				= options.section_tipo
		const component_tipo			= options.component_tipo
		const model						= options.model
		const value						= options.value || []
		const q_operator				= options.q_operator
		const path						= options.path
		const ar_target_section_tipo	= options.ar_target_section_tipo

	// instance
		// instance key. Custom to get unique key
			const lang		= page_globals.dedalo_data_lang
			const serial	= performance.now()
			const key		= section_tipo +'_'+ section_id +'_'+ component_tipo +'_search_'+ lang +'_'+ serial
		// context
			// const context = {
			// 	model			: model,
			// 	type			: 'component',
			// 	tipo			: component_tipo,
			// 	section_tipo	: section_tipo,
			// 	section_id		: section_id,
			// 	mode			: 'search',
			// 	permissions		: 2
			// }
		// instance
			const component_options = {
				key				: key,
				model			: model,
				tipo			: component_tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: 'search',
				lang			: lang
			}
			const component_instance = await get_instance(component_options)

	// data. Inject value from search user preset before build is needed for portal 'resolve_data' API call
		component_instance.data = {
			value : value
		}

	// Include ar_target_section_tipo to the source to get the specific sections define by the selection of the user
	// used by component_relation_model to define his own sections.
		component_instance.source_add = {
			ar_target_section_tipo : ar_target_section_tipo
		}

	// build component to force load datalist, portal resolve_data etc.
		const build_result = await component_instance.build(true)
		if(build_result===false){
			console.error("Ignored component instance, build result is: ",build_result);
			return null
		}
	// data. Inject value again from search user preset is needed for regular components
		component_instance.data.value = value

	// inject permissions. Search is always enable for all users
		component_instance.context.permissions = 2

	// add search options to the instance
		component_instance.data.q_operator	= q_operator
		component_instance.path				= path

	// add instance
		self.ar_instances.push(component_instance)


	return component_instance
}//end get_component_instance



// GET the SQO from DOM components



/**
* PARSE_DOM_TO_JSON_FILTER
* @param object options
* {
*	mode: string like "search",
* 	save_arguments: undefined|boolean
* }
* @return object json_query_obj
*/
search.prototype.parse_dom_to_json_filter = function(options) {

	const self = this

	// Mode. Used to indicate that q values for search must be converted to usable search values by the components (search)
	const mode				= options.mode || 'default'
	const save_arguments	= options.save_arguments

	// json_query_obj
		const json_query_obj = {
			id		: 'temp',
			filter	: {}
		}

	// First level
		const root_search_group = self.root_search_group

	// Add arguments. Used to exclude search arguments on save preset in this mode
		const add_arguments = typeof save_arguments!=='undefined' && (save_arguments==='true' || save_arguments==='false')
			? JSON.parse(save_arguments)
			: true

	// Calculate recursively all groups inside
		const filter_obj = self.recursive_groups(root_search_group, add_arguments, mode)
		if(SHOW_DEBUG===true) {
			console.warn("[parse_dom_to_json_filter] filter_obj: ", filter_obj);
		}

	// children_recursive checkbox
		if (self.search_children_recursive_node) {
			const children_recursive_node = self.search_children_recursive_node
			// modify filter_obj
			if (children_recursive_node.checked===true) {
				json_query_obj.children_recursive = true
			}else{
				json_query_obj.children_recursive = false
			}
		}

	// Add object with groups to filter array
		json_query_obj.filter = filter_obj


	return json_query_obj
}//end parse_dom_to_json_filter



/**
* RECURSIVE_GROUPS
* @param HTMLElement group_dom_obj
* @param bool add_arguments
* @param string mode
* @return object query_group
*/
search.prototype.recursive_groups = function(group_dom_obj, add_arguments, mode) {

	const self = this

	const operator = self.get_search_group_operator(group_dom_obj)

	const query_group = {}
		  query_group[operator] = []

	// elements inside
	// let ar_elements = group_dom_obj.querySelectorAll(":scope > .search_component,:scope > .search_group") //
	const ar_elements = group_dom_obj?.children || []

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
			let q			= null // default
			let q_operator	= null // default
			let q_split		= false // default is false
			// add_arguments . if true, calculate and save inputs value to preset (temp preset)
			if (add_arguments!==false) {

				const component_wrapper		= element.querySelector('.wrapper_component')
				const component_instance	= self.ar_instances.find(instance => instance && instance.id===component_wrapper.id)

				if(!component_instance){
					console.log('Error. Ignored not found component instance id:', component_wrapper.id);
					continue
				}

				// get the search value
				// if the component has a specific function get the value from his function (ex: portal remove some properties from his locator before search)
				// else get the value as search value.
				const search_value = typeof component_instance.get_search_value === 'function'
					? component_instance.get_search_value()
					: component_instance.data.value

				// overwrite
					q			= search_value
					q_operator	= component_instance.data.q_operator

				// q_split
					q_split = component_instance.q_split ?? false
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
						q_split		: q_split,
						type		: "jsonb"
					})
				}
			}else{
				// Add always
				query_group[operator].push({
					q			: q,
					q_operator	: q_operator,
					path		: JSON.parse(element.dataset.path),
					q_split		: q_split,
					type		: "jsonb"
				})
			}

		}
	}//end for (let i = 0; i < len; i++)


	return query_group
}//end recursive_groups



/**
* GET_SEARCH_GROUP_OPERATOR
* Resolves current group operator from DOM
* @param HTMLElement search_group
* 	<div class="search_group column_2" data-id="1"><div class="operator search_group_operator and" data-value="$and">and [1]</div>..</div>
* @return string operator_value
* 	Like '$and' | '$or'
*/
search.prototype.get_search_group_operator = function(search_group) {

	const default_operator = '$and'

	if (!search_group) {
		return default_operator // Default (first level)
	}

	// Get search_group direct children
	const children = search_group.children || []

	// Iterate to find .search_group_operator div
	const len = children.length
	for (let i = 0; i < len; i++) {
		if(children[i].classList.contains('search_group_operator')) {
			// operator found
			return children[i].dataset.value;
		}
	}

	return default_operator // Default (first level)
}//end get_search_group_operator



/**
* GET_SEARCH_JSON_OBJECT
* Resolve and configure the final search JSON object used for build SQL query
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

	// 	// mode default
	// 		const mode = "list"

	// 	// table_rows_list base search options
	// 		// Changed 21-03-2018
	// 		const table_rows_list 			= document.querySelector(".table_rows_list")
	// 		const search_options  			= decodeURIComponent(table_rows_list.dataset.search_options)
	// 		const search_options_object 	= JSON.parse(search_options)
	// 		const base_search_query_object 	= search_options_object.search_query_object

	// 		const select 					= base_search_query_object.select
	// 		let section_tipo 	  			= base_search_query_object.section_tipo

	// 	// Thesaurus mode
	// 		if (self.mode==="thesaurus") {
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
	// 			id 			 : base_search_query_object.id, //section_tipo + "_" + mode,
	// 			mode 		 : mode,
	// 			parsed 		 : false,
	// 			section_tipo : section_tipo,
	// 			limit 		 : parseInt(max_input.value) || 10,
	// 			offset 		 : 0,
	// 			type 		 : "search_json_object",
	// 			//context 	 : {context_name:false},
	// 			full_count   : (self.mode==="thesaurus") ? false : true,
	// 			order 	 	 : false,
	// 			filter 		 : json_filter.filter,
	// 			select 		 : select
	// 		}

	// 	return search_json_object
	// }//end get_search_json_object



/**
* UPDATE_STATE
* Save editing preset
* get the save state of the presets
* @param object options
* {
*	"state": "changed"
* }
* @return bool
*/
search.prototype.update_state = async function(options) {

	const self = this

	// options
		const state						= options.state // string
		const editing_section_id		= options.editing_section_id || null // string|null
		const editing_save_arguments	= options.editing_save_arguments || null // string|null

	// fix vars
		self.search_layout_state = state

	// search_container_selection_presets. Store current editing section_id in search_container_selection_presets dataset
		const search_container_selection_presets = self.search_container_selection_presets

	// editing_section_id case
		if (editing_section_id) {
			// Set dataset section_id
			search_container_selection_presets.dataset.section_id = editing_section_id
			// Set dataset save_arguments
			search_container_selection_presets.dataset.save_arguments = editing_save_arguments
		}

	// button save preset
		const button_save_preset = self.button_save_preset
		if (button_save_preset) {

			if (state==='changed' && self.user_preset_section_id) {
				// Show save preset button
				button_save_preset.classList.remove('hide')
			}else{
				// Hide save preset button
				if (!button_save_preset.classList.contains('hide')) {
					button_save_preset.classList.add('hide')
				}
			}
		}

	// save temp preset if changed
		if (state==='changed') {
			// Save temp preset
			await save_temp_preset(self)
		}


	return true
}//end update_state



// SEARCH
	/**
	* EXEC_SEARCH
	* @return promise
	*/
	search.prototype.exec_search = async function() {

		const self = this

		// source search_action
			self.source.search_action = 'search'

		// section || area thesaurus
			const caller = self.caller

		// json_query_obj. Recalculate json_query_obj from DOM in default mode (include components with empty values)
			const json_query_obj = self.parse_dom_to_json_filter({
				mode : 'search'
			})

		 // reset order
			json_query_obj.order = [];

		const js_promise = update_caller(
			caller,
			json_query_obj,
			null, // filter_by_locator
			self
		)

		return js_promise
	}//end exec_search



	/**
	* SHOW_ALL
	* Trigger by button 'show_all'
	* @param DOM node button_node
	* @return promise
	*/
	search.prototype.show_all = async function(button_node) {

		const self = this

		button_node.classList.add('loading')

		// source search_action
			self.source.search_action = 'show_all'

		// json_query_obj
			const json_query_obj = {
				filter	: {$and:[]}, // reset filter
				order	: [] // reset order
			}

		// update_caller
			const js_promise = await update_caller(
				self.caller, // section_instance || area_thesaurus_instance,
				json_query_obj, // json_query_obj
				null, // filter_by_locators,
				self
			)

			button_node.classList.remove('loading')


		return js_promise
	}//end show_all



	/**
	* UPDATE_CALLER
	* Modifies the caller SQO and navigate to generate an
	* updated version of caller data and DOM nodes
	* @param object caller_instance
	* 	Could be section or area_thesaurus
	* @param object json_query_obj
	* {
	* 	filter	: {$and:[]},
	* 	order	: []
	* }
	* @param array|null filter_by_locators
	* @param object self
	* @return promise
	*/
	const update_caller = async function(caller_instance, json_query_obj, filter_by_locators, self) {

		// limit
			const limit = self.limit && self.limit>0
				? self.limit
				: 10

		// rqo.sqo update
			caller_instance.total						= null
			caller_instance.rqo.sqo.limit				= limit
			caller_instance.rqo.sqo.offset				= 0
			caller_instance.rqo.sqo.filter				= json_query_obj.filter || null
			caller_instance.rqo.sqo.order				= json_query_obj.order || null
			caller_instance.rqo.sqo.filter_by_locators	= filter_by_locators
			caller_instance.rqo.sqo.children_recursive	= json_query_obj.children_recursive || false
			caller_instance.rqo.sqo.section_tipo		= self.target_section_tipo

		// check valid sections
			if (!self.target_section_tipo || !self.target_section_tipo.length) {
				console.error('Empty target_section_tipo. Unable to update caller:', self.target_section_tipo);
				return
			}

		// request_config_object.sqo update. Copy rqo.sqo pagination values to request_config_object
			caller_instance.request_config_object.sqo.limit		= caller_instance.rqo.sqo.limit
			caller_instance.request_config_object.sqo.offset	= caller_instance.rqo.sqo.offset

		switch (caller_instance.model) {
			case 'area_thesaurus':
			case 'area_ontology': {

				// area. refresh current area using navigation
					const area_ts_promise = caller_instance.navigate({
						callback			: null,
						navigation_history	: false,
						action				: 'search'
					})

				return area_ts_promise
			}

			case 'section': {

				// paginator_node (could exist or not --area_thesaurus case--)
					const paginator_node = caller_instance?.paginator?.node || null
					if (paginator_node) {
						paginator_node.classList.add('loading')
					}

				// pagination. Reset other local DB offset values
				// This is necessary because on changing mode, previous offset
				// will be wrong, then we reset the opposite mode offset value
					const pagination_id = caller_instance.mode==='edit'
						? `${caller_instance.tipo}_list`
						: `${caller_instance.tipo}_edit`
					const saved_pagination = await data_manager.get_local_db_data(
						pagination_id,
						'pagination'
					);
					if (saved_pagination) {
						await data_manager.set_local_db_data(
							{
								id		: pagination_id,
								value	: {
									limit	: saved_pagination.value.limit,
									offset	: 0
								}
							},
							'pagination'
						)
					}

				// section. refresh current section and set history navigation
					const section_promise = caller_instance.navigate({
						callback			: null,
						navigation_history	: true,
						action				: 'search'
					})
					section_promise.then(()=>{
						// loading css remove
						if (paginator_node) {
							paginator_node.classList.remove('loading')
						}
					})

				return section_promise
			}

			default:

				return new Promise(()=>{})
		}
	}//end update_caller



/**
* TRACK_SHOW_PANEL
* Manage cookies of user opened/closed panels
* @param object options
* @return bool true
*/
search.prototype.track_show_panel = async function(options) {

	const self = this

	// options
		const name		= options.name
		const action	= options.action

	const saved_search_state = await data_manager.get_local_db_data(
		self.id,
		'context'
	)
	const value = saved_search_state
		? saved_search_state.value
		: {}

	// update value
		value[name] = {
			is_open : (action==='open')
		}

	// local_db_data save
		const data = {
			id		: self.id,
			value	: value
		}
		data_manager.set_local_db_data(
			data,
			'context'
		)


	return true
}//end track_show_panel



/**
* GET_PANELS_STATUS
* Get local DDBB record if exists and return result object
* @return object|undefined panels_status
*/
search.prototype.get_panels_status = async function() {

	const self = this

	// local_db_data. get value if exists
		const panels_status = await data_manager.get_local_db_data(
			self.id,
			'context'
		)

	return panels_status
}//end get_panels_status



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

	// // local_db_data. get value if exists
	// 	const saved_search_state = await data_manager.get_local_db_data(
	// 		self.id,
	// 		'context'
	// 	)

	// 		const cookie_track = saved_search_state
	// 			? ((saved_search_state.value[name] && saved_search_state.value[name].is_open) || false)
	// 			: false

	// 	console.log("cookie_track is open:",name,cookie_track);
	// 	return cookie_track
	// }//end cookie_track



/**
* SEARCH_FROM_ENTER_KEY
* @return bool
*/
	// search.prototype.search_from_enter_key = function(button_submit) {

	// 	if(SHOW_DEBUG===true) {
	// 		//console.log("[saerch2.search_from_enter_key] search_panel_is_open:",button_submit, search2.search_panel_is_open);
	// 	}

	// 	// button_submit.click()

	// 	if (search.search_panel_is_open===true) {
	// 		button_submit.click()
	// 	}else{
	// 		this.toggle_search_panel()
	// 	}

	// 	return true
	// }//end search_from_enter_key



/**
* IS_FILTER_EMPTY
* Check if filter is empty
* @param object filter_obj
* @return bool is_empty
*/
export const is_filter_empty = function(filter_obj) {

	// Recursive function to get every filter state
	 const check_deep_filter = (filter_obj) => {
	 	// store if q filters are empty (true) or not (false)
	 	const ar_empty = []
	 	// get the operator key ($and, $or)
	 	const ar_operators = Object.keys(filter_obj)
	 	const operators_length = ar_operators.length
	 	for (let i = operators_length - 1; i >= 0; i--) {
	 		// get current filter with the operator
	 		const current_operator 	= ar_operators[i]
	 		const filter			= filter_obj[current_operator]

	 		// check if the filter is empty
	 		const is_empty_current_filter = (filter.length<1) ? true : false
			if(is_empty_current_filter === false){

				// check if the current filter has q
				// of the filter has q, check if is empty
				// else the filter has an operator ($and, $or) and set null q
				const is_empty_q = filter.q
					? filter.q.length<1
					: null

				// if the filter has an operator, recursion to get next level
				if(is_empty_q === null){
					const result = check_deep_filter(filter)

					// store the result of the recursion
					ar_empty.push(...result)

				}else{
					// store the state of the q
					ar_empty.push(is_empty_q)
				}
			}
		}
		// return the states
		return ar_empty
	}

	// check if the filter has any q with data
	const result_check = check_deep_filter(filter_obj)
	// check if any q is not empty (false)
	const find_if_any_has_filter = result_check.find(el => el === false)
	// if any q has a value to search return false in any other case return true
	const empty = find_if_any_has_filter===false ? false : true

	return empty
}//end is_filter_empty



/**
* RESET
* Reset form values
* @return bool
*/
search.prototype.reset = async function () {

	const self = this

	const ar_promises			= []
	const ar_instances_length	= self.ar_instances.length
	for (let i = ar_instances_length - 1; i >= 0; i--) {
		const instance = self.ar_instances[i]
		ar_promises.push(
			new Promise(async function(resolve){
				if (!instance.data) {
					instance.data = {}
				}
				if (instance.data.value) {
					instance.data.value = []
				}
				if (instance.data.q_operator) {
					instance.data.q_operator = null
				}
				// refresh component without load DB data
				await instance.refresh({
					build_autoload : false
				})
				resolve(instance)
			})
		)
	}
	await Promise.all(ar_promises)
	// save_temp_preset. Temp preset section_id and section_tipo are solved and fixed on the first load
	save_temp_preset(self)

	return true
}//end reset



// @license-end
