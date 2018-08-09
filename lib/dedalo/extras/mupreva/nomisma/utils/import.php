<?php
/* 

UNUSSED


*/
die();


require_once( dirname(dirname(dirname(dirname(dirname(__FILE__))))).'/config/config4.php');




?>
<script type="text/javascript">
	

/**
* COMPONENT COMMON CLASS
*/
var import_nomisma = new function() {


	var secuence = 


	/**
	* LOAD_COMPONENT_BY_WRAPPER_ID
	*/
	this.import_record = function (callback) {	
		

		var mydata	= { 
						'mode'					: 'load_component_by_ajax',
						'tipo'					: tipo,
						'modo'					: modo,
						'parent'				: parent					
					  }	
					  //return console.log(mydata);
		
				
		//html_page.loading_content( wrapper_obj, 1 );
		
		var jsPromise = Promise.resolve(

			// AJAX REQUEST
			$.ajax({
				url		: this.url_trigger,
				data	: mydata,
				type 	: "POST"
			})
			// DONE
			.done(function(received_data) {

				
			})
			// FAIL ERROR 
			.fail(function(error_data) {
				
			})
			// ALWAYS
			.always(function() {
				
			})

		)//end promise


		return jsPromise;		

	}// end this.load_component_by_wrapper_id


</script>