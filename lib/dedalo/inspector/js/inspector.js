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

				// AVOID RESET COMPONENT SELECT ON CLICK 
				$('#inspector_div').find('.tab_content').click(function(e) {					
					e.stopPropagation();
				});
				
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
		
		if( typeof delay == 'undefined') delay_secs = 10000*3 ;
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
		var mode			= 'update_inspector_info',
			tipo			= $(obj_warp).data('tipo'),
			_parent			= $(obj_warp).data('parent'),
			lang			= $(obj_warp).data('lang'),
			dato			= $(obj_warp).data('dato'),
			component_name 	= $(obj_warp).data('component_name'),			
			label			= $(obj_warp).children('label').first().text(),
			target_obj		= $('#inspector_info'),
			debug_div		= $('#inspector_debug'),
			mod_date 		= '',
			mod_by_user_name= '';


		// Page var globals verify
		if( typeof _parent=='undefined' || !_parent ) {
			console.log("Error: _parent not defined! (update_inspector_info) "+_parent)
			return null;
		}

		// Reset some content
		$('#inspector_indexations').html('');
		$('#inspector_relation_list_sections').html('');

		try {
			if (typeof $(obj_warp).data('component_info').mod_date!='undefined') {
				var mod_date = $(obj_warp).data('component_info').mod_date
			}
			if (typeof $(obj_warp).data('component_info').mod_by_user_name!='undefined') {
				var mod_by_user_name = $(obj_warp).data('component_info').mod_by_user_name
			}
		}catch(err) {
			if (DEBUG) {
				//console.warn(err)
			}
		}
		
		// HTML TO INSPECTOR
		$(target_obj).html("")
			.append('<div class="key capitalize">'+get_label.seleccionado+'</div><div class="value"><b style="color:#333">'+label+'</b> <span class="debug_info">('+lang+')</span></div><br>')
			.append('<div class="key capitalize">'+get_label.modificado+'</div><div class="value">'+mod_date+'</div><br>')
			.append('<div class="key">'+get_label.por_usuario+'</div><div class="value">'+mod_by_user_name+'</div><br>')

		if (DEBUG) {
		$(debug_div).html("")
			.append( '<div class="key">parent</div><div class="value">'	+ _parent 		+ '</div><br>')
			.append( '<div class="key">tipo</div><div class="value">' 	+ tipo 			+ '</div><br>')
			.append( '<div class="key">lang</div><div class="value">' 	+ lang 			+ '</div><br>')
			.append( '<div class="key">label</div><div class="value">' 	+ label 		+ '</div><br>')
			.append( '<div class="key">model</div><div class="value">' 	+ component_name+ '</div><br>')
			.append( '<div class="key">dato</div><div class="value">' 	+ dato 			+ '</div><br>')
		}
		return;
		
	}//end update_inspector_info



	/**
	* LOAD INSPECTOR TOOLS BUTTONS
	* Load inspector tools buttons whe wrap is selected
	*/
	this.previous_load_inspector_tools_caller = null;
	this.load_inspector_tools = function (obj_warp) {
	 	//console.log(obj_warp)
	 	//console.log("load_inspector_tools fired")			
		var tipo				= $(obj_warp).data('tipo'),
			parent				= $(obj_warp).data('parent'),
			lang				= $(obj_warp).data('lang'),
			context_name		= $(obj_warp).data('component_name'),
			current_tipo_section= $(obj_warp).data('current_tipo_section');	//return alert('load_inspector_tools \nid:'+id_matrix + " \ntipo:"+tipo + " \ncurrent_tipo_section:"+current_tipo_section)
			section_tipo 		= page_globals.section_tipo

		// target result div
		var target_obj	= $('#inspector_tools');
		if($(target_obj).length<1) return false; //alert("Error: load_inspector_tools (target_obj not found!)");

		if (DEBUG) {
			//console.log("load_inspector_tools parent:"+parent+" tipo:"+tipo+" lang:"+lang)
		}

		// test if parent is global var
		// Updated: get parent of current wrap obj
		if (typeof parent=='undefined' || !parent ) {
			return alert("load_inspector_tools Error: parent is not set")
		}

		/*
			$html_tool   .= "<div class=\"tool_inspector_div\">";

			$btn_title	  = label::get_label('abrir').' '.label::get_label('herramienta');
			$html_tool   .= "\n<div class=\"icon_bs tool_lang_icon link\"
								data-tipo=\"{$tipo}\" data-parent=\"{$parent}\" data-lang=\"{$lang}\" data-tab_id=\"img_lang_{$tipo}_{$parent}\" 
								title=\"$btn_title\"
								onclick=\"tool_common.open_tool_lang(this)\"
								></div>";
			$html_tool   .= label::get_label('tool_lang');	#" Lang";
			$html_tool   .= "</div>";
		*/
		var ar_tools_name = [];
		$(target_obj).html('');		
		try {
			if (typeof $(obj_warp).data('component_info').ar_tools_name!='undefined') {
				ar_tools_name = $(obj_warp).data('component_info').ar_tools_name
			}
			//console.log(ar_tools_name);
			if (ar_tools_name.length>0) {

				var html_string = '';
				for (var i = 0; i < ar_tools_name.length; i++) {					
					var tool_name 	= ar_tools_name[i],
						label 	  	= get_label[tool_name],
						title 		= get_label.abrir + ' ' + get_label.herramienta;
					// HTML TO INSPECTOR
					// Container tool div
					html_string +='<div class="tool_inspector_div">';
						// Icon div				
						html_string += '<div class="icon_bs '+tool_name+'_icon link"\
							data-tipo="'+tipo+'" data-parent="'+parent+'" data-section_tipo="'+section_tipo+'" data-lang="'+lang+'" data-tab_id="img_lang_'+tipo+'_'+parent+'" data-context_name="'+context_name+'"\
							title="'+title+'"\
							onclick="tool_common.open_'+tool_name+'(this)"></div>';
						// Label
						html_string += label;
					html_string += '</div>';	
				}//end for
				$(target_obj).append(html_string)
			}


		}catch(err) {
			if (DEBUG) {
				console.warn(err)
			}
		}
		return;		


		/*
		// Avoid load identical data  
		var current_caller = tipo + '_' + parent + '_' +lang ;
		if (current_caller==this.previous_load_inspector_tools_caller) {
			// Nothing to load
			//alert("load_inspector_tools: nothing to load")
			return null;
		}else{
			// Fix current caller
			this.previous_load_inspector_tools_caller = current_caller;
		};
			
		var mode		= 'load_inspector_tools';
		var mydata		= { 'mode':mode, 'tipo':tipo, 'parent':parent, 'lang':lang, 'current_tipo_section':current_tipo_section, 'top_tipo':page_globals.top_tipo };

		html_page.loading_content( target_obj, 1 );

		// AJAX
		$.ajax({
			url			: this.url_trigger,
			data		: mydata,
			type		: "GET"
		})
		.done(function(received_data) {
			//console.log(received_data)
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
		*/

	}//end load_inspector_tools
	


	this.trigger_url = function(url, button_onj) {
		
		html_page.loading_content( button_onj, 1 );	

		// AJAX
		$.ajax({
			url			: url,
			data		: {},
			type		: "GET"
		})
		.done(function(received_data) {
			//console.log(received_data);
			var msg = "Updated \n";
			if (DEBUG) {
				msg += "<hr>DEBUG INFO: \n"+received_data
			};
			alert(msg);
		})
		.fail(function(error_data) {
			alert("Error \n\n" + error_data);
		})
		.always(function() {
			html_page.loading_content( button_onj, 0 );																						
		});
	}


}// end inspector










