/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_image} from '../../component_image/js/render_component_image.js'
	import {vector_editor} from '../../component_image/js/vector_editor.js'


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
	component_image.prototype.init 	 			= component_common.prototype.init
	component_image.prototype.build 	 		= component_common.prototype.build
	component_image.prototype.render 			= common.prototype.render
	component_image.prototype.refresh 			= common.prototype.refresh
	component_image.prototype.destroy 	 		= common.prototype.destroy

	// change data
	component_image.prototype.save 	 			= component_common.prototype.save
	component_image.prototype.update_data_value	= component_common.prototype.update_data_value
	component_image.prototype.update_datum 		= component_common.prototype.update_datum
	component_image.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_image.prototype.list 				= render_component_image.prototype.list
	component_image.prototype.edit 				= render_component_image.prototype.edit




/**
* INIT
*/
component_image.prototype.init = async function(options) {

	const self = this

	// editor init vars
		self.ar_tag_loaded 			= []
		self.vector_tools_loaded 	= false
		self.current_paper 			= null

		self.vector_editor 			= null

	// call the generic commom tool init
		const common_init = component_common.prototype.init.call(this, options);

	// set the self specific libraries and variables not defined by the generic init
		// load dependences js/css
			const load_promises = []

			const lib_js_file = DEDALO_ROOT_WEB + '/lib/paper/dist/paper-full.min.js'
			load_promises.push( common.prototype.load_script(lib_js_file) )


			await Promise.all(load_promises).then(async function(response){
			})

	return common_init
}//end init



/**
* GET_DATA_TAG
* Send the data_tag to the text_area when it need create a new tag
*/
component_image.prototype.get_data_tag = function(){

	const data_tag = {
		type 	: 'draw',
		tag_id 	: null,
		state 	: 'n',
		label 	: '',
		data 	: ''
	}

	return data_tag
}


// /**
// * BUILD
// */
// component_image.prototype.build = async function(autoload=false) {

// 	const self = this

// 	// call generic component commom build
// 		const common_build = component_common.prototype.build.call(this, autoload);

// 	// fix useful vars
// 		// self.allowed_extensions 	= self.context.allowed_extensions
// 		// self.default_target_quality = self.context.default_target_quality


// 	return common_build
// }//end build_custom



// CANVAS : INIT
component_image.prototype.init_canvas = function(canvas_node, img) {

	const self = this

	// canvas
		// resize
			canvas_node.setAttribute("resize", true)
		//size
			canvas_node.height = img.naturalHeight
			canvas_node.width  = img.naturalWidth
	
		// hidpi. Avoid double size on canvas
			// canvas_node.setAttribute("hidpi","off")

		// canvas -> active
			canvas_node.getContext("2d")

	// paper 
		self.current_paper = paper.setup(canvas_node);

	// raster image
		const raster = new self.current_paper.Raster({
			source   : img.src,
			position : self.current_paper.view.center
		});

		const height  		= self.current_paper.view.size._height
		const image_height 	= img.naturalHeight
		const ratio 		= height / image_height
		raster.scale(ratio)

		// subscription to the image quality chang event
		self.events_tokens.push(
			event_manager.subscribe('image_quality_change_'+self.id,  img_quality_change)
		)
		function img_quality_change (img_src) {
			// change the value of the current raster element
			raster.source 		= img_src
			raster.onLoad = function(e) {
				//set the view ratio to 1
				self.current_paper.view.setScaling(1)
				const height  		= self.current_paper.view.size._height
				const image_height 	= raster.height
				const ratio 		= height / image_height
				raster.setScaling(ratio)
			}
		}

	return true
}//end init_canvas


/**
* LOAD_VECTOR_EDITOR
*/
component_image.prototype.load_vector_editor = async function(options) {

	const self = this
	// convert the tag dataset to 'real' object for manage it
	const tag = JSON.parse(JSON.stringify(options.tag.dataset))


	// MODE : Only allow mode 'tool_transcription'
	//if(page_globals.modo!=='tool_transcription') return null;

	if (self.vector_tools_loaded===false){

		self.vector_editor = new vector_editor
		self.vector_editor.init_tools(self)
		self.vector_editor.render_tools_buttons(self)

		self.vector_tools_loaded = true
	}

	/*
	*ATENTION THE NAME OF THE TAG (1) CHANGE INTO (1_LAYER) FOR COMPATIBILITY WITH PAPER LAYER NAME
	*WHEN SAVE THE LAYER TAG IT IS REMOVE TO ORIGINAL TAG NAME OF DÉDALO. "draw-n-1-data"
	*BUT THE LAYER NAME ALWAYS ARE "1_layer"
	*/

	// call the generic commom tool init with the tag
		self.ar_tag_loaded.push(tag)
		const data 	 	= tag.data.replace(/'/g, '"')
		const layer_id 	= tag.tag_id +'_layer';
		self.vector_editor.load_layer(self, data, layer_id)


}// load_vector_editor


/**
* UPDATE_DRAW_DATA
*/
component_image.prototype.update_draw_data = function() {

	const self = this

	const project 		= self.current_paper.project
	const tag_id 		= project.activeLayer.name.replace('_layer','')
	const current_tag	= self.ar_tag_loaded.find((item) => item.tag_id === tag_id)

	const data 				= project.activeLayer.exportJSON()
	const current_draw_data = data.replace(/"/g, '\'');
	current_tag.dataset 	= {data:current_draw_data}
	current_tag.save 		= false

	return true
}//end update_draw_data



/**
* SAVE_DRAW_DATA
*/
component_image.prototype.save_draw_data = function() {

	const self = this

	const ar_tag		= self.ar_tag_loaded
	const ar_tag_len	= ar_tag.length 

	for (let i = ar_tag_len- 1; i >= 0; i--) {
		const current_tag = ar_tag[i]
		// UPDATE_TAG
		event_manager.publish('draw_change_tag' +'_'+ self.tipo, current_tag)
		if(i === 0){
			current_tag.save = true
			event_manager.publish('draw_change_tag' +'_'+ self.tipo, current_tag)
		}
			console.log("tag_data:",current_tag); 
	}

	
	return true
};//end save_draw_data


