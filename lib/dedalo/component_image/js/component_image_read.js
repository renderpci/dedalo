/**
* COMPONENT_IMAGE CLASS
*/
var component_image_read = new function() {

	// URL TRIGGER
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_image/trigger.component_image.php';

	var ar_Papers = new Array();
	//var canvas_obj, context, canX , canY , canXold =0 , canYold =0, mouseIsDown =0, len =0;
	//var node = [];	
	//var ar_tag_loaded = new Array();
	//var ratio_w, ratio_h, ratio;



	// CANVAS : INIT
	this.init_canvas = function(canvas_id) {
		
		//console.log("initiated init_canvas with canvas_id:"+canvas_id)

		// CURRENT PAPER : Reset	
		// currentPaper = null;

		$(function() {

			// CANVAS
			var canvas_obj 	 = document.getElementById(canvas_id);

			// CANVAS IMAGE
			var canvas_image = document.getElementById('img_'+canvas_id);	//canvas_obj.firstElementChild //

			if (!canvas_image) {
				console.log('img_'+canvas_id+" not found!");
				return false;
			}				
			
			// IMG IS LOAD IS COMPLETE DETECT
			if (canvas_image.complete) {
				// image is complete. init real canvas init
				image_is_loaded()
			}else{
				// image is not complete. wait load event is fired
				$(canvas_image).load(image_is_loaded);
			}
			
			function image_is_loaded() {				
				
				//console.log("->component_image_read.init_canvas: "+canvas_id+" real init canvas begins...");
			
				// IMG
				var img_source_width 	= $(canvas_image).data('img_width'),
					img_source_height 	= $(canvas_image).data('img_height'),
					img_w 				= canvas_image.naturalWidth,
					img_h 				= canvas_image.naturalHeight;				

					// RATIO
					var ratio_w = img_source_width/img_w,
						ratio_h = img_source_height/img_h,
						ratio 	= 1/ratio_w;

				// CANVAS -> IMAGE MATCH SIZE
				canvas_obj.width 	= img_w;
				canvas_obj.height 	= img_h;
				// CANVAS -> ACTIVE
				canvas_obj.getContext('2d');
				
				//console.log(canvas_obj);

				// PAPER : Set current paper instance
				ar_Papers[canvas_id] = new paper.PaperScope();
				ar_Papers[canvas_id].setup(canvas_id);
				//var currentPaper = ar_Papers[canvas_id];
				// Fix ratio
				ar_Papers[canvas_id].ratio = ratio;

				ar_Papers[canvas_id].ar_tag_loaded = new Array();

				with(ar_Papers[canvas_id]) {
					var raster 		= new Raster('img_'+canvas_id);
					raster.position = view.center;
				}//end with(currentPaper)

				//console.log("->trigered raster over existing paper "+currentPaper)
			}//end image_is_loaded

		});//end $(function() {

	}//end this.init_canvas







	// LOAD_SVG_EDITOR_READ
	// Carga los layers a partir de la etiqueta selecionada
	this.load_svg_editor_read = function(tag , canvas_id) {

		var currentPaper = ar_Papers[canvas_id];

		//alert(canvas_id);
		

		// MODE : Only allow mode 'edit'
		if(page_globals.modo!=='edit') return null;

		//console.log(tag);
		var parts_of_tag = component_image.get_parts_of_tag(tag);

		var data 	= parts_of_tag.data;
		var capaId 	= parts_of_tag.capaId;
		capaId		= capaId+'_layer';	

		// PAPER : Get current paper instance
		//var activePaper = currentPaper ;
		with(currentPaper) {
			currentPaper.activate();
			currentPaper.ar_tag_loaded[parts_of_tag.capaId] = tag;

			// LAYER : IMPORTACION DE CAPAS
			if ( data.indexOf('Layer')!=-1 ) {
				
				//project.layers[capaId].remove();				
				//children['example'].fillColor = 'red';
				for (var i=0; i < project.layers.length ; i++) {
					if (project.layers[i].name == capaId){
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
				for (var i=0; i < project.layers.length ; i++){
					if (project.layers[i].name == capaId){
						capa = project.layers[i];
						capa.activate();
						create_new_capa = false;
						//console.log("-> usando existente capa: " + capa.name);
						break;
					}
				}//end for
				if (create_new_capa == true) {
					var capa = new Layer();
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

			};// end else
			segment = path = handle= null;
			capa.activate();

			// RATIO : Get cuurent ratio from active current paper
			var ratio = currentPaper.ratio;

			capa.scale(ratio, new Point(0, 0));
			project.view.draw();
			project.deselectAll();
		};//end whith(paper)

	};// end load_svg_editor
			


};//end component_image_read class