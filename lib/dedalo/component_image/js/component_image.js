/**
* COMPONENT_IMAGE
*
*
*/
var component_image = new function() {

	"use strict";

	this.url_trigger 	= DEDALO_LIB_BASE_URL + '/component_image/trigger.component_image.php'
	this.related_tipo  	= null
	this.buttonsLoaded 	= false

	var currentPaper

	var cuadrado
	var	circulo
	var	puntero
	var	anadido
	var	vectores
	var	toolZoom
	var	salvar

	var canvas_obj, context, canX, canY, canXold=0, canYold=0, mouseIsDown=0, len=0;
	var segment, path, handle, handle_sync, movePath;
	var node = [];	
	var ar_tag_loaded = []
	var movePath = false;	
	var types = ['point', 'handleIn', 'handleOut'];
	var currentSegment, mode, type;
	var hitOptions = {
		segments: true,
		stroke: true,
		fill: true,
		tolerance: 5
	}



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		const self = this
	
		switch(page_globals.modo) {

			case 'tool_transcription':
				break;
			case 'tool_image_versions':
			case 'edit':
				break;
			case 'list':
				$(function() {
					// Remove background spinner in image container
					$('img.thumb_in_list').on('load', function(){
						$(this).parent('.div_image_image_in_list').css({backgroundImage:'none'});
						//if(SHOW_DEBUG===true) console.log('new image loaded: ' + this.src);
					})
				});
				break;
		}

		if (options.init_mode==="read") {
			const load_image_read = common.load_script(DEDALO_LIB_BASE_URL + '/component_image/js/component_image_read.js', {"async":true})
			const load_paper 	  = common.load_script(PAPER_JS_URL, {"async":true})
			Promise.all([load_image_read, load_paper]).then(function() {
				setTimeout(function(){
					component_image_read.init(options);
				},150)
			});
		}
		

		return true
	};//end init




	// CANVAS : INIT
	this.init_canvas = function(canvas_id, id_wrapper) {

		const self = this

		// Fix vars
			const wrapper = document.getElementById(id_wrapper)
			this.related_tipo = wrapper.dataset.related_tipo

		// canvas
			canvas_obj 	= document.getElementById(canvas_id)
			context 	= canvas_obj.getContext('2d')
			
		// img
			var img 	= document.getElementById('img_'+canvas_id)
			var	img_w 	= img.naturalWidth
			var	img_h 	= img.naturalHeight
			if(SHOW_DEBUG===true) {
				console.log("Working image: img_w:",img_w, " img_h:",img_h);
			}

		// canvas -> image match size
			canvas_obj.width 	= img_w;
			canvas_obj.height 	= img_h;

		// paper 
			currentPaper = paper.setup(canvas_id);

			const Raster 		= currentPaper.Raster
			const Tool 			= currentPaper.Tool
			const Point 		= currentPaper.Point
			const view 			= currentPaper.view
			const project 		= currentPaper.project
			var zoomselecion 	= currentPaper.zoomselecion	

		// raster				
			const raster = new Raster('img_'+canvas_id);
				  raster.position = view.center;

		// zoom
			var nivelZoom = null

			// zoomselecion function
			zoomselecion = function(nivelZoom) {
				var a 			= nivelZoom/100;
				var ratioZoom 	= a/zoomActual;
				zoomActual = a; 
				canvas_obj.width 	= canvas_obj.width * ratioZoom;
				canvas_obj.height 	= canvas_obj.height * ratioZoom;

				//console.log(canvas_obj.width);
				//console.log(canvas_obj.height);

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

			// create select document.body
			//var contexto = canvas_obj.parentNode.parentNode;
			/*var contexto = document.getElementsByClassName('image_buttons')[0];
			var estado="zoom";

				var select = document.createElement("select");
				select.setAttribute("name", estado);
				select.setAttribute("id", estado);
				select.style.width = "75px";
				//console.log(event);
				//select.onchange = func;
				//console.log(func);

				// añadimos las opciones
			var option;
				//console.log(zoomOpciones.length);
				for ( var i = 0; i < zoomOpciones.length; i++ ){
					option = document.createElement("option");
					option.setAttribute("value", zoomOpciones[i]);
					//if (zoomOpciones[i] == "100"){
					//	option.setAttribute("selected", true);
					//}
					//option.value = '1';
					//option.appendChild(document.createTextNode('PM'));
					option.innerHTML = zoomOpciones[i] + "%";
					select.appendChild(option);
				}

			//lo añadidmos a la página
			contexto.appendChild(select);*/		

		// zoom selector
			const zoom_select = document.getElementById('zoom');
				  zoom_select.addEventListener("change",function(){
					nivelZoom = this.value;
					toolZoom.activate(); 
					zoomselecion(nivelZoom);

					const button_puntero = wrapper.querySelector("[data-tool_name='puntero']")
					self.active_tool(button_puntero)
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
							canvas_obj.width 	= canvas_obj.width * 0.5;
							canvas_obj.height 	= canvas_obj.height * 0.5;
							//canvas_obj.scale(zoomActual * 0.5, zoomActual * 0.5);
							//canvas_obj.restore();
							//canvas_obj.draw();
							view.zoom = zoomActual * 0.5;
							//view.scrollBy(0,0);
							view.scrollBy(new Point(-view.bounds.x, -view.bounds.y));
							//canvas_obj.style.backgroundPosition(event.point.x, );
							//var ctop=(-ui.position.top * canvas_obj.height / canvasWrapperHeight);
							zoomActual = zoomActual * 0.5;
							return;
						}else{
							canvas_obj.width 	= canvas_obj.width * 2.0;
							canvas_obj.height 	= canvas_obj.height * 2.0;
							//canvas_obj.scale(zoomActual * 2.0, zoomActual * 2.0);
							//canvas_obj.restore();
							//canvas_obj.draw();
							view.zoom = zoomActual * 2.0;
							//view.scrollBy(0,0);
							view.scrollBy(new Point(-view.bounds.x, -view.bounds.y));
							$(canvas_obj.parentNode).animate({ scrollTop: event.point.y + canvas_obj.parentNode.scrollTop, scrollLeft: event.point.x + canvas_obj.parentNode.scrollLeft}, 0);	

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
				var div_width 	 = canvas_obj.parentNode.clientHeight;
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
		
		//});//end $(canvas_obj).find('img').first().load(function()		

		return true
	}//end this.init_canvas




	//Botones de tools
	//SELECT del ZOOM
	// Crear opciones de select para el zoom			
	this.load_draw_editor = function(tag) {

		// MODE : Only allow mode 'tool_transcription'
		if(page_globals.modo!=='tool_transcription') return null;
	
		if (this.buttonsLoaded===false){
			this.buttonsLoaded = true;
			this.cargar_tools();
		}

		//console.log(tag);
		const parts_of_tag = component_image.get_parts_of_tag(tag);

		ar_tag_loaded[parts_of_tag.capaId] = tag;

		const data 	 = parts_of_tag.data;
		const capaId = parts_of_tag.capaId +'_layer';
		/*
		*ATENTION THE NAME OF THE TAG (1) CHANGE INTO (1_LAYER) FOR COMPATIBILITY WITH PAPER LAYER NAME
		*WHEN SAVE THE LAYER TAG IT IS REMOVE TO ORIGINAL TAG NAME OF DÉDALO. "draw-n-1-data"
		*BUT THE LAYER NAME ALWAYS ARE "1_layer"
		*/
		
		/* setting an onchange event */
		//selectNode.onchange = function() {dbrOptionChange()};
		 /* we are going to add two options */
		/* create options elements 
	 
		option = document.createElement("option");
		option.setAttribute("value", "100%");
		option.innerHTML = "100";
		select.appendChild(option);*/
		//CON PAPER
		//paper.setup(canvas_id);
		
		// curent paper vars
		const project = currentPaper.project
		const Layer   = currentPaper.Layer
		const Color   = currentPaper.Color

		//IMPORTACION DE CAPAS
			if ( data.indexOf('Layer')!=-1 ) {
				
				//project.layers[capaId].remove();
				//children['example'].fillColor = 'red';
				const p_len = project.layers.length
				for (var i = p_len - 1; i >= 0; i--) {				
					if (project.layers[i].name===capaId){
						project.layers[i].remove();
							console.log("-> borrada capa: " + capaId);
					}
				}
				var capa = project.importJSON(data);
					console.log("-> importada json capa: " + capa.name);

				var color = capa.fillColor;
				
				project.deselectAll();
				project.view.draw();
				//console.log(project.layers[1].name);
				//console.log(capa.fillColor);
			}else{
				var create_new_capa = true
				// Verificamos si el nombre del layer existe

				const c_len = project.layers.length
				for (var i = c_len - 1; i >= 0; i--) {					
					if (project.layers[i].name == capaId){
						var capa = project.layers[i];
							capa.activate();
						create_new_capa = false;
						console.log("-> usando existente capa: " + capa.name);
						break;
					}
				}//end for
				if (create_new_capa == true) {
					var capa = new Layer();
						capa.name = capaId;					
					var color = new Color({
						hue: 360 * Math.random(),
						saturation: 1,
						brightness: 1,
						alpha: 0.3,
						});
					capa.fillColor = color;	
					console.log("-> creada nueva capa: " + capa.name);	
				}

			};// end else
			segment = path = movePath = handle = handle_sync = null;
			capa.activate();
			project.view.draw();
			project.deselectAll();
			project.options.handleSize = 8;
		
		return true
	}//end load_draw_editor
	

	
	/**
	* CARGAR_TOOLS
	*/
	this.cargar_tools = function(){

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

			if (this.buttonsLoaded == true) {
				createButton(contexto, "cuadrado", function(){ 
								cuadrado.activate(); 
						});
				createButton(contexto, "circulo", function(){ 
								circulo.activate(); 
						});

				createButton(contexto, "puntero", function(){ 
								puntero.activate(); 
						});

				createButton(contexto, "vectores", function(){ 
								vectores.activate(); 
						});

				createButton(contexto, "añadido", function(){ 
								anadido.activate(); 
						});
				createButton(contexto, "salvar", function(){ 
								salvar();
						});


				this.buttonsLoaded = true;		
			}//end if (this.buttonsLoaded == true)

			*/

		// paper. Curent paper vars
			const project = currentPaper.project
			const Layer   = currentPaper.Layer
			const Color   = currentPaper.Color
			const Tool    = currentPaper.Tool
			const Point   = currentPaper.Point
			const Size    = currentPaper.Size
			const Path    = currentPaper.Path


		// cuadrado 
			this.cuadrado = new Tool();
			this.cuadrado.onMouseDown = function(event){
				// Reset vars
				segment = path = movePath = handle = handle_sync = null;
				project.deselectAll();
			}
			this.cuadrado.onMouseDrag = function(event){
				//console.log(project.activeLayer.name);
				//var rect = new Rectangle();
				const tama = new Size ({
					width: event.point.x - event.downPoint.x,
					height: event.point.y - event.downPoint.y
				});

				const cuadradopath = new Path.Rectangle({
					point: event.downPoint,
					size: tama,
					fillColor: project.activeLayer.fillColor,
					strokeColor: 'black'
				});

				// Remove this path on the next drag event:
				cuadradopath.removeOnDrag();
			}


		// circulo 
			this.circulo = new Tool();
			this.circulo.onMouseDown = function(event){
				// Reset vars
				segment = path = movePath = handle = handle_sync = null;
				project.deselectAll();
			}
			this.circulo.onMouseDrag = function(event){
				
				const a = new Point({
					x: event.downPoint.x - event.point.x,
					y: event.downPoint.y - event.point.y,
				})

				const circulopath = new Path.Circle({
					center 		: event.downPoint,
					radius 		: a.length,
					fillColor 	: project.activeLayer.fillColor,
					strokeColor : 'black'
				})
				//console.log((event.downPoint.x - event.point.x).length);

				// Remove this path on the next drag event:
				circulopath.removeOnDrag()
			}


		// añadir punto 
			this.anadido = new Tool();			
			this.anadido.onMouseDown = function(event) {
				// Reset vars
				segment = path = movePath = handle = handle_sync = null;
				var hitResult = project.hitTest(event.point, hitOptions);
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
			this.anadido.onMouseMove = function(event){
				var hitResult = project.hitTest(event.point, hitOptions);
				project.activeLayer.selected = false;
				if (hitResult && hitResult.item)
					hitResult.item.selected = true;
			}			
			this.anadido.onMouseDrag = function(event) {
				if (segment) {
					segment.point.x = event.point.x;
					segment.point.y = event.point.y;
				}
			}
				

		// puntero 
			this.puntero = new Tool();
			this.puntero.onMouseDown = function(event) {
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
					console.log("[cargar_tools] hitResult:",hitResult);
				}					
				if (hitResult) {
					switch(hitResult.type) {

						case ('fill'):
							project.deselectAll()
							path = hitResult.item
							var capa = path.layer
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
							var location = hitResult.location;
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
			this.puntero.onMouseMove = function(event){
				var hitResult = project.hitTest(event.point, hitOptions);
				project.activeLayer.selected = false;
				if (hitResult && hitResult.item)
					hitResult.item.selected = true;
			}*/
			this.puntero.onMouseDrag = function(event) {
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
			this.puntero.onKeyUp = function(event){
				if (event.key==="backspace" || event.key==="delete"){
					//console.log(event.key);
					const seleccionados = project.selectedItems;
					//console.log(seleccionados);
					const sec_len = seleccionados.length
					for (var i = sec_len - 1; i >= 0; i--) {
						seleccionados[i].remove()
						segment = path = null;
					}
				}
			}


		// vectores 
			this.vectores = new Tool()
			var findHandle = function(path, point) {
				//console.log("path: " + path);
				//console.log("path.segments.length "+path.segments.length);
				const s_len = path.segments.length
				for (var i = s_len - 1; i >= 0; i--) {

					for (var j = 0; j < 3; j++) {

						var type 		 = types[j]
						var segment 	 = path.segments[i]
						var segmentPoint = {}
						
						if (type==='point'){
							segmentPoint = segment.point;
						}else{
							segmentPoint.x = segment.point.x + segment[type].x;
							segmentPoint.y = segment.point.y + segment[type].y;
						}
						//var segmentPoint = type == 'point'
						//		? segment.point
						//		: segment.point.x + segment[type].x;
						var distancia = new Point;// = (point - segmentPoint).length;
							distancia.x = (point.x - segmentPoint.x);
							distancia.y = (point.y - segmentPoint.y);
						var distance = distancia.length;

						//console.log("point " + point);
						//console.log("segmentPoint: " + segmentPoint);
						//console.log("distance " + distance);

						if (distance < 3) {
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
			this.vectores.onMouseDown = function(event) {
				
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

				var result = findHandle(path, event.point)				
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
			
			this.vectores.onMouseDrag = function(event) {
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


		// activate de default tool puntero 
			const button_puntero = main_buttons.querySelector("[data-tool_name='puntero']")
			this.active_tool(button_puntero)


		return true
	}//end cargar_tools



	/**
	* ACTIVE_TOOL
	* @return 
	*/
	this.active_tool = function(button) {

		const tool_name = button.dataset.tool_name
		
		// Activate tool
		this[tool_name].activate()

		// Reset all butons apperance
		const ar_buttons = button.parentNode.querySelectorAll(".button_activate")
		for (var i = ar_buttons.length - 1; i >= 0; i--) {
			if (ar_buttons[i].classList.contains("button_active")) {
				ar_buttons[i].classList.remove("button_active")
			}			
		}

		// Hilite current
		button.classList.add("button_active")

		return true
	};//end active_tool



	/**
	* SAVE
	* @return bool true
	*/
	this.save = function() {

		// currentPaper. Is a global window var
		const project = currentPaper.project

		const tag_obj		= ar_tag_loaded[project.activeLayer.name.replace('_layer','')]
		const parts_of_tag 	= component_image.get_parts_of_tag(tag_obj)
		const tagId 		= parts_of_tag.capaId
		const tagState 		= parts_of_tag.tagState
		const data 			= project.activeLayer.exportJSON()
		
		const related_tipo 	= JSON.parse(this.related_tipo)[0]
		if(related_tipo.length <= 0 ){
			console.log("[save_draw_data] Error on locate this.related_tipo");
			return false
		}
		
		// UPDATE : Actualiza el contenido data del tag (y fuerza this.save en el text area)					
		// ar_tag_loaded[project.activeLayer.name] = component_text_area.update_svg_tag(tag,tagId,tagState,data);
		const new_data_obj = {
			data : replaceAll('"', '\'', data)
		}

		const tag_data = {
			component_tipo 	: related_tipo,
			type 			: tag_obj.dataset.type,
			tag_id 			: tag_obj.dataset.tag_id,
			id 				: tag_obj.id
		}
		if(SHOW_DEBUG===true) {
			//console.warn("[component_image.save] tag_data",tag_data);
		}
		ar_tag_loaded[project.activeLayer.name] = component_text_area.update_tag(tag_data, new_data_obj, true); // tag_obj, new_data_obj, container, save				
		//alert(tag);

		return true
	}//end save
				


	/**
	* GET_PARTS_OF_TAG
	*/
	this.get_parts_of_tag = function(tag_obj){

		const tagState 	= tag_obj.dataset.state
		const capaId 	= tag_obj.dataset.tag_id
		let data 	 	= tag_obj.dataset.data			
			data 		= replaceAll('\'','"',data) // restore double quotes "

		const parts_of_tag = {
			capaId 	 : capaId,
			tagState : tagState,
			data 	 : data
		}

		return parts_of_tag
	}//end get_parts_of_tag



};//end class