/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
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
return
/// old way v5
	// zoom
		var nivelZoom = null

		// zoomselecion function
		zoomselecion = function(nivelZoom) {
			var a 			= nivelZoom/100;
			var ratioZoom 	= a/zoomActual;
			zoomActual = a; 
			canvas_node.width 	= canvas_node.width * ratioZoom;
			canvas_node.height 	= canvas_node.height * ratioZoom;

			//console.log(canvas_node.width);
			//console.log(canvas_node.height);

			//context.zoom(ratioZoom,ratioZoom);
			//context.restore();
			view.zoom = a;
			//view.scrollBy(0,0);
			view.scrollBy(new Point(-view.bounds.x, -view.bounds.y));
			//context.scale(ratioZoom,ratioZoom)
			//project.activeLayer.translate(0,0);
			//raster.position = view.center;
			//console.log(a);
			//console.log(ratioZoom);
			//drawScreen();
			//drawScreen();
			return true;
		}//end zoomselecion = function(nivelZoom)

		

	// zoom selector
		const zoom_select = document.getElementById('zoom');
			  zoom_select.addEventListener("change",function(){
				nivelZoom = self.value;
				toolZoom.activate(); 
				zoomselecion(nivelZoom);

				const button_pointer = wrapper.querySelector("[data-tool_name='pointer']")
				self.active_tool(button_pointer)
			  },false)
				
				
	// zoom tool / handler
		var zoomActual = 1.0;
		toolZoom = new Tool();
		toolZoom.onMouseDown = function(event) {
			return false; // DESACTIVO DE MOMENTO (!)
			segment = path = null;
			var hitResult = project.hitTest(event.point, hitOptions);
			if (hitResult) {
				path = hitResult.item;
				//console.log(hitResult.type);
				if (hitResult.type==='pixel') {
					var location = hitResult.location;
					//segment = path.insert(location.index +1, event.point);
					if (event.modifiers.shift) {
						canvas_node.width 	= canvas_node.width * 0.5;
						canvas_node.height 	= canvas_node.height * 0.5;
						//canvas_node.scale(zoomActual * 0.5, zoomActual * 0.5);
						//canvas_node.restore();
						//canvas_node.draw();
						view.zoom = zoomActual * 0.5;
						//view.scrollBy(0,0);
						view.scrollBy(new Point(-view.bounds.x, -view.bounds.y));
						//canvas_node.style.backgroundPosition(event.point.x, );
						//var ctop=(-ui.position.top * canvas_node.height / canvasWrapperHeight);
						zoomActual = zoomActual * 0.5;
						return;
					}else{
						canvas_node.width 	= canvas_node.width * 2.0;
						canvas_node.height 	= canvas_node.height * 2.0;
						//canvas_node.scale(zoomActual * 2.0, zoomActual * 2.0);
						//canvas_node.restore();
						//canvas_node.draw();
						view.zoom = zoomActual * 2.0;
						//view.scrollBy(0,0);
						view.scrollBy(new Point(-view.bounds.x, -view.bounds.y));
						$(canvas_node.parentNode).animate({ scrollTop: event.point.y + canvas_node.parentNode.scrollTop, scrollLeft: event.point.x + canvas_node.parentNode.scrollLeft}, 0);	

						//project.view.scrollBy(event.point);
						zoomActual = zoomActual * 2.0;
						return;
					}//end if (event.modifiers.shift)
				}//end if (hitResult.type == 'pixel')
			}//end if (hitResult)
		}//end toolZoom.onMouseDown = function(event)


		//if(ratio_window < 1){
			//var ventana_h =  window.innerHeight;
			//var ventana_h_util 	= ventana_h - 60;
			//var ratio_window 	= ventana_h_util /img_h;
			var div_width 	 = canvas_node.parentNode.clientHeight;
			var ratio_window = Math.floor(div_width / img_h);
			var porcentaje 	 = ratio_window*100;

			// set to 100 on init to avoid zoom problems
			porcentaje = 100
			
			// make zoom
			zoomselecion(porcentaje);
			if(SHOW_DEBUG===true) {
				console.log("Canvas zoom to apply: ",porcentaje);
			}

			// Add current value as option to zoom seletor
			const porcentaje_round = Math.round(porcentaje * 100) / 100
			const option = document.createElement("option")		
				  option.setAttribute("value", porcentaje_round)
				  option.setAttribute("selected", true)
				  option.innerHTML = porcentaje_round + "%"
			const option_key = zoom_select.options.length -1;				
			zoom_select.options[option_key] = option;
			zoom_select.selectedIndex = option_key;
			//var seleccion_de_zoom   = option_key;
			//zoom_select.lastChild.text(option);
			//ratio_window = 1;
		//}
	
		// Get a reference to the canvas object
		//var canvas = document.getElementById('myCanvas');
		// Create an empty project and a view for the canvas:
		//console.log(tool)
	
	//});//end $(canvas_node).find('img').first().load(function()		

	return true
}//end init_canvas


/**
* LOAD_VECTOR_EDITOR
*/
component_image.prototype.load_vector_editor = async function(options) {

	const self = this

	const tag = options.tag.dataset

	// MODE : Only allow mode 'tool_transcription'
	//if(page_globals.modo!=='tool_transcription') return null;

	if (self.vector_tools_loaded===false){

		self.vector_editor = new vector_editor
		self.vector_editor.init_tools(self)
		self.vector_editor.render_tools_buttons(self)

		self.vector_tools_loaded = true
	}

	self.ar_tag_loaded[tag.tag_id] = tag;

	/*
	*ATENTION THE NAME OF THE TAG (1) CHANGE INTO (1_LAYER) FOR COMPATIBILITY WITH PAPER LAYER NAME
	*WHEN SAVE THE LAYER TAG IT IS REMOVE TO ORIGINAL TAG NAME OF DÉDALO. "draw-n-1-data"
	*BUT THE LAYER NAME ALWAYS ARE "1_layer"
	*/

	const data 	 	= tag.data.replace(new RegExp('\'', 'g'), '"');
	const layer_id 	= tag.tag_id +'_layer';

	// call the generic commom tool init
		vector_editor.prototype.load_layer(self, data, layer_id)
}// load_vector_editor





