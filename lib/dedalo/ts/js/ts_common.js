// JavaScript Document

/*******************************
* OTRAS FUNCIONES GENERALES
*******************************/

/*
* GETVALUE : Recoge el valor GET dado al pasarle el nombre de la variable.
* Si no hay variable, devuelve 'null'
*/
function getValue(name) {
	var resultado ;
	try{
		name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
		var regexS = "[\\?&]"+name+"=([^&#]*)";
		var regex = new RegExp( regexS );
		var results = regex.exec( window.location.href );
		if( results == null )
			resultado = null ;
		else
			resultado = results[1];
	}catch(e){	 
		alert(e)
	}
	
	return resultado ;
}


/**
* ISARRAY
*/
function isArray(obj) {
	return obj.constructor == Array;
}


