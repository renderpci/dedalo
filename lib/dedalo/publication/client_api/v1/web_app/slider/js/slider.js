"use strict";
/**
* SLIDER
*
*
*/
var slider = {


	/**
	* INIT
	*/
	init : function(options){

		var self = this
		
		var slider_type 	= self.get_parameter_value(window.location.href, "slider_type") || "default"
			//console.log("slider_type:",slider_type);
		var slideshowSpeed 	= 12000

		// Activate slider	
		jQuery(window).load(function() {

			// flexslider use info:
			// https://github.com/woocommerce/FlexSlider
			jQuery('#slidebox').flexslider({
			    animation 		: "fade", // slide | fade
			    animationSpeed 	: 2000,
			    easing 			: "swing",
			    directionNav 	: true,
			    controlNav 		: false,
			    initDelay 		: 200, //ms
			    slideshowSpeed 	: slideshowSpeed,
			    start:function(e){ // Fires when the slider loads the first slide
			    	//console.log(e.slides[0]);
			    	/*
			    	jQuery.each( e.slides, function( key, li_obj ) {
					  //set_margin_top(img_obj)
					  var img_obj = jQuery(li_obj).find('img').first()[0];		  	
					  	console.log("naturalHeight: "+img_obj.naturalHeight);
					  	console.log("height: "+img_obj.height);
					  	//set_margin_top(img_obj)
					  	var margin_top = Math.floor( (img_obj.height - img_obj.naturalHeight) /2)
					  		
					  	img_obj.setAttribute("style", "margin-top:-"+margin_top+"px")
					  		console.log(margin_top);

					});
			  		*/
			  		console.log("start slide! with Total:", e.count, slider_type, slideshowSpeed)

			  		// Safe reload on X min
			  		var seconds = e.count * (slideshowSpeed/1000) * 2
					self.safe_reload(seconds)

					// another
					self.safe_reload(seconds * 2 )
			    },
			    before:function(e) {
			    	//fix_images_slider()
			    	console.log("Image changed (before)! Number:",e.currentSlide+1," of Total:",e.count);
			    },
			    after: function(e){ // Fires after each slider animation completes
			    	console.log("Image changed (after)! Number:",e.currentSlide+1," of Total:",e.count)
			    },
			    end:function(e){
			    	console.log('ended ! ',slider_type);
			    	switch(slider_type){
			    		case "alfons":
			    			setTimeout(function() {
								window.location.href = "../actividades_list/?lang=lg-spa"
							}, slideshowSpeed)			    			
			    			break;
			    		case "cultura":
			    			setTimeout(function() {
								window.location.href = "../actividades_list/?lang=lg-vlca"
							}, slideshowSpeed)			    			
			    			break;
			    		default:
			    			// Nothing to do, we area in Etnologia / Prehistoria slider
			    	}
			    },
			    added: function(e){
			    	console.log('added');
			    }
			});

			//$('#slidebox').flexslider("play") //Play slideshow

			/*
				start: function(){},            //Callback: function(slider) - Fires when the slider loads the first slide
			    before: function(){},           //Callback: function(slider) - Fires asynchronously with each slider animation
			    after: function(){},            //Callback: function(slider) - Fires after each slider animation completes
			    end: function(){},              //Callback: function(slider) - Fires when the slider reaches the last slide (asynchronous)
			    added: function(){},            //{NEW} Callback: function(slider) - Fires after a slide is added
			    removed: function(){}  
			*/
		});
		

		return true
	},//end init



	/**
	* SAFE_RELOAD
	* Force reload on intervals for avoid network cut problems
	*/
	safe_reload : function(seconds) {

		var max_time = seconds; // 8 * 12 * 2 // 8 (images) x 12 (secs) * 2 (twice)

		var new_url  = slider.change_url_variable(window.location.href, "safereload", true)

		// Safety reload after 3600 seconds (60 min)
		setTimeout(function(){
			window.location.href = new_url
		}, parseInt(max_time * 1000) ) //3600*1000

		console.log("safe_reload called with max_time secs:",max_time, new_url);

		return true
	},//end safe_reload



	/**
	* CHANGE_URL_VARIABLE
	*/
	change_url_variable : function(url, keyString, replaceString) {
		//var query = window.location.search.substring(1);

		var url_beats = url.split("?");
		//if (url_beats.length<2) {
		//	url = url + "?&offset=0"
		//}
	
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
		if( results == null ) return null;
		else return results[1];
	},//end get_parameter_value



}//end free_search



// Init
slider.init({})





