// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {clone} from '../../common/js/utils/index.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_image} from '../../component_image/js/render_edit_component_image.js'
	import {render_list_component_image} from '../../component_image/js/render_list_component_image.js'
	import {render_search_component_image} from '../../component_image/js/render_search_component_image.js'



export const component_image = function(){

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
	this.quality

	this.file_name
	this.file_dir
}//end component_image



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_image.prototype.init				= component_common.prototype.init
	component_image.prototype.build				= component_common.prototype.build
	component_image.prototype.render			= common.prototype.render
	component_image.prototype.refresh			= common.prototype.refresh
	// destroy: release the vector editor's document-level listeners (if it was
	// loaded) before delegating to the generic destructor.
	component_image.prototype.destroy			= function() {
		if (this.vector_editor && typeof this.vector_editor.destroy==='function') {
			this.vector_editor.destroy()
			this.vector_editor = null
		}
		return common.prototype.destroy.call(this)
	}

	// change data
	component_image.prototype.save				= component_common.prototype.save
	component_image.prototype.update_data_value	= component_common.prototype.update_data_value
	component_image.prototype.update_datum		= component_common.prototype.update_datum
	component_image.prototype.change_value		= component_common.prototype.change_value
	component_image.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_image.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_image.prototype.list				= render_list_component_image.prototype.list
	component_image.prototype.tm				= render_list_component_image.prototype.list
	component_image.prototype.edit				= render_edit_component_image.prototype.edit
	component_image.prototype.search			= render_search_component_image.prototype.search



/**
* INIT
* @param object options
* @return bool
*/
component_image.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await component_common.prototype.init.call(this, options)

	// image_container node
		self.image_container 		= null
	// image size
		self.img_height				= null
		self.img_width				= null
	// image source (URI)
		self.img_src 				= null
	// fixed height for the image
		self.img_view_height		= 1200
		self.canvas_height			= 432
		self.canvas_width			= null
	// canvas node
		self.canvas_node			= null

	// editor init vars
		self.ar_layers				= []
		self.vector_editor			= null

	// subscribe to quality change event (unified handler)
		self.events_tokens.push(
			event_manager.subscribe('image_quality_change_'+self.id, self.image_quality_change_handler.bind(self))
		)


	return common_init
}//end init



/**
* GET_DATA_TAG
* Send the data_tag to the text_area when it need create a new tag
* @return object data_tag
*/
component_image.prototype.get_data_tag = function() {

	const self = this

	const data_tag = {
		type			: 'draw',
		tag_id			: null,
		state			: 'n',
		label			: '',
		data			: '',
		last_layer_id	: null,
		layers			: [{
			layer_id		: 0,
			user_layer_name	: 'raster'
		}]
	}

	// get the lib_data of the image component
	const lib_data	= self.get_lib_data()

	// if the image has not lib data stop
	if(!lib_data){
		return data_tag
	}

	// last_layer_id
		const last_layer_id	= self.get_last_layer_id()

	// layers
		const layers = lib_data.map((item) => {
			const layer	= {
				layer_id		: item.layer_id,
				user_layer_name	: item.user_layer_name
			}
			return layer
		})

	// data_tag
		data_tag.last_layer_id	= last_layer_id + 1
		data_tag.layers			= layers

	return data_tag
}//end get_data_tag



/**
* GET_LIB_DATA
* get the lib_data in self.data, lib_data is the specific data of the library used (svgEdit js)
* @return array|null lib_data
*/
component_image.prototype.get_lib_data = function() {

	const self = this

	const data		= self.data || {}
	const entries	= data.entries || []

	const lib_data = typeof entries[0]!=='undefined' && entries[0].lib_data
		? entries[0].lib_data
		: null


	return lib_data
}//end get_lib_data



/**
* GET_LAST_LAYER_ID
* Get the last layer_id in the data
* @param int last_layer_id
*/
component_image.prototype.get_last_layer_id = function() {

	const self = this

	const lib_data		= self.get_lib_data()

	const ar_layer_id	= lib_data.map((item) => item.layer_id)

	const last_layer_id	= Math.max(...ar_layer_id)


	return last_layer_id
}//end get_last_layer_id



/**
* LOAD_VECTOR_EDITOR-
* @param object options
* @return bool true
*/
component_image.prototype.load_vector_editor = async function() {

	const self = this

	const data					= self.data || {}
	const entries				= data.entries || []
	const default_layer_color	= '#ffffff';

	// options
		// const load		= options.load || 'full'
		// const layer_id	= options.layer_id || null

	// vector_editor. load and init if not already loaded
		if (!self.vector_editor){

			// load editor files and create a new vector_editor
			// load files only when editor is really necessary
			const load_editor_files = () => {
				return new Promise(function(resolve){

					if(self.node) {
						self.node.classList.add('loading')
					}

					import('../../component_image/js/vector_editor.js')
					.then(async function(module){

						const vector_editor = module.vector_editor

						if(self.node) {
							self.node.classList.remove('loading')
						}

						resolve(vector_editor)
					})
				})
			}
			const vector_editor = await load_editor_files()

			self.vector_editor = new vector_editor()
			await self.vector_editor.init_canvas(self)
		}

	// load all layers if the data is empty it create the first layer
		if(self.ar_layers.length < 1){
			// add the data from instance to the ar_layers, it control the all project layers that will showed in the vector editor
			self.ar_layers = typeof entries[0]!=='undefined' && entries[0].lib_data
				? entries[0].lib_data
				: [{
					layer_id		: 0,
					layer_data		: [],
					layer_color		: default_layer_color,
					layer_opacity	: 0.3,
					user_layer_name	: 'raster',
					name 			: 'layer_0',
					visible 		: true
				}]
		}

	return true
}//end load_vector_editor



/**
* LOAD_TAG_INTO_VECTOR_EDITOR
* usually fire with 'click_tag_draw' event
* @param object options
* @return bool true
*/
component_image.prototype.load_tag_into_vector_editor = async function(options) {

	const self = this

	// options
		const tag = options.tag
		if( !tag.data || tag.data.length === 0){
			return false
		}

	if(!self.vector_editor){
		await self.load_vector_editor()
	}
	// convert the tag to 'real' object for manage it
	try {

		const ar_layer_id			= JSON.parse(tag.data)
		const ar_layer_id_length	= ar_layer_id.length
		for (let i = 0; i < ar_layer_id_length; i++) {

			const layer_id	= parseInt(ar_layer_id[i])
			self.vector_editor.activate_layer(layer_id)
		}
	} catch (error) {
		console.error(error)
		console.log("tag.data:", tag.data);
	}

	return true
}//end load_tag_into_vector_editor



/**
* UPDATE_DRAW_DATA
* @return bool true
*/
component_image.prototype.update_draw_data = function() {

	const self = this

	//remove the layer_ string in the name and parse to int
	const layer_id					= project.activeLayer.layer_id

	const current_layer				= self.ar_layers.find((item) => item.layer_id === layer_id)
	current_layer.layer_data		= project.activeLayer.exportJSON({asString:false})

	// current_layer.layer_color	= project.activeLayer.selectedColor.toCSS()
	current_layer.user_layer_name	= project.activeLayer.data.user_layer_name

	// update the data in the instance previous to save
	const value =  typeof(self.data.entries[0])!=='undefined'
		? clone(self.data.entries[0])
		: {}
	value.lib_data		= self.ar_layers
	value.svg_file_data	= project.exportSVG({asString:true,embedImages:false})

	// set the changed_data for update the component data and send it to the server for change when save
		const changed_data = {
			action	: 'update',
			id		: value?.id || null,
			value	: value
		}

	// set the change_data to the instance
		self.data.changed_data = changed_data

	// tag save OLD
		// const tag_id			= project.activeLayer.name.replace('_layer','')
		// const current_tag	= self.ar_tag_loaded.find((item) => item.tag_id === tag_id)

		// const data				= project.activeLayer.exportJSON()
		// const current_draw_data	= data.replace(/"/g, '\'');
		// current_tag.dataset		= {data:current_draw_data}
		// current_tag.save			= false

	return true
}//end update_draw_data



/**
* GET_DEFAULT_FILE_INFO
*
* @param int key
* @return object|null default_file_info
*/
component_image.prototype.get_default_file_info = function(key=0) {

	const self = this

	const default_quality = self.context.features.default_quality

	const entries = self.data.entries || [];

	const default_file_info = (default_quality && entries[key])
		? entries[key].files_info.find(el => el.quality === default_quality)
		: null

	return default_file_info
}//end get_default_file_info



/**
* GET_QUALITY_FILE_INFO
* Select specific quality information of the given extension
*
* @param string quality
* @param string extension
* @param int key
* @return object|null default_file_info
*/
component_image.prototype.get_quality_file_info = function( quality='original', extension='jpg', key=0) {

	const self = this

	const entries = self.data.entries || [];

	const quality_file_info = (quality && entries[key])
		? entries[key].files_info.find(el => el.quality === quality && el.extension === extension)
		: null

	return quality_file_info
}//end get_quality_file_info



/**
* GET_ORIGINAL_FILE_NAME
* Get the original file name (the original name of the image when the users upload it)
*
* @param int key
* @return string|null original_file_name
*/
component_image.prototype.get_original_file_name = function( key=0 ) {

	const self = this

	const entries = self.data.entries || [];

	const original_file_name = (entries[key].original_file_name)
		? entries[key].original_file_name
		: null

	return original_file_name
}//end get_original_file_name



/**
* GET_ORIGINAL_NORMALIZED_FILE_NAME
* Get the original file name (the original name of the image when the users upload it)
*
* @param int key
* @return string|null original_file_name
*/
component_image.prototype.get_original_normalized_file_name = function( key=0 ) {

	const self = this

	const entries = self.data.entries || [];

	const original_normalized_file_name = (entries[key].original_normalized_name)
		? entries[key].original_normalized_name
		: null

	return original_normalized_file_name
}//end get_original_normalized_file_name



/**
* GET_ACTIVE_EXTENSIONS
* mix the main extension and all alternative extension and return an array
*
* @return array
*/
component_image.prototype.get_active_extensions = function() {

	const self = this

	const extension					= self.context.features.extension
	const alternative_extensions	= self.context.features.alternative_extensions || []

	const active_extensions = [extension, ...alternative_extensions]

	return active_extensions
}//end get_active_extensions



/**
* IMAGE_QUALITY_CHANGE_HANDLER
* Unified handler for image quality changes across all views.
* Handles both SVG object node updates and vector editor integration.
* Subscribed to 'image_quality_change_'+self.id event in init.
* @param string url
*	The new image URL
* @return void
*/
component_image.prototype.image_quality_change_handler = async function(url) {

	const self = this

	// store the current image source
		self.img_src = url

	// case 1: vector_editor is active
	// when the vector editor is loaded, it manages the image through its stage
		if (self.vector_editor) {
			const image_definition = self.vector_editor.image_definition
			const stage				= self.vector_editor.stage
			if (image_definition && stage) {
				image_definition.src = url
				stage.setHref(image_definition.image_node, url)
			}
			return
		}

	// case 2: SVG object node (default edit view without vector editor)
		const object_node = self.image_container?.object_node
		if (!object_node) {
			return
		}

	// svg document inside the object_node tag
		const svg_doc = object_node.contentDocument
	// Get the image item by tag name
		const image_node = svg_doc
			? await svg_doc.querySelector('image')
			: null

		if (image_node) {

			// content_value is the parent of image_container
				const content_value = self.image_container.parentElement

			// add spinner when new image is loading
				content_value.classList.add('loading')
				image_node.addEventListener('load', function(){
					content_value.classList.remove('loading')
				})

			// no load case (example: original tiff files)
				image_node.addEventListener('error', function(){
					content_value.classList.remove('loading')
				})

			// update t var from image URL
				const beats = url.split('?')

			// new_url with cache-busting timestamp
				const new_url = beats[0] + '?t=' + (new Date()).getTime()

			// set the new source to the image node into the svg
				image_node.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', new_url)
		}
}//end image_quality_change_handler



// @license-end
