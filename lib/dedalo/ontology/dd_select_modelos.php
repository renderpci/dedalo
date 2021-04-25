<?php
$modeloGet = (isset($_REQUEST['modelo']))
	? safe_xss($_REQUEST['modelo'])
	: $modelo ?? false;

$RecordObj_dd	= new RecordObj_dd(null,'dd');
$ar_all_modelos = $RecordObj_dd->get_ar_all_modelos();


# ordenamos alfabéticamente los modelos
$ar_all_modelos_ordered = array();
foreach($ar_all_modelos as $modeloID) {

	if($modeloID==='dd2') { 
		# filtramos el registro autointroducido al crear la tabla ( dd2 ) 
		continue;
	}
	
	$current_RecordObj_dd	= new RecordObj_dd($modeloID);
	$visible				= $current_RecordObj_dd->get_visible();
	if ($visible!=='si') {
		continue;
	}
	// add
	$ar_all_modelos_ordered[$modeloID] = RecordObj_dd::get_termino_by_tipo($modeloID);	
}
asort($ar_all_modelos_ordered);
?>
<select name="modelo" id="modelo" class="model_selector">
	<option value="" <?php if (!(strcmp("", $modeloGet))) {echo "selected=\"selected\"";} ?> > </option>
	<?php foreach($ar_all_modelos_ordered as $modeloID => $modelo) { ?>
		<option value="<?php echo $modeloID ?>" <?php if (!(strcmp($modeloID, $modeloGet))) {echo "selected=\"selected\"";} ?> >
			<?php echo $modelo; if(SHOW_DEBUG==true) echo " [$modeloID]" ;?>
		</option>
	<?php }	?>
</select>