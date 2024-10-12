<?php
$modeloGet = (isset($_REQUEST['modelo']))
	? safe_xss($_REQUEST['modelo'])
	: $modelo ?? false;


$RecordObj_dd	= new RecordObj_dd_edit(null,'dd');
$ar_all_modelos = $RecordObj_dd->get_ar_all_modelos();


# ordenamos alfabéticamente los modelos
$ar_all_models_ordered = (function() use($ar_all_models){

	$sorted_models = [];

	foreach($ar_all_models as $modeloID) {

		if($modeloID==='dd2') {
			# filtramos el registro autointroducido al crear la tabla ( dd2 )
			continue;
		}

		$model_current_RecordObj_dd	= new RecordObj_dd_edit($modeloID);
		$current_visible			= $model_current_RecordObj_dd->get_visible();
		if ($current_visible!=='si') {
			continue;
		}
		// add
		$sorted_models[$modeloID] = RecordObj_dd_edit::get_termino_by_tipo($modeloID);
	}
	asort($sorted_models);

	return $sorted_models;
})();
?>
<select name="modelo" id="modelo" class="model_selector">
	<option value="" <?php if (!(strcmp("", $modeloGet))) {echo "selected=\"selected\"";} ?> > </option>
	<?php foreach($ar_all_models_ordered as $modeloID => $modelo) { ?>
		<option value="<?php echo $modeloID ?>" <?php if (!(strcmp($modeloID, $modeloGet))) {echo "selected=\"selected\"";} ?> >
			<?php echo $modelo; if(SHOW_DEBUG==true) echo " [$modeloID]" ;?>
		</option>
	<?php }	?>
</select>
