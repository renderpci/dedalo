/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import '../../../lib/iro/dist/iro.min.js';
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'


export const vector_editor = function(){

	this.id
	// paper vars
	this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;
	this.currentSegment = this.mode = this.type = null
	this.active_layer = null
	this.active_fill_color = null

	return true
};//end component_image




// CANVAS : INIT
vector_editor.prototype.init_canvas = async function(self) {

	// init with the dom svg object
		//object node with the save svg into the server
		const object 	= self.object_node
		// svg document inside the object tag
		const svg_doc 	= object.contentDocument;
		// Get one of the svg items by ID;
		const image 	= svg_doc.querySelector("image")
		// get the view box of the image inside the original svg
		const img 		= image.getBBox();

	// fix image size
		self.img_height	= img.height
		self.img_width	= img.width

	// fix image source (URI)
		// we need the uri of the image inside svg,
		// for select the attribute is necesary use the namespace of the attribute
		// xlink:href ; namespace for xlink = http://www.w3.org/1999/xlink, atribute href
		self.img_src 	= image.getAttributeNS('http://www.w3.org/1999/xlink','href')

	// set the self specific libraries and variables not defined by the generic init
		// load dependences js/css
			const load_promises = []
			// load paperjs library
			const lib_js_file = DEDALO_ROOT_WEB + '/lib/paper/dist/paper-full.min.js'
			load_promises.push( common.prototype.load_script(lib_js_file) )


			await Promise.all(load_promises).then(async function(response){
			})

	// canvas. create the base canvas
		self.canvas_node = ui.create_dom_element({
			id 				: self.id,
			element_type	: "canvas",
			class_name 		: 'canvas',
			parent 			: object.parentNode
		})
		// remove the original object node from dom
			event_manager.unsubscribe(object.dataset.image_change_event)
			object.remove()

		// set the resize of the canvas to be controlled by paper changes.
			self.canvas_node.setAttribute("resize", true)

			//size
			//get the current resized canvas size
			const canvas_w		= self.canvas_node.clientWidth
			const canvas_h		= self.canvas_node.clientHeight


		// hidpi. Avoid double size on canvas,(don't used)
			// canvas_node.setAttribute("hidpi","off")

		// canvas -> active canvas_height = 432px (set in the instance)
			// const context = canvas_node.getContext("2d");
			const ratio_canvas 		= self.canvas_height / self.img_height
			self.canvas_width 		= ratio_canvas * self.img_width
			self.canvas_node.height = self.canvas_height
			self.canvas_node.width  = self.canvas_width

	// paper. create the paper instance
		self.current_paper = new paper.PaperScope()
		self.current_paper.setup(self.canvas_node);
		//get the current resized canvas size

	// Paste svg clipboard to active layer
		document.addEventListener('paste', function(event) {
			// get the clipboard data
				const clipboard = event.clipboardData.getData('text/plain')
			// chck if the clipboard is a svg data
				if ( clipboard.indexOf('<svg version="')!=-1 ) {

					const pasted_svg = self.current_paper.project.importSVG( clipboard )
					pasted_svg.clipped = true;

					// optional: remove the clipped path
						// pasted_svg.clipped = false;
						// pasted_svg.children[0].remove()
						// pasted_svg.parent.insertChildren(pasted_svg.index,pasted_svg.removeChildren());
						// pasted_svg.remove();
			}
		})

		document.addEventListener('copy', function (event) {
			//copy the path and convert to svg to export in the clipboard
				event.preventDefault();
				const project_svg = project.exportSVG({asString:true,precision:3})
				if (event.clipboardData) {
					event.clipboardData.setData('text/plain', project_svg);
				} else if (window.clipboardData) {
					window.clipboardData.setData('Text', project_svg);
				}
		});

	// create the main layer
		// main layer is the layer that define the area to be croped.
		const main_layer	= new self.current_paper.Layer();
		main_layer.name = 'main';

		// create a rectangle wiht the canvas size to be used as crop reference.
		const size = new self.current_paper.Size ({
				width: (ratio_canvas * self.img_width) +2,
				height: (self.canvas_height) +2
			});
		const top_left = new self.current_paper.Point(-1, -1)

			const main_canvas_area = new self.current_paper.Path.Rectangle({
				point: top_left,
				size: size,
				strokeColor: 'black'
			});
			self.current_paper.project.deselectAll();
			main_canvas_area.name = 'main_area'

	// subscription to the full_sreen change event
	// the event will send fullscreen boolean option, true or false, true: paper is in fullscreen, false: paper is in the edit window
		self.events_tokens.push(
			event_manager.subscribe('full_screen_'+self.id,  full_screen_change)
		)
		function full_screen_change (fullscreen_state) {
			// when paper is in edit we set canvas to the original canvas size
			if(!fullscreen_state){
				self.canvas_node.height = self.canvas_height
				self.canvas_node.width  = self.canvas_width
			}

			//get the current resized canvas size
			//set the paper view size to the canvas size
			self.current_paper.project.view.setViewSize(self.canvas_node.clientWidth, self.canvas_node.clientHeight)

			// set the scaling ratio (1 for edit window, calculate when is in fullscreen)
			const ratio = fullscreen_state === true
				? (self.current_paper.view.size._height / self.canvas_height) * 0.8
				: 1

			// set the new scale ratio to paper view
			self.current_paper.view.setScaling(ratio)

			// move the scene to the center of the canvas
			const delta_x =  self.canvas_width /2
			const delta_y =  self.canvas_height /2
			self.current_paper.view.setCenter(delta_x, delta_y)

			return
		}// end full_screen_change

	return true
};//end init_canvas



/**
* INIT_TOOLS
* init paper tools
*/
vector_editor.prototype.init_tools = function(self){

	// paper. Curent paper vars
		const project 	= self.current_paper.project
		const Layer   	= self.current_paper.Layer
		const Color   	= self.current_paper.Color
		const Tool    	= self.current_paper.Tool
		const Point   	= self.current_paper.Point
		const Size    	= self.current_paper.Size
		const Path    	= self.current_paper.Path
		const Raster 	= self.current_paper.Raster

		this.active_fill_color = new Color({
					hue: 360,
					saturation: 1,
					brightness: 1,
					alpha: 0.3,
				});

	// rectangle
		this.rectangle = new Tool();
			this.rectangle.onMouseDown = (event) => {
				// Reset vars
				this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;
				project.deselectAll();
			}
			this.rectangle.onMouseDrag = (event) => {
				// desactivate the tool when the user try to create the path into raster layer
				if(project.activeLayer.name === 'raster'|| project.activeLayer.name==='main') return;

				const size = new Size ({
					width: event.point.x - event.downPoint.x,
					height: event.point.y - event.downPoint.y
				});

				const rectangle_path = new Path.Rectangle({
					point: event.downPoint,
					size: size,
					fillColor: this.active_fill_color,
					strokeColor: 'black'
				});

				// Remove this path on the next drag event:
				rectangle_path.removeOnDrag();
			}
			this.rectangle.onMouseUp = (event) => {
				if(project.activeLayer.name === 'raster' || project.activeLayer.name==='main') return;
				// update the instance with the new layer information, prepared to save
				// (but is not saved directly, the user need click in the save button)
				self.update_draw_data()
			}

	// circle
		this.circle = new Tool();
			this.circle.onMouseDown = (event) => {
				// Reset vars
				this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;
				project.deselectAll();
			}
			this.circle.onMouseDrag = (event) => {
				// desactivate the tool when the user try to create the path into raster layer
				if(project.activeLayer.name === 'raster' || project.activeLayer.name==='main') return;

				const radio_delta = new Point({
					x: event.downPoint.x - event.point.x,
					y: event.downPoint.y - event.point.y,
				})

				const circle_path = new Path.Circle({
					center 		: event.downPoint,
					radius 		: radio_delta.length,
					fillColor 	: this.active_fill_color,
					strokeColor : 'black'
				})

				// Remove this path on the next drag event:
				circle_path.removeOnDrag()
			}
			this.circle.onMouseUp = (event) => {
				if(project.activeLayer.name === 'raster' || project.activeLayer.name==='main') return;
				// update the instance with the new layer information, prepared to save
				// (but is not saved directly, the user need click in the save button)
				self.update_draw_data()
			}

	// pointer
		this.pointer = new Tool();
			this.pointer.onMouseDown = (event) => {
				// Reset vars
				if (this.path != null) {
						this.path.bounds.selected = false
						this.path.data.state = null
				}
				this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;
				project.deselectAll()
				//project.activeLayer.selected = false;
				const hitResult = project.hitTest(event.point, { fill: true, stroke: true, segments: true, tolerance: 5, handles: true });

				if(SHOW_DEBUG===true) {
					console.log("[init_tools] hitResult:",hitResult);
				}
				if (hitResult) {
					//remove all behavior if the click is in the main_area rectangle, deselect all.
					if(hitResult.item.name === 'main_area') return;
					this.path = hitResult.item
					switch(hitResult.type) {

						case ('fill'):
							project.deselectAll()
							this.path.layer.activate()
							this.active_layer = project.activeLayer
							event_manager.publish('active_layer_'+self.id, this.active_layer)
							this.set_color_picker(this.path)

							if (event.modifiers.shift) {
								hitResult.item.remove()
							}

							this.path.selected = true;
							this.movePath = hitResult.type == 'fill'
							break;

						case ('pixel'):
							project.deselectAll();
							project.activeLayer.selected = false;
							break;

						case ('segment'):
							project.deselectAll();

							this.path.fullySelected = true;
							this.segment = hitResult.segment;
							if (event.modifiers.shift) {
								hitResult.segment.remove();
							}
							if (event.modifiers.option) {
								if(this.segment.hasHandles()){
									hitResult.segment.clearHandles();
								}
								this.handle_sync	= hitResult.segment.handleIn;
								this.handleIn 		= hitResult.segment.handleIn;
								this.handleOut 		= hitResult.segment.handleOut;
								this.segment 		= "";
							}
							//segment = hitResult.segment
							break;

						case ('stroke'):
							project.deselectAll()
							this.path.fullySelected = true;
							this.path.selected = true;
							this.movePath = 'fill'
							// const location = hitResult.location;
							// this.segment = this.path.insert(location.index +1, event.point);
							//path.smooth();
							break;

						case ('handle-in'):
							this.handle = hitResult.segment.handleIn;
							if (event.modifiers.option) {
								this.handle_sync = hitResult.segment.handleIn;
								this.handleIn = hitResult.segment.handleIn;
								this.handleOut = hitResult.segment.handleOut;
								//this.handle = "";
							}
							break;

						case ('handle-out'):
							this.handle = hitResult.segment.handleOut;
							if (event.modifiers.option) {
								this.handle_sync = hitResult.segment.handleOut;
								this.handleIn = hitResult.segment.handleOut;
								this.handleOut = hitResult.segment.handleIn;
								//this.handle = "";
							}
							break;

						default:
							console.log("Ignored hitResult.type :", hitResult.type)
							break;
					};//end switch
					//console.log(hitResult.type);
				}
				/*if (movePath)
				project.activeLayer.addChild(hitResult.item);*/
			}
			this.pointer.onMouseDrag = (event) => {
				if (this.handle){
					this.handle.x += event.delta.x;
					this.handle.y += event.delta.y;
				}
				if (this.handle_sync){
					this.handleIn.x += event.delta.x;
					this.handleIn.y += event.delta.y;
					this.handleOut.x -= event.delta.x;
					this.handleOut.y -= event.delta.y;
				}
				if (this.segment) {
					this.segment.point.x = event.point.x;
					this.segment.point.y = event.point.y;
				}
				if (this.movePath){
					this.path.position.x += event.delta.x;
					this.path.position.y += event.delta.y;
				}
			}
			this.pointer.onKeyUp = (event) => {
				if (event.key==="backspace" || event.key==="delete"){
					//console.log(event.key);
					const seleccionados = project.selectedItems;
					//console.log(seleccionados);
					const sec_len = seleccionados.length
					for (let i = sec_len - 1; i >= 0; i--) {
						seleccionados[i].remove()
						this.segment = this.path = null;
					}
				}
			}
			this.pointer.onMouseUp = (event) => {
				// update the instance with the new layer information, prepared to save
				// (but is not saved directly, the user need click in the save button)
				self.update_draw_data()
			}

	// transform
		this.transform = new Tool();
			this.transform.onMouseDown = (event) => {
				// Reset vars
				if (this.path != null) {
					this.path.bounds.selected = false
					this.path.data.state = null
				}
				this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;
				//project.activeLayer.selected = false;
				const hitResult = project.hitTest(event.point , { fill: true, stroke: true, segments: true, tolerance: 5, bounds: true });
				if (hitResult) {
					//remove all behavior if the click is in the main_area rectangle, deselect all.
					if(hitResult.item.name === 'main_area') return;
					this.path = hitResult.item

					// the image can be resized only the parent layer
						if(typeof hitResult.item.image != 'undefined'){
							this.path = hitResult.item.layer
							this.path.activate()
							this.path.selected = true;

						}else{
							project.deselectAll()
							this.set_color_picker(this.path)
							this.path.layer.activate()
							this.path.bounds.selected = true;
						}

					this.active_layer = project.activeLayer
					event_manager.publish('active_layer_'+self.id, this.active_layer)

					switch(hitResult.type) {
						case ('bounds'):
							console.log("this.path:",this.path);
							// this.path.bounds.selected = true;
							if (event.modifiers.option) {
								this.path.data.state 		= 'rotate'
							}else{
								this.path.data.state 		= 'scale'
								this.path.data.bounds 		= this.path.bounds.clone();
								this.path.data.scale_base 	= event.point.subtract(this.path.bounds.center)
							}
						break;

						case ('segment'):
						case ('fill'):
						case ('pixel'):
							this.path.data.state 		= 'move'
							// this.path.bounds.selected	= true;
							break;
					}
				}
			}
			this.transform.onMouseDrag = (event) => {
				// if we select main layer or other forbiden paths, desactive the drag
				if (this.path === null || this.path.data.state === null)return
				if (this.path.data.state === 'scale'){
					 // scale by distance from down point
					const bounds = this.path.data.bounds;
					// get the scale from current bounds center to the original bounds center
					const scale = event.point.subtract(bounds.center).length / this.path.data.scale_base.length;
					// create the points from top_left and botton_right
					const top_left 		= bounds.topLeft.subtract(bounds.center).multiply(scale);
					const botton_right 	= bounds.bottomRight.subtract(bounds.center).multiply(scale);
					// create the new bounds
					const new_bounds 	= new self.current_paper.Rectangle(top_left.add(bounds.center), botton_right.add(bounds.center));
					this.path.bounds 	= new_bounds;

					return;
				}else if(this.path.data.state === 'rotate'){
					// the last two points.
					const center 	= this.path.bounds.center;
					const base 		= new self.current_paper.Point(center.x - event.lastPoint.x, center.y - event.lastPoint.y)
					const actual 	= new self.current_paper.Point(center.x - event.point.x, center.y - event.point.y)

					const angle 	= actual.angle - base.angle
					this.path.rotation = angle;

					return;
				}else if (this.path.data.state === 'move'){
					this.path.position.x += event.delta.x;
					this.path.position.y += event.delta.y;

				}
			}
			this.transform.onMouseUp = (event) => {
				// update the instance with the new layer information, prepared to save
				// (but is not saved directly, the user need click in the save button)
				self.update_draw_data()
			}

	// vector
		this.vector = new Tool()
			this.vector.onMouseDown = (event) => {
				// Reset vars
				this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;

				//project.activeLayer.selected = false;
				const hitResult = project.hitTest(event.point, { fill: true, stroke: true, segments: true, tolerance: 5, handles: true });

				if(SHOW_DEBUG===true) {
					console.log("[init_tools] hitResult:",hitResult);
						console.log("project.activeLayer.name:",project.activeLayer.name);
				}
				if (hitResult) {
					//remove all behavior if the click is in the main_area rectangle or the raster layer, deselect all.
					if(hitResult.item.name === 'main_area' || project.activeLayer.name === 'raster' || project.activeLayer.name ==='main') return;
					this.path = hitResult.item
					switch(hitResult.type) {

						case ('fill'):
							project.deselectAll()
							this.path.layer.activate()
							this.active_layer = project.activeLayer
							event_manager.publish('active_layer_'+self.id, this.active_layer)
							this.set_color_picker(this.path)

							if (event.modifiers.shift) {
								hitResult.item.remove()
							}

							this.path.selected 	= true;
							this.movePath = hitResult.type == 'fill'
							this.new_path 		= false
							break;

						case ('pixel'):
							project.deselectAll();

							if (!this.new_path) {
								this.new_path = new Path({
									strokeColor : 'black',
									fillColor : this.active_fill_color
								});
								this.new_path.fullySelected	= true;
								this.segment = this.new_path.add(event.point);
								// this.segment = event.point
							}else{
								this.new_path.fullySelected	= true;
								this.segment = this.new_path.add(event.point);
							}
							if (event.modifiers.option) {
								if(this.segment.hasHandles()){
									this.segment.clearHandles();
								}
								this.handle_sync 	= this.segment.handleIn;
								this.handleIn 		= this.segment.handleIn;
								this.handleOut 		= this.segment.handleOut;
								this.segment.selected = true;
								this.segment 		= "";
							}

							break;
						case ('segment'):
							project.deselectAll();

							this.path.fullySelected = true;
							this.path.closed 		= true;
							this.new_path 			= false
							this.segment 			= hitResult.segment;
							if (event.modifiers.shift) {
								hitResult.segment.remove();
							}
							if (event.modifiers.option) {
								if(this.segment.hasHandles()){
									hitResult.segment.clearHandles();
								}
								this.handle_sync 	= hitResult.segment.handleIn;
								this.handleIn 		= hitResult.segment.handleIn;
								this.handleOut 		= hitResult.segment.handleOut;
								this.segment 		= "";
							}
							//segment = hitResult.segment
							break;

						case ('stroke'):
							this.path.fullySelected = true;
							const location	= hitResult.location;
							this.segment 	= this.path.insert(location.index +1, event.point);
							this.new_path 	= false
							//path.smooth();
							break;

						case ('handle-in'):
							this.handle = hitResult.segment.handleIn;
							if (event.modifiers.option) {
								this.handle_sync 	= hitResult.segment.handleIn;
								this.handleIn 		= hitResult.segment.handleIn;
								this.handleOut 		= hitResult.segment.handleOut;
								//this.handle = "";
							}
							break;

						case ('handle-out'):
							this.handle = hitResult.segment.handleOut;
							if (event.modifiers.option) {
								this.handle_sync 	= hitResult.segment.handleOut;
								this.handleIn 		= hitResult.segment.handleOut;
								this.handleOut 		= hitResult.segment.handleIn;
								//this.handle = "";
							}
							break;

						default:
							console.log("Ignored hitResult.type :", hitResult.type)
							break;
					};//end switch
					//console.log(hitResult.type);
				}
				/*if (movePath)
				project.activeLayer.addChild(hitResult.item);*/
			}
			this.vector.onMouseDrag = (event) => {
				if (this.handle){
					this.handle.x += event.delta.x;
					this.handle.y += event.delta.y;
				}
				if (this.handle_sync){
					this.handleIn.x += event.delta.x;
					this.handleIn.y += event.delta.y;
					this.handleOut.x -= event.delta.x;
					this.handleOut.y -= event.delta.y;
				}
				if (this.segment) {
					this.segment.point.x = event.point.x;
					this.segment.point.y = event.point.y;
					//path.smooth();
				}
				if (this.movePath){
					this.path.position.x += event.delta.x;
					this.path.position.y += event.delta.y;
				}
			}
			this.vector.onMouseUp = (event) => {
				if(project.activeLayer.name === 'raster' || project.activeLayer.name==='main') return;
				// update the instance with the new layer information, prepared to save
				// (but is not saved directly, the user need click in the save button)
				self.update_draw_data()
			}

	// zoom
		this.zoom = new Tool()
		this.zoom.onMouseDown = (event) => {
			// Reset vars
			this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;
			project.deselectAll();
		}

		this.zoom.onMouseDrag = (event) => {
			//ratio of zoom
			const zoom_factor = 0.03
			// if the mouse is 0 get 1 else get the 1 or -1
			const y = Math.sign(event.delta.y) === 0 ? 1 : Math.sign(event.delta.y)
			// add to the zoom_fator to obtain the factor if y=1 get 1.03 else get 0.97
			const ratio = Math.abs(zoom_factor + y)
			// set the scale with the ratio and the mouse pointer
			// main.scale(ratio, new Point(event.point.x, event.point.y))
			project.view.scale(ratio, new Point(event.point.x, event.point.y))
		}

	// move
		this.move = new Tool()
		this.move.onMouseDown = (event) => {
			// Reset vars
			this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;
			project.deselectAll();
		}

		this.move.onMouseDrag = (event) => {
			//get the diference (delta) of the first click point and the current posistion of the mouse
			const delta = event.downPoint.subtract(event.point)
			// scroll the view to the position
			project.view.scrollBy(delta)
		}

	return true
};//end init_tools



/**
* RENDER_TOOLS_BUTTONS
*/
vector_editor.prototype.render_tools_buttons = function(self){

	// Tool buttons. Show
		const view 		= self.current_paper.view
		const buttons_container = self.vector_editor_tools
		buttons_container.classList.remove("hide")

	// vector editor tools
		const buttons = []

			// layer selector
				const layer_selector_button = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button open_layer_selector',
					parent 			: buttons_container,
				})

				const layer_selector_container = ui.create_dom_element({
					element_type	: 'div',
					parent 			: buttons_container,
				})

				layer_selector_button.addEventListener("mouseup", (e) =>{
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
					layer_selector_button.innerHTML = active_layer.data.layer_id
				}

			// pointer
				const pointer = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button pointer_alt',
					parent 			: buttons_container
				})
				pointer.addEventListener("mouseup", (e) =>{
					this.pointer.activate()
					activate_status(pointer)
				})
				buttons.push(pointer)

			// transform
				const transform = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button pointer',
					parent 			: buttons_container
				})
				transform.addEventListener("mouseup", (e) =>{
					this.transform.activate()
					activate_status(transform)
				})
				buttons.push(transform)

			// rectangle
				const rectangle = ui.create_dom_element({

					element_type	: 'span',
					class_name 		: 'button rectangle',
					parent 			: buttons_container
				})
				rectangle.addEventListener("mouseup", (e) =>{
					this.rectangle.activate()
					activate_status(rectangle)
				})
				buttons.push(rectangle)

			// circle
				const circle = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button circle',
					parent 			: buttons_container
				})
				circle.addEventListener("mouseup", (e) =>{
					this.circle.activate()
					activate_status(circle)
				})
				buttons.push(circle)

			// vector
				const vector = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button vector',
					parent 			: buttons_container
				})
				vector.addEventListener("mouseup", (e) =>{
					this.vector.activate()
					activate_status(vector)
				})
				buttons.push(vector)

			// zoom
				const zoom = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button tool zoom',
					parent 			: buttons_container
				})
				zoom.addEventListener("mouseup", (e) =>{
					this.zoom.activate()
					activate_status(zoom)
				})
				zoom.addEventListener("dblclick", (e) =>{

					const ratio = self.node[0].classList.contains('fullscreen')
						? (self.canvas_node.clientHeight  / self.canvas_height) * 0.8
						: 1
							console.log("ratio:",ratio);
						self.current_paper.view.setScaling(ratio)

						const delta_x =  self.canvas_width /2
						const delta_y =  self.canvas_height /2
						self.current_paper.view.setCenter(delta_x, delta_y)

				})

				// zoom.addEventListener('wheel', (e) =>{

				// })
				buttons.push(zoom)

			// move
				const move = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button tool move',
					parent 			: buttons_container
				})
				move.addEventListener("mouseup", (e) =>{
					this.move.activate()
					activate_status(move)
				})
				move.addEventListener("dblclick", (e) =>{
					const delta_x =  self.canvas_width /2
					const delta_y =  self.canvas_height /2
					self.current_paper.view.setCenter(delta_x, delta_y)
				})
				buttons.push(move)

			// save
				const save = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button tool save',
					parent 			: buttons_container
				})
				save.addEventListener("mouseup", (e) =>{
					self.node[0].classList.remove('fullscreen')
					event_manager.publish('full_screen_'+self.id, false)
					// update the instance with the new layer information, prepared to save
					self.update_draw_data()
					// save all data layers
					self.change_value({
						changed_data : self.data.changed_data,
						refresh 	 : false
					})
					.then((save_response)=>{
						// event to update the dom elements of the instance
						event_manager.publish('update_value_'+self.id, self.data.changed_data)
					})

					activate_status(save)
				})
				buttons.push(save)

			// color_picker
				this.button_color_picker = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button tool button_color_picker',
					parent 			: buttons_container
				})

					const color_wheel_contaniner = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'hide color_wheel_contaniner',
						parent 			: buttons_container
					})

					this.color_picker = new iro.ColorPicker(color_wheel_contaniner, {
							// Set the size of the color picker
							width: 160,
							// Set the initial color to paper project color
							color: "#f00",
							// color wheel will not fade to black when the lightness decreases.
							wheelLightness: false,
							transparency: true,
							layout: [
								{
									component: iro.ui.Wheel, //can be iro.ui.Box
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
				this.button_color_picker.addEventListener("mouseup", (e) =>{
					color_wheel_contaniner.classList.toggle('hide')
				})
				// color:change event callback
				// color:change callbacks receive the current color and a changes object
				const color_selected = (color, changes) =>{
					if(this.path !== null){
						this.path.fillColor = color.hex8String
					}
					this.active_fill_color = new self.current_paper.Color(color.hex8String)
					this.button_color_picker.style.backgroundColor = color.hexString
					// update the instance with the new layer information, prepared to save
					// (but is not saved directly, the user need click in the save button)
					self.update_draw_data()
					// event_manager.publish('color_change_'+this.active_layer.data.layer_id, color.hex8String)
				}

				// listen to a color picker's color:change event
				this.color_picker.on('color:change', color_selected);

		//change the buttons status: active, desactive
			const activate_status = (button) =>{
				const buttons_lenght = buttons.length
				for (let i = 0; i < buttons_lenght; i++) {
					const current_buton = buttons[i]
					current_buton.classList.remove('vector_tool_active')
				}
				button ? button.classList.add('vector_tool_active') : null
			}

		// first load activate pointer
			this.pointer.activate()
			activate_status(pointer)

	return true
};//end render_tools_buttons



/**
* SET_COLOR_PICKER
* get the color of the current active layer to set to the color picker and the button color picker
* @return
*/
vector_editor.prototype.set_color_picker = function(item){

	// get the item selected color
		this.active_fill_color = item.fillColor
	// convert it to css nomenclature
		const color = this.active_fill_color.toCSS()
	// set the icon of color picker with the selected path color
		this.button_color_picker.style.backgroundColor = color
	// set the color picker with the selected path color
		this.color_picker.color.rgbaString = color

};//end set_color_picker



/**
* LOAD_LAYER
* get the layers loaded and show into window
* @return
*/
vector_editor.prototype.load_layer = function(self, layer) {

	// curent paper vars
		const project 		= self.current_paper.project
		const Layer   		= self.current_paper.Layer
		const Color   		= self.current_paper.Color

	// set the layer data
		const layer_id		= layer.layer_id
		const layer_data	= layer.layer_data
		const layer_name	= layer_id === 0 ? 'raster' : 'layer_' +layer_id

	// if the layer don't has layer_color, create a new layer color for selectors and handlers
		const layer_color = typeof layer.layer_color !== 'undefined'
			? layer.layer_color
			: new Color({
							hue: 360 * Math.random(),
							saturation: 1,
							brightness: 1,
							alpha: 1,
						}).toCSS()

		layer.layer_color = layer_color

	//layer import
		if ( layer_data.indexOf('Layer')!=-1 ) {
			const project_len = project.layers.length
			for (let i = project_len - 1; i >= 0; i--) {
				if (project.layers[i].name===layer_name){
					project.layers[i].remove();
						console.log("-> layer delete: ", layer_name);
				}
			}
			// impor the layer to paper project
			const current_layer = project.importJSON(layer_data)
			// set the selected color to the layer_color
			current_layer.selectedColor = layer_color;
			// set the alpha of the color to 1... don't used, the user can change it.
			// current_layer.selectedColor.alpha = 1
			// set the id of Dédalo data
			current_layer.data.layer_id 		= layer_id
			// set the user layer name to default layer_name (layer_2)
			current_layer.data.user_layer_name 	= layer_name
			// set the layer_name to the current layer when don't match (old layer_name formats like 5_layer)
			if(current_layer.name !== layer_name){
				current_layer.name = layer_name
			}
			current_layer.activate();
			console.log("-> layer import: ", layer_name);

		}else{
			let create_new_current_layer = true
			// Check if the layer is loaded, if the layer is loaded will be reused.
			const project_len = project.layers.length
			for (let i = project_len - 1; i >= 0; i--) {
				if (project.layers[i].name === layer_name){
					const current_layer 	= project.layers[i];
					current_layer.activate();
					create_new_current_layer = false;
					console.log("-> using existing current_layer: ", current_layer.name);
					break;
				}
			};//end for
			if (create_new_current_layer === true) {
				const current_layer 	= new Layer()
					// set the name to the paper layer name
					current_layer.name 					= layer_name
					// set the id of Dédalo data
					current_layer.data.layer_id 		= layer_id
					// set the user layer name to default layer_name (layer_2)
					current_layer.data.user_layer_name 	= layer_name
					// set the layer in the self.ar_layer_loaded the curennt layer name (layer_2)
					layer.user_layer_name 				= layer_name
					// set the selectedColor for paper
					current_layer.selectedColor 		= layer_color
					// set the user layer color in the data for save it.
					current_layer.data.layer_color 		= layer_color
				current_layer.activate();
				// create the raster layer
					if(layer_id===0){
						this.create_raster_layer(self)
						// current_layer.applyMatrix = false
					}

				console.log("-> create new layer: " , current_layer);
			}// end if

		};// end else

		// set the global handle margin
		project.options.handleSize = 8;

		// suscribe the raster layer to change the quality of the image (original, 1.5MB,...)
		if(layer_id===0){
			// get the current raster item
			const raster = project.activeLayer.firstChild
			// subscription to the image quality change event
			self.events_tokens.push(
				event_manager.subscribe('image_quality_change_'+self.id,  img_quality_change)
			)
			function img_quality_change (img_src) {
				// get the current raster layer bounds and save it for apply later
					const layer_bounds	= raster.layer.bounds
				// change the value of the current raster element
					raster.source = img_src
					raster.onLoad = function(e) {
						// new image ratio (1200 / new image height)
						const ratio 			= self.img_view_height / raster.height
						// scale the raster to new ratio
						raster.setScaling(ratio)
						// apply the original layer bounds to the new layer situation
						raster.layer.bounds = layer_bounds
				}// end onLoad
			};//end img_quality_change
		};//end if layer_id==0

		// Bring the main layer with the crop reference to to top of the layers
		const main_layer = project.layers['main']
		main_layer.bringToFront()

		// Send the raster layer to the back of the layers
		const raster_layer = project.layers['raster']
		raster_layer.sendToBack()
	return true
};//end load_layer



/**
* CREATE_RASTER_LAYER
* get the layers loaded and show into window
* @return
*/
vector_editor.prototype.create_raster_layer = function(self){

	// fixed height for the image
	// get the image height with fixed 1200px and set the view_width
	// this fixed height is used for change the quality o the image and don't move the bounds of the image.
		const ratio 		= self.img_view_height / self.img_height
		const view_width	= ratio * self.img_width

	// scale raster layer
	// get the ratio for the scale the project layer to fit to canvas view heigth
	// used to fix the raster layer to the canvas height
		const canvas_h		= self.canvas_node.clientHeight
		const ratio_layer 	= canvas_h / self.img_view_height

	// create the image in the raster layer
		const raster = new self.current_paper.Raster({
			source		: self.img_src,
			position	: self.current_paper.view.center,
		});

	// scale the image to fixed heigth: 1200px
		raster.setScaling(ratio)
	// also scale the layer of the raster to be exact to the canvas bounds.
		raster.layer.scale(ratio_layer, self.current_paper.view.center)

	return raster
};//end create_raster_layer



vector_editor.prototype.activate_layer = function(self, layer, load=full) {

	// curent paper
		const project 			= self.current_paper.project
	// set the active layer and his visibility
		// get the paper layer name
		const name 				= layer.layer_id === 0 ? 'raster': 'layer_'+layer.layer_id
		// get the paper project layer
		const new_active_layer 	= project.layers[name]
		// activavet the new active layer
		new_active_layer.activate()
		// set the global active_layer with the new active layer
		this.active_layer 	= project.activeLayer
		// publish the change
		event_manager.publish('active_layer_'+self.id, this.active_layer)
		if(load==='layer'){
			const ar_layers = project.layers
			for (let i = 0; i < ar_layers.length; i++) {
				const current_layer = ar_layers[i]
				current_layer.name !== 'raster'
				? current_layer.visible = false
				: current_layer.visible = true
			}
		}
		// set the visibility of the layer
		this.active_layer.visible = true


		// redraw the project
		project.view.draw();
		// deselect all paths
		project.deselectAll();
}


/**
*  LAYER_SELECTOR
* @return
*/
vector_editor.prototype.render_layer_selector = function(self){

	// get the layers loaded in the image instance
	const ar_layers = self.ar_layer_loaded

	const fragment = new DocumentFragment()
	// add button
		const add_layer = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'button add',
			parent 			: fragment,
		})
		add_layer.addEventListener("click", (e) =>{
			// add the data in the instance
			const layer_id 	= self.add_layer()
			const new_layer = self.ar_layer_loaded.find((item) => item.layer_id === layer_id)
			const layer_li 	= this.render_layer_row(self, new_layer)
			// layer_ul.appendChild(layer_li)
			layer_ul.insertBefore(layer_li, layer_ul.firstChild)
		})

	// close button
		const close = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'button close',
			parent 			: fragment,
		})
		close.addEventListener("click", (e) =>{
			e.preventDefault()
			layer_selector.remove()
		})

	// rows container
		const layer_ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'layer_ul',
			parent 			: fragment
		})

		// load the layer into the layer box
		for (var i =  ar_layers.length - 1; i >= 0; i--) {
		// for (let i = 0; i < ar_layers.length; i++) {
			const layer = ar_layers[i]
			const layer_li = this.render_layer_row(self, layer)
			layer_ul.appendChild(layer_li)

		};//end for

	// layer_selector
		const layer_selector = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'layer_selector',
				})
		layer_selector.appendChild(fragment)

	return layer_selector
};//end layer_selector



/**
*  LAYER_SELECTOR
* @return
*/
vector_editor.prototype.render_layer_row = function(self, layer){

	const project = self.current_paper.project

	// layer_container
		const layer_li = ui.create_dom_element({
			element_type	: 'li',
			class_name 		: 'li'
		})
		layer_li.addEventListener("click", (e) =>{
			project.deselectAll()
			// prevent the selection of the raster layer
			// (it can't be selected and used in the same form that other layers)
				if(layer.layer_id===0)return

			// get the paper layer name
			const name = 'layer_'+layer.layer_id
			const new_active_layer = project.layers[name]
			 // if we don't has the layer loaded, we load now
			if(typeof new_active_layer === 'undefined'){
				this.load_layer(self, layer)
			}else{
				new_active_layer.activate()
				this.active_layer = project.activeLayer
				event_manager.publish('active_layer_'+self.id, new_active_layer)
			}

		})
		// set the raster layer with specific class to remove css behavior (hover...)
		if(layer.layer_id===0){
				layer_li.classList.add('raster_layer')
		}

		// set the active layer, remove the raster layer to the active option
		layer.layer_id === this.active_layer.data.layer_id && layer.layer_id != 0
			? layer_li.classList.add('active')
			: layer_li.classList.remove('active')

		// when we change the active layer, the other layers will be innactived
				self.events_tokens.push(
					event_manager.subscribe('active_layer_'+self.id, change_layer)
				)
				function change_layer(active_layer) {
					layer.layer_id === active_layer.data.layer_id
						?	layer_li.classList.add('active')
						:	layer_li.classList.remove('active')
				};//end change_layer

		// layer_icon
			const layer_icon = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button eye layer_icon',
				parent 			: layer_li,
				text_node		: layer.layer_icon
			})
			// select the layer in paper, if the layer is the raster we change the selector name
			const name = layer.layer_id === 0 ? 'raster': 'layer_'+layer.layer_id
			const viewed_layer = project.layers[name]
			// toogle the class active to the icon
			typeof viewed_layer !== 'undefined' && layer.layer_id === viewed_layer.data.layer_id
				? layer_icon.classList.add('active')
				: layer_icon.classList.remove('active')

			layer_icon.addEventListener("click", (e) =>{
				// get the name of the layer, if the layer is the raster we change the selector name
				 const name = layer.layer_id === 0 ? 'raster': 'layer_'+layer.layer_id
				 const viewed_layer = project.layers[name]
				 // if we don't has the layer loaded, we load now
				if(typeof viewed_layer === 'undefined'){
					this.load_layer(self,layer)
					layer_icon.classList.add('active')
					this.active_layer = viewed_layer
				}else{
					// change the visibility state of the paper layer and icon
					if(viewed_layer.visible === true){
						this.active_layer = ''
						viewed_layer.visible = false
						layer_icon.classList.remove('active')
					}else{
						viewed_layer.visible = true
						layer_icon.classList.add('active')
						this.active_layer = viewed_layer
					}
				}
			}) //end click event


		// layer_id
			const layer_id = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'layer_id',
				parent 			: layer_li,
				text_node		: layer.layer_id
			})

		// layer_name
			const user_layer_name = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'user_layer_name',
				parent 			: layer_li,
				text_node		: layer.user_layer_name
			})
			// when the user has double click in the text we active the edit text box
			user_layer_name.addEventListener("dblclick", (e) =>{
				user_layer_name.contentEditable = true
				user_layer_name.focus();
			})
			// when the user blur the text box save the name into the layer structure
			user_layer_name.addEventListener("blur", (e) =>{
				user_layer_name.contentEditable = false
				// get the name of the layer, if the layer is the raster we change the selector name
				const name = layer.layer_id === 0 ? 'raster': 'layer_'+layer.layer_id
				const viewed_layer = project.layers[name]
				viewed_layer.data.user_layer_name = user_layer_name.innerText
				// update the data into the instance, prepared to save
				// (but is not saved directly, the user need click in the save button)
				self.update_draw_data()
			})
			// if the user press return key = 13, we blur the text box
			user_layer_name.addEventListener("keydown", (e) =>{
				if(e.keyCode === 13) user_layer_name.blur()
			})

		// layer_delete
			const layer_delete = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button remove layer_delete',
				parent 			: layer_li,
				text_node		: layer.layer_delete
			})
			// show the alter with the option to select the action to do
			layer_delete.addEventListener("click", function(e){

				const dialog = ui.create_dialog({
					element_id 		: self.id,
					title			: 'Borrar...',
					msg				: '¿seguro que desea borrar?',
					header_class	: 'light',
					body_class 		: 'light',
					footer_class 	: 'light',
					user_options	:[{
						id 			: 1,
						label 		: 'si',
						class_name 	: 'success'
					},{
						id 			: 2,
						label 		: 'no',
						class_name 	: 'warning'
					},{
						id 			:3,
						label 		: 'cancelar',
						class_name 	: 'light'
					}]
				})
				// create the response event of the alert
				const event = event_manager.subscribe('user_option_'+self.id, (user_option))
				self.events_tokens.push( event )
				function user_option(user_option) {
					// success, any other option will be ignored
					if(user_option===1){
						// get the layer in paper, we change the name if the layer is the raster layer
						const name = layer.layer_id === 0 ? 'raster': 'layer_'+layer.layer_id
						const delete_layer = project.layers[name]
						// remove the layer in paper project
						delete_layer.remove()

						//check if the user want remove transformations in raster or remove path layer
						if(layer.layer_id === 0){
							// create new empty raster layer
							const new_raster_layer	= {
								layer_id 	:0,
								layer_data 	:[]
							}
							// load new raster layer into paper
							self.vector_editor.load_layer(self, new_raster_layer)
							// active the raster layer in the project
							project.layers['raster'].activate()
							// update the instance with the new layer information, prepared to save
							// (but is not saved directly, the user need click in the save button)
							self.update_draw_data()

						}else{
							//the user want remove one path layer
							// remove the data in the instance
								self.delete_layer(layer)
							// remove the this event in the instance
								event_manager.unsubscribe(event)
							//remove the layer node
								layer_li.remove()
							// active the raster layer in the project
							// it will by used for the next action in the vector editor
							// if don't active one layer, paper can't save the changes (it has one delete layer active)
								project.layers['raster'].activate()
						}
					}
				}

			})

		// layer_color
			const layer_color = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'layer_color',
				parent 			: layer_li,
			})
			layer_color.style.backgroundColor = typeof layer.layer_color !== 'undefined'
				? layer.layer_color
				: 'black'
			// if the user do a doble click into the color icon will be assigned the current color in the color picker
			layer_color.addEventListener("dblclick", (e) =>{
				layer_color.style.backgroundColor = this.active_fill_color.toCSS()
				layer.layer_color = this.active_fill_color.toCSS()
			})


	return layer_li
};//end layer_selector
