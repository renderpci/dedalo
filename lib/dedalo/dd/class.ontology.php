<?php

class ontology {


	/**
	* EXPORT
	* Get and convert ontology term and childrens to file in JSON format
	* @return
	*/
	public static function export($tipo) {

		// current tipo data
			$item = ontology::tipo_to_json_item($tipo);


	}//end export



	/**
	* TIPO_TO_JSON_ITEM
	* @return
	*/
	public static function tipo_to_json_item($tipo) {

		$RecordObj_dd = new RecordObj_dd($tipo);
		$RecordObj_dd->get_dato();

		$translatable = (bool)$RecordObj_dd->get_traducible()!=='no';

		$strQuery = "SELECT dato, tipo, lang FROM \"matrix_descriptors_dd\" WHERE parent = '$tipo'";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		$ar_descriptors = [];
		while ($row = pg_fetch_assoc($result)) {

			$type = $row['tipo']==='termino' ? 'term' : $row['tipo'];

			$ar_descriptors[] = (object)[
				'value' => $row['dato'],
				'lang' 	=> $row['lang'],
				'type' 	=> $type
			];
		}
		#dump($ar_descriptors, ' ar_descriptors ++ '.to_string());

		$item = (object)[
			'tipo' 			=> $tipo,
			'tld' 			=> $RecordObj_dd->get_tld(),
			'model' 		=> RecordObj_dd::get_modelo_name_by_tipo($tipo,true),
			'model_tipo' 	=> $RecordObj_dd->get_modelo(),
			'parent' 		=> $RecordObj_dd->get_parent(),
			'order' 		=> (int)$RecordObj_dd->get_norden(),
			'translatable' 	=> $translatable,
			'properties' 	=> $RecordObj_dd->get_propiedades(true),
			'relations' 	=> $RecordObj_dd->get_relaciones(),
			'descriptors' 	=> $ar_descriptors
		];
		dump($item, ' item ++ '.json_encode($item, JSON_PRETTY_PRINT));


	}//end tipo_to_json_item

}
