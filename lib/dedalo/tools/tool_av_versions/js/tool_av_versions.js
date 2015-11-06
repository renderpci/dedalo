// JavaScript Document
/*
	TOOL_AV_VERSIONS
*/
$(document).ready(function() {
	
	switch(page_globals.modo){

		case 'edit':
				/*				
				// PLAY PAUSE BY SPACEBAR KEY (32)
				if (event.which == 32) {
					player_toggle_play_pause() //alert(event.which)alert(event.which)		
				}
				*/
				break;		
	}
});







// TOOL transcription CLASS
var tool_av_versions = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_av_versions/trigger.tool_av_versions.php' ;


	/**
	* CHANGE MEDIA QUALITY
	*/
	this.change_media_quality = function ( button_obj ) {
		
		var quality 	= $(button_obj).data('quality'),
			video_id 	= $(button_obj).data('video_id'),
			date 		= new Date(),
			ar_video_obj= document.getElementsByTagName('video')
			
			if(ar_video_obj.length<1) {
				return alert("Sorry, video obj not found")
			}

		var src_target 	= page_globals.video_base_path + '/' + quality +'/' + video_id + '.' + page_globals.video_extension + '?v=' + date.getTime();
			//if(DEBUG) console.log('->change_media_quality: '+src_target)

		var videoObj 	= ar_video_obj[0];

			// Get player current time
			var current_time_in_seconds	= parseFloat(videoObj.currentTime);
				//if(DEBUG) console.log('->current_time_in_seconds: '+current_time_in_seconds)


			// Get player state
			var video_is_paused	= videoObj.paused;
				//if(DEBUG) console.log('->paused: '+video_is_paused)
		
			/*
			// Audio case
			if (quality=='audio') { // <audio controls>
				$('.css_av_video').hide();
				$('.css_player_wrap').append( "<audio class=\"audio_player\" controls><source src=\""+src_target+"\" type=\"audio/mpeg\"></audio>" );
			}else{ // Video case
				$('.audio_player').remove();
				$('.css_av_video').show();
			}
			*/

			// Change source media
			videoObj.setAttribute("src", src_target);
			//videoObj.load();
			//videoObj.play();
			
			videoObj.addEventListener("canplay", function() {				
				if (video_is_paused===false) {
					//videoObj.currentTime = current_time_in_seconds ;
					videoObj.play();
				} 
			});	
			
	}//end change_media_quality


	/**
	* GENERATE VERSION
	*/
	this.generate_version = function(button_obj) {
		
		var video_id 		= $(button_obj).data('video_id'),
			tipo 			= $(button_obj).data('tipo'),
			parent 			= $(button_obj).data('parent'),
			source_quality	= $(button_obj).data('source_quality'),
			target_quality	= $(button_obj).data('target_quality')
			

		if (DEBUG) console.log("->generate_version vars:" +video_id+' '+source_quality+' '+target_quality);

		var mode 		= 'generate_version';
		var mydata		= { 'mode': mode,
							'video_id': video_id,
							'source_quality': source_quality,
							'target_quality': target_quality,
							'parent':parent,
							'tipo': tipo,
							'top_tipo':page_globals.top_tipo
						}; 
						//return console.log(mydata)

		var wrap_div 	= $(button_obj).parents('.wrap_tool').first();
		if($(wrap_div).length!=1) return alert("Error on generate_version. DOM wrap_tool not found")
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
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {
				// Error Warning msg
				var msg = "<span class='error'>ERROR when generate new version: \n" + received_data + "</span>" ;
					inspector.show_log_msg(msg);
					alert( $(msg).text() )
			}else{
				// Ok. Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					inspector.show_log_msg(msg);

				// Hide buton
				$(button_obj).hide();
				$('<small>'+get_label.procesando+'..</small>').insertAfter(button_obj);
				
				// Fire file_exists every 5 secs to test if ended proccess
				setTimeout(function(){ 
        			tool_av_versions.file_exists(button_obj);
        		}, 5000);
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on generate_version: " + error_data.statusText + "</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	};//end generate_version



	/**
	* CONFORM_HEADER
	* Recreate av headers with ffmpeg
	*/
	this.conform_header = function(button_obj) {

		if (!confirm( get_label.seguro )) return false;

		button_obj = $(button_obj)

		var video_id 		= button_obj.data('video_id'),
			tipo 			= button_obj.data('tipo'),
			parent 			= button_obj.data('parent'),
			quality			= button_obj.data('quality')			
			

		if (DEBUG) console.log("->conform_header vars:" +video_id+' '+quality);

		var mydata	= { 'mode' 			: 'conform_header',
						'video_id' 		: video_id,
						'quality' 		: quality,						
						'parent' 		: parent,
						'tipo' 			: tipo,
						'top_tipo' 		: page_globals.top_tipo
					}; 
					//return console.log(mydata)

		var wrap_div = button_obj.parents('.wrap_tool').first();
			if(wrap_div.length!=1) return alert("Error on conform_header. DOM wrap_tool not found")
			html_page.loading_content( wrap_div, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(/error/i.test(received_data)) {
				// Error Warning msg
				var msg = "<span class='error'>ERROR when conform_header: \n" + received_data + "</span>" ;
					inspector.show_log_msg(msg);
					alert( $(msg).text() )
			}else{
				// Ok. Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					inspector.show_log_msg(msg);

				// Hide buton
				button_obj.hide();
				$('<small>'+get_label.procesando+'..</small>').insertAfter(button_obj);
				
				// Fire file_exists every 5 secs to test if ended proccess
				setTimeout(function(){ 
        			//tool_av_versions.file_exists(button_obj);
        			location.reload();
        		}, 10000);
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on conform_header: " + error_data.statusText + "</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	}//end conform_header

	

	/**
	* FILE EXISTS
	*/
	this.file_exists = function(button_obj, time) {
		
		if (typeof time == 'undefined') time = 5000;

		var video_id 	= $(button_obj).data('video_id'),
			quality		= $(button_obj).data('quality');

		if (DEBUG) console.log("->file_exists vars:" +video_id+' '+quality+ ' '+time);

		var mode 		= 'file_exists';
		var mydata		= {
							'mode': mode,
							'video_id': video_id,
							'quality': quality,
							'top_tipo': page_globals.top_tipo
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

				//var ar = video_id.split("-");
				//var tipo = ar[0];
				//component_av.update_component(tipo)
				location.reload();
				
			}else{
				// Loop
				setTimeout(function() {
					time = time + 1000;
        			tool_av_versions.file_exists(button_obj, time);
        		}, time);
			}
			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on file_exists data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 );
		})

	};//end file_exists



	/**
	* DELETE VERSION
	*/
	this.delete_version = function(button_obj) {
		
		if( !confirm( get_label.borrar + ' '+ get_label.fichero + ' ?') ) return false;

		var video_id 		= $(button_obj).data('video_id'),
			quality			= $(button_obj).data('quality'),
			tipo 			= $(button_obj).data('tipo'),
			parent 			= $(button_obj).data('parent'),
			file_path 		= $(button_obj).data('file_path')

		if (DEBUG) console.log("->delete_version vars:" +video_id+' '+quality);

		var mode 		= 'delete_version';
		var mydata		= { 
				'mode': mode, 
				'video_id': video_id, 
				'quality': quality, 
				'parent': parent, 
				'tipo': tipo, 
				'file_path': file_path, 
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
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {
				// Warning msg
				var msg = "<span class='error'>Error when delete file: \n" + received_data + "</span>" ;
					inspector.show_log_msg(msg);
					alert( $(msg).text() )

			}else{
				// Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					inspector.show_log_msg(msg);

				// Hide buttons and info
				//$(button_obj).hide();				

				//var ar = video_id.split("-");
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
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	};//end delete_version

	

	/**
	* DOWNLOAD FILE
	*/
	this.download_file = function(button_obj) {
		
		var video_id 		= $(button_obj).data('video_id'),
			quality			= $(button_obj).data('quality'),
			parent 			= $(button_obj).data('parent'),
			tipo 			= $(button_obj).data('tipo')	
						

		//var myurl 		= DEDALO_LIB_BASE_URL + '/component_av/media_engine/media_download.php?video_id='+video_id +'&quality=' + quality ;
		var myurl 		= this.url_trigger + '?mode=download_file&video_id='+video_id +'&quality=' + quality +'&tipo=' + tipo +'&parent=' + parent +'&top_tipo='+page_globals.top_tipo ;
		
		if ( !confirm( get_label.descargar + ' ' + video_id + ' ['+quality+']' ) ) return false;
		
		try{ 
			//location.href	= myurl ;
			window.open(myurl, get_label.descargar);		
		}catch(err){ 
			alert(err) 
		}
		if (DEBUG) console.log("->dowload_file vars:" +video_id+' '+quality);
	};

	this.donwload_fragment = function(button_obj) {
		
		var video_id 		= $(button_obj).data('video_id'),
			tc_in 			= $(button_obj).data('tc_in'),
			tc_out 			= $(button_obj).data('tc_out'),
			quality 		= $(button_obj).data('quality'),
			watermark 		= $(button_obj).data('watermark'),
			tag_id 			= $(button_obj).data('tag_id'),
			parent 			= $(button_obj).data('parent'),
			tipo 			= $(button_obj).data('tipo'),
			top_tipo 		= $(button_obj).data('top_tipo'),
			top_id 			= $(button_obj).data('top_id');

			//return console.log('top_tipo:'+top_tipo+' top_id:'+top_id+' tipo:'+tipo+' parent:'+parent)			

		//var myurl 		= DEDALO_LIB_BASE_URL + '/component_av/media_engine/media_download.php?video_id='+video_id +'&quality=' + quality ;
		var myurl = this.url_trigger + '?mode=download_fragment&video_id='+video_id +'&quality=' + quality+'&tc_in=' + tc_in +'&tc_out=' + tc_out +'&watermark=' + watermark +'&tipo=' + tipo +'&parent=' + parent +'&tag_id=' + tag_id +'&top_tipo=' + top_tipo +'&top_id=' + top_id ;
		
		if ( !confirm( get_label.descargar + ' ' + video_id + '-' + tag_id + ' ['+quality+']' ) ) return false;

		
		try{ 
			//location.href	= myurl ;
			window.open(myurl, get_label.descargar);		
		}catch(err){ 
			alert(err) 
		}
		if (DEBUG) console.log("->dowload_file vars:" +video_id+' '+quality);
		
		/*
		var mydata = {	'mode':'download_fragment', 
						'video_id':video_id,
						'quality':quality,
						'tc_in':tc_in,
						'tc_out':tc_out,
						'watermark':watermark,
						'id_matrix':id_matrix,
						'parent':parent,
						'tag_id':tag_id,
						'top_tipo':top_tipo,
						'top_id':top_id
					}

		// AJAX REQUEST
		$.post(this.url_trigger, mydata, function(retData){
			$("body").append("<iframe src='" + retData.url + "' style='display: none;' ></iframe>");
			console.log(retData)
		});
		*/
	};




	/**
	* DONWLOAD_FRAGMENT
	*/
	this.donwload_fragment_OLD = function(button_obj) {

		//return console.log(button_obj)

		var video_id 		= $(button_obj).data('video_id'),
			tc_in 			= $(button_obj).data('tc_in'),
			tc_out 			= $(button_obj).data('tc_out'),
			quality 		= $(button_obj).data('quality'),
			watermark 		= $(button_obj).data('watermark');

		$(button_obj).addClass('icon-download-spinner');
		
		var mode 		= 'donwload_fragment';
		var mydata		= { 'mode': mode, 'video_id': video_id, 'tc_in': tc_in, 'tc_out': tc_out, 'quality': quality, 'watermark': watermark, 'top_tipo': page_globals.top_tipo };
		
		if(DEBUG) console.log(mydata);

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			//return console.log(received_data)

			// Expected received_data is final filename
			var filename = received_data;

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {

				alert('Error on donwload_fragment')
				console.log("->donwload_fragment Error: "+received_data)

			}else{
				
				return alert(received_data)

				var download_url = DEDALO_LIB_BASE_URL + '/media_engine/fragment_download.php' + '?reelID='+video_id +'&quality='+quality +'&filename=' + filename ;

				if ( !confirm('Download ' + received_data) ) return false;

				try{
					//window.open(download_url,'Download');
					downloadURL(download_url)	
				}catch(err){ 
					alert(err) 
				}
				if (DEBUG) console.log("->dowload_file Ok filename:" +filename);
			}
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on donwload_fragment : " + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 );
			$(button_obj).removeClass('icon-download-spinner');
		})
		
		/*
		$.ajax({
			url			: myurl,
			data		: mydata,
			type		: "POST",
			beforeSend	: function() {
							//div.addClass('spinner');						
						},
			success		: function(received_data) {

							console.log(received_data)

							// Expected received_data is final filename
							var filename = received_data;

							// Search 'error' string in response
							var error_response = /error/i.test(received_data);	//console.log(typeof error_response);console.log(error_response)
								
							if( error_response != 'false' ) {

								var download_url = '../media_engine/fragment_download.php' + '?reelID='+video_id +'&quality='+quality +'&filename=' + filename ;

								if ( !confirm('Download ' + received_data) ) return false;
		
								try{
									//window.open(download_url,'Download');
									downloadURL(download_url)	
								}catch(err){ 
									alert(err) 
								}
								if (DEBUG) console.log("->dowload_file Ok filename:" +filename);

							}else{
								alert('Error on donwload_fragment')
								console.log("->donwload_fragment Error: "+received_data)
							}				
						},
			complete	: function() {
							$(button_obj).removeClass('icon-download-spinner');
						}
		});//fin $.ajax
		*/
	}

	this.$idown;  // Keep it outside of the function, so it's initialized once.	
	this.downloadURL = function(url) {
	  if ($idown) {
	    $idown.attr('src',url);
	  } else {
	    $idown = $('<iframe>', { id:'idown', src:url }).hide().appendTo('body');
	  }
	}
	//... How to use it:
	//downloadURL('http://whatever.com/file.pdf');


};
//end tool_av_versions