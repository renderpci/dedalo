// JavaScript Document

var BrowserDetect = {
	init: function () {
		this.browser = this.searchString(this.dataBrowser) || "An unknown browser";
		this.version = this.searchVersion(navigator.userAgent)
			|| this.searchVersion(navigator.appVersion)
			|| "an unknown version";
		this.OS = this.searchString(this.dataOS) || "an unknown OS";
	},
	searchString: function (data) {
		for (var i=0;i<data.length;i++)	{
			var dataString = data[i].string;
			var dataProp = data[i].prop;
			this.versionSearchString = data[i].versionSearch || data[i].identity;
			if (dataString) {
				if (dataString.indexOf(data[i].subString) != -1)
					return data[i].identity;
			}
			else if (dataProp)
				return data[i].identity;
		}
	},
	searchVersion: function (dataString) {
		var index = dataString.indexOf(this.versionSearchString);
		if (index == -1) return;
		return parseFloat(dataString.substring(index+this.versionSearchString.length+1));
	},
	dataBrowser: [
		{
			string: navigator.userAgent,
			subString: "Chrome",
			identity: "Chrome"
		},
		{ 	string: navigator.userAgent,
			subString: "OmniWeb",
			versionSearch: "OmniWeb/",
			identity: "OmniWeb"
		},
		{
			string: navigator.vendor,
			subString: "Apple",
			identity: "Safari",
			versionSearch: "Version"
		},
		{
			prop: window.opera,
			identity: "Opera"
		},
		{
			string: navigator.vendor,
			subString: "iCab",
			identity: "iCab"
		},
		{
			string: navigator.vendor,
			subString: "KDE",
			identity: "Konqueror"
		},
		{
			string: navigator.userAgent,
			subString: "Firefox",
			identity: "Firefox"
		},
		{
			string: navigator.vendor,
			subString: "Camino",
			identity: "Camino"
		},
		{		// for newer Netscapes (6+)
			string: navigator.userAgent,
			subString: "Netscape",
			identity: "Netscape"
		},
		{
			string: navigator.userAgent,
			subString: "MSIE",
			identity: "Explorer",
			versionSearch: "MSIE"
		},
		{
			string: navigator.userAgent,
			subString: "Gecko",
			identity: "Mozilla",
			versionSearch: "rv"
		},
		{ 		// for older Netscapes (4-)
			string: navigator.userAgent,
			subString: "Mozilla",
			identity: "Netscape",
			versionSearch: "Mozilla"
		}
	],
	dataOS : [
		{
			string: navigator.platform,
			subString: "Win",
			identity: "Windows"
		},
		{
			string: navigator.platform,
			subString: "Mac",
			identity: "Mac"
		},
		{
			   string: navigator.userAgent,
			   subString: "iPhone",
			   identity: "iPhone/iPod"
	    },
		{
			string: navigator.platform,
			subString: "Linux",
			identity: "Linux"
		}
	]

};
//BrowserDetect.init();

/*
// vars from navigator object
navigator.geolocation = [object Geolocation] ;
navigator.cookieEnabled = true
navigator.language = en-us
navigator.productSub = 20030107
navigator.product = Gecko
navigator.appCodeName = Mozilla
navigator.mimeTypes = [object MimeTypeArray]
navigator.vendorSub = 
navigator.vendor = Apple Computer, Inc.
navigator.platform = MacIntel
navigator.appName = Netscape
navigator.appVersion = 5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-us) AppleWebKit/533.17.8 (KHTML, like Gecko) Version/5.0.1 Safari/533.17.8
navigator.userAgent = Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_4; en-us) AppleWebKit/533.17.8 (KHTML, like Gecko) Version/5.0.1 Safari/533.17.8
navigator.plugins = [object PluginArray]
navigator.onLine = true
navigator.javaEnabled = function javaEnabled() {
    [native code]
}
navigator.getStorageUpdates = function getStorageUpdates() {
    [native code]
}
navigator.registerProtocolHandler = function registerProtocolHandler() {
    [native code]
}
navigator.registerContentHandler = function registerContentHandler() {
    [native code]
}
*/



/*
* Detect Bwoser and version
*/
function detectBrowser(info)
{
	var msj 		= false ;
	var result		= false ;
	var navVersion	= false ;
	var url			= 'updateClient.php';
	
	
	
	// Firefox < 3.1
	if (navigator.userAgent.indexOf('Firefox/3.0') != -1)
	{
		var result = /Firefox\/([\d.]+)/.exec(navigator.userAgent);
		if (result) {
			var navVersion = parseFloat(result[1]);
			if(navVersion<9){
				var msj = '¡ Atención ! \n\n Esta versión de Firefox está obsoleta. \n\n Actualice su navegador a una versión más moderna para visualizar correctamente esta página.' ;
	  			var msj = ' Atenció! \n\n Aquesta versió de Firefox és obsoleta. \n\n Actualitzi el seu navegador a una versió més moderna per visualitzar correctament aquesta pàgina. \n\n' ;
			}
		}	  
	}	
	// Internet Explorer < 7	
	if (navigator.userAgent.indexOf('MSIE') != -1)
	{		
		var result = /MSIE ([\d.]+)/.exec(navigator.userAgent);
		if (result) {
			var navVersion = parseFloat(result[1]);
			if(navVersion<7){
				var msj = '¡ Atención ! \n\n Esta versión de Internet Explorer está obsoleta. \n\n Actualice su navegador a una versión más moderna para visualizar correctamente esta página.' ;
				var msj = '  Atenció  ! \n\n Aquesta versió de Internet Explorer és obsoleta. \n\n Actualitzi el seu navegador a una versió més moderna per visualitzar correctament aquesta pàgina.' ;
			}
		}
	}		
	// Chrome < 5
	if (navigator.userAgent.indexOf('Chrome') != -1)
	{
		var result = /Chrome\/([\d.]+)/.exec(navigator.userAgent);
		if (result) {
			var navVersion = parseFloat(result[1]);
			if(navVersion<5) msj = "La versión de su navegador (Chrome) es muy antigua. \n\n Por favor, actualice su navegador para visualizar correctamente esta página.";
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
		var result = /Opera\/([\d.]+)/.exec(navigator.userAgent);
		if (result) {
			var navVersion = parseFloat(result[1]);
			if(navVersion<9.8) msj = "La versión de su navegador (Opera) es muy antigua. \n\n Por favor, actualice su navegador para visualizar correctamente esta página.";
		}
	}
	
	
	
	// Redirect and Alert
	if(msj!=false)
	{
		var answer = confirm(msj )
		if (answer){
			top.location.href = url ;
		}else{
			//alert("Ya está advertido..")
		}		
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
