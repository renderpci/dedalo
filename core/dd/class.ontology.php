<?php
require_once(DEDALO_CORE_PATH . '/dd/class.RecordObj_dd_edit.php');


/**
* ONTOLOGY
* Manages structure (ontology) import and export data
* Useful for developers to create tools structure data
*/
class ontology {



	/**
	* EXPORT
	* @return object $data
	*/
	public static function export($tipo) {

		$data = ontology::parse($tipo);

		return $data;
	}//end export



	/**
	* PARSE
	* Get and convert ontology term and childrens to file in JSON format
	* @return
	*/
	public static function parse($tipo) {

		$ar_data = [];

		// current term data
			$item = ontology::tipo_to_json_item($tipo);
			$ar_data[] = $item;

		// childrens
			$childrens = RecordObj_dd::get_ar_recursive_childrens($tipo);
			foreach ($childrens as $children_tipo) {
				$ar_data[] = ontology::tipo_to_json_item($children_tipo);
			}

		#dump($ar_data, '$ar_data ++ '.to_string());

		return $ar_data;
	}//end parse



	/**
	* TIPO_TO_JSON_ITEM
	* Resolve full ontology item data from tipo
	* @param string $tipo
	* @return object $item
	*/
	public static function tipo_to_json_item($tipo) {

		$RecordObj_dd = new RecordObj_dd($tipo);
		$RecordObj_dd->get_dato();

		// descriptors
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

		// relations
			$current_relations = $RecordObj_dd->get_relaciones();
			if (!empty($current_relations)) {

				$relations = array_map(function($element){
					$element = is_array($element) ? (object)$element : $element;
					$current_obj = new stdClass();
						$current_obj->tipo = property_exists($element, 'tipo') ? $element->tipo : reset($element);
	    			return $current_obj;
	    		}, $current_relations);
			}

		$item = (object)[
			'tipo' 			=> $tipo,
			'tld' 			=> $RecordObj_dd->get_tld(),
			'is_model' 		=> $RecordObj_dd->get_esmodelo(),
			'model' 		=> RecordObj_dd::get_modelo_name_by_tipo($tipo,true),
			'model_tipo' 	=> $RecordObj_dd->get_modelo(),
			'parent' 		=> $RecordObj_dd->get_parent(),
			'order' 		=> (int)$RecordObj_dd->get_norden(),
			'translatable' 	=> $RecordObj_dd->get_traducible()==='si',
			'properties' 	=> $RecordObj_dd->get_propiedades(true),
			'relations' 	=> $relations ?? null,
			'descriptors' 	=> $ar_descriptors
		];
		#dump($item, ' item ++ '.PHP_EOL.json_encode($item, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

		return $item;
	}//end tipo_to_json_item



	/**
	* IMPORT
	* Create one NEW term for each onomastic item in data.
	* (!) Note that is important clean old terms before because current funtion don't
	* update terms, only insert new terms (!)
	* @return bool true
	*/
	public static function import(array $data) {

		foreach ($data as $key => $item) {

			// term. jer_dd
				$esmodelo 	= $item->is_model ?? 'no';
				$traducible = $item->translatable===true ? 'si' : 'no';

				$RecordObj_dd_edit = new RecordObj_dd_edit(null, $item->tld);

				$RecordObj_dd_edit->set_terminoID($item->tipo);
				$RecordObj_dd_edit->set_esdescriptor('si');
				$RecordObj_dd_edit->set_esdescriptor('si');
				$RecordObj_dd_edit->set_visible('si');
				$RecordObj_dd_edit->set_parent($item->parent);
				$RecordObj_dd_edit->set_esmodelo($esmodelo);
				$RecordObj_dd_edit->set_norden($item->order);
				$RecordObj_dd_edit->set_traducible($traducible);
				$RecordObj_dd_edit->set_relaciones($item->relations);
				$RecordObj_dd_edit->set_propiedades($item->properties);
				$RecordObj_dd_edit->set_modelo($item->model_tipo);
				$RecordObj_dd_edit->set_tld($item->tld);

				$term_id = $RecordObj_dd_edit->Save();

			// descriptors
				$descriptors = $item->descriptors;
				foreach ($descriptors as $current_descriptor) {

					$term = $current_descriptor->type==='term' ? 'termino' : $current_descriptor->type;

					$RecordObj_descriptors_dd = new RecordObj_descriptors_dd(
						'matrix_descriptors_dd', null, $item->tipo, $current_descriptor->lang, $term
					);

					$RecordObj_descriptors_dd->set_dato($current_descriptor->value);
					$RecordObj_descriptors_dd->Save();

				}// end foreach ($descriptors)

		}//end foreach ($data as $key => $item)


		return true;
	}//end import



	/**
	* CLEAN_STRUCTURE_DATA
	* @return bool true
	*/
	public static function clean_structure_data($tld) {

		// structure
			$ar_term_id	= [];
			$sql_query = 'SELECT "terminoID" FROM "jer_dd" WHERE "tld" = \''.$tld.'\' ';
			$result = pg_query(DBi::_getConnection(), $sql_query);
			while ($rows = pg_fetch_assoc($result)) {
				$ar_term_id[] = $rows['terminoID'];
			}

			if(!empty($ar_term_id)){

				// delete terms (jer_dd)
					$sql_query 			= 'DELETE FROM "jer_dd" WHERE "tld" = \''.$tld.'\' ';
					$result_delete_jer 	= pg_query(DBi::_getConnection(), $sql_query);

				// delete descriptors (matrix_descriptors_dd)
					$ar_filter = array_map(function($term_id){
						return 'parent=\''.$term_id.'\'';
					}, $ar_term_id);
					$filter = implode(' OR ', $ar_filter);

					$delete_sql_descriptors 	= 'DELETE FROM "matrix_descriptors_dd" WHERE ' .$filter;
					$result_delete_descriptors 	= pg_query(DBi::_getConnection(), $delete_sql_descriptors);

				// reset the tool counter
					$sql_reset_counter 	  = 'DELETE FROM "main_dd" WHERE "tld" = \''.$tld.'\' ';
					$result_reset_counter = pg_query(DBi::_getConnection(), $sql_reset_counter);
			}

		return true;
	}//end clean_structure_data

	

	/**
	* RENUMERATE_TERM_ID
	* @return
	*/
	public static function renumerate_term_id($ontology, &$counter) {

		foreach ($ontology as $item) {
			$tipo = $item->tipo;
			$ar_items_childrens = array_filter($ontology, function($current_element) use($tipo){
				return $current_element->parent === $tipo;
			});
			$new_tld = 'tool'.++$counter;

			$item->tipo = $new_tld;
			$item->tld 	= 'tool';

			foreach ($ar_items_childrens as $key => $current_element) {
				$ontology[$key]->parent = $new_tld;
			}
		}

		return $ontology;
	}//end renumerate_term_id



}//end ontology


/*
DBi::_getConnection();
include('class.RecordObj_dd_edit.php');
$ontology_data = json_decode('[
  {
    "tipo": "oh81",
    "tld": "oh",
    "model": "section_tool",
    "model_tipo": "dd125",
    "parent": "oh80",
    "order": 1,
    "translatable": false,
    "properties": {
      "context": {
        "context_name": "section_tool",
        "tool_section_tipo": "oh81",
        "top_tipo": "oh1",
        "target_section_tipo": "rsc167",
        "target_component_tipo": "rsc35",
        "target_tool": "tool_transcription",
        "prueba":"Hola test 7"
      }
    },
    "relations": null,
    "descriptors": [
      {
        "value": "Transcription nuevisimo",
        "lang": "lg-eng",
        "type": "term"
      },
      {
        "value": "Transcripción entrevistas",
        "lang": "lg-spa",
        "type": "term"
      },
      {
        "value": "Transcripció dentrevistes",
        "lang": "lg-cat",
        "type": "term"
      },
      {
        "value": "Μεταγραφή συνεντεύξεις",
        "lang": "lg-ell",
        "type": "term"
      }
    ]
  },
  {
    "tipo": "oh82",
    "tld": "oh",
    "model": "section_list",
    "model_tipo": "dd91",
    "parent": "oh81",
    "order": 1,
    "translatable": false,
    "properties": null,
    "relations": [
      {
        "tipo": "rsc21"
      },
      {
        "tipo": "rsc19"
      },
      {
        "tipo": "rsc23"
      },
      {
        "tipo": "rsc263"
      },
      {
        "tipo": "rsc36"
      },
      {
        "tipo": "rsc244"
      },
      {
        "tipo": "rsc35"
      }
    ],
    "descriptors": [
      {
        "value": "Listado",
        "lang": "lg-spa",
        "type": "term"
      },
      {
        "value": "Llistat",
        "lang": "lg-cat",
        "type": "term"
      },
      {
        "value": "List",
        "lang": "lg-eng",
        "type": "term"
      }
    ]
  }
]');
#ontology::import($ontology_data);
ontology::import_tools();
*/

