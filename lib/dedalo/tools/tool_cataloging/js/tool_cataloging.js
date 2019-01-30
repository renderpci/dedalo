
/**
* TOOL_CATALOGING CLASS
*
*
*
*/
var tool_cataloging = new function() {

	'use strict';


	// LOCAL VARS
	this.trigger_tool_description_url = DEDALO_LIB_BASE_URL + '/tools/tool_description/trigger.tool_description.php'
	this.main_object


	/**
	* INIT
	* @return 
	*/
	this.inited = false
	this.init = function(data) {

		const self = this;

		if (self.inited!==true) {

			// READY (EVENT)
			//$(function() {
			window.ready(function(){
			
			});//end ready


			// LOAD (EVENT)			
			window.addEventListener("load", function (event) {				
			
			}, false)//end load

			
			// BEFOREUNLOAD (EVENT)
			window.addEventListener("beforeunload", function (event) {				
				event.preventDefault();

			}, false)//end beforeunload


			// UNLOAD (EVENT)			
			window.addEventListener("unload", function (event) {
				event.preventDefault();
				
			}, false)//end unload


			// RESIZE (EVENT)		
			window.addEventListener("resize", function (event) {
			
			}, false)//end resize
			

		}//end if (this.inited!==true)		

		self.inited = true

		//create the main sections object
		self.main_object = JSON.parse(decodeURIComponent(data));

		// create the global html with header, grid (left, rigth) and load the section and thesaurus when the dom is ready
		self.parse_html().then(function(response){

			//get the section_tipo for load the section
			const section_tipo = document.getElementById('sections_select').value
						
			//load the current section
			self.load_section(section_tipo)

		})
		
		return true
	}//end init


	/**
	* PARSE_HTML
	* process the JSON recived 
	*/
	this.parse_html = function(){

		const self = this
	
		const main_object = self.main_object;

		const js_promise = new Promise(function(resolve, reject) {

			const content_html = document.getElementsByClassName('content_html')[0]

			//create the header of the tool
			const header = common.create_dom_element({
							element_type		: 'div',
							parent				: content_html,
							class_name			: 'header_tool',
							})

			//create the main grid
			const grid 	= common.create_dom_element({
							element_type		: 'div',
							parent				: content_html,
							class_name			: 'tool_grid',
							})

			//create the left side of the grid
			const grid_left 	= common.create_dom_element({
							element_type		: 'div',
							parent				: grid,
							class_name			: 'tool_grid_left'
							})
			//create the rigth side of the grid
			const grid_rigth 	= common.create_dom_element({
							element_type		: 'div',
							parent				: grid,
							class_name			: 'tool_grid_rigth',
							})

			//create the select of the sections for changeit
			const sections_select = common.create_dom_element({
							id					: 'sections_select',
							element_type		: 'select',
							parent				: grid_left,
							class_name			: 'css_sections_select'
							})

			// SELECT for change the sections 
				// get the sections for select the options of the select
				const ar_select_options = main_object.data.filter(section => section.type==='sections')

				// asign the options to the select
				for (var i = 0; i < ar_select_options.length; i++) {

					const select_option = common.create_dom_element({
								element_type		: 'option',
								parent				: sections_select,
								value				: ar_select_options[i].section_tipo,
								inner_html			: ar_select_options[i].label
								})

				}
				//add the Even onchage to the select, whe it change the section selected will be loaded
				sections_select.addEventListener('change',function(){
					self.load_section(this.value)
				},false)

			//create the section container of the tool
			const section_container = common.create_dom_element({
							id 					: 'section_container',
							element_type		: 'div',
							parent				: grid_left,
							class_name			: 'css_section_container',
							})

			resolve(true)
		})

		return js_promise

	}//end parse_html


    this.load_section = function(section_tipo){

    	const self = this;
    	const main_object = self.main_object;

    	const section_container = document.getElementById('section_container')

    	while (section_container.firstChild) {
			section_container.removeChild(section_container.firstChild);
		}

		//const section_first_child = section_container.firstChild;

    	const section_options = main_object.data.filter(section => section.section_tipo===section_tipo)[0]
    	section_container.innerHTML = section_options.filter_html;

    	//section_container.insertBefore(section_options.filter_html, section_first_child);

		//create the section container of the tool
		const filter_html = common.create_dom_element({
						element_type		: 'div',
						parent				: section_container,
						class_name			: 'table_rows_list',
						dataset				: {search_options:section_options.search_options}
						})

		setTimeout(function(){
			const submit_button = document.getElementById('button_submit')
				submit_button.removeEventListener('click',search)
				submit_button.addEventListener('click',function(){
							self.button(this)
						},false)

	},2000)
		

    }

    this.button = function(event){

    	console.log(event)
    }



};//end tool_cataloging