<?php
if(!isset($modelo))
{
	$modeloGet = false; if(isset($_REQUEST['modelo'])) $modeloGet = safe_xss($_REQUEST['modelo']); #if(!isset($modeloGet)) die(" need modelo id ! ");
}else{
	$modeloGet = $modelo ;
}

$RecordObj_dd	= new RecordObj_dd(null,'dd');
$ar_all_modelos = $RecordObj_dd->get_ar_all_modelos();	#dump($ar_all_modelos);


# ordenamos alfabéticamente los modelos
$ar_all_modelos_ordered = array();
if(count($ar_all_modelos)>0) foreach($ar_all_modelos as $modeloID) {
	
	$ar_all_modelos_ordered[$modeloID] = RecordObj_dd::get_termino_by_tipo($modeloID);	
}
asort($ar_all_modelos_ordered);
	#dump($ar_all_modelos_ordered);

?>
<select name="modelo" id="modelo"  style="color:#333333;width:90px">
	<option value="" <?php if (!(strcmp("", $modeloGet))) {echo "selected=\"selected\"";} ?> > </option>
	<?php
	if(count($ar_all_modelos_ordered)>0) foreach($ar_all_modelos_ordered as $modeloID => $modelo) { 
	
		if($modeloID != 'dd2') { # filtramos el registro autointroducido al crear la tabla ( dd2 ) 
		?>
		<option value="<?php echo $modeloID ?>" <?php if (!(strcmp($modeloID, $modeloGet))) {echo "selected=\"selected\"";} ?> >
			<?php echo $modelo ; if(SHOW_DEBUG==true) echo " [$modeloID]" ;?>
		</option>
		<?php
		}
	} #while ($row_RS = mysql_fetch_assoc($RS)); mysql_free_result($RS);
	?>
</select>