// JavaScript Document

function jumpToForm(selectedVal) {
	/*
	var url = selectedVal.value ; 
	change = 1 ;
	top.window.location = "?source="+url ;
	*/	
}

function validar(formLanguage) {
	try{
	
		if (formLanguage.source.options[0].selected)  {
			alert(" Reference file not selected ! \n\n Select a reference file for translate like 'es.php' \n");
			formLanguage.source.focus();	  
			return (false);
		}
			
		if (formLanguage.target.options[0].selected && formLanguage.targetT.value.length < 6)  {
			alert(" Target file name invalid ! \n\n Select a file name or create one like 'zz.php' \n");
			formLanguage.target.focus();	  
			return (false);
		}
		
		var sel 	= document.getElementById("source"); 
		var source 	= sel.options[sel.selectedIndex].value ;
		
		var sel 	= document.getElementById("target"); 
		var target 	= sel.options[sel.selectedIndex].value ;
		
		var targetT = document.getElementById("targetT").value;
		
		//alert(source + target );
	
		// si el source y el traget son iguales, advertimos de sobreescribir
		if(source == targetT || source == target){
			
			var r=confirm(" WARNING !! \n\n You're sure to overwrite the file " + formLanguage.target.value +"\n")
			if (r==true) {
				return true ;
			}else{
				return (false);	
			}
			
		}else{
			
			return true ;  
		}
	
	}catch(e){ 
		//alert(e) 
	}
	
  	return false;
};