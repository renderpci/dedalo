/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	// import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_PORTAL
* Manages the component's logic and appearance in client side
*/
export const view_text_list_portal = function() {

	return true
}//end view_text_list_portal



/**
* RENDER
* Render node as text view
* @return DOM node wrapper
*/
view_text_list_portal.render = async function(self, options) {

	// // Value as string
	// 	const data	= self.data || {}
	// 	const value	= data.value || []
	// 	console.log('self:', self);

	// const value_string = value.join(self.context.fields_separator)

	// const text_node = document.createTextNode(value_string)

	// return text_node

	// options
		const render_level = options.render_level || 'full'

	// ar_section_record
		const ar_section_record = await get_section_records({
			caller	: self,
			mode	: 'list',
			view	: self.context.view
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// fragment
		const fragment = new DocumentFragment()

	// add all nodes
		const ar_section_record_length = ar_section_record.length
		for (let i = 0; i < ar_section_record_length; i++) {

			// child.
			const child_item = await ar_section_record[i].render()
			fragment.appendChild(child_item)

			// records_separator
			if(i < ar_section_record_length-1) {
				const node_records_separator = document.createTextNode(self.context.records_separator)
				fragment.appendChild(node_records_separator)
			}
		}

	return fragment
}//end render
