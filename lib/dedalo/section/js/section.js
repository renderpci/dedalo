"use strict";
/**
* SECTION
* Manages section js actions and main properties 
*
*
*/
var section = new function() {



	/**
	* INIT
	*/
	this.init = function() {

		// Ready events
		$(function() {
		
			switch(page_globals.modo) {
				
				case 'edit' :
					
					// BODY CLICK RESET ALL SELECTED WRAPS
					// Note: in inspector.js is made 'stopPropagation' to avoid this body propagation 
					//$(document.body).click(function(e) {
					document.addEventListener("click", function(e){					
						//e.stopPropagation();

						// Reset selected components
						component_common.reset_all_selected_wraps(true);

						// Update inspector info on body click
						section.force_inspector_info_update();
					});

					// On load, show section info
					section.force_inspector_info_update();

					// MATCHHEIGHT components
					//$('.wrap_component').matchHeight({});
					break;

				case 'list' :
					
					// MODIFY MENU LINKS HREF. ADD CURRENT CONTEXT_NAME
					section.update_menu_url_var('context_name');
					break;
			}
		});
	};//end init



	// Autoactivate section
	this.init();



	/**
	* FORCE_INSPECTOR_INFO_UPDATE
	* Call to inspector and send self section wrapper
	*/
	this.force_inspector_info_update = function() {

		// User is logged ?
		if (page_globals.user_id=='') {return false};

		// Select container every time
		const wrap_section_obj = document.getElementById('current_record_wrap');
		if(!wrap_section_obj) {
			return false;
		}		

		// inspector
		inspector.update_inspector_info(wrap_section_obj);

		
		return true
	}//end update_inspector_info



	/**
	* UPDATE_MENU_URL_VAR
	* This function propagates a url var to all menu links href
	* @return bool
	*/
	this.update_menu_url_var = function(url_var_name) {
		const menu = document.getElementById('menu')

		return propagate_url_var(url_var_name, menu)
	}//end update_menu_url_var



	/**
	* RENDER_ALL_COMPONENTS_HTML
	* @return 
	*//*
	this.render_all_components_html = function() {
		
		var json_elements_data = window.json_elements_data || null
			console.log(json_elements_data);

		if (json_elements_data===null) {
			console.log("Error on read json_elements_data from page");
			return false
		}

		var len = json_elements_data.length
		for (var i = 0; i < len; i++) {
			this.render_component_html( json_elements_data[i] )
		}
	};//end render_all_components_html
	*/



	/**
	* RENDER_COMPONENT_HTML
	* Call to required component to render her html
	* @return js promise
	*/
	this.render_component_html = function(json_build_options) { 
		//console.log("json_build_options",json_build_options);
		//console.log(window[json_build_options.model_name]);
		if (!window[json_build_options.model_name]) {
			console.error("[section:render_component_html] Error on call element: "+ json_build_options.model_name);
			return false;
		}

		// Component instance
		const component_obj_name = window[json_build_options.model_name]
		const component_instance = Object.create(component_obj_name) //json_build_options[model_name]			
			//console.log(component_instance);

		// Component config
		component_instance.component_tipo 		= json_build_options.component_tipo
		component_instance.section_tipo 		= json_build_options.section_tipo
		component_instance.section_id 			= json_build_options.section_id
		component_instance.lang 				= json_build_options.lang
		component_instance.modo 				= json_build_options.modo
		component_instance.component_name 		= json_build_options.model_name
		component_instance.unic_id 				= json_build_options.unic_id
		component_instance.context 				= json_build_options.context
		component_instance.dato 				= json_build_options.dato
		component_instance.propiedades 			= json_build_options.propiedades
			//console.log("component_instance",component_instance);

		// Render html from component
		const js_promise = component_instance.render_html()


		return js_promise
	};//end render_component_html



	/**
	* PARSE_JSON_ROWS
	* Group records by section_id and iterate it creating dom elements 
	* for rows and columns
	* @return promise js_promise
	*/
	this.parse_json_rows = function(options) {

		const self = this

		const context 		= options.json_rows.context
		const rows_data 	= options.json_rows.data
		const build_header 	= options.build_header || false
		const container 	= options.container || common.create_dom_element({element_type : 'div', class_name : "rows_container"})
		const edit_column 	= undefined
				
		const js_promise = new Promise(function(resolve, reject) {

			// Header
				if (build_header===true) {
					// Get header_columns from context
						const header_columns = context.filter(item => item.type==='component_info')
				
					// Add row header				
						self.build_row_header(header_columns, container, edit_column)
				}
			
			// Rows
				// Get array of existing section_tipo from context 
					const ar_section_info = context.filter(current_item => current_item.type==="section_info")
						//console.log("context:",context, "ar_section_info", ar_section_info);

				// Iterate records of current section to build rows
					ar_section_info.forEach(function(item){

						// Group records by current section tipo
							const section_grouped_records = rows_data.filter(current_item => current_item.section_tipo===item.section_tipo)
								//console.log("++ section_grouped_records:",section_grouped_records);

						// Group records by section_id
							const ar_section_records = common.group_by_key(section_grouped_records, "section_id")
								//console.log("++ ar_section_records:",ar_section_records);

						// Iterate records
							ar_section_records.forEach(function(section_ar_columns){
								// console.log("+++ section_ar_columns:",section_ar_columns);
								// Add row
									self.build_row(section_ar_columns, container, context, rows_data)
							})						
					})				

			resolve(container)
		});

		return js_promise
	};//end parse_json_rows



	/**
	* BUILD_ROW
	* @param array section_ar_columns
	*	Array of object with all section columns data
	* @param DOM node container
	*	DOM node where place the components nodes
	* @param array context
	*	Array of objects witl global context
	* @return 
	*/
	this.build_row = function(section_ar_columns, container, context, data) {
		
		const self = this
		
		// Row container							
			const row_container = common.create_dom_element({
				element_type 	: 'div',
				class_name 	 	: "row_container",
				parent 			: container
			})

		// Iterate columns of current row
			const ar_columns 		= section_ar_columns
			const ar_columns_length = ar_columns.length
			for (let j = 0; j < ar_columns_length; j++) {

				const column = ar_columns[j]

				// Edit column
					// if (j===0 && typeof edit_column!=="undefined") {
					// 	// Add current section_id
					// 		edit_column.section_id = column.section_id	
					// 	// Add edit column once
					// 		self.build_edit_column(edit_column, row_container)
					// }

				// Component context / data
					const component_context = context.filter(item => item.type==="component_info" && item.tipo===column.tipo)[0]
					const component_data 	= column

				// Render value
					const model  = component_context.model
					const f_name = "render_" + model + ".list"

					if( typeof window["render_" + model]!=="object" ) {
						console.error("[section.build_row] Ignored unavailable component script for ",f_name)
						continue;
					}
						console.log("**** component_data:",component_data);
					//const component_node = common.execute_function_by_name(f_name, window, {
					//	context 		: component_context,
					//	data 			: component_data,
					//	global_context	: context,
					//	global_data		: data
					//});
					const component_node = window["render_" + model]["list"]({
						context 		: component_context,
						data 			: component_data,
						global_context	: context,
						global_data		: data,
						is_recursion 	: false
					})
					//console.log("[section.build_row] component_node:",component_node);

				// Component column	wrapper. Create and add component node
					const column_cell = common.create_dom_element({
						element_type 	: 'div',
						class_name 	 	: "column_cell tipo_" + column.tipo,
						parent 			: row_container
					})
					.appendChild(component_node)
			}

		return row_container
	};//end build_row



	/**
	* BUILD_ROW_HEADER
	* @return 
	*/
	this.build_row_header = function(header_columns, container, edit_column) {

		const row_container = common.create_dom_element({
											element_type 	: 'div',
											class_name 	 	: "row_container header",
											parent 			: container
										})

		// Edit column
			if (typeof edit_column!=="undefined") {
				common.create_dom_element({
											element_type 	: 'div',
											class_name 	 	: "column_container",
											parent 			: row_container,
											inner_html 		: get_label["edit"] || "Edit"
										})
			}

		// Components columns
			const header_columns_length = header_columns.length
			for (let c = 0; c < header_columns_length; c++) {
				const column = header_columns[c]
				// Column container
				common.create_dom_element({
											element_type 	: 'div',
											class_name 	 	: "column_container",
											parent 			: row_container,
											inner_html 		: column.label
										})
			}

		return row_container
	};//end build_row_header



	/**
	* BUILD_EDIT_COLUMN
	* @return element edit_column
	*/
	this.build_edit_column = function(edit_colum, container) {

		// section_id
			const section_id = edit_colum.section_id


		// href like 'javascript:button_delete.open_delete_dialog(this)''
			const edit_href 			  = edit_colum.edit_href
		// dataset
			const edit_dataset 			  = edit_colum.edit_dataset || {}
				  edit_dataset.section_id = section_id		

		// href like 'javascript:button_delete.open_delete_dialog(this)''
			const delete_href 	 		  = delete_colum.delete_href
		// dataset
			const delete_dataset 		  = delete_colum.delete_dataset

				
		// <a href="javascript:void(0);" onclick="component_portal.open_record(this,'?t=rsc170&amp;id=650&amp;m=edit&amp;portal_section_tipo=oh1bc_path=&amp;id_path=oh1.,oh1.650, context list_in_portal">
 		// <span class="section_id_number">650</span>
 		// </a>
 		// <a href="javascript:void(0);" class="id_column_buttons button_delete link" onclick="component_portal.open_delete_dialog(this)" data-rel_locator="{}}" data-permission_target_section_delete="3" title="Delete resource"></a>

 		// Edit column wrapper
	 		const edit_column_wrapper = common.create_dom_element({
											element_type 	: 'div',
											class_name 		: "component_wrapper_container",
											parent 			: container
										})

 		// Link edit
	 		const link_edit = common.create_dom_element({
											element_type 	: 'a',
											href 			: 'javascript:void(0)',
											class_name 		: "id_column_buttons button_edit link",
											href 			: edit_href,
											dataset 		: edit_dataset,
											parent 			: edit_column_wrapper
										})
	 		const section_id_number = common.create_dom_element({
											element_type 	: 'span',
											class_name 	 	: "section_id_number",
											inner_html 		: section_id,
											parent 			: link_edit
										})

	 	// Link delete
	 		const link_delete = common.create_dom_element({
											element_type 	: 'a',
											href 			: 'javascript:void(0)',
											class_name 		: "id_column_buttons button_delete link",
											inner_html 		: get_label["borrar"] || "Delete",
											href 			: delete_href,
											dataset 		: delete_dataset,
											parent 			: edit_column_wrapper
										})

	 	return edit_column_wrapper
	};//end build_edit_column

	

}// end section


