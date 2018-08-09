

var component_geolocation = new function() {
	
	this.maps = new Array();
	var map;
	this.save_arguments = {	} // End save_arguments
	this.DEDALO_GEO_PROVIDER;
	
	//DCA 2015/03/05
	//var drawnItems;
	var drawnItems = new Array(); //DCA 2015/03/05	
	var ar_drawnItems = new Array();
	var ar_tag_loaded = new Array();	// almacena las etiquetas completas cuando se pulsa sobre ellas ([geo-n-1-data:['Layer',{..}]:data])

	var draw_data = null;

	this.Save = function(component_obj, value) {
		
		// Exec general save
		var saveArguments=this.save_arguments;
		saveArguments['dato']=value;
		component_common.Save(component_obj, saveArguments);

		// Update possible dato in list (in portal x example)
		//component_common.propagate_changes_to_span_dato(component_obj);
		
	}

	/**
	* SAVE_DRAW_DATA
	*/
	this.save_draw_data = function() {

		if(draw_data==null) return;

		var current_draw_data = JSON.stringify(draw_data.toGeoJSON());			
			console.log( "save_draw_data for ["+current_editable_FeatureGroup_id + "]: \n"+current_draw_data )

		var tag 			= ar_tag_loaded[current_editable_FeatureGroup_id],
			parts_of_tag 	= component_geolocation.get_parts_of_tag(tag),
			tagId 			= parts_of_tag.capaId,
			tagState 		= parts_of_tag.tagState,
			data 			= current_draw_data;

		component_text_area.update_geo_tag(tag, tagId, tagState, data);
	}


	
	
	
	this.init_map = function( div_container_id ) {		

		//window.onload = function() {
		$(function() {

			//DCA 2015 03 04
			//var obj=$(div_container_id);					

			//Josetxo 19/01/2015
			var geoX = 42.819404;
			var geoY = -1.646205;
			var zoom = 16;			
			draw_data = null;
			//


			//DCA 2015 03 04
			//var objGeo = $('div.css_wrap_geolocation');
			var objGeo = $('#wrapper_'+div_container_id); //DCA 2015 03 04				
			var objValue = objGeo.find('.css_wrap_geolocation_dato_hidden');						
			if(objValue != undefined && objValue.length == 1){
				try{
					var objJSON = $.parseJSON(objValue[0].innerHTML);
					geoX = objJSON.centro.center.split(',')[0];
					geoY = objJSON.centro.center.split(',')[1];
					zoom = parseInt(objJSON.centro.zoom);										
					draw_data = objJSON.draw_editor;					
				}catch(ex){}
			}

			// Define main map element default data
			var map_data = {
				x		: geoX,
				y		: geoY,
			 	zoom	: zoom,
			};	
			// Fin Josetxo 19/01/2015

			if(DEBUG) console.log("init map: "+div_container_id)
			
			//console.log("div_container_id:"+div_container_id)
			if(DEBUG) console.log("DEDALO_GEO_PROVIDER: "+component_geolocation.DEDALO_GEO_PROVIDER);

			map = component_geolocation.maps[div_container_id];
			
			// Add layer to map
			switch( component_geolocation.DEDALO_GEO_PROVIDER ) {

				case 'OSM':
					map = new L.Map(div_container_id, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});		
					L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
						attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
						//attribution: '<a href="http://fmomo.org">Dedalo</a>',
						maxZoom: 18
					}).addTo(map);
					break;
				/*
				case 'COULDMADE':
					map = new L.Map(div_container_id, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});					
					L.tileLayer('http://{s}.tile.cloudmade.com/API-key/997/256/{z}/{x}/{y}.png', {
						attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://cloudmade.com">CloudMade</a>',
						maxZoom: 18
					}).addTo(map);
					break;
				*/
				case 'GOOGLE':
					map = new L.Map(div_container_id, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});				
				    var googleLayer = new L.Google('ROADMAP');
				    //map.addLayer(googleLayer);				    
				    googleLayer.addTo(map);
				    break;

				 case 'ARCGIS':
				 	map = new L.Map(div_container_id, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});			 	
			        L.tileLayer('http://server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
			        maxZoom: 18,
			        attribution: 'Tiles &copy; Esri — ' 
			            + 'Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, ' 
			            + 'Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'}).addTo(map);			        
			        break;

			    case 'VARIOUS':   
					 
					// LAYER
					//var arcgis 		= new L.tileLayer('http://server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
					//var cloudmade 	= new L.TileLayer('http://{s}.tile.cloudmade.com/BC9A493B41014CAABB98F0471D759707/997/256/{z}/{x}/{y}.png');
					//var osm 		= new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');	
                                        //var ggl 	= new L.Google();			        				
					//var ggl2 	= new L.Google('TERRAIN');	
					// Inicio - DCA 2015 02 16
					var idena		= new L.tileLayer.wms("http://idena.navarra.es/ogc/wms?", {
												        	layers: "ortofoto_5000_2014",//layer name (see get capabilities)
													        format: 'image/png',
													        transparent: false,
													        version: '1.1.1',//wms version (see get capabilities)
													        attribution: " IDENA - Infraestructura de Datos Espaciales de Navarra "															
													      });
					// Fin - DCA 2015 02 16
					
					
					// MAP
					// DCA 2015 02 16 map = new L.Map(div_container_id, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
					map = new L.Map(div_container_id, {layers: [idena], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom, crs: L.CRS.EPSG4326 });// DCA 2015 02 16 

					// Inicio - DCA 2015 03 13
					var idenanombrecapas = ["TOPONI_Txt_Toponimos",
										"ESTADI_Txt_EntidadPob",
										"INFRAE_Sym_CtraPK",
										"DOTACI_Sym_RecTur",
										"INFRAE_Lin_CtraEje",
										"INFRAE_Lin_CtraEje",
										"HIDROG_Lin_Hidroeje",
										"HIDROG_Pol_SuperfiAgua",
										"CATAST_Txt_Portal",
										"CATAST_Lin_CalleEje",
										"CATAST_Pol_CascoUrbano",
										"GEOLOG_Sym_Cuevas",
										"GANADE_Lin_ViasPecua",
										"PATRIM_Lin_CaminoSantR"];

					var idenadenominacapas = ["Topónimos",
										"Etiquetas de las Entidades Población",
										"Punto Km de la red de carreteras",
										"Recursos turísticos",
										"Ejes principales de la red de carreteras",
										"Ejes de la red de carreteras",
										"Ejes de la red hidrográfica",
										"Superficie de aguas",
										"Portales",
										"Ejes de las calles",
										"Cascos urbanos",
										"Cuevas, simas y manantiales",
										"Vías pecuarias",
										"Camino de santiago"];

					var i;
					var idenacapas = {};
					for (i = 0; i < idenanombrecapas.length; i++) { 
						var idenacapa	= new L.tileLayer.wms("http://idena.navarra.es/ogc/wms?", {
													        	layers: idenanombrecapas[i],//layer name (see get capabilities)
														        format: 'image/png',
														        transparent: true,
														        version: '1.1.1',//wms version (see get capabilities)
														        attribution: " IDENA - Infraestructura de Datos Espaciales de Navarra "															
														      });
						var namecapa = idenadenominacapas[i];
						idenacapas[namecapa] = idenacapa;
					}															
					// Fin - DCA 2015 03 03

			
					// LAYER SELECTOR
					// DCA 2015 02 16 map.addControl(new L.Control.Layers( {'Arcgis':arcgis, 'OSM':osm}, {}));															
					//map.addControl(new L.Control.Layers( {'Idena':idena}, {'Topónimos':idenacapas[0], 'Municipios y Concejos':idenacapas[2]})); //DCA 2015 02 16					
					map.addControl(new L.Control.Layers( {'Idena':idena},idenacapas)); //DCA 2015 02 16					

					//map.addControl(arcgis);	

					//DCA 2015 03 05
					////Josetxo 21/01/2015
					//component_geolocation.init_draw_editor_recorrido(objGeo);
					////Fin Josetxo 21/01/2015					

					// ADD_DRAW_EDIT_LAYER
					//component_geolocation.add_draw_edit_layer(map, tag_id);			

					break;
			}

			// disable zoom handlers
			map.scrollWheelZoom.disable();
			// disable tap handler, if present.
			if (map.tap) map.tap.disable();

			component_geolocation.maps[div_container_id] = map;

			//Inicio - DCA 2015 03 05
			if(component_geolocation.DEDALO_GEO_PROVIDER == 'VARIOUS'){
				component_geolocation.init_draw_editor(div_container_id);
				component_geolocation.load_draw_editor_data(div_container_id);
				component_geolocation.init_draw_editor_recorrido(objGeo);
			}
			//Fin - DCA 2015 03 05

			setTimeout(function(){
				map._onResize();

				//map.invalidateSize(false);
				//L.Util.requestAnimFrame(map.invalidateSize,map,!1,map._container);
				/*
				var tap = $('#'+div_container_id).parents('.css_section_group_wrap').first().children('.css_section_group_titulo');
				console.log(tap)
				$('body').on('click', tap, function(event) {
					alert("8")
				});;
				*/
			}, 3000)					
			

		//}//end window.onload
		});
		

	};//end this.draw_map



	/**
	* INIT_DRAW_EDITOR
	* @see https://github.com/Leaflet/Leaflet.draw/issues/66
	*/
	//DCA 2015/03/05
	//var drawControl;
	var drawControl = new Array(); //DCA 2015/03/05
	//DCA 2015/03/05
	//var draw_editor_is_initated = false;
	var draw_editor_is_initated = new Array(); //DCA 2015/03/05	
	//DCA 2015/03/06
	//var editable_FeatureGroup;
	var ar_FeatureGroup=[];
	//DCA 2015/03/05
	//this.init_draw_editor = function( current_editable_FeatureGroup) {
	this.init_draw_editor = function(leaflet_container_id) { //DCA 2015/03/05

		//DCA 2015/03/06
		//editable_FeatureGroup = current_editable_FeatureGroup;		

		//Inicio - DCA 2015/03/05
		map = component_geolocation.maps[leaflet_container_id]; 
		
		if(draw_editor_is_initated[leaflet_container_id]==undefined){
			draw_editor_is_initated[leaflet_container_id] = false
		}  
		//Fin - DCA 2015/03/05

		// DRAW CONTROL REMOVE : Si ya existe, lo eliminamos para poder crearlo de nuevo y que haya sólo uno activo
		//DCA 2015/03/05
		//if (drawControl != undefined) {
		//	drawControl.removeFrom(map);
		//};
		//Inicio - DCA 2015/03/05
		if (drawControl[leaflet_container_id] != undefined) {			
			map.removeControl(drawControl[leaflet_container_id]);	
			map.removeControl(drawnItems[leaflet_container_id]);			
			drawControl[leaflet_container_id]=undefined;						
			drawnItems[leaflet_container_id]=undefined;
			draw_editor_is_initated[leaflet_container_id] = false
		};
		//Fin - DCA 2015/03/05

		//Josetxo 21/01/2015
		//DCA 2015/03/05
		//if(current_editable_FeatureGroup===undefined){
		if(drawnItems[leaflet_container_id]==undefined){ //DCA 2015/03/05
			//DCA 2015/03/05
			//drawnItems = new L.FeatureGroup();
			//map.addLayer(drawnItems);
			//editable_FeatureGroup = drawnItems;			
			//Inicio - DCA 2015/03/05
			drawnItems[leaflet_container_id] = new L.FeatureGroup();
			map.addLayer(drawnItems[leaflet_container_id]);			
			//Fin - DCA 2015/03/05
		}

		//DCA 2015/03/05
		//component_geolocation.load_draw_editor_data();		

		//Fin Josetxo 21/01/2015
		
		/*
		// Initiated test
		if(draw_editor_is_initated==true) return;
		// map global var test
		if(typeof map == 'undefined') return alert("Error: map is undefined")

		// FeatureGroup
		editable_FeatureGroup = new L.FeatureGroup();
		map.addLayer(editable_FeatureGroup);
		*/

		if (drawControl[leaflet_container_id] == undefined){ //DCA 2015/03/06
			// DRAW CONTROL ///////////////////////////////////////////////////
			// El editor se inicaliza cada vez y recibe el FeatureGroup recién cargado como parámetro (ver https://github.com/Leaflet/Leaflet.draw/issues/66)
			//DCA 2015/03/05
			//drawControl = new L.Control.Draw({			
			drawControl[leaflet_container_id] = new L.Control.Draw({ //DCA 2015/03/05
				position: 'topright',
				draw: {
					polyline: {
						metric: true,
						shapeOptions: {
							color: '#31df25'
						}
					},
					polygon: {
						allowIntersection: false,
						showArea: true,
						drawError: {
							//color: '#b00b00',
							color: '#31df25',
							timeout: 1000
						},
						shapeOptions: {
							color: '#31df25'
						}
					},
					circle: {
						shapeOptions: {
							color: '#31df25'
						}
					},
					rectangle: {
						shapeOptions: {
							color: '#31df25'
						}
					},			
					//Inicio - DCA 2015/03/02 
					//polygon: false, 
	                //rectangle: false, 
	                //circle: false, 
	                //marker: false 
	                //Inicio - DCA 2015/03/02 
	                polygon: true, 
	                rectangle: false, 
	                circle: false, 
	                marker: true 
	                //Fin - DCA 2015/03/02 
				},
				edit: {
					//DCA 2015/03/06
					//featureGroup: editable_FeatureGroup
					featureGroup: drawnItems[leaflet_container_id] //DCA 2015/03/06
				}
			});	
		}; //DCA 2015/03/06
		//DCA 2015/03/05
		//map.addControl(drawControl);		
		//Añado es control de edición 


			// DRAW HANDLERS //////////////////////////////////////////////
			// !!IMPORTANTE : El editor se inicializa cada vez, pero los manejadores sólo una
			//DCA 2015/03/05
			//if(draw_editor_is_initated==true) return;
			if(draw_editor_is_initated[leaflet_container_id]==true) return; //DCA 2015/03/05
			map.on('draw:created', function (e) {	
				var type  = e.layerType,
					layer = e.layer;	

				//DCA 2015/03/06
				//editable_FeatureGroup.addLayer(layer);
				drawnItems[leaflet_container_id].addLayer(layer); //DCA 2015/03/06
				
				// Update draw_data				
				//DCA 2015/03/05 
				//draw_data = editable_FeatureGroup;								
				//component_geolocation.save_draw_editor();
				component_geolocation.save_draw_editor(leaflet_container_id); //DCA 2015/03/05
			
			});
			map.on('draw:edited', function (e) {
				// Update draw_data				
				//DCA 2015/03/05 
				//draw_data = editable_FeatureGroup;								
				//component_geolocation.save_draw_editor();
				component_geolocation.save_draw_editor(leaflet_container_id); //DCA 2015/03/05
			});
			map.on('draw:deleted', function (e) {
				// Update draw_data				
				//DCA 2015/03/05 
				//draw_data = editable_FeatureGroup;								
				//component_geolocation.save_draw_editor();
				component_geolocation.save_draw_editor(leaflet_container_id); //DCA 2015/03/05
			});

		// DRAW_EDITOR_IS_INITATED : Fija la variable a global a true (default is false) para evitar duplicidades
		//DCA 2015/03/05
		//draw_editor_is_initated = true;		
		draw_editor_is_initated[leaflet_container_id] = true; //DCA 2015/03/05

	}//end init_draw_editor


	

	/**
	* LOAD_GEO_EDITOR
	* Carga los datos al pulsar sobre la etiqueta. Inicializa el editor de no estar ya inicializado
	*/
	var current_editable_FeatureGroup_id;	
	this.load_geo_editor = function(tag) {
		
/*
	var points = [
				{ lat: 40.723697, lon: -8.468368 }];
		//console.log(tag);

		var canvasTiles = L.tileLayer.canvas();

		canvasTiles.drawTile = function(canvas, tilePoint, zoom) {
		    var ctx = canvas.getContext('2d');
		      var centerX = canvas.width / 2;
		      var centerY = canvas.height / 2;
		      var radius = 70;
		      var tileSize = this.options.tileSize;
		      var point = new L.LatLng(points[0].lat, points[0].lon);
		      var start = tilePoint.multiplyBy(tileSize);
		      var p = map.project(point);

				var x = Math.round(p.x - start.x);
				var y = Math.round(p.y - start.y);

			map.on('click', function(e) {
			    console.log(e.latlng.lat);
			    console.log(e.latlng.lng);
			    var x = Math.round(p.x - start.x);
				var y = Math.round(p.y - start.y);
			});
		     // console.log(x);
		     // console.log(y);
		     
		      //console.log(zoom);
			currentPaper = paper.setup(canvas);
		      with(currentPaper) {
				var circulo = new Tool();

				circulo.onMouseDown = function(event){
					segment = path = handle= null;
					project.deselectAll();
				};

				circulo.onMouseDrag = function(event){
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
					console.log(tilePoint);
					console.log((event.downPoint.x - event.point.x).length);

					// Remove this path on the next drag event:
					circulopath.removeOnDrag();
				};
			}

		      ctx.beginPath();
		      ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
		      ctx.fillStyle = 'green';
		      ctx.fill();
		      ctx.lineWidth = 5;
		      ctx.strokeStyle = '#003300';
		      ctx.stroke();

		}
		canvasTiles.addTo(map).bringToFront();


		return;*/



//Josetxo comentado
		// MODE VERIFY : Only allow mode 'tool_transcription'
		//if(page_globals.modo!=='tool_transcription') return null;

		// TAG : Extremos la información de la etiqueta seleccionada
		parts_of_tag = component_geolocation.get_parts_of_tag(tag);
		var data 	= parts_of_tag.data,
			capaId 	= parts_of_tag.capaId;

		// AR_TAG_LOADED : Store current tag
		ar_tag_loaded[capaId] = tag;		
		
		// FEATUREGROUP BUILD : Verificamos si existe ya el FeatureGroup y si no, lo creamos
		if( map.hasLayer(ar_FeatureGroup[capaId]) == false ) {		
			// Lo creamos nuevo
			ar_FeatureGroup[capaId] = new L.FeatureGroup();
			ar_FeatureGroup[capaId].addTo(map);
		}else{
			// Confirmamos su reescritura
			if( !confirm("Discard changes?") ) return;

			// FEATUREGROUP RESET : Como ya está definido, eliminamos todas sus posibles capas para cargar las nuevas			
			ar_FeatureGroup[capaId].clearLayers();	//delete ar_FeatureGroup[capaId];
		}		

		// LAYERS : Load layers from tag data
		//console.log("data: "+data)
		if (typeof data != 'undefined' && data != 'undefined') {			
			L.geoJson( JSON.parse(data) , {  
		    onEachFeature: function (feature, data_layer) {
		    		if(data_layer) ar_FeatureGroup[capaId].addLayer(data_layer)
				}
			})
		};
		
		// DRAW_EDITOR : Init draw editor and pass current FeatureGroup
		this.init_draw_editor( ar_FeatureGroup[capaId] )

		// OVERLAY : Lo añadimos al map ovelay (Adds an overlay (checkbox entry) with the given name to the control)
		//current_overlay = L.tileLayer(ar_FeatureGroup[capaId]);
		//L.control.layers({},{'current_overlay':current_overlay}).addTo(map);		

		// CURRENT_EDITABLE_FEATUREGROUP_ID : Fijamos como current editable el FeatureGroup actual
		current_editable_FeatureGroup_id = capaId;		

	};// end load_geo_editor



	/**
	* GET_PARTS_OF_TAG
	*/
	this.get_parts_of_tag = function(tag) {

		var ar_tag = tag.split('-');
		if (ar_tag[0] != '[geo'){
			return alert("invalid tag here!!!!");
			};
		var tagState 	= ar_tag[1];
		var capaId 		= ar_tag[2];
		//var pos 		= tag.indexOf('data:\'');
		//var	data 	= tag.substring( pos+6, tag.length-7); // ':data]
		var pos 		= tag.indexOf('data:');
		var	data 		= tag.substring( pos+5, tag.length-6); // :data]
		// RESTORE COMILLAS "
		data = replaceAll('\'','"',data);

		var parts_of_tag = new Object({
			capaId : capaId,
			tagState : tagState,
			data : data
		});
		//console.log(parts_of_tag);

		return parts_of_tag;

	}//end get_parts_of_tag

	
	/*
	* UPDATE DE MAP WITH EXTERNAR CONTROL
	*/
	this.update_component_related = function(parent, current_tipo, current_dato){
		//		console.log(parent);
		//		console.log(current_tipo);
		//		console.log(current_dato);

		//var component = $('.css_warp_geolocation[data-parent='+parent+'][data-tipo="'+current_tipo+'"]').find('.leaflet-container');
		var component = $('.css_wrap_geolocation[data-parent="'+parent+'"][data-tipo="'+current_tipo+'"]').find('.leaflet-container');
		if($(component).length != 1) {
			return alert("Error, components number is not valid :"+$(component).length)
		}
		var leaflet_container_id = $(component).attr('id');

		//Josetxo 20/01/2015
		if(current_dato.indexOf('recorrido :')!=-1){
			var valorDato = current_dato.split(':');			
			//DCA 2015/03/05
			//component_geolocation.update_recorrido(parseInt(valorDato[1]));
			component_geolocation.update_recorrido(parseInt(valorDato[1]),leaflet_container_id); //DCA 2015/03/05
			return;
		}
		//Fin Josetxo 20/01/2015
		
		//console.log(leaflet_container_id);


		//console.log( this.map )
		//leaflet_container_id.map.x = 40;

		var mapa 		= component_geolocation.maps[leaflet_container_id];
		var zoom_level 	= 10;
		//mapa.setView([51.505, -0.09], 13);
		

		/* Set up params to send to Nominatim */
		var params = {
			// Defaults
			q: current_dato,
			format: 'json'
		};
		var provider_url = 'http://nominatim.openstreetmap.org/search';
		/*
		var provider_url = 'https://maps.googleapis.com/maps/api/js?v=3&callback=onLoadGoogleApiCallback&sensor=false';
		var params = {
			// Defaults
			address: current_dato,
			format: 'json'
		};
		*/

		// AJAX REQUEST
		$.ajax({
			url			: provider_url,
			data		: params,
			type		: "GET"
		})
		// DONE
		.done(function(received_data) {

			console.log( typeof received_data );

			if (typeof received_data[0]=='undefined' ) {
				return alert("Not found ")
			};
			
			lat = received_data[0].lat;
			lon = received_data[0].lon;

			//Josetxo 19/01/2015
			var objGeo = $('div.css_wrap_geolocation');
			component_geolocation.Save(objGeo, '{"centro": {"center":"'+lat+', '+lon+'","zoom":17}}');			
			//Fin Josetxo 19/01/2015

			mapa.panTo([lat, lon],{animate:false,duration:0});
			//mapa.fadeAnimation
			//mapa.panTo(new L.LatLng(lat, lon));

		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on component_geolocation.update_component_related " + error_data + "</span>");
			console.log(error_data)	
		})
		// ALLWAYS
		.always(function() {			
			//html_page.loading_content( wrapper_id, 0 );
			console.log("fin")
		});

		/*
		var url 	= " http://nominatim.openstreetmap.org/search" + L.Util.getParamString(params),
			script 	= document.createElement("script");

		script.type = "text/javascript";
		script.src = url;
		script.id = this._callbackId;
		document.getElementsByTagName("head")[0].appendChild(script);
		*/
			//mapa.panTo(new L.LatLng(40.737, -73.923));

	}//FIN UPDATE DE MAP WITH EXTERNAR CONTROL
	
	/*
	 * Josetxo 21/01/2015
	 * Muestra o oculta los componenes de recorrido según este ativo o no
	 * @value = 1: Si, 3: No
	 */		
	//DCA 2015/03/05 
	//this.update_recorrido = function(value){ 
	this.update_recorrido = function(value, leaflet_container_id){ //DCA 2015/03/05
		if(value==1){		
			//DCA 2015/03/06
			//component_geolocation.init_draw_editor(drawnItems);
			//Inicio - DCA 2015/03/06
			map = component_geolocation.maps[leaflet_container_id];
			if(typeof map != 'undefined' && typeof drawControl[leaflet_container_id] != 'undefined'){								
				map.addControl(drawControl[leaflet_container_id]);								
			}
			//Fin - DCA 2015/03/06
		}else{
			//DCA 2015/03/05
			//if(typeof map != 'undefined' && typeof drawControl != 'undefined'){				
			//	map.removeControl(drawControl);
			//	drawControl=undefined;
			//}
			//Inicio - DCA 2015/03/05
			map = component_geolocation.maps[leaflet_container_id];
			if(typeof map != 'undefined' && typeof drawControl[leaflet_container_id] != 'undefined'){								
				map.removeControl(drawControl[leaflet_container_id]);								
			}
			//Fin - DCA 2015/03/05
		}
	}

	/*
	 * Josetxo 21/01/2015
	 * Mira si existe un campo radio button asociado al mapa, en ese caso si está a si activa el editor
	 * @value = 1: Si, 3: No
	 */
	this.init_draw_editor_recorrido = function(component_obj_map) {		

		var tipoMap = $(component_obj_map).data('tipo');
		var aux;
		var valor = 0;	
		var leaflet_container_id = $(component_obj_map).attr('id').substring(8);	//DCA 2015/03/05

		// Buscamos el radio button
		var array_radio = $('div.css_wrap_radio_button');
		$.each(array_radio, function(key, value) {
			aux = $(value).data('link_fields').component_geolocation;

			if(aux != 'undefined' && aux == tipoMap){
				valor = component_radio_button.get_valor_radio_button($(value));
			}
		});	
		
		//DCA 2015/03/05
		//component_geolocation.update_recorrido(valor);
		component_geolocation.update_recorrido(valor, leaflet_container_id); //DCA 2015/03/05

	}	


	/*
	 * Josetxo 21/01/2015
	 * Codifica el JSON y envia al servidor para guarde los datos del editor
	 */
	//DCA 2015/03/05
	//this.save_draw_editor = function() {		
	this.save_draw_editor = function(leaflet_container_id) {	//DCA 2015/03/05

		//DCA 2015/03/05
		//if(draw_data==null) return;
		if(drawnItems[leaflet_container_id]==undefined) return; //DCA 2015/03/05

		//DCA 2015/03/05
		//var current_draw_data = JSON.stringify(draw_data.toGeoJSON());	
		var current_draw_data = JSON.stringify(drawnItems[leaflet_container_id].toGeoJSON()); //DCA 2015/03/05
		var centro='{"center":"'+map.getCenter().lat+', '+map.getCenter().lng+'","zoom":'+map.getZoom()+'}';
		var valor_draw_data = '{"centro": '+centro+', "draw_editor": '+current_draw_data+"}";	//NO HACE FALTA			
		//DCA 2015/03/05
		//$('textarea.css_wrap_geolocation_dato_hidden')[0].innerHTML = valor_draw_data;

		//Inicio - DCA 2015/03/05
		var objGeo = $('#wrapper_'+leaflet_container_id); 
		var objValue = objGeo.find('textarea.css_wrap_geolocation_dato_hidden');	
		objValue[0].innerHTML = valor_draw_data;
		//Fin - DCA 2015/03/05

		//DCA 2015/03/05
		//var objGeo = $('div.css_wrap_geolocation');
		component_geolocation.Save(objGeo, valor_draw_data);	
	}	


	/*
	 * Josetxo 21/01/2015
	 * Añade los elementos guardados al editor del mapa
	 */
	//DCA 2015/03/05 			
	//this.load_draw_editor_data = function() {		
	this.load_draw_editor_data = function(leaflet_container_id) {		 //DCA 2015/03/05 			
		var Cont = 0; //DCA 2015/02/04 			
		
		if(draw_data==null) return;

		map = component_geolocation.maps[leaflet_container_id]; //DCA 2015/03/05

		try{			
			$.each(draw_data.features, function(key, value) {							
				if(value.geometry.type == 'LineString') { 	//PolyLyne												
					var aux = component_geolocation.reverse_coordinates(value.geometry.coordinates);									
					//Inicio - DCA 2015/02/04 
					if(Cont == 0) {																	
						var polyline = L.polyline(aux, {color: '#31df25'}).addTo(map);													
						map.removeControl(polyline);
						Cont = 1
					}
					//Fin - DCA 2015/02/04 
					//DCA 2015/03/05 
					//var polyline = L.polyline(aux, {color: '#31df25'}).addTo(drawnItems);
					var polyline = L.polyline(aux, {color: '#31df25'}).addTo(drawnItems[leaflet_container_id]); //DCA 2015/03/05 
				}else if(value.geometry.type == 'Polygon') {
					//Inicio - DCA 2015/03/02            
					var aux = component_geolocation.reverse_coordinates(value.geometry.coordinates[0]);                             
					if(Cont == 0) {																	
						//DCA 2015/03/05 
						//var polygon = L.polygon(aux, {color: '#31df25'}).addTo(drawnItems);						
						var polygon = L.polygon(aux, {color: '#31df25'}).addTo(drawnItems[leaflet_container_id]); //DCA 2015/03/05 
						map.removeControl(polygon);
						Cont = 1
					}
					//DCA 2015/03/05 
                    //var polygon = L.polygon(aux).addTo(drawnItems);					
                    var polygon = L.polygon(aux).addTo(drawnItems[leaflet_container_id]); //DCA 2015/03/05 
                    //Fin - DCA 2015/03/02
				}else if(value.geometry.type == 'Point') {
                    //Inicio - DCA 2015/03/02                                         
                    //DCA 2015/03/05 
                    //var point = L.marker([value.geometry.coordinates[1],value.geometry.coordinates[0]]).addTo(drawnItems);					
                    var point = L.marker([value.geometry.coordinates[1],value.geometry.coordinates[0]]).addTo(drawnItems[leaflet_container_id]); //DCA 2015/03/05 
                    //Fin - DCA 2015/03/02 
				}
			});	
		
			draw_data=null;	//DCA 2015/03/05 			

		}catch(ex){ }

	}	

	/*
	 * Josetxo 21/01/2015
	 * Añade los elementos guardados al editor del mapa
	 */
	this.reverse_coordinates = function(valor) {		
		var aux1 = new Array();
		//DCA 2015/03/02 var aux2 = new Array();
		$.each(valor, function(key, value) {
			var aux2 = new Array();
			//DCA 2015/03/02 aux2.push(value[1]);
			aux2.push(value[1],value[0]); //DCA 2015/03/02
			//DCA 2015/03/02 aux2.push(value[0]);
			aux1.push(aux2);
		});	
		return aux1;
	}	

}//end component_geolocation