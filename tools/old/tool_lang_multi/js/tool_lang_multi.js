"use strict";
/**
* TOOL_LANG_MULTI CLASS
*
*
*/
var tool_lang_multi = new function() {



	/**
	* INIT
	*/
	this.initiated = false
	this.init = function(data) {

		return console.log("Working here!!");



		if (this.initiated!==true) {

			// Set data vars
			this.textarea_lang = data.textarea_lang

			var current_tool_obj = this


			window.addEventListener("resize", function (event) {
				tool_lang.fix_height_of_texteditor();
			});

			window.addEventListener("load", function (event) {
				switch(page_globals.modo){
					case 'tool_lang':
						// Update page paragraphs counters
						setTimeout(function(){
							tool_lang.writeLeftParagraphsNumber();
							tool_lang.writeRightParagraphsNumber();
						}, 1000)
						tool_lang.fix_height_of_texteditor()
						break;
				}
			});

			window.addEventListener("unload", function (event) {
				//event.preventDefault();

				// Reload opener page list
				if (window.opener && window.opener.page_globals.modo && window.opener.page_globals.modo==='list') {
					//window.opener.location.reload();

					// EDITING FROM PROCESSES

					// RELOAD_ROWS_LIST
					var call_uid = 'wrap_' + page_globals.section_tipo + '_' + 'list';	// wrap_dd1140_list
					window.opener.search.reload_rows_list(call_uid);

					window.opener.console.log("Reloading rows (reload_rows_list).. "+call_uid)
				}
			});//end unload

			window.ready(function(){
				switch(page_globals.modo){
					case 'edit':
							/*
							// OBJ SELECTOR BUTTON OPEN DIALOG WINDOW
							var button_lang_open = $('.tool_lang_icon');

								// LIVE EVENT CLICK TO BUTTON (ICON) LOAD TOOL
								$(document.body).on("click", button_lang_open.selector, function(){

									// LOAD TOOL (OPEN DIALOG WINDOW)
									tool_lang.load_tool_lang(this,true);
								});
							*/
							break;

					case 'tool_lang':

							// Set selector selected option (stored as cookie) and load target selected lang
							var last_target_lang = get_localStorage('last_target_lang');
							if (typeof last_target_lang !== 'undefined') {
								// Set selector as stored lang
								var selector_obj = document.getElementsByClassName('tool_lang_selector_target')[0]; //$('.tool_lang_selector_target').first();
								selector_obj.value = last_target_lang;
									//console.log(last_target_lang)
								tool_lang.load_target_component(selector_obj)
							};
							break;
				}
			})
			/*
			$(function() {
			});//end $(function()*/


			// VISIBILITYCHANGE (EVENT)
			document.addEventListener("visibilitychange", function(event) {
				if (document.hidden===true) return false;

				var locator = {
					section_tipo 	: page_globals.section_tipo,
					section_id 		: page_globals._parent,
					component_tipo 	: page_globals.tipo,
					lang 			: current_tool_obj.textarea_lang
				}
				tool_common.update_tracking_status(event,{locator:locator})
			});

		}//end if (this.initiated!==true)

		this.initiated = true
	};//end init


};//end tool_lang_multi
