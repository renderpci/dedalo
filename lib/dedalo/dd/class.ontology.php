<?php
require_once(DEDALO_LIB_BASE_PATH . '/dd/class.RecordObj_dd_edit.php');


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
	* IMPORT_TOOLS
	* Read all dedalo dir 'tools' subfolders and extract property 'ontology' from all 'info.json' files
	* Remove all previous values in database about tld 'tool' and insert safe renumerated all new structure terms
	* from imported ontologies
	* @return array $info_file_processed
	*	Array of objects
	*/
	public static function import_tools() {

		$info_file_processed = [];

		// tipos
			$tipo_label 	= 'dd1326';
			$tipo_ontology 	= 'dd1334';
			$tipo_version 	= 'dd1327';

		// get the all tools folders
			$ar_tools = (array)glob(DEDALO_LIB_BASE_PATH . '/tools/*', GLOB_ONLYDIR);



		// Ontologies. Get the all tools ontologies
			$counter = 0;
			$ar_ontologies 		 = [];
			$info_objects_parsed = [];
			foreach ($ar_tools as $current_dir_tool) {

				if (preg_match('/.*(\/acc|\/old)$/i', $current_dir_tool)) continue;

				$info_file = $current_dir_tool . '/info.json';
				if(!file_exists($info_file)){
					debug_log(__METHOD__." file info.json dont exist into $current_dir_tool".to_string(), logger::ERROR);
					continue;
				}

				// info object (JSON encoded)
					$info_object 	 = json_decode( file_get_contents($info_file) );
					$new_info_object = clone $info_object;

				// ontology from info object
					$current_ontology = ($info_object->components->{$tipo_ontology}->dato->{'lg-nolan'}) ?
						json_decode($info_object->components->{$tipo_ontology}->dato->{'lg-nolan'}) :
						null;

				if(!empty($current_ontology)){

					$new_ontology = ontology::renumerate_term_id($current_ontology, $counter);

					$ar_ontologies[] = $new_ontology;

					// update ontology
					$new_info_object->components->{$tipo_ontology}->dato->{'lg-nolan'} = json_encode($new_ontology);

				}else{

					debug_log(__METHOD__." The current info.json don't have ontology modificator ".to_string(), logger::ERROR);
				}

				// add info_objects_parsed
					$info_objects_parsed[] = $new_info_object;

				// info_file_processed
					$label   = reset($info_object->components->{$tipo_label}->dato->{'lg-nolan'});
					$version = reset($info_object->components->{$tipo_version}->dato->{'lg-nolan'});
					$info_file_processed[] = (object)[
						'dir'   	=> str_replace(DEDALO_LIB_BASE_PATH, '', $current_dir_tool),
						'label' 	=> $label,
						'version' 	=> $version
					];

			}//end foreach ($ar_tools)


		// DB Updates
			// structure
			if (!empty($ar_ontologies)) {

				// Clean. remove structure records in the database
					ontology::clean_structure_data();

				// import ontology (structure) in jer_dd
					foreach ($ar_ontologies as $current_ontology) {
						ontology::import($current_ontology);
					}

				// update counter at end to consolidate
					RecordObj_dd_edit::update_counter('tool', $counter-1);
			}

			// section
			if (!empty($info_objects_parsed)) {

				// Clean. remove tools section records in the database
					ontology::clean_section_tools_data();

				// import record (section tool1) in db matrix_tools
					$section_id_counter = 1; // first section_id to use
					foreach ($info_objects_parsed as $current_info_object) {
						ontology::import_info_object($current_info_object, $section_id_counter);
					}
			}


		// debug
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Imported $counter ontology items from dirs: ".json_encode($info_file_processed, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), logger::DEBUG);
			}


		return $info_file_processed;
	}//end import_tools



	/**
	* IMPORT_INFO_OBJECT
	* Info object is exactly a dedalo raw record data
	* @return bool true
	*/
	private static function import_info_object($info_object, &$section_id_counter) {

		// replace object section_id with new forced counter
		$info_object->section_id = $section_id_counter;
		$info_object->label 	 = 'Tools register';
		$datos 	 				 = json_handler::encode($info_object);
		$section_tools_tipo 	 = 'dd1324';

		$strQuery = 'INSERT INTO "matrix_tools" (section_id, section_tipo, datos) VALUES ($1, $2, $3) RETURNING id';
		$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $section_id_counter, $section_tools_tipo, $datos ));

		// update counter on every imported record
		counter::update_counter($section_tools_tipo, $matrix_table='matrix_counter', $current_value=$section_id_counter);

		// if all is ok, update counter value
		$section_id_counter++;

		return true;
	}//end import_info_object



	/**
	* CLEAN_STRUCTURE_DATA
	* @return bool true
	*/
	private static function clean_structure_data() {

		// structure
			$ar_term_id	= [];
			$sql_query = 'SELECT "terminoID" FROM "jer_dd" WHERE "tld" = \'tool\' ';
			$result = pg_query(DBi::_getConnection(), $sql_query);
			while ($rows = pg_fetch_assoc($result)) {
				$ar_term_id[] = $rows['terminoID'];
			}

			if(!empty($ar_term_id)){

				// delete terms (jer_dd)
					$sql_query 			= 'DELETE FROM "jer_dd" WHERE "tld" = \'tool\' ';
					$result_delete_jer 	= pg_query(DBi::_getConnection(), $sql_query);

				// delete descriptors (matrix_descriptors_dd)
					$ar_filter = array_map(function($term_id){
						return 'parent=\''.$term_id.'\'';
					}, $ar_term_id);
					$filter = implode(' OR ', $ar_filter);

					$delete_sql_descriptors 	= 'DELETE FROM "matrix_descriptors_dd" WHERE ' .$filter;
					$result_delete_descriptors 	= pg_query(DBi::_getConnection(), $delete_sql_descriptors);

				// reset the tool counter
					$sql_reset_counter 	  = 'DELETE FROM "main_dd" WHERE "tld" = \'tool\';';
					$result_reset_counter = pg_query(DBi::_getConnection(), $sql_reset_counter);
			}

		return true;
	}//end clean_structure_data



	/**
	* CLEAN_SECTION_TOOLS_DATA
	* @return bool true
	*/
	private static function clean_section_tools_data() {

		// section
			$section_tools_tipo 	= 'dd1324';
			$sql_query 				= 'DELETE FROM "matrix_tools" WHERE "section_tipo" = \''.$section_tools_tipo.'\';';
			$result_delete_section 	= pg_query(DBi::_getConnection(), $sql_query);

			// reset counter
			$sql_reset_counter 	  	= 'DELETE FROM "matrix_counter" WHERE "tipo" = \''.$section_tools_tipo.'\';';
			$result_reset_counter 	= pg_query(DBi::_getConnection(), $sql_reset_counter);

		return true;
	}//end clean_section_tools_data



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

