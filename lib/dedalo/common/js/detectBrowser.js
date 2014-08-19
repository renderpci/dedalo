// JavaScript Document

/*
* Detect Bwoser and version
*/
function detectBrowser(info)
{
	var msj 		= false ;
	var result		= false ;
	var navVersion	= false ;
	var url			= '../lib/updateBrowser/';
	

	//alert(navigator.userAgent)
	
	// Firefox < 3.1
	if (navigator.userAgent.indexOf('Firefox') != -1)
	{
		var result = /Firefox\/([\d.]+)/.exec(navigator.userAgent);		//alert(result)
		if (result) {
			var navVersion = parseFloat(result[1]);
			if(navVersion<10){
				var msj = '¡ Atención ! \n\n Esta versión de Firefox está obsoleta ('+ navVersion + '). \n\n Actualice su navegador a una versión más moderna para visualizar correctamente esta página.' ;
			}
		}	  
	}	
	// Internet Explorer < 8	
	if (navigator.userAgent.indexOf('MSIE') != -1)
	{		
		var result = /MSIE ([\d.]+)/.exec(navigator.userAgent);
		if (result) {
			var navVersion = parseFloat(result[1]);
			if(navVersion<8){
				var msj = '¡ Atención ! \n\n Esta versión de Internet Explorer está obsoleta. \n\n Actualice su navegador a una versión más moderna para visualizar correctamente esta página.' ;
			}
		}
	}		
	// Chrome < 5
	if (navigator.userAgent.indexOf('Chrome') != -1)
	{
		var result = /Chrome\/([\d.]+)/.exec(navigator.userAgent);
		if (result) {
			var navVersion = parseFloat(result[1]);
			if(navVersion<8) msj = "La versión de su navegador (Chrome) es muy antigua. \n\n Por favor, actualice su navegador para visualizar correctamente esta página.";
		}
	}
	// Webkit < 525
	if (navigator.userAgent.indexOf('AppleWebKit') != -1)
	{
		var result = /AppleWebKit\/([\d.]+)/.exec(navigator.userAgent);
		if (result) {
			var navVersion = parseFloat(result[1]);
			if(navVersion<525) msj = "La versión de su navegador (Webkit) es muy antigua. \n\n Por favor, actualice su navegador para visualizar correctamente esta página.";
		}
	}	
	// Opera < 9.8
	if (navigator.userAgent.indexOf('Opera') != -1)
	{
		var result = /Opera\/([\d.]+)/.exec(navigator.userAgent); //alert(result)
		if (result) {
			var navVersion = parseFloat(result[1]);
			if(navVersion<9) msj = "La versión de su navegador (Opera) es muy antigua. \n\n Por favor, actualice su navegador para visualizar correctamente esta página.";
		}
	}
	
	
	
	// Redirect and Alert
	if(msj!=false)
	{
		var answer = confirm(msj )
		if (answer){
			document.location.href = url ;
		}else{
			//alert("Ya está advertido..")
			
		}	
		return true;	
	}
	
	
	// debug info only
	if(info==1)
	{
		var debugJS = '';
		debugJS += "Browser CodeName: "	+ navigator.appCodeName;
		debugJS += "<br />";
		debugJS += "Browser Name: " 	+ navigator.appName;
		debugJS += "<br />";
		debugJS += "Browser Version: " 	+ navigator.appVersion;
		debugJS += "<br />";
		debugJS += "Cookies Enabled: " 	+ navigator.cookieEnabled;
		debugJS += "<br />";
		debugJS += "Platform: " 		+ navigator.platform;
		debugJS += "<br />";
		debugJS += "User-agent header: "+ navigator.userAgent;
		document.write(debugJS);
	}
	
}
// EXEC DETECTION
detectBrowser(0);