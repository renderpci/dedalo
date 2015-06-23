<?php
/*
* Crea los enlaces:  Completo | Simple | Ver todas
*/
function jumpLang($lang)
{
	$html = false ;
	
	if(isset($_SERVER['QUERY_STRING']))	$queryString = $_SERVER['QUERY_STRING']; 
	$urlBase = '?'.eliminarOT($queryString);
	
	$html .= "$urlBase?&lang=$lang";
	
	return $html ; 
}
?>
<select name="jumpMenu" id="jumpMenu" onChange="MM_jumpMenu('parent',this,0)" <?php if(isset($jumpStyle )) echo $jumpStyle ?> >  
  <option value="<?php echo jumpLang('va') ?>" <?php if($lang=='va') echo "selected=\"selected\" "; ?>>Català/Valencià</option>
  <option value="<?php echo jumpLang('en') ?>" <?php if($lang=='en') echo "selected=\"selected\" "; ?>>English</option>
  <option value="<?php echo jumpLang('es') ?>" <?php if($lang=='es') echo "selected=\"selected\" "; ?>>Castellano</option>  
</select>