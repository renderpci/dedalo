/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {ui} from '../../common/js/ui.js'



/**
* RENDER_VIEW_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_view_text = function() {

	return true
}//end render_view_text



/**
* RENDER
* Render node as text view
* @return DOM node wrapper
*/
render_view_text.render = async function(self, options) {
	console.log("self----------------:",self);
	// options
		const render_level = options.render_level || 'full'

	// ar_section_record
		const ar_section_record = await self.get_ar_instances({
			mode			: 'list',
			view			: self.context.view
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

			// fields_separator
			if(i < ar_section_record_length-1) {
				const node_fields_separator = document.createTextNode(self.context.fields_separator)
				fragment.appendChild(node_fields_separator)
			}
		}

	return fragment
}//end render
