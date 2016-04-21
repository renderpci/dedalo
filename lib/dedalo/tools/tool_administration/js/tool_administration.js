





var tool_administration = new function() {


	$(function(){
		$('.panel-heading').on('click',function(){
			tool_administration.toggle_content(this)
		})
		tool_administration.get_active_users();
	})

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_administration/trigger.tool_administration.php' ;
	this.tid; 

	this.force_unlock_all_components = function(button_obj) {

		var mydata = {	'mode': 'force_unlock_all_components',
					 };
					//return console.log(mydata)		

		var wrap_div = document.getElementById('force_unlock_all_components_response');
		html_page.loading_content( wrap_div, 1 );


		// AJAX REQUEST
		$.ajax({
			url		: tool_administration.url_trigger ,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// DEBUG CONSOLE Console log
			//if (DEBUG) console.log(received_data); 

			var received_data_obj = null;
			try {
				received_data_obj = JSON.parse(received_data)
			} catch (e) {
				console.log(e);
				if (DEBUG) console.log(received_data);
				return false;
			}
			//console.log(received_data_obj);

			wrap_div.innerHTML = "<pre>"+JSON.stringify(received_data_obj, null, 2)+"</pre>";
			
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on force_unlock_all_components: " + error_data + " (Ajax error)</span>";
			alert(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	}//end force_unlock_all_components



	this.get_active_users = function( ) {

		var mydata = {	'mode': 'get_active_users',
					 };
					//return console.log(mydata)		

		var wrap_div = document.getElementById('active_users');
		//html_page.loading_content( wrap_div, 1 );


		// AJAX REQUEST
		$.ajax({
			url		: tool_administration.url_trigger ,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// DEBUG CONSOLE Console log
			//if (DEBUG) console.log(received_data); 

			var received_data_obj = null;
			try {
				received_data_obj = JSON.parse(received_data)

				wrap_div.innerHTML = "<pre>"+JSON.stringify(received_data_obj, null, 2)+"</pre>";

				clearTimeout(tool_administration.tid);
				tool_administration.tid = setTimeout(function() {
					tool_administration.get_active_users();
				}, 3000)

			} catch (e) {
				console.log(e);
				if (DEBUG) console.log(received_data);
				return false;
			}
			//console.log(received_data_obj);
			
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on get_active_users: " + error_data + " (Ajax error)</span>";
			alert(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 );
		})

	};//end get_active_users



	this.build_structure_css = function() {

		var mydata = {	'mode': 'build_structure_css',
					 };
					//return console.log(mydata)		

		var wrap_div = document.getElementById('build_structure_css_response');
		html_page.loading_content( wrap_div, 1 );


		// AJAX REQUEST
		$.ajax({
			url		: tool_administration.url_trigger ,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// DEBUG CONSOLE Console log
			//if (DEBUG) console.log(received_data); 

			var received_data_obj = null;
			try {
				received_data_obj = JSON.parse(received_data)
			} catch (e) {
				console.log(e);
				if (DEBUG) console.log(received_data);
				return false;
			}
			//console.log(received_data_obj);

			wrap_div.innerHTML = "<pre>"+JSON.stringify(received_data_obj, null, 2)+"</pre>";
			
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on build_structure_css: " + error_data + " (Ajax error)</span>";
			alert(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})
	};	
	

	this.toggle_content = function(panel_heading_obj) {
		$(panel_heading_obj).next('.panel-body').toggle(100);
	};


	this.update_structure = function() {
		if( confirm('\!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\
					\n!!!!!!!!!!!!!!!!!! DELETING ACTUAL DATABASE !!!!!!!!!!!!!!!!\
					\n\nAre you sure to IMPORT and overwrite current structure data with LOCAL FILE \
					\n \"dedalo4_development_str.custom.backup\" ?\n\
			')){ 
			//window.open(DEDALO_LIB_BASE_URL + "/backup/trigger.db_utils.php?action=import",'Export','width=710,height=600')

			var mydata = {	'mode': 'update_structure',
						 };
						//return console.log(mydata)		

			var wrap_div = document.getElementById('update_structure_response');
				wrap_div.innerHTML = "<br>  Loading... <br><br>";
			html_page.loading_content( wrap_div, 1 );


			// AJAX REQUEST
			$.ajax({
				url		: tool_administration.url_trigger ,
				data	: mydata ,
				type 	: "POST"
			})
			// DONE
			.done(function(received_data) {

				// DEBUG CONSOLE Console log
				//if (DEBUG) console.log(received_data); 

				var received_data_obj = null;
				try {
					received_data_obj = JSON.parse(received_data)
				} catch (e) {
					console.log(e);
					if (DEBUG) console.log(received_data);
					return false;
				}
				//console.log(received_data_obj);

				wrap_div.innerHTML = "<div>"+received_data_obj.msg+"</div>";
				
			})
			// FAIL ERROR 
			.fail(function(error_data) {
				// Notify to log messages in top of page
				var msg = "<span class='error'>ERROR: on update_structure: " + error_data + " (Ajax error)</span>";
				alert(msg);
				if (DEBUG) console.log(error_data);	
			})
			// ALWAYS
			.always(function() {
				html_page.loading_content( wrap_div, 0 );
			})
		}
	}

};//end tool_administration

