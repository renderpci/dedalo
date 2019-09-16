


	/**
	* LOAD_SEARCH_PRESET
	* Onclick arrow button in search presets list, load jquery preset from db and apply to current canvas
	* @return true
	*/
	export const load_search_preset = function(button_obj) {

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
	export const new_preset = function(button_obj) {

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
	export const save_new_preset = function(button_obj) {

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
	export const save_preset = function(button_obj) {

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
	export const delete_preset = function(button_obj) {

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


