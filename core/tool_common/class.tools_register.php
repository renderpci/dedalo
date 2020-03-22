<?php
#require_once(DEDALO_CORE_PATH . '/dd/class.RecordObj_dd_edit.php');
require_once(DEDALO_CORE_PATH . '/dd/class.ontology.php');

/**
* ONTOLOGY
* Manages structure (ontology) import and export data
* Useful for developers to create tools structure data
*/
class tools_register {


	static $section_tools_tipo = 'dd1324';


	/**
	* IMPORT_TOOLS
	* Read all dedalo dir 'tools' subfolders and extract property 'ontology' from all 'register.json' files
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
			$ar_tools = (array)glob(DEDALO_CORE_PATH . '/tools/*', GLOB_ONLYDIR);


		// Ontologies. Get the all tools ontologies
			$counter = 0;
			$ar_ontologies 		 = [];
			$info_objects_parsed = [];
			foreach ($ar_tools as $current_dir_tool) {

				// ignore folders with name different from pattern 'tool_*'
				if (1!==preg_match('/tool_*/', $current_dir_tool, $output_array)) continue;

				// info_file register.json file check
					$info_file = $current_dir_tool . '/register.json';
					if(!file_exists($info_file)){
						debug_log(__METHOD__." file register.json dont exist into $current_dir_tool".to_string(), logger::ERROR);
						continue;
					}

				// info object (JSON encoded)
					if( !$info_object = json_decode( file_get_contents($info_file) ) ){
						debug_log(__METHOD__." wrong file register.json . Is not json valid file ".to_string(), logger::ERROR);
						continue;
					}

					$new_info_object = clone $info_object;

				// ontology from info object
					$current_ontology = (isset($info_object->components->{$tipo_ontology}->dato->{'lg-nolan'}))
						? $info_object->components->{$tipo_ontology}->dato->{'lg-nolan'}
						: null;

				if(!empty($current_ontology)){

					$new_ontology = tools_register::renumerate_term_id($current_ontology, $counter);

					$ar_ontologies[] = $new_ontology;

					// update ontology
					$new_info_object->components->{$tipo_ontology}->dato->{'lg-nolan'} = $new_ontology;

				}else{

					debug_log(__METHOD__." The current register.json don't have ontology data ".to_string($current_dir_tool), logger::WARNING);
				}

				// add info_objects_parsed
					$info_objects_parsed[] = $new_info_object;

				// info_file_processed
					$label   = reset($info_object->components->{$tipo_label}->dato->{'lg-nolan'});
					$version = reset($info_object->components->{$tipo_version}->dato->{'lg-nolan'});
					$info_file_processed[] = (object)[
						'dir'   	=> str_replace(DEDALO_CORE_PATH, '', $current_dir_tool),
						'label' 	=> $label,
						'version' 	=> $version
					];

			}//end foreach ($ar_tools)


		// DB Updates
			// structure
			if (!empty($ar_ontologies)) {

				// Clean. remove structure records in the database
					ontology::clean_structure_data('tool');

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
					tools_register::clean_section_tools_data();

				// import record (section tool1) in db matrix_tools
					$section_id_counter = 1; // first section_id to use
					foreach ($info_objects_parsed as $current_info_object) {

						// save new record with serialized section_id
						$created_section_id = tools_register::import_info_object($current_info_object, $section_id_counter);

						// build tool_object (simple)
						$tool_object = tools_register::parse_tool_object(tools_register::$section_tools_tipo, $created_section_id);

						// tool_obj . Set and save updated section
							$component_tipo = 'dd1353';
							$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
							$component 		= component_common::get_instance($model,
																			 $component_tipo,
																			 $created_section_id,
																			 'list',
																			 DEDALO_DATA_NOLAN,
																			 tools_register::$section_tools_tipo);
							$component->set_dato([$tool_object]);
							$component->save();
					}
			}

		// session. Remove previous stored data in session
			unset($_SESSION['dedalo']['registered_tools']);


		// debug
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Imported ".($counter+1)." ontology items from dirs: ".json_encode($info_file_processed, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), logger::DEBUG);
			}


		return $info_file_processed;
	}//end import_tools



	/**
	* PARSE_TOOL_OBJECT
	* Build a tool object from section tools register development
	*
	* @param object $current_info_object
	*	Full dedalo section data object from one record
	* @return object $tool_object
	*	Simple and human readable json object to use with components, sections, areas..
	*/
	public static function parse_tool_object($section_tipo, $section_id) {

		$tool_object = new stdClass();

			$tool_object->section_tipo 	= $section_tipo;
			$tool_object->section_id 	= $section_id;

		// name
			$component_tipo = 'dd1326';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$dato 	= $component->get_dato();
			$value 	= reset($dato);
			$tool_object->name = $value;


		// label
			$component_tipo = 'dd799';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$dato 			= $component->get_dato_full();
			$value 			= [];
			foreach ($dato as $curent_lang => $current_value) {
				$value[] = (object)[
					'lang'  => $curent_lang,
					'value' => reset($current_value)
				];
			}
			$tool_object->label = $value;

		// version
			$component_tipo = 'dd1327';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$dato 	= $component->get_dato();
			$value 	= reset($dato);
			$tool_object->vesion = $value;

		// dedalo version (minimal requeriment)
			$component_tipo = 'dd1328';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$dato 	= $component->get_dato();
			$value 	= reset($dato);
			$tool_object->dd_version = $value;

		// affected components (models)
			$component_tipo = 'dd1330';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$value 			= $component->get_valor(DEDALO_DATA_LANG, 'array');
			$tool_object->affected_models = $value;

		// description
			$component_tipo = 'dd612';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);

			$dato 			= $component->get_dato_full();
			$value 			= [];
			foreach ($dato as $curent_lang => $current_value) {
				$value[] = (object)[
					'lang'  => $curent_lang,
					'value' => $current_value
				];
			}
			$tool_object->description = $value;

		// affected components (tipos)
			$component_tipo = 'dd1350';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$value 			= $component->get_dato() ?? [];
			$tool_object->affected_tipos = $value;

		// show in inspector
			$component_tipo = 'dd1331';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$dato 			= $component->get_dato();
			$dato_ref 		= reset($dato)->section_id;
			$value 			= $dato_ref == '1' ? true : false;
			$tool_object->show_in_inspector = $value;

		// show in component
			$component_tipo = 'dd1332';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$dato 			= $component->get_dato();
			$dato_ref 		= reset($dato)->section_id;
			$value 			= $dato_ref == '1' ? true : false;
			$tool_object->show_in_component = $value;

		// requirement translatable
			$component_tipo = 'dd1333';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$dato 			= $component->get_dato();
			$dato_ref 		= empty($dato) ? '0' : (reset($dato)->section_id);
			$value 			= $dato_ref == '1' ? true : false;
			$tool_object->requirement_translatable = $value;

		// ontology
			$component_tipo = 'dd1334';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$value 			= $component->get_dato();
			$tool_object->ontology = $value;


		// properties
			$component_tipo = 'dd1335';
			$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $section_tipo);
			$dato 			= (array)$component->get_dato();
			$value 			= reset($dato);
			$tool_object->properties = $value;

		// config from tools_config files
			$tool_object->config = new stdClass();
			$tool_config_file_path = DEDALO_CONFIG_PATH . '/tools/' . 'config_' .$tool_object->name . '.json';
			if (file_exists($tool_config_file_path)) {
				try{
					$tool_config_file_obj = json_decode( file_get_contents($tool_config_file_path) );
					$tool_object->config  = $tool_config_file_obj;
				} catch (Exception $e) {
					debug_log(__METHOD__." Wrong config json content ".$e->getMessage(), logger::ERROR);
				}
			}


		// // config
		// 	$config_raw = file_get_contents(DEDALO_CONFIG_PATH.'/tools/config_'.$tool_object->name.'.json');
		// 	$tool_object->config = ($config_raw!==false) ? json_decode($config_raw) : null;


		return $tool_object;
	}//end parse_tool_object



	/**
	* IMPORT_INFO_OBJECT
	* Info object is exactly a dedalo raw record data
	* @return int $section_id
	*/
	private static function import_info_object($info_object, &$section_id_counter) {

		// replace object section_id with new forced counter
		$info_object->section_id = $section_id_counter;
		$info_object->label 	 = 'Tools register';
		$datos 	 				 = json_handler::encode($info_object);
		$section_tools_tipo 	 = tools_register::$section_tools_tipo; //  'dd1324';

		$strQuery = 'INSERT INTO "matrix_tools" (section_id, section_tipo, datos) VALUES ($1, $2, $3) RETURNING section_id';
		$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $section_id_counter, $section_tools_tipo, $datos ));

		// update counter on every imported record
		counter::update_counter($section_tools_tipo, $matrix_table='matrix_counter', $current_value=$section_id_counter);

		// if all is ok, update counter value
		$section_id_counter++;

		$section_id = pg_fetch_result($result,0,'section_id');

		return $section_id;
	}//end import_info_object



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
	* @return object $ontology
	*/
	public static function renumerate_term_id($ontology, &$counter) {

		foreach ($ontology as $item) {

			// bad ontology error skip
				if (!isset($item->tipo)) {
					debug_log(__METHOD__." Skipped wrong ontology. ontology tipo is not set +++++++++++++++++++++++++++++++++++++++++++++ ".to_string(), logger::ERROR);
					continue;
				}

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

