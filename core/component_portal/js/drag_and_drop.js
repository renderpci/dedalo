/*global get_label, page_globals, SHOW_DEBUG, ddEditor */
/*eslint no-undef: "error"*/

	import {ui} from '../../common/js/ui.js'

	/**
	* ON_DRAGSTART
	* Get element dataset path as event.dataTransfer from selected component
	* @return bool true
	*/
	export const on_dragstart = function(options, drag_node, event) {

		event.stopPropagation();
		const transfer_data = {
			locator			: options.locator,
			paginated_key	: options.paginated_key
		}
		const data = JSON.stringify(transfer_data)

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', data);

		drag_node.classList.add('draging')
		drag_node.firstChild.classList.remove('hide')

		const content_data		= drag_node.parentNode.parentNode.parentNode
		const ar_section_record	= content_data.childNodes

		const list_body_rect		= content_data.parentNode.getBoundingClientRect()

		for (let i = ar_section_record.length - 1; i >= 0; i--) {

			const section_record_node	= ar_section_record[i]
			const current_drop			= section_record_node.querySelector('.drop')

			const last_node				= section_record_node.lastChild
			const rect_last_node		= last_node.getBoundingClientRect();

			const height = parseFloat(rect_last_node.height) + 'px'
			const width	 = parseFloat(list_body_rect.width - list_body_rect.x - list_body_rect.x ) + 'px'

			current_drop.style.height = height
			current_drop.style.width = width
			// current_drop.style.left = '100px'
			current_drop.classList.remove('hide')
		}

		return true
	}//end ondrag_start


	/**
	* ON_DRAGOVER
	*/
	export const on_dragover = function(drop_node, event) {

		event.preventDefault();
		event.stopPropagation();

		drop_node.classList.add('dragover')
		//console.log("dragover");
		//event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

		// Add drag_over class
		//	obj.classList.add('drag_over')
	}//end on_dragover



	/**
	* ON_DRAGLEAVE
	*/
	export const on_dragleave = function(drop_node, event) {
		console.log("on_dragleave:",on_dragleave);

		drop_node.classList.remove('dragover')

	}//end on_dragleave



	/**
	* ON_DRAGEND
	*/
	export const on_dragend = function(drag_node, event) {

		event.preventDefault();
		event.stopPropagation();

		const content_data		= drag_node.parentNode.parentNode.parentNode
		const ar_section_record	= content_data.childNodes

		for (let i = ar_section_record.length - 1; i >= 0; i--) {

			const section_record_node	= ar_section_record[i]
			const current_drop			= section_record_node.querySelector('.drop')

			current_drop.style.height = 0
			current_drop.style.width = 0
			current_drop.classList.add('hide')
		}

		//obj.classList.remove('drag_over')
	}//end on_dragend


	/**
	* ON_DROP
	* Get data path from event.dataTransfer and call to build required component html
	* @return bool true
	*/
	export const on_drop = function(options, drop_node, event) {

		event.preventDefault() // Necessary. Allows us to drop.
		event.stopPropagation()

		const self	= options.caller
		const data	= event.dataTransfer.getData('text/plain');// element that's move

		drop_node.classList.remove('dragover')
		drop_node.classList.add('hide')

		const data_parse = JSON.parse(data)
		const path = data_parse.path


		if(options.paginated_key === data_parse.paginated_key){
			return false
		}

		const sort_data = {
			value		: data_parse.locator,
			source_key	: data_parse.paginated_key,
			target_key	: options.paginated_key
		}

		self.sort_data(sort_data)


		return true
	}//end on_drop
