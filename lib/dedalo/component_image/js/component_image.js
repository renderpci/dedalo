


/**
* COMPONENT_IMAGE
*/
var component_image = new function() {

	// URL TRIGGER
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_image/trigger.component_image.php';

	this.related_tipo = null;

	var cuadrado,
		circulo,
		puntero,
		anadido,
		vectores,
		toolZoom,
		salvar		

	var canvas_obj, context, 
		canX , canY , canXold =0 , canYold =0, mouseIsDown = 0, len = 0;
	var node =[];
	var currentPaper;
	var buttonsLoaded = false;
	var ar_tag_loaded = new Array();

	var movePath = false;
	var segment, path, handle, handle_sync, movePath;
	var types = ['point', 'handleIn', 'handleOut'];
	var currentSegment, mode, type;
	var hitOptions = {
		segments: true,
		stroke: true,
		fill: true,
		tolerance: 5
	};


	switch(page_globals.modo) {

		case 'tool_transcription':
			break;
		case 'edit':
			break;
		case 'list':
			$(function() {
				// Remove background spinner in image container
				$('img.thumb_in_list').on('load', function(){
				    $(this).parent('.div_image_image_in_list').css({backgroundImage:'none'});
				    	//if(DEBUG) console.log('new image loaded: ' + this.src);
				})			
			});
			break;
	}


	// CANVAS : INIT
	this.init_canvas = function(canvas_id, id_wrapper) {

		// Fix vars
		var wrapper = document.getElementById(id_wrapper)				
		this.related_tipo = wrapper.dataset.related_tipo
		
		
		//paper.install(window);		
		window.addEventListener("load", function (event) {
		//$(function() {			

			// CANVAS
			canvas_obj = document.getElementById(canvas_id);
				//console.log(canvas_obj)


			// INIT CANVAS ONLY WHEN IMAGE IS LOADED
			//$(canvas_obj).find('img').first().on('load', function() {

				//MSG
				//document.getElementById('header_info').innerHTML ="canvas with standar js";

				context 	= canvas_obj.getContext('2d');
				
				// IMG
				var img 	= document.getElementById('img_'+canvas_id),
					img_w 	= img.naturalWidth,
					img_h 	= img.naturalHeight;
					//canvas_obj.width = window.innerWidth;
					//canvas_obj.height = window.innerHeight;

					//console.log(ratio_window );
					//console.log(1/ratio_window );
					//console.log(img_h);
					

				// CANVAS -> IMAGE MATCH SIZE
				canvas_obj.width 	= img_w;
				canvas_obj.height 	= img_h;
				/**/
//return;
			//	var zoomOpciones = new Array(
			//		'800','400','200','100','75','50','25','12.5','6.25','5','1','');
				var nivelZoom = null;

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
				var select = document.getElementById('zoom');
				select.onchange = function(){
						nivelZoom = select.value;
						toolZoom.activate(); 
						zoomselecion(nivelZoom);
				}

				// PAPER 
				currentPaper = paper.setup(canvas_id);
				with(currentPaper) {
					//var zoomLayer = project.activeLayer.scale;
						 //var zoomLayer = item.bounds.size;
					//console.log (zoomLayer);
						var raster = new Raster('img_'+canvas_id);
						raster.position = view.center;
						var zoomActual = 1.0;
						
					// ZOOM
						toolZoom = new Tool();
						toolZoom.onMouseDown = function(event) {

							segment = path = null;
							var hitResult = project.hitTest(event.point, hitOptions);
							if (hitResult) {
									path = hitResult.item;
									//console.log(hitResult.type);
									if (hitResult.type == 'pixel') {		
										var location = hitResult.location;
										//segment = path.insert(location.index +1, event.point);
										if (event.modifiers.shift) {
											canvas_obj.width 		= canvas_obj.width * 0.5;
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

							zoomselecion = function(nivelZoom) {
								a = nivelZoom/100;
								ratioZoom = a/zoomActual;
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
								return;
							}//end zoomselecion = function(nivelZoom)
			
						//var contexto = canvas_obj.parentNode.parentNode;
				
						//if(ratio_window < 1){

							//var ventana_h =  window.innerHeight;
							//var ventana_h_util 	= ventana_h - 60;
							//var ratio_window 	= ventana_h_util /img_h;
							div_width= canvas_obj.parentNode.clientHeight;
							

							var ratio_window 	= div_width /img_h;


							porcentaje = ratio_window*100;
							zoomselecion(porcentaje);
							porcentaje_round = Math.round(porcentaje * 100) / 100;
							//console.log(porcentaje_round);
							//var seleccion_zoom = document.getElementById("zoom");
							var option = document.createElement("option");
		
							//option = document.createElement("option");
							//select.insert(new Element('option', {value: ratio_window, selected: true }).update('zoom'));
							option.setAttribute("value", porcentaje_round);
							option.setAttribute("selected", true);
							option.innerHTML = porcentaje_round + "%";
							//option.value = '1';
							//option.appendChild(document.createTextNode('PM'));
							//option.innerHTML = zoomOpciones[i] + "%";
							select.options[11] =option;
							select.selectedIndex = 11;
							seleccion_de_zoom = 11;
							//select.lastChild.text(option);
							//ratio_window = 1;
						//}
				

					// Get a reference to the canvas object
					//var canvas = document.getElementById('myCanvas');
					// Create an empty project and a view for the canvas:
					//console.log(tool)
				}//end with(currentPaper)			

			//});//end $(canvas_obj).find('img').first().load(function()
		
		});//end onload window

	}//end this.init_canvas
	//Variables generales de los tools



//Botones de tools
			//SELECT del ZOOM
			// Crear opciones de select para el zoom
			
	this.load_svg_editor = function(tag) {

		// MODE : Only allow mode 'tool_transcription'
		if(page_globals.modo!=='tool_transcription') return null;

		if (buttonsLoaded == false){
				buttonsLoaded = true;
				this.cargartools();

			}

		//console.log(tag);
		parts_of_tag = component_image.get_parts_of_tag(tag);

		ar_tag_loaded[parts_of_tag.capaId]=tag;

		var data 		= parts_of_tag.data;
		var capaId 		= parts_of_tag.capaId;
		/*
		*ATENTION THE NAME OF THE TAG (1) CHANGE INTO (1_LAYER) FOR COMPATIBILITY WITH PAPER LAYER NAME
		*WHEN SAVE THE LAYER TAG IT IS REMOVE TO ORIGINAL TAG NAME OF DÉDALO. "svg-n-1-data"
		*BUT THE LAYER NAME ALWAYS ARE "1_layer"
		*/
		capaId			= capaId+'_layer';
		

		
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
		with(currentPaper) {

		//IMPORTACION DE CAPAS
			if ( data.indexOf('Layer')!=-1 ) {
				
				//project.layers[capaId].remove();				
				//children['example'].fillColor = 'red';
				var p_len = project.layers.length
				for (var i = p_len - 1; i >= 0; i--) {				
					if (project.layers[i].name == capaId){
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
				var create_new_capa = true;
				// Verificamos si el nombre del layer existe

				var c_len = project.layers.length
				for (var i = c_len - 1; i >= 0; i--) {					
					if (project.layers[i].name == capaId){
						capa = project.layers[i];
						capa.activate();
						create_new_capa = false;
						console.log("-> usando existente capa: " + capa.name);
						break;
					}
				}//end for
				if (create_new_capa == true) {
					var capa = new Layer();
					capa.name = capaId;
					console.log("-> creada nueva capa: " + capa.name);
					var color = new Color({
						hue: 360 * Math.random(),
						saturation: 1,
						brightness: 1,
						alpha: 0.3,
						});
					capa.fillColor = color;		
				}

			};// end else
			segment = path = movePath= handle= handle_sync = null;
			capa.activate();
			project.view.draw();
			project.deselectAll();
			project.options.handleSize = 8;
		};//end whith(paper)

	};// end load_svg_editor
			
	

	
	/**
	* CARGARTOOLS
	*/
	this.cargartools = function(){

		$('.main_buttons').show();

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

			if (buttonsLoaded == true) {
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


				buttonsLoaded = true;		
			}//end if (buttonsLoaded == true)

			*/

			with(currentPaper) {
		//CUADRADO
				this.cuadrado = new Tool();

				this.cuadrado.onMouseDown = function(event){
					segment = path = movePath= handle= handle_sync= null;
					project.deselectAll();
				};

				this.cuadrado.onMouseDrag = function(event){
					//console.log(project.activeLayer.name);
					//var rect = new Rectangle();
					var tama = new Size ({
						width: event.point.x - event.downPoint.x,
						height: event.point.y - event.downPoint.y
						});

					var cuadradopath = new Path.Rectangle({
						point: event.downPoint,
						size: tama,
						fillColor: project.activeLayer.fillColor,
						strokeColor: 'black'
					});

					// Remove this path on the next drag event:
					cuadradopath.removeOnDrag();
				};
		//CIRCULO
				this.circulo = new Tool();

				this.circulo.onMouseDown = function(event){
					segment = path = movePath= handle= handle_sync= null;
					project.deselectAll();
				};

				this.circulo.onMouseDrag = function(event){
					//var rect = new Rectangle();
					var a =new Point ({
						x: event.downPoint.x - event.point.x,
						y: event.downPoint.y - event.point.y,
						});

					var circulopath = new Path.Circle({
						center: event.downPoint,
						radius: a.length,
						fillColor: project.activeLayer.fillColor,
						strokeColor: 'black'
					});

					//console.log((event.downPoint.x - event.point.x).length);

					// Remove this path on the next drag event:
					circulopath.removeOnDrag();
				};


		//AÑADIR PUNTO				
				this.anadido =new Tool();
				
				this.anadido.onMouseDown = function(event) {
					segment = path = movePath= handle= handle_sync= null;
					var hitResult = project.hitTest(event.point, hitOptions);
					if (hitResult) {
							path = hitResult.item;
							//console.log(hitResult.type);
							if (hitResult.type == 'stroke') {		
								var location = hitResult.location;
								segment = path.insert(location.index +1, event.point);
								//path.smooth();
							}
						}
				};
					
				this.anadido.onMouseMove = function(event){
					var hitResult = project.hitTest(event.point, hitOptions);
					project.activeLayer.selected = false;
					if (hitResult && hitResult.item)
						hitResult.item.selected = true;
				};
				
				this.anadido.onMouseDrag = function(event) {
					if (segment) {
						segment.point.x = event.point.x;
						segment.point.y = event.point.y;
					}
				};
				
		//PUNTERO			
				this.puntero = new Tool();

				this.puntero.onMouseDown = function(event) {
					segment = path = movePath= handle= handle_sync= null;
					//project.activeLayer.selected = false;
					var hitResult = project.hitTest(event.point, { fill: true, stroke: true, segments: true, tolerance: 5, handles: true });

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

					if (hitResult) {
						if(hitResult.type == 'fill'){

							project.deselectAll();
							path = hitResult.item;
							capa = path.layer;
							capa.activate();

							if (event.modifiers.shift) {
								hitResult.item.remove();
							};

							//console.log(capa.name)
							path.selected = true;
							movePath = hitResult.type == 'fill';
						}
						if(hitResult.type == 'pixel'){
							project.deselectAll();
							project.activeLayer.selected = false;
							//path.selected = false;
							//path = null;
						}
						//console.log(hitResult.type);
						if (hitResult.type == 'segment') {
							project.deselectAll();
							path = hitResult.item;
							path.fullySelected = true;
							segment = hitResult.segment;
							if (event.modifiers.shift) {
								hitResult.segment.remove();
							};
							if (event.modifiers.command) {
								if(segment.hasHandles()){
									hitResult.segment.clearHandles();
								}
								handle_sync = hitResult.segment.handleIn;
								handleIn = hitResult.segment.handleIn;
								handleOut = hitResult.segment.handleOut;
								segment = "";
							};

							//segment = hitResult.segment;


						} 
						if (hitResult.type == 'stroke') {
							var location = hitResult.location;
							path = hitResult.item;
							segment = path.insert(location.index +1, event.point);
							//path.smooth();
						}
						if (hitResult.type == 'handle-in') {	
							handle = hitResult.segment.handleIn;
							if (event.modifiers.command) {
								handle_sync = hitResult.segment.handleIn;
								handleIn = hitResult.segment.handleIn;
								handleOut = hitResult.segment.handleOut;
								handle = "";
							};
						}
						if (hitResult.type == 'handle-out') {	
							handle = hitResult.segment.handleOut;
							if (event.modifiers.command) {
								handle_sync = hitResult.segment.handleOut;
								handleIn = hitResult.segment.handleOut;
								handleOut = hitResult.segment.handleIn;
								handle = "";
							};
						}			
						//console.log(hitResult.type);
					}					
					
					/*if (movePath)
						project.activeLayer.addChild(hitResult.item);*/
				};
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
				};
				this.puntero.onKeyUp = function(event){

					if (event.key == "backspace" || event.key == "delete"){
						//console.log(event.key);
						var seleccionados = project.selectedItems;
						//console.log(seleccionados);
						var len = seleccionados.length
						for (var i = len - 1; i >= 0; i--) {						
							seleccionados[i].remove();
							segment = path = null;
						}			
					}
				};



		//VECOTRES
				this.vectores =new Tool();

				findHandle = function(path, point) {
					//console.log("path: " + path);
					//console.log("path.segments.length "+path.segments.length);
					var s_len = path.segments.length
					for (var i = s_len - 1; i >= 0; i--) {

						for (var j = 0; j < 3; j++) {
							var type = types[j];
							var segment = path.segments[i];
							if (type == 'point'){
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
									type: type,
									segment: segment
								};
							}
						}
					}
					//console.log(point)
					return null;
				};
				//console.log("path: "+path);
				//function onMouseDown(event) {
				this.vectores.onMouseDown = function(event) {
					//console.log(currentSegment);

					if (currentSegment){
						currentSegment.selected = false;
					}				
					mode = type = currentSegment = null;
					//
					if (!path) {
						path = new Path({
							strokeColor : 'black',
							fillColor : project.activeLayer.fillColor
						});
					}

					var result = findHandle(path, event.point);
					console.log("result: " + result);
					if (result) {
						currentSegment = result.segment;
						type = result.type;
						//console.log(path.segments.length);
						//console.log(result.type);
						//console.log(result.segment.index);

						if (path.segments.length > 1 && result.type == 'point'
								&& result.segment.index == 0) {
							mode = 'close';
							path.closed = true;
							path.selected = false;
							path = null;
						}
					}

					if (mode != 'close') {						
						mode = currentSegment ? 'move' : 'add';
						if (!currentSegment)
							currentSegment = path.add(event.point);
						currentSegment.selected = true;
					}
				};
				
				this.vectores.onMouseDrag = function(event) {
					if (mode == 'move' && type == 'point') {
						currentSegment.point = event.point;
					} else if (mode != 'close') {
						var delta = event.delta.clone();	
						if (type == 'handleOut' || mode == 'add') {
							//console.log(delta.x +" "+(delta.x)*-1)
							//console.log(delta)
							//delta = -delta;
							delta.x =	(delta.x)*-1
							delta.y =	(delta.y)*-1	

						}
						//console.log(delta);						
						//currentSegment.handleIn += delta;
						currentSegment.handleIn.x += delta.x;
						currentSegment.handleIn.y += delta.y;

						//currentSegment.handleOut -= delta;
						currentSegment.handleOut.x -= delta.x;
						currentSegment.handleOut.y -= delta.y;
					}
				};

		// SALVAR
				this.salvar = function(){
					//capa.activate();
					//console.log (project.activeLayer.exportJSON());
					// TAG : Obtiene el nombre que es el del layer activo

					var tag_obj			= ar_tag_loaded[project.activeLayer.name.replace('_layer','')],
						parts_of_tag 	= component_image.get_parts_of_tag(tag_obj),
						tagId 			= parts_of_tag.capaId,
						tagState 		= parts_of_tag.tagState,
						data 			= project.activeLayer.exportJSON();


					//console.log(tag_obj)					
					
					var related_tipo = JSON.parse(this.related_tipo)[0]
					if(related_tipo.length <= 0 ){
						console.log("[save_draw_data] Error on locate this.related_tipo");
						return false
					}
					
					// UPDATE : Actualiza el contenido data del tag (y fuerza this.salvar en el text area)					
					// ar_tag_loaded[project.activeLayer.name] = component_text_area.update_svg_tag(tag,tagId,tagState,data);
					var new_data_obj = {
						data : replaceAll('"', '\'', data)
					}

					let tag_data = {
						component_tipo 	: related_tipo,
						type 			: tag_obj.dataset.type,
						tag_id 			: tag_obj.dataset.tag_id,
						id 				: tag_obj.id
					}
					if(SHOW_DEBUG===true) {
						//console.warn("[component_image.salvar] tag_data",tag_data);
					}					
					ar_tag_loaded[project.activeLayer.name] = component_text_area.update_tag(tag_data, new_data_obj, true); // tag_obj, new_data_obj, container, save
					
					//alert(tag);
				};
				//activate de default tool this.puntero
				this.puntero.activate();
			};//end whith(paper)
		}; //end cargartools
				


	/**
	* GET_PARTS_OF_TAG
	*/
	this.get_parts_of_tag = function(tag_obj){

		var tagState 	= tag_obj.dataset.state;
		var capaId 		= tag_obj.dataset.tag_id;
		var data 		= tag_obj.dataset.data;		
			// RESTORE QUOTES "
			data = replaceAll('\'','"',data);

		var parts_of_tag = new Object({
			capaId 	 : capaId,
			tagState : tagState,
			data 	 : data
		});
		//console.log(parts_of_tag);

		return parts_of_tag;
	}//end get_parts_of_tag



	/**
	* GET_TAG_OBJ_FROM_PARTS
	* @return 
	*/
	this.get_tag_obj_from_parts = function() {
		
	};//end get_tag_obj_from_parts



}; //end class