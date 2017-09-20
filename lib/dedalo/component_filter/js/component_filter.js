/**
* COMPONENT_FILTER
*
*
*
*/
var component_filter = new function() {
	

	this.component_filter_objects = {}
	this.save_arguments = {}
	
	
	switch(page_globals.modo) {
		case 'tool_time_machine' :
		case 'edit' :
			$(function() {
				component_filter.check_filter_state();
			});
			break;
	}

	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		var dato = this.get_dato(component_obj)

		this.save_arguments = {
				dato : JSON.stringify(dato)
				//'callback' : component_filter.check_filter_state
			}
		
		
		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments).then(function(response) {
		  	
			// check_filter_state
		  	component_filter.check_filter_state();
		
		}, function(xhrObj) {
		  	console.log("xhrObj",xhrObj);
		});

	};//end Save



	/**
	* GET_DATO
	* @return 
	*/
	this.get_dato = function(obj) {		
		
		var name		= $(obj).attr('name');
		var ar_checkbox	= new Object();

		var ar_values	= $('[name="'+name+'"]:checked, [name="'+name+'"]:indeterminate').map(function() {

		   if( $(this).val() ) {

				// INDETERMINATE : Añadimos ':1' que será 'solo lectura' en admin_access
				if($(this).prop('indeterminate')==true) {
					//return String( $(this).val() +':1' );
					var estado = '1';

				// CHECKED : Añadimos ':2' que será 'lectura-escritura' en admin_access
				}else if($(this).prop('checked')===true) {
					//return String( $(this).val() +':2' );
					var estado = 2;

				// UNCHECKED
				}else{
					//var estado = 0;
				}
				var tipo 			= $(this).val();
				ar_checkbox[tipo] 	= parseInt(estado);
		   }

		 }).get();

		dato = ar_checkbox

		if(SHOW_DEBUG===true) {
			//console.log("[component_filter.get_dato] dato: ",dato)
		}

		return dato
	};//end get_dato



	/**
	* GET_FILTER_CHECKED_VALUE
	* Get checked values
	*/
	this.get_filter_checked_values = function() {
		//console.log($(component_obj).val())
		//console.log(document.querySelector('.filter_checkbox:checked').value)
		var checked_values 	= []; 
		var inputElements 	= document.getElementsByClassName('filter_checkbox');	//console.log(inputElements.length)

		// If not exists 'inputElements' we are in read onl mode. Return 1 to avoid add class 'filter_without_selection'
		if (inputElements.length==0) return 1;

		var len = inputElements.length;
		for (var i = len - 1; i >= 0; i--) {
		      if(inputElements[i].checked){
		      	var val = inputElements[i].value;
				checked_values.push(val) ;	//console.log(checked_values+" i:"+i)	
		        //break; 
		      }
		}
		//console.log(checked_values)
		return checked_values;
	};



	/**
	* CHECK_FILTER_STATE
	*/
	this.check_filter_state = function() {
		setTimeout(function() {
			var checked_values = component_filter.get_filter_checked_values();
			if (checked_values.length<1) {
				//console.log("adding style")
				$('.css_wrap_filter').addClass('filter_without_selection')
			}else{
				//console.log("removing style")
				$('.css_wrap_filter').removeClass('filter_without_selection')
			}
		}, 10)
		
	}



}//end component_filter