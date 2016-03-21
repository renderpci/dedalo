// JavaScript Document
document.write('<scr'+'ipt src="'+DEDALO_LIB_BASE_URL+'/common/js/cookies.js" type="text/javascript"></scr'+'ipt>');
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
	*/
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
	/*
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






};//end common class





/**
* ALERT : ALERT OVERRIDE STANDAR JAVASCRIPT ALERT
*/
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
}
/**
* CONFIRM :  CONFIRM OVERRIDE STANDAR JAVASCRIPT ALERT
*/
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
				/*	
				// Callback optional
				if (callback && typeof(callback) === "function") {  
					return callback();
				}	
				*/
				dfd.resolve('Success!'); 
				$(this).dialog("close");      
			},
			"Cancel": function () {		        	
				/*
				// Callback optional
				if (callback && typeof(callback) === "function") {  
					callback(false);
				}
				*/
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
	var vars = query.split("&");
	for (var i = 0; i < vars.length; i++) {
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
        params_arr = queryString.split("&");
        for (var i = params_arr.length - 1; i >= 0; i -= 1) {
            param = params_arr[i].split("=")[0];
            if (param === key) {
                params_arr.splice(i, 1);
            }
        }
        rtn = rtn + "?" + params_arr.join("&");
    }
    return rtn;
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
};


/**
* TOOGLE_HEIGHT
* Toogle element height from initial to expanded and viceversa
*/
function toogle_height( element, clipped_height ) {
	
	var real_height 	= element.scrollHeight,
		current_height	= element.offsetHeight
	
	if (real_height>current_height) {
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

	console.log(real_height+" - "+current_height);
}

