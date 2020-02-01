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

	this.duplicates = false

	return true
}//end component_geolocation



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_geolocation.prototype.init 	 			= component_common.prototype.init
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
* INIT_MAP
* load the libraries and specific css
*/
var loaded_document = false
component_geolocation.prototype.init_map = async function(wrapper) {

	const self = this

	// load dependences js/css
		const load_promises = []

		const lib_js_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.js'
		load_promises.push( common.prototype.load_script(lib_js_file) )

		const lib_css_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.css'
		load_promises.push( common.prototype.load_style(lib_css_file) )

		await Promise.all(load_promises).then(async function(response){
			// console.log("response:",response);
		})

	// map_container
		const map_container = wrapper.querySelector(".leaflet_map")

	// defaults
		const default_lat 	= 39.462571
		const default_lon 	= -0.376295
		const default_zoom 	= 16
		const default_alt 	= 0

	// get data
		const field_lat  	= self.data.value.lat || default_lat
		const field_lon  	= self.data.value.lon || default_lon
		const field_zoom 	= self.data.value.zoom || default_zoom
		const field_alt 	= self.data.value.alt || default_alt
		const map_refresh	= map_container.querySelector('#map_refresh')
		const map_fixed		= map_container.querySelector('#map_fixed')
		//self.related_tipo 	= map_container.dataset.related_tipo

	// map_data
		const map_data = (typeof self.data.value!=="undefined")
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

	let map 			= null
	let layer_control	= false

	let arcgis 			= null
	let osm  			= null
	let dare 			= null
	let base_maps 		= {}


	// Add layer to map
		switch(self.context.geo_provider) {

			case 'OSM':
				map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
				L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
					attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
					//attribution: '<a href="http://fmomo.org">Dedalo</a>',
					maxZoom: 19
				}).addTo(map);
				break;

			// case 'COULDMADE':
				// 	map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
				// 	L.tileLayer('http://{s}.tile.cloudmade.com/API-key/997/256/{z}/{x}/{y}.png', {
				// 		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://cloudmade.com">CloudMade</a>',
				// 		maxZoom: 18
				// 	}).addTo(map);
				// 	break;

			case 'GOOGLE':
				map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
			    const googleLayer = new L.Google('ROADMAP');
			    //map.addLayer(googleLayer);
			    googleLayer.addTo(map);
			    break;

			case 'ARCGIS':
			 	map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
		        L.tileLayer('http://server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
		        maxZoom: 18,
		        attribution: 'Tiles &copy; Esri — '
		            + 'Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, '
		            + 'Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'}).addTo(map);
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
				map = new L.map(map_container, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

				// LAYER SELECTOR
				base_maps = {
					dare 	:  dare,
					arcgis 	: arcgis,
					osm 	: osm
				}
				if(layer_control===false || loaded_document===true) {
					layer_control = L.control.layers(base_maps).addTo(map);
				}

				map.on('overlayadd', function(e) {
				  	self.init_draw_editor(ar_FeatureGroup[e.name], e.name)
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
				map = new L.map(map_container, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

				// layer selector
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
		}//end switch(self.context.geo_provider)



	// disable zoom handlers
	map.scrollWheelZoom.disable();
	// disable tap handler, if present.
	if (map.tap) map.tap.disable();
	// Add to maps array
	//self.maps[map_container] = map;

	// map move listeners
		map.on('dragend', function(e){
			// Update input values
			self.update_input_values({
				lat  : map.getCenter().lat,
				lon  : map.getCenter().lng,
				zoom : map.getZoom()
			}, wrapper)
		});
		map.on('zoomend', function(e){
			// Update input values
			self.update_input_values({
				lat  : map.getCenter().lat,
				lon  : map.getCenter().lng,
				zoom : map.getZoom()
			}, wrapper)
		});

	// map ready event
		map.whenReady(function(e){
			// force refresh map (apply 'invalidateSize')
			const current_map = this
			setTimeout(()=>{
				// console.log("e:",this);
				// map.invalidateSize();
				self.refresh_map(current_map)
			}, 20)
		});


		// map.setView([51.505, -0.09], 13);

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

	//_______________
	/*
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
			self.Save(map_container)
			self.refresh_map(map)
		});

	setTimeout(function(){
		self.refresh_map(map)
		//L.Util.requestAnimFrame(map.invalidateSize,map,!1,map._container);
	}, 1400)
	*/
	//_______________

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
	const section_group   = map_container.parentNode
	const observer_config = {
		attributeFilter : ['style'],
		attributes 		: true,
		childList 		: false,
		subtree 		: false
	}
	const observer = new MutationObserver(function(mutationList){
		self.refresh_map(map)
	})
	observer.observe(section_group, observer_config)


	return true
}//end init_map



/**
* UPDATE_INPUT_VALUES
* @return bool true
*/
component_geolocation.prototype.update_input_values = function(data, wrapper) {

	// inputs
		const input_lat  = wrapper.querySelector("input[data-name='lat']")
		const input_lon  = wrapper.querySelector("input[data-name='lon']")
		const input_zoom = wrapper.querySelector("input[data-name='zoom']")

	// Set values to inputs
		input_lat.value  = data.lat
		input_lon.value  = data.lon
		input_zoom.value = data.zoom

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


