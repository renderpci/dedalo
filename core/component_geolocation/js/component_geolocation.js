/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_geolocation} from '../../component_geolocation/js/render_component_geolocation.js'



export const component_geolocation = function(){

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
	// temporary data_value: component_geolocation does not save the values when the inputs change their value.
	// We need a temporary value for the all current values of the inputs (lat, lon, zoom, alt)
	// to will be used for save it when the user clicks on the save button
	this.current_value = []

	this.parent
	this.node

	this.tools

	this.duplicates 	= false
	this.events_tokens

	this.ar_tag_loaded 	= []
	this.map 			= null
	this.layer_control	= false


	//draw editor vars
	this.draw_data 		= null
	this.drawControl
	this.draw_editor_is_initated = false
	this.editable_FeatureGroup
	this.ar_FeatureGroup = []
	this.draw_state
	this.current_editable_FeatureGroup_id

	//global state of the document
	this.loaded_document = false

	return true
}//end component_geolocation



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_geolocation.prototype.build 	 			= component_common.prototype.build
	component_geolocation.prototype.render 				= common.prototype.render
	component_geolocation.prototype.destroy 	 		= common.prototype.destroy
	component_geolocation.prototype.refresh 			= common.prototype.refresh
	component_geolocation.prototype.save 	 			= component_common.prototype.save
	component_geolocation.prototype.load_data 			= component_common.prototype.load_data
	component_geolocation.prototype.get_value 			= component_common.prototype.get_value
	component_geolocation.prototype.set_value 			= component_common.prototype.set_value
	component_geolocation.prototype.update_data_value	= component_common.prototype.update_data_value
	component_geolocation.prototype.update_datum 		= component_common.prototype.update_datum
	component_geolocation.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_geolocation.prototype.list 			= render_component_geolocation.prototype.list
	component_geolocation.prototype.edit 			= render_component_geolocation.prototype.edit
	component_geolocation.prototype.edit_in_list	= render_component_geolocation.prototype.edit
	component_geolocation.prototype.search 			= render_component_geolocation.prototype.search
	component_geolocation.prototype.change_mode 	= component_common.prototype.change_mode




/**
* INIT
*/
component_geolocation.prototype.init = async function(options) {

	const self = this

	// call the generic commom tool init
		const common_init = component_common.prototype.init.call(this, options);

	// set the self specific libraries and variables not defined by the generic init
		// load dependences js/css
			const load_promises = []

			const lib_js_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.js'
			load_promises.push( common.prototype.load_script(lib_js_file) )

			const lib_css_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.css'
			load_promises.push( common.prototype.load_style(lib_css_file) )

			await Promise.all(load_promises).then(async function(response){

				const draw_lib_js_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.draw/leaflet.draw.js'
				common.prototype.load_script(draw_lib_js_file)

				const draw_lib_css_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.draw/leaflet.draw.css'
				common.prototype.load_style(draw_lib_css_file)

			})

	return common_init
}//end init

/**
* get_MAP
* load the libraries and specific css
*/

component_geolocation.prototype.get_map = async function(map_container, value) {

	const self = this

	// defaults
		const default_lat 	= 39.462571
		const default_lon 	= -0.376295
		const default_zoom 	= 16
		const default_alt 	= 0

	// get data
		const key 			= JSON.parse(map_container.dataset.key)
		const field_lat  	= value.lat 	|| default_lat
		const field_lon  	= value.lon 	|| default_lon
		const field_zoom 	= value.zoom 	|| default_zoom
		const field_alt 	= value.alt 	|| default_alt

	// update teh current_value
		self.current_value[key] = JSON.parse(JSON.stringify(self.data.value[key]))

	// map_data
		const map_data = (typeof value!=="undefined")
			? {
				x	  : field_lat,
				y	  : field_lon,
				zoom  : field_zoom,
				alt   : field_alt,
			  }
			: {
				x	 : default_lat,
				y	 : default_lon,
				zoom : default_zoom,
				alt  : default_alt
			 }

	// new map vars
		let arcgis 			= null
		let osm  			= null
		let dare 			= null
		let base_maps 		= {}


	// Add layer to map
		switch(self.context.geo_provider) {

			case 'OSM':
				self.map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
				L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
					attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
					//attribution: '<a href="http://fmomo.org">Dedalo</a>',
					maxZoom: 19
				}).addTo(self.map);
				break;

			case 'GOOGLE':
				self.map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
			    const googleLayer = new L.Google('ROADMAP');
			    //map.addLayer(googleLayer);
			    googleLayer.addTo(self.map);
			    break;

			case 'ARCGIS':
			 	self.map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
		        L.tileLayer('http://server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
		        maxZoom: 18,
		        attribution: 'Tiles &copy; Esri — '
		            + 'Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, '
		            + 'Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'}).addTo(self.map);
		        break;

			case 'NUMISDATA':
				// LAYER
				//var dare 		= new L.TileLayer('http://dare.ht.lu.se/tiles/imperium/{z}/{x}/{y}.png');
				dare = new L.TileLayer('http://pelagios.org/tilesets/imperium/{z}/{x}/{y}.png',{
					maxZoom: 11
				});

				arcgis = new L.tileLayer('//server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

				osm = new L.TileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom: 19, maxNativeZoom: 19});

				// MAP
				self.map = new L.map(map_container, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

				// LAYER SELECTOR
				base_maps = {
					dare 	:  dare,
					arcgis 	: arcgis,
					osm 	: osm
				}
				if(self.layer_control===false || self.loaded_document===true) {
					self.layer_control = L.control.layers(base_maps).addTo(self.map);
				}

				self.map.on('overlayadd', function(e) {
				  	self.init_draw_editor(self.ar_FeatureGroup[e.name], e.name)
				})
				break;

			case 'VARIOUS':
				// LAYER
				//var arcgis 		= new L.tileLayer('http://server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
				arcgis = new L.tileLayer('//server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
				//var cloudmade 	= new L.TileLayer('http://{s}.tile.cloudmade.com/BC9A493B41014CAABB98F0471D759707/997/256/{z}/{x}/{y}.png');
				//var osm 		= new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
				osm = new L.TileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
		        //var ggl 	= new L.Google();
				//var ggl2 	= new L.Google('TERRAIN');

				// MAP
				self.map = new L.map(map_container, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

				// layer selector
				base_maps = {
					arcgis  : arcgis,
					osm 	: osm
				}
				if(self.layer_control===false || self.loaded_document===true) {
					self.layer_control = L.control.layers(base_maps).addTo(self.map);
				}

				self.map.on('overlayadd', function(e) {
				  	self.init_draw_editor(self.ar_FeatureGroup[e.name], e.name)
				});

				//self.layer_control.addBaseLayer(base_maps, "basemaps");
				//map.addControl(new L.Control.Layers( {'Arcgis':arcgis, 'OSM':osm}, {}));
				//map.addControl(arcgis);

				// ADD_DRAW_EDIT_LAYER
				//self.add_draw_edit_layer(map, tag_id);
				break;
		}//end switch(self.context.geo_provider)



	// disable zoom handlers
	self.map.scrollWheelZoom.disable();
	// disable tap handler, if present.
	if (self.map.tap) self.map.tap.disable();
	// Add to maps array
	//self.maps[map_container] = map;

	// map move listeners
		self.map.on('dragend', function(e){

			// Update input values
			self.update_input_values({
				lat  : self.map.getCenter().lat,
				lon  : self.map.getCenter().lng,
				zoom : self.map.getZoom()
			},map_container)
		});
		self.map.on('zoomend', function(e){
			// Update input values
			self.update_input_values({
				lat  : self.map.getCenter().lat,
				lon  : self.map.getCenter().lng,
				zoom : self.map.getZoom()
			},map_container)
		});

	// map ready event
		self.map.whenReady(function(e){
			// force refresh map (apply 'invalidateSize')
			const current_map = this
			setTimeout(()=>{
				// console.log("e:",this);
				// map.invalidateSize();
				self.refresh_map(current_map)
			}, 20)
		});


	// onreadystatechange event complete render_tags
		document.onreadystatechange = function() {
			if (document.readyState==='complete') {
				self.render_tags()
				self.loaded_document = true
			}
		}

	//if (self.loaded_document===true) {
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
	const section_group   = map_container.parentNode
	const observer_config = {
		attributeFilter : ['style'],
		attributes 		: true,
		childList 		: false,
		subtree 		: false
	}
	const observer = new MutationObserver(function(mutationList){
		self.refresh_map(self.map)
	})
	observer.observe(section_group, observer_config)

	return true
}//end get_map



/**
* UPDATE_INPUT_VALUES
* @return bool true
*/
component_geolocation.prototype.update_input_values = function(data, map_container) {

	const self = this

	const key 	= map_container.dataset.key
	const li 	= map_container.parentNode

	// inputs
		const input_lat		= li.querySelector("input[data-name='lat']")
		const input_lon		= li.querySelector("input[data-name='lon']")
		const input_zoom	= li.querySelector("input[data-name='zoom']")
		const input_alt		= li.querySelector("input[data-name='alt']")

	// Set values to inputs
		input_lat.value  = data.lat
		input_lon.value  = data.lon
		input_zoom.value = data.zoom

	//get the value from alt input
		data.alt = JSON.parse(input_alt.value)

	//set the current value
		self.current_value[key] = data

		//self.node[data.key].dispatchEvent(new Event('change')); //Event('change',{ 'bubbles': true })

	return true
}//end update_input_values



/**
* REFRESH_MAP
* @return bool true
*/
component_geolocation.prototype.refresh_map = function(map) {

	//map._onResize();
	map.invalidateSize(); // Force refresh map

	return true
}//end refresh_map



/**
* LOAD_GEO_EDITOR
* Load all data information of the current selected tag. Init the edditor if it is not loaded.
* Carga los datos al pulsar sobre la etiqueta. Inicializa el editor de no estar ya inicializado
*/
component_geolocation.prototype.load_geo_editor = function(options, all_tags) {

	const self = this

	const tag = options.tag

	if (typeof all_tags==="undefined") {
		all_tags = false
	}

	if(SHOW_DEBUG===true) {
		//console.log("[component_geolocation.load_geo_editor] tag:",tag);;
	}

	// TAG : Get all information of the selected tag
	const parts_of_tag = self.get_parts_of_tag(tag);

	var data 	= parts_of_tag.data
	var	capaId 	= parts_of_tag.capaId

	// ar_tag_loaded : store current tag
		self.ar_tag_loaded[capaId] = tag;

	// FEATUREGROUP BUILD : Verify if exist FeatureGroup, else create it. map is global var
	if( self.map.hasLayer(self.ar_FeatureGroup[capaId])===false ) {

		if(!all_tags){
			for (var i = self.ar_FeatureGroup.length - 1; i >= 1; i--) {
				if(self.ar_FeatureGroup[i]){
					self.ar_FeatureGroup[i].clearLayers();
					self.layer_control.removeLayer(self.ar_FeatureGroup[i])
				}
			}
		}

		// Create a new FeatureGroup
		self.ar_FeatureGroup[capaId] = new L.FeatureGroup();
		self.ar_FeatureGroup[capaId].addTo(self.map);

		self.layer_control.addOverlay(self.ar_FeatureGroup[capaId], capaId);

	}else{
		// Condfirm our write
		//if( !confirm("Discard changes?") ) return;
		//remove all layers

		if(!all_tags){
			for (var i = self.ar_FeatureGroup.length - 1; i >= 1; i--) {
				if(self.ar_FeatureGroup[i]){
					self.ar_FeatureGroup[i].clearLayers();
					self.layer_control.removeLayer(self.ar_FeatureGroup[i])
				}
			}
		}
		self.layer_control.addOverlay( self.ar_FeatureGroup[capaId], capaId);
		// FEATUREGROUP RESET : Remove the all data layers for re-created with the new data that come with the loaded tag.
		self.ar_FeatureGroup[capaId].clearLayers();	//delete self.ar_FeatureGroup[capaId];
	}

	// LAYERS : Load layers from tag data
	if (typeof data!=="undefined" && data!=="undefined" && data!=="") {

		L.geoJson( JSON.parse(data), {
			//For each Feature load all layer data of the tag
	    	onEachFeature: function (feature, data_layer) {
	    		if(data_layer){

	    			// PopupContent. get the popup information
						const content = self.get_popup_content(data_layer);
							if (content) {
								data_layer.bindPopup(content);
							}

		            // Click. Listener for each layer, when the user click into one layer, activate it and your feature, deactivate rest of the features and layers
						data_layer.on('click', function(e) {
							if(self.draw_state==="delete"){
								self.ar_FeatureGroup[capaId].removeLayer(e.layer);
								return;
	            			}
	            			// change all features and layers for activate or deactivate the edit mode.
	            			const FeatureGroup_length = self.ar_FeatureGroup.length;
							for (var i = FeatureGroup_length - 1; i >= 1; i--) {
								if(self.ar_FeatureGroup[i]){
									if(self.ar_FeatureGroup[i]===self.ar_FeatureGroup[capaId]){
										//All layers and features to desactive and change to blue color
										self.ar_FeatureGroup[capaId].eachLayer(function (layer){
											layer.editing.disable();
									    	if(!(layer instanceof L.Marker)){
										    	layer.setStyle({color: '#31df25'});
										    }
									    });
									}else{
										//The layers of the actual feature disable and change to green color
										self.ar_FeatureGroup[i].eachLayer(function(layer) {
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
							//self.init_draw_editor( self.ar_FeatureGroup[capaId], capaId )
						 });

					// addLayer
						// console.log("self.ar_FeatureGroup[capaId]:",self.ar_FeatureGroup[capaId]); // , "data_layer", data_layer, "capaId",capaId
						self.ar_FeatureGroup[capaId].addLayer(data_layer)
		    	}
			}
		})

	};


	//map.addControl(L.Control.Layers.addOverlay( self.ar_FeatureGroup[capaId], capaId));
	// DRAW_EDITOR : Init draw editor and pass current FeatureGroup
	self.init_draw_editor( self.ar_FeatureGroup[capaId], capaId )

	// OVERLAY : Lo añadimos al map ovelay (Adds an overlay (checkbox entry) with the given name to the control)
	//current_overlay = L.tileLayer(self.ar_FeatureGroup[capaId]);
	//L.control.layers({},{'current_overlay':current_overlay}).addTo(map);

	// CURRENT_EDITABLE_FEATUREGROUP_ID : Fijamos como current editable el FeatureGroup actual
	self.current_editable_FeatureGroup_id = capaId;
}//end load_geo_editor


/**
* GET_DATA_TAG
* Send the data_tag to the text_area when it need create a new tag
*/
component_geolocation.prototype.get_data_tag = function(){

	const data_tag = {
		type 	: 'geo',
		tag_id 	: null,
		state 	: 'n',
		label 	: '',
		data 	: ''
	}

	return data_tag
}// end get_data_tag


/**
* GET_PARTS_OF_TAG
*/
component_geolocation.prototype.get_parts_of_tag = function(tag_obj) {

	const type = tag_obj.dataset.type
		if (type!=='geo'){
			alert("invalid tag here!!!!")
			return false
		}

	const tagState 		= tag_obj.dataset.state
	const capaId 		= tag_obj.dataset.tag_id
	const dirty_data 	= tag_obj.dataset.data
	const data 			= dirty_data.replace(/'/g, '"')

	// if the tag is empty we can't parse it.
	const dato = (data) ? JSON.parse(data) : data

	const parts_of_tag = {
		capaId 	 : capaId,
		tagState : tagState,
		data 	 : data
	}

	return parts_of_tag
}//end get_parts_of_tag



/**
* GET_POPUP_CONTENT
* @return
* 	Generate popup content based on layer type
*	Returns HTML string, or null if unknown object
*/
component_geolocation.prototype.get_popup_content = function(layer) {

	const sefl = this

    // Marker - add lat/long
    if (layer instanceof L.Marker) {
        return this.str_lat_lng(layer.getLatLng());
    // Circle - lat/long, radius
    } else if (layer instanceof L.Circle) {
        var center = layer.getLatLng(),
            radius = layer.getRadius();
        return "Center: "+this.str_lat_lng(center)+"<br />"
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
};//end get_popup_content




/**
* STR_LAT_LNG
* @return
* 	Helper method to format LatLng object (x.xxxxxx, y.yyyyyy)
*/
component_geolocation.prototype.str_lat_lng = function(latlng) {

	const self = this

	return "("+self.round_coordinate(latlng.lat, 6)+", "+self.round_coordinate(latlng.lng, 6)+")";
};//end str_lat_lng



/**
* ROUND_COORDINATE
* @return
* 	add pop up information to the draw
*	Truncate value based on number of decimals
*/
component_geolocation.prototype.round_coordinate = function(num, len) {

	return Math.round(num*(Math.pow(10, len)))/(Math.pow(10, len));
};//end round_coordinate



/*
* INIT_DRAW_EDITOR
* @see https://github.com/Leaflet/Leaflet.draw/issues/66
*/
component_geolocation.prototype.init_draw_editor = function( current_editable_FeatureGroup, capa_id ) {

	const self = this
	const map 						= self.map
	const draw_editor_is_initated 	= self.draw_editor_is_initated

	self.current_editable_FeatureGroup_id 	= capa_id;
	self.editable_FeatureGroup 			 	= current_editable_FeatureGroup;
	const editable_FeatureGroup				= self.editable_FeatureGroup

	// DRAW CONTROL REMOVE : Si ya existe, lo eliminamos para poder crearlo de nuevo y que haya sólo uno activo
		if (self.drawControl) {
			self.drawControl.remove(map)
		}

	// DRAW CONTROL ///////////////////////////////////////////////////
	// El editor se inicaliza cada vez y recibe el FeatureGroup recién cargado como parámetro (ver https://github.com/Leaflet/Leaflet.draw/issues/66)
	self.drawControl = new L.Control.Draw({
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
	map.addControl(self.drawControl);

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
			var	content = self.get_popup_content(layer)

			if (content!==null) {
                layer.bindPopup(content);
            }
            //listener fired when the layer is selected.
            layer.on('click', function(e) {
            	if(self.draw_state==="delete"){
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
			self.draw_data = editable_FeatureGroup;

			//save the draw_data
			self.save_draw_data();

		});
		// Listener on change the draw editor to "edited mode" for save the the current data of the editable_FeatureGroup
		map.on(L.Draw.Event.EDITED, function (e) {	// Triggered when layers in the FeatureGroup, initialised with the plugin, have been edited and saved.
			// Update draw_data
			self.draw_data = editable_FeatureGroup;
			// Save draw_data
			self.save_draw_data();
		});
		// Listener for delete the draw editor to "deleted mode" for save the current data of the editable_FeatureGroup
		map.on(L.Draw.Event.DELETED, function (e) {	// Triggered when layers have been removed (and saved) from the FeatureGroup.
			self.draw_data = editable_FeatureGroup;
			// Save draw_data
			self.save_draw_data();
		});
		// Listener for change the mode of the draw (trash button in the editor)
		map.on(L.Draw.Event.DELETESTART, function (e) {
			self.draw_state = "delete";
		});
		// Listener for exit of the "delete mode" of the draw editor (close or save options of the trash button in the editor)
		map.on(L.Draw.Event.DELETESTOP, function (e) {
			self.draw_state = "";
		});
		// Listerner to the map for change the edit mode the all layer of the all features (change the state and color)
		map.on('click', function(e){
			self.draw_state ="";
			for (var i = self.ar_FeatureGroup.length - 1; i >= 1; i--) {
				if(self.ar_FeatureGroup[i]){
					self.ar_FeatureGroup[i].eachLayer(function(layer) {
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
* SAVE_DRAW_DATA
*/
component_geolocation.prototype.save_draw_data = function() {

		const self = this

		if(!self.draw_data) return false;

		let current_draw_data = JSON.stringify(self.draw_data.toGeoJSON());
			if(SHOW_DEBUG===true) {
				console.log("[component_geolocation.save_draw_data] for ["+self.current_editable_FeatureGroup_id + "]", self.draw_data.toGeoJSON() )
			}
			current_draw_data = current_draw_data.replace(/"/g, '\'') //replaceAll('"', '\'', current_draw_data)


		const tag_obj 		= self.ar_tag_loaded[self.current_editable_FeatureGroup_id]

		const tag_data = {
			type 			: tag_obj.dataset.type,
			tag_id 			: tag_obj.dataset.tag_id,
			id 				: tag_obj.id,
			dataset			: {data:current_draw_data},
			save 			: true
		}

		// UPDATE_TAG
		event_manager.publish('geo_change_tag' +'_'+ self.tipo, tag_data)

		return true
	};//end save_draw_data
