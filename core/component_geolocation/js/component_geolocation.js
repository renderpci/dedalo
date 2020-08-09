/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
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

	this.parent
	this.node

	this.tools

	this.duplicates 	= false
	this.events_tokens

	return true
}//end component_geolocation



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_geolocation.prototype.build				= component_common.prototype.build
	component_geolocation.prototype.render				= common.prototype.render
	component_geolocation.prototype.destroy				= common.prototype.destroy
	component_geolocation.prototype.refresh				= common.prototype.refresh
	component_geolocation.prototype.save				= component_common.prototype.save
	component_geolocation.prototype.load_data			= component_common.prototype.load_data
	component_geolocation.prototype.get_value			= component_common.prototype.get_value
	component_geolocation.prototype.set_value			= component_common.prototype.set_value
	component_geolocation.prototype.update_data_value	= component_common.prototype.update_data_value
	component_geolocation.prototype.update_datum		= component_common.prototype.update_datum
	component_geolocation.prototype.change_value		= component_common.prototype.change_value
	component_geolocation.prototype.build_dd_request	= common.prototype.build_dd_request

	// render
	component_geolocation.prototype.list				= render_component_geolocation.prototype.list
	component_geolocation.prototype.edit				= render_component_geolocation.prototype.edit
	component_geolocation.prototype.edit_in_list		= render_component_geolocation.prototype.edit
	component_geolocation.prototype.search				= render_component_geolocation.prototype.search
	component_geolocation.prototype.change_mode			= component_common.prototype.change_mode




/**
* INIT
*/
component_geolocation.prototype.init = async function(options) {

	const self = this

	self.ar_layer_loaded 	= []
	self.map 				= null
	self.layer_control		= false

	// temporary data_value: component_geolocation does not save the values when the inputs change their value.
	// We need a temporary value for the all current values of the inputs (lat, lon, zoom, alt)
	// to will be used for save it when the user clicks on the save button
	this.current_value 		= []

	//draw editor vars
	self.drawControl				= null
	self.draw_editor_is_initated 	= false
	self.ar_FeatureGroup 			= []
	self.draw_state					= null
	self.active_layer_id			= null

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

	// update the current_value with the data from DDBB
	// current_value will be update with different changes to create change_data to save
		self.current_value[key] = JSON.parse(JSON.stringify(self.data.value[key]))

	// load all layers
		self.ar_layer_loaded = typeof self.data.value[key].lib_data!=='undefined'
			? JSON.parse(JSON.stringify(self.data.value[key].lib_data))
			: []

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
		let arcgis 		= null
		let osm  		= null
		let dare 		= null
		let base_maps 	= {}


	// Add layer to map
		switch(self.context.geo_provider) {

			case 'OSM':
				self.map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
				L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
					attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
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
				dare = new L.tileLayer('http://pelagios.org/tilesets/imperium/{z}/{x}/{y}.png',{
					maxZoom: 11
				});

				arcgis = new L.tileLayer('//server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

				osm = new L.tileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom: 19, maxNativeZoom: 19});

				// MAP
				self.map = new L.map(map_container, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

				// LAYER SELECTOR
				base_maps = {
					dare 	:  dare,
					arcgis 	: arcgis,
					osm 	: osm
				}
				if(self.layer_control===false) {
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
				osm = new L.tileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
				// mapbox https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v9/static/-74.0237,40.6609,10,100,0/100x100?access_token=pk.eyJ1IjoibWFwc29mc3VtaXQiLCJhIjoiY2p5MDd2dTkxMDBkMjNubXNiaDVvdHo5ZCJ9.eMqOWuqoFITk01ie1I2BYQ
				// https://api.mapbox.com/styles/v1/mapbox/dark-v9/static/-74.0237,40.6609,10,100,0/100x100?access_token=pk.eyJ1IjoibWFwc29mc3VtaXQiLCJhIjoiY2p5MDd2dTkxMDBkMjNubXNiaDVvdHo5ZCJ9.eMqOWuqoFITk01ie1I2BYQ
				// https://api.mapbox.com/styles/v1/mapbox/light-v9/static/-74.0237,40.6609,10,100,0/100x100?access_token=pk.eyJ1IjoibWFwc29mc3VtaXQiLCJhIjoiY2p5MDd2dTkxMDBkMjNubXNiaDVvdHo5ZCJ9.eMqOWuqoFITk01ie1I2BYQ
				//// Provide your access token
				// const accessToken =
				//   'pk.eyJ1IjoibWFwc29mc3VtaXQiLCJhIjoiY2l1ZDF3dHE5MDAxZDMwbjA0cTR3dG50eSJ9.63Xci-GKFikhAobboF0DVQ';
				//
				// // set mapbox tile layer
				// const mapboxTiles1 = L.tileLayer(
				//   `https://api.mapbox.com/styles/v1/mapbox/streets-v9/tiles/{z}/{x}/{y}?access_token=${accessToken}`,
				//   {
				//     attribution:
				//       '&copy; <a href="https://www.mapbox.com/feedback/">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
				//   }
				// );
				// const mapboxTiles2 = L.tileLayer(
				//   `https://api.mapbox.com/styles/v1/mapbox/streets-v9/tiles/{z}/{x}/{y}?access_token=${accessToken}`,
				//   {
				//     attribution:
				//       '&copy; <a href="https://www.mapbox.com/feedback/">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
				//   }
				// );
				// const mapboxTiles3 = L.tileLayer(
				//   `https://api.mapbox.com/styles/v1/mapbox/streets-v9/tiles/{z}/{x}/{y}?access_token=${accessToken}`,
				//   {
				//     attribution:
				//       '&copy; <a href="https://www.mapbox.com/feedback/">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
				//   }
				// );


			    //var ggl 	= new L.Google();
				//var ggl2 	= new L.Google('TERRAIN');

				// MAP
				self.map = new L.map(map_container, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

				// layer selector
				base_maps = {
					arcgis  : arcgis,
					osm 	: osm
				}
				if(self.layer_control===false) {
					self.layer_control = L.control.layers(base_maps).addTo(self.map);
				}

				self.map.on('overlayadd', function(e) {
				  	self.init_draw_editor(self.ar_FeatureGroup[e.name], e.name)
				});

				break;
		}//end switch(self.context.geo_provider)


	// disable zoom handlers
	self.map.scrollWheelZoom.disable();
	// disable tap handler, if present.
	if (self.map.tap) self.map.tap.disable();

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
			//load data into map
			const ar_layer 		= self.ar_layer_loaded
			const ar_layer_len 	= ar_layer.length
			for (let i = 0; i < ar_layer_len; i++) {
				const layer = ar_layer[i]
				self.load_layer(layer)
			}

			// needless (!)
				// force refresh map (apply 'invalidateSize')
				// const current_map = this
				// setTimeout(()=>{
				// 	// map.invalidateSize();
				// 	self.refresh_map(current_map)
				// }, 20)
		});

	return true
}//end get_map



/**
* UPDATE_INPUT_VALUES
* @return bool true
*/
component_geolocation.prototype.update_input_values = function(data, map_container) {

	const self = this

	const key = map_container.dataset.key
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
		self.current_value[key].lat 	= data.lat
		self.current_value[key].lon 	= data.lon
		self.current_value[key].zoom 	= data.zoom
		self.current_value[key].alt 	= data.alt

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
* Load all data information of the current selected tag or Full database.
*/
component_geolocation.prototype.load_geo_editor = function(options) {

	const self = this
	const load = options.load || 'full'

	switch(load) {
		case ('full'):
			const ar_layer 		= self.ar_layer_loaded
			const ar_layer_len 	= ar_layer.length
			for (let i = 0; i < ar_layer_len; i++) {
				const layer = ar_layer[i]
				self.load_layer(layer)
			}
		break;
		case ('layer'):
			const layer_id 		= options.layer_id
			const loaded_layer	= self.ar_layer_loaded.find((item) => item.layer_id === layer_id)
			// if the layer is not in the ar_layer_loaded, it will be new layer (ex:comes form new tag)
			// create new layer data with the new id and set to ar_layer_loaded
			const layer = (typeof (loaded_layer) !== 'undefined')
			? loaded_layer
			: (function(){
				const new_layer = {
					layer_id 	: layer_id,
					layer_data 	: [],
				}
				self.ar_layer_loaded.push(new_layer)
				return new_layer
			})()
			self.load_layer(layer)
		break;

		default:
		break;
	}//end switch
}// end load_geo_editor



/**
* LOAD_LAYER
* Load specific layer data information into the map
* one layer = one FeatureGroup (GeoJSON model)
* ar_FeatureGroup = ar_layers
* layer_id = int or key for select the layer into the ar_FeatureGroup
* Layer in Leaflet is a item in the map (circle, point, etc..)
*/
component_geolocation.prototype.load_layer = function(layer){

		const self = this

	// set the layer data
		const layer_id			= layer.layer_id
		const layer_data		= layer.layer_data
		const layer_name		= 'layer_' +layer_id
		const user_layer_name 	= typeof layer.user_layer_name !=='undefined'
			? layer.user_layer_name
			: layer_name

	// FEATUREGROUP BUILD : Verify if exist FeatureGroup, else create it. map is global var
	// if( self.map.hasLayer(self.ar_FeatureGroup[layer_id])===false ) {
	if( typeof self.ar_FeatureGroup[layer_id] === 'undefined'){
		// the FeatureGroup is not loaded and don't exist into the map
		// Create a new FeatureGroup
		self.ar_FeatureGroup[layer_id] = new L.FeatureGroup();
		// set the FeatureGroup to the map
		self.ar_FeatureGroup[layer_id].addTo(self.map);
		// add to the layer control with checkbox and the name of the user
		self.layer_control.addOverlay(self.ar_FeatureGroup[layer_id], layer_id);
	}else{
		// FeatureGroup exist and it's loaded
		// remove the checkbox for all FeatureGroup into the control panel (remove the visualitzation)
		for (let i = self.ar_FeatureGroup.length - 1; i >= 1; i--) {
			self.ar_FeatureGroup[i].remove()
		}
		// add to the layer control with checkbox and the name of the user
		self.ar_FeatureGroup[layer_id].addTo(self.map);
	}

	// LAYERS : Load layers from data
	if (typeof layer_data!=="undefined" && layer_data!=="undefined" && layer_data!=="") {
		//remove previous data into the layer
		self.ar_FeatureGroup[layer_id].clearLayers();
		L.geoJson( layer_data, {
			//For each Feature load all layer data of the tag
	    	onEachFeature: function (feature, current_data_layer) {

	    		if(current_data_layer){

	    			// PopupContent. get the popup information
						const content = self.get_popup_content(current_data_layer);
							if (content) {
								current_data_layer.bindPopup(content);
							}//end if(content)

		            // Click. Listener for each layer, when the user click into one layer, activate it and your feature, deactivate rest of the features and layers
						current_data_layer.on('click', function(e) {
							if(self.draw_state==="delete"){
								self.ar_FeatureGroup[layer_id].removeLayer(e.layer);
								return;
	            			}// end if(self.draw_state==="delete")
	            			// change all features and layers for activate or deactivate the edit mode.
	            			const FeatureGroup_length = self.ar_FeatureGroup.length;
							for (var i = FeatureGroup_length - 1; i >= 1; i--) {
								if(self.ar_FeatureGroup[i]){
									if(self.ar_FeatureGroup[i]===self.ar_FeatureGroup[layer_id]){
										//All layers and features to desactive and change to blue color
										self.ar_FeatureGroup[layer_id].eachLayer(function (layer){
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
							//self.init_draw_editor( self.ar_FeatureGroup[layer_id], layer_id )
						 });

					// addLayer
						 // console.log("self.ar_FeatureGroup[layer_id]:",self.ar_FeatureGroup[layer_id]); // , "current_data_layer", current_data_layer, "layer_id",layer_id
						self.ar_FeatureGroup[layer_id].addLayer(current_data_layer)
		    	}// end if (current_data_layer)
			}//end onEachFeature
		})// end L.geoJson
	}// end if (typeof layer_data!=="undefined" && layer_data!=="undefined" && layer_data!=="")


	//map.addControl(L.Control.Layers.addOverlay( self.ar_FeatureGroup[layer_id], layer_id));
	// DRAW_EDITOR : Init draw editor and pass current FeatureGroup
	// self.init_draw_editor( self.ar_FeatureGroup[layer_id], layer_id )

	// ACTIVE_LAYER_ID : Set the current active layer id will be editable with the actual FeatureGroup
	self.active_layer_id = layer_id;
}//end load_geo_editor


/**
* LOAD_TAG_INTO_GEO_EDITOR
* called by the click into the tag (in component_text_area)
* the tag will send the ar_layer_id that it's pointing to
*/
component_geolocation.prototype.load_tag_into_geo_editor = async function(options) {

	const self = this
	// convert the tag dataset to 'real' object for manage it
	const ar_layer_id = JSON.parse(options.tag.dataset.data)
	// for every layer_id in the tag load the data from the DDBB
	for (let i = 0; i < ar_layer_id.length; i++) {
		self.load_geo_editor({
			load 	 	: 'layer',
			layer_id 	: parseInt(ar_layer_id[i])
		})
	}
}// load_tag_into_geo_editor



/**
* GET_DATA_TAG
* Send the data_tag to the text_area when it need create a new tag
*/
component_geolocation.prototype.get_data_tag = function(){

	const self = this

	const lib_data 		= self.get_lib_data()
	const last_layer_id = self.get_last_layer_id()

	const layers 		= lib_data.map((item) => {
		const layer = {
			layer_id 			: item.layer_id,
			user_layer_name 	: item.user_layer_name
		}
		return layer
	})

	const data_tag = {
		type 			: 'geo',
		tag_id 			: null,
		state 			: 'n',
		label 			: '',
		data 			: '',
		last_layer_id	: last_layer_id+1,
		layers 			: layers
	}

	return data_tag
}// end get_data_tag


/**
* GET_LIB_DATA
* get the lib_data in self.data, lib_data is the specific data of the library used (leaflet)
*/
component_geolocation.prototype.get_lib_data = function(){

	const self = this

	const lib_data = typeof (self.data.value[0]) !== 'undefined' && typeof (self.data.value[0].lib_data) !== 'undefined'
		? self.data.value[0].lib_data
		: [{
				layer_id 		: 1,
				layer_data 		: [],
				user_layer_name : 'layer_1'
			}]


	return lib_data
}//get_lib_data



/**
* GET_LAST_LAYER_ID
* Get the last layer_id in the data
* will be used for create new layer with the tag
*/
component_geolocation.prototype.get_last_layer_id = function(){

	const self = this

	const lib_data 		= self.get_lib_data()
	const ar_layer_id 	= lib_data.map((item) => item.layer_id)
	const last_layer_id = Math.max(...ar_layer_id)

	return last_layer_id
}//end get_last_layer_id



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
* @editable_FeatureGroup = the current layer data with all items in the current_layer (FeatureGroup)
* @layer_id = the id of the active layer
*/
component_geolocation.prototype.init_draw_editor = function( editable_FeatureGroup, layer_id ) {

	const self = this
	const map  = self.map

	self.active_layer_id 	= layer_id;

	// DRAW CONTROL REMOVE
	// If the draw control is loaded, it's necesary remove from the map, because the drawControl need to be loaded with especific layer/ FeatureGroup data.
	// When the layer is switched by the user, draw control need to be replace with the new selection.
		if (self.drawControl !== null) {
			self.drawControl.remove(map)
			map.removeControl(self.drawControl)
		}

	// DRAW CONTROL
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

		// DRAW HANDLERS
		// IMPORTANT: The editor is initiated every time that user change the layer selected, but the context and handlers for the items is the same
		 if(self.draw_editor_is_initated===true) {
			return false;
		}

		// Listener for object created - bind popup to layer, add to feature group
		map.on(L.Draw.Event.CREATED, function (e) {	// Triggered when a new vector or marker has been created.

			//var type  	= e.layerType
			const	layer 	= e.layer
			const	content = self.get_popup_content(layer)

			if (content!==null) {
                layer.bindPopup(content);
            }
            //listener fired when the layer is selected.
            layer.on('click', function(e) {
            	if(self.draw_state==="delete"){
					self.ar_FeatureGroup[self.active_layer_id].removeLayer(e.layer);
					return;
            	}else{
					e.target.editing.enable();
            	}
			})

			self.ar_FeatureGroup[self.active_layer_id].addLayer(layer);

			// Update draw_data
			self.update_draw_data();

		});
		// Listener on change the draw editor to "edited mode" for save the the current data of the editable_FeatureGroup
		map.on(L.Draw.Event.EDITED, function (e) {	// Triggered when layers in the FeatureGroup, initialised with the plugin, have been edited and saved.
			// Update draw_data
			self.update_draw_data();
		});
		// Listener for delete the draw editor to "deleted mode" for save the current data of the editable_FeatureGroup
		map.on(L.Draw.Event.DELETED, function (e) {	// Triggered when layers have been removed (and saved) from the FeatureGroup.
			// Update draw_data
			self.update_draw_data();
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
	self.draw_editor_is_initated = true;

	return true
}//end init_draw_editor



/**
* UPDATE_DRAW_DATA
* Preparing the data for save, update the layers data into the instance
* Save action is not exec here, see the render_component_geolocation for the save action
*/
component_geolocation.prototype.update_draw_data = function() {

	const self = this
	// get the active draw data of the active_layer
	const active_layer 			= self.ar_FeatureGroup[self.active_layer_id];
	// get the active_layer_id
	const layer_id				= self.active_layer_id
	// get the layer from the loaded data
	const current_layer 		= self.ar_layer_loaded.find((item) => item.layer_id === layer_id)
	//get the GeoJson of the active layer (from leaflet)
	current_layer.layer_data 	= active_layer.toGeoJSON()

	const key  					= self.map.getContainer().dataset.key

	// current_layer.user_layer_name 	= current_layer.data.user_layer_name

	// update the data in the instance previous to save
	const value 			=  typeof (self.data.value[0]) !== 'undefined'
		? JSON.parse(JSON.stringify(self.data.value[0]))
		: {}
	self.current_value[key].lib_data 			= self.ar_layer_loaded

	return true
}//end update_draw_data
