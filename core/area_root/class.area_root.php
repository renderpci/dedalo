<?php

class area_root extends area_common {
	
	/*
	function __construct($id=NULL, $tipo=NULL, $mode=NULL) {	# section reference ($id=NULL, $tipo=NULL, $mode=NULL)

		# id and tipo are ignored ! (Only por section construct compatibility)
		# id is not aplicable (area have not matrix record)
		# tipo no is necessary, is fixed and calculated here by model name

		$model_name 	= get_class($this); // now 'area_root'
		$ar_tipo 		= RecordObj_dd::get_ar_terminoID_by_modelo_name($model_name, $prefijo='dd'); // now 'dd13' (Inventario)

		if(empty($ar_tipo[0])) throw new Exception(" ar_tipo is empty . tipo is mandatory to create this component $model_name ", 1);
		$tipo = $ar_tipo[0];

		parent::__construct($tipo, $mode);
	}
	*/


	


}
?>