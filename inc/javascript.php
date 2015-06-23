<?php //javascript con variables de php 
require_once(dirname(dirname(__FILE__)).'/Connections/config.php');
?>
<script type="text/javascript">
// vars
var esta_seguro_de_abandonar_esta_sesion_title	= '<?php echo msgJS($esta_seguro_de_abandonar_esta_sesion_title) ?>';
var usuario_title								= '<?php echo msgJS($usuario_title) ?>';
var al_salir_se_guradara_title					= '<?php echo msgJS($al_salir_se_guradara_title) ?>';
var fecha_invalida_title						= '<?php echo msgJS($fecha_invalida_title) ?>';
var atencion_explorer_title						= '<?php echo msgJS($atencion_explorer_title) ?>';

// salir abandonar sesion
function salir(obj,usuario) {
	
	var r = confirm(esta_seguro_de_abandonar_esta_sesion_title +" \n\n" + usuario_title + " : "+ usuario + "\n\n" + al_salir_se_guradara_title +" \n\n");
	
	if (r!=true) return;
	
	var pagina = "../backup/actualiza.php?userID="+userID ;
	document.location.href = pagina ;
	
	/*
	try {	
		//callActualiza_logout(obj);		
	}catch(err) {
		//alert(err)	
	}
	*/		
}

function callActualiza_logout(obj) {
		
	var divObj	= $(obj);
	var myUrl	= '../backup/actualiza.php';	// By direct ajax call	
	var accion	= 'logout' ; 	
	var mydata	= { 'accion':accion , 'verify':'dedaloBackUpScript2' };
	
	try {
		
		$.ajax({		
			url			: myUrl,
			data		: mydata,
			type		: "GET",
			async		: false,
			beforeSend	: function(){
				divObj.html('<span style="color:#666;font-weight:normal"> Building Backup </span>');
			},
			success		: function(data){			
				divObj.html('<span style="color:#666;font-weight:normal"> Backup ok </span>');			//alert(data);								
			},
			complete	: function(){
				document.location.href = '../auth/salir.php' ;					
			}			  
		});//$.ajax
	
	}catch(err){}
}

// Explorer advertencia 
var navegador = navigator.appName ;
if (navegador == "Microsoft Internet Explorer"){
	alert( atencion_explorer_title );
}
</script>