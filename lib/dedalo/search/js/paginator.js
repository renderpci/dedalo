/**
* PAGINATOR
*
*
*
*/
var paginator = new function() {

	"use strict";

	/**
	* RENDER
	* @return 
	*/
	this.render = function(options) {

		const offset 		= options.offset || 0;
		const limit 		= options.limit || 10;
		const total 		= options.total;
		const total_pages 	= options.total_pages;
		
		// create the paginator_content
			const paginator_content = common.create_dom_element({
				element_type	: 'div',
				class_name		: 'css_rows_paginator_content text_unselectable',
			})

			// create the paginator_div_links
				const paginator_div_links = common.create_dom_element({
					element_type	: 'div',
					parent			: paginator_content,
					class_name		: 'css_rows_paginator_div_links',
				})
				// create the paginator_first
					const paginator_first = common.create_dom_element({
						element_type	: 'div',
						parent			: paginator_div_links,
						class_name		: 'icon_bs paginator_first_icon link',
					})
				// create the paginator_prev
					const paginator_prev = common.create_dom_element({
						element_type	: 'div',
						parent			: paginator_div_links,
						class_name		: 'icon_bs paginator_prev_icon link',
					})
				// create the paginator_next
					const paginator_next = common.create_dom_element({
						element_type	: 'div',
						parent			: paginator_div_links,
						class_name		: 'icon_bs paginator_next_icon',
					})
				// create the paginator_last
					const paginator_last = common.create_dom_element({
						element_type	: 'div',
						parent			: paginator_div_links,
						class_name		: 'icon_bs paginator_last_icon',
					})

			// create the paginator_info
				const paginator_info = common.create_dom_element({
					element_type	: 'div',
					parent			: paginator_content,
					class_name		: 'css_rows_paginator_info',
				})
				// create the paginator_first
					const paginator_go_to_page = common.create_dom_element({
						id				: 'go_to_page',
						element_type	: 'input',
						parent			: paginator_div_links,
						class_name		: 'icon_bs paginator_first_icon link',
					})
					//add the Even onchage to the select, whe it change the section selected will be loaded
					sections_select.addEventListener('keyup',function(){
						search.go_to_page(this, event, total_pages, limit)
					},false)

	};//end render

}// end paginator
