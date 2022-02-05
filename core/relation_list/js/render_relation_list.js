/*global get_label */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_RELATION_LIST
*/
export const render_relation_list = function() {

	return true
};//end relation_list



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_relation_list.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await get_content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper.
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_' + self.type + ' ' + self.model + ' ' + self.tipo + ' ' + self.mode
		})
		wrapper.appendChild(current_content_data)

	// add the paginator to the warpper
		parse_paginator_html(self, wrapper)

	return wrapper
};//end edit



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// content_data
	const content_data = document.createElement("div")
		  content_data.classList.add("content_data", self.type)

	// Render the data html
		parse_html(self.datum, content_data)

	return content_data
};//end get_content_data



/**
* PARSE_HTML
* process the JSON received
*/
const parse_html = function(datum, content_data_node){

	// get the context and the data information of the JSON recived
		const context		= datum.context;
		const data			= datum.data;
		const context_id	= context.filter(main_header => main_header.component_tipo === 'id');

	// create new styleSheet
		const style = document.createElement("style");
		document.head.appendChild(style);
		const CSS_style_sheet = style.sheet;


	// loop of the different section_tipo inside the context to build the specific list for every section_tipo
	context_id.forEach(function(current_context){

		const current_context_colums	= context.filter(current_context_colums => current_context_colums.section_tipo === current_context.section_tipo);
		const current_data				= data.filter(current_data_header => current_data_header.section_tipo === current_context.section_tipo);
		const count_data				= current_data.filter(current_data_count => current_data_count.component_tipo === 'id');

		// render the list html for current section_tipo
		const node = build_grid_html(current_context, current_context_colums, current_data, count_data, CSS_style_sheet)

		content_data_node.appendChild(node)
	})

	return true
};//end parse_html



/**
* BUILD_GRID_HTML
* build the relation list html with the section selected
*/
const build_grid_html = function(context, columns, data, count_data, CSS_style_sheet){

	const fragment = new DocumentFragment()

	// create the css selector for the variable gid style
	const css_selector = 'relation_grid_'+context.section_tipo
	const columns_length = columns.length -1

	// create the CSS_style_sheet with the variable grid columns, every section can has different number of columns
	CSS_style_sheet.insertRule( '.'+css_selector+'{display: grid;grid-template-columns: 60px repeat('+columns_length+', 1fr);}');

	/* 1 Create the grid container */
		// create a grid content
		const grid  = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_grid',
			parent			: fragment,
		})

	/* 2 Create the header */
		//create a section_header, main info header, section name and counter
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_header',
			text_node		: context.section_label,
			parent			: grid
		})

		//create the counter
		const header_count = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'relation_list_header relation_list_count',
			text_node		: count_data.length,
			parent			: header
		})

		//create the columns labels container
		const data_header = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: css_selector + ' relation_list_data_header',
			parent			: grid
		})

		//create a labels colums info header, the name of the componets of the related sections
		columns.forEach(function(column){

			const class_name = (column.component_label==='id')
				? 'relation_list_data_row_center'
				: ''

			const data_header_label = ui.create_dom_element({
				element_type	: 'li',
				class_name		: class_name,
				text_node		: column.component_label,
				parent			: data_header
			})
		})

	/* 3 Create the rows with the data */
		let curent_section_id	= 0;
		let data_row_header		= ''
		data.forEach(function(current_data){

			//check if the columns id the first column for create the ul node and the first id column
			if(curent_section_id !== current_data.section_id){

				curent_section_id = current_data.section_id;

				//first row, id row, the ul is the container for all row
				// const event_function	= [{'type':'click','name':'relation_list.edit_relation'}];
				data_row_header = ui.create_dom_element({
					element_type				: 'ul',
					class_name					: css_selector + ' relation_list_data_row',
					// custom_function_events	: event_function,
					// data_set					: current_data,
					parent						: grid
				})
				data_row_header.addEventListener('click', ()=>{
					edit_relation(self, current_data)
				})

				//the id information
				const data_row = ui.create_dom_element({
					element_type	: 'li',
					class_name		: 'relation_list_data_row_center',
					text_node		: current_data.section_id,
					parent			: data_row_header,
				})

			}else{
				// the information colums of the components of the section
				const data_row = ui.create_dom_element({
					element_type	: 'li',
					//class_name	: 'relation_list_data_hearder',
					text_node		: current_data.value,
					parent			: data_row_header
				})
			}
		})


	return fragment
};//end build_grid_html



/**
* PARSE_PAGINATOR_HTML
* build the paginator html
*/
const parse_paginator_html = async function(self, wrapper){


	//set the total_records_count into the options object
		const total_records_count = await self.total

	//get the global container
		// const relation_list_wrap = this.relation_list_wrap;

	//get the current limit and offset of the list
		const current_offset	= self.offset;
		const current_limit		= self.limit
		// const current_total	= parseInt(options.total_records_count)

	//calculate the current page (offset + limit)/limit and the last page that paginator can show with the current configuration
		const current_page	= (current_offset + current_limit)/current_limit
		const final_page	= Math.floor(total_records_count/current_limit) + 1

	// create a paginator content
		const paginator  = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'relation_list_paginator',
				text_node		: get_label['total']+ ': ' + total_records_count
			})
	//insert the paginator in the first position in the global container, the paginator need to be the first, at top of the list
		wrapper.insertBefore(paginator, wrapper.firstChild);

	// create a paginator previous button
		const paginator_buttons	= ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'relation_list_paginator_buttons',
			parent			: paginator
		})

	// create a paginator current record
		const currrent_record	= ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'relation_list_paginator_current',
			parent			: paginator_buttons,
			text_node		: get_label['page']+ ': ' +current_page
		})

	//check if current page is the first of the final page to change the css of the buttons (switch on or off)
		const css_previous_offset = (current_offset == 0)
			? 'relation_list_paginator_offset_off'
			: ''
		const css_netx_offset = (current_page >= final_page)
			? 'relation_list_paginator_offset_off'
			: ''

		// const event_previous	= [{'type':'click','name':'relation_list.previous_records'}];
	// create a paginator previous button
		const previous_button	= ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button relation_list_paginator_previous ' + css_previous_offset,
			parent			: paginator_buttons
		})
	// create the event to go to the previous record
		previous_button.addEventListener('click', ()=>{
			previous_records(self)
		})

		// const event_next	= [{'type':'click','name':'relation_list.next_records'}];
	// create a paginator next button
		const next_button	= ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button relation_list_paginator_next ' + css_netx_offset,
			parent			: paginator_buttons
		})
	// create the event to go to the next record
		next_button.addEventListener('click', ()=>{
			next_records(self)
		})
};//end parse_paginator_html



/**
* PREVIOUS_RECORDS
* build the previous button in the paginator
*/
const previous_records = function(self){

	//get the paginator and get the offset, limit and total of records found
	// if the paginator is NOT in the first page the button can navigate to the previous page
	if( self.offset >= 1){
		self.offset = self.offset - self.limit
		event_manager.publish('relation_list_paginator', self)
	}
};//end previous_records



/**
* NEXT_RECORDS
* build the next button in the paginator
*/
const next_records = function(self){

	//get the paginator and get the offset, limit and total of records found
		const current_offset	= self.offset
		const current_limit		= self.limit
		const current_total		= self.total

	// calculate the current and the final page
		const current_page	= (current_offset + current_limit)/current_limit
		const final_page	= Math.floor(current_total/current_limit) + 1

	// if the paginator is NOT in the last page the button can navigate to the next page
		if(current_page < final_page){
			self.offset = current_offset + current_limit
			event_manager.publish('relation_list_paginator', self)
		}
};//end next_records



/**
* EDIT_RELATION
* Open the relation section selected by the user in the list
*/
const edit_relation = function(self, current_data){

	//get the locator of the related secion
	const section_id	= current_data.section_id
	const section_tipo	= current_data.section_tipo

	if (typeof section_id=="undefined") {
		return console.error("[relation_list.edit_relation] Error on find section_id", self.section_id);
	}
	if (typeof section_tipo=="undefined") {
		return console.error("[relation_list.edit_relation] Error on find section_tipo", self.section_tipo);
	}
	// create the navigation rqo, it will use to open the relation with the row reference
	const user_navigation_rqo = {
		caller_id	: self.id,
		source		: {
			action			: 'search',
			model			: 'section',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			mode			: 'edit',
			lang			: self.lang
		},
		sqo : {
			section_tipo		: [{tipo : section_tipo}],
			limit				: 1,
			offset				: 0,
			filter_by_locators	: [{
				section_tipo : section_tipo,
				section_id : section_id
			}]
		}
	}
	// launch event 'user_navigation' that page is watching
	event_manager.publish('user_navigation', user_navigation_rqo)

	return true
};//end edit_relation


