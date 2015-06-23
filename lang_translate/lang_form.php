<?php
$source = false ;
if(isset($_REQUEST['source'])) $source = $_REQUEST['source'] ; #if(!$sourceF) exit("source not defined!");
require_once("../inc/funciones.php");
require_once("../lang_translate/class.LangTranslate.php");

?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title></title>
<link rel="shortcut icon" href="../favicon.ico" />

<link rel="stylesheet" type="text/css" charset="utf-8" href="../css/general.css" />

<script type="text/javascript">
var source 	= '<?php echo $source ?>' ;

function jumpToForm(selectedVal)
{
	/*
	var url = selectedVal.value ; 
	change = 1 ;
	top.window.location = "?source="+url ;
	*/	
}

function validar(formLanguage) 
{
	try{
		
	if (formLanguage.target.options[0].selected && formLanguage.targetT.value.length < 6)  {
     	alert(" Target file name invalid ! \n\n Select a file name or create one like 'zz.php' ");
	 	formLanguage.target.focus();	  
     	return (false);
	}
	
	var sel = document.getElementById("source"); 
	var source = sel.options[sel.selectedIndex].value ;
	
	var sel = document.getElementById("target"); 
	var target = sel.options[sel.selectedIndex].value ;
	
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
  
};
</script>
</head>

<body>


<?php

$lg = new LangTranslate(); 
echo $lg->createFormFromFile($source);



/*


<form id="form1" name="form1" method="post" action="">
  <table width="80%" border="0" cellspacing="1" cellpadding="4" >
    <tr>
      <th bgcolor="#666666">campo</th>
      <th bgcolor="#666666">valor</th>
    </tr>
    <tr>
      <td bgcolor="#999999">&nbsp;</td>
      <td bgcolor="#999999">
        <input name="666" type="text" id="666" value="" size="45" />
        <input type="submit" value="Save" />
      </td>
    </tr>
  </table>
</form>

<p>
  <select name="source" id="source">
    <option value="1">1</option>
    <option value="2">2</option>
  </select>
</p>

*/
?>
</body>
</html>