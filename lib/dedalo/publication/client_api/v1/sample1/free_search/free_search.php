<?php
/*
	This a very simple an basic sample of Dédalo web API used for learning.
	Security has not been taken into account to simplify the examples.
	Please do not use it in production sites without taking care about security issues.
	Thanks and enjoy
*/
	
# CONFIG
	include(dirname(dirname(__FILE__)) . '/config/config.php');	


# FREE SEARCH SAMPLE

	# String search
	$q_raw = !empty($_REQUEST['q']) ? $_REQUEST['q'] : '';
	# Number of records per page (for paginate)
	$nregpp = isset($_REQUEST['nregpp']) ? $_REQUEST['nregpp'] : 10;	

	# Search	
	$options = new stdClass();
		$options->dedalo_get 		= 'free_search';
		$options->q 				= (string)($q_raw);
		$options->search_mode 		= 'full_text_search';
		$options->lang 				= WEB_CURRENT_LANG_CODE;
		$options->rows_per_page 	= (int)$nregpp;
		$options->page_number 		= isset($_GET['page']) ? (int)$_GET['page'] : 1;
		$options->offset 			= isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
		$options->count 			= true;
		$options->image_type 		= 'posterframe';
		$options->apperances_limit 	= 1;
		$options->video_fragment 	= false;
		$options->list_fragment 	= true;
		$options->fragment_terms 	= false;

	# Http request in php to the API
	$data = json_web_data::get_data($options);
	# Data info dev
	#print "<pre>";print_r($data);print "</pre>";
?>
<!DOCTYPE html>
<html>
<head>
	<title></title>
	
	<script>
		function load_video(button_obj, target_id, section_id, match) {

			var trigger_vars = {
				dedalo_get  	: "free_search",
				code 			: '<?php echo API_WEB_USER_CODE ?>', // Is not good idea send visible code in production
				q 				: '<?php echo $options->q ?>',
				search_mode 	: '<?php echo $options->search_mode ?>',
				lang 			: '<?php echo WEB_CURRENT_LANG_CODE ?>',
				filter 			: 'section_id = ' + section_id,
				//match_select 	: match,
				list_fragment 	: false,
				video_fragment 	: true,
				fragment_terms 	: true,
				image_type 		: 'posterframe'
			}
			//console.log(trigger_vars);

			var video_container = document.getElementById(target_id)
				video_container.style.paddingTop = "15px"
				video_container.style.paddingBottom = "20px"
				video_container.innerHTML = ' Loading... '

			// Http request directly in javascript to the API is possible too..
			get_json_data('<?php echo JSON_TRIGGER_URL ?>', trigger_vars).then(function(response){
					console.log("load_video response:" , response);
				
					// Build video html and instert into video_container div
					video_container.innerHTML = '<h4>Video player</h4><br>'
					var video = document.createElement("video")
						video.controls 	= true
						video.height 	= 404 
						video.src 		= '<?php echo __WEB_BASE_URL__ ?>' + response.result[0].fragments[0].video_url
						video.poster 	= '<?php echo __WEB_BASE_URL__ ?>' + response.result[0].image_url
					video_container.appendChild(video)
					// Build extended fragment text and instert into video_container div
					var fragment_text = document.createElement("div")
						fragment_text.innerHTML = '<h4>Fragment</h4>' + response.result[0].fragments[0].fragm
					video_container.appendChild(fragment_text)
			})
		}//end load_video
		


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
<body>
	<h1><?php print_r($_SERVER['SERVER_NAME']); ?></h1>

	<form>
		<h2>Free</h2> <input type="text" name="q" value="<?php echo $options->q ?>"><input type="submit" value="Search">
	</form>

	<?php if (empty($data->result) && empty($options->q)) { ?>
		<h3>Enter word to search</h3>
	<?php }elseif (empty($data->result)) { ?>
		<h3>Sorry. Nothing found for: <?php echo $options->q ?></h3>
	<?php } ?>	

	<?php foreach ($data->result as $key => $row) { ?>		
		
		<div><hr>Interview</div>
		<div><strong>Code:</strong> <?php echo $row->code ?></div>

		<div><hr>Image</div>
		<?php foreach ($row->image as $av_key => $image_obj) { ?>
			<img src="<?php echo __WEB_BASE_URL__ . $image_obj->image ?>" height="120" />
		<?php } ?>

		<div><hr>Informant</div>
		<?php foreach ($row->informant as $av_key => $inf_column) { ?>
			<div><strong>Name:</strong> <?php echo $inf_column->name ?></div>
			<div><strong>Surname:</strong> <?php echo $inf_column->surname ?></div>
			<div><strong>Birthdate:</strong> <?php echo $inf_column->birthdate ?></div>
		<?php } ?>

		<div><hr>Transcription fragment</div>
		<?php foreach ($row->fragments as $match => $fragment_obj) { ?>
			<div><strong>Text:</strong> <br><?php echo substr($fragment_obj->list_fragment, 0, 856) . '..' ?></div>
			<input type="button" value="load video" onclick="load_video(this, '<?php echo "av_container_".$key ?>', '<?php echo $row->av_section_id ?>', '<?php echo $match ?>')">
		<?php } ?>		

		<hr>
		<div id="<?php echo "av_container_".$key ?>">
			<!-- ajax load video html here -->
		</div>

		<br>
	<?php } ?> 
</body>
</html>