// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB, L */
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {clone} from '../../common/js/utils/index.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_edit_component_geolocation, render_popup_text, render_color_picker} from '../../component_geolocation/js/render_edit_component_geolocation.js'
	import {render_list_component_geolocation} from '../../component_geolocation/js/render_list_component_geolocation.js'
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

	this.duplicates = false
	this.events_tokens
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
	component_geolocation.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_geolocation.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_geolocation.prototype.list				= render_list_component_geolocation.prototype.list
	component_geolocation.prototype.tm					= render_list_component_geolocation.prototype.list
	component_geolocation.prototype.edit				= render_edit_component_geolocation.prototype.edit
	component_geolocation.prototype.search				= render_search_component_geolocation.prototype.search

	component_geolocation.prototype.change_mode			= component_common.prototype.change_mode



/**
* INIT
* @param object options
* @return bool
*/
component_geolocation.prototype.init = async function(options) {

	const self = this

	// short vars
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
		self.active_layer_id			= 1

	// Data buffer will store the changes send by text area when the tags are removed or inserted
	// if the user undo the remove tag in the editor, restore for the data_buffer the layer data
	// this var will not save in DB, if the user delete the tag and do not undo in the same session or close the window the buffer will erase
		self.ar_data_buffer = []

	// self default value when the component doesn't has any value, data = null
	// default value
		self.default_value = [{
			lat		: 39.462571,
			lon		: -0.376295,
			zoom	: 16,
			alt		: 0
		}]

	// call the generic common tool init
		const common_init = await component_common.prototype.init.call(this, options);

	// load dependencies js/css. Set the self specific libraries and variables not defined by the generic init
		// await self.load_libs()

	// event subscriptions
		// (!) Note that component properties could set observe events like (numisdata264, hierarchy31):
		// {
		//   "client": {
		//     "event": "click_tag_geo",
		//     "perform": {
		//       "function": "load_tag_into_geo_editor"
		//     }
		//   },
		//   "component_tipo": "numisdata19"
		// }


	return common_init
}//end init



/**
* LOAD_LIBS
* Load Leaflet lib and accessories
* @return promise
* 	bool true
*/
component_geolocation.prototype.load_libs = async function () {

	const self = this

	const license = null
			// `
			// /**
			//  *
			//  * @source: http://www.lduros.net/some-javascript-source.js
			//  *
			//  * @licstart  The following is the entire license notice for the
			//  *  JavaScript code in this page.
			//  *
			//  * Copyright (C) 2014  Loic J. Duros
			//  *
			//  *
			//  * The JavaScript code in this page is free software: you can
			//  * redistribute it and/or modify it under the terms of the GNU
			//  * General Public License (GNU GPL) as published by the Free Software
			//  * Foundation, either version 3 of the License, or (at your option)
			//  * any later version.  The code is distributed WITHOUT ANY WARRANTY;
			//  * without even the implied warranty of MERCHANTABILITY or FITNESS
			//  * FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.
			//  *
			//  * As additional permission under GNU GPL version 3 section 7, you
			//  * may distribute non-source (e.g., minimized or compacted) forms of
			//  * that code without the copy of the GNU GPL normally required by
			//  * section 4, provided you include this license notice and a URL
			//  * through which recipients can access the Corresponding Source.
			//  *
			//  * @licend  The above is the entire license notice
			//  * for the JavaScript code in this page.
			//  *
			//  */
			//  `

	// leaflet. (!) It's necessary to be fully loaded before 'geoman'
		common.prototype.load_style(
			DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.css'
		)
		await common.prototype.load_script(
			DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.js',
			license
		)

	// geoman
		common.prototype.load_style(
			DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet-geoman/leaflet-geoman.css'
		)
		await common.prototype.load_script(
			DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet-geoman/leaflet-geoman.min.js',
			license
		)

	// load and set JSON langs file
		self.get_json_langs()

	// turf
		common.prototype.load_script(
			DEDALO_ROOT_WEB + '/lib/leaflet/dist/turf/turf.min.js',
			license
		)

	// iro
		common.prototype.load_script(
			DEDALO_ROOT_WEB + '/lib/iro/dist/iro.min.js',
			license
		)


	return true
}//end load_libs



/**
* GET_MAP
* Load the libraries and specific CSS
* @param HTMLElement map_container
* @param integer key
* @return bool
*/
component_geolocation.prototype.get_map = async function(map_container, key) {

	const self = this

	// load libs
		await self.load_libs()

	// defaults
		const value = self.data.value || self.default_value

	// get data
		const field_lat		= value[key].lat
		const field_lon		= value[key].lon
		const field_zoom	= value[key].zoom
		const field_alt		= value[key].alt

	// update the current_value with the data from DDBB
	// current_value will be update with different changes to create change_data to save
		self.current_value[key] = clone(value[key])

	// load all layers
		self.ar_layer_loaded = typeof value[key].lib_data!=='undefined'
			? clone(value[key].lib_data)
			: []

	// map_data
		const map_data = (typeof value!=='undefined')
			? {
				x		: field_lat,
				y		: field_lon,
				zoom	: field_zoom,
				alt		: field_alt,
			  }
			: {
				x		: self.default_value.lat,
				y		: self.default_value.lon,
				zoom	: self.default_value.zoom,
				alt		: self.default_value.alt
			 }

	// new map vars
		let arcgis		= null
		let osm			= null
		let dare		= null
		let base_maps	= {}

	// Add layer to map
		switch(self.context.features.geo_provider) {

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
				// var dare = new L.TileLayer('http://dare.ht.lu.se/tiles/imperium/{z}/{x}/{y}.png');
				// dare = new L.tileLayer('http://pelagios.org/tilesets/imperium/{z}/{x}/{y}.png',{
				// 	maxZoom: 11
				// });
				dare = new L.TileLayer('https://dh.gu.se/tiles/imperium/{z}/{x}/{y}.png',{
					maxZoom: 11
				});


				arcgis = new L.tileLayer('//server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

				osm = new L.tileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom: 19, maxNativeZoom: 19});

				// MAP
				self.map = new L.map(map_container, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

				// LAYER SELECTOR
				base_maps = {
					dare	: dare,
					arcgis	: arcgis,
					osm		: osm
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
				// des
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
		}//end switch(self.context.features.geo_provider)

	// set active layer
		self.map.on('overlayadd', function(e) {
			self.active_layer_id = e.name
		})
		// self.map.pm.setGlobalOptions({ measurements: { measurement: true, displayFormat: 'metric' } })

	// disable zoom handlers
		self.map.scrollWheelZoom.disable();
		// disable tap handler, if present.
		// if (self.map.tap) self.map.tap.disable();

	// map move listeners
		self.map.on('dragend', function(){

			// Update input values
			self.update_input_values(
				key,
				{
					lat		: self.map.getCenter().lat,
					lon		: self.map.getCenter().lng,
					zoom	: self.map.getZoom()
				},
				map_container
			)
		});
		self.map.on('zoomend', function(){
			// Update input values
			self.update_input_values(
				key,
				{
					key		: key,
					lat		: self.map.getCenter().lat,
					lon		: self.map.getCenter().lng,
					zoom	: self.map.getZoom()
				},
				map_container
			)
		});
		self.map.on('click', function(e){
			// disable layers
			for (let feature in self.FeatureGroup) {
				const feature_group = self.FeatureGroup[feature]
				feature_group.eachLayer(function (layer){
					layer.pm.disable()
				});
			}
		})

	// map ready event
		self.map.whenReady(async function(){
			// init map editor
				self.init_draw_editor()

			// set the lang of the tool
				const json_langs = await self.get_json_langs() || []
				if (json_langs.length<1) {
					console.error('Error. Expected array of json_langs but empty result is obtained:', json_langs);
				}
				const dedalo_lang	= page_globals.dedalo_data_lang
				const lang_obj		= json_langs.find(item => item.dd_lang===dedalo_lang)
				const lang			= lang_obj
					? lang_obj.tld2
					: 'en'
				self.map.pm.setLang(lang);

			// check if the map has any layer loaded, if not create new one
				const check_layer_loaded = self.FeatureGroup[self.active_layer_id]
				if(!check_layer_loaded){
					// load_layer
					self.layers_loader({
						load 		: 'layer',
						layer_id	: self.active_layer_id
					})
				}
		});

	return true
}//end get_map



/**
* UPDATE_INPUT_VALUES
* @param integer key
* @param object data
* @param HTMLElement map_container
* @return bool true
*/
component_geolocation.prototype.update_input_values = function(key, data, map_container) {

	const self = this

	const content_value = map_container.parentNode

	// inputs
		const input_lat		= content_value.querySelector("input[data-name='lat']")
		const input_lon		= content_value.querySelector("input[data-name='lon']")
		const input_zoom	= content_value.querySelector("input[data-name='zoom']")
		const input_alt		= content_value.querySelector("input[data-name='alt']")

	// Set values to inputs
		input_lat.value		= data.lat
		input_lon.value		= data.lon
		input_zoom.value	= data.zoom

	// get the value from alt input
		data.alt = input_alt.value
			? JSON.parse(input_alt.value)
			: null

	// set the current value
		self.current_value[key].lat		= data.lat
		self.current_value[key].lon		= data.lon
		self.current_value[key].zoom	= data.zoom
		if (data.alt) {
			self.current_value[key].alt	= data.alt
		}

	// track changes in self.data.changed_data
		// (!) DISABLED because, when changing the position of the map, it is not saved unintentionally.
		// If you want to save, always use the save button.
		/*
		// changed_data
			const changed_data_item = Object.freeze({
				action	: 'update',
				key		: key,
				value	: self.current_value[key]
			})
		// fix instance changed_data
			self.set_changed_data(changed_data_item)
		*/

	return true
}//end update_input_values



/**
* REFRESH_MAP
* @param object map
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
* @param object options
* Sample:
* {
* 	layer_id: 1
*	load: "layer"
* }
* @return bool
*/
component_geolocation.prototype.layers_loader = function(options) {

	const self = this

	// options
		const load		= options.load || 'full' // layer|full
		const layer_id	= options.layer_id || null // optional on full load

	// load_layer
		switch(load) {

			case ('full'):
				const ar_layer		=  self.ar_layer_loaded
				const ar_layer_len	= ar_layer.length
				for (let i = 0; i < ar_layer_len; i++) {
					const layer = ar_layer[i]
					self.load_layer(layer)
				}
				// active all layer in control
				const control_layers_len = self.layer_control._layers.length
				for (let i = 0; i < control_layers_len; i++) {
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
				console.warn('Ignored invalid load mode:', load);
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
* @param object layer
* sample:
* {
*	layer_id: 1
*	layer_data: {type: 'FeatureCollection', features: Array(1)}
* }
* @return bool
*/
component_geolocation.prototype.load_layer = function(layer) {

	const self = this

	// set the layer data
		const layer_id				= layer.layer_id
		const layer_data			= layer.layer_data
		// const layer_name			= 'layer_' +layer_id
		// const user_layer_name	= typeof(layer.user_layer_name)!=='undefined'
		// 	? layer.user_layer_name
		// 	: layer_name

	// FEATUREGROUP BUILD : Verify if exist FeatureGroup, else create it. map is global var
	// if( self.map.hasLayer(self.FeatureGroup[layer_id])===false ) {
		if( typeof self.FeatureGroup[layer_id] === 'undefined'){

			// the FeatureGroup is not loaded and does not exist into the map
			// Create a new FeatureGroup
			self.FeatureGroup[layer_id] = new L.FeatureGroup();
			self.map.pm.setGlobalOptions({layerGroup: self.FeatureGroup[layer_id]})


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

			// add to the layer control with checkbox and the name of the user
			self.FeatureGroup[layer_id].addTo(self.map);
			// self.FeatureGroup[layer_id].options.tag_id = layer_id
			self.map.pm.setGlobalOptions({layerGroup: self.FeatureGroup[layer_id]})
		}

	// LAYERS : Load layers from data
		if (typeof layer_data!=='undefined' && layer_data!=='undefined' && layer_data!=='') {
			// remove previous data into the layer
			self.FeatureGroup[layer_id].clearLayers();

			// update the feature data
			self.FeatureGroup[layer_id].on('pm:update', (e) => {
				self.update_draw_data(layer_id);
				// recalculate the popup
				const content = self.get_popup_content(e.layer, layer_id);
				if (content) {
					e.layer.bindPopup(content,{
						minWidth : 155
					});
				}
			});

			// finish the editing feature data
			self.FeatureGroup[layer_id].on('pm:edit', (e) => {
				self.update_draw_data(layer_id);
				// recalculate the popup
				const content = self.get_popup_content(e.layer, layer_id);
				if (content) {
					e.layer.bindPopup(content,{
						minWidth : 155
					});
				}
			});

			// when the user drag a handler update the popup data
			self.FeatureGroup[layer_id].on('pm:markerdrag', (e) => {
				// self.update_draw_data(layer_id);
				// recalculate the popup
				const content = self.get_popup_content(e.layer, layer_id);
				if (content) {
					e.layer.bindPopup(content,{
						minWidth : 155
					});
				}
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
				// For each Feature load all layer data of the tag
				onEachFeature: function (feature, data_layer) {
					init_feature({
						self		: self,
						data_layer	: data_layer,
						layer_id	: layer_id,
						feature		: feature
					})
				}//end onEachFeature
			})//end L.geoJson
		}//end if (typeof layer_data!=="undefined" && layer_data!=="undefined" && layer_data!=="")

	// ACTIVE_LAYER_ID : Set the current active layer id will be editable with the actual FeatureGroup
		self.active_layer_id = layer_id;

	// enable Edit Mode
		// self.FeatureGroup[layer_id].pm.enable();

	return true
}//end load_geo_editor



/**
* LOAD_TAG_INTO_GEO_EDITOR
* (!) properties config observe
* Called by the user click on the tag (in component_text_area)
* The tag will send the ar_layer_id that it's pointing to
* @param object options
* Sample:
* {
*  	caller: component_text_area {model: 'component_text_area', tipo: 'numisdata19', …}
*	tag: {node_name: 'img', type: 'geo', tag_id: '1', state: 'n', label: '1', …}
*	text_editor: service_ckeditor {init: ƒ, …}
* }
* @return bool
*/
component_geolocation.prototype.load_tag_into_geo_editor = async function(options) {

	const self = this

	// options
		const tag_obj = options.tag

	// layer_id
		const layer_id = parseInt(tag_obj.tag_id)

	// load_layer
		self.layers_loader({
			load		: 'layer',
			layer_id	: layer_id
		})

	return true
}//end load_tag_into_geo_editor



/**
* HANDLE_CLICK_NO_TAG
* (!) properties config observe
* Called by the user click in component_text_area (no tag image target)
* @param object options
* Sample:
* {
*  	caller: component_text_area {model: 'component_text_area', tipo: 'numisdata19', section_tipo: 'numisdata6', …}
* }
* @return bool
*/
component_geolocation.prototype.handle_click_no_tag = async function(options) {

	const self = this

	// load_layer ('full' indicates load all layers)
		self.layers_loader({
			load		: 'full',
			layer_id	: null
		})

	return true
}//end handle_click_no_tag



/**
* GET_DATA_TAG
* Send the data_tag to the text_area when it need create a new tag
* @return object data_tag
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

	const lib_data = self.data.value && typeof(self.data.value[0])!=='undefined' && typeof(self.data.value[0].lib_data)!=='undefined'
		? self.data.value[0].lib_data
		: [{
				layer_id		: 1,
				layer_data		: [],
				user_layer_name	: 'layer_1'
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

	const lib_data		= self.get_lib_data()
	const ar_layer_id	= lib_data.map((item) => item.layer_id)
	const last_layer_id	= Math.max(...ar_layer_id)

	return last_layer_id
}//end get_last_layer_id



/**
* GET_POPUP_CONTENT
* Generates popup content based on layer type
* Returns HTML string, or null if unknown object
* @return string|null text_node
*/
component_geolocation.prototype.get_popup_content = function(layer, layer_id) {

	const self = this
	const ar_mesures = []
	// Marker - add lat/long
	if (layer instanceof L.Marker) {
		return this.str_lat_lng(layer.getLatLng());

	// Circle - lat/long, radius
	} else if (layer instanceof L.Circle) {
		const center	= layer.getLatLng()
		const radius	= layer.getRadius()
		const area		= (2 * Math.PI * radius).toFixed(2);

		ar_mesures.push(
			{
				label: "Center: "+this.str_lat_lng(center)
			},{
				label: "Radius: "+this.round_coordinate(radius, 2),
				messure: 'm'
			},{
				label: "Area: "+ area,
				messure: 'm'
			},{
				label: "Color: ",
				separator: false
			}
		)

	// Rectangle/Polygon - area
	} else if (layer instanceof L.Polygon) {

		// const latlngs	= layer._defaultShape ? layer._defaultShape() : layer.getLatLngs()
		const geojson		= layer.toGeoJSON()
		const area			= turf.area(geojson)

		ar_mesures.push(
			{
				label: "Area: "+readable_area(area, true)
			},{
				label: "Color: ",
				separator: false
			}
		)

	// Polyline - distance
	} else if (layer instanceof L.Polyline) {
		const latlngs = layer._defaultShape ? layer._defaultShape() : layer.getLatLngs()
		let	distance = 0;
		if (latlngs.length < 2) {
			ar_mesures.push(
				{
					label: "Distance: N/A"
				},{
					label: "Color: ",
					separator: false
				}
			)
		} else {
			for (let i = 0; i < latlngs.length-1; i++) {
				distance += latlngs[i].distanceTo(latlngs[i+1]);
			}
			ar_mesures.push(
				{
					label: "Distance: "+this.round_coordinate(distance, 2),
					messure: 'm'
				},{
					label: "Color: ",
					separator: false
				}
			)
		}
	}

	const text_node		= render_popup_text(ar_mesures)
	const color_node	= render_color_picker(self, layer, layer_id)
	text_node.appendChild(color_node)


	return text_node
}//end get_popup_content



/**
* STR_LAT_LNG
* @param object latlng
* @return string
* 	Helper method to format LatLng object (x.xxxxxx, y.yyyyyy)
*/
component_geolocation.prototype.str_lat_lng = function(latlng) {

	const self = this

	const lat_lng = '(' + self.round_coordinate(latlng.lat, 6) + ', ' + self.round_coordinate(latlng.lng, 6) + ')'

	return lat_lng
}//end str_lat_lng



/**
* ROUND_COORDINATE
* Add pop up information to the draw
* Truncate value based on number of decimals
* @return int
*/
component_geolocation.prototype.round_coordinate = function(num, len) {

	return Math.round(num*(Math.pow(10, len)))/(Math.pow(10, len));
}//end round_coordinate



/**
* INIT_DRAW_EDITOR
* Activate the editor
* @see https://github.com/Leaflet/Leaflet.draw/issues/66
* @editable_FeatureGroup = the current layer data with all items in the current_layer (FeatureGroup)
* @layer_id = the id of the active layer
*
* @return bool
*/
component_geolocation.prototype.init_draw_editor = function() {

	const self = this
	const map  = self.map

		// add Leaflet-Geoman controls with some options to the map
		map.pm.addControls({
			position: 'topright',
			drawCircleMarker: false,
			drawText: false
		});

		map.pm.setGlobalOptions({ measurements: { measurement: true, displayFormat: 'metric' } })
		// Listener on change the draw editor to "edited mode" for save the the current data of the editable_FeatureGroup
		// listen to when a layer is changed in Edit Mode
		map.on('pm:create', (e) => {
			// get layer active
			const layer = self.FeatureGroup[self.active_layer_id]
			// add the new feature to active layer
			e.layer.addTo(layer)
			// Update draw_data
			self.update_draw_data(self.active_layer_id);
			// init the feature
			init_feature({
				self		: self,
				data_layer	: e.layer,
				layer_id	: self.active_layer_id
			})
		});

		// finish the editing feature data
		map.on('pm:cut', (e) => {
			e.originalLayer.remove()
			e.originalLayer.removeFrom(map)
			self.update_draw_data(self.active_layer_id);
			// recalculate the popup
			const content = self.get_popup_content(e.layer, self.active_layer_id);
			if (content) {
				e.layer.bindPopup(content,{
					minWidth : 155
				});
			}//end if(content)
		});

		// Listener for delete the draw editor to "deleted mode" for save the current data of the editable_FeatureGroup
		map.on('pm:remove', () => {
			// Update draw_data
			self.update_draw_data(self.active_layer_id);
		});

	// DRAW_EDITOR_IS_INITATED : Set the a global variable to true (default is false) to avoid duplication
	self.draw_editor_is_initated = true;


	return true
}//end init_draw_editor



/**
* UPDATE_DRAW_DATA
* Preparing the data for save, update the layers data into the instance
* Save action is not exec here, see the render_component_geolocation for the save action
* @param string layer_id
* @return bool
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
			json.properties = json.properties
				? json.properties
				: {}
			json.properties.layer_id = layer_id
			const layer_color = layer.options.color

			if(layer_color){
				json.properties.color =  layer_color
			}

			if (layer instanceof L.Circle) {
				json.properties.shape	= 'circle';
				json.properties.radius	= layer.getRadius();
			}
			features.push(json)
		});
		current_layer.layer_data.features = features

	// value key
		const key = parseInt(self.map.getContainer().dataset.key)

	// current_layer.user_layer_name 	= current_layer.data.user_layer_name

	// update the data in the instance previous to save
		// const value = typeof (self.data.value[0])!=='undefined'
		// 	? clone(self.data.value[0])
		// 	: {}

	// publish the change to used by component_text_area from properties like 'hierarchy42'
		event_manager.publish(
			'updated_layer_data_'+ self.id_base,
			{
				layer: {
					type		: 'geo',
					layer_id	: layer_id
				},
				caller: self
			}
		)

		self.current_value[key].lib_data = self.ar_layer_loaded


	// track changes in self.data.changed_data
		// changed_data
			const changed_data_item = Object.freeze({
				action		: 'update',
				key			: key,
				value		: self.current_value[key]
			})
		// fix instance changed_data
			self.set_changed_data(changed_data_item)


	return true
}//end update_draw_data



/**
* MAP_UPDATE_COORDINATES
* Update the coordinates based in the data sent by other components, as autocomplet_hi
* this components can point to other record, as toponymy, that has a geolocation component.
* This method is fired by the update_value or other events defined in ontology.
* This method will use the data of the referenced geolocation data in the pointed record as his own coordinates
* The caller component will dispatch a event when it update his data that will fire this method
* the self component(geolocation that is listen) could be configured in properties as:
*
*	"observe": [
*		{
*			"client": {
*				"event": "update_value",
*				"perform": {
*				"function": "map_update_coordinates"
*				}
*			},
*			"component_tipo": "tch245"
*		}
*	]
*
* the observable component (portal with the data) should specify the component_geolocation that has the coordinates to be used
* it need to be defined in request_config 'hide' property with the role of 'target_geolocation_tipo'
* in this way:
*
* "request_config": [{
*		"hide": {
*			"ddo_map": [
*				{
*					"info": "component_geolocation to be used as data of the observer geolocation (move the map to the value of this component), role property identify it by map_update_coordinates() funcion",
*					"role": "target_geolocation_tipo",
*					"tipo": "hierarchy31",
*					"parent": "self",
*					"section_tipo": "self"
*				}
*			]
*		}
*	}]
*
* If the observable doesn't has specified the component_geolocation will use the default thesaurus component_geolocation: hierarchy31
* @param object options
* @return void
*/
component_geolocation.prototype.map_update_coordinates = async function(options) {

	const self = this

	const caller = options.caller

	// check if the caller has defined 'target_geolocation_tipo' component in hide of rqo
	const target_geolocation_tipo = caller.request_config_object.hide?.ddo_map.find(
		el => el.role === 'target_geolocation_tipo').tipo
		|| 'hierarchy31' // Default geolocation map in thesarus

	const original_value = caller.data.value
	// if the caller has not data, do not update the map
	if(!original_value){
		return
	}
	// get the last value of the caller portal
	// it will use to find the target_geolocation_tipo data
	const last_value = original_value[original_value.length-1]

	const target_geolocation_data = caller.datum.data.find( el =>
		el.tipo === target_geolocation_tipo
		&& parseInt(el.section_id) === parseInt(last_value.section_id)
	)

	// if target_geolocation_data, incorporate it to the current map and reload it
	if(target_geolocation_data){
		// geolocation doesn't has multiple maps and the key of the data array is always 0
		const key = 0
		self.current_value = target_geolocation_data.value
		self.update_input_values(
			key,
			self.current_value[key],
			self.node.content_data[key].map_container
		)
		// move the map to the new point and zoom with the values
		self.map.panTo(new L.LatLng(self.current_value[key].lat, self.current_value[key].lon));
		self.map.setZoom(self.current_value[key].zoom);
		// modify his own data with the new values
		const changed_data = [Object.freeze({
			action		: 'update',
			key			: key,
			value		: self.current_value[key]
		})]
		self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})
	}

}//end map_update_coordinates



/**
* LAYER_DATA_CHANGE
* @param object change
* With the information of the tag and the action (insert, remove)
* {
* 	action : 'remove'
* 	tag_id : 1
* 	type : 'geo'
* }
* @return bool
*/
component_geolocation.prototype.layer_data_change = function(change) {

	const self = this

	// set the layer data
		const action		= change.action
		const layer_id		= parseInt(change.tag_id)
		const key			= 0; // fixed key (only one element is allowed)
		// const layer_name	= 'layer_' +layer_id

		switch(action) {

			case 'insert':
				const layer_loaded = self.ar_layer_loaded.find((item) => item.layer_id===layer_id)
				if(layer_loaded){
					return true
				}
				const recover_layer = self.ar_data_buffer[layer_id] ||
					{
						layer_id	: layer_id,
						layer_data	: []
					};

				self.ar_layer_loaded.push(recover_layer)
				self.load_layer(recover_layer)

				self.current_value[key].lib_data = self.ar_layer_loaded

				const recover_changed_data = [Object.freeze({
					action		: 'update',
					key			: key,
					value		: self.current_value[key]
				})]
				self.change_value({
					changed_data	: recover_changed_data,
					refresh			: false
				})
				.then(()=>{
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
					return false
				}
				self.FeatureGroup[layer_id].remove();
				self.FeatureGroup[layer_id].clearLayers();
				self.layer_control.removeLayer(self.FeatureGroup[layer_id]);
				delete self.FeatureGroup[layer_id];

				// remove the layer
				const index = self.ar_layer_loaded.findIndex((item) => item.layer_id===layer_id)
				self.ar_layer_loaded.splice(index,1)

				self.current_value[key].lib_data = self.ar_layer_loaded

				const changed_data = [Object.freeze({
					action		: 'update',
					key			: key,
					value		: self.current_value[key]
				})]
				self.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
				.then(()=>{
					self.db_data.value[key] = clone(self.current_value[key])
					// when the ar_layer_loaded is empty, the user has delete all tags and is necessary reset the load_layer

					if(self.ar_layer_loaded.length === 0){
						// reset the load_layer to 1
						self.layers_loader({
							load 		: 'layer',
							layer_id	: 1
						})
					}else{
						// if the tag removed is not the last one, load the next layer that can be used
						const next_layer = self.ar_layer_loaded[0]
						self.load_layer(next_layer)
					}
				})
				break;
		}

	return true
}//end layer_data_change



/**
* CREATE_POINT
* @param object point
* with the coordinates of the new point
* {
*	lat : 39.46861766020243, //float
*	lng : -0.40077683642303136 //float
* }
* @return bool
*/
component_geolocation.prototype.create_point = function(point) {

	const self = this

	// create new point in the coordinates
	const new_point = L.marker(point).addTo(self.map);

	// add new point to the active layer
	self.FeatureGroup[self.active_layer_id].addLayer(new_point)

	// update the layer data with the new point
	self.update_draw_data(self.active_layer_id)


	return true
}//end create_point



/**
* INIT_FEATURE
* private function
* @param object options
* with instance data_layer and layer_id
* {
* 	self  // current instance with all properties
*	data_layer // object, the feature data (new or loaded)
*	layer_id // the int of the layer of the feature
* }
* @return void
*/
const init_feature = function(options) {

	const self			= options.self
	const data_layer	= options.data_layer
	const layer_id		= options.layer_id
	const feature		= options.feature || null

	// check if the feature has data else do nothing
	if(data_layer){

		//color
			const color = feature && feature.properties && feature.properties.color
				? feature.properties.color
				: null
			if(color){
				data_layer.setStyle({color: color})
			}
		// PopupContent. get the popup information
			const content = self.get_popup_content(data_layer, layer_id);
			if (content) {
				data_layer.bindPopup(content,{
					minWidth : 155
				});
			}//end if(content)
		// Click. Listener for each layer, when the user click into one layer, activate it and your feature, deactivate rest of the features and layers
			data_layer.on('click', function() {
				// ACTIVE_LAYER_ID : Set the current active layer id will be editable with the actual FeatureGroup
					self.active_layer_id = layer_id;

				// change all features and layers for activate or deactivate the edit mode.
					for (let feature in self.FeatureGroup) {

						if(feature){
							if(self.FeatureGroup[feature]===self.FeatureGroup[layer_id]){
								self.FeatureGroup[layer_id].eachLayer(function (layer){
									// layer.editing.disable();
									layer.pm.enable()
									// if(!(layer instanceof L.Marker)){
									// 	layer.setStyle({color: '#31df25'});
									// }
								});
							}else{

								//The layers of the actual feature disable and change to green color
								self.FeatureGroup[feature].eachLayer(function(layer) {
									// layer.editing.disable();
									layer.pm.disable()
									// if(!(layer instanceof L.Marker)){
									// 	layer.setStyle({color: '#3388ff'});
									// }
								});
							}
						}
					}
				// current layer activate and change to pink color
				//e.target.editing.enable();
				// if(!(e.target instanceof L.Marker)){
				// 	e.target.setStyle({color: '#97009C'});
				// }else{
				// 	console.log("Not e.target instanceof L.Marker ",);
				// }

			 });
		// addLayer
			self.FeatureGroup[layer_id].addLayer(data_layer)
	}// end if (data_layer)
}//end init_feature



/**
* READABLE_AREA
* @method readable_area(area, metric ): string
* The value will be rounded as defined by the precision option object.
* @return string area_string
* Returns a readable area string in yards or metric.
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

	return area_string
}//end readable_area



/**
* GET_JSON_LANGS
* Reads ../common/js/lang.json JSON file and store value in window['json_langs']
* @return array|null self.json_langs
*/
component_geolocation.prototype.get_json_langs = async function () {

	const self = this

	// already calculated
		if (self.json_langs && self.json_langs.length) {
			return self.json_langs
		}

	// return from page global value
		if (window['json_langs']) {
			// fix var from page global value
			self.json_langs = window['json_langs']
			return self.json_langs
		}

	// calculate from server
		self.json_langs = await data_manager.request({
			url		: '../common/js/lang.json',
			method	: 'GET',
			cache	: 'force-cache' // force use cache because the file do not changes
		})
		// fix as page global
		window['json_langs'] = self.json_langs


	return self.json_langs
}//end get_json_langs



// @license-end
