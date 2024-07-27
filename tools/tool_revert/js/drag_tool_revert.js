// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* ON_DRAGSTART
* Get element dataset path as event.dataTransfer from selected component
* @param object obj
* @param event event
* @return bool true
*/
export const on_dragstart = function(obj, event) {
	event.stopPropagation();

	const data = {
		drag_type	: 'add',
		path		: obj.path, // full path from current section
		ddo			: obj.ddo
	}
	event.dataTransfer.effectAllowed = 'move';
	event.dataTransfer.setData(
		'text/plain',
		JSON.stringify(data)
	);

	return true
}//end ondrag_start



/**
* ON_DRAGOVER
* @param object obj
* @param event event
* @return void
*/
export const on_dragover = function(obj, event) {
	event.preventDefault();
	event.stopPropagation();

	event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

	// Add dragover class
	// obj.classList.add('dragover')

	const element_children_length = obj.children.length
	for (let i = 0; i < element_children_length; i++) {
		const item = obj.children[i]
		if (item.classList.contains('displaced')) {
			item.classList.remove('displaced')
		}
	}

}//end on_dragover



/**
* ON_DRAGLEAVE
* @param object obj
* @param event event
* @return void
*/
export const on_dragleave = function(obj, event) {
	event.preventDefault();
	// remove dragover class
	obj.classList.remove('dragover')
}//end on_dragleave



/**
* ON_DRAGEND
*/
	// export const on_dragend = function(obj, event) {
	// 	event.preventDefault();
	// 	// remove dragover class
	// 	obj.classList.remove('dragover')
	// }//end on_dragend



/**
* ON_DROP
* Get data path from event.dataTransfer and call to build required component html
* @param object container
* @param event event
* @return bool
*/
export const on_drop = function(container, event) {
	event.preventDefault() // Necessary. Allows us to drop.
	event.stopPropagation()

	container.classList.remove('dragover')

	const self = this

	// data transfer
		const data			= event.dataTransfer.getData('text/plain');// element that move
		const parsed_data	= JSON.parse(data)

		if (parsed_data.drag_type!=='add') {

			const dragged = self.dragged

			const user_selection_list = container

			// add DOM node
			user_selection_list.appendChild(dragged)

			dragged.classList.add('active')

			// Update the ddo_export. Move to the new array position
				const from_index	= self.ar_ddo_to_export.findIndex(el => el.id===dragged.ddo.id)
				const to_index		= [...element.parentNode.children].indexOf(dragged) // exclude title node
				// remove
				const item_moving_ddo = self.ar_ddo_to_export.splice(from_index, 1)[0];
				// add
				self.ar_ddo_to_export.splice(to_index, 0, item_moving_ddo);

				// save local db data
				self.update_local_db_data()
			// console.log('ignored drop of type different to add:', parsed_data.drag_type);
			return true
		}

	// short vars
		const path	= parsed_data.path
		const ddo	= parsed_data.ddo

	// rebuild ddo
		const new_ddo = {
			id				: ddo.section_tipo +'_'+ ddo.tipo +'_list_'+ ddo.lang,
			tipo			: ddo.tipo,
			section_tipo	: ddo.section_tipo,
			model			: ddo.model,
			parent			: ddo.parent,
			lang			: ddo.lang,
			mode			: ddo.mode,
			label			: ddo.label,
			path			: path // full path from current section replaces ddo single path
		}

	// exists
		const found = self.ar_ddo_to_export.find(el => el.id===new_ddo.id)
		if (found) {
			console.log('Ignored already included item ddo:', found);
			return
		}

	// Build component html
		self.build_export_component(new_ddo)
		.then((export_component_node)=>{

			const user_selection_list = container

			// add DOM node
			user_selection_list.appendChild(export_component_node)

			// reset
			const element_children_length = user_selection_list.children.length
			for (let i = 0; i < element_children_length; i++) {
				const item = user_selection_list.children[i]
				if (item.classList.contains('displaced')) {
					item.classList.remove('displaced')
				}
			}

			// Update the ddo_export list
			self.ar_ddo_to_export.push(new_ddo)

			// save local db data
			self.update_local_db_data()
		})


	return true
}//end on_drop



// @license-end
