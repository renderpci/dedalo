/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_image} from '../../component_image/js/render_component_image.js'



export const component_image = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	this.tools

	this.file_name
	this.file_dir


	return true
}//end component_image



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_image.prototype.init 	 			= component_common.prototype.init
	component_image.prototype.build 	 		= component_common.prototype.build
	component_image.prototype.render 			= common.prototype.render
	component_image.prototype.refresh 			= common.prototype.refresh
	component_image.prototype.destroy 	 		= common.prototype.destroy

	// change data
	component_image.prototype.save 	 			= component_common.prototype.save
	component_image.prototype.update_data_value	= component_common.prototype.update_data_value
	component_image.prototype.update_datum 		= component_common.prototype.update_datum
	component_image.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_image.prototype.list 				= render_component_image.prototype.list
	component_image.prototype.edit 				= render_component_image.prototype.edit




/**
* INIT
*/
component_image.prototype.init = async function(options) {

	const self = this

	// editor init vars
		self.ar_tag_loaded = []
		self.buttons_loaded = null
		self.current_paper = null

	// call the generic commom tool init
		const common_init = component_common.prototype.init.call(this, options);

	// set the self specific libraries and variables not defined by the generic init
		// load dependences js/css
			const load_promises = []

			const lib_js_file = DEDALO_ROOT_WEB + '/lib/paper/dist/paper-full.min.js'
			load_promises.push( common.prototype.load_script(lib_js_file) )


			await Promise.all(load_promises).then(async function(response){
			})

	return common_init
}//end init



/**
* GET_DATA_TAG
* Send the data_tag to the text_area when it need create a new tag
*/
component_image.prototype.get_data_tag = function(){

	const data_tag = {
		type 	: 'draw',
		tag_id 	: null,
		state 	: 'n',
		label 	: '',
		data 	: ''
	}

	return data_tag
}


// /**
// * BUILD
// */
// component_image.prototype.build = async function(autoload=false) {

// 	const self = this

// 	// call generic component commom build
// 		const common_build = component_common.prototype.build.call(this, autoload);

// 	// fix useful vars
// 		// self.allowed_extensions 	= self.context.allowed_extensions
// 		// self.default_target_quality = self.context.default_target_quality


// 	return common_build
// }//end build_custom



// CANVAS : INIT
component_image.prototype.init_canvas = function(li, canvas_node, img) {

	const self = this

		img.onload = function () {

			// canvas
				// resize
					canvas_node.setAttribute("resize",true)
				//size
					canvas_node.height = img.naturalHeight
					canvas_node.width  = img.naturalWidth
			
		
				// hidpi. Avoid double size on canvas
					// canvas_node.setAttribute("hidpi","off")

				// canvas -> active
					canvas_node.getContext("2d")


			// paper 
				self.current_paper = paper.setup(canvas_node);

			// raster image
				const raster = new self.current_paper.Raster({
					source   : img.src,
					position : self.current_paper.view.center
				});

				const height  		= li.offsetHeight //self.current_paper.view.size._height
				const image_height 	= img.naturalHeight //raster.height
				const ratio 		= height / image_height
				raster.scale(ratio)

		};

return
/// old way v5
	// zoom
		var nivelZoom = null

		// zoomselecion function
		zoomselecion = function(nivelZoom) {
			var a 			= nivelZoom/100;
			var ratioZoom 	= a/zoomActual;
			zoomActual = a; 
			canvas_node.width 	= canvas_node.width * ratioZoom;
			canvas_node.height 	= canvas_node.height * ratioZoom;

			//console.log(canvas_node.width);
			//console.log(canvas_node.height);

			//context.zoom(ratioZoom,ratioZoom);
			//context.restore();
			view.zoom = a;
			//view.scrollBy(0,0);
			view.scrollBy(new Point(-view.bounds.x, -view.bounds.y));
			//context.scale(ratioZoom,ratioZoom)
			//project.activeLayer.translate(0,0);
			//raster.position = view.center;
			//console.log(a);
			//console.log(ratioZoom);
			//drawScreen();
			//drawScreen();
			return true;
		}//end zoomselecion = function(nivelZoom)

		

	// zoom selector
		const zoom_select = document.getElementById('zoom');
			  zoom_select.addEventListener("change",function(){
				nivelZoom = self.value;
				toolZoom.activate(); 
				zoomselecion(nivelZoom);

				const button_pointer = wrapper.querySelector("[data-tool_name='pointer']")
				self.active_tool(button_pointer)
			  },false)
				
				
	// zoom tool / handler
		var zoomActual = 1.0;
		toolZoom = new Tool();
		toolZoom.onMouseDown = function(event) {
			return false; // DESACTIVO DE MOMENTO (!)
			segment = path = null;
			var hitResult = project.hitTest(event.point, hitOptions);
			if (hitResult) {
				path = hitResult.item;
				//console.log(hitResult.type);
				if (hitResult.type==='pixel') {
					var location = hitResult.location;
					//segment = path.insert(location.index +1, event.point);
					if (event.modifiers.shift) {
						canvas_node.width 	= canvas_node.width * 0.5;
						canvas_node.height 	= canvas_node.height * 0.5;
						//canvas_node.scale(zoomActual * 0.5, zoomActual * 0.5);
						//canvas_node.restore();
						//canvas_node.draw();
						view.zoom = zoomActual * 0.5;
						//view.scrollBy(0,0);
						view.scrollBy(new Point(-view.bounds.x, -view.bounds.y));
						//canvas_node.style.backgroundPosition(event.point.x, );
						//var ctop=(-ui.position.top * canvas_node.height / canvasWrapperHeight);
						zoomActual = zoomActual * 0.5;
						return;
					}else{
						canvas_node.width 	= canvas_node.width * 2.0;
						canvas_node.height 	= canvas_node.height * 2.0;
						//canvas_node.scale(zoomActual * 2.0, zoomActual * 2.0);
						//canvas_node.restore();
						//canvas_node.draw();
						view.zoom = zoomActual * 2.0;
						//view.scrollBy(0,0);
						view.scrollBy(new Point(-view.bounds.x, -view.bounds.y));
						$(canvas_node.parentNode).animate({ scrollTop: event.point.y + canvas_node.parentNode.scrollTop, scrollLeft: event.point.x + canvas_node.parentNode.scrollLeft}, 0);	

						//project.view.scrollBy(event.point);
						zoomActual = zoomActual * 2.0;
						return;
					}//end if (event.modifiers.shift)
				}//end if (hitResult.type == 'pixel')
			}//end if (hitResult)
		}//end toolZoom.onMouseDown = function(event)


		//if(ratio_window < 1){
			//var ventana_h =  window.innerHeight;
			//var ventana_h_util 	= ventana_h - 60;
			//var ratio_window 	= ventana_h_util /img_h;
			var div_width 	 = canvas_node.parentNode.clientHeight;
			var ratio_window = Math.floor(div_width / img_h);
			var porcentaje 	 = ratio_window*100;

			// set to 100 on init to avoid zoom problems
			porcentaje = 100
			
			// make zoom
			zoomselecion(porcentaje);
			if(SHOW_DEBUG===true) {
				console.log("Canvas zoom to apply: ",porcentaje);
			}

			// Add current value as option to zoom seletor
			const porcentaje_round = Math.round(porcentaje * 100) / 100
			const option = document.createElement("option")		
				  option.setAttribute("value", porcentaje_round)
				  option.setAttribute("selected", true)
				  option.innerHTML = porcentaje_round + "%"
			const option_key = zoom_select.options.length -1;				
			zoom_select.options[option_key] = option;
			zoom_select.selectedIndex = option_key;
			//var seleccion_de_zoom   = option_key;
			//zoom_select.lastChild.text(option);
			//ratio_window = 1;
		//}
	
		// Get a reference to the canvas object
		//var canvas = document.getElementById('myCanvas');
		// Create an empty project and a view for the canvas:
		//console.log(tool)
	
	//});//end $(canvas_node).find('img').first().load(function()		

	return true
}//end init_canvas




//Botones de tools
//SELECT del ZOOM
// Crear opciones de select para el zoom			
component_image.prototype.load_draw_editor = function(options) {

	const self = this

	const tag = options.tag.dataset

	// MODE : Only allow mode 'tool_transcription'
	//if(page_globals.modo!=='tool_transcription') return null;

	if (self.buttons_loaded===false){
		self.buttons_loaded = true;
		self.load_tools();
	}

	self.ar_tag_loaded[tag.tag_id] = tag;

	/*
	*ATENTION THE NAME OF THE TAG (1) CHANGE INTO (1_LAYER) FOR COMPATIBILITY WITH PAPER LAYER NAME
	*WHEN SAVE THE LAYER TAG IT IS REMOVE TO ORIGINAL TAG NAME OF DÉDALO. "draw-n-1-data"
	*BUT THE LAYER NAME ALWAYS ARE "1_layer"
	*/

	const data 	 	= tag.data.replace(new RegExp('\'', 'g'), '"');
	const layer_id 	= tag.tag_id +'_layer';
	
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
}//end load_draw_editor



/**
* LOAD_TOOLS
*/
component_image.prototype.load_tools = function(){

	const self = this

	// Tool buttons. Show
	const main_buttons = document.querySelector(".main_buttons")
		  main_buttons.classList.remove("hide")

	/*
		//var contexto = canvas_obj.parentNode.parentNode;
		var contexto = document.getElementsByClassName('image_buttons')[0];
		//console.log(contexto);

			function createButton(contexto, estado, func){
					var button = document.createElement("input");
					button.type = "button";
					button.value = estado;
					button.onclick = func;
					contexto.appendChild(button);
					//document.body.appendChild(button);
				}

		if (this.buttons_loaded == true) {
			createButton(contexto, "rectangle", function(){ 
							rectangle.activate(); 
					});
			createButton(contexto, "circle", function(){ 
							circle.activate(); 
					});

			createButton(contexto, "pointer", function(){ 
							pointer.activate(); 
					});

			createButton(contexto, "vector", function(){ 
							vector.activate(); 
					});

			createButton(contexto, "añadido", function(){ 
							add_point.activate(); 
					});
			createButton(contexto, "salvar", function(){ 
							salvar();
					});


			this.buttons_loaded = true;		
		}//end if (this.buttons_loaded == true)

		*/

	// paper. Curent paper vars
		const project = self.current_paper.project
		const Layer   = self.current_paper.Layer
		const Color   = self.current_paper.Color
		const Tool    = self.current_paper.Tool
		const Point   = self.current_paper.Point
		const Size    = self.current_paper.Size
		const Path    = self.current_paper.Path


	// rectangle 
		self.rectangle = new Tool();
		self.rectangle.onMouseDown = function(event){
			// Reset vars
			segment = path = movePath = handle = handle_sync = null;
			project.deselectAll();
		}
		self.rectangle.onMouseDrag = function(event){
			//console.log(project.activeLayer.name);
			//var rect = new Rectangle();
			const tama = new Size ({
				width: event.point.x - event.downPoint.x,
				height: event.point.y - event.downPoint.y
			});

			const rectangle_path = new Path.Rectangle({
				point: event.downPoint,
				size: tama,
				fillColor: project.activeLayer.fillColor,
				strokeColor: 'black'
			});

			// Remove this path on the next drag event:
			rectangle_path.removeOnDrag();
		}


	// circle 
		self.circle = new Tool();
		self.circle.onMouseDown = function(event){
			// Reset vars
			segment = path = movePath = handle = handle_sync = null;
			project.deselectAll();
		}
		self.circle.onMouseDrag = function(event){
			
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
		}


	// añadir punto 
		self.add_point = new Tool();			
		self.add_point.onMouseDown = function(event) {
			// Reset vars
			segment = path = movePath = handle = handle_sync = null;
			const hitResult = project.hitTest(event.point, hitOptions);
			if (hitResult) {
				path = hitResult.item;
				//console.log(hitResult.type);
				if (hitResult.type==='stroke') {
					const location = hitResult.location
					segment = path.insert(location.index +1, event.point)
					//path.smooth();
				}
			}
		}				
		self.add_point.onMouseMove = function(event){
			const hitResult = project.hitTest(event.point, hitOptions);
			project.activeLayer.selected = false;
			if (hitResult && hitResult.item)
				hitResult.item.selected = true;
		}			
		self.add_point.onMouseDrag = function(event) {
			if (segment) {
				segment.point.x = event.point.x;
				segment.point.y = event.point.y;
			}
		}
			

	// pointer 
		self.pointer = new Tool();
		self.pointer.onMouseDown = function(event) {
			// Reset vars
			segment = path = movePath = handle = handle_sync = null;

			//project.activeLayer.selected = false;
			const hitResult = project.hitTest(event.point, { fill: true, stroke: true, segments: true, tolerance: 5, handles: true });

			/* if (event.modifiers.shift) {
					if (hitResult.type == 'segment') {
						hitResult.segment.remove();
					};
					if(hitResult.type == 'fill'){
						path = hitResult.item;
						//console.log(path.layer.name);
						//console.log(project.activeLayer.name);
						if (project.activeLayer.name == path.layer.name) {
						//	console.log("mismo layer");
							path.selected = true;
							//console.log(capa);
							//path.selected = true;
						}else{
						//	console.log("distinto layer");
							project.deselectAll();
							capa = path.layer;
							capa.activate();
							path.selected = true;
						}

					}
					if(hitResult.type == 'pixel'){
						project.activeLayer.selected = false;
					}
					console.log(hitResult.type);
					return;
				}
				*/
			if(SHOW_DEBUG===true) {
				console.log("[load_tools] hitResult:",hitResult);
			}					
			if (hitResult) {
				switch(hitResult.type) {

					case ('fill'):
						project.deselectAll()
						path = hitResult.item
						const capa = path.layer
							capa.activate()

						if (event.modifiers.shift) {
							hitResult.item.remove()
						}

						path.selected = true;
						movePath = hitResult.type == 'fill'
						break;

					case ('pixel'):
						project.deselectAll();
						project.activeLayer.selected = false;
						//path.selected = false;
						//path = null;
						break;

					case ('segment'):
						project.deselectAll();
						path = hitResult.item;
						path.fullySelected = true;
						segment = hitResult.segment;
						if (event.modifiers.shift) {
							hitResult.segment.remove();
						}
						if (event.modifiers.command) {
							if(segment.hasHandles()){
								hitResult.segment.clearHandles();
							}
							handle_sync = hitResult.segment.handleIn;
							handleIn = hitResult.segment.handleIn;
							handleOut = hitResult.segment.handleOut;
							segment = "";
						}
						//segment = hitResult.segment
						break;

					case ('stroke'):
						const location = hitResult.location;
						path = hitResult.item;
						segment = path.insert(location.index +1, event.point);
						//path.smooth();
						break;

					case ('handle-in'):
						handle = hitResult.segment.handleIn;
						if (event.modifiers.command) {
							handle_sync = hitResult.segment.handleIn;
							handleIn = hitResult.segment.handleIn;
							handleOut = hitResult.segment.handleOut;
							handle = "";
						}
						break;

					case ('handle-out'):
						handle = hitResult.segment.handleOut;
						if (event.modifiers.command) {
							handle_sync = hitResult.segment.handleOut;
							handleIn = hitResult.segment.handleOut;
							handleOut = hitResult.segment.handleIn;
							handle = "";
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
		/*
		this.pointer.onMouseMove = function(event){
			var hitResult = project.hitTest(event.point, hitOptions);
			project.activeLayer.selected = false;
			if (hitResult && hitResult.item)
				hitResult.item.selected = true;
		}*/
		self.pointer.onMouseDrag = function(event) {
			if (handle){
				handle.x += event.delta.x;
				handle.y += event.delta.y;
			}
			if (handle_sync){
				handleIn.x += event.delta.x;
				handleIn.y += event.delta.y;
				handleOut.x -= event.delta.x;
				handleOut.y -= event.delta.y;
			}
			if (segment) {
				//console.log(segment);
				segment.point.x = event.point.x;
				segment.point.y = event.point.y;
				//console.log(event);
				//console.log(segment);
				//path.smooth();
			}
			if (movePath){
				path.position.x += event.delta.x;
				path.position.y += event.delta.y;
			}
		}
		self.pointer.onKeyUp = function(event){
			if (event.key==="backspace" || event.key==="delete"){
				//console.log(event.key);
				const seleccionados = project.selectedItems;
				//console.log(seleccionados);
				const sec_len = seleccionados.length
				for (let i = sec_len - 1; i >= 0; i--) {
					seleccionados[i].remove()
					segment = path = null;
				}
			}
		}


	// vector 
		self.vector = new Tool()
		const findHandle = function(path, point) {
			//console.log("path: " + path);
			//console.log("path.segments.length "+path.segments.length);
			const s_len = path.segments.length
			for (let i = s_len - 1; i >= 0; i--) {

				for (let j = 0; j < 3; j++) {

					const type 		 = types[j]
					const segment 	 = path.segments[i]
					const segmentPoint = {}
					
					if (type==='point'){
						segmentPoint = segment.point;
					}else{
						segmentPoint.x = segment.point.x + segment[type].x;
						segmentPoint.y = segment.point.y + segment[type].y;
					}
					//var segmentPoint = type == 'point'
					//		? segment.point
					//		: segment.point.x + segment[type].x;
					const distance = new Point;// = (point - segmentPoint).length;
							distance.x = (point.x - segmentPoint.x);
							distance.y = (point.y - segmentPoint.y);
					const distance_len = distance.length;

					//console.log("point " + point);
					//console.log("segmentPoint: " + segmentPoint);
					//console.log("distance_len " + distance_len);

					if (distance_len < 3) {
						return {
							type    : type,
							segment : segment
						};
					}
				}
			}
			//console.log(point)
			return null;
		}
		//console.log("path: "+path);
		//function onMouseDown(event) {
		self.vector.onMouseDown = function(event) {
			
			if (currentSegment){
				currentSegment.selected = false;
			}				
			mode = type = currentSegment = null;
			
			if (!path) {
				path = new Path({
					strokeColor : 'black',
					fillColor : project.activeLayer.fillColor
				});
			}

			const result = findHandle(path, event.point)				
			if (result) {
				currentSegment = result.segment;
				type = result.type;
				//console.log(path.segments.length);
				//console.log(result.type);
				//console.log(result.segment.index);

				if (path.segments.length > 1 && result.type==='point' && result.segment.index == 0) {
					mode = 'close';
					path.closed = true;
					path.selected = false;
					path = null;
				}
			}

			if (mode!=="close") {						
				mode = currentSegment ? 'move' : 'add';
				if (!currentSegment) {
					currentSegment = path.add(event.point);
				}
				currentSegment.selected = true;
			}
		}
		
		self.vector.onMouseDrag = function(event) {
			if (mode==='move' && type==='point') {
				currentSegment.point = event.point;
			}else if (mode!=="close" && currentSegment.handleIn) {
				var delta = event.delta.clone();	
				if (type==='handleOut' || mode==='add') {
					//console.log(delta.x +" "+(delta.x)*-1)
					//console.log(delta)
					//delta = -delta;
					delta.x = (delta.x)*-1
					delta.y = (delta.y)*-1
				}
				//console.log(delta);						
				//currentSegment.handleIn += delta;
				currentSegment.handleIn.x += delta.x;
				currentSegment.handleIn.y += delta.y;

				//currentSegment.handleOut -= delta;
				currentSegment.handleOut.x -= delta.x;
				currentSegment.handleOut.y -= delta.y;
			}
		}


	// activate de default tool pointer 
		const button_pointer = main_buttons.querySelector("[data-tool_name='pointer']")
		self.active_tool(button_pointer)


	return true
}//end load_tools



/**
* ACTIVE_TOOL
* @return 
*/
component_image.prototype.active_tool = function(button) {

	const tool_name = button.dataset.tool_name
	
	// Activate tool
	this[tool_name].activate()

	// Reset all butons apperance
	const ar_buttons = button.parentNode.querySelectorAll(".button_activate")
	for (let i = ar_buttons.length - 1; i >= 0; i--) {
		if (ar_buttons[i].classList.contains("button_active")) {
			ar_buttons[i].classList.remove("button_active")
		}			
	}

	// Hilite current
	button.classList.add("button_active")

	return true
};//end active_tool

