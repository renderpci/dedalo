





var component_geolocation = new function() {	
	
	
	this.maps 			= [];	
	this.save_arguments = {} // End save_arguments
	this.DEDALO_GEO_PROVIDER;
	
	var map;
	var drawnItems;
	var ar_drawnItems 	= [];
	var ar_tag_loaded 	= [];	// almacena las etiquetas completas cuando se pulsa sobre ellas ([geo-n-1-data:['Layer',{..}]:data])	
	
	var draw_data 		= null;

	this.field_lat
	this.field_lon
	this.field_zoom
	
	/*
	this.maps = new Array();
	var map;
	this.save_arguments = {	} // End save_arguments
	this.DEDALO_GEO_PROVIDER;
	
	var drawnItems;
	var ar_drawnItems = new Array();
	var ar_tag_loaded = new Array();	// almacena las etiquetas completas cuando se pulsa sobre ellas ([geo-n-1-data:['Layer',{..}]:data])
	
	
	var draw_data = null;

	this.field_lat
	this.field_lon
	this.field_zoom
	*/

	/**
	* Save
	* Get component data and save using common.Save
	*/
	this.Save = function() {

		this.save_arguments = {
			'dato' : {
					'lat'	: this.field_lat.value,
					'lon'	: this.field_lon.value,
					'zoom'	: this.field_zoom.value,
					'alt' 	: this.field_alt.value
					},
			'show_spinner' : false			
		}
		//console.log(this.save_arguments);
		//this.save_arguments.dato = JSON.stringify(this.save_arguments);		
		
		// Exec general save
		var jsPromise = component_common.Save(this.field_lat, this.save_arguments);
		
		// Update possible dato in list (in portal x example)
		//component_common.propagate_changes_to_span_dato(component_obj);

	}//end Save

	


	/**
	* SAVE_DRAW_DATA
	*/
	this.save_draw_data = function() {

		if(draw_data==null) return;

		var current_draw_data = JSON.stringify(draw_data.toGeoJSON());
			if(DEBUG) {	
				console.log( "save_draw_data for ["+current_editable_FeatureGroup_id + "]: \n"+current_draw_data )
			}

		var tag 			= ar_tag_loaded[current_editable_FeatureGroup_id],
			parts_of_tag 	= component_geolocation.get_parts_of_tag(tag),
			tagId 			= parts_of_tag.capaId,
			tagState 		= parts_of_tag.tagState,
			data 			= current_draw_data;

		component_text_area.update_geo_tag(tag, tagId, tagState, data);
	}


	
	
	/**
	* INIT_MAP
	*/
	this.init_map = function( div_container_id ) {

		var geolocation_obj = this;		
		

		var wrapper = document.getElementById(div_container_id).parentNode.parentNode;
			//console.log(wrapper); return

		if(DEBUG) {
			console.log("INIT MAP: "+div_container_id)	
			console.log("DEDALO_GEO_PROVIDER: "+component_geolocation.DEDALO_GEO_PROVIDER);
			//console.log("div_container_id:"+div_container_id)
		}

		// INPUTS
		var field_lat  	= wrapper.querySelectorAll('[data-name="lat"]')[0],
			field_lon  	= wrapper.querySelectorAll('[data-name="lon"]')[0],
			field_zoom 	= wrapper.querySelectorAll('[data-name="zoom"]')[0],
			field_alt 	= wrapper.querySelectorAll('[data-name="alt"]')[0],
			map_refresh	= document.getElementById('map_refresh'),
			map_fixed	= document.getElementById('map_fixed');
				//console.log(map_refresh);

		// Fix vars
		geolocation_obj.field_lat 	= field_lat;
		geolocation_obj.field_lon 	= field_lon;
		geolocation_obj.field_zoom	= field_zoom;
		geolocation_obj.field_alt 	= field_alt;

		//console.log(wrapper.dataset); return;

		// MAP_DATA : defaults Define main map element default data
		var map_data = { x	 : 39.462571,
						 y	 : -0.376295,
					 	zoom : 16,
					 	alt  : 16
					   }

		if (typeof wrapper.dataset.dato != 'undefined') {
			var dato = wrapper.dataset.dato;
				dato = JSON.parse(dato);
			//var dato = wrapper.getAttribute("data-dato");
			map_data = { x	  : dato.lat,
						 y	  : dato.lon,
						 zoom : dato.zoom,
						 alt  : dato.alt,
						}
		}			

		//map = component_geolocation.maps[div_container_id];
			//console.log(map); return
		
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
				var arcgis 		= new L.tileLayer('http://server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
				//var cloudmade 	= new L.TileLayer('http://{s}.tile.cloudmade.com/BC9A493B41014CAABB98F0471D759707/997/256/{z}/{x}/{y}.png');
				var osm 		= new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');	
		        //var ggl 	= new L.Google();			        				
				//var ggl2 	= new L.Google('TERRAIN');					
				
				// MAP
				map = new L.Map(div_container_id, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

				// LAYER SELECTOR
				map.addControl(new L.Control.Layers( {'Arcgis':arcgis, 'OSM':osm}, {}));
				//map.addControl(arcgis);					

				// ADD_DRAW_EDIT_LAYER
				//component_geolocation.add_draw_edit_layer(map, tag_id);			

				break;
		}

		// disable zoom handlers
		map.scrollWheelZoom.disable();
		// disable tap handler, if present.
		if (map.tap) map.tap.disable();


		map.on('dragend', function(){
			//field_lat.value = map.getCenter().lat;
			//field_lon.value = map.getCenter().lng;
			//geolocation_obj.Save();
			map.invalidateSize(); 	// Force refresh map size when map is loaded hidden (section group closed)
		});

		map.on('zoomend', function(){
			//field_zoom.value = map.getZoom();
			//geolocation_obj.Save();
		});

		// LISTENERS ON CHANGE INPUT VALUES, UPDATE MAP POSITION / ZOOM
		field_lat.addEventListener("change", function(){
		//	map.panTo(new L.LatLng(field_lat.value, field_lon.value));
		});
		field_lon.addEventListener("change", function(){
		//	map.panTo(new L.LatLng(field_lat.value, field_lon.value));
		});
		field_zoom.addEventListener("change", function(){
		//	map.setZoom(field_zoom.value);
		});
		map_refresh.addEventListener("click", function(){
			map.panTo(new L.LatLng(field_lat.value, field_lon.value));
			map.panTo(new L.LatLng(field_lat.value, field_lon.value));
			map.setZoom(field_zoom.value);
		});
		map_fixed.addEventListener("click", function(){
			field_lat.value = map.getCenter().lat;
			field_lon.value = map.getCenter().lng;
			field_zoom.value = map.getZoom();
			geolocation_obj.Save();			
		});

		component_geolocation.maps[div_container_id] = map;
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
						
		}, 500)			

	}//end init_map




	/**
	* INIT_DRAW_EDITOR
	* @see https://github.com/Leaflet/Leaflet.draw/issues/66
	*/
	var drawControl;
	var draw_editor_is_initated = false;
	var editable_FeatureGroup;
	var ar_FeatureGroup=[];
	this.init_draw_editor = function( current_editable_FeatureGroup ) {

		editable_FeatureGroup = current_editable_FeatureGroup;

		// DRAW CONTROL REMOVE : Si ya existe, lo eliminamos para poder crearlo de nuevo y que haya sólo uno activo
		if (drawControl) {
			drawControl.removeFrom(map)
		}
		
		/*
		// Initiated test
		if(draw_editor_is_initated==true) return;
		// map global var test
		if(typeof map == 'undefined') return alert("Error: map is undefined")

		// FeatureGroup
		editable_FeatureGroup = new L.FeatureGroup();
		map.addLayer(editable_FeatureGroup);
		*/

		// DRAW CONTROL ///////////////////////////////////////////////////
		// El editor se inicaliza cada vez y recibe el FeatureGroup recién cargado como parámetro (ver https://github.com/Leaflet/Leaflet.draw/issues/66)
		drawControl = new L.Control.Draw({
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
				marker: true
			},
			edit: {
				featureGroup: editable_FeatureGroup,
				remove: true
			}
		});
		map.addControl(drawControl);


			// DRAW HANDLERS //////////////////////////////////////////////
			// !!IMPORTANTE : El editor se inicializa cada vez, pero los manejadores sólo una
			if(draw_editor_is_initated==true) {
				console.log('draw_editor_is_initated. returning');
				return false;
			}
			map.on('draw:created', function (e) {	// Triggered when a new vector or marker has been created.
				var type  = e.layerType,
					layer = e.layer;	

				if (type === 'marker') {
					layer.bindPopup('A popup!');
				}
				editable_FeatureGroup.addLayer(layer);

				// Update draw_data
				draw_data = editable_FeatureGroup;
			
				//console.log(editable_FeatureGroup);
				//console.log(e)
			});
			map.on('draw:edited', function (e) {	// Triggered when layers in the FeatureGroup, initialised with the plugin, have been edited and saved.				
				// Update draw_data
				draw_data = editable_FeatureGroup;
				// Save draw_data
				component_geolocation.save_draw_data();
			});
			map.on('draw:deleted', function (e) {	// Triggered when layers have been removed (and saved) from the FeatureGroup.
				// Update draw_data
				draw_data = editable_FeatureGroup;
				// Save draw_data
				component_geolocation.save_draw_data();
			});

		// DRAW_EDITOR_IS_INITATED : Fija la variable a global a true (default is false) para evitar duplicidades
		draw_editor_is_initated = true;

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


			return;
			*/



		// MODE VERIFY : Only allow mode 'tool_transcription'
		if(page_globals.modo!=='tool_transcription') return null;

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
			return alert("Error, components count number is not valid :"+$(component).length)
		}
		var leaflet_container_id = $(component).attr('id');
		
		//console.log("->leaflet_container_id:" +leaflet_container_id);


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

			mapa.panTo([lat, lon],{animate:false,duration:0});
			//mapa.fadeAnimation
			//mapa.panTo(new L.LatLng(lat, lon));

		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on component_geolocation.update_component_related " + error_data + "</span>");
			console.log(error_data)	
		})
		// ALWAYS
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
	
	
		



}//end component_geolocation