<?php
/**
* CLASS SECTION_TM
*
*
*/
class section_tm extends common {



	# properties
	protected $section_id;
	protected $tipo;
	protected $modo;
	protected $lang;
	protected $dato;


	// whole database record, with all columns
	public $record;

	// whole request context
	public $base_context;



	/**
	* GET_INSTANCE
    * Singleton pattern
    * @returns array array of section objects by key
    */
    public static function get_instance($section_id=null, $tipo=false, $modo='tm', $cache=false) {

		$instance = new section_tm($section_id, $tipo, $modo);

		return $instance;
    }//end get_instance



    /**
	* CONSTRUCT
	* Extends parent abstract class common
	* La sección, a diferencia de los componentes, se comporta de un modo particular:
	* Si se le pasa sólo el tipo, se espera un listado (modo list)
	* Si se le pasa sólo el section_id, se espera una ficha (modo edit)
	*/
	private function __construct($section_id=null, $tipo=false, $modo='edit') {

		if ($tipo===false) {
			throw new Exception("Error: on construct section : tipo is mandatory. section_id:$section_id, tipo:$tipo, modo:$modo", 1);
		}

		// Set general vars
			$this->lang 		= DEDALO_DATA_NOLAN;
			$this->section_id 	= $section_id;
			$this->tipo 		= $tipo;
			$this->modo 		= $modo;


		return true;
	}//end __construct



	/**
	* GET_CONTEXT
	* Get injected basic context and add fixes ddo elements MODIFIED_BY_USER and MODIFIED_DATE
	* @return array $context
	*/
	// public function get_context() {

	// 	// base context is injected in sections josn controller
	// 	$context = [];


	// 	// component
	// 		$item = (object)[
	// 			'model' 		=> 'component_select',
	// 			'tipo'			=> DEDALO_SECTION_INFO_MODIFIED_BY_USER,
	// 			'section_tipo'	=> $this->tipo,
	// 			'label'			=> RecordObj_dd::get_termino_by_tipo(DEDALO_SECTION_INFO_MODIFIED_BY_USER, DEDALO_DATA_LANG, true, true),
	// 			'mode'			=> 'list',
	// 			'parent'		=> $this->tipo,
	// 			'typo'			=> 'ddo',
	// 			'type'			=> 'component'
	// 		];
	// 		array_unshift($context, $item);


	// 			    "model": "component_input_text",
	// 			    "tipo": "test159",
	// 			    "section_tipo": "test65",
	// 			    "mode": "list",
	// 			    "parent": "test158",
	// 			    "typo": "ddo",
	// 			    "type": "component",
	// 			    "label": "Input text X",
	// 			    "debug_from": "calculated from section list or related terms"
	// 			  }



	// 	// modification user id
	// 		// prepend element to context
	// 		$item = (object)[
	// 			'model' 		=> 'component_select',
	// 			'tipo'			=> DEDALO_SECTION_INFO_MODIFIED_BY_USER,
	// 			'section_tipo'	=> $this->tipo,
	// 			'label'			=> RecordObj_dd::get_termino_by_tipo(DEDALO_SECTION_INFO_MODIFIED_BY_USER, DEDALO_DATA_LANG, true, true),
	// 			'mode'			=> 'list',
	// 			'parent'		=> $this->tipo,
	// 			'typo'			=> 'ddo',
	// 			'type'			=> 'component'
	// 		];
	// 		array_unshift($context, $item);


	// 	// modification date
	// 		// prepend element to context
	// 		$item = (object)[
	// 			'model' 		=> 'component_date',
	// 			'tipo'			=> DEDALO_SECTION_INFO_MODIFIED_DATE,
	// 			'section_tipo'	=> $this->tipo,
	// 			'label'			=> RecordObj_dd::get_termino_by_tipo(DEDALO_SECTION_INFO_MODIFIED_DATE, DEDALO_DATA_LANG, true, true),
	// 			'mode'			=> 'list',
	// 			'parent'		=> $this->tipo,
	// 			'typo'			=> 'ddo',
	// 			'type'			=> 'component'
	// 		];
	// 		array_unshift($context, $item);


	// 	return (array)$context;
	// }//end get_context



	/**
	* GET_CONTEXT
	* Get injected basic context and add fixes ddo elements MODIFIED_BY_USER and MODIFIED_DATE
	* @return array $context
	*/
	public function get_context() {

		$found_sources = array_filter($this->base_context, function($element){
			if (isset($element->typo) && $element->typo==='source') {
				return $element;
			}
		});
		$source = reset($found_sources);

		$component_tipo = $source->tipo;
		$component_lang = $source->lang;
		$pagination 	= $source->pagination;


		$context = [];

		// sqo
			$item = (object)[
				'typo'				 => 'sqo',
				'id'				 => 'tmp',
				'mode'				 => 'tm',
				'section_tipo'		 => [$this->tipo],
				'filter_by_locators' => [(object)[
					'section_tipo' 		=> $this->tipo,
					'section_id' 		=> $this->section_id,
					'tipo' 		 		=> $component_tipo,
					'lang' 		 		=> $component_lang
				]],
				'full_count' 		 => false,
				'limit' 			 => 10,
				'offset' 			 => 0,
				'order' 			 => json_decode('[{
					direction : "DESC",
					path	  : [{component_tipo: "id"}]
				}]')
			];
			$context[] = $item;

		// section
			$item = (object)[
				'typo'				=> 'ddo',
				'type'				=> 'section',
				'model' 			=> 'section_tm',
				'tipo'				=> $this->tipo,
				'section_tipo'		=> $this->tipo,
				'label'				=> RecordObj_dd::get_termino_by_tipo($this->tipo, DEDALO_DATA_LANG, true, true),
				'mode'				=> 'tm',
				'parent'			=> null
			];
			$context[] = $item;

		// source
			$item = (object)[
				'typo'				=> 'source',
				'action'			=> 'search',
				'model' 			=> 'section_tm',
				'tipo'				=> $component_tipo,
				'section_tipo'		=> $this->tipo,
				'section_id'		=> $this->section_id,
				'component_tipo'  	=> $component_tipo,
				'mode'				=> 'tm',
				'lang'				=> $component_lang,
				'pagination' 		=> $pagination
			];
			$context[] = $item;


		// matrix id
			$item = (object)[
				'typo'				=> 'ddo',
				'type'				=> 'component',
				'model' 			=> 'component_section_id',
				'tipo'				=> 'test142',//	'section_id',
				'section_tipo'		=> $this->tipo,
				'label'				=> 'matrix ID',
				'mode'				=> 'list',
				'parent'			=> $this->tipo
			];
			$context[] = $item;


		// modification date
			$item = (object)[
				'typo'				=> 'ddo',
				'type'				=> 'component',
				'model' 			=> 'component_date',
				'tipo'				=> DEDALO_SECTION_INFO_MODIFIED_DATE,
				'section_tipo'		=> $this->tipo,
				'label'				=> RecordObj_dd::get_termino_by_tipo(DEDALO_SECTION_INFO_MODIFIED_DATE, DEDALO_DATA_LANG, true, true),
				'mode'				=> 'list',
				'parent'			=> $this->tipo
			];
			$context[] = $item;


		// modification user id
			$item = (object)[
				'typo'				=> 'ddo',
				'type'				=> 'component',
				'model' 			=> 'component_select',
				'tipo'				=> DEDALO_SECTION_INFO_MODIFIED_BY_USER,
				'section_tipo'		=> $this->tipo,
				'label'				=> RecordObj_dd::get_termino_by_tipo(DEDALO_SECTION_INFO_MODIFIED_BY_USER, DEDALO_DATA_LANG, true, true),
				'mode'				=> 'list',
				'parent'			=> $this->tipo
			];
			$context[] = $item;


		// component
			$item = (object)[
				'typo'				=> 'ddo',
				'type'				=> 'component',
				'model' 			=> RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true),
				'tipo'				=> $component_tipo,
				'section_tipo'		=> $this->tipo,
				'label'				=> RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true),
				'mode'				=> 'list',
				'parent'			=> $this->tipo
			];
			$context[] = $item;


		return (array)$context;
	}//end get_context



	/**
	* GET_CONTEXT
	* Get injected basic context and add fixes ddo elements MODIFIED_BY_USER and MODIFIED_DATE
	* @return array $context
	*/
	public function get_context__DES() {

		// base context is injected in sections josn controller.
		// Called for the first time, it does not contain fixed elements.
			$context = $this->get_base_context();


		// check already defined fixed elements
			$found_fixed_elements = array_filter($context, function($element){
				if (isset($element->tipo) && $element->tipo===DEDALO_SECTION_INFO_MODIFIED_BY_USER) {
					return $element;
				}
			});
			if (empty($found_fixed_elements)) {

				// modification user id
					// prepend element to context
					$item = (object)[
						'typo'			=> 'ddo',
						'type'			=> 'component',
						'model' 		=> 'component_select',
						'tipo'			=> DEDALO_SECTION_INFO_MODIFIED_BY_USER,
						'section_tipo'	=> $this->tipo,
						'label'			=> RecordObj_dd::get_termino_by_tipo(DEDALO_SECTION_INFO_MODIFIED_BY_USER, DEDALO_DATA_LANG, true, true),
						'mode'			=> 'list',
						'parent'		=> $this->tipo
					];
					array_unshift($context, $item);


				// modification date
					// prepend element to context
					$item = (object)[
						'typo'			=> 'ddo',
						'type'			=> 'component',
						'model' 		=> 'component_date',
						'tipo'			=> DEDALO_SECTION_INFO_MODIFIED_DATE,
						'section_tipo'	=> $this->tipo,
						'label'			=> RecordObj_dd::get_termino_by_tipo(DEDALO_SECTION_INFO_MODIFIED_DATE, DEDALO_DATA_LANG, true, true),
						'mode'			=> 'list',
						'parent'		=> $this->tipo
					];
					array_unshift($context, $item);


				// matrix id
					// prepend element to context
					$item = (object)[
						'typo'			=> 'ddo',
						'type'			=> 'component',
						'model' 		=> 'component_section_id',
						'tipo'			=> 'test142',//	'section_id',
						'section_tipo'	=> $this->tipo,
						'label'			=> 'matrix ID',
						'mode'			=> 'list',
						'parent'		=> $this->tipo
					];
					array_unshift($context, $item);
			}


		return (array)$context;
	}//end get_context



	/**
	* GET_AR_SUBDATA
	* Resolve requested component data and the fixed ddo elements MODIFIED_BY_USER and MODIFIED_DATE
	* @return array $data
	*/
	public function get_ar_subdata($value=null) {

		$data = [];

		$current_record = $this->get_record();

		// subdata time machine
			$section_id   	= $current_record->section_id;
			$section_tipo 	= $current_record->section_tipo;
			$tipo 			= $current_record->tipo;
			$lang 			= $current_record->lang;
			$id 			= $current_record->id;
			$timestamp 		= $current_record->timestamp;
			$user_id 		= $current_record->userID;
			$component_dato	= json_decode($current_record->dato);

		// component
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true); // date
			$component 		= component_common::get_instance($modelo_name,
															 $tipo,
															 $section_id,
															 'list',
															 $lang,
															 $section_tipo);
			$component->set_dato($component_dato);

			// get component json
				$get_json_options = new stdClass();
					$get_json_options->get_context 	= false;
					$get_json_options->get_data 	= true;
				$element_json = $component->get_json($get_json_options);

			// edit section_id to match section locator data item
				$current_item = reset($element_json->data);
					$current_item->matrix_id = $current_record->id;

			$data[] = $current_item;

		// timestamp
			$timestamp_tipo = DEDALO_SECTION_INFO_MODIFIED_DATE; // 'dd201' Modification date

			// dato
			$dd_date = new dd_date();
				$date = $dd_date->get_date_from_timestamp( $timestamp );
			$date_value = new stdClass();
				$date_value->start = $date;
			$component_dato = [$date_value];

			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($timestamp_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $timestamp_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$component->set_dato($component_dato);

			// get component json
				$get_json_options = new stdClass();
					$get_json_options->get_context 	= false;
					$get_json_options->get_data 	= true;
				$element_json = $component->get_json($get_json_options);

			// edit section_id to match section locator data item
				$current_item = reset($element_json->data);
					$current_item->matrix_id = $current_record->id;

			$data[] = $current_item;

		// user_id
			$user_id_tipo = DEDALO_SECTION_INFO_MODIFIED_BY_USER; // 'dd197' Modified by user

			// dato
			$locator = new locator();
				$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
				$locator->set_section_id($user_id);
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$component_dato = [$locator];

			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($user_id_tipo,true); // select
			$component 		= component_common::get_instance($modelo_name,
															 $user_id_tipo,
															 $section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$component->set_dato($component_dato);

			// get component json
				$get_json_options = new stdClass();
					$get_json_options->get_context 	= false;
					$get_json_options->get_data 	= true;
				$element_json = $component->get_json($get_json_options);

			// edit section_id to match section locator data item
				$current_item = reset($element_json->data);
					$current_item->matrix_id = $current_record->id;

			// {
			//     "section_id": "1",
			//     "section_tipo": "test65",
			//     "tipo": "dd197",
			//     "lang": "lg-nolan",
			//     "from_component_tipo": "dd197",
			//     "value": "",
			//     "debug_time_json": "0,029 ms",
			//     "debug_model": "component_select",
			//     "debug_label": "Modified by user",
			//     "debug_mode": "list",
			//     "matrix_id": "1427170"
			// }

			$data[] = $current_item;


		// matrix ID
			// $user_id_tipo = DEDALO_SECTION_INFO_MODIFIED_BY_USER; // 'dd197' Modified by user

			// // dato
			// $locator = new locator();
			// 	$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
			// 	$locator->set_section_id($user_id);
			// 	$locator->set_type(DEDALO_RELATION_TYPE_LINK);
			// $component_dato = [$locator];

			// $modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($user_id_tipo,true); // select
			// $component 		= component_common::get_instance($modelo_name,
			// 												 $user_id_tipo,
			// 												 $section_id,
			// 												 'list',
			// 												 DEDALO_DATA_NOLAN,
			// 												 $section_tipo);
			// $component->set_dato($component_dato);

			// // get component json
			// 	$get_json_options = new stdClass();
			// 		$get_json_options->get_context 	= false;
			// 		$get_json_options->get_data 	= true;
			// 	$element_json = $component->get_json($get_json_options);

			// // edit section_id to match section locator data item
			// 	$current_item = reset($element_json->data);
			// 		$current_item->matrix_id = $current_record->id;

			$current_item = (object)[
				'section_id' 			=> $section_id,
				'section_tipo' 			=> $section_tipo,
				'tipo' 					=> 'test142', //	'section_id',
				'lang' 					=> DEDALO_DATA_NOLAN,
				'from_component_tipo' 	=> 'test142', // null,
				'value' 				=> $current_record->id,
				'debug_model' 			=> 'component_section_id',
				'debug_label' 			=> 'matrix ID',
				'debug_mode' 			=> 'list',
				'matrix_id' 			=> $current_record->id
			];

			$data[] = $current_item;


		return $data;
	}//end get_ar_subdata



}//end section_tm
