'use strict';



var properties_editor = {
	

	/**
	* RESOLVE_TIPO
	* @return promise
	*/
	resolve_tipo : function(tipo) {
		
		return new Promise(function(resolve){
			
			const result = "["+tipo+"] section: Oral History, Inmaterial, Archive"

			resolve(result)
		})
	},//end resolve_tipo



}//end properties_editor