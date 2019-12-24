/*
*	TOOL_IMAGE_VERSIONS
*
*
*
*/
var tool_image_versions = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_CORE_URL + '/tools/tool_image_versions/trigger.tool_image_versions.php' ;
	this.trigger_url = DEDALO_CORE_URL + '/tools/tool_image_versions/trigger.tool_image_versions2.php' ;

	
	/**
	* GET_THE_EXTERNAL_SOURCE_TO_FILE
	*/
	this.get_the_external_source_to_file = function(button_obj){

		let self = this

		const container = button_obj.parentNode
		//component IRI
		let wrap_div = container.querySelector('.wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(button_obj);
				return alert("component_iri: Sorry: wrap_div dom element not found")
			}

		const component_external_dato = component_iri.get_dato(wrap_div)
		let external_source = false
		if(typeof component_external_dato[0] !== 'undefined'){
			 external_source = component_external_dato[0].iri
		}
		
		//build the server variable to send to the trigger
		const trigger_url  = this.trigger_url

		const trigger_vars	= { 
							'mode' 				: 'load_image_from_url',
							'image_id' 			: button_obj.dataset.image_id,
							'quality' 			: button_obj.dataset.quality,
							'source_quality' 	: button_obj.dataset.quality,
							'target_quality' 	: button_obj.dataset.target_quality,
							'tipo' 				: button_obj.dataset.tipo,
							'section_tipo' 		: button_obj.dataset.section_tipo,
							'parent' 			: button_obj.dataset.parent,
							'aditional_path' 	: button_obj.dataset.aditional_path,
							'initial_media_path': button_obj.dataset.initial_media_path,
							'top_tipo'			: page_globals.top_tipo,
							'external_source' 	: external_source
						  };
						  //return console.log(mydata);



		// create the promise witht the server request
		let js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
		  if(SHOW_DEBUG===true) {
		    console.log("[tool_image_versions.get_the_external_source_to_file] response",response);
		  }
		    
		  if (response===null) {
		    //alert("Error on get_the_external_source_to_file "+options.section_tipo+" record (null response). See server log for more details")
		  }else{
		    
		    if(response.result === false){

		      //self.show_empty_result()

		    }else{
		     // return the JSON data
		     return response.result
		    }
		    
		  }
		})
	}//end get_the_external_source_to_file



	/**
	* CHANGE MEDIA QUALITY
	*/
	this.thumb_default_url;
	this.change_media_quality = function ( button_obj ) {

		if ( typeof(this.thumb_default_url)=='undefined' ) {
			this.thumb_default_url = $('.thumb_container').find('.css_image').attr('src');
		}
		
		// Wrap div spinner for loading_content
		var wrap_div = document.getElementsByTagName('body')[0];	//$('body');		
			
		var quality 			= button_obj.dataset.quality,
			image_id 			= button_obj.dataset.image_id,
			tipo 				= button_obj.dataset.tipo,
			parent 				= button_obj.dataset.parent,
			aditional_path		= button_obj.dataset.aditional_path,
			initial_media_path 	= button_obj.dataset.initial_media_path

		var src_target = page_globals.media_base_path + initial_media_path +'/'+ quality + aditional_path +'/'+ image_id +'.'+ page_globals.media_extension +'?t='+ new Date().getTime()
			//if(SHOW_DEBUG===true) console.log('->change_media_quality: '+src_target)

		//var mediaObj 	= $('.css_image').first();
		var mediaObj 	= document.getElementsByClassName('css_image');
			
			
		if(mediaObj.length==1 ) { //&& mediaObj.attr("src")!=src_target

			// Spinner in
			html_page.loading_content( wrap_div, 1 );

			// Clear current src
			//mediaObj.attr("src","");			

			// Change image src. When load finish, remove spinner
			$(mediaObj[0]).attr("src", src_target).load(function(event) {
			//mediaObj[0].src = src_target.load(function(event) {			
				/* Act on the event */				
				//console.log(event)
				html_page.loading_content( wrap_div, 0 );
			})			
		}//end if(mediaObj.length==1 ) {

		return true
	};//end change_media_quality



	/**
	* VIEW_IMAGE
	*/
	this.view_image = function(button_obj) {

		var image_id		= $(button_obj).data('image_id'),
			quality			= $(button_obj).data('quality'),
			aditional_path	= $(button_obj).data('aditional_path'),
			initial_media_path= $(button_obj).data('initial_media_path')

		var src_target 		= page_globals.media_base_path + initial_media_path + '/' + quality + aditional_path + '/' + image_id + '.' + page_globals.media_extension + '?t=' + (new Date()).getTime();

		//alert( $(window).width() + ' - '+ $(window).height())	

		var window_url		= src_target ,	
			window_name		= "View image "+image_id,
			w_width			= $(window).width(),
			w_height		= $(window).height(); ;

		// Open and focus window
		transcription_window=window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
		transcription_window.focus();
	};//end view_image



	/**
	* FILE EXISTS
	*/
	this.file_exists = function(button_obj, time) {
		
		if (typeof time == 'undefined') time = 5000;

		var image_id 		= $(button_obj).data('image_id'),
			quality			= $(button_obj).data('quality'),
			aditional_path	= $(button_obj).data('aditional_path'),
			initial_media_path	= $(button_obj).data('initial_media_path')

		if(SHOW_DEBUG===true) console.log("->file_exists vars:" +image_id+' '+quality+ ' '+time);

		var mode 		= 'file_exists';
		var mydata		= { 'mode': mode,
							'image_id': image_id,
							'quality': quality,
							'aditional_path': aditional_path,
							'initial_media_path': initial_media_path,
		 					'top_tipo':page_globals.top_tipo
		 				  };

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			if (received_data!=0) {

				var ar = image_id.split("-");
				var tipo = ar[0];
				component_image.update_component(tipo)
				
			}else{
				// Loop
				setTimeout(function() {
					time = time + 1000;
        			component_image.file_exists(button_obj, time);
        		}, time);
			}
			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on file_exists data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if(SHOW_DEBUG===true) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 );
		})
	};//end file_exists



	/**
	* DOWNLOAD FILE
	*/
	this.download_file = function(button_obj) {
		
		var image_id 		= $(button_obj).data('image_id'),
			quality			= $(button_obj).data('quality'),
			parent 			= $(button_obj).data('parent'),			
			aditional_path	= $(button_obj).data('aditional_path'),
			initial_media_path	= $(button_obj).data('initial_media_path'),
			extension		= $(button_obj).data('extension');
	
		//var myurl 		= DEDALO_CORE_URL + '/component_av/media_engine/media_download.php?image_id='+image_id +'&quality=' + quality ;
		var myurl = this.url_trigger + '?mode=download_file&image_id='+image_id +'&quality=' + quality  +'&aditional_path=' + aditional_path + '&initial_media_path=' + initial_media_path + '&parent=' + parent +'&top_tipo='+page_globals.top_tipo ;

		if(typeof extension != 'undefined')	myurl = myurl +'&extension=' + extension

		
		if ( !confirm( get_label.descargar + ' ' + image_id + ' ['+quality+']' ) ) return false;
		
		try{ 
			//location.href	= myurl ;
			window.open(myurl, get_label.descargar);		
		}catch(err){ 
			alert(err) 
		}
		if(SHOW_DEBUG===true) console.log("->dowload_file vars:" +image_id+' '+quality);
	};//end download_file
	


	/**
	* DELETE VERSION
	*/
	this.delete_version = function(button_obj) {
		
		if( !confirm( get_label.borrar + ' '+ get_label.fichero + ' ?') ) return false;

		var image_id 		= $(button_obj).data('image_id'),
			quality			= $(button_obj).data('quality'),
			parent			= $(button_obj).data('parent'),
			tipo			= $(button_obj).data('tipo'),
			section_tipo	= $(button_obj).data('section_tipo'),
			aditional_path	= $(button_obj).data('aditional_path'),
			initial_media_path	= $(button_obj).data('initial_media_path')

		if(SHOW_DEBUG===true) console.log("->delete_version vars:" +image_id+' '+quality);

		var mode 		= 'delete_version';
		var mydata		= { 'mode': mode,
							'image_id': image_id,
							'quality': quality,
							'parent': parent ,
							'tipo': tipo,
							'section_tipo': section_tipo,
							'aditional_path': aditional_path,
							'initial_media_path': initial_media_path,
							'top_tipo':page_globals.top_tipo
						  };

		var wrap_div 	= $(button_obj).parents('.wrap_tool:first');
		html_page.loading_content( wrap_div, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);	

			// Error string in response
			if(error_response) {

				// Warning msg
				var msg = "<span class='error'>Error when delete file: \n" + received_data + "</span>";
					inspector.show_log_msg(msg);
					alert( $(msg).text() )

			}else{

				// Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					inspector.show_log_msg(msg);

				// Hide buttons and info
				//$(button_obj).hide();				

				//var ar = image_id.split("-");
				//var tipo = ar[0];
				//component_av.update_component(tipo);
				location.reload();
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on delete_version data:" + error_data + "</span>";
			inspector.show_log_msg(msg);
			if(SHOW_DEBUG===true) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	};//end delete_version



	/**
	* CONVERT_SIMPLE
	*/
	this.convert_simple = function(button_obj) {

		var image_id 		= $(button_obj).data('image_id'),
			source_file		= $(button_obj).data('source_file'),
			target_file		= $(button_obj).data('target_file'),
			flags			= $(button_obj).data('flags');

		var mode 		= 'convert_simple';
		var mydata		= { 'mode': mode,
							'image_id': image_id,
							'source_file': source_file,
							'target_file': target_file ,
							'flags': flags,
							'top_tipo':page_globals.top_tipo
						  };
						//return console.log(mydata)

		var wrap_div 	= $(button_obj).parents('.wrap_tool:first');
		html_page.loading_content( wrap_div, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);
			
			// Error string in response
			if(error_response) {

				// Warning msg
				var msg = "<span class='error'>ERROR when convert format: \n" + received_data + "</span>" ;
					inspector.show_log_msg(msg);
					alert( $(msg).text() )				

			}else{

				// Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					top.inspector.show_log_msg(msg);
				
				location.reload();
			}
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on convert data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if(SHOW_DEBUG===true) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})
	}//end convert_simple


			
	/**
	* GENERATE VERSION
	*/
	this.generate_version = function(button_obj) {
		
		var image_id 		= $(button_obj).data('image_id'),
			source_quality	= $(button_obj).data('source_quality'),
			target_quality	= $(button_obj).data('target_quality'),
			tipo			= $(button_obj).data('tipo'),
			parent			= $(button_obj).data('parent'),
			aditional_path	= $(button_obj).data('aditional_path'),
			initial_media_path	= $(button_obj).data('initial_media_path')

		if(SHOW_DEBUG===true) console.log("->generate_version vars:" +image_id+' '+source_quality+' '+target_quality+' '+aditional_path+' '+initial_media_path);

		var mode 		= 'generate_version';
		var mydata		= { 'mode': mode,
							'image_id': image_id,
							'source_quality': source_quality,
							'target_quality': target_quality ,
							'tipo': tipo ,
							'parent': parent,
							'aditional_path': aditional_path,
							'initial_media_path': initial_media_path,
							'top_tipo':page_globals.top_tipo
						  };
						//return console.log(mydata)

		var wrap_div 	= $(button_obj).parents('.wrap_tool:first');
		html_page.loading_content( wrap_div, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);
			
			// Error string in response
			if(error_response) {

				// Warning msg
				var msg = "<span class='error'>ERROR when generate new version: \n" + received_data + "</span>" ;
					inspector.show_log_msg(msg);
					alert( $(msg).text() )

			}else{

				// Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					top.inspector.show_log_msg(msg);

				// Hide buton
				//$(button_obj).hide();
				//$('<small>'+get_label.procesando+'..</small>').insertAfter(button_obj);
				
				location.reload();
			}
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on generate_version data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if(SHOW_DEBUG===true) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	};//end generate_version


	/**
	* ROTATE_IMAGE
	*/
	this.rotate_image = function(button_obj) {
		
		var image_id 			= button_obj.dataset.image_id,
			quality				= button_obj.dataset.quality,
			degrees				= button_obj.dataset.degrees,
			tipo				= button_obj.dataset.tipo,
			section_tipo		= button_obj.dataset.section_tipo,
			parent				= button_obj.dataset.parent,
			aditional_path		= button_obj.dataset.aditional_path,
			initial_media_path	= button_obj.dataset.initial_media_path

		if(SHOW_DEBUG===true) console.log("->rotate_image vars:" +image_id+' '+quality+' '+degrees+ ' '+initial_media_path);

		var mydata		= { 'mode' 				: 'rotate_image',
							'image_id' 			: image_id,
							'quality' 			: quality,
							'degrees' 			: degrees,
							'tipo' 				: tipo,
							'section_tipo' 		: section_tipo,
							'parent' 			: parent ,
							'aditional_path' 	: aditional_path,
							'initial_media_path': initial_media_path,
							'top_tipo':page_globals.top_tipo
						  };
						  //return console.log(mydata);

		var wrap_div 	= $(button_obj).parents('.wrap_tool:first');
		html_page.loading_content( wrap_div, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);

			// Error string in response
			if(error_response) {

				// Warning msg
				var msg = "<span class='error'>ERROR when rotate image: \n" + received_data + "</span>" ;
					top.inspector.show_log_msg(msg);
					alert( $(msg).text() )

			}else{
				// Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					top.inspector.show_log_msg(msg);

				location.reload();
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on rotate_image data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if(SHOW_DEBUG===true) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	};//end rotate_image



};
//end tool_image_versions

