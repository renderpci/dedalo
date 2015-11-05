// JavaScript Document
$(document).ready(function() {

	switch(page_globals.modo) {
		
		case 'edit':	$(".css_wrap_filter_master").on("change", "input", function(event){
						  	
							component_filter_master.Save(this);								
						});
						break;
	}

});

var component_filter_master = new function() {

	this.save_arguments = {	
							} // End save_arguments

	this.Save = function(component_obj) {

		// Add dato to arguments
		//this.save_arguments.dato = component_filter_master.get_valor();

		//return console.log(this.save_arguments)

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);
	}


	/* DESACTIVO
	this.get_valor = function() {
		var ar_valor = [];
		$('.css_wrap_filter_master').find('.content_data').children('input[type="checkbox"]').each(function() {                                      
	      
			if ($(this).prop("checked")==true) {
				ar_valor.push( parseInt($(this).val()) )
			};
	    });
	    //console.log(ar_valor)
	    return ar_valor
	}//end get_valor
	*/
	

}//end component_filter_master


