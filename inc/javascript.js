// JavaScript Document

// control de documento modificado
var modificado =  0 ;
function fijarMod(valor){	
	//modificado = 1 ;
	modificado =  valor ; //fijamos el valor global de la página
	
	var div = 'log_res2';
	document.getElementById(div).style.display = 'block';
	document.getElementById(div).style.color = 'red';  
	document.getElementById(div).innerHTML = 'Ficha modificada!';    
	alert(valor)
}
// cambiar el BG en los listados al pasar el cursor
function bg( obj, color) {
	
	if(color!=-1) {
		obj.style.backgroundColor = color;
		return true;
	}
	return false;
}

function resize(w,h) {
	
	window.moveTo(0, 0); 
	
	//window.resizeTo(w, h);	//window.resizeBy(w,h) 
	
	window.innerWidth = w
    window.innerHeight = h
	
	//alert("HOME :: anchura --> " + screen.width + " w:"+w +" h:"+ h);
}

/**
* 	ordenar listados sin variar la búsqueda. 
*	Atention: js var query_string Needs to be assigned in top list page !!!
*/
function ordenar(orden,ot)
{	
	var pagina 			= '?';
	var url 			= pagina + query_string +'&orden=' + orden + '&ot=' + ot ;
		
	document.location.href = url
}


function go2_last_list() {
	
	if(last_list == -1 || last_list == null) return alert("last_list url not defined!");
	
	try{
		//alert("go2: " + last_list)
		window.location = last_list ;		
		
	}catch(err){ 
		if(DEBUG) alert(err)
	}	
}




/********************************************
* Javascript JQuery Autocomplete AUTOCOMPLETE
*********************************************/
/*
function findValue(li) {
	if( li == null ) return alert("No match!");
	// if coming from an AJAX call, let's use the CityId as the value
	if( !!li.extra ) var sValue = li.extra[0];
	// otherwise, let's just display the value in the text box
	else var sValue = li.selectValue;
	//alert("The value you selected was: " + sValue);
	$('#municipioID').val(sValue);
	resetBusqueda(sValue);
}
function selectItem(li) {
	findValue(li);
}
function formatItem(row) {
	return row[0] + " (id: " + row[1] + ")" ;
}
function lookupAjax(){
	var oSuggest = $("#busqueda")[0].autocompleter;
	oSuggest.findValue();
	return false;
}
*/
function busquedaSetValueMix(sValue,targetDiv)
{
	//alert(sValue)
	var myurl	= '../ts/ts_show_municipio.php' ;	
	var div = $('#'+targetDiv) ;	
	var accion	= '' ;
	var mydata	= { 'accion':accion , 'terminoID':sValue };
	
	if(div==null)
	{
		alert("target div null !!")
	}else{
		$.ajax({
			url			: myurl,
			data		: mydata,
			type		: "POST",
			beforeSend	: function(data){
							div.html('<div><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');		
						},
			success		: function(data) {			
							div.html(data);		
						}//success
		});//fin $.ajax	
	}
}
/********************************************
* FIN Javascript JQuery Autocomplete AUTOCOMPLETE
*********************************************/



 
function verificarEnlace(url, target){ //alert(url + ' - ' + target)
	try{
		// si se ha modificado el texto en tinyMCE, la variable modificado se fija a 1
		if (tinyMCE.activeEditor.isDirty()){
	 		modificado = 1 ; //alert("Texto modificado y no guardado!");
  		}
		if(modificado != 1){
			if(url=='javascript:salir()'){
				salir()
			}else{			
				top.location= url ;			
			}
		}else{			
			if(url=='javascript:salir()') url = '../backup/actualizaSalir.php';
			MOOdalBox.open( 
			"../inc/verificar.php?url="+url, // the link URL
			" ", // the caption (link's title) - can be blank
			"400 150" // width and height of the box - can be left blank
			);
		}//fin if(modificado != 1)
	//return false;
	}catch(e){alert(e)}
};



// Abrir/cerrar div 
function ToggleOLD(div, label_button) {
  div = document.getElementById(div);
  var label = document.getElementById(label_button);
  
  if (div.style.display == "none") {
   div.style.display = "block";
   label.innerText = "[ - ]"; 
  } else {
   div.style.display = "none";
   label.innerText = "[ + ]";
  }
}
 
 function ToggleT(label_button, div_termino) {	
  var label = document.getElementById(label_button); 
  var div_termino2 = document.getElementById(div_termino);  
  if (document.label.innerText  === "[ + ]") {
   document.label.innerText = "[ - ]";
   //alert('1 '+label_button);
  } else {   
  document.label.innerText = "[ + ]";
  // alert('2 '+label_button);
  }  
}

 // Abrir/cerrar div 
function Toggle2(div, label_button) {
  div = document.getElementById(div);
  var label = document.getElementById(label_button);  
  if (div.style.display == "none") {
   div.style.display = "block";
   label.innerText = "[ - ]";
  } else {
   div.style.display = "none";
  label.innerText = "[ + ]";
  }
 }
 
  // Multi toogle 
function multiToogle_DESACTIVO_XXX(div_name,activa,desactiva) {
  /*alert(div +' '+activa +' '+ desactiva)*/
  divObj = document.getElementById(div_name);
  if(!divObj) alert(' Opss. Sorry: Beta function. ' + div1 +' - '+ activa +' - '+ desactiva );
  
  var current_style = divObj.style.display;	//alert(current_style)
  
  if(!current_style || current_style=='' || current_style=='undefined') current_style = 'none';
  
  if (current_style == desactiva) {
	divObj.style.display = activa ;
  }else{
	divObj.style.display = desactiva ;
  }  
}

  // Simple toogle 
function simpleToogle(div) {
  div = document.getElementById(div);  
  if (div.style.display == "none") {
   /*div.style.display = "inline-block";*/
   div.style.display = "inline";
  } else {
   div.style.display = "none";
  }
}

/*
* simpleToogleStyle 
*/
function simpleToogleStyle(div, estilo) 
{
  //alert(div + ":" +estilo)
  try{
  	div = document.getElementById(div); 
  }catch(e){};
  
  if(div!=null)
  {
	if (div.style.display == "none")
	{
	   	div.style.display = estilo;
	} else {
		div.style.display = "none";
	}
  }//if(div!=null)
  
}

  // table-row-group toogle 
function simpleToogleTBODY(divName, obj, callback) {
		
	$(obj).children().toggleClass('flecha_close_tboby');
	$(obj).children().toggleClass('flecha_open_tboby');
	
	$('#'+divName).toggle(150);
	/*
	if (typeof callback == 'function') {
		callback();
	};
	*/
	return true;
}
 
function MM_openBrWindow(theURL,winName,features) { //v2.0
  window.open(theURL,winName,features);
}

// pasar un valor a otro campo
function pasarValor(input, valor) {
  var valor2 = valor ;
  var input2 = document.getElementById(input); 
  input2.value = valor2 ; 
 }
 
// abrir ventana flotante
function AbrirVF(theURL,winName,features) { //v2.0
  var theURL2 = theURL + '&head=no' ; 
  window.open(theURL2,winName,features);
}
 


// validar fecha
function esDigito(sChr){
	var sCod = sChr.charCodeAt(0);
	return ((sCod > 47) && (sCod < 58));
}
function valSep(oTxt){
	var bOk = false;
	bOk = bOk || ((oTxt.value.charAt(2) == "-") && (oTxt.value.charAt(5) == "-"));
	/* bOk = bOk || ((oTxt.value.charAt(2) == "/") && (oTxt.value.charAt(5) == "/")); */
	return bOk;
}
function finMes(oTxt){
	var nMes = parseInt(oTxt.value.substr(3, 2), 10);
	var nRes = 0;
	switch (nMes){
	case 1: nRes = 31; break;
	case 2: nRes = 29; break;
	case 3: nRes = 31; break;
	case 4: nRes = 30; break;
	case 5: nRes = 31; break;
	case 6: nRes = 30; break;
	case 7: nRes = 31; break;
	case 8: nRes = 31; break;
	case 9: nRes = 30; break;
	case 10: nRes = 31; break;
	case 11: nRes = 30; break;
	case 12: nRes = 31; break;
	}
	return nRes;
}
function valDia(oTxt){
	var bOk = false;
	var nDia = parseInt(oTxt.value.substr(0, 2), 10);
	bOk = bOk || ((nDia >= 1) && (nDia <= finMes(oTxt)));
	return bOk;
}
function valMes(oTxt){
	var bOk = false;
	var nMes = parseInt(oTxt.value.substr(3, 2), 10);
	bOk = bOk || ((nMes >= 1) && (nMes <= 12));
	return bOk;
}
function valAno(oTxt){
	var bOk = true;
	var nAno = oTxt.value.substr(6);
	/* bOk = bOk && ((nAno.length == 2) || (nAno.length == 4)); */
	bOk = bOk && (nAno.length == 4);
	if (bOk){
		for (var i = 0; i < nAno.length; i++){
			bOk = bOk && esDigito(nAno.charAt(i));
			}
	}
	return bOk;
}


/* This function prefixes strings with the correct # of 0's */ 
function ZeroFill(iNum, iDigits) { 
  var sNum = CvtNtoS(iNum); 
  while (sNum.length < iDigits) 
	sNum = "0" + sNum; 
  return sNum;
}	  
/* This function concerts numbers to strings */ 
function CvtNtoS(iNum) {
  return ("" + iNum);
}

// toogle tinyMCE editor 
function toggleEditor(id) {
	try{
		if (!tinyMCE.get(id)) {
			tinyMCE.execCommand('mceAddControl', false, id);
		}else{
			tinyMCE.execCommand('mceRemoveControl', false, id);
			$('#texto').css({'visibility':'visible'});
			return
		}
	}catch(e){alert(e)}
}
	 










var getFormattedTimeString = function(sec)
{
	var timeString = "";
    var min = Math.floor(sec / 60);
	var hour = Math.floor(min / 60);
	sec = Math.floor(sec - (min * 60));
	min = Math.floor(min - (hour * 60));
	
    if(min<10){min = "0" + min;}
    if(sec<10){sec = "0" + sec;}
	if(hour > 0) timeString = hour+":";
    timeString += min+":"+sec;
	return timeString;
}
// ]]>





function MM_jumpMenu(targ,selObj,restore){ //v3.0
  eval(targ+".location='"+selObj.options[selObj.selectedIndex].value+"'");
  if (restore) selObj.selectedIndex=0;
}

/* funciones ajax fotos in ********************************/
/* mootools desactiva !!
var CargaFoto= function(div, SID, nocache, ancho, subcarpeta)
{
	//alert('div: '+ div + ' - SID: '+ SID + ' - nocache: ' +nocache);
	if(!ancho || ancho=='undefined') ancho = '';
	if(!subcarpeta || subcarpeta=='undefined') subcarpeta = '';
	var log = $(div);
	if(nocache == undefined) nocache = 0;
	var url = "../fotosDB/fotosAjax.php?SID="+SID+"&div="+div+"&nocache="+nocache+"&ancho="+ancho+"&subcarpeta="+subcarpeta  ;
	new Ajax(url, {
		method: 'get',
		update: log.empty().addClass('ajax-loadingFoto'),
			onComplete: function() {
				log.removeClass('ajax-loadingFoto');
			}
		}).request();
}
*/

/*
* CargaFoto [JQUERY]
*/
function CargaFoto(targetDiv, SID, nocache, ancho, subcarpeta, tipo)
{
	try{
		//alert('div: '+ div + ' - SID: '+ SID + ' - nocache: ' +nocache);
		if(!ancho || ancho=='undefined') ancho = '';
		if(!subcarpeta || subcarpeta=='undefined') subcarpeta = '';
		if(nocache == undefined) nocache = 0;
		var div	= $('#'+ targetDiv);
	}catch(e){};
	
	if(div!=null)
	{		
		if(tipo=='pdf')
		{
			var myurl 	= "../pdfsDB/pdfsAjax.php?ajaxLoad=1";
		}else{
			var myurl 	= "../fotosDB/fotosAjax.php?ajaxLoad=1" ; 
		}
		
		var accion	= '' ;
		var mydata	= { 'accion':accion , 'SID':SID , 'div':targetDiv , 'nocache':nocache , 'ancho':ancho , 'subcarpeta':subcarpeta };
		
		$.ajax({
			url			: myurl,
			data		: mydata,
			type		: "POST",
			beforeSend	: function(data){
							div.html('<div><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');		
						},
			success		: function(data) {			
							div.html(data);				
						}//success
		});//fin $.ajax
	}
}

function Toggle(divName) {
	var div = document.getElementById(divName); //alert(divName) 
	if (div.style.display != "block") {
		div.style.display = "block";
	} else {
		div.style.display = "none";
	}
}

function AmpliarFoto(theURL)
{
	var features = "resizable=yes, scrollbars=auto" 
	window.open(theURL,'foto',features);
}

function descargarFoto(foto,tipo)
{
	if(tipo=='pdf')
	{
		var pagina = '../media_pdf/descargar.php?f='+foto ;
	}else{
		var pagina = '../media_foto/descargar.php?f='+foto ;	
	}
	/* window.open('../fotosDB/descargar.php?f='+foto); */
	location.href=pagina
}
/*
function cambiarNorden(nordenV, terminoID, padre, termino)
{
	var url = "ts_norden.php?nordenV="+nordenV+"&padre="+padre+"&terminoID="+terminoID+"&termino="+escape(termino) ;	
	window.open(url,'','status=yes,scrollbars=yes,resizable=yes,width=450,height=200');
}
*/
/*
* get value from checkbox array
* retun
*/
function get_check_value(checkboxField)
{	
	var checkbox = checkboxField ; 
	var checkActual = checkbox.checked ;//alert('valor checked:'+checkbox.checked)
	
	// if only we have 1 proyect (not is array)
	if(checkActual==true)
	{
		check_value = 1;	
		
	}else{ 
	// if we have more that 1 proyect (is array)
		var check_value = '';
		var largo = checkbox.length ; //alert("largo:"+largo)		
		for (var i=0; i < largo; i++)
		{
		  if (checkbox[i].checked){
			//check_value = check_value + checkbox[i].value + "\n";
			check_value +=  checkbox[i].value ;
		  }	  
		}
	}
	// alert("check_value:"+check_value)	
	return check_value ;
};


/*
* Carga el contenido genérico de la página haciendo un fadeIn. Require JQUERY !!!!
*/
function cargarContentPage(div)
{
	//div.html('<div id="spinnerDiv"><img src="../img/spinner.gif" alt="Wait" align="absmiddle" /></div>');
	$("#"+div).hide().css( 'visibility', 'visible').fadeIn("slow");	
}

function get_radio_value(radioGroup){
	
	var radioGroupChecked = radioGroup.checked; //alert(radioGroup)
	
	if (radioGroupChecked===true) {
		
		var rad_val = radioGroup.value;
		
	} else {
		
		for (var i=0; i < radioGroup.length; i++) {
			if (radioGroup[i].checked) {
				var rad_val = radioGroup[i].value;
			}
		}
	}	
  
	return rad_val ;  
}

function my_urldecode(str) {
	// Decodes URL-encoded string  
	// 
	// version: 1008.1718
	// discuss at: http://phpjs.org/functions/urldecode    // +   original by: Philip Peterson
	// +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
	// +      input by: AJ
	// +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
	// +   improved by: Brett Zamir (http://brett-zamir.me)    // +      input by: travc
	// +      input by: Brett Zamir (http://brett-zamir.me)
	// +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
	// +   improved by: Lars Fischer
	// +      input by: Ratheous    // +   improved by: Orlando
	// +      reimplemented by: Brett Zamir (http://brett-zamir.me)
	// +      bugfixed by: Rob
	// %        note 1: info on what encoding functions to use from: http://xkr.us/articles/javascript/encode-compare/
	// %        note 2: Please be aware that this function expects to decode from UTF-8 encoded strings, as found on    // %        note 2: pages served as UTF-8
	// *     example 1: my_urldecode('Kevin+van+Zonneveld%21');
	// *     returns 1: 'Kevin van Zonneveld!'
	// *     example 2: my_urldecode('http%3A%2F%2Fkevin.vanzonneveld.net%2F');
	// *     returns 2: 'http://kevin.vanzonneveld.net/'    // *     example 3: my_urldecode('http%3A%2F%2Fwww.google.nl%2Fsearch%3Fq%3Dphp.js%26ie%3Dutf-8%26oe%3Dutf-8%26aq%3Dt%26rls%3Dcom.ubuntu%3Aen-US%3Aunofficial%26client%3Dfirefox-a');
	// *     returns 3: 'http://www.google.nl/search?q=php.js&ie=utf-8&oe=utf-8&aq=t&rls=com.ubuntu:en-US:unofficial&client=firefox-a'
	
	//alert('my_urldecode called!')
	return decodeURIComponent(str.replace(/\+/g, '%20'));
}

// format tag to value ( like [index_001_in] to 001 ,etc.. )
function convertTag2value(tag) {
	
	if(tag.indexOf('[index_') != -1) {		
		// indexIn [index_016_in]
		var tagType = 'indexIn';		
	}else if(tag.indexOf('[out_index_') != -1) {		
		// indexOut [out_index_018] 
		var tagType = 'indexOut';				
	}else if(tag.indexOf('[TC_') != -1) {
		// tc [TC_00:00:02_TC]		
		var tagType = 'tc';		
	}else{
		// false
		return false;	
	}
	
	switch(tagType) {
		case 'indexIn'	: var value = tag.substr(7,3);		break;	// ( like [index_001_in]   to 001 ) 
		case 'indexOut'	: var value = tag.substr(11,3);		break;	// ( like [out_index_001]  to 001 )
		case 'tc'		: var value = tag.substr(4,8);		break;	// ( like [TC_00:00:01_TC] to 00:00:01 )
	}
	//alert(tag +" - " +value)
	return value ;
}

function return2br(dataStr) {
	return dataStr.replace(/(\r\n|\r|\n)/g, "<br />");
}

/*
* Abrir listado de tesauro para hacer relaciones
*/
var relwindow ;
function abrirTSlist(modo,type) {
	
	var theUrl = DEDALO_LIB_BASE_URL + '/ts/ts_list.php?modo=' + modo +'&type=' + type ;
	relwindow = window.open(theUrl ,'listwindow','status=yes,scrollbars=yes,resizable=yes,width=900,height=650');//resizable
	if (relwindow) relwindow.moveTo(-10,1);
	if (window.focus) { relwindow.focus() }
	//return false;
}


function print_r(theObj) {
	
   if(theObj.constructor == Array || theObj.constructor == Object){
	  document.write("<ul>")
	  for(var p in theObj){
		 if(theObj[p].constructor == Array || theObj[p].constructor == Object){
			document.write("<li>["+p+"] => "+typeof(theObj)+"</li>");
			document.write("<ul>")
			print_r(theObj[p]);
			document.write("</ul>")
		 } else {
			document.write("<li>["+p+"] => "+theObj[p]+"</li>");
		 }
	  }
	  document.write("</ul>")
   }
}
function var_dump(obj) {
   if(typeof obj == "object") {
      return "Type: "+typeof(obj)+((obj.constructor) ? "\nConstructor: "+obj.constructor : "")+"\nValue: " + obj;
   } else {
      return "Type: "+typeof(obj)+"\nValue: "+obj;
   }
}//end function var_dump