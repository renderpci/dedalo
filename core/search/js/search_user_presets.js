


	/**
	* LOAD_SEARCH_PRESET
	* Onclick arrow button in search presets list, load jquery preset from db and apply to current canvas
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
