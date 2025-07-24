// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_posterframe */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_IMAGE_CROP
* Manages the component's logic and appearance in client side
*/
export const render_tool_image_crop = function() {

	return this
}//end render_tool_image_CROP



/**
* BUILD
* create the crop instance and DOM nodes
* @param object options
* {
* 	container 			: HTMLElement image container node, the work area
* 	image 				: HTMLElement image node
* 	status_container 	: HTMLElement text node, prompt to user
* }
*/
render_tool_image_crop.build = async function(options) {

	const self = this

	self.is_selecting	= false;
	self.is_dragging	= false;
	self.is_resizing	= false;
	self.start_x		= 0;
	self.start_y		= 0;
	self.current_handle	= null;
	self.natural_width	= 0;
	self.natural_height	= 0;
	self.nodes			= {};
	self.crop_area		= {};

	const container				= options.container
	const image					= options.image
	const status_container		= options.status_container

	self.natural_width	= image.naturalWidth;
	self.natural_height	= image.naturalHeight;

	const crop_selection = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'crop_selection',
		parent			: container
	});
		const nw_handle = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resize_handle nw',
			parent			: crop_selection
		});
		const n_handle = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resize_handle n',
			parent			: crop_selection
		});
		const ne_handle = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resize_handle ne',
			parent			: crop_selection
		});
		const w_handle = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resize_handle w',
			parent			: crop_selection
		});
		const e_handle = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resize_handle e',
			parent			: crop_selection
		});
		const sw_handle = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resize_handle sw',
			parent			: crop_selection
		});
		const s_handle = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resize_handle s',
			parent			: crop_selection
		});
		const se_handle = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resize_handle se',
			parent			: crop_selection
		});

	// set nodes pointer
	self.nodes.container		= container
	self.nodes.image			= image
	self.nodes.crop_selection	= crop_selection
	self.nodes.nw_handle		= nw_handle
	self.nodes.n_handle			= n_handle
	self.nodes.ne_handle		= ne_handle
	self.nodes.w_handle			= w_handle
	self.nodes.e_handle			= e_handle
	self.nodes.sw_handle		= sw_handle
	self.nodes.s_handle			= s_handle
	self.nodes.status_container = status_container


	 // Store references to bound methods
	self.bound_start_selection = self.start_selection.bind(self);
	self.bound_start_drag_or_resize = self.start_drag_or_resize.bind(self);
	self.bound_handle_mouse_move = self.handle_mouse_move.bind(self)

    // Mouse down handlers
	self.nodes.container.addEventListener('mousedown', self.bound_start_selection );
	self.nodes.crop_selection.addEventListener('mousedown', self.bound_start_drag_or_resize );

	// Mouse move handler
	self.nodes.container.addEventListener('mousemove', self.bound_handle_mouse_move );

	// Mouse up handler
	self.nodes.container.addEventListener('mouseup', function() {
		self.is_selecting	= false;
		self.is_dragging	= false;
		self.is_resizing	= false;
		self.current_handle	= null;
	});

}// end build



/**
* DESTROY
* Destroy the DOM nodes and its events
*/
render_tool_image_crop.destroy = function() {

	const self = this

	// reset variables
	self.reset_selection()

	// remove DOM elements
	while (self.nodes.crop_selection.firstChild) {
		self.nodes.crop_selection.removeChild(self.nodes.crop_selection.firstChild);
	}

	// remove dom crop_selection
	self.nodes.crop_selection.remove();
	// Remove listeners

	// Mouse down handlers
	self.nodes.container.removeEventListener('mousedown', self.bound_start_selection );
	self.nodes.crop_selection.removeEventListener('mousedown',self.bound_start_drag_or_resize );
	// Mouse move handler
	self.nodes.container.removeEventListener('mousemove', self.bound_handle_mouse_move );
	// Mouse up handler
	self.nodes.container.removeEventListener('mouseup', function() {
		self.is_selecting	= false;
		self.is_dragging	= false;
		self.is_resizing	= false;
		self.current_handle	= null;
	});

}// end destroy



/**
* START_SELECTION
* Create the new crop selection area, or reset it when user click outside
* @param e mouse down event
*/
render_tool_image_crop.start_selection = function(e) {

	const self = this

	// if the element target is not a valid element stop
	if (e.target !== self.nodes.image && e.target !== self.nodes.container){
		return;
	}

	// when the user click outside of the crop_area and exist a crop_area defined (click in shadow area)
	// reset the selection and set as no area selected
	// stop to create new crop area (as reset)
	if( self.crop_area?.width && self.crop_area.width > 0 ){
		self.reset_selection()
		return;
	}

	// get the container node area and calculate the click mouse position inside the node
	// it will be the starting point
	const rect = self.nodes.container.getBoundingClientRect();
	self.start_x = e.clientX - rect.left;
	self.start_y = e.clientY - rect.top;

	// create the new crop_selection area with the point of the mouse click
	self.is_selecting = true;
	self.nodes.crop_selection.style.left	= self.start_x + 'px';
	self.nodes.crop_selection.style.top		= self.start_y + 'px';
	self.nodes.crop_selection.style.width	= '0px';
	self.nodes.crop_selection.style.height	= '0px';
	self.nodes.crop_selection.style.display	= 'block';

}//end start_selection


/**
* START_DRAG_OR_RESIZE
* when user mouse down in the crop_selection
* Set what is user has doing a resize or drag action?
* @param e mouse down event
*/
render_tool_image_crop.start_drag_or_resize = function(e) {

	const self = this

	// if the user click close to any handle set as resize
	// else set as drag
	const handle = e.target.closest('.resize_handle');
	if (handle) {
		// Resize mode
		self.is_resizing = true;
		// get the name of the handle by the second parameter of the classList as nw or se
		self.current_handle = handle.classList[1];
		const rect = self.nodes.crop_selection.getBoundingClientRect();
		self.start_x = e.clientX;
		self.start_y = e.clientY;
	} else {
		// Drag mode
		self.is_dragging = true;
		const rect = self.nodes.crop_selection.getBoundingClientRect();
		self.start_x = e.clientX - rect.left;
		self.start_y = e.clientY - rect.top;
	}
	e.preventDefault();

}//end start_drag_or_resize



/**
* HANDLE_MOUSE_MOVE
* when user mouse move in the container
* perform the correct action based in the start_drag_or_resize() check
* @param e mouse down event
*/
render_tool_image_crop.handle_mouse_move = function(e) {

	const self = this

	if (self.is_selecting) {
		self.update_selection_size(e);
	} else if (self.is_dragging) {
		self.update_selection_position(e);
	} else if (self.is_resizing) {
		self.update_selection_resize(e);
	}
}//end handle_mouse_move



/**
* UPDATE_SELECTION_SIZE
* when user mouse move in the container
* and is selecting a new area
* @param e mouse down event
*/
render_tool_image_crop.update_selection_size = function(e) {

	const self = this

	const rect		= self.nodes.container.getBoundingClientRect();
	const current_x	= e.clientX - rect.left;
	const current_y	= e.clientY - rect.top;

	const width		= current_x - self.start_x;
	const height	= current_y - self.start_y;

	self.nodes.crop_selection.style.width	= Math.abs(width) + 'px';
	self.nodes.crop_selection.style.height	= Math.abs(height) + 'px';
	self.nodes.crop_selection.style.left	= (width > 0 ? self.start_x : current_x) + 'px';
	self.nodes.crop_selection.style.top		= (height > 0 ? self.start_y : current_y) + 'px';

	self.update_crop_area();
}//end update_selection_size



/**
* UPDATE_SELECTION_POSITION
* when user mouse move in the container
* and is dragging the crop selection area
* @param e mouse down event
*/
render_tool_image_crop.update_selection_position = function(e) {

	const self = this

	const rect		= self.nodes.container.getBoundingClientRect();
	const current_x	= e.clientX - rect.left - self.start_x;
	const current_y	= e.clientY - rect.top - self.start_y;

	const max_x = self.nodes.container.clientWidth - self.nodes.crop_selection.clientWidth;
	const max_y = self.nodes.container.clientHeight - self.nodes.crop_selection.clientHeight;

	self.nodes.crop_selection.style.left	= Math.max(0, Math.min(current_x, max_x)) + 'px';
	self.nodes.crop_selection.style.top		= Math.max(0, Math.min(current_y, max_y)) + 'px';

	self.update_crop_area();

}// end update_selection_position


/**
* UPDATE_SELECTION_POSITION
* when user mouse move in the container
* and is resizing the crop selection area, user are dragging a handle
* @param e mouse down event
*/
render_tool_image_crop.update_selection_resize = function(e) {

	const self = this

	const rect		= self.nodes.container.getBoundingClientRect();
	const current_x	= e.clientX - rect.left;
	const current_y	= e.clientY - rect.top;

	const selection_rect	= self.nodes.crop_selection.getBoundingClientRect();
	const box_x				= selection_rect.left - rect.left;
	const box_y				= selection_rect.top - rect.top;
	const box_width			= selection_rect.width;
	const box_height		= selection_rect.height;

	let new_x		= box_x;
	let new_y		= box_y;
	let new_width	= box_width;
	let new_height	= box_height;

	switch(self.current_handle) {
		case 'nw':
			new_width	= box_width + (box_x - current_x);
			new_height	= box_height + (box_y - current_y);
			new_x		= current_x;
			new_y		= current_y;
			break;
		case 'ne':
			new_width	= current_x - box_x;
			new_height	= box_height + (box_y - current_y);
			new_y		= current_y;
			break;
		case 'sw':
			new_width	= box_width + (box_x - current_x);
			new_height	= current_y - box_y;
			new_x		= current_x;
			break;
		case 'se':
			new_width	= current_x - box_x;
			new_height	= current_y - box_y;
			break;
		case 'n':
			new_height	= box_height + (box_y - current_y);
			new_y		= current_y;
			break;
		case 's':
			new_height 	= current_y - box_y;
			break;
		case 'w':
			new_width	= box_width + (box_x - current_x);
			new_x		= current_x;
			break;
		case 'e':
			new_width 	= current_x - box_x;
			break;
	}

	// Constrain to self.nodes.container
	new_x		= Math.max(0, new_x);
	new_y		= Math.max(0, new_y);
	new_width	= Math.min(new_width, self.nodes.container.clientWidth - new_x);
	new_height	= Math.min(new_height, self.nodes.container.clientHeight - new_y);

	if (new_width > 10 && new_height > 10) {
		self.nodes.crop_selection.style.left	= new_x 		+ 'px';
		self.nodes.crop_selection.style.top		= new_y 		+ 'px';
		self.nodes.crop_selection.style.width	= new_width 	+ 'px';
		self.nodes.crop_selection.style.height	= new_height 	+ 'px';
	}

	self.update_crop_area();

}//end update_selection_resize




/**
* UPDATE_CROP_AREA
* Calculate the crop are relative to the image
* It will be used to crop the image in the server
*/
render_tool_image_crop.update_crop_area = function() {

	const self = this

	const left		= parseInt(self.nodes.crop_selection.style.left);
	const top		= parseInt(self.nodes.crop_selection.style.top);
	const width		= parseInt(self.nodes.crop_selection.style.width);
	const height	= parseInt(self.nodes.crop_selection.style.height);

	const scale_x = self.natural_width / self.nodes.image.clientWidth;
	const scale_y = self.natural_height / self.nodes.image.clientHeight;

	self.crop_area = {
		x		: Math.round(left * scale_x),
		y		: Math.round(top * scale_y),
		width	: Math.round(width * scale_x),
		height	: Math.round(height * scale_y),
	}

	self.nodes.status_container.innerHTML = `
		x: ${self.crop_area.x}, y: ${self.crop_area.y} | ${self.crop_area.width}x${self.crop_area.height}
	`;

}//end update_crop_area



/**
* RESET_SELECTION
* Reset the crop area
* Empty crop_selection node and the status_container node
*/
render_tool_image_crop.reset_selection = function() {

	const self = this

	if(self.nodes?.crop_selection){
		self.nodes.crop_selection.style.display	= 'none';
	}
	if(self.nodes?.status_container){
		self.nodes.status_container.textContent	= '';
	}

	self.crop_area = null

}// end reset_selection





