// JavaScript Document
$(document).ready(function() {

	switch(page_globals.modo) {		
		
		case 'edit' :	
				// ARRANGE POSITION IN DIALOG WINDOW
				if (on_dialog_window==1) {
					$('#button_toggle_inspector').addClass('button_toggle_inspector_in_dialog')
				};

				/* INSPECTOR SCROLL FIXED */
				var _window    = $(window),
					sidebar    = $('#sidebar'),
					callback   = function()	{
						// Scroll position
						var scrollTop = _window.scrollTop();
						//console.log('contentTop:'+contentTop +' scrollTop:'+scrollTop)
						
						// On change scroll position, maintain sidebar position
						$(sidebar).css({'top': scrollTop+'px'});

						// On change scroll position, maintain sidebar position
						//$('#menu_wrapper').css({'top': scrollTop+'px'});
					};
					var isiPad = navigator.userAgent.match(/iPad/i) != null;
					if(!isiPad) { 
						$(window).scroll(callback);
					}
				//end INSPECTOR SCROLL FIXED
				
				break;
	}
});




// INSPECTOR CLASS
var inspector = new function() {

	// SIDEBAR STATE
	this.sidebar_state	= 'isopen';

	// URL TRIGGER
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_common/trigger.component_common.php' ;

	/**
	* TOGGLE SIDEBAR (INSPECTOR)
	*/
	this.toggle_sidebar = function() {	
	
		if(this.sidebar_state!='isopen') {		
			this.close_content();
			this.open_inspector();
			// fix state
			this.sidebar_state = 'isopen'
		}else{		
			this.open_content();
			this.close_inspector();
			// fix state
			this.sidebar_state = 'isclose'
		}
		//alert(this.sidebar_state)
		return false;	
	}
	
	/**
	* OPEN MAIN INSPECTOR
	*/
	this.open_inspector = function() {
		$("#sidebar").show(0);				
	}
	/**
	* CLOSE MAIN INSPECTOR
	*/
	this.close_inspector = function() {	
		$("#sidebar").hide(0);
	}


	/**
	* OPEN INSPECTOR CONTENT
	*/
	this.open_content = function(content_div_id) {
		var section_content_selector= $('.css_section_content').first();
		if (typeof content_div_id != 'undefined') {
			section_content_selector = $('#'+content_div_id);
		}
		$(section_content_selector).animate(0).css('width','99.9%');		
	}	
	/**
	* CLOSE INSPECTOR CONTENT 
	*/
	this.close_content = function(content_div_id) {
		var section_content_selector= $('.css_section_content').first();
		if (typeof content_div_id != 'undefined') {
			section_content_selector = $('#'+content_div_id);	
		}
		$(section_content_selector).animate(0).css('width','80%');		
	}


	/**
	* SHOW LOG MSG (In inspector log with delayed hide)
	*
	*/
	this.show_log_msg = function (msg, delay_secs) {
		
		if( typeof delay == 'undefined') delay_secs = 10000 ;
		var span_save = $('<div class="span_save"/>').html(msg).delay(delay_secs).fadeOut(600, function(){ $(this).remove();});

		// Try show log in inspector
		if (top.$('#inspector_log').length>0) {
			top.$('#inspector_log').append(span_save);
		// Try show log in log_messages div
		}else if ($('#log_messages_DES').length>0) {
			top.$('#log_messages').append(span_save);
		// Show alert
		}else{
			alert( jQuery('<span>Inspector msg: ' + msg + '</span>').text() )
		}				
	}

	/**
	* UPDATE INSPECTOR INFO
	* Update inspector info when wrap is selected
	*/
	this.previous_update_inspector_info_caller = null;
	this.update_inspector_info = function (obj_warp) {
		
		//if (DEBUG) console.log($(obj_warp));
		var mode			= 'update_inspector_info';
		var id_matrix		= $(obj_warp).data('id_matrix');
		var tipo			= $(obj_warp).data('tipo');
		var _parent			= $(obj_warp).data('parent');
		var lang			= $(obj_warp).data('lang');
		var dato			= $(obj_warp).data('dato');	
		var component_name 	= $(obj_warp).data('component_name');
		//var label 			= $(obj_warp).data('label');
		var label			= $(obj_warp).children('label').first().text();	
		var target_obj		= $('#inspector_info');
		var debug_div		= $('#inspector_debug');		

		// Page var globals verify
		if( typeof _parent=='undefined' || !_parent ) {
			console.log("Error: _parent not defined! (update_inspector_info) "+_parent)
			return null;
			//return alert("Error: _parent not defined! (update_inspector_info) "+_parent);
		}

		// Avoid load identical data  
		var current_caller = id_matrix + '_' + tipo + '_' + _parent + '_' + lang ;
		if (current_caller==this.previous_update_inspector_info_caller) {
			// Nothing to load
			return null;
		}else{
			// Fix current caller
			this.previous_update_inspector_info_caller = current_caller;
		};
		
		//return alert('mode:'+ mode +' id_matrix:'+ id_matrix + ' tipo'+ tipo + ' _parent'+ _parent + " lang:"+lang)
		
		if($(target_obj).length<1) return false; //alert("Error: update_inspector_info (target_obj not found!)");

		var mydata			= { 'mode': mode, 'id_matrix': id_matrix, 'tipo': tipo, 'parent': _parent, 'lang': lang };

		// Spinner loading
		html_page.loading_content( target_obj, 1 );

		// AJAX REQUEST
		$.ajax({
			url			: this.url_trigger,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {

			//alert(received_data);

			// INFO Write info
			$(target_obj).html(received_data);

			
			// DEBUG received data
			// Replace <br> tags to \n on dato string
			if( typeof dato !=='undefined' && dato!=null && dato.length>3 )  dato.replace(/<br ?\/?>/g, "\n");
			
			debug_div.html  ( "" );
			debug_div.append( "<div class=\"key\">id_matrix</div><div class=\"value\">" + id_matrix + " </div><br>\n");
			debug_div.append( "<div class=\"key\">parent</div><div class=\"value\">" + _parent + " </div><br>\n");
			debug_div.append( "<div class=\"key\">tipo</div><div class=\"value\">" + tipo + " </div><br>\n");
			debug_div.append( "<div class=\"key\">lang</div><div class=\"value\">" + lang + " </div><br>\n");
			debug_div.append( "<div class=\"key\">label</div><div class=\"value\">" + label + " </div><br>\n");
			debug_div.append( "<div class=\"key\">model</div><div class=\"value\">" + component_name + " </div><br>\n");
			debug_div.append( "<div class=\"key\">dato</div><div class=\"value\">" + dato + " </div><br>\n");
			//if (DEBUG) console.log("Debug div text:\n " + debug_div.text())			
		})
		// FAIL ERROR
		.fail(function(error_data) {					
			// log
			inspector.show_log_msg("<span class='error'>Error when get info data</span>");
		})
		// ALLWAYS
		.always(function() {
			//inspector.show_log_msg("<span class='ok'>Loaded " + getFunctionName() + " [id_matrix] " + id_matrix + "</span>");	
			html_page.loading_content( target_obj, 0 );																							
		});
		
	}//end update_inspector_info


	/**
	* LOAD INSPECTOR TOOLS BUTTONS
	* Load inspector tools buttons whe wrap is selected
	*/
	this.previous_load_inspector_tools_caller = null;
	this.load_inspector_tools = function (obj_warp) {
	 
	 	//console.log(obj_warp)
	
		var id_matrix			= $(obj_warp).data('id_matrix');
		var tipo				= $(obj_warp).data('tipo');
		var parent				= $(obj_warp).data('parent');
		var current_tipo_section= $(obj_warp).data('current_tipo_section');	//return alert('load_inspector_tools \nid:'+id_matrix + " \ntipo:"+tipo + " \ncurrent_tipo_section:"+current_tipo_section)

		// target result div
		var target_obj	= $('#inspector_tools');
		if($(target_obj).length<1) return false; //alert("Error: load_inspector_tools (target_obj not found!)");


		// When component don't have matrix record, nothing is loaded
		if (id_matrix<1) {
			target_obj.html(' ');
			this.previous_load_inspector_tools_caller = null;
			return false;
		}


		// test if parent is global var
		// Updated: get parent of current wrap obj
		if (typeof parent=='undefined' || !parent ) {
			return alert("load_inspector_tools Error: parent is not set")
		}

		// Avoid load identical data  
		var current_caller = id_matrix + '_' + tipo + '_' + parent ;
		if (current_caller==this.previous_load_inspector_tools_caller) {
			// Nothing to load
			//alert("load_inspector_tools: nothing to load")
			return null;
		}else{
			// Fix current caller
			this.previous_load_inspector_tools_caller = current_caller;
		};
			
		var mode		= 'load_inspector_tools';
		var mydata		= { 'mode': mode, 'id_matrix': id_matrix, 'tipo': tipo, 'parent': parent, 'current_tipo_section': current_tipo_section };

		//return alert(' mode:'+ mode+ ' id_matrix:'+ id_matrix+ ' tipo:'+ tipo+ ' parent:'+ parent+ ' current_tipo_section:'+ current_tipo_section )
		html_page.loading_content( target_obj, 1 );

		// AJAX
		$.ajax({
			url			: this.url_trigger,
			data		: mydata,
			type		: "POST"
		})
		.done(function(received_data) {
			// received data
			target_obj.html(received_data);
		})
		.fail(function(error_data) {					
			// log
			top.inspector.show_log_msg("<span class='error'>Error on load tools</span>")
		})
		.always(function() {
			//inspector.show_log_msg("<span class='ok'>Loaded " + getFunctionName() + " [id_matrix] " + id_matrix + "</span>");	
			html_page.loading_content( target_obj, 0 );																							
		});

	}//end load_inspector_tools
	


}// end inspector










