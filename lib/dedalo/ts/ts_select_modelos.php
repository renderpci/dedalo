<?php
if(!isset($modelo))
{
	$modeloGet = false; if(isset($_REQUEST['modelo'])) $modeloGet = $_REQUEST['modelo']; #if(!isset($modeloGet)) die(" need modelo id ! ");
}else{
	$modeloGet = $modelo ;
}

# filtramos el registro autointroducido al crear la tabla ( ejemplo es2 ) 
$noMostrar = Tesauro::terminoID2prefix($terminoID) .'2';

#echo " - modeloGet: $modelo "; #var_dump($RecordObj_ts);

$RecordObj_ts	= new RecordObj_ts($terminoID);
$ar_all_modelos = $RecordObj_ts->get_ar_all_modelos();	#var_dump($ar_all_modelos);


# ordenamos alfabéticamente los modelos
$ar_all_modelos_ordered = array();
if(count($ar_all_modelos)>0) foreach($ar_all_modelos as $modeloID) {
	
	$ar_all_modelos_ordered[$modeloID] = RecordObj_ts::get_termino_by_tipo($modeloID);	
}
asort($ar_all_modelos_ordered);

?>
<select name="modelo" id="modelo"  style="color:#333333;width:180px">
	<option value="" <?php if (!(strcmp("", $modeloGet))) {echo "selected=\"selected\"";} ?> > </option>
	<?php
	if(count($ar_all_modelos_ordered)>0) foreach($ar_all_modelos_ordered as $modeloID => $modelo) { 
	
		if($modeloID != $noMostrar) {
		?>
		<option value="<?php echo $modeloID ?>" <?php if (!(strcmp($modeloID, $modeloGet))) {echo "selected=\"selected\"";} ?>><?php echo $modelo ; if(SHOW_DEBUG==true) echo " [$modeloID]" ;?></option>
		<?php
		}
	} #while ($row_RS = mysql_fetch_assoc($RS)); mysql_free_result($RS);
	?>
</select>