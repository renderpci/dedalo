// JavaScript Document

/*
* ToggleFlechaJer : Gestiona abrir y cerrar los divs a través de las flechas del termino
*/
function ToggleFlechaJer(terminoID)
{	
	var srcFlechaDer = "../images/iconos/flecha_der.gif" ;
	var srcFlechaDown = "../images/iconos/flecha_down.gif" ; 
	
	var flechaName	= "#flecha_" + terminoID ;
	var estado	= $(flechaName).attr("src");
	
	//alert("terminoID:" + terminoID + "\n estado:" +estado)
	
	var divName = "#hijos_" + terminoID ;
	var cambio = false ;
	
	if(estado == srcFlechaDer)
	{
		$(flechaName).attr("src", srcFlechaDown);
		cambio = true ;
	}
	
	if(estado == srcFlechaDown)
	{
		$(flechaName).attr("src", srcFlechaDer);
		cambio = true ;
	}
	
	var divName = "#hijos_" + terminoID
	if(cambio==true) $(divName).toggle();
	
	
};

