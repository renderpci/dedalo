// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label,  SHOW_DEBUG, DEDALO_ROOT_WEB, svgcanvas, iro */
/*eslint no-undef: "error"*/



// imports
	import SvgCanvas from '../../../lib/svgedit/svgcanvas.js'
	import '../../../lib/iro/dist/iro.min.js';
	import {ui} from '../../common/js/ui.js'
	// import {common} from '../../common/js/common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {clone} from '../../common/js/utils/index.js'



export const vector_editor = function() {

	this.id

	this.stage = null
	// svgcanvas vars
	this.active_layer			= null
	this.active_fill_color		= '#ffffff'
	this.active_opacity			= 0.3
	this.button_color_picker	= null
	this.selected_element		= null
	this.shortcuts = [
		// Shortcuts not associated with buttons
		{ key: 'tab', fn: () => { this.stage.cycleElement(0) } },
		{ key: 'shift+tab', fn: () => { this.stage.cycleElement(1) } },
		{
			key: ['delete/backspace', true],
			fn: () => {
				// this.stage.deleteSelectedElements()
				if (this.selected_element || this.multiselected) { this.stage.deleteSelectedElements() }
			}
		},
		{ key: 'a', fn: () => { this.stage.selectAllInCurrentLayer() } },
		{ key: 'alt+a', fn: () => { this.stage.selectAllInCurrentLayer() } },
		{ key: 'alt+x', fn: () => { this.cutSelected() } },
		{ key: 'alt+c', fn: () => { this.copySelected() } },
		{ key: 'alt+v', fn: () => { this.pasteInCenter() } }
	]


	return true
}//end component_image



/**
* INIT_CANVAS
* @param instance self
* 	component_image instance
* @return promise
* 	bool true
*/
vector_editor.prototype.init_canvas = async function(self) {

	// init with the DOM image_container (work_area)
	// get his size
		this.image_container			= self.image_container
		// const image_container_size	= image_container.getBoundingClientRect()
		// active_editor set style
		this.image_container.classList.add('active_editor')

	// init a empty canvas to be used to test if the browser support it

		ui.create_dom_element({
			element_type	: 'canvas',
			parent 			: this.image_container.parentNode
		})

	// initial image node
	// the image node will be deleted when konva will initiated
	// get the image size and the source (see it in view_xxxx)
	// calculate the ratio of the image, it will be fixed when is resized
		const object_node	= this.image_container.object_node
		const image_size	= object_node.getBoundingClientRect()
		const image_url		= object_node.url
		const image_ratio	= image_size.width / image_size.height

	// initial svg_canvas node
		const svg_canvas = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'svg_canvas',
			parent 			: this.image_container
		})
		// set the size of the node to the user screen (the max space to be used to work)
		svg_canvas.style.width	= window.screen.width +'px'
		svg_canvas.style.height	= window.screen.height +'px'

		this.svg_canvas			= svg_canvas
		const svg_canvas_size	= svg_canvas.getBoundingClientRect()

	// image definition
	// store the image size and source to update the image when is changed
		const image_definition = {
			src			: image_url,
			width		: image_size.width,
			height		: image_size.height,
			image_ratio	: image_size.width / image_size.height,
			image_node	: null,
		}
		this.image_definition = image_definition

		const config = {
			initFill	: { color: 'FFFFFF', opacity: 1 },
			initStroke	: { color: '000000', opacity: 1, width: 1 },
			text		: { stroke_width: 0, font_size: 24, font_family: 'serif' },
			initOpacity	: 1,
			imgPath		: '../themes/default/icons',
			dimensions	: [ image_definition.width, image_definition.height ],
			baseUnit	: 'px'
		}

	// SvgCanvas
	// create the SvgCanvas instance
		const stage = new SvgCanvas( svg_canvas, config)
		stage.updateCanvas(svg_canvas_size.width, svg_canvas_size.height)

		this.stage = stage

	// set the segment type to be square
		stage.setSegType(4)
	// set the color
		stage.setColor('fill', this.active_fill_color)

	// Events listeners
	// bind the selected event to our function that handles updates to the UI
		this.stage.bind('selected', this.selected_changed.bind(this))
		// this.stage.bind('mouseMove', this.element_transition.bind(this))
		this.stage.bind('extensions_added', this.keyboard_shortcuts.bind(this))
		this.stage.bind('zoomed', this.zoom_changed.bind(this))
		this.stage.call('extensions_added')
		this.stage.bind('exported', this.export_handler.bind(this));
		// this.stage.bind('changed', this.changed.bind(this));

	// paste event. Paste svg clipboard to active layer
		document.addEventListener('paste', fn_paste)
		function fn_paste(event) {
			// get the clipboard data
			const clipboard = event.clipboardData.getData('text/plain')
			// check if the clipboard is a svg data
			if ( clipboard.indexOf('<svg version="')!=-1 ) {

				// const pasted_svg = self.current_paper.project.importSVG( clipboard )
				// pasted_svg.clipped = true;

				// optional: remove the clipped path
					// pasted_svg.clipped = false;
					// pasted_svg.children[0].remove()
					// pasted_svg.parent.insertChildren(pasted_svg.index,pasted_svg.removeChildren());
					// pasted_svg.remove();
			}
		}

	// copy event
		document.addEventListener('copy', fn_copy)
		function fn_copy(event) {
			// copy the path and convert to svg to export in the clipboard
			event.preventDefault();
			const project_svg = project.exportSVG({asString:true,precision:3})
			if (event.clipboardData) {
				event.clipboardData.setData('text/plain', project_svg);
			} else if (window.clipboardData) {
				window.clipboardData.setData('Text', project_svg);
			}
		};

	// create the main layer
	// main layer is the layer that define the area to be cropped.
	// // add the layer to the stage
	// 	this.stage.add(main_layer);
		// object_node.classList.add('hide')
		object_node.remove();

	// load data
		this.load_data(self)

	// update canvas to fit it into the space
		this.update_canvas();

	// init the the interface
		this.render_tools_buttons(self);

	// subscription to the full_screen change event
		self.events_tokens.push(
			event_manager.subscribe('full_screen_'+self.id,  this.update_canvas.bind(this))
		)

	// when the image change his quality
	// change the source of the image, load it and re-calculate his size.
		self.events_tokens.push(
			event_manager.subscribe('image_quality_change_'+self.id, fn_img_quality_change)
		)
		function fn_img_quality_change(img_src) {
			image_definition.src = img_src
			stage.setHref(image_definition.image_node, img_src);
		}//end img_quality_change


	return true
}//end init_canvas


// called when we've selected a different element
/**
*
* @param {external:Window} win
* @param {module:svgcanvas.SvgCanvas#event:selected} elems Array of elements that were selected
* @listens module:svgcanvas.SvgCanvas#event:selected
* @fires module:svgcanvas.SvgCanvas#event:ext_selectedChanged
* @returns {void}
*/
vector_editor.prototype.selected_changed = function(win, elems) {

	const stage		= this.stage
	const layer		= this.active_layer
	this.selected_element = elems.length === 1 || !elems[1] ? elems[0] : null

	this.set_color_picker()
	// const path = stage.getPathObj()

	// const drawnPath = stage.getDrawnPath()

	// if(drawnPath){
	// 	const seglist = drawnPath.pathSegList
	// 	console.log("seglist:",seglist);
	// }

	// const current_mode = stage.getMode()

	// if(current_mode==='pathedit'){
	// 	const path_actions = stage.pathActions

	// 	const node_point = path_actions.getNodePoint()
	// 	document.onkeydown = function(e) {
	// 		if (e.altKey) {
	// 			path_actions.linkControlPoints(true)
	// 			console.log("linkControlPoints:---true");
	// 		}else{
	// 			path_actions.linkControlPoints(false)
	// 			console.log("inkControlPoints:---false:");
	// 		}
	// 	}



	// }

	// 	console.log("current_mode:",current_mode);

	// 	console.log("stage.pathActions:",stage.pathActions);


	// const point = path
	// 	? path.pathActionsMethod.getNodePoint()
	// 	: null
		// console.log("stage.getSegType():",stage.setSegType());
		// console.log("path:",stage.getSegData());

}


vector_editor.prototype.element_transition = function(win, elems) {

	const stage		= this.stage
	const layer		= this.active_layer
	// this.selected_element = elems.length === 1 || !elems[1] ? elems[0] : null

	const path = stage.getPathObj()

	const drawnPath = stage.getDrawnPath()

	if(drawnPath){
		const seglist = drawnPath.pathSegList

	}

	const current_mode = stage.getMode()

	if(current_mode==='pathedit'){
		const path_actions = stage.pathActions

		const node_point = path_actions.getNodePoint()
		document.onkeydown = function(e) {
			if (e.altKey) {
				path_actions.linkControlPoints(true)
				console.log("linkControlPoints:---true");
			}else{
				path_actions.linkControlPoints(false)
				console.log("inkControlPoints:---false:");
			}
		}
	}

	// const point = path
	// 	? path.pathActionsMethod.getNodePoint()
	// 	: null
		// console.log("stage.getSegType():",stage.setSegType());
		// console.log("path:",stage.getSegData());
}


/**
* KEYBOARD_SHORTCUTS
* @param {external:Window} win
* @param {module:svgcanvas.SvgCanvas#event:selected} elems Array of elements that were selected
* @listens module:svgcanvas.SvgCanvas#event:selected
* @fires module:svgcanvas.SvgCanvas#event:ext_selectedChanged
* @returns {void}
*/
vector_editor.prototype.keyboard_shortcuts = function() {

	this.extensionsAdded = true

	const key_handler = {} // will contain the action for each pressed key

	this.shortcuts.forEach(shortcut => {
		// Bind function to shortcut key
		if (shortcut.key) {
			// Set shortcut based on options
			let key_value = shortcut.key
			let pd = false
			if (Array.isArray(shortcut.key)) {
				key_value = shortcut.key[0]
				if (shortcut.key.length > 1) {
					pd = shortcut.key[1]
				}
			}
			key_value = String(key_value)
			const { fn } = shortcut
			key_value.split('/').forEach(key => {
				key_handler[key] = { fn, pd }
			})
		}
		return true
	})
	// register the keydown event
	document.addEventListener('keydown', e => {

		// only track keyboard shortcuts for the body containing the SVG-Editor
		if (e.target.nodeName !== 'BODY') return
		// normalize key
		const key = `${e.altKey ? 'alt+' : ''}${e.shiftKey ? 'shift+' : ''}${e.metaKey ? 'meta+' : ''}${e.ctrlKey ? 'ctrl+' : ''}${e.key.toLowerCase()}`

		// return if no shortcut defined for this key
		if (!key_handler[key]) return
		// launch associated handler and preventDefault if necessary

		key_handler[key].fn()

		if (key_handler[key].pd) {
			e.preventDefault()
		}
	})
}


/**
* POINTER
* init pointer tool
* @return bool true
*/
vector_editor.prototype.pointer = function() {

	const stage		= this.stage
	const layer		= this.active_layer

	stage.setMode('select')

	const selected_element	= stage.getSelectedElements()[0]

	// when the pointer is selected check if has some selected
	// to check if the element need to be converted to path
	if(selected_element){
		// get the element name to check if other than a path
		// if yes (rec, ellipse, etc) need to be converted as path
		// IMPORTANT; apple only one, convertToPath() method can disconnect control points if is applied twice
		const element_name = selected_element.nodeName
		if( !['image', 'text', 'path', 'g', 'use'].includes(element_name) ){
			stage.convertToPath()
		}
	}
}//end selector



vector_editor.prototype.create_rectangle = function () {

	const stage			= this.stage
	const layer			= this.active_layer

	// deselection any other selected
	stage.clearSelection()

	// control to draw in any other layer than raster
	// raster layer can only content image
	if(layer.layer_id===0){
		return false
	}
	// get the layer color and add transparency
	// set the color to draw new rectangle
	stage.setColor('fill', layer.layer_color)
	stage.setOpacity(0.3)

	stage.setMode('rect')
}


vector_editor.prototype.create_circle = function () {

	const stage			= this.stage
	const layer			= this.active_layer

	// deselection any other selected
	stage.clearSelection()

	// get the layer color and add transparency
	// set the color to draw new rectangle
	stage.setColor('fill', layer.layer_color)
	stage.setOpacity(0.3)

	stage.setMode('ellipse')
}


vector_editor.prototype.create_vector = function () {

	const stage			= this.stage
	const layer			= this.active_layer

	// deselection any other selected
	stage.clearSelection()

	// get the layer color and add transparency
	// set the color to draw new rectangle
	stage.setColor('fill', layer.layer_color)
	stage.setOpacity(0.3)

	stage.setMode('path')


	// path.linkControlPoints(linked)
	// path.getNodePoint()

	// const point = this.selected_element.getNodePoint()

	// this.click()
	// const segType = $id('seg_type')
// console.log("point:",point);
	 // segType.value = point.type
// 	const path = stage.getPathObj()


//       if (path) {

//       }
// console.log("e:----", this.selected_element);
	  // this.click(element, handler) => {
	  // 	console.log("e:----", e);
	  // }
}


vector_editor.prototype.activate_zoom = function () {

	const stage			= this.stage
	stage.setMode('zoom');

}

/**
 * ZOOM_CHANGED
 * @function module:svgcanvas.SvgCanvas#zoom_changed
 * @param {external:Window} win
 * @param {module:svgcanvas.SvgCanvas#event:zoomed} bbox
 * @param {boolean} autoCenter
 * @listens module:svgcanvas.SvgCanvas#event:zoomed
 * @returns {void}
*/
vector_editor.prototype.zoom_changed = function(win, bbox, autoCenter) {

	const stage					= this.stage
	const image_container		= this.image_container
	const image_container_size	= this.image_container.getBoundingClientRect()
	const svg_canvas_size		= this.svg_canvas.getBoundingClientRect()

	// const w = parseFloat(getComputedStyle(image_container, null).width.replace('px', ''))
	// const h = parseFloat(getComputedStyle(image_container, null).height.replace('px', ''))

	const w = image_container_size.width // svg_canvas_size.width
	const h = image_container_size.height // svg_canvas_size.height

	const zInfo = stage.setBBoxZoom( bbox, w, h )
	if (!zInfo) {
		return
	}
	const zoomlevel = ( zInfo.zoom < 0.001 ) ? 0.1 : zInfo.zoom;
	const bb = zInfo.bbox

	const zoom = stage.getZoom()
	const new_w = Math.max(w, stage.contentW * zoom )
	const new_h = Math.max(h, stage.contentH * zoom )

	const offset = stage.updateCanvas( new_w, new_h	)


	this.image_container.style.width = new_w + 'px'
	this.image_container.style.height = new_h + 'px'


	const newCtr = {
		x: bb.x * zoomlevel + (bb.width * zoomlevel) / 2,
		y: bb.y * zoomlevel + (bb.height * zoomlevel) / 2
	}

	newCtr.x += offset.x
	newCtr.y += offset.y

	image_container.scrollLeft	= newCtr.x - w / 2
	image_container.scrollTop	= newCtr.y - h / 2
	image_container.scroll()

}


/**
* UPDATE_CANVAS
* Fit the canvas and image to the space
*/
vector_editor.prototype.update_canvas = function(){

	const stage	= this.stage
	const zoom	= stage.getZoom()

	const image_definition		= this.image_definition
	const image_ratio			= image_definition.image_ratio

	const image_container_size	= this.image_container.getBoundingClientRect()
	const svg_canvas_size		= this.svg_canvas.getBoundingClientRect()

	// re-calculate the image_contanier size
	// const image_container_size	= image_container.getBoundingClientRect()
	// use the image_ratio to calculate the width in relation to new height and update the image definition
	const width = image_container_size.height * image_ratio
	image_definition.width	= width
	image_definition.height	= image_container_size.height
	// clean the selectors, they will not scaled well
	stage.clearSelection()
	// update the stage to new size
	// set the canvas zoom to fit the new image container size
	stage.setBBoxZoom(
		'canvas',
		image_definition.width,
		image_definition.height
	)
	// update the canvas with the new size (it use the previous zoom to set the canvas content)
	const offset = stage.updateCanvas(
		image_definition.width,
		image_definition.height
	)

	const w = Math.max(svg_canvas_size.width, stage.contentW * zoom )
	const h = Math.max(svg_canvas_size.height, stage.contentH * zoom )

	const scroll_X = w / 2 - image_container_size.width / 2
	const scroll_Y = h / 2 - image_container_size.height / 2

	this.image_container.scrollLeft = scroll_X
	this.image_container.scrollTop = scroll_Y

	stage.updateCanvas(w, h)

}


/**
* RENDER_TOOLS_BUTTONS
* @return bool
*/
vector_editor.prototype.render_tools_buttons = function(self) {

	const stage				= this.stage
	const layer				= this.active_layer
	const image_definition	= this.image_definition

	// check vector_editor_tools
		if (!self.vector_editor_tools) {
			console.error('Error: vector_editor_tools is not available:', self.vector_editor_tools);
			return
		}

	// Tool buttons. Show
		const buttons_container	= self.vector_editor_tools
		buttons_container.classList.remove('hide')

	// vector editor tools
		const buttons = []

			// layer_selector_container
				const layer_selector_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'layer_selector_container',
					parent			: buttons_container
				})

			// layer selector
				const layer_selector_button = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button open_layer_selector',
					parent			: buttons_container
				})
				layer_selector_button.addEventListener('mouseup', (e) =>{
					e.stopPropagation()
					// clean
						while (layer_selector_container.firstChild) {
							layer_selector_container.removeChild(layer_selector_container.firstChild)
						}

					const layer_selector = this.render_layer_selector(self, this.active_layer)
					layer_selector_container.appendChild(layer_selector)

					activate_status(layer_selector_button)
				})
				buttons.push(layer_selector_button)

				self.events_tokens.push(
					event_manager.subscribe('active_layer_'+self.id, change_layer)
				)
				function change_layer(active_layer) {
					layer_selector_button.innerHTML = active_layer.layer_id
				}

			// pointer
				const pointer = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button pointer',
					parent 			: buttons_container
				})
				pointer.addEventListener('mouseup', (e) =>{
					e.stopPropagation()
					this.pointer()
					activate_status(pointer)
				})
				buttons.push(pointer)

			// rectangle
				const rectangle = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button rectangle',
					parent 			: buttons_container
				})
				rectangle.addEventListener('mouseup', (e) =>{
					e.stopPropagation()
					this.create_rectangle()
					activate_status(rectangle)
				})
				buttons.push(rectangle)

			// circle
				const circle = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button circle',
					parent 			: buttons_container
				})
				circle.addEventListener('mouseup', (e) =>{
					e.stopPropagation()
					this.create_circle()
					activate_status(circle)
				})
				buttons.push(circle)

			// vector
				const vector = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button vector',
					parent 			: buttons_container
				})
				vector.addEventListener('mouseup', (e) =>{
					e.stopPropagation()
					this.create_vector()
					activate_status(vector)
				})
				buttons.push(vector)

			// zoom
				const zoom = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button tool zoom',
					parent 			: buttons_container
				})
				zoom.addEventListener('mouseup', (e) =>{
					e.stopPropagation()
					this.activate_zoom()
					activate_status(zoom)
				})
				zoom.addEventListener('dblclick', () =>{

					// const resolution	= stage.getResolution()
					const multiplier	= 1
					stage.setCurrentZoom(multiplier)
					// this.updateCanvas(true)
					this.update_canvas()
				})

				// zoom.addEventListener('wheel', (e) =>{

				// })
				buttons.push(zoom)

			// move
				// const move = ui.create_dom_element({
				// 	element_type	: 'span',
				// 	class_name		: 'button tool move',
				// 	parent			: buttons_container
				// })
				// move.addEventListener('mouseup', async () =>{
				// 	// stage.mergeAllLayers();
				// 	const svg_data = stage.getSvgContent()  //getSvgString
				// 	console.log("svg_data:",svg_data);

				// 	const imgType = 'JPEG'
				// 	const quality = parseFloat(1)

				// 	const image = await stage.rasterExport(
				// 		imgType,
				// 		quality,
				// 		'export' //'v6 rsc170 imagen'//this.editor.exportWindowName
				// 	)


				// 	// this.move.activate()
				// 	// activate_status(move)
				// })
				// move.addEventListener('dblclick', () =>{

				// 	const svg_data = stage.getSvgContent()  //getSvgString
				// 		console.log("svg_data:",svg_data);

				// 	// const delta_x	= self.canvas_width /2
				// 	// const delta_y	= self.canvas_height /2
				// })
				// buttons.push(move)

			// save
				const save = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button tool save',
					title			: get_label.save || 'Save',
					parent			: buttons_container
				})
				save.addEventListener('mouseup', async (e) =>{
					e.stopPropagation()

					// clone the actual image source (it could be different of the default quality)
					const original_source = clone(image_definition.src)

					// get the default quality file info and set to the image
					const default_file_info = self.get_default_file_info(0);
					const img_src = DEDALO_MEDIA_URL + default_file_info.file_path
					event_manager.publish('image_quality_change_'+self.id, img_src)
					// close the fullscreen to show full component
					self.node.classList.remove('fullscreen')
					event_manager.publish('full_screen_'+self.id, false)
					// save the layers with the default image quality
					await this.save_data(self)
					// restore the original quality selected
					if(original_source !== img_src){

						event_manager.publish('image_quality_change_'+self.id, original_source)
					}
					activate_status(save)
				})
				buttons.push(save)

			// color_picker
				this.button_color_picker = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button tool button_color_picker',
					parent			: buttons_container
				})
				const color_wheel_contaniner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'hide color_wheel_contaniner',
					parent			: buttons_container
				})

				this.color_picker = new iro.ColorPicker(color_wheel_contaniner, {
						// Set the size of the color picker
						width: 160,
						// Set the initial color to project color
						color: '#f00',
						// color wheel will not fade to black when the lightness decreases.
						wheelLightness: false,
						transparency: true,
						layout: [
							{
								component: iro.ui.Wheel, // can be iro.ui.Box
								options: {
									sliderShape: 'circle'
								}
							},
							{
								component: iro.ui.Slider,
								options: {
									sliderType: 'value' // can also be 'saturation', 'value', 'alpha' or 'kelvin'
								}
							},
							{
								component: iro.ui.Slider,
								options: {
									sliderType: 'alpha'
								}
							},
						]
					})
				this.button_color_picker.addEventListener('mouseup', () =>{
					color_wheel_contaniner.classList.toggle('hide')
					this.color_picker.color.hexString	= this.active_fill_color
					this.color_picker.color.alpha		= this.active_opacity
				})
				// color:change event callback
				// color:change callbacks receive the current color and a changes object
				const color_selected = (color, changes) =>{
					if(this.selected_element !== null){
						stage.setColor('fill', color.hexString)
						stage.setOpacity(color.alpha)
						// stage.setPaint('fill', color.hex8String)
					}
					this.button_color_picker.style.backgroundColor	= color.hexString
					this.button_color_picker.style.opacity			= color.alpha
					// update the instance with the new layer information, prepared to save
					// (but is not saved directly, the user need click in the save button)
					// self.update_draw_data()
					// event_manager.publish('color_change_'+this.active_layer.data.layer_id, color.hex8String)
				}

				// listen to a color picker's color:change event
				this.color_picker.on('color:change', color_selected);

		// change the buttons status: active, inactive
			const activate_status = (button) =>{
				const buttons_lenght = buttons.length
				for (let i = 0; i < buttons_lenght; i++) {
					if (buttons[i].classList.contains('vector_tool_active')) {
						buttons[i].classList.remove('vector_tool_active')
					}
				}
				// button ? button.classList.add('vector_tool_active') : null
				button.classList.add('vector_tool_active')
			}

		// first load activate pointer
			// this.pointer.activate()
			// activate_status(pointer)

	return true
}//end render_tools_buttons



vector_editor.prototype.export_handler = function(win, data){
	const {
		issues,
		WindowName
	} = data;
   const exportWindow = window.open('', WindowName);
   exportWindow.location.href = data.bloburl || data.datauri;
}

/**
* SET_COLOR_PICKER
* get the color of the current active layer to set to the color picker and the button color picker
* @return void
*/
vector_editor.prototype.set_color_picker = function() {

	const stage			= this.stage
	const layer			= this.active_layer

	// check if the selected element is a image
	// image doesn't has the fill attribute
	const element_name = this.selected_element
		? this.selected_element.nodeName
		: ''
	if( ['image', 'use'].includes(element_name) ){
		return
	}

	// get the item selected color
		this.active_fill_color = (this.selected_element)
			? this.selected_element.getAttribute('fill')
			: stage.getColor('fill')
		this.active_opacity = (this.selected_element)
			? this.selected_element.getAttribute('opacity')
			: stage.getOpacity()

		if(this.button_color_picker && this.active_fill_color){
			// set the icon of color picker with the selected path color
				this.button_color_picker.style.backgroundColor = this.active_fill_color
			// set the color picker with the selected path color
				this.color_picker.color.hexString	= this.active_fill_color
				this.color_picker.color.alpha		= this.active_opacity
		}
}//end set_color_picker



/**
* LOAD_DATA
* get the layers loaded and show into window
* @return object new_layer
*/
vector_editor.prototype.load_data = function(self) {

	const stage				= this.stage
	const drawing			= stage.getCurrentDrawing()
	const image_definition 	= this.image_definition

	const lib_data = self.get_lib_data()

	if(lib_data){
		self.ar_layers = lib_data

		const len = self.ar_layers.length
		for (let i = 0; i < len; i++) {
			const current_layer = self.ar_layers[i]

			//Check if the layer is the raster layer,
			// raster layer use the main created layer by the svgcanvas
			// but, rename it as layer_0
			// if not, create new layer to import data
			if(current_layer.layer_id > 0){
				const created_layer = drawing.createLayer(current_layer.name)
				created_layer.id = current_layer.name

			}else{
				stage.renameCurrentLayer('layer_0')
				const image_layer = drawing.getCurrentLayer()
				image_layer.id = current_layer.name
			}
			// data is storage without the layer group ('g' node)
			// only transformations and paths will be loaded
			if(!current_layer.layer_data){
				continue;
			}
			const layer_data_len = current_layer.layer_data.length
			for (let i = 0; i < layer_data_len; i++) {
				const layer_data = current_layer.layer_data[i]
				const element = stage.addSVGElementsFromJson(layer_data)

				if(current_layer.layer_id === 0 && layer_data.element=== 'image'){
					image_definition.src		= element.getAttribute('xlink:href')
					image_definition.image_node	= element
				}
			}

			this.active_layer = current_layer
		}

	}else{
		//empty data, create new image layer node
		// svgcanvas create a Layer 1 by default, rename it to main
		stage.renameCurrentLayer('layer_0')
		const image_layer = drawing.getCurrentLayer()
		image_layer.id = 'layer_0'

		// this.stage.createLayer()
		this.active_layer = {
			layer_id		: 0,
			layer_data		: null,
			layer_color		: '#ffffff',
			layer_opacity	: 1,
			user_layer_name	: 'raster',
			name 			: 'layer_0',
			visible 		: true
		}


		// image
		// create new image node
		const image_node	= new Image();

		// create the img_elem in the top left position of canvas
		const img_elem = stage.addSVGElementsFromJson({
			element : "image",
			attr : {
				x		: 0,
				y		: 0,
				width	: image_definition.width,
				height	: image_definition.height,
				id		: 'main_image',
				opacity	: 1,
				style	: "pointer-events:inherit",
			}
		});

		image_node.onload = () => {

			// this.stage.setBackground( '#ffffff',image_node.src)

			stage.setHref(img_elem, image_node.src);
			// this.stage.moveSelectedToLayer('main')

		};
		image_node.src				= image_definition.src
		image_definition.image_node	= img_elem
	}

	return true
}//end load_data



/**
* GET_LAST_LAYER_ID
* Get the last layer_id in the ar_layers
* @param int last_layer_id
*/
vector_editor.prototype.get_last_layer_id = function(self) {

	const ar_layer_id	= self.ar_layers.map((item) => item.layer_id)
	const last_layer_id	= Math.max(...ar_layer_id)

	return last_layer_id
}//end get_last_layer_id



/**
* ADD_LAYER
* get the layers loaded and show into window
* @return object new_layer
*/
vector_editor.prototype.add_layer = function(self) {

	const stage				= this.stage
	const drawing			= stage.getCurrentDrawing()

	// deselection any other selected
	stage.clearSelection()

	// set the layer data
		const last_layer_id	= this.get_last_layer_id(self)
		const layer_id		= last_layer_id + 1

		// const new_layer	= self.ar_layers.find((item) => item.layer_id===layer_id)
		const layer_name	= 'layer_' + layer_id

	// create a new layer color for selectors and handlers
		const layer_color = Math.floor(Math.random()*16777215).toString(16).padStart(6, "0");

	// create a new layer and add to the ar_layers array and set as active layer
		const new_layer = {
			layer_id		: layer_id,
			layer_data		: null,
			layer_color		: '#'+layer_color,
			layer_opacity 	: 0.3,
			user_layer_name	: layer_name,
			name 			: layer_name,
			visible 		: true
		}
		const created_layer = drawing.createLayer(layer_name)

		created_layer.id = layer_name

		self.ar_layers.push(new_layer)
		this.active_layer = new_layer

	return new_layer
}//end add_layer



/**
* save_data
* get the layers loaded and save it
* @return object new_layer
*/
vector_editor.prototype.save_data = async function(self) {

	const stage				= this.stage
	const drawing			= stage.getCurrentDrawing();

	const all_layers = drawing.all_layers
	const len = drawing.all_layers.length

	for (var i = 0; i < all_layers.length; i++) {

		// get the group of the layer, it's a 'g' node
		// and get the JSON format of this
		const group = all_layers[i].group_
		const json = stage.getJsonFromSvgElements(group)

		const layer_id = all_layers[i].name_
		const current_layer = self.ar_layers.find(item => item.name===layer_id)
		// remove the layer definition and all title nodes
		// get only the elements, all layer info will be recreated in load process
		current_layer.layer_data = json.children.filter(el => el.element !== 'title')
	}

	// update the data in the instance previous to save
	const value =  typeof(self.data.value[0])!=='undefined'
		? clone(self.data.value[0])
		: {}
	value.lib_data		= self.ar_layers
	value.svg_file_data	= stage.getSvgString()

	// set the changed_data for update the component data and send it to the server for change when save
		const changed_data = {
			action	: 'update',
			key		: 0,
			value	: value
		}

	// set the change_data to the instance
		self.data.changed_data = changed_data

	return self.change_value({
		changed_data	: [changed_data],
		refresh			: false
	})

}//end save_data



/**
* ACTIVATE_LAYER
* @param int layer_id
*/
vector_editor.prototype.activate_layer = function(layer_id) {

	const stage		= this.stage
	const drawing	= stage.getCurrentDrawing()

	const canvas_layers	= stage.getCurrentDrawing().getNumLayers()

	for (let i = canvas_layers - 1; i >= 0; i--) {

		if(i === 0){
			continue;
		}
		const opacity = (i === layer_id) ? 1.0 : 0
		const viewed_layer	= drawing.getLayerName(i)
		this.active_layer	= viewed_layer
		drawing.setLayerOpacity(viewed_layer, opacity)
	}


}//end activate_layer



/**
* RENDER_LAYER_SELECTOR
* @return HTMLElement layer_selector
*/
vector_editor.prototype.render_layer_selector = function(self) {

	// get the layers loaded in the image instance
	const ar_layers = self.ar_layers

	const fragment = new DocumentFragment()

	// add button
		const add_layer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button add',
			title			: get_label.new || 'New',
			parent			: fragment
		})
		add_layer.addEventListener('click', (e) =>{
			e.stopPropagation()
			// add the data in the instance
			const new_layer	= this.add_layer(self)
			const layer_li	= this.render_layer_row(self, new_layer)
			// layer_ul.appendChild(layer_li)
			layer_ul.insertBefore(layer_li, layer_ul.firstChild)
		})

	// close button
		const close = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button close',
			parent			: fragment
		})
		close.addEventListener("click", (e) =>{
			e.preventDefault()
			layer_selector.remove()
		})

	// rows container
		const layer_ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'layer_ul',
			parent			: fragment
		})

		// load the layer into the layer box
		for (let i =  ar_layers.length - 1; i >= 0; i--) {
			const layer		= ar_layers[i]
			const layer_li	= this.render_layer_row(self, layer)
			layer_ul.appendChild(layer_li)
		}//end for

	// layer_selector
		const layer_selector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'layer_selector'
		})
		layer_selector.appendChild(fragment)

	return layer_selector
}//end render_layer_selector



/**
* RENDER_LAYER_ROW
* @return HTMLElement layer_li
*/
vector_editor.prototype.render_layer_row = function(self, layer) {

	const stage				= this.stage
	const drawing			= stage.getCurrentDrawing()
	// const currentLayerName	= drawing.getCurrentLayerName()
	// const canvas_layers		= stage.getCurrentDrawing().getNumLayers()


	// layer_container
		const layer_li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'li'
		})
		layer_li.addEventListener('click', () =>{
			stage.clearSelection()

			// get the layer name
			const name	= 'layer_'+layer.layer_id

			// const new_active_layer	= project.layers[name]
			 // if we don't has the layer loaded, we load now
			// if(typeof new_active_layer==='undefined'){
			// 	this.load_layer(self, layer)
			// }else{
				// new_active_layer.activate()

				event_manager.publish('active_layer_'+self.id, layer)
			// }
		})
		// set the raster layer with specific class to remove css behavior (hover...)
			if(layer.layer_id===0){
				layer_li.classList.add('raster_layer')
			}

		// set the active layer, remove the raster layer to the active option
			if(layer.layer_id===this.active_layer.layer_id && layer.layer_id!==0) {
				layer_li.classList.add('active')
			}else{
				if (layer_li.classList.contains('active')) {
					layer_li.classList.remove('active')
				}
			}

		// when we change the active layer, the other layers will be inactive
			self.events_tokens.push(
				event_manager.subscribe('active_layer_'+self.id, change_layer)
			)
			function change_layer(active_layer) {
				if(layer.layer_id === active_layer.layer_id) {
					layer_li.classList.add('active')
					this.active_layer = active_layer
					stage.setCurrentLayer(active_layer.name)
				}else{
					if (layer_li.classList.contains('active')) {
						layer_li.classList.remove('active')
					}
				}
			}//end change_layer

		// layer_icon
			const layer_icon = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button eye layer_icon active',
				parent			: layer_li,
				text_node		: layer.layer_icon
			})
			// select the layer, if the layer is the raster we change the selector name
			const name			= layer.layer_id===0 ? 'raster': 'layer_'+layer.layer_id
			const viewed_layer	= drawing.getLayerName(layer.layer_id)

			layer_icon.addEventListener('click', () =>{
				// get the name of the layer, if the layer is the raster we change the selector name
				const name = layer.layer_id === 0 ? 'raster': 'layer_'+layer.layer_id
				const viewed_layer = drawing.getLayerName(layer.layer_id)

				// get the transparency
				const transparency = layer.layer_id === 0 ? 0.5 : 0;
				// }else{
					// change the visibility state of the svgcanvas layer and icon
					if(layer.visible === true){
						this.active_layer	= ''
						layer.visible		= false
						drawing.setLayerOpacity(viewed_layer, transparency)
						layer_icon.classList.remove('active')
					}else{
						layer.visible		= true
						this.active_layer	= viewed_layer
						drawing.setLayerOpacity(viewed_layer, 1.0)
						layer_icon.classList.add('active')
					}
				// }
			}) //end click event

		// layer_id
			const layer_id = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'layer_id',
				parent			: layer_li,
				text_node		: layer.layer_id
			})

		// layer_name
			const user_layer_name = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'user_layer_name',
				parent			: layer_li,
				text_node		: layer.user_layer_name
			})
			// when the user has double click in the text we active the edit text box
			user_layer_name.addEventListener('dblclick', () =>{
				user_layer_name.contentEditable = true
				user_layer_name.focus();
			})
			// when the user blur the text box save the name into the layer structure
			user_layer_name.addEventListener('blur', () =>{
				user_layer_name.contentEditable = false
				// get the name of the layer, if the layer is the raster we change the selector name
				const name = layer.layer_id === 0 ? 'raster': 'layer_'+layer.layer_id
				const viewed_layer		= drawing.getLayerName(layer.layer_id)
				layer.user_layer_name	= user_layer_name.innerText
			})
			// if the user press return key = 13, we blur the text box
			user_layer_name.addEventListener('keydown', (e) =>{
				if(e.keyCode === 13) user_layer_name.blur()
			})

		// layer_delete
			const layer_delete = ui.create_dom_element({
				element_type	: 'span',
				title			: get_label.delete || 'Delete',
				class_name		: 'button remove layer_delete',
				parent			: layer_li,
				text_node		: layer.layer_delete
			})
			// show the alter with the option to select the action to do
			layer_delete.addEventListener('click', function(e){
				e.stopPropagation()

				// header
					const header = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'header label',
						text_content	: (get_label.delete || 'Delete')
					})

				// body
					const body = ui.create_dom_element({
						element_type	: 'h3',
						class_name		: 'content delete_layer',
						inner_html		: 'Layer: ' + layer.user_layer_name + '<br><br>' + (get_label.sure || 'Sure?')
					})

				// footer
					const footer = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'content footer'
					})

					// button_delete
						const button_delete = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'danger remove',
							text_content	: get_label.delete || 'Delete',
							parent			: footer
						})
						button_delete.addEventListener("click", function(){

							const viewed_layer		= drawing.setCurrentLayer(layer.name)
							// remove the layer in svgcanvas project
							stage.deleteCurrentLayer()

							//check if the user want remove transformations in raster or remove path layer
							if(layer.layer_id==0){
								// create new empty raster layer

								this.load_data(self)
								// const new_raster_layer	= {
								// 	layer_id	: 0
								// }

							}else{
								//the user want remove one path layer
								// remove the data in the instance
									// self.delete_layer(layer)
									self.ar_layers = self.ar_layers.filter(item => item.layer_id!==layer.layer_id)

								//remove the layer node
									layer_li.remove()
							}

							// close modal
								modal.on_close()
						})

				// modal
					const modal = ui.attach_to_modal({
						header	: header,
						body	: body,
						footer	: footer,
						size	: 'small' // string size big|normal
					})

				return	true
			})//end layer_delete.addEventListener("click", function(e)

		// layer_color
			const layer_color = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'layer_color',
				parent			: layer_li
			})
			layer_color.style.backgroundColor = typeof layer.layer_color!=='undefined'
				? layer.layer_color
				: 'black'
			// if the user do a double click into the color icon will be assigned the current color in the color picker
			layer_color.addEventListener("dblclick", () =>{
				layer_color.style.backgroundColor = this.active_fill_color
				layer.layer_color = this.active_fill_color
			})


	return layer_li
}//end layer_selector



// @license-end

