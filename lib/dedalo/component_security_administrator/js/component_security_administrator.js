





var component_security_administrator = new function() {


	this.save_arguments = {}
	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		var int_value = component_obj.checked ? 1 : 0;

		this.save_arguments.dato = int_value;

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

		jsPromise.then(function(response) {		  	
		  	component_security_administrator.update_filter_master_view( int_value );
		}, function(xhrObj) {
		  	//console.log(xhrObj);
		});

	};//end Save



	/**
	* UPDATE_FILTER_MASTER_VIEW
	*/
	this.update_filter_master_view = function( int_value ) {

		// Hide / show projects
		var wrap_filter_master = document.getElementsByClassName("css_wrap_filter_master");
		

		if (int_value==1) {			
			if (wrap_filter_master[0]) {
				wrap_filter_master[0].classList.add('css_wrap_filter_master_unactive')  
			}
		}else{
			if (wrap_filter_master[0]) {
				wrap_filter_master[0].classList.remove('css_wrap_filter_master_unactive')  
			}
		}

	};//end update_filter_master_view


}//end component_security_administrator