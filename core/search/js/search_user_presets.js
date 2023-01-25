/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/


// import
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'

	/**
	* LOAD_USER_SEARCH_PRESET
	* Onclick on search presets list, load all user presets from db to get the list names
	* @return true
	*/
	export const load_user_search_preset = async function(self) {

		// SQO
			const locator_user = {
				section_id		: page_globals.user_id,
				section_tipo	: 'dd128'
			}
			const locator_public_true = {
				section_id			: '1',
				section_tipo		: 'dd64',
				from_component_tipo	: 'dd640'
			}
			const fiter = {
				"$or": [
					{
						q		: [ locator_public_true ],
						path	: [{
							section_tipo	: 'dd623',
							component_tipo	: 'dd640',
							model			: 'component_radio_button',
							name			: 'Public'
						}],
						type: 'jsonb'
					},
					{
						"$and": [
							{
								q		: [ self.section_tipo ],
								path	: [{
									section_tipo	: 'dd623',
									component_tipo	: 'dd642',
									model			: 'component_input_text',
									name			: 'Section tipo'
								}],
								type: 'jsonb'
							},
							{
								q		: [ locator_user ],
								path	: [{
									section_tipo	: 'dd623',
									component_tipo	: 'dd654',
									model			: 'component_select',
									name			: 'User'
								}],
								type: 'jsonb'
							}
						]
					}
				]
			};
		const sqo = {
			limit			: 10,
			section_tipo	: [{
				tipo : 'dd623'
			}],
			filter			: fiter
		}

		const request_config = [{
			sqo		: sqo,
			show	: {
				ddo_map :[{
					section_tipo	: 'dd623',
					tipo			: 'dd624',
					parent			: 'dd623'
				}]
			},
			api_engine	: 'dedalo',
			type		: 'main'
		}]


		const instance_options = {
			model			: 'section',
			tipo			: 'dd623',
			section_tipo	: 'dd623',
			section_id		: null,
			mode			: 'list',
			lang			: page_globals.dedalo_data_lang,
			request_config	: request_config,
			add_show 		: true,
			id_variant		: self.section_tipo + '_search_user_presets'
		}


		const section = await instances.get_instance(instance_options)
		await section.build(true)

		// section. render another node of component caller and append to container
		section.render_views.push(
			{
				view	: 'search_user_presets',
				mode	: 'list',
				render	: 'view_search_user_presets',
				path 	: '../../search/js/view_search_user_presets.js'
			}
		)
		section.context.view	= 'search_user_presets'
		section.filter			= false

		self.user_presets_section = section

		return true
	}//end load_user_search_preset





















	/**
	* LOAD_SEARCH_PRESET
	* Onclick arrow button in search presets list, load preset from db and apply to current canvas
	* @return true
	*/
	export const load_search_preset = async function(button_obj) {

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

		// WORK IN PROGRESS
			// const current_cookie_track = await data_manager.set_local_db_data(
			// 	{
			// 		id		: 'search_presets',
			// 		value	: {}
			// 	},
			// 	'status' // string table
			// )
			// console.log('++++++++++++++++++++++ current_cookie_track:', current_cookie_track);


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
	* EDIT_PRESET
	* Load a customized presets section with all required components to edit
	* @return promise
	*/
	export const edit_preset = function(button) {

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
					mode 			: 'edit'// mode: search | edit
				},
				{
					component_tipo 	: "dd640", // Public
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					mode 			: 'edit'// mode: search | edit
				},
				{
					component_tipo 	: "dd641", // Default
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					mode 			: 'edit'// mode: search | edit
				},
				{
					component_tipo 	: "dd648", // Save arguments
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					mode 			: 'edit'// mode: search | edit
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
			// html_page.loading_content( wrap_div, 0 );
		})

		return js_promise
	}//end edit_preset
