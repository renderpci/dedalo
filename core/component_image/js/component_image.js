/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {clone, dd_console} from '../../common/js/utils/index.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {vector_editor} from '../../component_image/js/vector_editor.js'
	import {render_edit_component_image} from '../../component_image/js/render_edit_component_image.js'
	import {render_list_component_image} from '../../component_image/js/render_list_component_image.js'



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


	return true
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
	component_image.prototype.destroy			= common.prototype.destroy

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
	component_image.prototype.search			= render_edit_component_image.prototype.search



/**
* INIT
*/
component_image.prototype.init = async function(options) {

	const self = this

	// image node
		self.object_node 			= null
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
		self.ar_layer_loaded		= []
		self.vector_tools_loaded	= false
		self.current_paper			= null
		self.vector_editor			= null


	// call the generic common tool init
		const common_init = await component_common.prototype.init.call(this, options)


	return common_init
}//end init



/**
* GET_DATA_TAG
* Send the data_tag to the text_area when it need create a new tag
* @return object data_tag
*/
component_image.prototype.get_data_tag = function() {

	const self = this

	// last_layer_id
		const last_layer_id	= self.get_last_layer_id()

	// layers
		const lib_data	= self.get_lib_data()
		const layers	= lib_data.map((item) => {
		const layer		= {
				layer_id		: item.layer_id,
				user_layer_name	: item.user_layer_name
			}
			return layer
		})

	// data_tag
		const data_tag = {
			type			: 'draw',
			tag_id			: null,
			state			: 'n',
			label			: '',
			data			: '',
			last_layer_id	: last_layer_id + 1,
			layers			: layers
		}


	return data_tag
}//end get_data_tag



/**
* GET_LIB_DATA
* get the lib_data in self.data, lib_data is the specific data of the library used (paperjs)
* @return array lib_data
*/
component_image.prototype.get_lib_data = function() {

	const self = this

	const lib_data = typeof self.data.value[0]!=='undefined' && self.data.value[0].lib_data
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
component_image.prototype.load_vector_editor = async function(options) {

	const self = this

	// options
		const load		= options.load || 'full'
		const layer_id	= options.layer_id || null

	// vector_editor. load and init if not already loaded
		if (self.vector_tools_loaded===false){

			self.vector_editor = new vector_editor()
			await self.vector_editor.init_canvas(self)

			self.vector_editor.init_tools(self)
			self.vector_editor.render_tools_buttons(self)

			self.vector_tools_loaded = true
		}

	// load all layers if the data is empty it create the first layer
		if(self.ar_layer_loaded.length < 1){
			// add the data from instance to the ar_layer_loaded, it control the all project layers that will showed in the vector editor
			self.ar_layer_loaded = typeof self.data.value[0]!=='undefined' && self.data.value[0].lib_data
				? self.data.value[0].lib_data
				: [{
					layer_id	: 0,
					layer_data	: []
				  }]
			// load all layers into the vector editor, when open the vector editor for first time load all layers but don't activate it.
			const ar_layer_length = self.ar_layer_loaded.length
			for (let i = 0; i < ar_layer_length; i++) {
				const layer = self.ar_layer_loaded[i]
				self.vector_editor.load_layer(self, layer)
			}
		}

	switch(load) {
		case ('full'):
			// active the visibility of the layers
			const ar_layer = self.ar_layer_loaded
			for (let i = 0; i < ar_layer.length; i++) {
				const layer = ar_layer[i]
				self.vector_editor.activate_layer(self, layer, load)
			}
			break;

		case ('layer'):
			const loaded_layer	= self.ar_layer_loaded.find((item) => item.layer_id===layer_id)
			// if the layer is not in the ar_layer_loaded, it will be new layer (ex:comes form new tag)
			// create new layer data with the new id and set to ar_layer_loaded
			const layer = (typeof (loaded_layer)!=='undefined')
			? loaded_layer
			: (function(){
				const new_layer = {
					layer_id	: layer_id,
					layer_data	: []
				}
				self.ar_layer_loaded.push(new_layer)
				// load the layer (if it's a new layer or existed layer, the method load_layer will check the duplicates)
				self.vector_editor.load_layer(self, new_layer)
				return new_layer
			  })()
			// active the layer
			self.vector_editor.activate_layer(self, layer, load)
			break;

		default:
			break;
	}//end switch

	return true
}//end load_vector_editor



/**
* LOAD_TAG_INTO_VECTOR_EDITOR
* usually fire with 'click_tag_draw' event
* @param object options
* @return bool true
*/
component_image.prototype.load_tag_into_vector_editor = function(options) {

	const self = this

	// options
		const tag = options.tag

	// convert the tag to 'real' object for manage it
	try {

		const ar_layer_id			= JSON.parse(tag.data)
		const ar_layer_id_length	= ar_layer_id.length
		for (let i = 0; i < ar_layer_id_length; i++) {

			self.load_vector_editor({
				load		: 'layer',
				layer_id	: parseInt(ar_layer_id[i])
			})
		}
	} catch (error) {
		console.error(error)
		console.log("tag.data:", tag.data);
	}


	// TAG WAY
		// MODE : Only allow mode 'tool_transcription'
		//if(page_globals.mode!=='tool_transcription') return null;

		// ATENTION THE NAME OF THE TAG (1) CHANGE INTO (1_LAYER) FOR COMPATIBILITY WITH PAPER LAYER NAME
		// WHEN SAVE THE LAYER TAG IT IS REMOVE TO ORIGINAL TAG NAME OF DÉDALO. "draw-n-1-data"
		// BUT THE LAYER NAME ALWAYS ARE "1_layer"

		// call the generic common tool init with the tag
			// self.ar_tag_loaded.push(tag)
			// const data 	 	= tag.data.replace(/'/g, '"')
			// const layer_id 	= tag.tag_id +'_layer';
			// self.vector_editor.load_layer(self, data, layer_id)


	return true
}//end load_tag_into_vector_editor



/**
* ADD_LAYER
* @return int layer_id
*/
component_image.prototype.add_layer = function() {

	const self = this

	const last_layer_id	= self.get_last_layer_id()
	const layer_id		= last_layer_id + 1

	self.load_vector_editor({
		load		: 'layer',
		layer_id	: layer_id
	})

	return layer_id
}//end get_last_layer_id



/**
* DELETE_LAYER
* @param object layer
* @return bool true
*/
component_image.prototype.delete_layer = function(layer) {

	const self = this

	self.ar_layer_loaded = self.ar_layer_loaded.filter(item => item.layer_id!==layer.layer_id)

	// update the data in the instance previous to save
		const value =  typeof(self.data.value[0])!=='undefined'
			? clone(self.data.value[0])
			: {}

		value.lib_data = self.ar_layer_loaded

	// set the changed_data for update the component data and send it to the server for change when save
		const changed_data = {
			action	: 'update',
			key		: 0,
			value	: value
		}

	// set the change_data to the instance
		self.data.changed_data = changed_data

	return true
}//end delete_layer



/**
* UPDATE_DRAW_DATA
* @return bool true
*/
component_image.prototype.update_draw_data = function() {

	const self = this

	const project					= self.current_paper.project
	//remove the layer_ string in the name and parse to int
	const layer_id					= project.activeLayer.data.layer_id

	const current_layer				= self.ar_layer_loaded.find((item) => item.layer_id === layer_id)
	current_layer.layer_data		= project.activeLayer.exportJSON({asString:false})

	// current_layer.layer_color	= project.activeLayer.selectedColor.toCSS()
	current_layer.user_layer_name	= project.activeLayer.data.user_layer_name

	// update the data in the instance previous to save
	const value =  typeof(self.data.value[0])!=='undefined'
		? clone(self.data.value[0])
		: {}
	value.lib_data		= self.ar_layer_loaded
	value.svg_file_data	= project.exportSVG({asString:true,embedImages:false})

	// set the changed_data for update the component data and send it to the server for change when save
		const changed_data = {
			action	: 'update',
			key		: 0,
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