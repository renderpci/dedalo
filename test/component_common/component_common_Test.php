<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';
	require_once 'data.php';
	require_once 'elements.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}


final class component_common_test extends TestCase {



	/**
	* TEST_USER_1_LOGIN
	* @return void
	*/
	public function test_user_1_login() {

		$this->assertTrue(
			login::is_logged()===false ,
			'expected login false'
		);

		login_test::force_login(1);

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_1_login



	/**
	* TEST_GET_INSTANCE
	* @return void
	*/
	public function test_get_instance() : void {

		foreach (get_elements() as $element) {

			// component instance
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo, // string section_tipo
					true // bool cache
				);
				$uid = $component->uid;

			// from cache check
				$component2 = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo, // string section_tipo
					true // bool cache
				);
				$uid2 = $component2->uid;

			$this->assertTrue(
				$uid===$uid2 ,
				'two instances expected are equals (using cache) ' . $uid .' => ' . $uid2
			);

			// from cache check
				$component3 = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo, // string section_tipo
					false // bool cache
				);
				$uid3 = $component3->uid;

				$this->assertFalse(
					$uid===$uid3,
					'two instances expected are NOT equals (NOT using cache) ' . $uid .' => ' . $uid2
				);

			// check lang. Verify if assigned lang is as expected for non translatable components
				$component3 = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo, // string section_tipo
					false // bool cache
				);
				$expected_component_lang = (RecordObj_dd::get_translatable($element->tipo)===true)
					? DEDALO_DATA_LANG
					: DEDALO_DATA_NOLAN;
				$component_lang = $component3->get_lang();
				if ($expected_component_lang!==$component_lang) {
					error_log($element->model.' - expected_component_lang:'.$expected_component_lang . ' => component_lang:' . $component_lang);
				}
				$this->assertTrue(
					$expected_component_lang===$component_lang ,
					"expected same lang:  $expected_component_lang => $component_lang"
				);

			// check main vars
				$this->assertTrue( $component3->get_tipo()===$element->tipo );
				$this->assertTrue( $component3->get_section_id()===$element->section_id );
				$this->assertTrue( $component3->get_mode()===$element->mode );
				$this->assertTrue( $component3->get_section_tipo()===$element->section_tipo );
				$this->assertTrue( $component3->pagination->offset===0 );
				$this->assertTrue( $component3->pagination->limit===null );

		}//end foreach
	}//end test_get_instance



	/**
	* TEST_SET_DATO_DEFAULT
	* @return void
	*/
	public function test_set_dato_default() {

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$dato_default = $component->set_dato_default();

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);
		}
	}//end test_set_dato_default



	/**
	* TEST_SET_DATO
	* @return void
	*/
	public function test_set_dato() {

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			if (isset($element->test_save) && $element->test_save===false || !isset($element->new_value)) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			// new data
				$arguments	= $element->new_value_params ?? [];
				$new_data	= call_user_func_array($element->new_value, $arguments);
				if (empty($new_data)) {
					dump($new_data, ' new_data ++ '.to_string($element->model));
					continue;
				}

				$this->assertTrue(
					gettype($new_data)==='array',
					'new_data type expected array. current type: ' .gettype($new_data)
				);

			$component->set_dato($new_data);

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				is_null($component->ar_list_of_values)===true,
				'expected ar_list_of_values is null: ' . is_null($component->ar_list_of_values)
			);

			foreach ($component->get_dato() as $key => $value) {
				$this->assertTrue(
					$value==$new_data[$key],
					'expected dato element is the same as new data.'. $element->model .PHP_EOL. json_encode($value).PHP_EOL.json_encode($new_data[$key]).PHP_EOL
					.gettype($value).PHP_EOL
					.gettype($new_data[$key]).PHP_EOL
				);
			}

			foreach ($component->get_dato_resolved() as $key => $value) {
				$this->assertTrue(
					$value==$new_data[$key],
					'expected dato element is the same as new data.'. $element->model .PHP_EOL. json_encode($value).PHP_EOL.json_encode($new_data[$key]).PHP_EOL
					.gettype($value).PHP_EOL
					.gettype($new_data[$key]).PHP_EOL
				);
			}
		}
	}//end test_set_dato



	/**
	* TEST_GET_DATO
	* @return void
	*/
	public function test_get_dato(): void {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$this->assertTrue(
				$component->get_bl_loaded_matrix_data()===false,
				'expected false for bl_loaded_matrix_data'
			);

			// dato
			$dato = $component->get_dato();

			if (!empty($dato)) {
				$this->assertTrue(
					$component->get_bl_loaded_matrix_data()===true,
					'expected true for bl_loaded_matrix_data '.$element->model
				);
			}

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			switch ($element->model) {
				case 'component_section_id':
					$this->assertTrue(
						gettype($dato)==='integer' ,
						'expected type integer'
					);
					// $component->set_dato('string');
					// $dato = $component->get_dato();
					// $this->assertTrue( gettype($dato)==='integer' );
					break;
				default:
					$this->assertTrue(
						gettype($dato)==='array' || is_null($dato),
						'expected type array or null'
					);
					break;
			}
		}

		// data_source dato (tm)
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);
			$component->set_data_source('tm');
			$component->set_matrix_id('1');

			$this->assertTrue(
				$component->get_bl_loaded_matrix_data()===false,
				'expected false for bl_loaded_matrix_data'
			);

			// dato
			$dato = $component->get_dato();

			if (!empty($dato)) {
				$this->assertTrue(
					$component->get_bl_loaded_matrix_data()===true,
					'expected true for bl_loaded_matrix_data '.$element->model
				);
			}

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			switch ($element->model) {
				case 'component_section_id':
					$this->assertTrue(
						gettype($dato)==='integer' ,
						'expected type integer'
					);
					// $component->set_dato('string');
					// $dato = $component->get_dato();
					// $this->assertTrue( gettype($dato)==='integer' );
					break;
				default:
					$this->assertTrue(
						gettype($dato)==='array' || is_null($dato),
						'expected type array or null'
					);
					break;
			}
		}
	}//end test_get_dato



	/**
	* TEST_GET_DATO_FULL
	* @return void
	*/
	public function test_get_dato_full() {

		$components_with_relations = component_relation_common::get_components_with_relations();

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$dato_full = $component->get_dato_full();
				// dump($dato_full, ' get_dato_full ++ '.to_string($element->model));

			if (in_array($element->model, $components_with_relations) || $element->model==='component_inverse') {
				$this->assertTrue(
					gettype($dato_full)==='array',
					'dato_full type expected array. current type: ' .gettype($dato_full)
				);
			}else{
				$is_translatable = $component->is_translatable();
				if ($is_translatable===true) {
					$this->assertTrue(
						isset($dato_full->{DEDALO_DATA_LANG}),
						'dato_full expected key: ' .DEDALO_DATA_LANG
					);
				}else{
					if ($element->model!=='component_section_id') {
						$this->assertTrue(
							isset($dato_full->{DEDALO_DATA_NOLAN}),
							'dato_full expected key ('.$element->model.') : '
							.DEDALO_DATA_NOLAN .PHP_EOL
							.json_encode($dato_full) .PHP_EOL
							.'is_translatable: '.json_encode($is_translatable).PHP_EOL
							.'tipo: '.$element->tipo
						);
					}
				}
			}
		}
	}//end test_get_dato_full



	/**
	* test_get_dato_unchanged
	* @return void
	*/
	public function test_get_dato_unchanged() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$dato			= $component->get_dato();
			$dato_unchanged	= $component->get_dato_unchanged();

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			// working here !
			// note that component_number change dato type like integer for float
			// note
			// $this->assertTrue(
			// 	$dato===$dato_unchanged,
			// 	'dato_unchanged expected is equal as dato '. $element->model .PHP_EOL
			// 	. 'dato          : ' . json_encode($dato[0]) . ' type: '.gettype($dato[0]) .PHP_EOL
			// 	. 'dato_unchanged: ' . json_encode($dato_unchanged[0]) . ' type: '.gettype($dato_unchanged[0])
			// );
		}
	}//end test_get_dato_unchanged



	/**
	* TEST_LOAD_COMPONENT_DATO
	* @return void
	*/
	public function test_load_component_dato() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			// $component->load_component_dato(); is protected method (!)
			$component->get_dato();

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$component->get_bl_loaded_matrix_data()===true,
				'expected true from bl_loaded_matrix_data '.$element->model .PHP_EOL
				. json_encode($component->get_bl_loaded_matrix_data())
			);

			if (!in_array($element->model, [
				'component_relation_index', // data is external, not loaded from section
				'component_relation_parent', // data is external, not loaded from section
				'component_inverse', // data is external, not loaded from section
				'component_section_id' // data is direct, not loaded from section
			])) {
				$this->assertTrue(
					!empty($component->section_obj),
					'expected component section_obj is not empty '. $element->model
				);
				$this->assertTrue(
					$component->section_obj->get_section_id()==$component->get_section_id(),
					'expected section_obj section_id is the same as $component->section_id'
				);
			}

		}
	}//end test_load_component_dato




	/**
	* test_is_translatable
	* @return void
	*/
	public function test_is_translatable() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$is_translatable = $component->is_translatable();

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($is_translatable)==='boolean',
				'expected is_translatable type is boolean'
			);

			if (in_array($element->model, [
				'component_relation_index',
				'component_relation_parent',
				'component_inverse',
				'component_section_id',
				'component_section_number',
				'component_json',
				'component_geolocation',
				'component_3d',
				'component_av'
			])) {
				$this->assertTrue(
					$is_translatable===false,
					'expected false for component '. $element->model
				);
			}

		}
	}//end test_is_translatable



	/**
	* TEST_GET_VALUE
	* @return void
	*/
	public function test_get_value() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$value = $component->get_value();

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($value)==='string' || gettype($value)===null,
				'expected get_value type is string|null. ' .gettype($value) ." ($element->model)"
			);


		}
	}//end test_get_value






	/**
	* TEST_GET_COMPONENT_JSON
	* @return void
	*/
	public function test_get_component_json(): void {

		// force status as logged to allow test
			// login_test::force_login(DEDALO_SUPERUSER);

		// elements
			$elements = get_elements();

		foreach ($elements as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$json_data = $component->get_json((object)[
				'get_context'	=> true,
				'get_data'		=> true
			]);

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($json_data->context)==='array',
				'expected json_data->context type is array'
			 );
			$this->assertTrue(
				gettype($json_data->data)==='array',
				'expected json_data->data type is array'
			);

			if (!empty($json_data->data[0])) {

				$this->assertTrue( $json_data->data[0]->section_id===$component->get_section_id() );
				$this->assertTrue( $json_data->data[0]->section_tipo===$component->get_section_tipo() );
				$this->assertTrue( $json_data->data[0]->lang===$component->get_lang() );
				$this->assertTrue( $json_data->data[0]->from_component_tipo===$component->get_tipo() );

				// if (gettype($json_data->data[0]->value)!=='array' && !is_null($json_data->data[0]->value)) {
				// 	dump($json_data->data[0], ' var ++ ))))))))))))))))) '.to_string($element->model));
				// 	dump(gettype($json_data->data[0]->value), ' gettype ((((((((((((((((((( ))))))))))))))))))) ++ '.to_string($element->model));
				// }
				if ($element->model==='component_section_id') {
					$this->assertTrue(
						gettype($json_data->data[0]->value)==='integer' && $json_data->data[0]->value==$component->get_section_id(),
						'expected type integer and equal to section_id: '.$component->get_section_id()
					);
				}else{
					$this->assertTrue(
						gettype($json_data->data[0]->value)==='array' || is_null($json_data->data[0]->value) ,
						'expected type array|null value. type: '.gettype($json_data->data[0]->value)
					);
				}
			}
		}
	}//end test_get_component_json



	/**
	* TEST_SAVE_COMPONENT_DATO
	* @return void
	*/
	public function XXX_test_save_component_dato() : void {

		// working here (!)

		// section 1
			$section_id		= 1;
			$section_tipo	= 'test3';
			$section		= section::get_instance(
				$section_id, // string|null section_id
				$section_tipo, // string section_tipo
				'list',
				// false
			);
			$section_dato = $section->get_dato();

		// component 1
			$model	= 'component_input_text';
			$tipo	= 'test52';
			$mode	= 'list';
			$lang	= 'lg-eng';
			$component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				$mode, // string mode
				$lang, // string lang
				$section_tipo, // string section_tipo
				// false
			);
			$component_dato = $component->get_dato();

			$new_dato = [
				'New dato key 0 C'
			];
			$component->set_dato($new_dato);

			$section->save_component_dato(
				$component,
				'direct',
				false // bool $save_to_database
			);
			$dato_from_section = $section_dato->components->{$tipo}->dato->{$lang};

		// section 2
			$section2 = section::get_instance(
				$section_id, // string|null section_id
				$section_tipo, // string section_tipo
				'list',
				// false
			);
		// component 2
			$component2 = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				$mode, // string mode
				$lang, // string lang
				$section_tipo, // string section_tipo
				// false
			);
				// dump($component2->get_dato(), '$component2->get_dato() 2 ++ '.to_string($component2->uid));

		$this->assertSame(
			$component->uid, $component2->uid,
			'expected component is the same uid '.$component->uid.' => '.$component2->uid
		);
	}//end test_save_component_dato



	/**
	* TEST_SAVE_COMPONENTS
	* @return void
	*/
	public function test_save_components() : void {

		// elements
			$elements = get_elements();

		foreach ($elements as $element) {
			$_ENV['DEDALO_ERRORS'] = []; // reset

			$test_save = $element->test_save ?? true;
			if (!isset($element->new_value) || !$test_save) {
				continue;
			}

			// component
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo, // string section_tipo
					// false
				);
				$component_dato = $component->get_dato();

			// new data
				$arguments	= $element->new_value_params ?? [];
				$new_data	= call_user_func_array($element->new_value, $arguments);

				$this->assertTrue(
					gettype($new_data)==='array',
					'new_data type expected array. current type: ' .gettype($new_data)
				);

				$component->set_dato($new_data);

			// check new data assignation
				$component_dato2 = $component->get_dato();

				$this->assertEquals(
					$component_dato2, $new_data,
					'both data and new_data expected equal'
				);

				$result = $component->Save();

				$this->assertTrue(
					$result===(int)$element->section_id,
					'save result expected as int '.$element->section_id.' - obtained: '. to_string($result)
				);

			// component copy
				$component_copy = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo, // string section_tipo
					false
				);
				$this->assertTrue(
					$component_copy->uid!==$component->uid ,
					'expected different uid ' . "$component_copy->uid => $component->uid"
				);

				$component_copy_dato = $component_copy->get_dato();

				$this->assertEquals(
					$component_copy_dato,
					$new_data,
					'expected data are equal '.gettype($component_copy_dato).'/'.gettype($new_data)
				);

			// debug_log(__METHOD__." )))))))))))))))))))) Processed  $element->model".to_string(), logger::ERROR);
		}//end foreach ($elements as $element)
	}//end test_save_components



}//end class component_common_test
