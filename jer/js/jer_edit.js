// JavaScript Document

function activaChange(value)
{
	//alert(value)
	//if(activa=='si' && value=='no') alert(se_eliminaran_todos_los_datos_title + " " + de_title + " "+toponimia_title )
}

function form2submit()
{	
	var divJQobj	= $('#selectTipos'); //alert("form2submit: nombre value:"+ $('#nombreTipo').val()   )
	var nombre		= $('#nombreTipo').val();
	var accion		= 'insertTipo';
	var mydata		= { 'nombre': nombre , 'accion': accion };
	
	$.ajax({
	  url		: "../jer/controller.Jerarquia.php",
	  data		: mydata,
	  type		: "POST",
	  async		: true,
	  beforeSend: function(data) {							
						divJQobj.html('<div style="margin-left:55px"><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');
						divJQobj.css({'display':'block'});
				  },
	  success	: function(data) {						
						//divJQobj.hide();				
						//divJQobj.html(data);						
						$('#divTipo').hide();	//alert(data)
						selectTipos(data)				
				  }//success	  
	});//fin $.ajax	
}

function validar(form) {
	//alert(form.SelectLangList.value.length);
	// ID
	var index = idsOcupados.indexOf(form.id.value); //alert(index + " "+form.id.value) // Find the index	
	if (index != -1) {
     	alert(debe_introducir_title + " " + un_title + " ID " + unico_title + " ! \n (" + no_title +" "+ utilizado_title+ ") " );
	 	form.id.focus();	  
     	return (false);
  	}
	if (form.id.value.length < 1)  {
     	alert(debe_introducir_title + " ID ej. 254 " );
	 	form.id.focus();	  
     	return (false);
  	}
	
	// NOMBRE
	if (form.nombre.value.length < 1)  {
     	alert(debe_introducir_title +" "+nombre_title + " ej. España " );
	 	form.nombre.focus();	  
     	return (false);
  	}	
	
	// ALPHA2
	form.alpha2.value.toUpperCase();
	if (form.alpha2.value.length < 2)  {
     	alert(debe_introducir_title + " TLD (alpha2) " + valido_title + " (2 chars)" );
	 	form.alpha2.focus();	  
     	return (false);
  	}
	var regexAlpha2 = new RegExp('[A-Z][A-Z]');
	if (!form.alpha2.value.match(regexAlpha2)) {
		alert(debe_introducir_title + " TLD (alpha2) " + valido_title );
		form.alpha2.focus();
		return (false);
	}
	var index = alpha2Ocupados.indexOf(form.alpha2.value.toUpperCase());
	if (index != -1) {
     	alert(debe_introducir_title + " " + un_title + " TLD (alpha2) " + unico_title + " ! \n (" + no_title +" "+ utilizado_title+ ") " );
	 	form.alpha2.focus();	  
     	return (false);
  	}
	
	// ALPHA3
	form.alpha3.value.toUpperCase();
	if (form.alpha3.value.length < 3)  {
     	alert(debe_introducir_title + " TLD (alpha3) " + valido_title + " (3 chars)" );
	 	form.alpha3.focus();	  
     	return (false);
  	}
	var regexAlpha3 = new RegExp('[A-Z][A-Z][A-Z]');
	if (!form.alpha3.value.match(regexAlpha3)) {
		alert(debe_introducir_title + " TLD (alpha3) " + valido_title );
		form.alpha2.focus();
		return (false);
	}
	var index = alpha3Ocupados.indexOf(form.alpha3.value.toUpperCase());
	if (index != -1) {
     	alert(debe_introducir_title + " " + un_title + " TLD (alpha3) " + unico_title + " ! \n (" + no_title +" "+ utilizado_title+ ") " );
	 	form.alpha3.focus();	  
     	return (false);
  	}	
	
	// MAIN LANG IDIOMA
	if (form.mainLang.value.length < 1)  {
     	alert(debe_introducir_title + " " + idioma_title );
	 	form.newlangBtn.focus();	  
     	return (false);
  	}
	
	// TIPO
	if (form.tipo.value.length < 1)  {
     	alert(debe_introducir_title + " " + tipo_title );
	 	form.tipo.focus();	  
     	return (false);
  	}
	
	
	
	
  return (true); 
}

function estaUsado_id(value)
{
	if(value.length >0)
	{		
		// ID
		var index = idsOcupados.indexOf(value);
		if (index != -1)
		{			
			$('#id2aviso').html( ya_se_usa_title );			
		}else{
			$('#id2aviso').html( '' );	
		}		
	}
}

function estaUsado_alpha2(value)
{
	if(value.length == 2)
	{		
		// ALPHA2
		var index = alpha2Ocupados.indexOf(value);
		if (index != -1)
		{			
			$('#alpha2aviso').html( ya_se_usa_title );			
		}else{
			$('#alpha2aviso').html( '' );	
		}		
	}
}

function estaUsado_alpha3(value)
{
	if(value.length == 3)
	{		
		// ALPHA3
		var index = alpha3Ocupados.indexOf(value);
		if (index != -1)
		{			
			$('#alpha3aviso').html( ya_se_usa_title );			
		}else{
			$('#alpha3aviso').html( '' );	
		}		
	}
}

var listadoTiposAbierto = 0 ;
function openTipo(accion) {	

	var divJQobj = $('#divTipo'); //alert("openTipo in progress !")
	if( divJQobj.css('display') == 'block')
	{
		divJQobj.fadeOut(300);		
	}else{
		if(listadoTiposAbierto==0){
			listJerTipo();
			listadoTiposAbierto = 1 ;
		}else{
			divJQobj.fadeIn(300);	
		}
			
		/* DESACTIVO
		$.ajax({
		  url: "controller.Jerarquia.php?accion="+accion,
		  //data:	"accion="+accion,
		  type: "POST",
		  async: true,
		  beforeSend: function(data){							
				divJQobj.html('<div style="margin-left:55px"><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');
				divJQobj.css({'display':'block'});
		  },
		  success: function(data){						
				//divJQobj.hide();				
				divJQobj.html(data);				
		  }//success	  
		});//fin $.ajax
		*/
	}	
}
function selectTipos(tipoSelected)
{	
	var divJQobj	= $('#selectTipos'); //alert("tipoSelected: "+tipoSelected)
	var mydata		= { 'accion': 'selectTipos', 'tipo': tipoSelected };
	
	$.ajax({
	  url		: "../jer/controller.Jerarquia.php",
	  data		: mydata,
	  type		: "POST",
	  async		: true,
	  beforeSend: function(data) {							
						divJQobj.html('<div style="margin-left:55px"><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');
						divJQobj.css({'display':'block'});
				  },
	  success	: function(data) {						
						//divJQobj.hide();				
						divJQobj.html(data);				
				  }//success	  
	});//fin $.ajax	
}


/**********************
* TIPO
**********************/
function listJerTipo() {
	
	var myUrl 	= "../inc/grid.php" ;
	var mydata	= { 't' : 'jerarquia_tipos', 'accion' : 'list' };		//alert("listJerTipo")
	
	var divJQobj = $('#divTipo'); //alert("form2submit: nombre value:"+ $('#nombreTipo').val()   )
	$.ajax({
	  url		: myUrl,
	  data		: mydata,
	  type		: "POST",
	  async		: true,
	  beforeSend: function() {							
						//divJQobj.html('<div style="margin-left:55px"><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');
						//divJQobj.css({'display':'block'});
				},
	  success	: function(data) {
		  				divJQobj.hide();
						divJQobj.html(data);	//alert(data)						
				},
	  complete	: function() {		 			
						divJQobj.show(300); 
						listadoTiposAbierto= 1; 						
	  			}
	});//fin $.ajax	
}
function deleteJerTipo(id)
{
	var r=confirm( esta_seguro_de_eliminar_registro_1_title + '\n\n ID: ' + id  )
	if (r==true) 
	{	
		var myUrl 	= "../inc/grid.php" ;
		var mydata	= { 't' : 'jerarquia_tipos', 'accion' : 'delete', 'id' : id  };
		
		var divJQobj = $('#divTipo'); //alert("form2submit: nombre value:"+ $('#nombreTipo').val()   )
		$.ajax({
		  url		: myUrl,
		  data		: mydata,
		  type		: "POST",
		  async		: true,
		  beforeSend: function(data) {							
						divJQobj.html('<div style="margin-left:55px"><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');
						divJQobj.css({'display':'block'});
		  			},
		  success: function(data) {			
						divJQobj.html(data);//alert(data)
						selectTipos(tipoSelected);
								
				  }//success	  
		});//fin $.ajax	
	}
}
function editJerTipo(id)
{
	var myUrl 		= "../inc/grid.php" ;
	var mydata		= { 't' : 'jerarquia_tipos', 'accion' : 'edit', 'id' : id };
	var divJQobj 	= $('#divTipo'); //alert("id value:"+ id )
	
	$.ajax({
	  url		: myUrl,
	  data		: mydata,
	  type		: "POST",
	  async		: true,
	  beforeSend: function(data){							
					divJQobj.html('<div style="margin-left:55px"><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');
					divJQobj.css({'display':'block'});
			  },
	  success	: function(data){			
					divJQobj.html(data);//alert(data)				
			  }//success	  
	});//fin $.ajax	
}
function editSubmitJerTipo(id)
{
	var nombreTipo 	= $('#nombreTipo').val();
	var orden 		= $('#orden').val();
	var myUrl 		= "../inc/grid.php" ;
	var mydata		= { 't' : 'jerarquia_tipos', 'accion' : 'editSubmit' , 'nombre' : nombreTipo , 'orden' : orden , 'id' : id };
	
	var divJQobj = $('#divTipo'); //alert("id value:"+ id )
	$.ajax({
	  url		: myUrl,
	  data		: mydata,
	  type		: "POST",
	  async		: true,
	  beforeSend: function(data) {							
					divJQobj.html('<div style="margin-left:55px"><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');
					divJQobj.css({'display':'block'});
			  },
	  success: function(data) {			
					divJQobj.html(data);//alert(data)
					selectTipos(tipoSelected);				
			  }//success	  
	});//fin $.ajax	
}
function insertJerTipo()
{
	var myUrl = "../inc/grid.php" ;
	var mydata	= { 't': 'jerarquia_tipos' , 'accion': 'new' };
	
	var divJQobj = $('#divTipo'); //alert("form2submit: nombre value:"+ $('#nombreTipo').val()   )
	$.ajax({
	  url		: myUrl,
	  data		: mydata,	  
	  type		: "POST",
	  async		: true,
	  beforeSend: function(data){							
					divJQobj.html('<div style="margin-left:55px"><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');
					divJQobj.css({'display':'block'});
			  },
	  success: function(data){			
					divJQobj.html(data);//alert(data)				
			  }//success	  
	});//fin $.ajax
}
function insertSubmitJerTipo()
{	
	var nombreTipo 	= $('#nombreTipo').val();
	var myUrl 		= "../inc/grid.php" ;
	var mydata		= { 'id':id , 'nombre':nombreTipo , 't':'jerarquia_tipos' , 'accion':'insertSubmit' };
	
	var divJQobj 	= $('#divTipo'); //alert("form2submit: nombre value:"+ $('#nombreTipo').val()   )
	
	$.ajax({
	  url		: myUrl,
	  data		: mydata,
	  type		: "POST",
	  async		: true,
	  beforeSend: function(data){							
					divJQobj.html('<div style="margin-left:55px"><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');
					divJQobj.css({'display':'block'});
			  },
	  success	: function(data){			
					divJQobj.html(data);//alert(data)
					selectTipos(tipoSelected);			
			  }//success	  
	});//fin $.ajax
}



function newLang(terminoID) {
	//return alert("called newLang " +terminoID)
	
	// var id from page
	var myurl 	= "../jer/controller.Jerarquia.php" ;
	var div		= $('#langDIV');
	var accion	= 'newLang' ;
	var mydata	= { 'accion':accion, 'id':id ,'terminoID':terminoID };
	
	$.ajax({
		url			: myurl,
		data		: mydata,
		type		: "POST",
		beforeSend	: function() {
						div.html('<div><img src="../images/spinner.gif" alt="Wait" align="absmiddle" /></div>');		
					},
		success		: function(data) {
						if (relwindow) relwindow.close();
						div.html(data);						
					}//success
	});//fin $.ajax	
}