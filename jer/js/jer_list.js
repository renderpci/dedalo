// JavaScript Document

jQuery(document).ready(function()
{
	if(get_localStorage('jerListIframe')!=null) iframeFlat.location.href = get_localStorage('jerListIframe');
	if(get_localStorage('jerListClick')!=null)
	{
		fixTRclick(get_localStorage('jerListClick'));
	}
});



function borrarFicha(id, nombre, tld) {	
	var r=confirm(esta_seguro_de_eliminar_registro_1_title + '\n\n ID: ' + id + '\n ' +nombre_title +': ' + nombre + '\n\n' )
	if (r==true) 
	{
	    var r2=confirm("\n\n "+ esta_completamente_seguro_title +" \n\n " )	;
		if (r2==true) {
			window.location.href="controller.Jerarquia.php?accion=delete&id="+ id +"&tld="+tld ;
		}
	}
};

function go2edit(id) {
	var myUrl = "jer_edit.php?modo=edit&id="+ id ;
	window.location.href = myUrl; 	
}

function fixTRclick(trid) {
	// fijamos el row
	$('.trTaxlist').css("background-color","#CFCFCF");
	$('#listTable td').css({"color":"#333"});
	
	var trname = '#tr_'+trid ; //alert(trname)
	$(trname).css({"background-color":"#666"});
	$(trname+" td").css({"color":"#ffffff"});	
}

function gotoFlatList(trid,tld,modo) {	
	fixTRclick(trid);
	
	var myUrl = "jer_flat_list.php?tld="+ tld + "&modo=" + modo ; //alert(modo)
		
	// fijamos la cookie de la url de iframe
	set_localStorage('jerListIframe',myUrl,7);
	
	// fijamos la cookie del id pulsado
	set_localStorage('jerListClick',trid,7);
	
	// redireccionamos el iframe
	iframeFlat.location.href = myUrl; 	
}