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
		// will be necessary the original locator of the section_record and the paginated_key (the position in the array of data)
		const transfer_data = {
			locator			: options.locator,
			paginated_key	: options.paginated_key
		}
		// the data will be transfer to drop in text format
		const data = JSON.stringify(transfer_data)

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', data);
		// style the drag element to be showed in drag mode
		drag_node.classList.add('draging')
		drag_node.firstChild.classList.remove('hide')
		// get the content_data of the component_portal, it has the all section records nodes
		const content_data		= drag_node.parentNode.parentNode.parentNode
		const ar_section_record	= content_data.childNodes
		// get the list_body boundaries, it has the grid definition of the rows
		const list_body_rect	= content_data.parentNode.getBoundingClientRect()
		// it's necessary set every drop node with the view boundaries of the grid
		// drop nodes will resize to cover the section_record
		for (let i = ar_section_record.length - 1; i >= 0; i--) {

			const section_record_node	= ar_section_record[i]
			const current_drop			= section_record_node.querySelector('.drop')
			// get the boundaries of the last node of the section_record
			// drop nodes will be resize with the height of this last_node
			const last_node				= section_record_node.lastChild
			const rect_last_node		= last_node.getBoundingClientRect();
			// set height and width, width remove the padding of the grid
			const height = parseFloat(rect_last_node.height) + 'px'
			const width	 = parseFloat(list_body_rect.width - list_body_rect.x - list_body_rect.x ) + 'px'

			current_drop.style.height = height
			current_drop.style.width = width
			// show the drop in dom
			current_drop.classList.remove('hide')
		}

		return true
	}//end ondrag_start


	/**
	* ON_DRAGOVER
	* active the drop node action when the drag over it
	*/
	export const on_dragover = function(drop_node, event) {

		event.preventDefault();
		event.stopPropagation();

		drop_node.classList.add('dragover')

	}//end on_dragover



	/**
	* ON_DRAGLEAVE
	*/
	export const on_dragleave = function(drop_node, event) {

		drop_node.classList.remove('dragover')

	}//end on_dragleave



	/**
	* ON_DRAGEND
	* reset drop nodes to the original size and hide them
	*/
	export const on_dragend = function(drag_node, event) {

		event.preventDefault();
		event.stopPropagation();
		// get content data, it has the section_records nodes with the drop nodes.
		const content_data		= drag_node.parentNode.parentNode.parentNode
		const ar_section_record	= content_data.childNodes

		for (let i = ar_section_record.length - 1; i >= 0; i--) {

			const section_record_node	= ar_section_record[i]
			const current_drop			= section_record_node.querySelector('.drop')
			// set the drop nodes to the original size and hide it.
			current_drop.style.height = 0
			current_drop.style.width = 0
			current_drop.classList.add('hide')
		}

	}//end on_dragend


	/**
	* ON_DROP
	* Get data path from event.dataTransfer and call to build required component html
	* @return bool true
	*/
	export const on_drop = function(options, drop_node, event) {

		event.preventDefault() // Necessary. Allows us to drop.
		event.stopPropagation()
		// self is the component_portat that call and it has the sort_order function
		const self	= options.caller
		const data	= event.dataTransfer.getData('text/plain');// element that's move

		drop_node.classList.remove('dragover')
		drop_node.classList.add('hide')
		// the drag element will sent the data of the original position, the source_key
		const data_parse = JSON.parse(data)
		const path = data_parse.path

		// check if the position is the same that the origin
		if(options.paginated_key === data_parse.paginated_key){
			return false
		}
		// sort data with the old and new position
		// the locator will be checked in server to be sure that the source position
		// is the same that the data in the server, if not the server will send a error
		const sort_data = {
			value		: data_parse.locator,
			source_key	: data_parse.paginated_key,
			target_key	: options.paginated_key
		}

		self.sort_data(sort_data)


		return true
	}//end on_drop
