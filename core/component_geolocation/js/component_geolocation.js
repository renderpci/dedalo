/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB, L */
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {clone} from '../../common/js/utils/index.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import langs from '../../common/js/lang.json' assert { type: "json" };
	import {render_edit_component_geolocation} from '../../component_geolocation/js/render_edit_component_geolocation.js'
	import {render_list_component_geolocation} from '../../component_geolocation/js/render_list_component_geolocation.js'
	import {render_mini_component_geolocation} from '../../component_geolocation/js/render_mini_component_geolocation.js'
	import {render_search_component_geolocation} from '../../component_geolocation/js/render_search_component_geolocation.js'



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
	component_geolocation.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_geolocation.prototype.mini				= render_mini_component_geolocation.prototype.mini
	component_geolocation.prototype.list				= render_list_component_geolocation.prototype.list
	component_geolocation.prototype.edit				= render_edit_component_geolocation.prototype.edit
	component_geolocation.prototype.edit_in_list		= render_edit_component_geolocation.prototype.edit
	component_geolocation.prototype.search				= render_search_component_geolocation.prototype.search
	component_geolocation.prototype.change_mode			= component_common.prototype.change_mode



/**
* INIT
*/
component_geolocation.prototype.init = async function(options) {

	const self = this

	// is_data_changed. bool set as true when component data changes.
		self.is_data_changed = false


	self.ar_layer_loaded	= null
	self.map				= null
	self.layer_control		= false

	// temporary data_value: component_geolocation does not save the values when the inputs change their value.
	// We need a temporary value for all current values of the inputs (lat, lon, zoom, alt)
	// to will be used for save it when the user clicks on the save button
		this.current_value = []

	// draw editor vars
		self.drawControl				= null
		self.draw_editor_is_initated	= false
		self.FeatureGroup				= {}
		self.active_layer_id			= null

	// Data buffer will store the changes send by text area when the tags are removed or inserted
	// if the user undo the remove tag in the editor, restore for the data_buffer the layer data
	// this var will not save in DB, if the user delete the tag and do not undo in the same session or close the window the buffer will erase
		self.ar_data_buffer = []

	// call the generic common tool init
		const common_init = component_common.prototype.init.call(this, options);

	// set the self specific libraries and variables not defined by the generic init
		// load dependencies js/css
			const load_promises = []

			const lib_js_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.js'
			load_promises.push( common.prototype.load_script(lib_js_file) )

			const lib_css_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.css'
			load_promises.push( common.prototype.load_style(lib_css_file) )

			await Promise.all(load_promises).then(async function(response){

				const geo_editor_lib_js_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet-geoman/leaflet-geoman.min.js'
				common.prototype.load_script(geo_editor_lib_js_file)

				const geo_editor_lib_css_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet-geoman/leaflet-geoman.css'
				common.prototype.load_style(geo_editor_lib_css_file)

				const geo_messure_lib_js_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/turf/turf.min.js'
				common.prototype.load_script(geo_messure_lib_js_file)

			})


	return common_init
}//end init



/**
* GET_MAP
* load the libraries and specific css
*/
component_geolocation.prototype.get_map = async function(map_container, key) {

	const self = this

	// defaults
		const default_lat	= 39.462571
		const default_lon	= -0.376295
		const default_zoom	= 16
		const default_alt	= 0

		const value = self.data.value || []

	// get data
		// const key			= JSON.parse(map_container.dataset.key)
		const field_lat		= value[key].lat 	|| default_lat
		const field_lon		= value[key].lon 	|| default_lon
		const field_zoom	= value[key].zoom 	|| default_zoom
		const field_alt		= value[key].alt 	|| default_alt

	// update the current_value with the data from DDBB
	// current_value will be update with different changes to create change_data to save
		self.current_value[key] = clone(self.data.value[key])

	// load all layers
		self.ar_layer_loaded = typeof self.data.value[key].lib_data!=='undefined'
			? clone(self.data.value[key].lib_data)
			: []

	// map_data
		const map_data = (typeof value!=="undefined")
			? {
				x		: field_lat,
				y		: field_lon,
				zoom	: field_zoom,
				alt		: field_alt,
			  }
			: {
				x		: default_lat,
				y		: default_lon,
				zoom	: default_zoom,
				alt		: default_alt
			 }

	// new map vars
		let arcgis		= null
		let osm			= null
		let dare		= null
		let base_maps	= {}


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
					dare 	: dare,
					arcgis 	: arcgis,
					osm 	: osm
				}
				if(self.layer_control===false) {
					self.layer_control = L.control.layers(base_maps).addTo(self.map);
				}

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



				break;
		}//end switch(self.context.geo_provider)




	self.init_draw_editor()

	self.map.on('overlayadd', function(e) {
		self.active_layer_id = e.name
	})
	// self.map.pm.setGlobalOptions({ measurements: { measurement: true, displayFormat: 'metric' } })

	// set the lang of the tool
	const dedalo_lang = page_globals.dedalo_data_lang
	const lang_obj = langs.find(item => item.dd_lang === dedalo_lang)
	const lang = lang_obj
		? lang_obj.tld2
		: 'en'

	self.map.pm.setLang(lang);

	// disable zoom handlers
	self.map.scrollWheelZoom.disable();
	// disable tap handler, if present.
	// if (self.map.tap) self.map.tap.disable();

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
		self.map.on('click', function(e){

			for (let feature in self.FeatureGroup) {
				const feature_group = self.FeatureGroup[feature]
				feature_group.eachLayer(function (layer){

					layer.pm.disable()
					if(!(layer instanceof L.Marker)){
						layer.setStyle({color: '#3388ff'});
					}
				});
			}

		})

	// map ready event
		self.map.whenReady(function(e){
			//load data into map
			// const ar_layer 		= self.ar_layer_loaded
			// const ar_layer_len 	= ar_layer.length
			// for (let i = 0; i < ar_layer_len; i++) {
			// 	const layer = ar_layer[i]
			// 	self.load_layer(layer)
			// }

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

	const key	= map_container.dataset.key
	const li	= map_container.parentNode

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
		self.current_value[key].lat		= data.lat
		self.current_value[key].lon		= data.lon
		self.current_value[key].zoom	= data.zoom
		self.current_value[key].alt		= data.alt

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
* LAYERS_LOADER
* Load all data information of the current selected tag or full database layer loaded.
*/
component_geolocation.prototype.layers_loader = function(options) {

	const self = this

	// options
		const load		= options.load || 'full'
		const layer_id	= options.layer_id

	// load_layer
		switch(load) {
			case ('full'):

				const ar_layer	=  self.ar_layer_loaded
				const ar_layer_len	= ar_layer.length
				for (let i = 0; i < ar_layer_len; i++) {
					const layer = ar_layer[i]
					self.load_layer(layer)
				}
				// active all layer in control
				const control_layers_len = self.layer_control._layers.length
				for (var i = 0; i < control_layers_len; i++) {
					const layer = self.layer_control._layers[i]
					if(layer.overlay){
						const input = self.layer_control._layerControlInputs[i]
						if(!input.checked){
							input.click()
						}
					}
				}
				break;
			case ('layer'):
				const loaded_layer = self.ar_layer_loaded.find((item) => item.layer_id === layer_id)
				// if the layer is not in the ar_layer_loaded, it will be new layer (ex:comes form new tag)
				// create new layer data with the new id and set to ar_layer_loaded
				const layer = typeof(loaded_layer)!=='undefined'
					? loaded_layer
					: (function(){
						const new_layer = {
							layer_id	: layer_id,
							layer_data	: []
						}
						self.ar_layer_loaded.push(new_layer)
						return new_layer
					  })()
				self.load_layer(layer)
				break;

			default:
				break;
		}//end switch

	return true
}//end layers_loader



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
		const user_layer_name	= typeof(layer.user_layer_name)!=='undefined'
			? layer.user_layer_name
			: layer_name

	// FEATUREGROUP BUILD : Verify if exist FeatureGroup, else create it. map is global var
	// if( self.map.hasLayer(self.FeatureGroup[layer_id])===false ) {
	if( typeof self.FeatureGroup[layer_id] === 'undefined'){


		// the FeatureGroup is not loaded and does not exist into the map
		// Create a new FeatureGroup
		self.FeatureGroup[layer_id] = new L.FeatureGroup();
		self.map.pm.setGlobalOptions({layerGroup: self.FeatureGroup[layer_id]})

		// self.FeatureGroup[layer_id].options.tag_id = layer_id
		// self.FeatureGroup[layer_id].options = { pmIgnore: true }
		// self.FeatureGroup[layer_id].options.pmIgnore = false;

		// set the FeatureGroup to the map
		self.FeatureGroup[layer_id].addTo(self.map);
		// add to the layer control with checkbox and the name of the user
		self.layer_control.addOverlay(self.FeatureGroup[layer_id], layer_id);
	}else{
		// FeatureGroup exist and it's loaded
		// remove the checkbox for all FeatureGroup into the control panel (remove the visualization)
		for (let feature in self.FeatureGroup) {
			self.FeatureGroup[feature].remove()
		}

		// self.FeatureGroup[layer_id].setStyle({pmIgnore: false});
		// self.FeatureGroup[layer_id].options.pmIgnore = false; // If the layer is a LayerGroup / FeatureGroup / GeoJSON this line is needed too
		// L.PM.reInitLayer(self.FeatureGroup[layer_id]);

		// add to the layer control with checkbox and the name of the user
		self.FeatureGroup[layer_id].addTo(self.map);
		// self.FeatureGroup[layer_id].options.tag_id = layer_id
		self.map.pm.setGlobalOptions({layerGroup: self.FeatureGroup[layer_id]})
	}

	// LAYERS : Load layers from data
	if (typeof layer_data!=="undefined" && layer_data!=="undefined" && layer_data!=="") {
		//remove previous data into the layer
		self.FeatureGroup[layer_id].clearLayers();

		self.FeatureGroup[layer_id].on('pm:update', (e) => {
			self.update_draw_data(layer_id);
		});
		self.FeatureGroup[layer_id].on('pm:edit', (e) => {
			self.update_draw_data(layer_id);
		});
		self.FeatureGroup[layer_id].options.tag_id = layer_id
		self.map.pm.setGlobalOptions({layerGroup: self.FeatureGroup[layer_id]})

		L.geoJson( layer_data, {
			pointToLayer: (feature, latlng) => {
				if (feature.properties.shape==='circle') {
					return new L.Circle(latlng, feature.properties.radius);
				} else {
					return new L.Marker(latlng);
				}
			},
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
							// ACTIVE_LAYER_ID : Set the current active layer id will be editable with the actual FeatureGroup
								self.active_layer_id = layer_id;

							// change all features and layers for activate or deactivate the edit mode.
								for (let feature in self.FeatureGroup) {

									if(feature){
										if(self.FeatureGroup[feature]===self.FeatureGroup[layer_id]){
											self.FeatureGroup[layer_id].eachLayer(function (layer){
												// layer.editing.disable();
												layer.pm.enable()
												if(!(layer instanceof L.Marker)){
													layer.setStyle({color: '#31df25'});
												}
											});
										}else{

											//The layers of the actual feature disable and change to green color
											self.FeatureGroup[feature].eachLayer(function(layer) {
												// layer.editing.disable();
												layer.pm.disable()
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
								console.log("Not e.target instanceof L.Marker ",);
							}

						 });
					// addLayer
						self.FeatureGroup[layer_id].addLayer(current_data_layer)
				}// end if (current_data_layer)
			}// end onEachFeature
		})// end L.geoJson
	}// end if (typeof layer_data!=="undefined" && layer_data!=="undefined" && layer_data!=="")

	// ACTIVE_LAYER_ID : Set the current active layer id will be editable with the actual FeatureGroup
		self.active_layer_id = layer_id;

	// enable Edit Mode
		// self.FeatureGroup[layer_id].pm.enable();

}//end load_geo_editor



/**
* LOAD_TAG_INTO_GEO_EDITOR
* Called by the user click on the tag (in component_text_area)
* The tag will send the ar_layer_id that it's pointing to
*/
component_geolocation.prototype.load_tag_into_geo_editor = async function(options) {

	const self = this

	// options
		const tag_obj = options.tag

	// layer_id
		const layer_id	= parseInt(tag_obj.tag_id)

	// load_layer
		self.layers_loader({
			load 		: 'layer',
			layer_id	: layer_id
		})



	return true
}//end load_tag_into_geo_editor


/**
* GET_DATA_TAG
* Send the data_tag to the text_area when it need create a new tag
*/
component_geolocation.prototype.get_data_tag = function() {

	const self = this

	const lib_data 		= self.get_lib_data()
	const last_layer_id = self.get_last_layer_id()

	// layers
	const layers = lib_data.map((item) => {
		const layer = {
			layer_id		: item.layer_id,
			user_layer_name	: item.user_layer_name
		}
		return layer
	})

	const data_tag = {
		type			: 'geo',
		tag_id			: null,
		state			: 'n',
		label			: '',
		data			: '',
		last_layer_id	: last_layer_id+1,
		layers			: layers
	}

	return data_tag
}//end get_data_tag



/**
* GET_LIB_DATA
* get the lib_data in self.data, lib_data is the specific data of the library used (leaflet)
* @return array lib_data
*/
component_geolocation.prototype.get_lib_data = function() {

	const self = this

	const lib_data = typeof (self.data.value[0]) !== 'undefined' && typeof (self.data.value[0].lib_data) !== 'undefined'
		? self.data.value[0].lib_data
		: [{
				layer_id 		: 1,
				layer_data 		: [],
				user_layer_name : 'layer_1'
			}]


	return lib_data
}//end get_lib_data



/**
* GET_LAST_LAYER_ID
* Get the last layer_id in the data
* will be used for create new layer with the tag
* @return int last_layer_id
*/
component_geolocation.prototype.get_last_layer_id = function() {

	const self = this

	const lib_data 		= self.get_lib_data()
	const ar_layer_id 	= lib_data.map((item) => item.layer_id)
	const last_layer_id = Math.max(...ar_layer_id)

	return last_layer_id
}//end get_last_layer_id



/**
* GET_POPUP_CONTENT
* @return string|null
* 	Generate popup content based on layer type
*	Returns HTML string, or null if unknown object
*/
component_geolocation.prototype.get_popup_content = function(layer) {

	const self = this

	// Marker - add lat/long
	if (layer instanceof L.Marker) {
		return this.str_lat_lng(layer.getLatLng());
	// Circle - lat/long, radius
	} else if (layer instanceof L.Circle) {
		const center = layer.getLatLng(),
			radius = layer.getRadius();
		return "Center: "+this.str_lat_lng(center)+"<br />"
			  +"Radius: "+this.round_coordinate(radius, 2)+" m";
	// Rectangle/Polygon - area
	} else if (layer instanceof L.Polygon) {
		const latlngs = layer._defaultShape ? layer._defaultShape() : layer.getLatLngs()
		const geojson = layer.toGeoJSON()
		const area 		= turf.area(geojson)
		// const area = geodesic_area(latlngs);
		return "Area: "+readable_area(area, true);
	// Polyline - distance
	} else if (layer instanceof L.Polyline) {
		const latlngs = layer._defaultShape ? layer._defaultShape() : layer.getLatLngs()
		let	distance = 0;
		if (latlngs.length < 2) {
			return "Distance: N/A";
		} else {
			for (let i = 0; i < latlngs.length-1; i++) {
				distance += latlngs[i].distanceTo(latlngs[i+1]);
			}
			return "Distance: "+this.round_coordinate(distance, 2)+" m";
		}
	}

	return null;
}//end get_popup_content



/**
* STR_LAT_LNG
* @return string
* 	Helper method to format LatLng object (x.xxxxxx, y.yyyyyy)
*/
component_geolocation.prototype.str_lat_lng = function(latlng) {

	const self = this

	return "("+self.round_coordinate(latlng.lat, 6)+", "+self.round_coordinate(latlng.lng, 6)+")";
}//end str_lat_lng



/**
* ROUND_COORDINATE
* @return
* 	add pop up information to the draw
*	Truncate value based on number of decimals
*/
component_geolocation.prototype.round_coordinate = function(num, len) {

	return Math.round(num*(Math.pow(10, len)))/(Math.pow(10, len));
}//end round_coordinate


/*
* INIT_DRAW_EDITOR
* @see https://github.com/Leaflet/Leaflet.draw/issues/66
* @editable_FeatureGroup = the current layer data with all items in the current_layer (FeatureGroup)
* @layer_id = the id of the active layer
*/
component_geolocation.prototype.init_draw_editor = function() {

	const self = this
	const map  = self.map

		// add Leaflet-Geoman controls with some options to the map
		map.pm.addControls({
			position: 'topright',
			drawCircle: true,
		});

		map.pm.setGlobalOptions({ measurements: { measurement: true, displayFormat: 'metric' } })
		// Listener on change the draw editor to "edited mode" for save the the current data of the editable_FeatureGroup
		// listen to when a layer is changed in Edit Mode
		map.on('pm:create', (e) => {
			// const layers = L.PM.Utils.findLayers(map).options
			console.log("active_layer_id", self.active_layer_id)
			// e.layer.setStyle({ pmIgnore: false });
			// L.PM.reInitLayer(e.layer);
			console.log("create:",e);
			const layer = self.FeatureGroup[self.active_layer_id]
			e.layer.addTo(layer)
			// Update draw_data
			self.update_draw_data(self.active_layer_id);
		});

		// map.on('pm:drawend', (e) => {

		// 		console.log("drawend:",e);
		// 	// Update draw_data
		// 	self.update_draw_data();
		// });

		// Listener for delete the draw editor to "deleted mode" for save the current data of the editable_FeatureGroup
		map.on('pm:remove', (e) => {
			// Update draw_data
			self.update_draw_data(self.active_layer_id);
		});

	// DRAW_EDITOR_IS_INITATED : Fija la variable a global a true (default is false) para evitar duplicidades
	self.draw_editor_is_initated = true;

	return true
}//end init_draw_editor



/**
* UPDATE_DRAW_DATA
* Preparing the data for save, update the layers data into the instance
* Save action is not exec here, see the render_component_geolocation for the save action
*/
component_geolocation.prototype.update_draw_data = function(layer_id) {

	const self = this

	// set the data_changed to true to control that the data was changed
		self.is_data_changed = true

	// active_layer. get the active draw data of the active_layer
		const active_layer = self.FeatureGroup[layer_id];

	// current_layer. get the layer from the loaded data
		const current_layer = self.ar_layer_loaded.find((item) => item.layer_id===layer_id)

	// layer_data. get the GeoJson of the active layer (from leaflet)
		current_layer.layer_data = active_layer.toGeoJSON()

		const features = []
		active_layer.eachLayer(function (layer){

			const json = layer.toGeoJSON();
			// add layer_id
			json.properties.layer_id	= layer_id

			if (layer instanceof L.Circle) {
				json.properties.shape		= "circle";
				json.properties.radius		= layer.getRadius();
			}
			features.push(json)
		});
		current_layer.layer_data.features = features

	// value key
		const key = self.map.getContainer().dataset.key

	// current_layer.user_layer_name 	= current_layer.data.user_layer_name

	// update the data in the instance previous to save
		// const value = typeof (self.data.value[0])!=='undefined'
		// 	? clone(self.data.value[0])
		// 	: {}


		self.current_value[key].lib_data = self.ar_layer_loaded


	return true
}//end update_draw_data


/**
* MAP_UPDATE_COORDINATES
* Update the coordinates based in the data sent by other components, as autocomplet_hi
* this components can point to other record, as toponomy, that has a geolocation component
* this method will use the data of the referenced geolocation data in the pointed record as own coordinates
* The caller component will dispatch a event when it update his data that will fire this method
* the self component(geolocation that is listen) could be configured in properties as:
*
* 	"observe":[
* 		{
*			"event": "update_value",
*			"perform": "map_update_coordinates",
*			"component_tipo": "test9" // The component to be observe, usually an autocomplete_hi
*		}]
*
* the observable component could specify the component_geolocation that has the coordinates to be used:
*
* 	"target_geolocation_tipo": "hierarchy31"
*
* If the observable doesn't has specified the component_geolocation will use the default thesaurus component_geolocation: hierarchy31
*
*/
component_geolocation.prototype.map_update_coordinates = async function(options) {

	const self = this

	const caller		= options.caller
	const changed_data	= options.changed_data
	// check if the data sent has value(a locator), if not stop
	if(changed_data.value === null){
		return
	}

	const section_tipo	= changed_data.value.section_tipo
	const section_id	= changed_data.value.section_id
	// check if the caller has defined 'target_geolocation_tipo' in his properties
	const tipo = caller.context.properties.target_geolocation_tipo
		? caller.context.properties.target_geolocation_tipo
		: "hierarchy31" // Default geolocation map in thesarus

	// create the component to get the data
	// source object
		const source = {
			typo			: "source",
			type			: self.type,
			action			: 'get_data',
			model			: self.model,
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: 'edit',
			lang			: self.lang
		}
	// create the default rqo
		const rqo = {
			action	: 'read',
			source	: source
		}

	// load data. get context and data from API
		const api_response = await data_manager.request({
			body : rqo
		})

	// if result, incorporate it to the current map and reload it
	if(api_response.result){
		const data = api_response.result.data
		// geolocation doesn't has multiple maps and the key of the data array is always 0
		const key = 0
		self.current_value = data[key].value
		self.update_input_values(self.current_value[key], self.node.content_data[key].map_container)
		// move the map to the new point and zoom with the values
		self.map.panTo(new L.LatLng(self.current_value[key].lat, self.current_value[key].lon));
		self.map.setZoom(self.current_value[key].zoom);
		// modify his own data with the new values
		const changed_data = Object.freeze({
				action		: 'update',
				key			: key,
				value		: self.current_value[key]
			})
		self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})
	}//end if check api_response
}//end map_update_coordinates



/**
* LAYER_DATA_CHANGE
* @param object change, with the information of the tag and the action (insert, remove)
* {
* 	action : 'remove'
* 	tag_id : 1
* 	type : 'geo'
* }
* @return
*/
component_geolocation.prototype.layer_data_change = function(change) {

	const self = this

	// set the layer data
		const action 		= change.action
		const layer_id		= parseInt(change.tag_id)
		const layer_name	= 'layer_' +layer_id
		const key = 0; // fixed key (only one element is allowed)

		switch(action) {
			case 'insert':
				const recover_layer = self.ar_data_buffer[layer_id] ||
					{
						layer_id	: layer_id,
						layer_data	: []
					};

				self.ar_layer_loaded.push(recover_layer)
				self.load_layer(recover_layer)

				self.current_value[key].lib_data = self.ar_layer_loaded

				const recover_changed_data = Object.freeze({
					action		: 'update',
					key			: key,
					value		: self.current_value[key]
				})
				self.change_value({
					changed_data	: recover_changed_data,
					refresh			: false
				}).then(()=>{
					self.db_data.value[key] = clone(self.current_value[key])
				})
			break;

			case 'remove':

				// get the layer from the loaded data
				const layer = self.ar_layer_loaded.find((item) => item.layer_id===layer_id)
				if(!layer){
					return false
				}
				//store the layer into the data_buffer
				self.ar_data_buffer[layer_id] = layer;
				// remove the data of the FeatureGroup
				if(!self.FeatureGroup[layer_id]){
					return
				}
				self.FeatureGroup[layer_id].remove();
				self.FeatureGroup[layer_id].clearLayers();
				self.layer_control.removeLayer(self.FeatureGroup[layer_id]);
				delete self.FeatureGroup[layer_id];

				// remove the layer
				const index = self.ar_layer_loaded.findIndex((item) => item.layer_id===layer_id)
				self.ar_layer_loaded.splice(index,1)

				self.current_value[key].lib_data = self.ar_layer_loaded

				const changed_data = Object.freeze({
					action		: 'update',
					key			: key,
					value		: self.current_value[key]
				})
				self.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
				.then(()=>{
					self.db_data.value[key] = clone(self.current_value[key])
				})

			break;
		}


};//end layer_data_change



/*
* @method readable_area(area, isMetric, precision): string
* @return Returns a readable area string in yards or metric.
* The value will be rounded as defined by the precision option object.
*/
const readable_area = function (area, metric=true) {

	const precision = {
		km	: 2,
		ha	: 2,
		m	: 0,
		mi	: 2,
		ac	: 2,
		yd	: 0,
		ft	: 0,
		nm	: 2
	}

	let area_string

	if (metric) {

		if (area >= 1000000) {
			area_string = turf.round(turf.convertArea(area, 'meters', 'kilometers'), precision['km']) + ' km²';
		} else if (area >= 10000 ) {
			area_string = turf.round(turf.convertArea(area, 'meters', 'hectares'), precision['ha']) + ' ha';
		} else {
			area + ' m²';
		}
	} else {
		if (area >= 2589986.9952) { //2589986,9952 square meters are 1 square mile
			area_string = turf.round(turf.convertArea(area, 'meters', 'miles'), precision['mi']) + ' mi²';
		} else if (area >= 4046.8564224) { //4046.8564224 square meters are 1 acres
			area_string = turf.round(turf.convertArea(area, 'meters', 'acres'), precision['ac']) + ' acres';
		} else {
			area_string = turf.round(turf.convertArea(area, 'meters', 'yards'), precision['yd']) + ' yd²';
		}
	}

	return area_string;
};//end readable_area



