import {ui} from '../../common/js/ui.js'


/**
* VIEW_AUTOCOMPLETE
* Render node 
* @return DOM node wrapper
*/
export const view_autocomplete = async function(self, options) {

	const ar_section_record = await self.get_ar_instances()

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})
		wrapper.classList.add('view_autocomplete')

	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {

			//const child_item = await ar_section_record[i].node
			const child_item = await ar_section_record[i].render()
			wrapper.appendChild(child_item)
		}

	// events
		// dblclick
			// wrapper.addEventListener("dblclick", function(e){
			// 	// e.stopPropagation()

			// 	// change mode
			// 	self.change_mode('edit_in_list', true)
			// })


	return wrapper
};//end  list