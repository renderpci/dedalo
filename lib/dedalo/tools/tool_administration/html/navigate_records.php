<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');
/**
* NAVIGATE RECORDS
*
*/

// VARS
	$section_tipo = isset($_GET['section_tipo']) ? trim($_GET['section_tipo']) : false;

// section_tipo check validation
	if (!$section_tipo) {
		?>
		<form onSubmit="return reload_with_section()">
			Section tipo is mandatory:			
			<input type="text" id="section_tipo" placeholder=" section tipo like oh1">			
			<script type="text/javascript">
				reload_with_section = function(){

					const section_tipo   = document.getElementById("section_tipo").value
					if (section_tipo.length>2) {
						window.location.href = '?section_tipo=' + section_tipo
					}

					return false;
				}
			</script>
			</form> 
		<?php
		exit();
	}

// Get all rows of current section
	$search_query_object = '
	{
		"section_tipo": "'.$section_tipo.'",
		"limit": 0,	    
		"filter": {},
		"select": []
	}
	';
	$search_query_object = json_decode($search_query_object);

	$search_development2 = new search_development2($search_query_object);
	$search_result 		 = $search_development2->search();
		#dump($search_result, ' search_result ++ '.to_string());
	$ar_section_id = array_map(function($item){
		return $item->section_id;
	}, $search_result->ar_records);
		#dump($ar_section_id, ' ar_section_id ++ '.to_string());
?>
<!DOCTYPE html>
<html>
<head>
	<title></title>
	<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm" crossorigin="anonymous">
	<style type="text/css">
		.container {			
			width: 100%;
			max-width: unset;
		}
		section {
			padding: 0.5em;			
			height: 46px;
			overflow: hidden;
		}
		h3 {
			display: inline-block;
    		vertical-align: top;
    		padding-right: 0.5em;
		}
		#iframe {
			width: 100%;
			border: none;
			background-color: #a9d0c2;
			height: 94.1vh;
			border-radius: 3px;
		}
		#current_id_info {
			padding-left: 5px;
			color: #9B9B9B;
		}
		#remaining_info {
			float: right;
			color: #9B9B9B;
			padding: 1px;
		}
		#offset, #delay_ms {
			width: 70px;
			text-align: center;
		}
	</style>
	<script type="text/javascript">		
		
		const ar_records 		= <?php echo json_encode($ar_section_id) ?>;
		const n_records			= ar_records.length;
		const section_tipo 		= '<?php echo $section_tipo ?>';
		const url_base 			= '<?php echo DEDALO_LIB_BASE_URL ?>' + '/main/';		
		var current_key 		= 0;
		var enable_navigation   = true;
		
		const get_time_to_end = function(load_time) {

			let n_to_load 		= n_records - (parseInt(offset.value)+1)
			let delay_ms_vale	= parseInt(delay_ms.value)
			let resto 			= Math.round((n_to_load*(load_time + delay_ms_vale)) / 1000) 
			let remaining_time 	= ''

			//console.log("resto n_to_load:", n_to_load, "- load_time:",load_time, '- secs', resto);
		
			switch(true){
				case resto>3600: 
					remaining_time = Math.round(resto / 3600) + " hour"
					break;
				case resto>60: 
					remaining_time = Math.round(resto / 60) + " min"
					break;
				default:
					remaining_time = resto + " secs"
			}
			//console.log("load_time:",load_time, " resto", resto, " remaining_time",remaining_time);

			const remaining_info = document.getElementById("remaining_info")
				  remaining_info.innerHTML = " Remaining aprox.: " + remaining_time

			return remaining_time
		}

		const navigate_record = function(){

			if (enable_navigation!==true) {
				return false;
			}

			const timerStart = Date.now();

			let current_key = parseInt(offset.value)

			const target_iframe = document.getElementById("iframe")
			const section_id 	= ar_records[current_key]
			const url 	 		= url_base + '?t=' + section_tipo + '&id=' + section_id

			// current_id_info				
				current_id_info.innerHTML = " Loading " + (current_key +1) + ' of ' + n_records
		
			// event load
				target_iframe.onload = function() {

					const next_key = (current_key + 1) // (current_key + 1)

					if (next_key>=n_records) {
						
						// Finished loop
							console.log("Loop ended at " + current_key);
							alert("Loop ended at " + current_key);
							return false;
					
					}else{

						// current_id_info
							current_id_info.innerHTML = " Loaded " + (current_key +1) + ' of ' + n_records

						current_key++;

						// Callback 
						setTimeout(function(){
							navigate_record(next_key)
						}, parseInt(delay_ms.value))

						const load_time = Date.now()-timerStart
						get_time_to_end(load_time)

						// Update offset						
							offset.value = current_key
					}
				}

			// Load
				target_iframe.src = url

			return true
		}

		const stop = function(){
			
			enable_navigation = false
		}

		window.onload = function(){
			
			const current_id_info = document.getElementById("current_id_info")
				  current_id_info.innerHTML = "Total: " + n_records
			
			// Load first record as sample
			document.getElementById("iframe").src = url_base + '?t=' + section_tipo + '&id=' + ar_records[0]

			const offset 	= document.getElementById("offset")
			const delay_ms 	= document.getElementById("delay_ms")
		}
	</script>
</head>
<body>
	<div class="container">
	<section>
	<h3>Navigate records <?php echo $section_tipo ?></h3>
	<!-- <input type="text" name="section_tipo" placeholder=" section tipo like oh1">	-->
	Offset <input type="text" id="offset" value="0">
	Delay ms <input type="text" id="delay_ms" value="1000">
	<button type="button" class="btn btn-primary btn-sm" id="button_navigate_record" onclick="enable_navigation=true;navigate_record()">Start</button>
	<button type="button" class="btn btn-secondary btn-sm" onclick="stop()">Stop</button>
	
	<span id="current_id_info"></span>
	<span id="remaining_info"></span>
	</section>
	<iframe id="iframe" src=""></iframe>
	</div>
</body>
</html>