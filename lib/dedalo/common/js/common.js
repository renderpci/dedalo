// JavaScript Document
//document.write('<scr'+'ipt src="'+DEDALO_LIB_BASE_URL+'/common/js/detectBrowser.js" async="async" type="text/javascript"></scr'+'ipt>');

//======================================================//
// multi browser compatibility - not all support console
//======================================================//
var dummyConsole = [];
var console = console || {};
if (!console.log) {
	console.log = function (message) {
		dummyConsole.push(message);
		//if (DEBUG) console.log(message)
	}
}
/** @define {boolean} */
var DEBUG ;

function dump(message, name) {
	try{
		if (name) {
			console.log("-- "+name+":")
		};
		console.log(message)
	}catch(e){

	}
}


/**
* COMMON
*/
var common = new function() {

	this.trigger_url = DEDALO_LIB_BASE_URL + '/common/trigger.common.php';


	// TEST IF IS STRING
	this.isString = function (o) {
		return typeof o == "string" || (typeof o == "object" && o.constructor === String);
	}
	// TEST IF VALUE IS IN ARRAY
	this.inArray = function (  elem, array ) {
		return jQuery.inArray(elem, array);
	}
	// LOADJSCSSFILE
	this.loadjscssfile = function(filename, filetype) {
		if (filetype=="js"){ //if filename is a external JavaScript file
			var fileref=document.createElement('script')
			fileref.setAttribute("src", filename)
			fileref.setAttribute("type","text/javascript")
			fileref.setAttribute("charset","utf-8")
		}
		else if (filetype=="css"){ //if filename is an external CSS file
			var fileref=document.createElement("link")
			fileref.setAttribute("rel", "stylesheet")
			fileref.setAttribute("href", filename)
			fileref.setAttribute("type", "text/css")
			fileref.setAttribute("media", "screen")
		}
		if (typeof fileref!="undefined")
			document.getElementsByTagName("head")[0].appendChild(fileref)
	}

	// CHECKLOADJSCSSFILE
	var filesadded=""; //list of files already added
	this.checkloadjscssfile = function(filename, filetype) {
	 if (filesadded.indexOf("["+filename+"]")==-1){
	  this.loadjscssfile(filename, filetype)
	  filesadded+="["+filename+"]" //List of files added in the form "[filename1],[filename2],etc"
	 }
	 else
	  if(DEBUG) console.log("file already added!")
	}

	// JUMP_SELECT_LANG
	this.jump_select_lang = function(select_obj) {

		var type_of_lang 	= $(select_obj).data('type_of_lang'),
			new_lang 		= $(select_obj).val();

		var request_data = {
			'mode' 		: 'change_lang',
			'top_tipo'	: page_globals.top_tipo
		}

		if (type_of_lang=='dedalo_application_lang') {
			// Changes data and application langs synchronized
			request_data.dedalo_application_lang 	= new_lang;
			request_data.dedalo_data_lang 			= new_lang;
		}else if (type_of_lang=='dedalo_data_lang'){
			// DATA : Only change data lang and leave unsync application lang
			request_data.dedalo_data_lang 			= new_lang;
		}
		//console.log(request_data)
		//html_page.loading_content('html',1);

		// AJAX REQUEST
		$.ajax({
			url			: this.trigger_url,
			data		: request_data,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {
			if(DEBUG) console.log(received_data)
			setTimeout(function() {
				//html_page.loading_content('body',0);
				location.reload(false)
			}, 1);
		})
		// FAIL ERROR
		.fail(function(error_data) {
			inspector.show_log_msg("<span class='error'>Error when jump_select_lang</span>");
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content('body',0);
		});
	}//end jump_select_lang


	/**
	* GET_INNER_HTML
	* Get first div element and return only his content html (used for load bits of dom by ajax)
	*/
	this.get_inner_html = function( html_string ) {

		// DOM. Convert received html string to dom objects array
		var html 		  = $.parseHTML( html_string ),
			inner_content = null

		// Gather the parsed HTML's node names
		$.each( html, function( i, el ) {
			//console.log(el.nodeName);

		  	if (el.nodeName!='DIV') return true;  // Skip nodes no div

			var contents 		= $(el).contents()		//console.log( contents );
	  			inner_content 	= $(contents.context).html()

	  		return false; // Stop loop
		});

		return inner_content

	}//end get_inner_html


	/**
	* DD_EVENTSOURCE
	* @param object data
	*//*
	this.dd_EventSource = function( data ) {
		console.log(data);

		var vars_get='';
		for (var key in data.vars) {
		   if (data.vars.hasOwnProperty(key)) {
		      console.log(key, data.vars[key]);
		      vars_get += "&"+key+"="+data.vars[key];
		   }
		}
		var response_div = data.response_div

		var source = new EventSource( data.url + '?' + vars_get );
			//console.log(data.url + '?' + vars_get);

		// message
		source.addEventListener('message', function(e) {
					//console.log(e);

					msg = JSON.parse(e.data);
					//console.log(msg);

					// Notification msg ok
					response_div.innerHtml = msg;

					// END SCRIPT
					if(/ok/i.test(msg)) { //data_percent >= 100 ||
						// Close connection
						source.close();

						// Remove paginator div from edit window
						//paginator_div.remove()

						// Remove spinner
						//html_page.loading_content( wrap_div_tool, 0 );

						// Close button
						response_div.innerHtml += "<div class=\"css_button_generic\" onclick=\"top.$('#dialog_page_iframe').dialog('close');\">"+ get_label.cerrar +"</div> ";
					}

				}, false);

		// error
		source.addEventListener('error', function(e) {
			//console.log(e);

			// Close connection
			source.close();

			// Remove spinner
			//html_page.loading_content( wrap_div_tool, 0 );

			//alert("EventSource failed. "+ e );
			response_div.innerHtml = "<div class='error'>Sorry. Error on proccess data</div>";

		}, false);
	}//end dd_EventSource
	*//*
	this.dd_EventSource({
			"url":"http..",
			"vars":{"id":45},
			"stop":"ok",
			"response_div": document.getElementById('tool_replace_component_data_response'),
			"done":function(e){
						console.log(e);
					},
			"fail": function(e) {
						console.log(e);
					},
			"always": function(e) {
						console.log(e);
					}
			})
	*/



	/**
	* GET_PAGE_HEIGHT
	* Calculate max document height (window height + scroll)
	* @return int page_height
	*/
	this.get_page_height = function() {

		var body 		= document.body,
		    html 		= document.documentElement,
		    page_height = Math.max( body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight );

		return page_height;
	}



	/**
	* PRINT_RESPONSE
	*/
	this.print_response = function( response ) {

		return '<div class=\"log_messages_response\">'+response+'</div>';
	}



	/**
	* STOP_ALL_VIDEOS
	* Stop possible downloading videos on paginate, etc.
	* From https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Using_HTML5_audio_and_video
	*/
	this.stop_all_videos = function() {

		var ar_html5_videos = document.getElementsByTagName("video")
		if (ar_html5_videos) {
			var len = ar_html5_videos.length
			for (var i = len - 1; i >= 0; i--) {
				ar_html5_videos[i].pause();
				ar_html5_videos[i].src='';
				ar_html5_videos[i].removeAttribute("src");				
					//console.log("stoped video "+i);
			}
		}
	};//end stop_all_videos



	/**
	* GET_JSON
	* XMLHttpRequest to trigger
	* @return Promise
	*/
	this.get_json_data = function(trigger_url, trigger_vars) {
		
		var	url		= trigger_url;	//?mode=get_childrens_data';
		// Iterate trigger and create a string request like a http GET, from received trigger vars object
		var ar_vars = [];
			for(var key in trigger_vars) {
				ar_vars.push( key + '=' + trigger_vars[key])
			}
		var data_send = ar_vars.join('&')
	
	 	// Create new promise with the Promise() constructor;
	    // This has as its argument a function
	    // with two parameters, resolve and reject
	    return new Promise(function(resolve, reject) {
			// Standard XHR to load an image
			var request = new XMLHttpRequest();
			request.open('POST', url);
			//codification of the header for POST method, in GET no is necesary
			request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
			request.responseType = 'json';
			// When the request loads, check whether it was successful
			request.onload = function() {
			  if (request.status === 200) {
			  	// If successful, resolve the promise by passing back the request response
			    resolve(request.response);
			  } else {
			  	// If it fails, reject the promise with a error message
			    reject(Error('Reject error don\'t load successfully; error code:' + request.statusText));
			  }
			};
			request.onerror = function() {
			// Also deal with the case when the entire request fails to begin with
			// This is probably a network error, so reject the promise with an appropriate message
			reject(Error('There was a network error.'));
	      };

	      // Send the request
	      request.send(data_send);
	    });
	};//end get_json



	/**
	* URLDECODE
	* Equivalent function to PHP urldecode in Javascript
	* @return string decoded_url
	*/
	this.urldecode = function(url) {
		var decoded_url = decodeURIComponent(url.replace(/\+/g, ' '))
		return decoded_url
	};//end urldecode



	this.addslashes = function (str) {
	    return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
	}



	this.build_modal_dialog = function( options ) {		

		// modal_dialog
		var modal_dialog = document.createElement("div")
			modal_dialog.classList.add('modal-dialog')			
			modal_dialog.setAttribute("role", "document")
			// Add
			// div_note_wrapper.appendChild(modal_dialog)

		// modal_content
		var modal_content = document.createElement("div")
			modal_content.classList.add('modal-content')
			// Add
			modal_dialog.appendChild(modal_content)

			// modal_header
			var modal_header = document.createElement("div")
				modal_header.classList.add('modal-header')
				// Add
				modal_content.appendChild(modal_header)

				// modal_header <button type="button" class="close" data-dismiss="modal" aria-label="Close">
				var close = document.createElement("button")
					close.classList.add('close')
					close.dataset.dismiss = "modal"
					close.setAttribute("aria-label", "Close")					
					// Add
					modal_header.appendChild(close)

				var span = document.createElement("span")
					span.setAttribute("aria-hidden", "true")
					var t = document.createTextNode("x")					 
					
					// Add
					span.appendChild(t)
					// Add
					close.appendChild(span)
				
				// Add options.header
				if (typeof options.header!=="undefined") {
					modal_header.appendChild(options.header)
				}

			// modal_body
			var modal_body = document.createElement("div")
				modal_body.classList.add('modal-body')
				// Add
				modal_content.appendChild(modal_body)

				// Add options.body
				if (typeof options.body!=="undefined") {
					modal_body.appendChild(options.body)
				}

			// modal_footer	
			if (typeof options.footer!=="undefined") {		
			var modal_footer = document.createElement("div")
				modal_footer.classList.add('modal-footer')
				// Add
				modal_content.appendChild(modal_footer)

				// Add options.footer
				modal_footer.appendChild(options.footer)	
			}

		// modal_div	
		var modal_div = document.createElement("div")
			modal_div.id = options.id
			modal_div.classList.add('modal','fade')		// ,'hide'
			modal_div.setAttribute("role", "dialog")
			modal_div.setAttribute("tabindex", "-1")			

			// Add
			modal_div.appendChild(modal_dialog)

		return modal_div
	}//end build_modal_dialog



};//end common class





/**
* ALERT : ALERT OVERRIDE STANDAR JAVASCRIPT ALERT

var alert = function (msg,title,callback) {
	if( typeof title == 'undefined') title = 'Alert';
	$('<div class="dd_alert_msg">'+ msg + '</div>').dialog({
		modal: true,
		title: title,
		buttons: {
			Ok: function() {
				$( this ).dialog( "close" );
			}
		},
		close: function(event, ui) {
			// Callback optional
			if (callback && typeof(callback) === "function") {
				callback();
			}
		}
	});
}*/
/**
* CONFIRM :  CONFIRM OVERRIDE STANDAR JAVASCRIPT ALERT
*//*
var confirm__DES__ = function (msg, callback, title) {

	if( typeof title == 'undefined') title = 'Alert';	//return alert(callback)

	var dfd = new $.Deferred();

	// create and/or show the dialog box here
	// but in "OK" do 'def.resolve()'
	// and in "cancel" do 'def.reject()'
	$('<div class="dd_alert_msg">'+ msg + '</div>').dialog({
		modal: true,
		title: title,

		buttons: {
			"Ok": function () {
				
				// Callback optional
				//if (callback && typeof(callback) === "function") {
				//	return callback();
				//}			
				dfd.resolve('Success!');
				$(this).dialog("close");
			},
			"Cancel": function () {
				
				// Callback optional
				//if (callback && typeof(callback) === "function") {
				//	callback(false);
				//}			
				dfd.reject('Uh-oh!');
				$(this).dialog("close");
			}
		}
	});

	dfd.then(function() {
		// perform next action when user clicks proceed
		alert('then')
	});

	dfd.fail(function() {
		// perform some action when the user clicks cancel
		alert('fail')
	});
}
*/

// GOTO (URL)
var goto_url = function(url) {
	return window.location = url;
}
// HTML2TEXT
function html2text(html) {
	return html.replace(/<(?:.|\n)*?>/gm, '');
}
// REPLACEALL
function replaceAll(find, replace, str) {
	if(typeof str == 'undefined') return null;
	return str.replace(new RegExp(find, 'g'), replace);
}

/**
* TEST_OBJECT_VARS
* Verify all object vars for 'undefined'.
* If found any value is undefined, alert error msg and return false
*/
var test_object_vars = function(obj_vars, function_name) {

	var last 	= Object.keys(obj_vars).length ;
	var n 		= 0;

	// Verify vars values
	for (var key in obj_vars) {
		//console.log(key, obj_vars[key]);
		if(typeof(obj_vars[key])=='undefined') {
			alert("["+function_name+"] Error : undefined "+key, 'Error');
			//console.log("->test_object_vars: false (one var is undefined)")
			return false;
		}
		++n;
		//console.log("n:"+n+" last:"+last)
		if(n==last) {
			//console.log("->test_object_vars: true (all vars are ok)")
			return true;
		}
	}//for (var key in obj_vars)
}

// GET CALLER FUNCTION NAME. Use as getFunctionName() inside funtion and  return his name
function getFunctionName() {
	var re = /function (.*?)\(/
	var s = getFunctionName.caller.toString();
	var m = re.exec( s )
	return m[1];
}
// GET CURRENT URL VARS
function get_current_url_vars() {
	var vars = {};
	var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
		vars[key] = value;
	});
	return vars;
}
// GET_PARAMETER_VALUE
function get_parameter_value(url, name) {
	name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
	var regexS = "[\\?&]"+name+"=([^&#]*)";
	var regex = new RegExp( regexS );
	var results = regex.exec( url );
	if( results == null ) return "";
	else return results[1];
}
// CHANGE_URL_VARIABLE
function change_url_variable(url, keyString, replaceString) {
	//var query = window.location.search.substring(1);
	var query = url;
	var vars  = query.split("&");
	var len   = vars.length
	for (var i = len - 1; i >= 0; i--) {		
		var pair = vars[i].split("=");
		if (pair[0] == keyString) {
			vars[i] = pair[0] + "=" + replaceString ;
		}
	}
	
	return vars.join("&");
}
// REMOVE_URL_VARIABLE
function remove_url_variable(key, sourceURL) {
    var rtn = sourceURL.split("?")[0],
        param,
        params_arr = [],
        queryString = (sourceURL.indexOf("?") !== -1) ? sourceURL.split("?")[1] : "";
    if (queryString !== "") {
        params_arr 	= queryString.split("&");
        var len 	= params_arr.length
        for (var i = len - 1; i >= 0; i -= 1) {
            param = params_arr[i].split("=")[0];
            if (param === key) {
                params_arr.splice(i, 1);
            }
        }
        rtn = rtn + "?" + params_arr.join("&");
    }
    return rtn;
}
// BUILD_URL_ARGUMENTS_FROM_VARS
function build_url_arguments_from_vars( vars_obj ) {

	var pairs = []
	for (var key in vars_obj) {
		var current_value = vars_obj[key]

		pairs.push( key+'='+current_value )
	}
	
	return pairs.join("&")
}

/**
* CACHED SCRIPT
* Se usa para forzar la recarga de ficheros js desde la cache del navegador
* Por ejemplo si queremos renovar los "handlers" de un componente
*/
jQuery.cachedScript = function(url, options) {

  // allow user to set any option except for dataType, cache, and url
  options = $.extend(options || {}, {
	dataType: "script",
	cache: true,
	url: url
  });

  // Use $.ajax() since it is more flexible than $.getScript
  // Return the jqXHR object so we can chain callbacks
  return jQuery.ajax(options);
};

function includeStyle( url ) {
	document.write( "<link rel='stylesheet' href='" + url + "'>" );
}
function includeScript( url ) {
  document.write( "<script src='" + url + "'></script>" );
}



/**
* tryParseJSON
*/
function tryParseJSON (jsonString){
    try {
        var o = JSON.parse(jsonString);

        // Handle non-exception-throwing cases:
        // Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
        // but... JSON.parse(null) returns 'null', and typeof null === "object",
        // so we must check for that, too.
        if (o && typeof o === "object" && o !== null) {
            return o;
        }
    }
    catch (e) { }

    return false;
}


/**
* TOOGLE_HEIGHT
* Toogle element height from initial to expanded and viceversa
*/
function toogle_height( element, clipped_height ) {

	var real_height 	= element.scrollHeight
	var current_height	= element.offsetHeight

	if (real_height > current_height*3) {
		//element.height = real_height
		$(element).height(real_height)
		element.style.overflow = 'visible'
		element.style.cursor = 'n-resize'
	}else{
		//element.height = clipped_height
		$(element).height(clipped_height)
		element.style.overflow ='hidden'
		element.style.cursor = 's-resize'			
	}
	//console.log(real_height+" - "+current_height);
}


function resizeIframe(obj) {
	obj.style.height = obj.contentWindow.document.body.scrollHeight + 'px';
}



/**
* INSERTANDEXECUTE
* Insert html code as text inside DOM element gived
* Later, exec all script code inside html text
*/
function insertAndExecute(element, content_obj) {
	
	if (content_obj) {
		var text = content_obj.innerHTML
		element.innerHTML = text
	}else{
		console.log("ERROR[insertAndExecute] content_obj is null ")
	}    

 	exec_scripts_inside( element )
}



function exec_scripts_inside( element ) {

	var scripts = Array.prototype.slice.call(element.getElementsByTagName("script"))

    setTimeout(function(){

    	var start 			= new Date().getTime()
	   	var scripts_length 	= scripts.length
	    for (var i = 0; i < scripts_length; i++) {

	    	if (DEBUG) {
				var partial_in = new Date().getTime()
			}

	        if (scripts[i].src !== "") {
	            var tag = document.createElement("script")
	            	tag.src = scripts[i].src
	            document.getElementsByTagName("head")[0].appendChild(tag)
	        }
	        else {
	            //eval(scripts[i].innerHTML);
	            //console.log(scripts[i].innerHTML);

	            // Encapsulate code in a function and execute as well
				var myFunc = new Function(scripts[i].innerHTML)
					myFunc() // Exec
	        }

	        if (DEBUG) {
				var end  	= new Date().getTime()
				var time 	= end - start
				var partial = end - partial_in
				console.log("->insertAndExecute: [done] "+" - script time: " +time+' ms' + ' (partial:'+ partial +')')
			}
	    }

    }, 1)
}


/**
* FIND_ANCESTOR
* For browsers that do not support closest()
*/
function find_ancestor(el, cls) {
    while ((el = el.parentElement) && !el.classList.contains(cls));
    return el;
}



/**
* PROPAGATE_URL_VAR
* This function propagates a url var to all menu links href
* @return bool
*/
propagate_url_var = function( url_var_name, element ) {
	if(!element) return false;
	// Look var url_var_value in current page url
	var url_var_value = get_parameter_value(window.location.href , url_var_name)
	// If exits, add to all menu links
	if ( url_var_value.length>0 ) {
		var element_links = element.getElementsByTagName('a')
		var len = element_links.length
			for (var i = len - 1; i >= 0; i--) {
				// Look for already existing url var url_var_value in link href
				var link_url_var_value = get_parameter_value(element_links[i].href, url_var_name)
					// In not already inserted, add var
					if ( link_url_var_value.length<1 ) {
						element_links[i].href = element_links[i].href + '&' + url_var_name + '=' + url_var_value
					}
			}
		return true
	}
	return false
};//end propagate_url_var



/**
* CALL_CUSTOM_FUNCTION
* Utility to call functions wuth string name and optional array of arguments
* @see ts_object.
*/
function call_custom_function(function_name, function_arguments) {
	
    var objects = function_name.split(".");
    var obj = this;

    var len = objects.length
    for (var i = 0, len; i < len && obj; i++) {
        obj = obj[objects[i]];
    }

    if (typeof obj === "function") {
    	obj.apply( this, function_arguments );
        //obj(arguments);
    }
}//end call_custom_function


/*
Array.prototype.move = function(from, to) {
    this.splice(to, 0, this.splice(from, 1)[0]);
};
*/
Array.prototype.move = function(pos1, pos2) {
    // local variables
    var i, tmp;
    // cast input parameters to integers
    pos1 = parseInt(pos1, 10);
    pos2 = parseInt(pos2, 10);
    // if positions are different and inside array
    if (pos1 !== pos2 && 0 <= pos1 && pos1 <= this.length && 0 <= pos2 && pos2 <= this.length) {
      // save element from position 1
      tmp = this[pos1];
      // move element down and shift other elements up
      if (pos1 < pos2) {
        for (i = pos1; i < pos2; i++) {
          this[i] = this[i + 1];
        }
      }
      // move element up and shift other elements down
      else {
        for (i = pos1; i > pos2; i--) {
          this[i] = this[i - 1];
        }
      }
      // put element from position 1 to destination
      this[pos2] = tmp;
    }
 }


