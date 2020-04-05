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
}//end component_image




// CANVAS : INIT
vector_editor.prototype.init_canvas = async function(self) {

	//img node
		const img 		= self.image_node
	// fix image size
		self.img_height	= img.naturalHeight
		self.img_width	= img.naturalWidth
	// fix image source (URI)
		self.img_src 	= img.src

	// set the self specific libraries and variables not defined by the generic init
		// load dependences js/css
			const load_promises = []

			const lib_js_file = DEDALO_ROOT_WEB + '/lib/paper/dist/paper-full.min.js'
			load_promises.push( common.prototype.load_script(lib_js_file) )


			await Promise.all(load_promises).then(async function(response){
			})

	// canvas
		self.canvas_node = ui.create_dom_element({
			id 				: self.id,
			element_type	: "canvas",
			class_name 		: 'canvas',
			parent 			: img.parentNode
		})
		//remove the image node from dom
			img.remove()

		// resize
			self.canvas_node.setAttribute("resize", true)

			//size
			//get the current resized canvas size
			const canvas_w		= self.canvas_node.clientWidth
			const canvas_h		= self.canvas_node.clientHeight


		// hidpi. Avoid double size on canvas
			// canvas_node.setAttribute("hidpi","off")

		// canvas -> active canvas_height = 432px (set in the instance)
			// const context = canvas_node.getContext("2d");
			const ratio_canvas 		= self.canvas_height / self.img_height
			self.canvas_node.height = self.canvas_height
			self.canvas_node.width  = ratio_canvas * self.img_width
				// console.log("ratio:",ratio,"img_height",img_height);
			// return

	// paper
		self.current_paper = new paper.PaperScope()
		self.current_paper.setup(self.canvas_node);
		//get the current resized canvas size
			//set the paper view size to the canvas size
			// if(self.node[0].classList.contains('fullscreen')){
			// 	self.current_paper.project.view.setViewSize(canvas_node.clientWidth, canvas_node.clientHeight)
			// }


	//Paste svg clipboard to active layer
		document.addEventListener('paste', function(event) {

				const clipboard = event.clipboardData.getData('text/plain')

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

		document.addEventListener('copy', function (e) {
			//don't block the ace editor copy/paste
				e.preventDefault();
				const projectSVG = project.exportSVG({asString:true,precision:3})
				if (e.clipboardData) {
					e.clipboardData.setData('text/plain', projectSVG);
				} else if (window.clipboardData) {
					window.clipboardData.setData('Text', projectSVG);
				}

		});


	// create the main layer
		// self.main_layer	= new self.current_paper.Layer();
		// 	self.main_layer.name = 'main';

			// set the main layer to the center of the view,
			// all other items and layers has reference to the main posistion and scale
				// self.main_layer.position = self.current_paper.view.center

	// scale main layer
	// get the ratio for the scale the main layer to fit to canvas view heigth
		// const ratio_layer = canvas_h / self.img_view_height
		// self.main_layer.scale(ratio_layer, self.current_paper.view.center)


	// subscription to the full_sreen change event
		self.events_tokens.push(
			event_manager.subscribe('full_screen_'+self.id,  full_screen_change)
		)
		function full_screen_change (button) {
			//add / remove class fullscreen to wrap. The component will resize
				// self.node[0].classList.toggle('fullscreen')

				if(!self.node[0].classList.contains('fullscreen')){
					const ratio_canvas = 432 / self.img_height
					self.canvas_node.height = 432
					self.canvas_node.width  = ratio_canvas * self.img_width
				}

				//get the current resized canvas size
				//set the paper view size to the canvas size
				self.current_paper.project.view.setViewSize(self.canvas_node.clientWidth, self.canvas_node.clientHeight)

				return



			// change the value of the current raster element
				// self.current_paper.view.setScaling(1)
				// get the current size of the paper view
				// const paper_w = self.current_paper.view.size._width
				// const paper_h = self.current_paper.view.size._height
				// if the image loaded is wide get the paper width else get the paper hight
				// const paper_reference = img_width > img_height ? paper_w : paper_h

				//add / remove class fullscreen to wrap. The component will resize
					// self.node[0].classList.toggle('fullscreen')
				//get the current resized canvas size
					// const canvas_w = canvas_node.clientWidth
					// const canvas_y = canvas_node.clientHeight

				//set the paper view size to the canvas size
					// self.current_paper.project.view.setViewSize(canvas_w, canvas_y)

				// self.current_paper.view.setScaling(1)
				// self.main_layer.setPosition(view.center)


				//reset the window and the canvas
				// window.dispatchEvent(new Event('resize'));
				// self.current_paper.project.view.update();
				// self.current_paper.view.setScaling(1)
				// self.main_layer.setPosition(self.current_paper.view.center)

				// self.main_layer.fitBounds(self.current_paper.project.view.bounds);

				//get the current resized canvas size
				// const canvas_w = canvas_node.clientWidth
				// const canvas_y = canvas_node.clientHeight
				// // if the image loaded is wide get the canvas width else get the canvas hight
				// const canvas_reference = img_width > img_height ? canvas_w : canvas_y

				//get the scale ratio, when remove the fullscreen the ratio of image will be 1 (original ratio)
				// const ratio = self.node[0].classList.contains('fullscreen') ? canvas_reference / paper_reference : 1
				//set the paper view size to the canvas size
				// self.current_paper.project.view.setViewSize(canvas_w, canvas_y)
				//scaling the paper view
				// self.current_paper.view.setScaling(ratio)
				//set the center of the view
				// const center_y = self.current_paper.view.size._height /2
				// const center_x = self.current_paper.view.size._width /2

				// self.current_paper.project.view.setCenter(center_x, center_y)

				// self.main_layer.scale(2, self.current_paper.view.center)
		}


	return true
}//end init_canvas



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
			//segment = path = movePath = handle = handle_sync = null;
			project.deselectAll();
		}
		this.rectangle.onMouseDrag = (event) => {
			//var rect = new Rectangle();

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
			//console.log((event.downPoint.x - event.point.x).length);

			// Remove this path on the next drag event:
			circle_path.removeOnDrag()
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
						if (event.modifiers.command) {
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
						// this.path.fullySelected = true;
						this.path.selected = true;
						this.movePath = 'fill'
						// const location = hitResult.location;
						// this.segment = this.path.insert(location.index +1, event.point);
						//path.smooth();
						break;

					case ('handle-in'):
						this.handle = hitResult.segment.handleIn;
						if (event.modifiers.command) {
							this.handle_sync = hitResult.segment.handleIn;
							this.handleIn = hitResult.segment.handleIn;
							this.handleOut = hitResult.segment.handleOut;
							//this.handle = "";
						}
						break;

					case ('handle-out'):
						this.handle = hitResult.segment.handleOut;
						if (event.modifiers.command) {
							this.handle_sync = hitResult.segment.handleOut;
							this.handleIn = hitResult.segment.handleOut;
							this.handleOut = hitResult.segment.handleIn;
							//this.handle = "";
						}
						break;

					default:
						console.log("Ignored hitResult.type :", hitResult.type)
						break;
				}//end switch
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
			self.update_draw_data()
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

			if (this.path.data.state === 'scale'){
					console.log("scale:")
					 // scale by distance from down point
					const bounds = this.path.data.bounds;
					const scale = event.point.subtract(bounds.center).length /
									this.path.data.scale_base.length;

					const top_left 		= bounds.topLeft.subtract(bounds.center).multiply(scale);
					const botton_right 	= bounds.bottomRight.subtract(bounds.center).multiply(scale);

					const new_bounds 	= new self.current_paper.Rectangle(top_left.add(bounds.center), botton_right.add(bounds.center));
					this.path.bounds 	= new_bounds;
					// if(typeof this.path.firstChild.image != 'undefined'){
					// 		console.log("scale:",this.path.firstChild.scaling.length);
					// }
					return;
				}
				else if(this.path.data.state === 'rotate')
				{
					console.log("rotation:")
					// the last two points.
					const center 	= this.path.bounds.center;
					const base 		= new self.current_paper.Point(center.x - event.lastPoint.x, center.y - event.lastPoint.y)
					const actual 	= new self.current_paper.Point(center.x - event.point.x, center.y - event.point.y)

					const angle 	= actual.angle - base.angle
					this.path.rotation = angle;
					// if(typeof this.path.firstChild.image != 'undefined'){
					// 		console.log("rotation:",this.path.firstChild.rotation);
					// }
					return;
				}

				if (this.path.data.state 		= 'move'){
					console.log("postion:")
					this.path.position.x += event.delta.x;
					this.path.position.y += event.delta.y;
					// if( this.path.firstChild != null && typeof this.path.firstChild.image != 'undefined'){
					// 		console.log("postion:",this.path.firstChild.bounds);
					// }
				}


			}

			this.transform.onMouseUp = (event) => {
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
			}
			if (hitResult) {
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
						if (event.modifiers.command) {
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
						if (event.modifiers.command) {
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
						if (event.modifiers.command) {
							this.handle_sync 	= hitResult.segment.handleIn;
							this.handleIn 		= hitResult.segment.handleIn;
							this.handleOut 		= hitResult.segment.handleOut;
							//this.handle = "";
						}
						break;

					case ('handle-out'):
						this.handle = hitResult.segment.handleOut;
						if (event.modifiers.command) {
							this.handle_sync 	= hitResult.segment.handleOut;
							this.handleIn 		= hitResult.segment.handleOut;
							this.handleOut 		= hitResult.segment.handleIn;
							//this.handle = "";
						}
						break;

					default:
						console.log("Ignored hitResult.type :", hitResult.type)
						break;
				}//end switch
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
}//end init_tools


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
					element_type	: 'div',
					class_name 		: 'button tool layer_selector_button',
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
					element_type	: 'div',
					class_name 		: 'button tool pointer',
					parent 			: buttons_container
				})
				pointer.addEventListener("mouseup", (e) =>{
					this.pointer.activate()
					activate_status(pointer)
				})
				buttons.push(pointer)

			// transform
				const transform = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'button tool transform',
					parent 			: buttons_container
				})
				transform.addEventListener("mouseup", (e) =>{
					this.transform.activate()
					activate_status(transform)
				})
				buttons.push(transform)


			// rectangle
				const rectangle = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'button tool rectangle',
					parent 			: buttons_container
				})
				rectangle.addEventListener("mouseup", (e) =>{
					this.rectangle.activate()
					activate_status(rectangle)
				})
				buttons.push(rectangle)

			// circle
				const circle = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'button tool circle',
					parent 			: buttons_container
				})
				circle.addEventListener("mouseup", (e) =>{
					this.circle.activate()
					activate_status(circle)
				})
				buttons.push(circle)

			// vector
				const vector = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'button tool vector',
					parent 			: buttons_container
				})
				vector.addEventListener("mouseup", (e) =>{
					this.vector.activate()
					activate_status(vector)
				})
				buttons.push(vector)

			// full_screen
				// const full_screen = ui.create_dom_element({
				// 	element_type	: 'div',
				// 	class_name 		: 'button tool full_screen',
				// 	parent 			: buttons_container
				// })
				// full_screen.addEventListener("mouseup", (e) =>{

				// 	event_manager.publish('full_screen_'+self.id, full_screen)

				// 	// self.current_paper.view.setScaling(1)

				// 	// //add / remove the class fullscreen
				// 	// self.node[0].classList.toggle('fullscreen')

				// 	// const x = self.node[0].clientWidth
				// 	// const y = self.node[0].clientHeight

				// 	// //reset the window and the canvas
				// 	// // window.dispatchEvent(new Event('resize'));
				// 	// // self.current_paper.project.view.update();

				// 	// const ratio = y / self.current_paper.project.view.size._height
				// 	// self.current_paper.view.setScaling(ratio)


				// 	// self.current_paper.project.view.setViewSize(x,y)

				// 	//////////

				// 	// const center_y = self.current_paper.view.viewSize._height /2
				// 	// const center_x = self.current_paper.view.viewSize._width /2
				// 	// self.current_paper.view.setCenter(center_x, center_y)

				// 	// self.current_paper.view.scale(ratio,new self.current_paper.Point(center_x, center_y))


				// 	// self.current_paper.project.view.setViewSize(x,y)
				// 		// const center_y = self.current_paper.view.viewSize._height /2
				// 		// const center_x = self.current_paper.view.viewSize._width /2
				// 		// self.current_paper.view.setCenter(center_x, center_y)



				// 	// const ar_layers = self.current_paper.project.layers
				// 	// const ar_layers_len = ar_layers.length
				// 	// for (let i = ar_layers_len - 1; i >= 0; i--) {
				// 	// 	const curent_layer = ar_layers[i]
				// 	// }

				// 	// self.current_paper.view.setScaling(1)
				// 		// const center_y = self.current_paper.view.viewSize._height /2
				// 		// const center_x = self.current_paper.view.viewSize._width /2
				// 		// self.current_paper.view.setCenter(center_x, center_y)



				// 		// 		//reset the window and the canvas
				// 		// 		 window.dispatchEvent(new Event('resize'));
				// 		// 		//change the status of the tool
				// 				// activate_status(full_screen)
				// 		// 		//reset the window and the canvas (twice, paper error)
				// 					// window.dispatchEvent(new Event('resize'));
				// 		// 			self.current_paper.project.view.viewSize.update();

				// 		// 		// if(!self.node[0].classList.contains('fullscreen')){
				// 		// 			//reset the button state
				// 		// 			activate_status()
				// 		// 			self.current_paper.view.setScaling(1)
				// 		// 			//set the center of the view
				// 		// 			const center_y = self.current_paper.view.viewSize._height /2
				// 		// 			const center_x = self.current_paper.view.viewSize._width /2
				// 		// 			self.current_paper.view.setCenter(center_x, center_y)

				// 		// // console.log("raster.parent:",self.current_paper.project.layers['raster_image'].setScaling(1));


				// 		// 			const height  		= self.current_paper.view.size._height
				// 		// 			const image_height 	= self.current_paper.project.raster.height
				// 		// 			const ratio 		= height / image_height

				// 		// 		// }

				// })
				// buttons.push(full_screen)

			// zoom
				const zoom = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'button tool zoom',
					parent 			: buttons_container
				})
				zoom.addEventListener("mouseup", (e) =>{
					this.zoom.activate()
					activate_status(zoom)
				})
				zoom.addEventListener("dblclick", (e) =>{
						// const ratio = view.height / main.height
						self.current_paper.view.setScaling(1)
						// main.setPosition(view.center)
						// main.fitBounds(view.bounds);
						// main.setScaling(1)
						// main.setPosition(view.center)
					//set the view ratio to 1
						// self.current_paper.view.setScaling(1)
					//set the center of the view
						// const center_y = self.current_paper.view.size._height /2
						// const center_x = self.current_paper.view.size._width /2
						// self.current_paper.project.view.setCenter(center_x,center_y)



					// // get the ratio diference from original view ratio and curren view ratio
					// const ratio = self.current_paper.view.size._height / self.current_paper.view.viewSize._height
					// // get the delta center from current position to original center position
					const center_y =  self.current_paper.view.center.y -(self.current_paper.view.viewSize._height /2)
					const center_x =  self.current_paper.view.center.x -(self.current_paper.view.viewSize._width /2)

					// self.current_paper.view.scale(ratio)
					self.current_paper.view.translate(center_x, center_y)

				})

				// zoom.addEventListener('wheel', (e) =>{

				// })
				buttons.push(zoom)

			// move
				const move = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'button tool move',
					parent 			: buttons_container
				})
				move.addEventListener("mouseup", (e) =>{
					this.move.activate()
					activate_status(move)
				})
				move.addEventListener("dblclick", (e) =>{
					//set the center of the view
					// main.setPosition(view.center)


					// const center_y = self.current_paper.view.size._height /2
					// const center_x = self.current_paper.view.size._width /2
					// self.current_paper.project.view.setCenter(center_x,center_y)

					// get the delta center from current position to original center position
					const delta_y =  self.current_paper.view.center.y -(self.current_paper.view.viewSize._height /2)
					const delta_x =  self.current_paper.view.center.x -(self.current_paper.view.viewSize._width /2)

					self.current_paper.view.translate(delta_x, delta_y)
				})
				buttons.push(move)

			// save
				const save = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'button tool save',
					parent 			: buttons_container
				})
				save.addEventListener("mouseup", (e) =>{
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
					element_type	: 'div',
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
}//end render_tools_buttons


/**
* SET_COLOR_PICKER
* get the color of the current active layer to set to the color picker and the button color picker
* @return
*/
vector_editor.prototype.set_color_picker = function(item){

		// this.active_fill_color = typeof(item.fillColor) ==='undefined'
			// ? item.fillColor
			// : item.selectedColor
		this.active_fill_color = item.fillColor
		const color = this.active_fill_color.toCSS()
		this.button_color_picker.style.backgroundColor = color
		this.color_picker.color.rgbaString = color
}// end set_color_picker



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

		console.log("project:",project);

	// set the layer data
	const layer_id		= layer.layer_id
	const layer_data	= layer.layer_data
	const layer_name	= layer_id === 0 ? 'raster' : 'layer_' +layer_id

	// create a layer color for selectors
	const layer_color = new Color({
					hue: 360 * Math.random(),
					saturation: 1,
					brightness: 1,
					alpha: 1,
				})

	layer.layer_color = layer_color.toCSS()

	//layer import
		if ( layer_data.indexOf('Layer')!=-1 ) {
			const project_len = project.layers.length
			for (let i = project_len - 1; i >= 0; i--) {
				if (project.layers[i].name===layer_name){
					project.layers[i].remove();
						console.log("-> layer delete: ", layer_name);
				}
			}

			const current_layer = project.importJSON(layer_data)

			current_layer.selectedColor = layer_color;
			current_layer.selectedColor.alpha = 1
			current_layer.activate();


		}else{
			let create_new_current_layer = true
			// Check if the layer is loaded
			const project_len = project.layers.length
			for (let i = project_len - 1; i >= 0; i--) {
				if (project.layers[i].name === layer_name){
					const current_layer 	= project.layers[i];
					current_layer.activate();
					create_new_current_layer = false;
					console.log("-> using existing current_layer: ", current_layer.name);
					break;
				}
			}//end for
			if (create_new_current_layer === true) {
				const current_layer 	= new Layer()
					current_layer.name 					= layer_name
					// set the id of Dédalo data
					current_layer.data.layer_id 		= layer_id
					// set the user layer name to default layer_name (layer_2)
					current_layer.data.user_layer_name 	= layer_name
					// set the layer in the self.ar_layer_loaded the curennt layer name (layer_2)
					layer.user_layer_name 				= layer_name
					// set the selectedColor
					current_layer.selectedColor 		= layer_color
					// set the user layer color
					// current_layer.data.layer_color 	= layer_color
				current_layer.activate();
				// create the raster layer
					if(layer_id===0){
						this.create_raster_layer(self)
					}

				console.log("-> create new layer: " , current_layer);
			}// end if

		};// end else

		this.active_layer = project.activeLayer

		event_manager.publish('active_layer_'+self.id, this.active_layer)

		this.active_layer.visible = true
		project.view.draw();
		project.deselectAll();
		project.options.handleSize = 8;
	return true
}//end load_layer



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
			position	: self.current_paper.view.center
		});

	// scale the image to fixed heigth: 1200px
		raster.scale(ratio)
		raster.layer.scale(ratio_layer, self.current_paper.view.center)

	// subscription to the image quality change event
		self.events_tokens.push(
			event_manager.subscribe('image_quality_change_'+self.id,  img_quality_change)
		)
		function img_quality_change (img_src) {
			// change the value of the current raster element
			raster.source = img_src
			raster.onLoad = function(e) {
				const new_image_height 	= raster.height//raster.bounds.height
				const ratio 			= self.img_view_height / new_image_height
				raster.setScaling(ratio)
				raster.layer.setScaling(ratio_layer)
			}
		}
}//end create_raster_layer


/**
*  LAYER_SELECTOR
* @return
*/
vector_editor.prototype.render_layer_selector = function(self){

	// const ar_layers = typeof (self.data.value[0]) !== 'undefined' && typeof (self.data.value[0].lib_data) !== 'undefined'
	// 			? self.data.value[0].lib_data
	// 			: []
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
				console.log("self.ar_layer_loaded:",self.ar_layer_loaded);
			const layer_id 	= self.add_layer()
			const new_layer = self.ar_layer_loaded.find((item) => item.layer_id === layer_id)
			const layer_li 	= this.render_layer_row(self, new_layer)
			layer_ul.appendChild(layer_li)
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

		for (let i = 0; i < ar_layers.length; i++) {
			const layer = ar_layers[i]
			const layer_li = this.render_layer_row(self, layer)
			layer_ul.appendChild(layer_li)

		}// end for

	// layer_selector
		const layer_selector = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'layer_selector',
				})
		layer_selector.appendChild(fragment)

	return layer_selector
}//end layer_selector



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

			const name = 'layer_'+layer.layer_id
			const new_active_layer = project.layers[name]
			if(typeof new_active_layer === 'undefined'){
				this.load_layer(self, layer)
			}else{
				new_active_layer.activate()
				this.active_layer = project.activeLayer
				event_manager.publish('active_layer_'+self.id, new_active_layer)
			}

		})
		layer.layer_id === this.active_layer.data.layer_id
			? layer_li.classList.add('active')
			: layer_li.classList.remove('active')

		self.events_tokens.push(
			event_manager.subscribe('active_layer_'+self.id, change_layer)
		)
		function change_layer(active_layer) {
			layer.layer_id === active_layer.data.layer_id
			? layer_li.classList.add('active')
			: layer_li.classList.remove('active')
		}

		// layer_icon
			const layer_icon = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button eye layer_icon',
				parent 			: layer_li,
				text_node		: layer.layer_icon
			})
			const name = 'layer_'+layer.layer_id
			const viewed_layer = project.layers[name]

			typeof viewed_layer !== 'undefined' && layer.layer_id === viewed_layer.data.layer_id
				? layer_icon.classList.add('active')
				: layer_icon.classList.remove('active')

			layer_icon.addEventListener("click", (e) =>{
				 const name = 'layer_'+layer.layer_id
				 const viewed_layer = project.layers[name]
				if(typeof viewed_layer === 'undefined'){
					this.load_layer(self,layer)
					layer_icon.classList.add('active')
					this.active_layer = viewed_layer
				}else{
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

			})

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
			// user_layer_name.contentEditable = false
			user_layer_name.addEventListener("dblclick", (e) =>{
				user_layer_name.contentEditable = true
				user_layer_name.focus();
			})
			user_layer_name.addEventListener("blur", (e) =>{
				user_layer_name.contentEditable = false
				// layer.user_layer_name = user_layer_name.innerText
				const name = 'layer_'+layer.layer_id
				const viewed_layer = project.layers[name]
				viewed_layer.data.user_layer_name = user_layer_name.innerText
				self.update_draw_data()
			})
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
				const event = event_manager.subscribe('user_option_'+self.id, (user_option))
				self.events_tokens.push( event )
				function user_option(user_option) {
					if(user_option===1){
								console.log("layer:",layer.layer_id);
							// event_manager.publish('delete_layer_'+self.id, layer)
							// remove the event
							event_manager.unsubscribe(event)
							// remove the layer in paper project
							const name = 'layer_'+layer.layer_id
							const delete_layer = project.layers[name]
							delete_layer.remove()
							// remove the data in the instance
							self.delete_layer(layer)
							//remove the layer node
							layer_li.remove()

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
			layer_color.addEventListener("dblclick", (e) =>{
				layer_color.style.backgroundColor = this.active_fill_color.toCSS()
				layer.layer_color = this.active_fill_color.toCSS()
			})

			// self.events_tokens.push(
			// 	event_manager.subscribe('color_change_'+layer.layer_id, change_color)
			// )
			// function change_color(color) {
			// 	layer_color.style.backgroundColor = color
			// }

	return layer_li
}//end layer_selector
