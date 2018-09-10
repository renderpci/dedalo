"use strict";
/**
* COMPONENT_IMAGE CLASS
*
*
*/
var component_image_read = new function() {

	// URL TRIGGER
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_image/trigger.component_image.php';

	var ar_Papers 		= {}	
	//var canvas_obj, context, canX , canY , canXold =0 , canYold =0, mouseIsDown =0, len =0;
	//var node = [];	
	//var ar_tag_loaded = new Array();
	//var ratio_w, ratio_h, ratio;



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {

		const self = this
		
		const wrapper_id = options.wrapper_id
		const image_url  = options.image_url
		
	
		// Image load and raster
		const image = new Image()
			image.src = image_url

			// Onload image
			image.addEventListener("load",function(e){
				//	console.log("img_w,img_h",image.naturalWidth,image.naturalHeight);
				
				self.raster_canvas({
					wrapper_id 	: wrapper_id,
					image_url  	: image_url,
					image 		: this
				})
				
			},false)


		return true
	};//end init



	/**
	* RASTER_CANVAS
	* @param object options
	*	options.wrapper_id int
	*	options.image_url string
	*	options.image dom node
	* @return bool 
	*/
	this.raster_canvas = function(options) {
		
		const self = this

		// Wrapper
		const wrapper_obj  			= document.getElementById(options.wrapper_id)		
		// Canvas
		const canvas_id 			= wrapper_obj.dataset.canvas_id
		const canvas_obj  			= document.getElementById(canvas_id)
		
		// Image size
		const image 				= options.image
		const original_img_height 	= wrapper_obj.dataset.original_img_height 
		const original_img_width 	= wrapper_obj.dataset.original_img_width		
		// Image url
		const image_url 			= options.image_url

		// loading_image
		const loading_image 		= wrapper_obj.querySelector('.loading_image')
			
		// Hide canvas while is gererated
		canvas_obj.style.visibility = 'hidden'

		// Set canvas initial size from image dimensions
		canvas_obj.height = image.naturalHeight
		canvas_obj.width  = image.naturalWidth

		// CANVAS -> ACTIVE
		canvas_obj.getContext("2d")		

		// Create paper instance
		// let current_paper = new paper.PaperScope()
		ar_Papers[canvas_id] 	= new paper.PaperScope()
		const current_paper 	= ar_Papers[canvas_id]
			current_paper.setup(canvas_obj)

			// Set paper ratio
			current_paper.ratio	= canvas_obj.height / original_img_height
			
			// Reset ar_tag_loaded
			current_paper.ar_tag_loaded = new Array();		
		
		// raster image
	    const raster = new current_paper.Raster({
	        source   : image_url,
	        position : current_paper.view.center    
	    });	  

		raster.onLoad = function(e) {

			const height  		= current_paper.view.size._height
  			const image_height 	= raster.height
  			const ratio 		= height / image_height

  			raster.scale(ratio)

			//raster.position = current_paper.view.center
			//raster.position = current_paper.view.center;
			//raster.size 	= current_paper.view.size;

			// Show final rendered canvas
			canvas_obj.style.visibility = 'visible'

			// Hide label loading
			if(loading_image) loading_image.remove()
		};
	    
	    return true
	};//end raster_canvas
	



	// CANVAS : INIT
	/*
	this.init_canvas__DES = function(options) {
		"use strict";

		let self = this

		let canvas_id  = canvas_id
		let wrapper_id = options.wrapper_id
		let image_url  = options.image_url
		
		//console.log("initiated init_canvas with canvas_id:",canvas_id)

		// CURRENT PAPER : Reset	
		// currentPaper = null;

		//$(function() {
		window.ready(function(){

			// CANVAS
			let canvas_obj = document.getElementById(canvas_id);
				//console.log("canvas_obj:",canvas_obj);

			// CANVAS IMAGE
			var canvas_image = document.getElementById('img_'+canvas_id);	//canvas_obj.firstElementChild
				if (!canvas_image) {
					console.log('img_'+canvas_id+" not found!");
					return false;
				}
				//console.log("canvas_image:",canvas_image);
			
			
			// IMG IS LOAD IS COMPLETE DETECT
			if (canvas_image.complete) {
				// image is complete. init real canvas init
				//setTimeout(function(){
				//	image_is_loaded()
				//},800)
				self.render_image({
					canvas_image : canvas_image,
					canvas_obj 	 : canvas_obj,
					image_url 	 : image_url
				})
				
			}else{
				// image is not complete. wait load event is fired
				//$(canvas_image).on('load', image_is_loaded);
				//canvas_image.onload = function() {
				//   image_is_loaded()
				//}	
				canvas_image.addEventListener("load",function(){
					self.render_image({
						canvas_image : canvas_image,
						canvas_obj 	 : canvas_obj,
						image_url 	 : image_url
					})
				},false)			
			}
		});//end $(function() {
	}//end this.init_canvas
	*/



	/**
	* RENDER_IMAGE
	* @return 
	*//*
	this.render_image__OLD = function(options) {

		let self = this

		let canvas_obj 	 = options.canvas_obj
		let canvas_image = options.canvas_image
		let canvas_id 	 = canvas_obj.id
		let image_url 	 = options.image_url
		

		// IMG
		var img_source_width 	= canvas_image.dataset.img_width	//$(canvas_image).data('img_width')
		var	img_source_height 	= canvas_image.dataset.img_height 	//$(canvas_image).data('img_height')
		var	img_w 				= canvas_image.naturalWidth
		var	img_h 				= canvas_image.naturalHeight


		// FORCE tests
		img_source_width  = img_w = 539
		img_source_height = img_h = 404
	

		// RATIO
		var ratio_w = img_source_width/img_w
		var	ratio_h = img_source_height/img_h
		var	ratio 	= 1/ratio_w

		//console.log(" canvas_image.naturalWidth:", canvas_image.naturalWidth,canvas_image.naturalHeight, ratio);	
		//console.log(" canvas_image.width:", canvas_image.width,canvas_image.height, ratio);
							

		// CANVAS -> IMAGE MATCH SIZE				
		//canvas_obj.width  = img_w;
		//canvas_obj.height = img_h;
		//canvas_obj.setAttribute("width",img_w)
		//canvas_obj.setAttribute("height",img_h)

			//console.log("canvas_obj:",canvas_obj);
			//console.log("img_source_width,img_source_height:",img_source_width,img_source_height);



		// CANVAS -> ACTIVE
		canvas_obj.getContext('2d')
		
		//console.log(canvas_obj);
		//console.log("canvas_id:",ar_Papers[canvas_id]);

		// PAPER : Set current paper instance
		//let current_paper = new paper.PaperScope();

		//if(typeof(ar_Papers[canvas_id])!='undefined'){
		//		for (var i = ar_Papers.length - 1; i >= 0; i--) {
		//				ar_Papers[i].remove();
		//		}
		//	//ar_Papers[canvas_id].remove();//ar_Papers = new Array();
		//}

		ar_Papers[canvas_id] = new paper.PaperScope();
		ar_Papers[canvas_id].setup(canvas_obj);

		//canvas_obj.width  = img_w;
		//canvas_obj.height = img_h;
		//var currentPaper = ar_Papers[canvas_id];
		
		// Fix ratio
		//ar_Papers[canvas_id].ratio = ratio;

		ar_Papers[canvas_id].ar_tag_loaded = new Array();

		with(ar_Papers[canvas_id]) {
			//var raster 		= new Raster('img_'+canvas_id);
			let raster 			= new Raster(canvas_image);
				raster.position = view.center;
				//raster.scale(1);
				//console.log("raster:",raster);
				raster.onLoad = function() {
				    console.log('The image has loaded.');
				};
		}//end with(currentPaper)
		
		// Spinner
		let div_loading_image = document.getElementsByClassName('loading_image');
		if(div_loading_image) {
			const d_len = div_loading_image.length
			for (let i = d_len - 1; i >= 0; i--) {
				div_loading_image[i].style.display='none';
			}
		}
		canvas_obj.style.visibility = 'visible';


		//console.log("->trigered raster over existing paper "+currentPaper)
	};//end render_image
	*/



	// LOAD_DRAW_EDITOR_READ
	// Carga los layers a partir de la etiqueta selecionada
	this.load_draw_editor_read = function(tag , canvas_id) {
	
		let currentPaper = ar_Papers[canvas_id];
		
		// MODE : Only allow mode 'edit'
		if(page_globals.modo!=='edit') return null;

		//console.log(tag);
		var parts_of_tag = component_image.get_parts_of_tag(tag);
			//console.log("parts_of_tag:",parts_of_tag,tag);

		var data 	= parts_of_tag.data;
		var capaId 	= parts_of_tag.capaId;
			capaId	= capaId+'_layer';	

		// PAPER : Get current paper instance
		//var activePaper = currentPaper ;
		//with(currentPaper) {

			currentPaper.activate();
			currentPaper.ar_tag_loaded[parts_of_tag.capaId] = tag

			let project = currentPaper.project
			let handle  = currentPaper.handle
			let path  	= currentPaper.path
			let segment = currentPaper.segment
			let Point 	= currentPaper.Point

			// LAYER : IMPORTACION DE CAPAS
			if ( data.indexOf('Layer')!=-1 ) {				
				//project.layers[capaId].remove();				
				//children['example'].fillColor = 'red';

				const p_len = project.layers.length
				for (let i=0; i < p_len ; i++) {
					if (typeof project.layers[i]=="undefined") {
						console.warn("project.layers[i] null",project.layers[i]);
						continue;
					}						
					if (project.layers[i].name == capaId) {
						project.layers[i].remove();
							//console.log("-> borrada capa: " + capaId);
					}
				}
				var capa = project.importJSON(data);
					//console.log("-> importada json capa: " + capa.name);

				var color = capa.fillColor;
				
				project.deselectAll();
				project.view.draw();
				//console.log(project.layers[1].name);
				//console.log(capa.fillColor);
			}else{
				var create_new_capa = true;
				// Verificamos si el nombre del layer existe
				const pl_len = project.layers.length
				for (let i=0; i < pl_len ; i++){
					if (project.layers[i].name == capaId){
						capa = project.layers[i];
						capa.activate();
						create_new_capa = false;
						//console.log("-> usando existente capa: " + capa.name);
						break;
					}
				}//end for
				if (create_new_capa == true) {
					var capa  = new Layer();
					capa.name = capaId;
					//console.log("-> creada nueva capa: " + capa.name);
					var color = new Color({
						hue: 360 * Math.random(),
						saturation: 1,
						brightness: 1,
						alpha: 0.3,
						});
					capa.fillColor = color;		
				}

			};//end else
			segment = path = handle = null;
			capa.activate();

			// RATIO : Get cuurent ratio from active current paper
			let ratio = currentPaper.ratio;

			capa.scale(ratio, new Point(0, 0));
			project.view.draw();
			project.deselectAll();
		//};//end whith(paper)


		return true
	};// end load_draw_editor
			


};//end component_image_read class