// JavaScript Document

window.addEventListener("load", function (event) {	
    $('#wrapGeneral').fadeIn(250);
});

    
function borrarFichaTermino(terminoID, nombre) {
	
	var r=confirm(esta_seguro_de_eliminar_registro_1_title + '\n\n terminoID: ' + terminoID + '\n ' +nombre_title +': ' + nombre );	
	if (r!=true) return false; 
	
	var r2=confirm(esta_completamente_seguro_title )	;
	if (r2!=true) return false;
	
	window.location.href= DEDALO_LIB_BASE_URL + "/ts/trigger.Tesauro.php?accion=deleteTS&terminoID="+ terminoID +"&flat=1" ;	
}



/*
* Abre la ventana de edición del termino (ts_edit.php)
*/
var editwindow ;
function openTSeditFromFlat(terminoID,parent) {
	
	//alert('terminoID:'+terminoID+' parent:'+parent)
	/*
	var theURL	= "ts_edit.php?terminoID="+terminoID+"&parent="+parent+"&head=no" ;
	var features = "resizable=yes, scrollbars=auto, width=800" 
	window.open(theURL,'ts_edit',features);
	*/
	
	var theUrl = DEDALO_LIB_BASE_URL + "/ts/ts_edit.php?terminoID="+terminoID+"&parent="+parent+"&head=no&from=flat" ;
	editwindow = window.open(theUrl ,'editwindow','status=yes,scrollbars=no,resizable=yes,width=900,height=600');
	//if (newwindow) newwindow.moveTo(-10,1);
	//if (window.focus) { editwindow.focus() }
	try{	
		if(window.focus) {
			
			screenW = screen.width;
			screenH = screen.height;		
			editwindow.moveTo(screenW-900,0);	//alert(screenW +" " +screenH)	
			
			editwindow.focus();		 
		}
	}catch(err){
		alert("Error focus window (openTSedit). \n\nPlease disable 'Block Pop-Up Windows' option in your browser ")
	}
}