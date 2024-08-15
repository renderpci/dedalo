// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/



/**
* ON_DRAGSTART
* Get element dataset path as event.dataTransfer from selected component
* @param DOM node
* 	Usually a drag icon node
* @param event
* @param object options
* @return bool true
*/
export const on_dragstart = function(node, event, options) {
	event.stopPropagation();

	// transfer_data. Will be necessary the original locator of the section_record and
	// the paginated_key (the position in the array of data)
		const transfer_data = {
			locator			: options.locator,
			paginated_key	: options.paginated_key
		}
		// console.log('>> on_dragstart transfer_data:', transfer_data);

	// data. The data will be transfer to drop in text format
		const data = JSON.stringify(transfer_data)

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', data);

	// style the drag element to be showed in drag mode
		node.classList.add('dragging')
		// node.firstChild.classList.remove('hide')

	// get the content_data of the component_portal, it has the all section records nodes
		const content_data		= options.caller.node.content_data
		const ar_section_record	= content_data.childNodes

	// it's necessary set every drop node with the view boundaries of the grid
	// drop nodes will resize to cover the section_record
		for (let i = ar_section_record.length - 1; i >= 0; i--) {

			const section_record_node	= ar_section_record[i]
			const current_drop			= section_record_node.querySelector('.drop')

			// first node . Get the boundaries of the last node of the section_record
			// drop nodes will be resize with the height of this last_node
				const first_node		= section_record_node.firstChild // usually column 'id'
				const rect_first_node	= first_node.getBoundingClientRect();

			// last_node. Get the boundaries of the last node of the section_record
			// drop nodes will be resize with the height of this last_node
				const last_node			= section_record_node.lastChild // usually column 'remove'
				const rect_last_node	= last_node.getBoundingClientRect();

			// set height and width, width remove the padding of the grid
				const height = Math.round( rect_last_node.height )
				const width	 = Math.round( (rect_last_node.x + rect_last_node.width) - rect_first_node.x )

				current_drop.style.height	= height + 'px'
				current_drop.style.width	= width + 'px'

			// show the drop in DOM
				current_drop.classList.remove('hide')
		}


	return true
}//end ondrag_start



/**
* ON_DRAGSTART
* Get element dataset path as event.dataTransfer from selected component
* @param DOM node
*	Its a section record (only in mosaic mode)
* @param event
* @param object options
* @return bool true
*/
export const on_dragstart_mosaic = function(node, event, options) {
	// event.preventDefault();
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
	node.classList.add('dragging')

	return true
}//end ondrag_start



/**
* ON_DRAGOVER
* Actives the drop node action when the drag over it
* @param DOM node
* 	This node is the drop node
* @param event
* @return void
*/
export const on_dragover = function(node, event) {
	event.preventDefault();
	event.stopPropagation();

	node.classList.add('dragover')
}//end on_dragover



/**
* ON_DRAGLEAVE
* @param DOM node
* 	This node is the drop node
* @param event
* @return void
*/
export const on_dragleave = function(node, event) {
	event.preventDefault()

	node.classList.remove('dragover')
}//end on_dragleave



/**
* ON_DRAGEND
* Reset drop nodes to the original size and hide them
* @param DOM node
* 	Usually a drag icon node
* @param event
* @param object options
* @return void
*/
export const on_dragend = function(node, event, options) {
	event.preventDefault();
	event.stopPropagation();

	// style the drag element to be showed in drag mode
		node.classList.remove('dragging')

	// get content data, it has the section_records nodes with the drop nodes.
	// const content_data		= node.parentNode.parentNode.parentNode
	const content_data		= options.caller.node.content_data
	const ar_section_record	= content_data.childNodes

	for (let i = ar_section_record.length - 1; i >= 0; i--) {

		const section_record_node	= ar_section_record[i]
		const current_drop			= section_record_node.querySelector('.drop')
		// set the drop nodes to the original size and hide it.
		current_drop.style.height	= 0
		current_drop.style.width	= 0
		current_drop.classList.add('hide')
	}
}//end on_dragend



/**
* ON_DROP
* Get data path from event.dataTransfer and call to build required component html
* @param DOM node
* @param event event
* @param object options
* @return bool true
*/
export const on_drop = function(node, event, options) {
	event.preventDefault() // Necessary. Allows us to drop.
	event.stopPropagation()

	// self is the component_portat that call and it has the sort_order function
	const self	= options.caller
	const data	= event.dataTransfer.getData('text/plain');// element that's move

	node.classList.remove('dragover')

	// the drag element will sent the data of the original position, the source_key
	const data_parse = JSON.parse(data)

	// check if the position is the same that the origin
	if(options.paginated_key === data_parse.paginated_key){
		return false
	}

	// set wrapper as loading
		self.node.classList.add('loading')

	// sort data with the old and new position
	// the locator will be checked in server to be sure that the source position
	// is the same that the data in the server, if not the server will send a error
		const offset = self.paginator.offset || 0
		const sort_data_options = {
			value		: data_parse.locator,
			source_key	: data_parse.locator.paginated_key,
			target_key	: options.paginated_key + offset
		}

	// exec async sort_data (call to API)
		self.sort_data(sort_data_options)
		.then(function(){
			// remove wrapper loading
			self.node.classList.remove('loading')
		})


	return true
}//end on_drop



// @license-end

