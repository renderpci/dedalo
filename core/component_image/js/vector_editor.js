/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports

import {ui} from '../../common/js/ui.js'

export const vector_editor = function(){

	this.id
	// paper vars
	this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;
	this.currentSegment = this.mode = this.type = null;

	return true
}//end component_image


/**
* LOAD_TOOLS
*/
vector_editor.prototype.init_tools = function(self){

	// paper. Curent paper vars
		const project = self.current_paper.project
		const Layer   = self.current_paper.Layer
		const Color   = self.current_paper.Color
		const Tool    = self.current_paper.Tool
		const Point   = self.current_paper.Point
		const Size    = self.current_paper.Size
		const Path    = self.current_paper.Path


	// rectangle 
		this.rectangle = new Tool();
		this.rectangle.onMouseDown = (event) => {
			// Reset vars
			this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;
			//segment = path = movePath = handle = handle_sync = null;
			project.deselectAll();
		}
		this.rectangle.onMouseDrag = function(event){
			//console.log(project.activeLayer.name);
			//var rect = new Rectangle();
			const size = new Size ({
				width: event.point.x - event.downPoint.x,
				height: event.point.y - event.downPoint.y
			});

			const rectangle_path = new Path.Rectangle({
				point: event.downPoint,
				size: size,
				fillColor: project.activeLayer.fillColor,
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
		this.circle.onMouseDrag = function(event){
			
			const a = new Point({
				x: event.downPoint.x - event.point.x,
				y: event.downPoint.y - event.point.y,
			})

			const circle_path = new Path.Circle({
				center 		: event.downPoint,
				radius 		: a.length,
				fillColor 	: project.activeLayer.fillColor,
				strokeColor : 'black'
			})
			//console.log((event.downPoint.x - event.point.x).length);

			// Remove this path on the next drag event:
			circle_path.removeOnDrag()
			self.update_draw_data()
		}


	// // add point 
	// 	this.add_point = new Tool();			
	// 	this.add_point.onMouseDown = (event) => {
	// 		// Reset vars
	// 		this.segment = this.path = this.movePath = this.handle = this.handle_sync = null;
	// 		const hitResult = project.hitTest(event.point, { fill: true, stroke: true, segments: true, tolerance: 5, handles: true });
	// 		if (hitResult) {
	// 			this.path = hitResult.item;
	// 			//console.log(hitResult.type);
	// 			if (hitResult.type==='stroke') {
	// 				const location = hitResult.location
	// 				this.segment = this.path.insert(location.index +1, event.point)
	// 				//path.smooth();
	// 			}
	// 		}
	// 	}				
	// 	this.add_point.onMouseMove = function(event){
	// 		const hitResult = project.hitTest(event.point, { fill: true, stroke: true, segments: true, tolerance: 5, handles: true });
	// 		project.activeLayer.selected = false;
	// 		if (hitResult && hitResult.item)
	// 			hitResult.item.selected = true;
	// 	}			
	// 	this.add_point.onMouseDrag = function(event) {
	// 		if (this.segment) {
	// 			this.segment.point.x = event.point.x;
	// 			this.segment.point.y = event.point.y;
	// 		}
	// 	}
			

	// pointer 
		this.pointer = new Tool();
		this.pointer.onMouseDown = (event) => {
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
								fillColor : project.activeLayer.fillColor
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
			const delta = 0.01
			const x = Math.sign(event.delta.x) === 0 ? 1 : Math.sign(event.delta.x)
			const ratio = Math.abs(delta + x)

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
			const delta = event.downPoint.subtract(event.point)
			project.view.scrollBy(delta)
			// project.view.center.y = event.point.x
		}

	// activate de default tool pointer 
		// const button_pointer = self.svg_editor_tools.querySelector("[data-tool_name='pointer']")
		// self.active_tool(button_pointer)

	return true
}//end init_tools



vector_editor.prototype.render_tools_buttons = function(self){

	// Tool buttons. Show
	const buttons_container = self.vector_editor_tools
		buttons_container.classList.remove("hide")

	// vector editor tools
	const buttons = []
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
			const full_screen = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'button tool full_screen',
				parent 			: buttons_container
			})
			full_screen.addEventListener("mouseup", (e) =>{
				full_screen.classList.add('fullscreen')
				activate_status(full_screen)
			})
			buttons.push(full_screen)

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
				// get the ratio diference from original view ratio and curren view ratio
				const ratio = self.current_paper.view.size._height / self.current_paper.view.viewSize._height
				// get the delta center from current position to original center position
				const center_y =  self.current_paper.view.center.y -(self.current_paper.view.viewSize._height /2)
				const center_x =  self.current_paper.view.center.x -(self.current_paper.view.viewSize._width /2)

				self.current_paper.view.scale(ratio)
				self.current_paper.view.translate(center_x, center_y)

			})
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
				// get the delta center from current position to original center position
				const center_y =  self.current_paper.view.center.y -(self.current_paper.view.viewSize._height /2)
				const center_x =  self.current_paper.view.center.x -(self.current_paper.view.viewSize._width /2)

				self.current_paper.view.translate(center_x, center_y)
			})
			buttons.push(move)

		// save
			const save = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'button tool save',
				parent 			: buttons_container
			})
			save.addEventListener("mouseup", (e) =>{
				self.save_draw_data()
				activate_status(save)
			})

		//chane the buttons status: active, desactive
		const activate_status = (button) =>{
			const buttons_lenght = buttons.length
			for (let i = 0; i < buttons_lenght; i++) {
				const current_buton = buttons[i]
				current_buton.classList.remove('vector_tool_active')
			}
			button.classList.add('vector_tool_active')
		}

		// first load activate pointer
			this.pointer.activate()
			activate_status(pointer)
}//end render_tools_buttons

//Botones de tools
//SELECT del ZOOM
// Crear opciones de select para el zoom			
vector_editor.prototype.load_layer = function(self, data, layer_id) {

	// curent paper vars
	const project = self.current_paper.project
	const Layer   = self.current_paper.Layer
	const Color   = self.current_paper.Color

	//layer import
		if ( data.indexOf('Layer')!=-1 ) {
			
			const p_len = project.layers.length
			for (let i = p_len - 1; i >= 0; i--) {				
				if (project.layers[i].name===layer_id){
					project.layers[i].remove();
						console.log("-> borrada capa: ", layer_id);
				}
			}

			const current_layer = project.importJSON(data);

			const color = current_layer.fillColor;

			current_layer.activate();
			// project.deselectAll();
			// project.view.draw();
			//console.log(project.layers[1].name);
			//console.log(current_layer.fillColor);
		}else{
			let create_new_current_layer = true
			// Verificamos si el nombre del layer existe

			const c_len = project.layers.length
			for (let i = c_len - 1; i >= 0; i--) {					
				if (project.layers[i].name == layer_id){
					const current_layer = project.layers[i];
					current_layer.activate();
					create_new_current_layer = false;
					console.log("-> usando existente current_layer: ", current_layer.name);
					break;
				}
			}//end for
			if (create_new_current_layer == true) {
				const current_layer = new Layer();
					current_layer.name = layer_id;					
				const color = new Color({
					hue: 360 * Math.random(),
					saturation: 1,
					brightness: 1,
					alpha: 0.3,
				});
				current_layer.fillColor = color;
				current_layer.activate();	
				console.log("-> creada nueva capa: " , current_layer.name);	
			}

		};// end else
		//segment = path = movePath = handle = handle_sync = null;
		project.view.draw();
		project.deselectAll();
		project.options.handleSize = 8;
	
	return true
}//end load_layer



/**
* ACTIVE_TOOL
* @return 
*/
const active_tool = function(button) {
	console.log("aqui:",button);
	console.log("aqui:",this);
	// const tool_name = button.dataset.tool_name
		
	// Activate tool
	this[button].activate()

	// Reset all butons apperance
	// const ar_buttons = button.parentNode.querySelectorAll(".button_activate")
	// for (let i = ar_buttons.length - 1; i >= 0; i--) {
	// 	if (ar_buttons[i].classList.contains("button_active")) {
	// 		ar_buttons[i].classList.remove("button_active")
	// 	}			
	// }

	// Hilite current
	// button.classList.add("button_active")

	return true
}//end active_tool