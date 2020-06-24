/**
* COMPONENT_GEOLOCATION
*
*
*
*/
var component_geolocation = new function() {

	"use strict"	
	
	
	this.maps 			= []	
	this.save_arguments = {} // End save_arguments
	this.DEDALO_GEO_PROVIDER
	
	var map
	//var drawnItems;
	//var ar_drawnItems = []
	var ar_tag_loaded 	= []	// almacena las etiquetas completas cuando se pulsa sobre ellas ([geo-n-1-data:['Layer',{..}]:data])	
	var layer_control	= false
	
	var draw_data 		= null

	this.field_lat 		= null
	this.field_lon  	= null
	this.field_zoom 	= null
	this.field_alt  	= null



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
	
		const self = this
		
		self.DEDALO_GEO_PROVIDER = options.DEDALO_GEO_PROVIDER

		// Init map
			setTimeout(function(){
				self.init_map(options.uid)
			},300)
			

		// Input handlers. On keyup, redraw map with new values
			const wrapper 	 = document.getElementById(options.wrapper_id)
			const map_inputs = wrapper.querySelectorAll("input[type=text].geo_active_input")
			for (var i = map_inputs.length - 1; i >= 0; i--) {
				// Update map view (redraw)
				map_inputs[i].addEventListener("keyup",function(){
					// Normalize values
					if (this.name==='zoom') {
						this.value = this.value.replace(/[^\d]/g, '')
					}else{
						this.value = this.value.replace(/[^\d.-]/g, '')
					}
					// Update map
					self.update_map_values(this)
				})
			}

		return true
	};//end init



	/**
	* UPDATE_MAP_VALUES
	* @return 
	*/
	this.update_map_values = function(input) {

		const self = this

		const wrapper 			= component_common.get_wrapper_from_element(input)
		const leaflet_container = wrapper.querySelector(".leaflet-container")		
		
		const lat 	= parseFloat(wrapper.querySelector("input[name=lat]").value) || 1
		const lon 	= parseFloat(wrapper.querySelector("input[name=lon]").value) || 1
		const zoom 	= parseInt(wrapper.querySelector("input[name=zoom]").value)  || 15

		if(SHOW_DEBUG===true) {
		 	console.log("update_map_values: lat",lat," lon:",lon, " zoom:",zoom);
		}

		const map = self.maps[leaflet_container.id];
			  map.panTo([lat, lon],{animate:false,duration:0});
			  map.setZoom(zoom)

		return true
	};//end update_map_values



	/**
	* UPDATE_INPUT_VALUES
	* @return 
	*/
	this.update_input_values = function(data, wrapper) {

		// inputs
			const input_lat  = wrapper.querySelector("input[name=lat]")
			const input_lon  = wrapper.querySelector("input[name=lon]")
			const input_zoom = wrapper.querySelector("input[name=zoom]")

		// Set values
			input_lat.value  = data.lat
			input_lon.value  = data.lon
			input_zoom.value = data.zoom

		return true
	};//end update_input_values



	/**
	* GET_DATO
	* update 13-01-2018
	*/
	this.get_dato = function(wrapper) {

		const self = this

		if (typeof(wrapper)==="undefined" || !wrapper) {
			console.log("[component_input_text_large:get_dato] Error. Invalid wrapper");
			return false
		}

		const dato = {
				lat	 : parseFloat(self.field_lat.value),
				lon	 : parseFloat(self.field_lon.value),
				zoom : parseInt(self.field_zoom.value)
			}
			// altitude add if exists
			if (self.field_alt!=="undefined" && self.field_alt.value!=="undefined") {
				dato.alt = parseInt(self.field_alt.value)
			}

		if(SHOW_DEBUG===true) {
			console.log("[component_geolocation] get_dato:",dato);
		}

		return dato
	};//end get_dato



	/**
	* Save
	* Get component data and save using common.Save
	*/
	this.Save = function(wrapper) {
	
		const self = this

		const dato = self.get_dato(wrapper)
		
		// Save arguments
		this.save_arguments = {
			dato : JSON.stringify(dato),
			show_spinner : false			
		}

		// input . Select first input needed for common save..
		const input_lat = wrapper.querySelector("input[type=text].geo_active_input")

		// Exec general save
		const js_promise = component_common.Save(input_lat, self.save_arguments);
		
		// Update possible dato in list (in portal x example)
		//component_common.propagate_changes_to_span_dato(component_obj);

		return js_promise
	}//end Save

	

	/**
	* SAVE_DRAW_DATA
	*/
	this.save_draw_data = function() {
	
		const self = this

		if(!draw_data) return false;

		let current_draw_data = JSON.stringify(draw_data.toGeoJSON());
			if(SHOW_DEBUG===true) {	
				console.log("[component_geolocation.save_draw_data] for ["+current_editable_FeatureGroup_id + "]", draw_data.toGeoJSON() )
			}
			current_draw_data = replaceAll('"', '\'', current_draw_data)

		const new_data_obj = {
			data : current_draw_data
		}	

		const tag_obj 		= ar_tag_loaded[current_editable_FeatureGroup_id]
		//const parts_of_tag 	= self.get_parts_of_tag(tag_obj)
		//const tag_id 			= parts_of_tag.capaId
		//const tagState 		= parts_of_tag.tagState		
		
		//console.log("[component_geolocation.save_draw_data]",current_draw_data);

		const related_tipo = JSON.parse(this.related_tipo)[0]
			if(related_tipo.length <= 0 ){
				console.error("[component_geolocation.save_draw_data] Error on locate this.related_tipo");
				return false
			}

		const tag_data = {
			component_tipo 	: related_tipo,
			type 			: tag_obj.dataset.type,
			tag_id 			: tag_obj.dataset.tag_id,
			id 				: tag_obj.id
		}

		// UPDATE_TAG
		component_text_area.update_tag( tag_data, new_data_obj, true);

		return true
	};//end save_draw_data

	
	
	/**
	* INIT_MAP
	*/
	var loaded_document = false
	this.init_map = function( div_container_id ) {
	
		const self = this

		const div_container = document.getElementById(div_container_id)
		const wrapper 		= component_common.get_wrapper_from_element(div_container)
			if(!wrapper){
				alert("Error on DOM select map wrapper from div_container_id: "+div_container_id)
				return false;
			}

		if(SHOW_DEBUG===true) {
			//console.log("-> Init map [component_geolocation]: " + div_container_id)
			//console.log("-> DEDALO_GEO_PROVIDER: "+component_geolocation.DEDALO_GEO_PROVIDER);
		}

		// inputs
			const field_lat  	= wrapper.querySelector('[data-name="lat"]')
			const field_lon  	= wrapper.querySelector('[data-name="lon"]')
			const field_zoom 	= wrapper.querySelector('[data-name="zoom"]')
			const field_alt 	= wrapper.querySelector('[data-name="alt"]')
			const map_refresh	= wrapper.querySelector('#map_refresh')
			const map_fixed		= wrapper.querySelector('#map_fixed')

		// Fix vars
			self.field_lat 	 	= field_lat
			self.field_lon 	 	= field_lon
			self.field_zoom	 	= field_zoom
			self.field_alt 	 	= field_alt
			self.related_tipo 	= wrapper.dataset.related_tipo

		// map_data : defaults Define main map element default data
			let map_data = {}

		// dataset data
			if (typeof wrapper.dataset.dato!=="undefined") {
				// Value from db stored in wrapper dataset
				var dato = wrapper.dataset.dato
					dato = JSON.parse(dato)
					//console.log(dato);
				if (dato.lat && dato.lon) {
					map_data = {
						x	  : dato.lat,
						y	  : dato.lon,
						zoom  : dato.zoom,
						alt   : dato.alt,
					}
				}
			}else{
				// Defaul value Ruzafa
				map_data = {
					x	 : 39.462571,
					y	 : -0.376295,
					zoom : 16,
					alt  : 16
				}
			}
			//console.log("map_data:",map_data);

		let arcgis 		= ''
		let osm  		= ''
		let base_maps 	= ''
		let dare 		= ''


		// Add layer to map
			switch( self.DEDALO_GEO_PROVIDER ) {

				case 'OSM':
					map = new L.Map(div_container_id, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});		
					L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
						attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
						//attribution: '<a href="http://fmomo.org">Dedalo</a>',
						maxZoom: 19
					}).addTo(map);
					break;
				
				// case 'COULDMADE':
				// 	map = new L.Map(div_container_id, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});					
				// 	L.tileLayer('http://{s}.tile.cloudmade.com/API-key/997/256/{z}/{x}/{y}.png', {
				// 		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://cloudmade.com">CloudMade</a>',
				// 		maxZoom: 18
				// 	}).addTo(map);
				// 	break;
				
				case 'GOOGLE':
					map = new L.Map(div_container_id, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});				
				    const googleLayer = new L.Google('ROADMAP');
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

				case 'NUMISDATA':
			     
					// LAYER
					//var dare 	= new L.TileLayer('http://dare.ht.lu.se/tiles/imperium/{z}/{x}/{y}.png');
					//dare 		= new L.TileLayer('http://pelagios.org/tilesets/imperium/{z}/{x}/{y}.png',{
					dare 		= new L.TileLayer('https://dh.gu.se/tiles/imperium/{z}/{x}/{y}.png',{
						maxZoom: 11
					});
					
					arcgis 		= new L.tileLayer('//server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

					osm 		= new L.TileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom: 19, maxNativeZoom: 19});	


					
					// MAP
					map = new L.map(div_container_id, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

					// LAYER SELECTOR
					base_maps = {
										dare:  dare,
									    arcgis: arcgis,
									    osm: 	  osm
									    
									};
					if(layer_control === false || loaded_document===true) {
						layer_control = L.control.layers(base_maps).addTo(map);
					}

					map.on('overlayadd', function(e) {
					  	self.init_draw_editor( ar_FeatureGroup[e.name],e.name)
					});
					break;

				case 'VARIOUS': 
					
					// LAYER
					//var arcgis 		= new L.tileLayer('http://server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
					arcgis 		= new L.tileLayer('//server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
					//var cloudmade 	= new L.TileLayer('http://{s}.tile.cloudmade.com/BC9A493B41014CAABB98F0471D759707/997/256/{z}/{x}/{y}.png');
					//var osm 		= new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
					osm 		= new L.TileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');	
			        //var ggl 	= new L.Google();			        				
					//var ggl2 	= new L.Google('TERRAIN');
					
					// MAP
					map = new L.map(div_container_id, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

					// LAYER SELECTOR
					base_maps = {
						arcgis  : arcgis,
						osm 	: osm
					}
					if(layer_control===false || loaded_document===true) {
						layer_control = L.control.layers(base_maps).addTo(map);
					}

					map.on('overlayadd', function(e) {
					  	self.init_draw_editor(ar_FeatureGroup[e.name], e.name)
					});

					//layer_control.addBaseLayer(base_maps, "basemaps");
					//map.addControl(new L.Control.Layers( {'Arcgis':arcgis, 'OSM':osm}, {}));
					//map.addControl(arcgis);					

					// ADD_DRAW_EDIT_LAYER
					//self.add_draw_edit_layer(map, tag_id);
					break;
			}

		// disable zoom handlers
		map.scrollWheelZoom.disable();
		// disable tap handler, if present.
		if (map.tap) map.tap.disable();
		// Add to maps array
		self.maps[div_container_id] = map;

		// map move listeners
			map.on('dragend', function(e){			
				// Force refresh map size when map is loaded hidden (section group closed)
					self.refresh_map(map)

				// Update input values
					self.update_input_values({
						lat  : map.getCenter().lat,
						lon  : map.getCenter().lng,
						zoom : map.getZoom()
					}, wrapper)
			});
			map.on('zoomend', function(e){
				// Force refresh map size when map is loaded hidden (section group closed)
				//	self.refresh_map(map)

				// Update input values
					self.update_input_values({
						lat  : map.getCenter().lat,
						lon  : map.getCenter().lng,
						zoom : map.getZoom()
					}, wrapper)
			});
			
		/*
			// LISTENERS ON CHANGE INPUT VALUES, UPDATE MAP POSITION / ZOOM
			field_lat.addEventListener("change", function(e){
			//	map.panTo(new L.LatLng(field_lat.value, field_lon.value));
			});
			field_lon.addEventListener("change", function(e){
			//	map.panTo(new L.LatLng(field_lat.value, field_lon.value));
			});
			field_zoom.addEventListener("change", function(e){
			//	map.setZoom(field_zoom.value);
			});
			*/
		// button map_refresh. click event
			map_refresh.addEventListener("click", function(e){
				let lat_log = new L.LatLng(field_lat.value, field_lon.value)
				let zoom 	= parseInt(field_zoom.value);
				map.setView(lat_log, zoom, {animation: true});
				//map.panTo(lat_log)
				//map.setZoom(field_zoom.value)
				self.refresh_map(map)
			});
		// button map_fixed. click event Save
			map_fixed.addEventListener("click", function(e){
				field_lat.value  = map.getCenter().lat;
				field_lon.value  = map.getCenter().lng;
				field_zoom.value = map.getZoom();
				self.Save(wrapper)
				self.refresh_map(map)
			});

		setTimeout(function(){			
			self.refresh_map(map)
			//L.Util.requestAnimFrame(map.invalidateSize,map,!1,map._container);
		}, 1400)


		// onreadystatechange event complete render_tags
			document.onreadystatechange = function() {		
				if (document.readyState==='complete') {
					self.render_tags()
					loaded_document = true
				}
			}
		
		//if (loaded_document===true) {
		//	self.render_tags();
		//}
		/*
			map.whenReady(function(e){
				self.refresh_map(map)			
			})
			//load the tags of the component_text_area into the map
			
			

			window.addEventListener("load", function (event) {
				//self.render_tags()
				self.refresh_map(map)
			});

			// Load geo tag info from text_area if exists related
			// This only is executed when user paginate rows, not on load
			if (loaded_document===true) {
				self.render_tags()
			}
			*/
		const section_group   = wrapper.parentNode
		const observer_config = { attributeFilter: [ 'style' ], attributes: true, childList: false, subtree: false };
		const observer 		  = new MutationObserver(function(mutationList){
			//console.log(mutationList)
			self.refresh_map(map)
		});
		observer.observe(section_group, observer_config)

		return true
	}//end init_map



	/**
	* REFRESH_MAP
	* @return 
	*/
	this.refresh_map = function(map) {
		//map._onResize();
		map.invalidateSize(); // Force refresh map
	};//end refresh_map


	/**
	* ROUND_COORDINATE
	* @return 
	* 	add pop up information to the draw
    *	Truncate value based on number of decimals
	*/
    this.round_coordinate = function(num, len) {
        
        return Math.round(num*(Math.pow(10, len)))/(Math.pow(10, len));
    };//end round_coordinate



	/**
	* STRLATLNG
	* @return 
	* 	Helper method to format LatLng object (x.xxxxxx, y.yyyyyy)
	*/
    this.strLatLng = function(latlng) {
        
        return "("+this.round_coordinate(latlng.lat, 6)+", "+this.round_coordinate(latlng.lng, 6)+")";
    };//end strLatLng



	/**
	* GETPOPUPCONTENT
	* @return 
	* 	Generate popup content based on layer type
    *	Returns HTML string, or null if unknown object
	*/
    this.getPopupContent = function(layer) {
        // Marker - add lat/long
        if (layer instanceof L.Marker) {
            return this.strLatLng(layer.getLatLng());
        // Circle - lat/long, radius
        } else if (layer instanceof L.Circle) {
            var center = layer.getLatLng(),
                radius = layer.getRadius();
            return "Center: "+this.strLatLng(center)+"<br />"
                  +"Radius: "+this.round_coordinate(radius, 2)+" m";
        // Rectangle/Polygon - area
        } else if (layer instanceof L.Polygon) {
            var latlngs = layer._defaultShape ? layer._defaultShape() : layer.getLatLngs(),
                area = L.GeometryUtil.geodesicArea(latlngs);
            return "Area: "+L.GeometryUtil.readableArea(area, true);
        // Polyline - distance
        } else if (layer instanceof L.Polyline) {
            var latlngs = layer._defaultShape ? layer._defaultShape() : layer.getLatLngs(),
                distance = 0;
            if (latlngs.length < 2) {
                return "Distance: N/A";
            } else {
                for (var i = 0; i < latlngs.length-1; i++) {
                    distance += latlngs[i].distanceTo(latlngs[i+1]);
                }
                return "Distance: "+this.round_coordinate(distance, 2)+" m";
            }
        }
        return null;
    };//end getPopupContent



	/**
	* INIT_DRAW_EDITOR
	* @see https://github.com/Leaflet/Leaflet.draw/issues/66
	*/
	var drawControl;
	var draw_editor_is_initated = false;
	var editable_FeatureGroup;
	var ar_FeatureGroup = [];
	var draw_state;
	this.init_draw_editor = function( current_editable_FeatureGroup, capa_id ) {
			
		const self = this
			
		current_editable_FeatureGroup_id = capa_id;
		editable_FeatureGroup 			 = current_editable_FeatureGroup;

		// DRAW CONTROL REMOVE : Si ya existe, lo eliminamos para poder crearlo de nuevo y que haya sólo uno activo
			if (drawControl) {
				drawControl.remove(map)
			}

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
				remove: true,
			}
		});
		map.addControl(drawControl);
			
			// DRAW HANDLERS //////////////////////////////////////////////
			// !!IMPORTANTE : El editor se inicializa cada vez, pero los manejadores sólo una
			if(draw_editor_is_initated===true) {
				//console.log('draw_editor_is_initated. returning');
				return false;
			}
	
			// Listenre for object created - bind popup to layer, add to feature group
			map.on(L.Draw.Event.CREATED, function (e) {	// Triggered when a new vector or marker has been created.
				
				//var type  	= e.layerType
				var	layer 	= e.layer
				var	content = self.getPopupContent(layer)

				if (content!==null) {
	                layer.bindPopup(content);
	            }
	            //listener fired when the layer is selected.
	            layer.on('click', function(e) {
	            	if(draw_state==="delete"){
						editable_FeatureGroup.removeLayer(e.layer);
						return;
	            	}else{
						//e.target.editing.enable();
	            	}
				})

				/*if (type === 'marker') {
					layer.bindPopup('A popup!');
				}*/
				editable_FeatureGroup.addLayer(layer);

				// Update draw_data
				draw_data = editable_FeatureGroup;

				//save the draw_data
				self.save_draw_data();
				
			});
			// Listener on change the draw editor to "edited mode" for save the the current data of the editable_FeatureGroup
			map.on(L.Draw.Event.EDITED, function (e) {	// Triggered when layers in the FeatureGroup, initialised with the plugin, have been edited and saved.						
				// Update draw_data
				draw_data = editable_FeatureGroup;
				// Save draw_data
				self.save_draw_data();
			});
			// Listener for delete the draw editor to "deleted mode" for save the current data of the editable_FeatureGroup
			map.on(L.Draw.Event.DELETED, function (e) {	// Triggered when layers have been removed (and saved) from the FeatureGroup.
				draw_data = editable_FeatureGroup;
				// Save draw_data
				self.save_draw_data();
			});
			// Listener for change the mode of the draw (trash button in the editor)
			map.on(L.Draw.Event.DELETESTART, function (e) {	
				draw_state = "delete";
			});
			// Listener for exit of the "delete mode" of the draw editor (close or save options of the trash button in the editor)
			map.on(L.Draw.Event.DELETESTOP, function (e) {	
				draw_state = "";
			});
			// Listerner to the map for change the edit mode the all layer of the all features (change the state and color)
			map.on('click', function(e){
				draw_state ="";
				for (var i = ar_FeatureGroup.length - 1; i >= 1; i--) {
					if(ar_FeatureGroup[i]){
						ar_FeatureGroup[i].eachLayer(function(layer) {
							layer.editing.disable();
							if(!(layer instanceof L.Marker)){
								layer.setStyle({color: '#3388ff'});
							}
							
						})
					}
				}
			})

			
		// DRAW_EDITOR_IS_INITATED : Fija la variable a global a true (default is false) para evitar duplicidades
		//draw_editor_is_initated = true;

		return true
	}//end init_draw_editor



	/**
	* RENDER_TAGS
	* Load all tags information from related text areas tags into the map
	*/
	this.render_tags = function(){

		const ar_related_tipo = JSON.parse(this.related_tipo)		
		if(ar_related_tipo.length <= 0 ){
			console.log("[render_tags] No related components are found");
			return false
		}

		const ar_tags = component_text_area.get_tags(ar_related_tipo[0],'geo')		
		if(ar_tags){
			const len = ar_tags.length
			for (let i = len - 1; i >= 0; i--) {
				this.load_geo_editor(ar_tags[i], true);
			}
		}

		return true
	}//end render_tags


	
	/**
	* LOAD_GEO_EDITOR
	* Load all data information odf the current selected tag. Init the edditor if it is not loaded.
	* Carga los datos al pulsar sobre la etiqueta. Inicializa el editor de no estar ya inicializado
	*/
	var current_editable_FeatureGroup_id;	
	this.load_geo_editor = function(tag, all_tags) {

		const self = this

		if (typeof all_tags==="undefined") {
			all_tags = false
		}
		// MODE VERIFY : Only allow mode 'tool_transcription'
		//if(page_globals.modo!=='tool_transcription') return null;

		if(SHOW_DEBUG===true) {
			//console.log("[component_geolocation.load_geo_editor] tag:",tag);;
		}		

		// TAG : Get all information of the selected tag
		const parts_of_tag = self.get_parts_of_tag(tag);

		var data 	= parts_of_tag.data
		var	capaId 	= parts_of_tag.capaId

		// ar_tag_loaded : store current tag
			ar_tag_loaded[capaId] = tag;
		
		// FEATUREGROUP BUILD : Verify if exist FeatureGroup, else create it. map is global var
		if( map.hasLayer(ar_FeatureGroup[capaId])===false ) {		
	
			if(!all_tags){
				for (var i = ar_FeatureGroup.length - 1; i >= 1; i--) {
					if(ar_FeatureGroup[i]){
						ar_FeatureGroup[i].clearLayers();
						layer_control.removeLayer(ar_FeatureGroup[i]) 
					}
				}
			}

			// Create a new FeatureGroup
			ar_FeatureGroup[capaId] = new L.FeatureGroup();
			ar_FeatureGroup[capaId].addTo(map);

			layer_control.addOverlay(ar_FeatureGroup[capaId], capaId);							  	

		}else{
			// Condfirm our write
			//if( !confirm("Discard changes?") ) return;
			//remove all layers

			if(!all_tags){
				for (var i = ar_FeatureGroup.length - 1; i >= 1; i--) {
					if(ar_FeatureGroup[i]){
						ar_FeatureGroup[i].clearLayers();
						layer_control.removeLayer(ar_FeatureGroup[i]) 
					}
				}
			}
			layer_control.addOverlay( ar_FeatureGroup[capaId], capaId);	
			// FEATUREGROUP RESET : Remove the all data layers for re-created with the new data that come with the loaded tag.		
			ar_FeatureGroup[capaId].clearLayers();	//delete ar_FeatureGroup[capaId];
		}		

		// LAYERS : Load layers from tag data
		if (typeof data!=="undefined" && data!=="undefined" && data!=="") {
			
			L.geoJson( JSON.parse(data), { 
				//For each Feature load all layer data of the tag
		    	onEachFeature: function (feature, data_layer) {
		    		if(data_layer){

		    			// PopupContent. get the popup information
							const content = self.getPopupContent(data_layer);
								if (content) {
									data_layer.bindPopup(content);
								}

			            // Click. Listener for each layer, when the user click into one layer, activate it and your feature, deactivate rest of the features and layers
							data_layer.on('click', function(e) {
								if(draw_state==="delete"){
									ar_FeatureGroup[capaId].removeLayer(e.layer);
									return;
		            			}
		            			// change all features and layers for activate or deactivate the edit mode.
		            			const FeatureGroup_length = ar_FeatureGroup.length;
								for (var i = FeatureGroup_length - 1; i >= 1; i--) {
									if(ar_FeatureGroup[i]){
										if(ar_FeatureGroup[i]===ar_FeatureGroup[capaId]){
											//All layers and features to desactive and change to blue color
											ar_FeatureGroup[capaId].eachLayer(function (layer){
												layer.editing.disable();
										    	if(!(layer instanceof L.Marker)){
											    	layer.setStyle({color: '#31df25'});
											    }
										    });
										}else{
											//The layers of the actual feature disable and change to green color
											ar_FeatureGroup[i].eachLayer(function(layer) {
												layer.editing.disable();
												if(!(layer instanceof L.Marker)){
													layer.setStyle({color: '#3388ff'});
												}											
											});
										}
									}
								}
								// current layer activate and change to pink color
								//e.target.editing.enable();
								if(!(e.target instanceof L.Marker)){
									e.target.setStyle({color: '#97009C'});
								}else{
									console.log("NOt e.target instanceof L.Marker ",);
								}
								//activate the feature (for save)
								//self.init_draw_editor( ar_FeatureGroup[capaId], capaId )
							 });
							
						// addLayer
							// console.log("ar_FeatureGroup[capaId]:",ar_FeatureGroup[capaId]); // , "data_layer", data_layer, "capaId",capaId
							ar_FeatureGroup[capaId].addLayer(data_layer)
			    	}
				}
			})
			
		};


		//map.addControl(L.Control.Layers.addOverlay( ar_FeatureGroup[capaId], capaId));
		// DRAW_EDITOR : Init draw editor and pass current FeatureGroup
		self.init_draw_editor( ar_FeatureGroup[capaId], capaId )

		// OVERLAY : Lo añadimos al map ovelay (Adds an overlay (checkbox entry) with the given name to the control)
		//current_overlay = L.tileLayer(ar_FeatureGroup[capaId]);
		//L.control.layers({},{'current_overlay':current_overlay}).addTo(map);

		// CURRENT_EDITABLE_FEATUREGROUP_ID : Fijamos como current editable el FeatureGroup actual
		current_editable_FeatureGroup_id = capaId;
	}//end load_geo_editor



	/**
	* GET_PARTS_OF_TAG
	*/
	this.get_parts_of_tag = function(tag_obj) {

		const type = tag_obj.dataset.type
			if (type!=='geo'){
				alert("invalid tag here!!!!")
				return false
			}

		const tagState 	= tag_obj.dataset.state
		const capaId 	= tag_obj.dataset.tag_id
		let	data 		= tag_obj.dataset.data			
			data 		= replaceAll('\'','"',data); // restore quotes "

		const parts_of_tag = {
			capaId 	 : capaId,
			tagState : tagState,
			data 	 : data
		}

		return parts_of_tag
	}//end get_parts_of_tag

	
	/*
	* UPDATE THE MAP WITH EXTERNAR CONTROL
	*//*
	this.update_component_related_OLD = function(parent, current_tipo, current_dato){
		
		const self = this

		//var component = $('.css_warp_geolocation[data-parent='+parent+'][data-tipo="'+current_tipo+'"]').find('.leaflet-container');
		var component = $('.css_wrap_geolocation[data-parent="'+parent+'"][data-tipo="'+current_tipo+'"]').find('.leaflet-container');
		if($(component).length != 1) {
			return alert("Error, components count number is not valid :"+$(component).length)
		}
		var leaflet_container_id = $(component).attr('id');
		
		//console.log("->leaflet_container_id:" +leaflet_container_id);


		//console.log( this.map )
		//leaflet_container_id.map.x = 40;

		var mapa 		= self.maps[leaflet_container_id];
		var zoom_level 	= 10;
		//mapa.setView([51.505, -0.09], 13);
		

		// Set up params to send to Nominatim
		var params = {
			// Defaults
			q: current_dato,
			format: 'json'
		};
		var provider_url = 'http://nominatim.openstreetmap.org/search';
		
		//var provider_url = 'https://maps.googleapis.com/maps/api/js?v=3&callback=onLoadGoogleApiCallback&sensor=false';
		//var params = {
		//	// Defaults
		//	address: current_dato,
		//	format: 'json'
		//}		

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

		
		//var url 	= " http://nominatim.openstreetmap.org/search" + L.Util.getParamString(params),
		//	script 	= document.createElement("script");
		//
		//script.type = "text/javascript";
		//script.src = url;
		//script.id = this._callbackId;
		//document.getElementsByTagName("head")[0].appendChild(script);
		
		//mapa.panTo(new L.LatLng(40.737, -73.923));
	}//end update de map with externar control
	*/



	/*
	* UPDATE THE MAP WITH EXTERNAR CONTROL
	*/
	this.update_component_related = function(current_tipo, current_dato){
	
		const self = this

		let lat 	= current_dato.lat
		let lon 	= current_dato.lon
		let zoom 	= current_dato.zoom

		const geolocation = document.querySelectorAll('[data-tipo="'+current_tipo+'"][data-component_name="component_geolocation"] .leaflet-container');

		if(geolocation.length === 0){
			return false
		}
		if(geolocation.length !== 1) {
			return alert("Error, components count number is not valid :"+geolocation.length)
		}
		const leaflet_container_id = geolocation[0].id

		const current_map = self.maps[leaflet_container_id];
			  current_map.panTo([lat, lon],{animate:false,duration:0});
			  current_map.setZoom(zoom)

		return true
	}//end update de map with externar control



	/**
	* TOGGLE_FULL_MAP
	* @return 
	*/
	this.toggle_full_map = function( button_obj ) {
		
		const wrap_div = component_common.get_wrapper_from_element(button_obj) //find_ancestor(button_obj, 'wrap_component') //component_common.get_wrapper_from_element(button_obj,'css_wrap_geolocation');
		//return 	console.log(wrap_div);

		if( wrap_div.classList.contains('map_full') ) {
			wrap_div.classList.remove('map_full')
		}else{
			wrap_div.classList.add('map_full')		
		}

		// Reset map size
		map.invalidateSize()
		
		return true
	}//end toggle_full_map
			


}//end component_geolocation