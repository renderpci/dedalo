// JavaScript Document
$(document).ready(function() {	
	
	switch(page_globals.modo) {
					
	}
	var is_tool = page_globals.modo.indexOf('tool_');
	if( is_tool!=-1 )	{
		$(".css_wrap_state").on('change', "input:checkbox", function() {
			component_state.Save(this);								
		});
	}

});


var component_state = new function() {	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		var checked = $(component_obj).prop('checked'),
			valor 	= $(component_obj).val(),
			dato 	= $(component_obj).data('dato'),
			caller_component_tipo 	= $(component_obj).data('caller_component_tipo');

			//console.log( $(dato).length)
			//console.log( dato )

			if(checked==true) {

				//$dato_example = array(
				//			'dd15' => array('tool_transcription','tool_indexation','lg-spa'),
				//			'dd17' => array('tool_transcription','tool_indexation')
				//			);
				
				var dato2 = dato;
				$.each( dato2, function( key, ar_value ) {
					//console.log( key + ": " + ar_value + ' ' +caller_component_tipo + ' ' + typeof ar_value );
					if(key==caller_component_tipo) {
						var index = ar_value.indexOf(valor);					
						if(index == -1) {
							ar_value.push(valor);
						}			
					}
				});					
				//console.log( dato2 )				
			
			}else{
				
				var dato2 = dato;
				$.each( dato2, function( key, ar_value ) {
					//console.log( key + ": " + ar_value + ' ' +caller_component_tipo + ' ' + typeof ar_value );
					if(key==caller_component_tipo) {
						var index = ar_value.indexOf(valor);					
						if(index > -1) {							
							ar_value.splice(index,1);							
						}			
					}
				});					
				//console.log( dato2 )								
			}

		// On send 'dato' as argument, overwrite default common_get_dato
		this.save_arguments = {	"dato" 	: dato2 ,
								} // End save_arguments

		console.log('save_arguments: ' +this.save_arguments);

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

	}

}//end component_state

