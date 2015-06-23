// JavaScript Document
/*
*	Cockies javascript -----------------------------------------
*/
function createCookie(name,value,days)
{	
	if (typeof(localStorage) === 'undefined' ) {
		//alert('Your browser does not support HTML5 localStorage. Try upgrading.');
		document.cookie = name+"="+value ;
	}else{
		try {
			return localStorage.setItem(name, value); //saves to the database, "key", "value"
		}catch (e) {
			 if (e === QUOTA_EXCEEDED_ERR) {
				 alert('Quota exceeded!'); //data wasn't successfully saved due to quota exceed so throw an error
			}
		}
	}
}

function readCookie(name)
{
	if (typeof(localStorage) === 'undefined' ) {
		//alert('Your browser does not support HTML5 localStorage. Try upgrading.');
		var nameEQ = name + "=";
		var ca = document.cookie.split(';');
		for(var i=0;i < ca.length;i++) {
			var c = ca[i];
			while (c.charAt(0)==' ') c = c.substring(1,c.length);
			if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length,c.length);
		}
		return null;

	}else{
		try {
			return localStorage.getItem(name); //saves to the database, "key", "value"
		}catch (e) {
			alert('get_localStorage error: ' + e); //data wasn't successfully readed and so throw an error			
		}
	}
}

function eraseCookie(name)
{
	if (typeof(localStorage) === 'undefined' ) {
		//alert('Your browser does not support HTML5 localStorage. Try upgrading.');
		createCookie(name,"",-1);
	}else{
		try {
			return localStorage.removeItem(name); //saves to the database, "key", "value"
		}catch (e) {
			alert('remove_localStorage error: ' + e); //data wasn't successfully readed and so throw an error			
		}
	}
}



// LOCAL STORAGE FUNCTIONS
//localStorage.getItem(tab_id);
//localStorage.removeItem(tab_id);
//localStorage.setItem(tab_id, 1);

function set_localStorage(name,value) {
	
	if (typeof(localStorage) === 'undefined' ) {
		alert('Your browser does not support HTML5 localStorage. Try upgrading.');
	}else{
		try {
			return localStorage.setItem(name, value); //saves to the database, "key", "value"
		}catch (e) {
			 if (e === QUOTA_EXCEEDED_ERR) {
				 alert('Quota exceeded!'); //data wasn't successfully saved due to quota exceed so throw an error
			}
		}
	}
}

function get_localStorage(name) {
	
	if (typeof(localStorage) === 'undefined' ) {
		alert('Your browser does not support HTML5 localStorage. Try upgrading.');
	}else{
		try {
			return localStorage.getItem(name); //saves to the database, "key", "value"
		}catch (e) {
			alert('get_localStorage error: ' + e); //data wasn't successfully readed and so throw an error			
		}
	}
	 
}

function remove_localStorage(name) {
	
	if (typeof(localStorage) === 'undefined' ) {
		alert('Your browser does not support HTML5 localStorage. Try upgrading.');
	}else{
		try {
			return localStorage.removeItem(name); //saves to the database, "key", "value"
		}catch (e) {
			alert('remove_localStorage error: ' + e); //data wasn't successfully readed and so throw an error			
		}
	}
	
}


// Elimina las cookes que empiezan por ..  (component_autocomplete_ts)
function remove_localStorage_begins(name) {
	Object.keys(localStorage).forEach(function(key){
		//console.log( key + ' - '+ localStorage.getItem(key) );
		var regex_ = '/^('+name+')/';
		if (/^(component_autocomplete_ts)/.test(key)) {
			localStorage.removeItem(key);
			if (DEBUG) console.log("->Deleted localStorage: "+ key);
		}
	});
}
function clear_some_local_storage(startsWith) {
    var myLength = startsWith.length;

    Object.keys(localStorage) 
        .forEach(function(key){
        	//console.log( key + ' - '+ localStorage.getItem(key) );
            if (key.substring(0,myLength) == startsWith) {
                localStorage.removeItem(key);
                //if (DEBUG) 
                	console.log("->Deleted localStorage: "+ key);
            } 
	}); 
}


