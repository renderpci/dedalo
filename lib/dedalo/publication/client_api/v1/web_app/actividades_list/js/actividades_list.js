"use strict";
/**
* ACTIVIDADES_LIST
*
*
*/
var actividades_list = {


	/**
	* INIT
	*/
	init : function(options){
		//console.log("actividades_list_vars:",actividades_list_vars);
		//console.log("init actividades_list. options:",options);
		//return			
		try{

			// Check font size and adjust base font size
			this.adjust_font_size(3)

			/**/
			// Navigate_rows rows in time intervals
			this.navigate_rows({
				delay : 12*1000 // ms
			})

			//var list_left = document.getElementById("list_left")
				//list_left.style.display = "none"
				//list_left.style.opacity = 1
				
			//$("body").fadeIn(600)

			// safe_reload
			this.safe_reload()

		}catch(error) {
			console.log("Error on navigate_rows:",error);
		}

		return true
	},//end init



	/**
	* SAFE_RELOAD
	* Force reload on intervals for avoid network cut problems
	*/
	safe_reload : function() {

		// Safety reload after 30 seconds
		setTimeout(function(){
			window.location.href = actividades_list.change_url_variable(window.location.href, "safereload", true)
		},30*1000)

		// Safety reload after 300 seconds (5 min)
		setTimeout(function(){
			window.location.href = actividades_list.change_url_variable(window.location.href, "safereload", true)
		},300*1000)

		// Safety reload after 900 seconds (15 min)
		setTimeout(function(){
			window.location.href = actividades_list.change_url_variable(window.location.href, "safereload", true)
		},900*1000)

		// Safety reload after 1800 seconds (30 min)
		setTimeout(function(){
			window.location.href = actividades_list.change_url_variable(window.location.href, "safereload", true)
		},1800*1000)

		// Safety reload after 3600 seconds (60 min)
		setTimeout(function(){
			window.location.href = actividades_list.change_url_variable(window.location.href, "safereload", true)
		},3600*1000)

		console.log("safe_reload called");
	},//end safe_reload



	/**
	* ADJUST_FONT_SIZE
	* If text is bigger than container generates scroll. If scroll is detected, qye size of font is reduced
	* until all text is vissible without page scroll
	*/
	adjust_font_size : function( minus ) {

		var self = this
		var base_size  	 = 95 // 70% initial
		//var has_scrollbar = window.innerWidth > document.documentElement.clientWidth
		var has_scrollbar = window.innerHeight > document.documentElement.clientHeight
		//var has_scrollbar = hasScrollbar() // Defined in common.js
		
		if (has_scrollbar===true) {
			var list_right = document.getElementById("list_right")
				//list_right.classList.add("list_right_scroll") // Decrease base font size a 5%

			var font_size = (base_size - minus)
				if (font_size<25) {
					return false
				}
			list_right.style.fontSize = (font_size + "%")
				//console.log("Change font size:" ,font_size);

			// Recheck
			setTimeout(function(){
				self.adjust_font_size(minus + 3)
			}, 50)
		}

		return true
	},//end adjust_font_size
	


	/**
	* NAVIGATE_ROWS
	* Navigate all pages of found records with pagination
	*/
	navigate_rows : function(options) {
		//console.log("actividades_list_vars:",actividades_list_vars);

		var total 		 = actividades_list_vars.total
		var limit 		 = actividades_list_vars.limit
		var offset 		 = actividades_list_vars.offset
		var total_pages  = actividades_list_vars.total_pages
		var page_number  = actividades_list_vars.page_number
		var lang  		 = actividades_list_vars.lang

		//if (total > limit && total > (limit*offset)) {
		if (page_number<total_pages) {
			// Reload with limit*offset + limit
			var new_offset = limit + offset // (limit*offset) + limit
			this.reload({
				new_offset : new_offset,
				delay 	   : options.delay,
				change_lang: false
			})
		}else{
			/*
			// Go to firts page
			this.reload({
				new_offset  : 0,
				delay 	    : options.delay,
				change_lang : true // force change lang on each cycle
			})*/

			// Goto Slider: Alfons El Magnanim / Area cultura
			var slider_url
			if (lang==="lg-vlca") {
				slider_url = "../slider/?slider_type=alfons"
			}else{
				slider_url = "../slider/?slider_type=cultura"
			}
			setTimeout(function() {
				window.location.href = slider_url
			}, options.delay)			
		}

		return true
	},//end navigate_rows



	/**
	* RELOAD
	* Reload current page with custom get vars and with x seconds of delay
	*/
	reload : function(options) {

		var url   = this.change_url_variable(window.location.href, "offset", options.new_offset)
		var delay = options.delay || 10000 // miliseconds

		if (options.change_lang && options.change_lang===true) {
			
			var current_lang = actividades_list_vars.lang
			var new_lang 	 = null 
			if (current_lang === 'lg-spa') {
				new_lang = 'lg-vlca'
			}else{
				new_lang = 'lg-spa'
			}
			url = this.change_url_variable(url, "lang", new_lang)
		}
				
		setTimeout(function(){

			$("#list_right").fadeOut(600, function(){
			//$("body").fadeOut(600, function(){
				window.location.href = url
			})
			
		}, delay)

		return true
	},//end reload



	/**
	* CHANGE_URL_VARIABLE
	*/
	change_url_variable : function(url, keyString, replaceString) {
		//var query = window.location.search.substring(1);

		var url_beats = url.split("?");
		if (url_beats.length<2) {
			url = url + "?&offset=0"
		}
	
		//var query 	  = window.location.search.substring(1);
		var query 	 	  = url;
		var current_vars  = query.split("&");		
		var len   	 	  = current_vars.length
		var replaced = false;
		for (var i = 0; i < len; i++) {
		//for (var i = len - 1; i >= 0; i--) {
			var pair = current_vars[i].split("=");
			if (pair[0] == keyString) {
				current_vars[i] = pair[0] + "=" + replaceString ;
				replaced = true
			}
		}

		var new_url = null
		if (replaced===true) {

			new_url = current_vars.join("&");

		}else{

			var beats = url.split("?");
			if (typeof beats[1]==="undefined") {
				new_url = beats[0] + '?' + keyString + "=" + replaceString
			}else{
				new_url = url + '&' + keyString + "=" + replaceString
			}
		}

		return new_url	
	},//end change_url_variable


	/**
	* GET_PARAMETER_VALUE
	*/
	get_parameter_value : function(url, name) {
		name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
		var regexS = "[\\?&]"+name+"=([^&#]*)";
		var regex = new RegExp( regexS );
		var results = regex.exec( url );
		if( results == null ) return "";
		else return results[1];
	},//end get_parameter_value



}//end actividades_list



// Init
actividades_list.init({})



