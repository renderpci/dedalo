"use strict";
/**
* COMMON JS
*/
var common = {



	/**
	* GET_JSON_DATA
	* Exec a XMLHttpRequest to trigger url and return a promise with object response
	*/
	get_json_data : function(trigger_url, trigger_vars, async) {
		
		const	url		= trigger_url + "?d=" + Date.now();
		const data_send = JSON.stringify(trigger_vars)
		
		var isIE 	= (navigator.userAgent.indexOf("MSIE") != -1)
		var isiE11 	= /rv:11.0/i.test(navigator.userAgent)		
		if (isIE || isiE11) {
			var warning_ms = tstring.incompatible_browser || "Warning: Internet explorer is not supported. Please use a modern browser like Chrome, Firefox, Safari, Opera, Edje.."
			alert(warning_ms)
			return false
		}	

		// ASYNC
		if (typeof async=="undefined") {
			async = true
		}
	
		// Create new promise with the Promise() constructor;
		// This has as its argument a function
		// with two parameters, resolve and reject
		return new Promise(function(resolve, reject) {
			// Standard XHR to load an image
			var request = new XMLHttpRequest();
				request.open('POST', url, async);
				//codification of the header for POST method, in GET no is necesary
				request.setRequestHeader("Content-type", "application/json"); // application/json application/x-www-form-urlencoded
				request.responseType = 'json';
				// When the request loads, check whether it was successful
				request.onload = function(e) {
				  if (request.status === 200) {
					// If successful, resolve the promise by passing back the request response
					resolve(request.response);
				  }else{
					// If it fails, reject the promise with a error message
					reject(Error('Reject error. Data don\'t load. error code: ' + request.statusText + " - url: " + url));
				  }
				};
				request.onerror = function(e) {			
				  // Also deal with the case when the entire request fails to begin with
				  // This is probably a network error, so reject the promise with an appropriate message
				  reject(Error('There was a network error. data_send: '+url+"?"+ data_send + "statusText: " + request.statusText));
				};

		  // Send the request
		  request.send(data_send);
		});
	},//end get_json



	/**
	* BUILD_PLAYER
	* @return 
	*/
	build_player : function(options) {
		if(SHOW_DEBUG===true) {
			console.log("[common.build_player] options",options);;
		}		

		var src  = options.src  || [""]
		var type = options.type || ["video/mp4"]

		// VIDEO
		var video = document.createElement("video")
			video.id 			= options.id || "video_player"
			video.controls 		= options.controls || true
			video.poster 		= options.poster || ""
			video.className 	= options.class || "video-js"
			video.preload 		= options.preload || "auto"
			video.dataset.setup = '{}' // {"trackTimeOffset":<?php echo $trackTimeOffset ?>}

			if (options.height) {
				video.height = options.height
			}
			if (options.width) {
				video.width = options.width
			}

		// SRC
		for (var i = 0; i < src.length; i++) {			
			var source = document.createElement("source")
				source.src  = src[i]
				source.type = type[i]
			video.appendChild(source)
		}

		// SUBTITLES
		// <track src=\"$subtitles_file_url\" kind=\"$vtt_kind\" srclang=\"en\" label=\"English\" default>
		// <track kind="subtitles" src="http://example.com/path/to/captions.vtt" srclang="en" label="English" default>
		var ar_subtitles = options.ar_subtitles || null
		if (ar_subtitles) {			
			for (var i = 0; i < ar_subtitles.length; i++) {
				var subtitle_obj = ar_subtitles[i]
				// Build track
				var track = document.createElement("track")
					track.kind 		= "subtitles"
					track.src 		= subtitle_obj.src
					track.srclang 	= subtitle_obj.srclang
					track.label 	= subtitle_obj.label
					if (track.default) {
						video.default = options.default
					}
				video.appendChild(track)				
			}//end for (var i = 0; i < ar_subtitles.length; i++)
		}


		// MSJ NO HTML5
		var msg_no_js = document.createElement("p")
			msg_no_js.className = "vjs-no-js" 
			msg_no_js.appendChild( document.createTextNode("To view this video please enable JavaScript, and consider upgrading to a web browser that supports HTML5 video") )
		video.appendChild(msg_no_js)

		/*
		<video id="my-video" class="video-js" controls preload="auto" width="640" height="264" poster="MY_VIDEO_POSTER.jpg" data-setup="{}">
		<source src="MY_VIDEO.mp4" type='video/mp4'>
		<source src="MY_VIDEO.webm" type='video/webm'>
		<p class="vjs-no-js">
		  To view this video please enable JavaScript, and consider upgrading to a web browser that
		  <a href="http://videojs.com/html5-video-support/" target="_blank">supports HTML5 video</a>
		</p>
		</video>
		*/

		// Activate
		setTimeout(function(){

			window.ready(function(e){
				var player = videojs(video);
					player.ready(function() {
					  this.addClass('my-example');
					});

					
			})
			
		}, 1)
		
		//console.log(video);

		return video
	},//end build_player


}//end common



function ready(fn) {
  if (document.readyState != 'loading'){
	fn();
  } else {
	document.addEventListener('DOMContentLoaded', fn);
  }
}



function cloneDeep (o) {
  let newO
  let i

  if (typeof o !== 'object') return o

  if (!o) return o

  if (Object.prototype.toString.apply(o) === '[object Array]') {
	newO = []
	for (i = 0; i < o.length; i += 1) {
	  newO[i] = cloneDeep(o[i])
	}
	return newO
  }

  newO = {}
  for (i in o) {
	if (o.hasOwnProperty(i)) {
	  newO[i] = cloneDeep(o[i])
	}
  }
  return newO
}



var hasScrollbar = function() {
  // The Modern solution
  if (typeof window.innerWidth === 'number')
    return window.innerWidth > document.documentElement.clientWidth

  // rootElem for quirksmode
  var rootElem = document.documentElement || document.body

  // Check overflow style property on body for fauxscrollbars
  var overflowStyle

  if (typeof rootElem.currentStyle !== 'undefined')
    overflowStyle = rootElem.currentStyle.overflow

  overflowStyle = overflowStyle || window.getComputedStyle(rootElem, '').overflow

    // Also need to check the Y axis overflow
  var overflowYStyle

  if (typeof rootElem.currentStyle !== 'undefined')
    overflowYStyle = rootElem.currentStyle.overflowY

  overflowYStyle = overflowYStyle || window.getComputedStyle(rootElem, '').overflowY

  var contentOverflows = rootElem.scrollHeight > rootElem.clientHeight
  var overflowShown    = /^(visible|auto)$/.test(overflowStyle) || /^(visible|auto)$/.test(overflowYStyle)
  var alwaysShowScroll = overflowStyle === 'scroll' || overflowYStyle === 'scroll'

  return (contentOverflows && overflowShown) || (alwaysShowScroll)
}
