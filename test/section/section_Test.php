<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class section_test extends TestCase {



	public static $model		= 'section';
	public static $tipo			= 'test3';
	public static $section_tipo	= 'test3';
	public static $section_id	= '1';



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login



	/**
	* TEST_CREATE_MINIMUM_SECTIONS
	* @return object $component
	*/
	public function test_create_minimum_sections() {

		$ar_section_id = [
			1,
			2,
			3,
			4,
			5,
			6,
			7
		];
		foreach ($ar_section_id as $section_id) {
			$section = section::get_instance(
				$section_id, // string|null section_id
				self::$section_tipo, // string section_tipo
				'list',
				false
			);
			$section->forced_create_record();

			$this->assertTrue(
				gettype($section)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($section)
			);
		}
	}//end test_create_minimum_sections



	/**
	* TEST_GET_INSTANCE
	* @return void
	*/
	public function test_get_instance() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$tipo			= $section_tipo;
		$mode			= 'edit';
		$cache_key		= implode('_', [$section_id, $tipo, $mode]);

		// cache true
			$section = section::get_instance(
				$section_id, // string|null section_id
				$section_tipo, // string section_tipo
				$mode,
				true // default is true
			);

			$this->assertTrue(
				gettype($section)==='object' ,
				'expected type object. Current type: ' .gettype($section)
			);

			$this->assertTrue(
				count($section::$ar_section_instances)>0 ,
				'expected count($section::$ar_section_instances)>0. Current type: ' .count($section::$ar_section_instances)
			);

			$this->assertTrue(
				isset($section::$ar_section_instances[$cache_key]) ,
				'expected isset key in section instances cache ' .$cache_key
			);

		// cache false
			$section2 = section::get_instance(
				$section_id, // string|null section_id
				$section_tipo, // string section_tipo
				$mode,
				false // bool cache
			);

			$this->assertTrue(
				$section->uid!==$section2->uid ,
				'expected non cache section (different uid) ' .$section->uid .' - '.$section2->uid
			);

			$section3 = section::get_instance(
				$section_id, // string|null section_id
				$section_tipo, // string section_tipo
				$mode,
				true // bool cache
			);

			$this->assertTrue(
				$section->uid===$section3->uid ,
				'expected cached section (same uid) ' .$section->uid .' - '.$section3->uid
			);

		// time machine
			// $get_json_options = new stdClass();
			// 	$get_json_options->get_context	= true;
			// 	$get_json_options->get_data		= true;
			// $element_json = $section_tm->get_json($get_json_options);

			// $rqo = json_handler::decode('
			// 	{
			// 		"id": "service_time_machine_test3_list_lg-eng_test3_tool_time_machine",
			// 		"action": "read",
			// 		"source": {
			// 			"typo": "source",
			// 			"type": "tm",
			// 			"action": "search",
			// 			"model": "service_time_machine",
			// 			"tipo": "test3",
			// 			"section_tipo": "test3",
			// 			"section_id": null,
			// 			"mode": "tm",
			// 			"view": "tool",
			// 			"lang": "lg-eng",
			// 			"data_source": "tm"
			// 		},
			// 		"sqo": {
			// 			"id": "tmp",
			// 			"mode": "tm",
			// 			"section_tipo": [
			// 				"test3"
			// 			],
			// 			"limit": 10,
			// 			"offset": 0,
			// 			"order": [
			// 				{
			// 					"direction": "DESC",
			// 					"path": [
			// 						{
			// 							"component_tipo": "id"
			// 						}
			// 					]
			// 				}
			// 			],
			// 			"filter": {
			// 				"and": [
			// 					{
			// 						"q_parsed": "\'deleted\'",
			// 						"operator": "=",
			// 						"format": "column",
			// 						"column_name": "state",
			// 						"path": [
			// 							{
			// 								"section_tipo": "test3"
			// 							}
			// 						]
			// 					}
			// 				]
			// 			}
			// 		},
			// 		"show": {
			// 			"ddo_map": [
			// 				{
			// 					"id": "matrix_id",
			// 					"tipo": "dd1573",
			// 					"type": "component",
			// 					"typo": "ddo",
			// 					"model": "component_section_id",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"label": "Matrix id",
			// 					"mode": "tm",
			// 					"view": "mini",
			// 					"permissions": 1
			// 				},
			// 				{
			// 					"id": "when",
			// 					"tipo": "dd547",
			// 					"type": "component",
			// 					"typo": "ddo",
			// 					"model": "component_date",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"debug_label": "When",
			// 					"mode": "tm",
			// 					"view": "mini",
			// 					"permissions": 1
			// 				},
			// 				{
			// 					"id": "who",
			// 					"tipo": "dd543",
			// 					"type": "component",
			// 					"typo": "ddo",
			// 					"model": "component_input_text",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"debug_label": "Who",
			// 					"mode": "tm",
			// 					"view": "mini",
			// 					"permissions": 1
			// 				},
			// 				{
			// 					"id": "where",
			// 					"tipo": "dd546",
			// 					"type": "component",
			// 					"typo": "ddo",
			// 					"model": "component_input_text",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"debug_label": "Where",
			// 					"mode": "tm",
			// 					"view": "mini",
			// 					"permissions": 1
			// 				},
			// 				{
			// 					"typo": "ddo",
			// 					"tipo": "test52",
			// 					"model": "component_input_text",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"mode": "tm",
			// 					"view": null,
			// 					"label": "<mark>input_text</mark>",
			// 					"column_id": "test52",
			// 					"permissions": 1
			// 				},
			// 				{
			// 					"typo": "ddo",
			// 					"tipo": "test17",
			// 					"model": "component_text_area",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"mode": "tm",
			// 					"view": null,
			// 					"label": "<mark>text_area</mark>",
			// 					"column_id": "test17",
			// 					"permissions": 1
			// 				},
			// 				{
			// 					"typo": "ddo",
			// 					"tipo": "test85",
			// 					"model": "component_pdf",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"mode": "tm",
			// 					"view": null,
			// 					"label": "<mark>pdf</mark>",
			// 					"column_id": "test85",
			// 					"permissions": 1
			// 				},
			// 				{
			// 					"typo": "ddo",
			// 					"tipo": "test177",
			// 					"model": "component_svg",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"mode": "tm",
			// 					"view": null,
			// 					"label": "<mark>svg</mark>",
			// 					"column_id": "test177",
			// 					"permissions": 1
			// 				},
			// 				{
			// 					"typo": "ddo",
			// 					"tipo": "test26",
			// 					"model": "component_3d",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"mode": "tm",
			// 					"view": null,
			// 					"label": "<mark>3d</mark>",
			// 					"column_id": "test26",
			// 					"permissions": 1
			// 				},
			// 				{
			// 					"typo": "ddo",
			// 					"tipo": "test94",
			// 					"model": "component_av",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"mode": "tm",
			// 					"view": null,
			// 					"label": "<mark>av</mark>",
			// 					"column_id": "test94",
			// 					"permissions": 1
			// 				},
			// 				{
			// 					"typo": "ddo",
			// 					"tipo": "test99",
			// 					"model": "component_image",
			// 					"section_tipo": "test3",
			// 					"parent": "test3",
			// 					"mode": "tm",
			// 					"view": null,
			// 					"label": "<mark>image</mark>",
			// 					"column_id": "test99",
			// 					"permissions": 1
			// 				}
			// 			]
			// 		},
			// 		"options": {
			// 			"caller_tipo": "test3"
			// 		}
			// 	}
			// ');
			// $response = dd_core_api::read($rqo);
				// dump($response, ' response ++ '.to_string());

			$sqo = json_decode('
				{
					"id": "tmp",
					"mode": "tm",
					"section_tipo": [
						"test3"
					],
					"limit": 1,
					"offset": 0,
					"order": [
						{
							"direction": "DESC",
							"path": [{"component_tipo": "id"}]
						}
					],
					"filter": {
						"and": [
							{
								"q_parsed": "\'deleted\'",
								"operator": "=",
								"format": "column",
								"column_name": "state",
								"path": [{"section_tipo": "test3"}]
							}
						]
					}
				}
			');
			$search = search::get_instance(
				$sqo, // object sqo
			);
			$result = $search->search();
				// dump($result, ' result ++ '.to_string());
			foreach ($result->ar_records as $current_record) {

				$section_id = $current_record->section_id;
				// time machine
				$section_tm = section::get_instance(
					$section_id, // string|null section_id
					$section_tipo, // string section_tipo
					'tm',
					false // bool cache
				);
				// dump($section_tm, ' section_tm ++ '.to_string());

				$save = $section_tm->Save();

				$this->assertTrue(
					$save===null ,
					'expected save result null. Current result: ' .to_string($save)
				);
				// break;
			}
	}//end test_get_instance



	/**
	* TEST_set_bl_loaded_matrix_data
	* @return void
	*/
	public function test_set_bl_loaded_matrix_data() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->set_bl_loaded_matrix_data(false);

		$this->assertTrue(
			gettype($result)==='boolean' ,
			'expected type boolean. Current type: ' .gettype($result)
		);
	}//end test_set_bl_loaded_matrix_data



	/**
	* TEST_get_dato
	* @return void
	*/
	public function test_get_dato() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_dato();

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected type object. Current type: ' .gettype($result)
		);

		// save_handler session
			$section2 = section::get_instance(
				DEDALO_SECTION_ID_TEMP, // string|null section_id
				$section_tipo, // string section_tipo
				$mode
			);

			$result = $section2->get_dato();

			$this->assertTrue(
				$section2->save_handler==='session' ,
				'expected save_handler session. Current type: ' .$section2->save_handler
			);
	}//end test_get_dato



	/**
	* TEST_set_dato
	* @return void
	*/
	public function test_set_dato() : void {

		$section_id		= 4; // self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$fake_dato = (object)[
			'value' => 'fakedata'
		];

		$result = $section->set_dato($fake_dato);

		$this->assertTrue(
			gettype($result)==='boolean' ,
			'expected type boolean. Current type: ' . PHP_EOL
				.gettype($result)
		);

		$dato = $section->get_dato();

		$this->assertTrue(
			$dato===$fake_dato ,
			'expected $dato===$fake_dato '
		);
	}//end test_set_dato



	/**
	* TEST_get_component_dato
	* @return void
	*/
	public function test_get_component_dato() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'list';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$component_tipo	= 'test52'; // component_input_text
		$lang			= DEDALO_DATA_LANG;

		$result = $section->get_component_dato(
			$component_tipo,
			$lang
		);

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|NULL. Current type: ' .gettype($result)
		);

		$result2 = $section->get_component_dato(
			$component_tipo,
			DEDALO_DATA_NOLAN // note that component is translatable
		);

		$this->assertTrue(
			gettype($result2)==='NULL' ,
			'expected type NULL. Current type: ' .gettype($result2)
		);
	}//end test_get_component_dato



	/**
	* TEST_get_all_component_data
	* @return void
	*/
	public function test_get_all_component_data() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'list';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$component_tipo	= 'test52'; // component_input_text

		$result = $section->get_all_component_data(
			$component_tipo,
		);

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
			'expected type object|NULL. Current type: ' .gettype($result)
		);

		$result2 = $section->get_all_component_data(
			'dd6723928' // fake tipo
		);

		$this->assertTrue(
			gettype($result2)==='NULL' ,
			'expected type NULL. Current type: ' .gettype($result2)
		);
	}//end test_get_all_component_data



	/**
	* TEST_save_component_dato
	* @return void
	*/
	public function test_save_component_dato() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'list';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$component_tipo	= 'test52'; // component_input_text
		$model			= ontology_node::get_modelo_name_by_tipo($component_tipo,true);
		$component_obj	= component_common::get_instance(
			$model, // string model
			$component_tipo, // string tipo
			$section_id, // string section_id
			$mode, // string mode
			DEDALO_DATA_LANG, // string lang
			$section_tipo // string section_tipo
		);

		$result = $section->save_component_dato(
			$component_obj,
			'direct', // string component_data_type,
			false // bool save_to_database
		);

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='string',
			'expected type integer|string. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			$result==$section_id ,
			'expected $result==$section_id '
		);

		$result = $section->save_component_dato(
			$component_obj,
			'direct', // string component_data_type,
			true // bool save_to_database
		);

		$this->assertTrue(
			$result==$section_id ,
			'expected $result==$section_id '
		);
	}//end test_save_component_dato



	/**
	* TEST_set_component_direct_dato
	* @return void
	*/
	public function test_set_component_direct_dato() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$component_tipo	= 'test52'; // component_input_text
		$model			= ontology_node::get_modelo_name_by_tipo($component_tipo,true);
		$component_obj	= component_common::get_instance(
			$model, // string model
			$component_tipo, // string tipo
			$section_id, // string section_id
			$mode, // string mode
			DEDALO_DATA_LANG, // string lang
			$section_tipo, // string section_tipo
			true // bool cache
		);

		$result = $section->set_component_direct_dato(
			$component_obj
		);

		// sample
			// {
			//     "inf": "input_text [component_input_text]",
			//     "dato": {
			//         "lg-eng": null
			//     }
			// }

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
			'expected type object|NULL. Current type: ' .gettype($result)
		);

		if (!empty($result)) {
			$this->assertTrue(
				!empty($result->inf),
				'expected result->inf nor empty '
			);
			$this->assertTrue(
				!empty($result->dato),
				'expected result->dato nor empty '
			);
		}
	}//end test_set_component_direct_dato



	/**
	* TEST_set_component_relation_dato
	* @return void
	*/
	public function test_set_component_relation_dato() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$component_tipo	= 'test101'; // component_filter
		$model			= ontology_node::get_modelo_name_by_tipo($component_tipo,true);
		$component_obj	= component_common::get_instance(
			$model, // string model
			$component_tipo, // string tipo
			$section_id, // string section_id
			$mode, // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo, // string section_tipo
			false // bool cache
		);

		$dato = $component_obj->get_dato();
		// 	dump($dato, ' dato ++ '.to_string());

		$result = $section->set_component_relation_dato(
			$component_obj
		);

		// sample
			// [
			//     {
			//         "section_tipo": "test3",
			//         "section_id": "1",
			//         "type": "dd151",
			//         "from_component_tipo": "test101"
			//     },
			//     {
			//         "type": "dd151",
			//         "section_id": "21",
			//         "section_tipo": "test3",
			//         "from_component_tipo": "test101"
			//     }
			// ]

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected type array. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			count($dato)===count($result),
			'expected count($dato)===count($result) '. PHP_EOL
			.' count($dato): ' .count($dato) .PHP_EOL
			.' count($result): ' .count($result)
		);
	}//end test_set_component_relation_dato



	/**
	* TEST_Save
	* @return void
	*/
	public function test_Save() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->Save();

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='string' ,
			'expected type integer or string. Current type: ' .gettype($result)
		);

		$this->assertTrue(
			$section_id==$result ,
			'expected $section_id==$result ' . PHP_EOL
			.' section_id: ' .$section_id . PHP_EOL
			.' result: ' .$result
		);

		$section2 = section::get_instance(
			DEDALO_SECTION_ID_TEMP, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result2 = $section2->Save();

		$this->assertTrue(
			!empty($_SESSION['dedalo']['section_temp_data']),
			'expected not empty $_SESSION[dedalo][section_temp_data]'
		);

		$temp_data_uid = $section_tipo.'_'.DEDALO_SECTION_ID_TEMP;
		$this->assertTrue(
			isset($_SESSION['dedalo']['section_temp_data'][$temp_data_uid]),
			'expected isset $_SESSION[dedalo][section_temp_data]['.$temp_data_uid.']' . PHP_EOL
			.' value: ' .to_string($_SESSION['dedalo']['section_temp_data'][$temp_data_uid])
		);
	}//end test_Save



	/**
	* TEST_Delete
	* @return void
	*/
	public function test_Delete() : void {

		$section_id		= 6;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		// check exists
			$current_section_id_exists = section::section_record_exists( $section_id, $section_tipo );

		// new section
			$section = section::get_instance(
				$section_id, // string|null section_id
				$section_tipo, // string section_tipo
				$mode,
				false
			);
			$result_save = $section->Save(
				(object)[
					'forced_create_record' => !$current_section_id_exists
				]
			);
			$this->assertTrue(
				$result_save===$section_id,
				'expected test_Delete > Save $result_save===$section_id'
			);

		// delete created section delete_record
			$result_delete_record = $section->Delete('delete_record');

			$this->assertTrue(
				gettype($result_delete_record)==='boolean' ,
				'expected type boolean. Current type: ' .gettype($result_delete_record)
			);

			$this->assertTrue(
				$result_delete_record===true ,
				'expected $result_delete_record===true. result_delete_record: ' .json_encode($result_delete_record)
			);

		// new section
			$section_id = 7;

			// check exists
			$current_section_id_exists = section::section_record_exists( $section_id, $section_tipo );

			$section = section::get_instance(
				$section_id, // string|null section_id
				$section_tipo, // string section_tipo
				$mode,
				false
			);
			$result_save = $section->Save(
				(object)[
					'forced_create_record' => !$current_section_id_exists
				]
			);

			$this->assertTrue(
				$result_save===$section_id,
				'expected test_Delete > Save $result_save===$section_id'
			);

		// delete created section delete_data
			$result_delete_data = $section->Delete('delete_data');

			$this->assertTrue(
				gettype($result_delete_data)==='boolean' ,
				'expected type boolean. Current type: ' .gettype($result_delete_data)
			);

			$this->assertTrue(
				$result_delete_data===true ,
				'expected $result_delete_data===true ' .json_encode($result_delete_data)
			);

			$this->assertTrue(
				$result_save===$section_id,
				'expected test_Delete > Save $result_save===$section_id'
			);

		// delete created section delete_dataframe
			$result_delete_data = $section->Delete('delete_dataframe');

			$this->assertTrue(
				gettype($result_delete_data)==='boolean' ,
				'expected type boolean. Current type: ' .gettype($result_delete_data)
			);

			// note that current section do not have a caller_section, therefore,
			// result false is expected here
			$this->assertTrue(
				$result_delete_data===false ,
				'expected $result_delete_data===false ' .json_encode($result_delete_data)
			);

			$this->assertTrue(
				$result_save===$section_id,
				'expected test_Delete > Save $result_save===$section_id'
			);
	}//end test_Delete



	/**
	* TEST_get_section_real_tipo
	* @return void
	*/
	public function test_get_section_real_tipo() : void {

		$section_id		= self::$section_id;
		$section_tipo	= 'rsc170'; // Audiovisual is an alias of rsc2 (Media resources)
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_section_real_tipo();

		$this->assertTrue(
			$result==='rsc2',
			'expected $result===\'rsc2\' '. PHP_EOL
			.' result: ' .to_string($result)
		);

		$section = section::get_instance(
			$section_id, // string|null section_id
			'test3', // string section_tipo
			$mode
		);

		$result = $section->get_section_real_tipo();

		$this->assertTrue(
			$result==='test3',
			'expected $result===\'test3\' '. PHP_EOL
			.' result: ' .to_string($result)
		);
	}//end test_get_section_real_tipo



	/**
	* TEST_get_section_real_tipo_static
	* @return void
	*/
	public function test_get_section_real_tipo_static() : void {

		$result = section::get_section_real_tipo_static('rsc170');

		$this->assertTrue(
			$result==='rsc2',
			'expected $result===\'rsc2\' '. PHP_EOL
			.' result: ' .to_string($result)
		);

		$result = section::get_section_real_tipo_static('test3');

		$this->assertTrue(
			$result==='test3',
			'expected $result===\'test3\' '. PHP_EOL
			.' result: ' .to_string($result)
		);
	}//end test_get_section_real_tipo_static



	/**
	* TEST_get_ar_children_tipo_by_model_name_in_section
	* @return void
	*/
	public function test_get_ar_children_tipo_by_model_name_in_section() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$result = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo,
			['component_input_text'],
			true, // from cache
			true, // resolve virtual
			true, // recursive
			true // search_exact
		);

		// sample:
			// [
			//     "test52"
			// ]

		$this->assertTrue(
			gettype($result)==='array',
			'expected type is array '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result[0]==='test52',
			'expected $result[0]===\'test52\' '. PHP_EOL
			.' result: ' . json_encode($result)
		);
	}//end test_get_ar_children_tipo_by_model_name_in_section



	/**
	* TEST_get_ar_recursive_children
	* @return void
	*/
	public function test_get_ar_recursive_children() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$result = section::get_ar_recursive_children(
			$section_tipo
		);

		// sample:
		// [
		//   "test45", "test26", "test94", ...
		// ]

		$this->assertTrue(
			gettype($result)==='array',
			'expected type is array '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			in_array('test94', $result),
			'expected in_array(\'test94\', $result) '. PHP_EOL
			.' result: ' . json_encode( in_array('test94', $result) )
		);
	}//end test_get_ar_recursive_children



	/**
	* TEST_get_section_buttons_tipo
	* @return void
	*/
	public function test_get_section_buttons_tipo() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_section_buttons_tipo();

		// sample:
		// [
		//   "test126", ...
		// ]

		$this->assertTrue(
			gettype($result)==='array',
			'expected type is array '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			in_array('test126', $result),
			'expected in_array(\'test126\', $result) '. PHP_EOL
			.' result: ' . json_encode( in_array('test126', $result) )
		);
	}//end test_get_section_buttons_tipo



	/**
	* TEST_get_section_tipo
	* @return void
	*/
	public function test_get_section_tipo() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_section_tipo();

		$this->assertTrue(
			gettype($result)==='string',
			'expected type is string '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result===$section_tipo,
			'expected $result===$section_tipo '. PHP_EOL
			.' result: ' . json_encode( $result===$section_tipo )
		);
	}//end test_get_section_tipo



	/**
	* TEST_set_created_date
	* @return void
	*/
	public function test_set_created_date() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);
		$timestamp = '2016-06-15 20:01:15';
		$result = $section->set_created_date(
			$timestamp
		);

		$dato = $section->get_dato();

		$this->assertTrue(
			$dato->created_date===$timestamp,
			'expected $dato->created_date===$timestamp '. PHP_EOL
			.' dato->created_date: ' . $dato->created_date .PHP_EOL
			.' timestamp: ' . $timestamp
		);
	}//end test_set_created_date



	/**
	* TEST_set_modified_date
	* @return void
	*/
	public function test_set_modified_date() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);
		$timestamp = '2016-06-15 20:01:15';
		$result = $section->set_modified_date(
			$timestamp
		);

		$dato = $section->get_dato();

		$this->assertTrue(
			$dato->created_date===$timestamp,
			'expected $dato->created_date===$timestamp '. PHP_EOL
			.' dato->created_date: ' . $dato->created_date .PHP_EOL
			.' timestamp: ' . $timestamp
		);
	}//end test_set_modified_date



	/**
	* TEST_get_created_date
	* @return void
	*/
	public function test_get_created_date() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		// $timestamp = '2016-06-15 20:01:15';
		$timestamp = '15-06-2016 20:01:15';

		$result = $section->get_created_date();

		$this->assertTrue(
			$result===$timestamp,
			'expected $result===$timestamp '. PHP_EOL
			.' result: ' . $result .PHP_EOL
			.' timestamp: ' . $timestamp
		);
	}//end test_get_created_date



	/**
	* TEST_get_modified_date
	* @return void
	*/
	public function test_get_modified_date() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		// $timestamp = '2016-06-15 20:01:15';
		$timestamp = '15-06-2016 20:01:15';

		$result = $section->get_modified_date();

		$this->assertTrue(
			$result===$timestamp,
			'expected $result===$timestamp '. PHP_EOL
			.' result: ' . $result .PHP_EOL
			.' timestamp: ' . $timestamp
		);
	}//end test_get_modified_date



	/**
	* TEST_get_created_by_userID
	* @return void
	*/
	public function test_get_created_by_userID() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_created_by_userID();

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='NULL',
			'expected integer or NULL '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result===-1 || $result===1,
			'expected $result === -1 || $result===1 '. PHP_EOL
			.' result: ' . $result
		);
	}//end test_get_created_by_userID



	/**
	* TEST_get_modified_by_userID
	* @return void
	*/
	public function test_get_modified_by_userID() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_modified_by_userID();

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='NULL',
			'expected integer or NULL '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result===TEST_USER_ID,
			'expected $result === TEST_USER_ID '. PHP_EOL
				.' result: ' . $result . PHP_EOL
				.' TEST_USER_ID: ' . TEST_USER_ID
		);
	}//end test_get_modified_by_userID



	/**
	* TEST_get_created_by_user_name
	* @return void
	*/
	public function test_get_created_by_user_name() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_created_by_user_name();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected string or NULL '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result==='root' || $result==='render',
			'expected $result === root || $result===render '. PHP_EOL
			.' result: ' . $result
		);
	}//end test_get_created_by_user_name



	/**
	* TEST_get_modified_by_user_name
	* @return void
	*/
	public function test_get_modified_by_user_name() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_modified_by_user_name();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected string or NULL '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result==='root' || $result==='render' || $result==='pepe',
			'expected $result === root || $result===render || $result===pepe ' . PHP_EOL
			.' result: ' . $result . ' - ' . $section_tipo.'_'.$section_id
		);
	}//end test_get_modified_by_user_name



	/**
	* TEST_get_user_name_by_userID
	* @return void
	*/
	public function test_get_user_name_by_userID() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$user_id = -1;

		$result = $section->get_user_name_by_userID( $user_id, true );

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected string or NULL '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result==='Admin debugger',
			'expected $result === Admin debugger '. PHP_EOL
			.' result: ' . $result
		);

		$result2 = $section->get_user_name_by_userID( $user_id, false );

		$this->assertTrue(
			$result2==='root',
			'expected $result === root '. PHP_EOL
			.' result: ' . $result2
		);
	}//end test_get_user_name_by_userID



	/**
	* TEST_get_section_info
	* @return void
	*/
	public function test_get_section_info() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_section_info();

		$this->assertTrue(
			gettype($result)==='object',
			'expected object or NULL '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			!empty($result->created_by_user_name),
			'expected $!empty($result->created_by_user_name) '. PHP_EOL
			.!empty($result->created_by_user_name)
		);
		$this->assertTrue(
			!empty($result->created_date),
			'expected $!empty($result->created_date) '. PHP_EOL
			.!empty($result->created_date)
		);
	}//end test_get_section_info



	/**
	* TEST_get_publication_date
	* @return void
	*/
	public function test_get_publication_date() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_publication_date(
			diffusion::$publication_first_tipo
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected string or NULL '. PHP_EOL
			.' result: ' . gettype($result)
		);
	}//end test_get_publication_date



	/**
	* TEST_get_publication_user
	* @return void
	*/
	public function test_get_publication_user() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->get_publication_user(
			diffusion::$publication_first_tipo
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected string or NULL '. PHP_EOL
			.' result: ' . gettype($result)
		);
	}//end test_get_publication_user



	/**
	* TEST_get_ar_all_section_records_unfiltered
	* @return void
	*/
	public function test_get_ar_all_section_records_unfiltered() : void {

		$section_tipo = self::$section_tipo;

		$result = section::get_ar_all_section_records_unfiltered( $section_tipo );

		$this->assertTrue(
			gettype($result)==='array',
			'expected array '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			count($result)>0,
			'expected count($result)>0 '. PHP_EOL
			.' result: ' . count($result)
		);
	}//end test_get_ar_all_section_records_unfiltered



	/**
	* TEST_get_resource_all_section_records_unfiltered
	* @return void
	*/
	public function test_get_resource_all_section_records_unfiltered() : void {

		$section_tipo = self::$section_tipo;

		$result = section::get_resource_all_section_records_unfiltered( $section_tipo );

		$this->assertTrue(
			gettype($result)==='object',
			'expected object '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$ar_records = [];
		while ($rows = pg_fetch_assoc($result)) {
			$ar_records[] = $rows['section_id'];
		}

		$this->assertTrue(
			count($ar_records)>0,
			'expected count($ar_records)>0 '. PHP_EOL
			.' ar_records: ' . count($ar_records)
		);
	}//end test_get_resource_all_section_records_unfiltered



	/**
	* TEST_get_components_with_media_content
	* @return void
	*/
	public function test_get_components_with_media_content() : void {

		$result = section::get_components_with_media_content();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			count($result)>1,
			'expected count($result)>1 '. PHP_EOL
			.' result: ' . count($result)
		);
	}//end test_get_components_with_media_content



	/**
	* TEST_restore_deleted_section_media_files
	* @return void
	*/
	public function test_restore_deleted_section_media_files() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$result = $section->restore_deleted_section_media_files();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			count($result)>0,
			'expected count($result)>0 '. PHP_EOL
			.' result: ' . count($result)
		);
	}//end test_restore_deleted_section_media_files



	/**
	* TEST_forced_create_record
	* @return void
	*/
	public function test_forced_create_record() : void {

		$section_id		= 6;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		// delete section if exists
			$current_section_id_exists = section::section_record_exists($section_id, $section_tipo);
			if ($current_section_id_exists) {
				$section = section::get_instance(
					$section_id, // string|null section_id
					$section_tipo, // string section_tipo
					$mode,
					false
				);
				$result_delete_record = $section->Delete('delete_record');
				$this->assertTrue(
					$result_delete_record===true,
					'expected true '. PHP_EOL
					.to_string($result_delete_record)
				);
			}

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode,
			false
		);

		$result = $section->forced_create_record();
		// $result = $section->Save(
		// 	(object)[
		// 		'forced_create_record' => true
		// 	]
		// );

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected $result===true '. PHP_EOL
			.' result: ' . json_encode($result)
		);

		$eq = section::section_record_exists($section_id, $section_tipo);
		$this->assertTrue(
			$eq,
			'expected section_id_exists true '. PHP_EOL
			.' result: ' . json_encode($eq)
		);

		// restore section 7
			$section = section::get_instance(
				7, // string|null section_id
				$section_tipo, // string section_tipo
				$mode,
				false
			);
			$result = $section->forced_create_record();

			$eq = section::section_record_exists(4, $section_tipo);
			$this->assertTrue(
				$eq,
				'expected section_id_exists true '. PHP_EOL
				.' result: ' . json_encode($eq)
			);
	}//end test_forced_create_record



	/**
	* TEST_section_id_exists
	* @return void
	*/
	public function test_section_id_exists() : void {

		$section_id		= 5;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		// $section = section::get_instance(
		// 	$section_id, // string|null section_id
		// 	$section_tipo, // string section_tipo
		// 	$mode
		// );

		$result = section::section_record_exists($section_id, $section_tipo);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			$result===true,
			'expected $result===true '. PHP_EOL
			.' result: ' . json_encode($result)
		);

		$result = section::section_record_exists(4, $section_tipo);
		$this->assertTrue(
			$result===true,
			'expected $result===true '. PHP_EOL
			.' result: ' . json_encode($result)
		);
	}//end test_section_id_exists



	/**
	* TEST_get_diffusion_info
	* @return void
	*/
	public function test_get_diffusion_info() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode,
			false
		);

		$result = $section->get_diffusion_info($section_id, $section_tipo);

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
			'expected boolean | NULL '. PHP_EOL
			.' result: ' . gettype($result)
		);
	}//end test_get_diffusion_info



	/**
	* TEST_add_diffusion_info_default
	* @return void
	*/
	public function test_add_diffusion_info_default() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode,
			false
		);

		$diffusion_element_tipo = 'test92';

		$result = $section->add_diffusion_info_default(
			$diffusion_element_tipo
		);

		$dato = $section->get_dato();

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected boolean '. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			!empty($dato->diffusion_info->{$diffusion_element_tipo}),
			'expected non empty $dato->diffusion_info->{$diffusion_element_tipo}'. PHP_EOL
			.' value: ' . to_string($dato->diffusion_info->{$diffusion_element_tipo})
		);
	}//end test_add_diffusion_info_default



	/**
	* TEST_get_inverse_references
	* @return void
	*/
	public function test_get_inverse_references() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode,
			false
		);

		$result = $section->get_inverse_references();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array '. PHP_EOL
			.' result: ' . gettype($result)
		);

		if (!empty($result)) {
			foreach ($result as $locator) {
				$this->assertTrue(
					gettype($locator)==='object',
					'expected object '. PHP_EOL
					.' locator: ' . gettype($locator)
				);

				$this->assertTrue(
					$locator->section_tipo===$section_tipo && $locator->section_id==$section_id,
					'expected $locator->section_tipo===$section_tipo && $locator->section_id==$section_id '. PHP_EOL
					.' value: ' . json_encode( $locator->section_tipo===$section_tipo && $locator->section_id==$section_id )
				);
			}
		}
	}//end test_get_inverse_references



	/**
	* TEST_remove_all_inverse_references
	* @return void
	*/
	public function test_remove_all_inverse_references() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode,
			false
		);

		$result = $section->remove_all_inverse_references(
			false // bool $save as false to prevent save this test values
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected array '. PHP_EOL
			.' result: ' . gettype($result)
		);

		if (!empty($result)) {
			foreach ($result as $item) {

				$locator = $item->locator_to_remove;
				$this->assertTrue(
					gettype($locator)==='object',
					'expected object '. PHP_EOL
					.' locator: ' . gettype($locator)
				);

				$this->assertTrue(
					$locator->section_tipo===$section_tipo && $locator->section_id==$section_id,
					'expected $locator->section_tipo===$section_tipo && $locator->section_id==$section_id '. PHP_EOL
					.' value: ' . json_encode( $locator->section_tipo===$section_tipo && $locator->section_id==$section_id )
				);

				$locator = $item->removed_from;
				$this->assertTrue(
					gettype($locator)==='object',
					'expected object '. PHP_EOL
					.' locator: ' . gettype($locator)
				);

				$this->assertTrue(
					$locator->section_tipo===$section_tipo && $locator->section_id==$section_id,
					'expected $locator->section_tipo===$section_tipo && $locator->section_id==$section_id '. PHP_EOL
					.' value: ' . json_encode( $locator->section_tipo===$section_tipo && $locator->section_id==$section_id )
				);
			}
		}
	}//end test_remove_all_inverse_references



	/**
	* TEST_get_relation_list_tipo
	* @return void
	*/
		// public function test_get_relation_list_tipo() : void {

		// 	$section_id		= self::$section_id;
		// 	$section_tipo	= self::$section_tipo;
		// 	$mode			= 'edit';

		// 	$section = section::get_instance(
		// 		$section_id, // string|null section_id
		// 		$section_tipo, // string section_tipo
		// 		$mode,
		// 		false
		// 	);

		// 	$result = $section->get_relation_list_tipo();

		// 	$this->assertTrue(
		// 		$result==='test138',
		// 		'expected test138 '. PHP_EOL
		// 		.' result: ' . to_string($result)
		// 	);
		// }//end test_get_relation_list_tipo



	/**
	* TEST_get_relations
	* @return void
	*/
	public function test_get_relations() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode,
			false
		);

		$result = $section->get_relations();

		$this->assertTrue(
			gettype($result)==='array',
			'expected array '. PHP_EOL
			.' result: ' . gettype($result)
		);
	}//end test_get_relations



	/**
	* TEST_add_relation
	* @return void
	*/
	public function test_add_relation() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode,
			false
		);

		$locator = json_decode('
			 {
				"section_tipo": "test3",
				"section_id": "2",
				"from_component_tipo": "test80",
				"type": "'.DEDALO_RELATION_TYPE_LINK.'"
			}
		');

		// Note that section is not saved
		$result = $section->add_relation(
			$locator
		);

		$relations = $section->get_relations();
		$found = array_find($relations, function($el) use($locator){
			return $el->from_component_tipo===$locator->from_component_tipo
				&& $el->section_tipo===$locator->section_tipo
				&& $el->section_id==$locator->section_id;
		});

		$this->assertTrue(
			!empty($found) && $found->section_id==$locator->section_id,
			'expected array '. PHP_EOL
			.' result: ' . gettype($result)
		);
	}//end test_add_relation



	/**
	* TEST_remove_relation
	* @return void
	*/
	public function test_remove_relation() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode,
			false
		);

		$locator = json_decode('
			 {
				"section_tipo": "test3",
				"section_id": "555",
				"from_component_tipo": "test80",
				"type": "'.DEDALO_RELATION_TYPE_LINK.'"
			}
		');

		// remove 1
			// Note that section is not saved
			$result = $section->remove_relation(
				$locator
			);

			$this->assertTrue(
				$result===false,
				'expected false '. PHP_EOL
				.' result: ' . json_encode($result)
			);

		// add before remove
			// Note that section is not saved
			$result = $section->add_relation(
				$locator
			);

			// remove 2
			// Note that section is not saved
			$result = $section->remove_relation(
				$locator
			);

			$this->assertTrue(
				$result===true,
				'expected true '. PHP_EOL
				.' result: ' . json_encode($result)
			);

			$relations = $section->get_relations();
			$found = array_find($relations, function($el) use($locator){
				return $el->from_component_tipo===$locator->from_component_tipo
					&& $el->section_tipo===$locator->section_tipo
					&& $el->section_id==$locator->section_id;
			});

			$this->assertTrue(
				empty($found),
				'expected empty '. PHP_EOL
				.' result: ' . json_encode($found)
			);
	}//end test_remove_relation



	/**
	* TEST_remove_relations_from_component_tipo
	* @return void
	*/
	public function test_remove_relations_from_component_tipo() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		$locator = json_decode('
			 {
				"section_tipo": "test3",
				"section_id": "4",
				"from_component_tipo": "test80",
				"type": "'.DEDALO_RELATION_TYPE_LINK.'"
			}
		');

		// add before remove
		// Note that section is not saved
		$result = $section->add_relation(
			$locator
		);

		$options = new stdClass();
			$options->component_tipo		= 'test80';
			$options->relations_container	= 'relations';

		// Note that section is not saved
		$result = $section->remove_relations_from_component_tipo( $options );

		$this->assertTrue(
			count($result)>0,
			'expected not empty '. PHP_EOL
			.' result: ' . json_encode($result)
		);

		$relations = $section->get_relations();
		$found = array_filter($relations, function($el) use($locator){
			return $el->from_component_tipo===$locator->from_component_tipo;
		});

		$this->assertTrue(
			count($found)===0,
			'expected empty found '. PHP_EOL
			.' found: ' . json_encode($found)
		);
	}//end test_remove_relations_from_component_tipo



	/**
	* TEST_get_section_map
	* @return void
	*/
	public function test_get_section_map() : void {

		$section_id		= self::$section_id;
		$section_tipo	= self::$section_tipo;
		$mode			= 'edit';

		$section = section::get_instance(
			$section_id, // string|null section_id
			$section_tipo, // string section_tipo
			$mode
		);

		// Note that section is not saved
		$result = $section->get_section_map(
			$section_tipo
		);

		// sample
			// {
			//     "thesaurus": {
			//         "term": "test52",
			//         "model": "test169",
			//         "parent": "test71",
			//         "is_descriptor": "test88"
			//     }
			// }

		$this->assertTrue(
			gettype($result)==='object',
			'expected object'. PHP_EOL
			.' result: ' . gettype($result)
		);

		$this->assertTrue(
			isset($result->thesaurus),
			'expected property thesaurus exists in result '. PHP_EOL
			.' result: ' . json_encode($result)
		);
	}//end test_get_section_map



	/**
	* TEST_build_sqo_id
	* @return void
	*/
	public function test_build_sqo_id() : void {

		$section_tipo = self::$section_tipo;

		// Note that section is not saved
		$result = section::build_sqo_id(
			$section_tipo
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected string'. PHP_EOL
			.' result: ' . gettype($result)
		);

		$eq = ($result===$section_tipo);
		$this->assertTrue(
			$eq===true,
			'expected equal true in result '. PHP_EOL
			.' result: ' . json_encode($result)
		);
	}//end test_build_sqo_id



}//end class section_test
