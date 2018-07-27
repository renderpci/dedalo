<?php

# CONFIG
	include(dirname(dirname(__FILE__)) . '/config/config.php');



# THEMATIC SEARCH SAMPLE
	# Current dir name
	$cwd = basename(__DIR__);
	include(dirname(__FILE__) .'/class.'. $cwd .'.php');
	$current = new $cwd();



	$options = new stdClass();
		$options->dedalo_get 	= 'thesaurus_root_list';
		$options->lang  	 	= WEB_CURRENT_LANG_CODE;
		$options->tld_exclude  	= array('xx1');
		$options->parents 		= array('hierarchy1_245','hierarchy1_1');		

	# Http request in php to the API
	$data = json_web_data::get_data($options);
	# Data info dev
	#dump($data); #exit();

	#
	# CONTENT HTML
	ob_start();
	include( dirname(__FILE__) . '/html/' . $cwd  . '_content.phtml');
	$content_html = ob_get_clean();
	

	#
	# PAGE HTML
		$page = new page();

		# Add css /js specific files
		page::$css_ar_url[] = __WEB_ROOT_WEB__ . '/'. $cwd . '/css/' . $cwd . '.css';
		page::$js_ar_url[]  = __WEB_ROOT_WEB__ . '/'. $cwd . '/js/' . $cwd . '.js';

		# Load vista template code
		#page::$template_ar_path[] = dirname(__FILE__) . '/html/' . $cwd  . '_content.phtml';		
	
	$options = new stdClass();
		$options->content_html 	= $content_html;		
	echo $page->render_page_html( $options );

	exit();
?>
<!DOCTYPE html>
<html>
<head>
	<title></title>
	<script>
		function load_childrens(button_obj, target_id, ar_childrens) {

			var trigger_vars = {
				dedalo_get  	: 'thesaurus_term',
				code 			: '<?php echo API_WEB_USER_CODE ?>', // Is not good idea send visible code in production				
				lang 			: '<?php echo WEB_CURRENT_LANG_CODE ?>',
				ar_term_id 		: ar_childrens,				
			}
			//console.log(trigger_vars); //return;

			var container = document.getElementById(target_id)
				container.innerHTML = ' Loading... '

			// Http request directly in javascript to the API is possible too..
			get_json_data('<?php echo JSON_TRIGGER_URL ?>', trigger_vars).then(function(response){
					//console.log(response); //return;

					if (!response) {
						// Error

					}else{

						container.innerHTML = ''
						
						// Recreate again (now with javascript) the dom for each term
						// This is a sample only. You can build all DOM elements in javascript or with PHP, etc.. in unified way
						var len = response.result.length
						for (var i = 0; i < len; i++) {

							var ts_term = response.result[i]
								//console.log(ts_term);

							var term_div = document.createElement("div")
								term_div.innerHTML = "- <strong>Term:</strong> " + ts_term.term + " <em> ["+ts_term.term_id +"]</em> "
								container.appendChild(term_div)
							
							// Childrens
							if (ts_term.ar_childrens.length > 0) {

								let container_id = "ts_container_" + ts_term.term_id
								let ar_childrens = ts_term.ar_childrens

								var a = document.createElement("a")
									a.href="javascript:void(0)"
									a.appendChild( document.createTextNode("Load childrens") )
									a.addEventListener("click",function(e){
										load_childrens(this, container_id, ar_childrens)
									},false)
								term_div.appendChild(a)

								var sub_container = document.createElement("div")
									sub_container.id = container_id
									sub_container.style.paddingLeft = '20px'
								term_div.appendChild(sub_container)
							}
							
							// Indexations
							var indexations = JSON.parse(ts_term.indexation)
							if (indexations.length>0) {

								let container_id   = "index_container_" + ts_term.term_id							
								let ar_indexations = indexations
								let term_id 	   = ts_term.term_id

								let a = document.createElement("a")
									a.href="javascript:void(0)"
									a.appendChild( document.createTextNode("Load indexations") )
									a.addEventListener("click",function(e){
										load_indexations(this, container_id, ar_indexations, term_id)
									},false)
								term_div.appendChild(a)

								let sub_container = document.createElement("div")
									sub_container.id = container_id
									sub_container.style.paddingLeft = '20px'
								term_div.appendChild(sub_container)
							}						
						}
					}
			})
		}//end get_json_data
		
		function load_indexations(button_obj, target_id, ar_indexations, term_id) {
			//console.log("ar_indexations: ", JSON.stringify(ar_indexations) );

			var trigger_vars = {
				dedalo_get  	: 'thesaurus_indexation_node',
				code 			: '<?php echo API_WEB_USER_CODE ?>', // Is not good idea send visible code in production				
				lang 			: '<?php echo WEB_CURRENT_LANG_CODE ?>',
				term_id 		: term_id,
				ar_locators 	: JSON.stringify(ar_indexations),
			}
			//console.log(trigger_vars); //return;

			var container = document.getElementById(target_id)
				container.innerHTML = "Loading.."
			

			// Http request directly in javascript to the API is possible too..
			get_json_data('<?php echo JSON_TRIGGER_URL ?>', trigger_vars).then(function(response){
				console.log("load_indexations response ", response);
				
				container.innerHTML = ""

				// Create video container
				let video_container_id = "video_container_" + term_id		

				var ar_interview_id = []
				var len = response.result.length
				
				for (var i = 0; i < len; i++) {
					var node 	= response.result[i]
					if (ar_interview_id.indexOf(node.node_id) === -1) {

						let ar_locators = ar_indexations

						let img = document.createElement("img")
							img.src = '<?php echo __WEB_BASE_URL__ ?>' + node.image_url
							img.style.height = "60px"
							img.dataset.term_id = term_id
							img.dataset.ar_indexations = ar_indexations						
							img.addEventListener("click",function(e){
								load_video_data(video_container_id, term_id, ar_locators, 0)
							},false)
							container.appendChild(img)

						ar_interview_id.push(node.node_id)
					}								
				}//end for (var i = 0; i < len; i++)

				var video_container = document.createElement("div")
					video_container.id = video_container_id
					container.appendChild(video_container)	
			})
		}//end load_indexations

		function load_video_data(video_container_id, term_id, ar_locators, ar_locators_key) {			

			var trigger_vars = {
				dedalo_get  	: 'thesaurus_video_view_data',
				code 			: '<?php echo API_WEB_USER_CODE ?>', // Is not good idea send visible code in production				
				lang 			: '<?php echo WEB_CURRENT_LANG_CODE ?>',
				term_id 		: term_id,
				ar_locators 	: JSON.stringify(ar_locators),
				ar_locators_key : ar_locators_key
			}
			console.log("load_video_data trigger_vars",trigger_vars); //return;

			var video_container = document.getElementById(video_container_id)
				video_container.style.paddingTop = "15px"
				video_container.style.paddingBottom = "20px"
				video_container.innerHTML = ' Loading... '


			// Http request 
			get_json_data('<?php echo JSON_TRIGGER_URL ?>', trigger_vars).then(function(response){
				 console.log("load_video_data response:" , response);
					
					if (!response || typeof response.result=="undefined") {
						video_container.innerHTML = "<h4>Ops.. empty received data for API call with vars: <pre>"+ JSON.stringify(trigger_vars, null, 2)+"</pre></h4>"; return false
					}

					video_container.innerHTML = '<h4>Video player</h4>'
					var video = document.createElement("video")
						video.controls 	= true
						video.height 	= 404 
						video.src 		= '<?php echo __WEB_BASE_URL__ ?>' + response.fragments[0].video_url
						video.poster 	= '<?php echo __WEB_BASE_URL__ ?>' + response.image_url
					video_container.appendChild(video)
					// Build extended fragment text and instert into video_container div
					var fragment_text = document.createElement("div")
						fragment_text.innerHTML = '<h4>Fragment</h4>' +response.fragments[0].fragm
					video_container.appendChild(fragment_text)
			})			
		}

		function get_json_data(trigger_url, trigger_vars) {
			
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
	</script>
</head>
