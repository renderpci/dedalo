<?php
declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_common_test extends TestCase {



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



	/////////// ⬇︎ test start ⬇︎ ////////////////




	/**
	* BUILD_COMPONENT_INSTANCE
	* Reference component to apply common functions
	* @return
	*/
		// private function build_component_instance() {

		// 	$model			= 'conponent_3d';
		// 	$tipo			= 'test26';
		// 	$section_tipo	= 'test3';
		// 	$section_id		= 1;
		// 	$mode			= 'edit';
		// 	$lang			= DEDALO_DATA_NOLAN;

		// 	$component = component_common::get_instance(
		// 		$model, // string model
		// 		$tipo, // string tipo
		// 		$section_id,
		// 		$mode,
		// 		$lang,
		// 		$section_tipo
		// 	);

		// 	return $component;
		// }//end build_component_instance



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
				if ($component3->with_lang_versions===true) {
					$expected_component_lang = DEDALO_DATA_LANG; // component_iri case
				}
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
	* TEST_get_identifier
	* @return void
	*/
	public function test_get_identifier() {

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_identifier();

			$this->assertTrue(
				gettype($result)==='string',
				'result type expected string. current type: ' .gettype($result)
			);

			$expected = $component->get_tipo() . locator::DELIMITER . $component->get_section_tipo() . locator::DELIMITER . $component->get_section_id();
			$this->assertTrue(
				$result===$expected,
				'result expected is not correct ' . PHP_EOL
					.'expected: ' . $expected . PHP_EOL
					.'result: ' . $result
			);

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);
		}
	}//end test_get_identifier



	/**
	* TEST_SET_DATO_DEFAULT
	* @return void
	*/
	public function test_set_dato_default() {

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

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
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);
		}
	}//end test_set_dato_default



	/**
	* TEST_set_dato_resolved
	* @return void
	*/
	public function test_set_dato_resolved() {

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			if ($element->model==='component_check_box') {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false // cache
			);

			// null case
				$dato		= ['fake data'];
				$expected	= ['fake data'];

				$component->set_dato_resolved($dato);

				$result = $component->dato_resolved;

				$this->assertTrue(
					$result===$expected,
					'result expected is not correct (dato_resolved) '. $component->label . PHP_EOL
						.'expected: ' . json_encode($expected) . PHP_EOL
						.'result: ' . json_encode($result)
				);

				// $result = $component->get_dato();

				// $this->assertTrue(
				// 	$result===$expected,
				// 	'result expected is not correct (get_dato) ' . $component->label . PHP_EOL
				// 		.'expected: ' . json_encode($expected) . PHP_EOL
				// 		.'result: ' . json_encode($result)
				// );

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);
		}
	}//end test_set_dato_resolved



	/**
	* TEST_SET_DATO
	* @return void
	*/
	public function test_set_dato() {

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

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

			$last_error = $_ENV['DEDALO_LAST_ERROR'] ?? null;
			$this->assertTrue(
				empty($last_error),
				'expected running without errors' . PHP_EOL
				.' last_error: '. json_encode($last_error, JSON_PRETTY_PRINT)
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
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

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
				empty($_ENV['DEDALO_LAST_ERROR']),
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
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

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
				empty($_ENV['DEDALO_LAST_ERROR']),
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
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

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
							'dato_full expected $dato_full->{DEDALO_DATA_NOLAN} : ' .PHP_EOL
							.'lang: '.DEDALO_DATA_NOLAN .PHP_EOL
							.'dato_full: '.json_encode($dato_full) .PHP_EOL
							.'is_translatable: '.json_encode($is_translatable).PHP_EOL
							.'tipo: '.$element->tipo .PHP_EOL
							.'model: '.$element->model .PHP_EOL
							.'section_tipo: '.$element->section_tipo .PHP_EOL
							.'section_id: '.$element->section_id
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
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

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
				empty($_ENV['DEDALO_LAST_ERROR']),
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
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

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
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$loaded_matrix_data = $component->get_bl_loaded_matrix_data();

			$this->assertTrue(
				$loaded_matrix_data===true,
				'expected true from bl_loaded_matrix_data '.$element->model .PHP_EOL
				. json_encode($loaded_matrix_data)
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
	* TEST_IS_TRANSLATABLE
	* @return void
	*/
	public function test_is_translatable() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

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
				empty($_ENV['DEDALO_LAST_ERROR']),
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
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

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
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($value)==='string' || gettype($value)===null,
				'expected get_value type is string|null. ' .gettype($value) ." ($element->model)"
			);
		}
	}//end test_get_value



	/**
	* TEST_GET_GRID_VALUE
	* @return void
	*/
	public function test_get_grid_value() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$dd_grid_cell_object = $component->get_grid_value();
				// dump($dd_grid_cell_object, ' dd_grid_cell_object ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($dd_grid_cell_object)==='object',
				'expected get_grid_value type is object. ' .gettype($dd_grid_cell_object) ." ($element->model)"
			);

			if ($element->model==='component_section_id') {
				$this->assertTrue(
				gettype($dd_grid_cell_object->value)==='integer',
					'expected get_grid_value type is object->value. ' .gettype($dd_grid_cell_object->value) ." ($element->model)"
				);
			}else{
				$this->assertTrue(
					gettype($dd_grid_cell_object->value)==='array',
					'expected get_grid_value type is object->value. ' .gettype($dd_grid_cell_object->value) ." ($element->model)"
				);
			}

			$this->assertTrue(
				gettype($dd_grid_cell_object->ar_columns_obj)==='array',
				'expected get_grid_value type is object. ' .gettype($dd_grid_cell_object->ar_columns_obj) ." ($element->model)"
			);

			// if (!empty($dd_grid_cell_object->value)) {
			// 	$this->assertTrue(
			// 		!empty($dd_grid_cell_object->ar_columns_obj),
			// 		'expected get_grid_value type is NOT empty. ' ." ($element->model)"
			// 	);
			// }
		}
	}//end test_get_grid_value



	/**
	* TEST_GET_RAW_VALUE
	* @return void
	*/
	public function test_get_raw_value() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$dd_grid_cell_object = $component->get_raw_value();
				// dump($dd_grid_cell_object, ' raw_value dd_grid_cell_object ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($dd_grid_cell_object)==='object',
				'expected get_grid_value type is object. ' .gettype($dd_grid_cell_object) ." ($element->model)"
			);

			if (!empty($dd_grid_cell_object->value)) {

				if ($element->model==='component_section_id') {
					$this->assertTrue(
					gettype($dd_grid_cell_object->value)==='integer',
						'expected get_grid_value type is integer. ' .gettype($dd_grid_cell_object->value) ." ($element->model)"
					);
				}else{
					if (in_array($element->model, component_relation_common::get_components_with_relations())) {
						$this->assertTrue(
							gettype($dd_grid_cell_object->value)==='array',
							'expected get_grid_value type is array. ' .gettype($dd_grid_cell_object->value) ." ($element->model)"
						);
					}else{
						$this->assertTrue(
							gettype($dd_grid_cell_object->value)==='object',
							'expected get_grid_value type is object. ' .gettype($dd_grid_cell_object->value) ." ($element->model)"
						);
					}
				}
			}

			// $this->assertTrue(
			// 	gettype($dd_grid_cell_object->ar_columns_obj)==='array',
			// 	'expected get_grid_value type is object. ' .gettype($dd_grid_cell_object->ar_columns_obj) ." ($element->model)"
			// );

			// if (!empty($dd_grid_cell_object->value)) {
			// 	$this->assertTrue(
			// 		!empty($dd_grid_cell_object->ar_columns_obj),
			// 		'expected get_grid_value type is NOT empty. ' ." ($element->model)"
			// 	);
			// }
		}
	}//end test_get_raw_value



	/**
	* TEST_get_grid_flat_value
	* @return void
	*/
	public function test_get_grid_flat_value() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$dd_grid_cell_object = $component->get_grid_flat_value();
				// dump($dd_grid_cell_object, ' raw_value dd_grid_cell_object ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($dd_grid_cell_object)==='object',
				'expected get_grid_value type is object. ' .gettype($dd_grid_cell_object) ." ($element->model)"
			);

			if (!empty($dd_grid_cell_object->value)) {
				$this->assertTrue(
					gettype($dd_grid_cell_object->value)==='string',
					'expected get_grid_value type is string. type:' .gettype($dd_grid_cell_object->value) . PHP_EOL
					." ($element->model)" . PHP_EOL
					. json_encode($dd_grid_cell_object)
				);
			}
		}
	}//end test_get_grid_flat_value



	/**
	* TEST_SAVE
	* @return void
	*/
	public function test_Save() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$test_save = $element->test_save ?? true;
			if (!isset($element->new_value) || !$test_save) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$component_dato = $component->get_dato();

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

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

				if ($element->model==='component_filter' || $element->model==='component_filter_master') {
					$included = locator::in_array_locator($new_data[0], $component_dato2, ['section_tipo','section_id']);
					$this->assertTrue(
						$included===true,
						'Current component dato must contain all new locators '.$element->model .PHP_EOL
							.'component_dato2: '.json_encode($component_dato2) .PHP_EOL
							.'new_data       : '.json_encode($new_data)
					);
				}else{
					$this->assertEquals(
						$component_dato2, $new_data,
						'both data and new_data expected equal '.$element->model .PHP_EOL
							.'component_dato2: '.json_encode($component_dato2) .PHP_EOL
							.'new_data       : '.json_encode($new_data)
					);
				}

				$result = $component->Save();

				$this->assertTrue(
					gettype($result)==='integer',
					'expected type integer : ' . PHP_EOL
						. gettype($result)
				);

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

				if ($element->model==='component_filter' || $element->model==='component_filter_master') {

				}else{
					$this->assertEquals(
						$component_copy_dato,
						$new_data,
						'expected data is equal '.gettype($component_copy_dato).'/'.gettype($new_data) .PHP_EOL
						.'component_copy_dato: '.json_encode($component_copy_dato) .PHP_EOL
						.'new_data           : '.json_encode($new_data)
					);
				}
		}
	}//end test_Save



	/**
	* TEST_SAVE_ACTIVITY
	* @return void
	*/
	public function test_save_activity() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$response = $component->save_activity();
				// dump($response, ' $response ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				is_null($response),
				'expected response type is null. received: '.gettype($response)
			);
		}
	}//end test_save_activity



	/**
	* TEST_PROPAGATE_TO_OBSERVERS
	* @return void
	*/
	public function test_propagate_to_observers() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$response = $component->propagate_to_observers();
				// dump($response, ' $response ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($response)==='NULL' || gettype($response)==='array',
				'response type expected array. current type: ' .gettype($response)
			);
		}
	}//end test_propagate_to_observers



	/**
	* TEST_empty_data
	* @return void
	*/
	public function test_empty_data() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$response = $component->empty_data();
				// dump($response, ' $response ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($response)==='boolean',
				'response type expected boolean. current type: ' .gettype($response) .' - '.$element->model
			);

			$this->assertTrue(
				$response===true,
				'response type expected true. current: ' . PHP_EOL
				.json_encode($response) . PHP_EOL
				.' - '.$element->model
			);

			if (in_array($element->model, component_relation_common::get_components_with_relations())
				&& $element->model!=='component_inverse') {
				$this->assertTrue(
					$component->dato===[],
					'response component->dato expected []. current: ' . PHP_EOL
					.json_encode($component->dato) . PHP_EOL
					.' - '.$element->model
				);
			}else{
				$this->assertTrue(
					$component->dato===null,
					'response component->dato expected null. current: ' . PHP_EOL
					.json_encode($component->dato) . PHP_EOL
					.' - '.$element->model
				);
			}
		}
	}//end test_empty_data



	/**
	* TEST_GET_REQUIRED
	* @return void
	*/
	public function test_get_required() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$response = $component->get_required();
				// dump($response, ' $response ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($response)==='boolean',
				'response type expected boolean. current type: ' .gettype($response) .' - '.$element->model
			);
		}
	}//end test_get_required



	/**
	* TEST_GET_VALOR
	* @return void
	*/
	public function test_get_valor() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$result = $component->get_valor();

			$last_error = $_ENV['DEDALO_LAST_ERROR'] ?? null;

			$this->assertTrue(
				empty($last_error),
				'expected running without errors' . PHP_EOL
					.'model: ' . $element->model . PHP_EOL
					.'lang: ' . $element->lang . PHP_EOL
					.'last_error: '. json_encode($last_error, JSON_PRETTY_PRINT)
			);

			// (!) Important. This method is still used by diffusion (v5)
			// DO NOT CHANGE THE RETURN VALUES
		}
	}//end test_get_valor



	/**
	* TEST_GET_VALOR_EXPORT
	* @return void
	*/
	public function test_get_valor_export() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$response = $component->get_valor_export();
				// dump($response, ' $response ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($response)==='string' || gettype($response)==='NULL',
				'response type expected string|null. current type: ' .gettype($response) .' - '.$element->model
			);

			// (!) Important. This method is still used by diffusion (v5)
			// DO NOT CHANGE THE RETURN VALUES
		}
	}//end test_get_valor_export



	/**
	* TEST_PARSE_SEARCH_DYNAMIC
	* @return void
	*/
	public function XXX_test_parse_search_dynamic() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$response = $component->parse_search_dynamic(
				$ar_filtered_by_search_dynamic
			);
				// dump($response, ' $response ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($response)==='string' || gettype($response)==='NULL',
				'response type expected string|null. current type: ' .gettype($response) .' - '.$element->model
			);

			// (!) Important. This method is still used by diffusion (v5)
			// DO NOT CHANGE THE RETURN VALUES
		}
	}//end test_parse_search_dynamic



	/**
	* TEST_GET_AR_LIST_OF_VALUES
	* @return void
	*/
	public function test_get_ar_list_of_values() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$response = $component->get_ar_list_of_values();
				// dump($response, ' $response ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($response)==='object',
				'response type expected object. current type: ' .gettype($response) .' - '.$element->model
			);

			$this->assertTrue(
				gettype($response->result)==='array',
				'response->result type expected array. current type: ' .gettype($response->result) .' - '.$element->model
			);

			$this->assertTrue(
				gettype($response->msg)==='string',
				'response->msg type expected string. current type: ' .gettype($response->msg) .' - '.$element->model
			);
		}
	}//end test_get_ar_list_of_values



	/**
	* TEST_DECORE_UNTRANSLATED
	* @return void
	*/
	public function test_decore_untranslated() {

		$response = component_common::decore_untranslated("I'm a automatic test string");

		$this->assertTrue(
			gettype($response)==='string',
			'response type expected string. current type: ' .gettype($response) .' - component_common::test_decore_untranslated'
		);

		$this->assertTrue(
			strpos($response, '<mark>')===0,
			'response expected to contains <mark> - component_common::test_decore_untranslated - ' . $response
		);

		$response = component_common::decore_untranslated(null);

		$this->assertTrue(
			gettype($response)==='NULL',
			'response type expected NULL. current type: ' .gettype($response) .' - component_common::test_decore_untranslated'
		);
	}//end test_decore_untranslated



	/**
	* TEST_add_object_to_dato
	* @return void
	*/
	public function test_add_object_to_dato() {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$object = (object)[
			'section_tipo'	=> '2',
			'section_id'	=> 'test3'
		];
		$dato = [
			(object)[
				'section_tipo'	=> '3',
				'section_id'	=> 'test3'
			]
		];
		$response = component_common::add_object_to_dato($object, $dato);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($response)==='array',
			'response type expected array. current type: ' .gettype($response) .' - component_common::test_add_object_to_dato'
		);

		$this->assertTrue(
			count($response)===2,
			'response count expected is 2. count: ' .count($response) .' - component_common::test_add_object_to_dato'
		);

		// insert already existing element
		$object = (object)[
			'section_tipo'	=> '3',
			'section_id'	=> 'test3'
		];
		$response2 = component_common::add_object_to_dato($object, $response);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertTrue(
			count($response2)===2,
			'response count expected is 2. count: ' .count($response2) .' - component_common::test_add_object_to_dato'
		);
	}//end test_add_object_to_dato



	/**
	* TEST_GET_COMPONENT_AR_LANGS
	* @return void
	*/
	public function test_get_component_ar_langs() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$result = $component->get_component_ar_langs();
				// dump($result, ' get_component_ar_langs result ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($result)==='array',
				'result type expected array. current type: ' .gettype($result) .' - '.$element->model
			);
		}
	}//end test_get_component_ar_langs



	/**
	* TEST_get_ar_target_section_ddo
	* @return void
	*/
	public function test_get_ar_target_section_ddo() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$result = $component->get_ar_target_section_ddo();

		// expected sample
			// [
			//     {
			//         "typo": "ddo",
			//         "tipo": "test3",
			//         "model": "section",
			//         "label": "Test Unit (data on matrix_test)",
			//         "color": "#b9b9b9",
			//         "permissions": 2,
			//         "buttons": [
			//             {
			//                 "model": "button_new",
			//                 "permissions": 2
			//             },
			//             {
			//                 "model": "button_delete",
			//                 "permissions": 2
			//             }
			//         ],
			//         "matrix_table": "matrix_test"
			//     }
			// ]

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($result)==='array',
				'result type expected array|null. current type: ' .gettype($result) .' - '.$element->model
			);

			if (!empty($result)) {
				$this->assertTrue(
					!empty($result) && !empty($result[0]),
					'result expected not empty ' .$element->model .PHP_EOL
					. json_encode($result)
				);
				$this->assertTrue(
					$result[0]->typo==='ddo',
					'result[0]->typo expected "ddo" ' .$element->model .PHP_EOL
					. json_encode($result)
				);
				$this->assertTrue(
					$result[0]->model==='section',
					'result[0]->model expected "section" ' .$element->model .PHP_EOL
					. json_encode($result)
				);
				$this->assertTrue(
					$result[0]->permissions>=1,
					'expected result[0]->permissions>=1 ' .$element->model .PHP_EOL
					. json_encode($result)
				);
				$this->assertTrue(
					isset($result[0]->buttons),
					'expected isset($result[0]->buttons) ' .$element->model .PHP_EOL
					. json_encode($result)
				);
			}
		}
	}//end test_get_ar_target_section_ddo



	/**
	* TEST_GET_AR_TARGET_SECTION_TIPO
	* @return void
	*/
	public function test_get_ar_target_section_tipo() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$result = $component->get_ar_target_section_tipo();
				// dump($result, ' get_component_ar_langs result ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($result)==='array',
				'result type expected array. current type: ' .gettype($result) .' - '.$element->model
			);

			if (!is_null($result)) {
				$this->assertTrue(
					!empty($result) && !empty($result[0]),
					'result expected not empty ' .$element->model .PHP_EOL
					. json_encode($result)
				);
			}
		}
	}//end test_get_ar_target_section_tipo



	/**
	* TEST_update_dato_version
	* @return void
	*/
	public function test_update_dato_version() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$response = $component::update_dato_version((object)[
				'update_version'	=> [6,0,0],
				'tipo'				=> $element->tipo,
				'section_tipo'		=> $element->section_tipo,
				'section_id'		=> $element->section_id
			]);
				// dump($response, ' get_component_ar_langs response ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($response)==='object',
				'response type expected object. current type: ' .gettype($response) .' - '.$element->model
			);

			$this->assertTrue(
				gettype($response->result)==='integer',
				'response->result type expected integer. current type: ' .gettype($response) .' - '.$element->model
			);

			$this->assertTrue(
				gettype($response->msg)==='string',
				'response->msg type expected integer. current type: ' .gettype($response) .' - '.$element->model
			);
		}
	}//end test_update_dato_version



	/**
	* TEST_REGENERATE_COMPONENT
	* @return void
	*/
	public function test_regenerate_component() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$test_save = $element->test_save ?? true;
			if (!isset($element->new_value) || !$test_save) {
				continue;
			}

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$response = $component->regenerate_component();
				// dump($response, '  response ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors' . PHP_EOL
				. to_string($_ENV['DEDALO_LAST_ERROR'])
			);

			$this->assertTrue(
				gettype($response)==='boolean',
				'response type expected boolean. current type: ' .gettype($response) .' - '.$element->model
			);
		}
	}//end test_regenerate_component



	/**
	* TEST_EXTRACT_COMPONENT_DATO_FALLBACK
	* @return void
	*/
	public function test_extract_component_dato_fallback() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$result = $element->model::extract_component_dato_fallback(
				$component,
				DEDALO_DATA_LANG,
				DEDALO_DATA_LANG_DEFAULT
			);
				// dump($result, ' result ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($result)==='array',
				'result type expected array. current type: ' .gettype($result) .' - '.$element->model
			);
		}
	}//end test_extract_component_dato_fallback



	/**
	* TEST_EXTRACT_COMPONENT_VALUE_FALLBACK
	* @return void
	*/
	public function test_extract_component_value_fallback() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$result = $element->model::extract_component_value_fallback(
				$component,
				DEDALO_DATA_LANG
			);
			// dump($result, ' result ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($result)==='string',
				'result type expected string. current type: ' .gettype($result) .' - '.$element->model
			);
		}
	}//end test_extract_component_value_fallback



	/**
	* TEST_GET_COMPONENT_PERMISSIONS
	* @return void
	*/
	public function test_get_component_permissions() {

		// default dato
		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false
			);

			$result = $component->get_component_permissions();
			// dump($result, ' result ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($result)==='integer',
				'result type expected integer. current type: ' .gettype($result) .' - '.$element->model
			);

			$expected = 2;

			$this->assertTrue(
				$result>=$expected,
				'result type expected '.$expected.'. current: ' .$result .' - '.$element->model
			);

			$component->set_permissions(1);
			$result = $component->get_component_permissions();
			$this->assertTrue(
				$result===1,
				'result type expected 1. current: ' .$result .' - '.$element->model
			);
		}//end foreach items
	}//end test_get_component_permissions



	/**
	* TEST_get_search_query
	* @return void
	*/
	public function test_get_search_query() {

		// default dato
		$query_object = json_decode('
			{
			  "q": "pepe",
			  "lang": "lg-spa",
			  "path": [
				{
				  "section_tipo": "oh1",
				  "component_tipo": "oh24",
				  "target_section": "rsc197"
				},
				{
				  "section_tipo": "rsc197",
				  "component_tipo": "rsc85",
				  "model": "component_input_text"
				}
			  ],
			  "component_path": [
				"dato"
			  ]
			}
		');

		$result = component_input_text::get_search_query($query_object);
			// dump($result, ' result ++ '.to_string());

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors'
		);

		$this->assertTrue(
			gettype($result)==='array',
			'result type expected array. current type: ' .gettype($result)
		);
	}//end test_get_search_query



	/**
	* TEST_GET_COMPONENT_JSON
	* @return void
	*/
	public function test_get_component_json(): void {

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

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
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors ('.$element->model.'): ' .to_string($_ENV['DEDALO_LAST_ERROR'])
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
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->get_diffusion_value();

			$this->assertTrue(
				gettype($result)==='string' || gettype($result)==='NULL' || gettype($result)==='array',
				'expected type string|null|array : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_get_diffusion_value



	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() {

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$result = $component->search_operators_info();

			$this->assertTrue(
				gettype($result)==='array',
				'expected type array : ' . PHP_EOL
					. gettype($result)
			);
		}
	}//end test_search_operators_info





	////////////////////////// common functions applied over reference component ///////////////////////////




	///////////////////////////// des ////////////////////////////////////////



	/**
	* TEST_SAVE_COMPONENT_DATO
	* @return void
	*/
		// public function XXX_test_save_component_dato() : void {

		// 	// working here (!)

		// 	// section 1
		// 		$section_id		= 1;
		// 		$section_tipo	= 'test3';
		// 		$section		= section::get_instance(
		// 			$section_id, // string|null section_id
		// 			$section_tipo, // string section_tipo
		// 			'list',
		// 			// false
		// 		);
		// 		$section_dato = $section->get_dato();

		// 	// component 1
		// 		$model	= 'component_input_text';
		// 		$tipo	= 'test52';
		// 		$mode	= 'list';
		// 		$lang	= 'lg-eng';
		// 		$component = component_common::get_instance(
		// 			$model, // string model
		// 			$tipo, // string tipo
		// 			$section_id, // string section_id
		// 			$mode, // string mode
		// 			$lang, // string lang
		// 			$section_tipo, // string section_tipo
		// 			// false
		// 		);
		// 		$component_dato = $component->get_dato();

		// 		$new_dato = [
		// 			'New dato key 0 C'
		// 		];
		// 		$component->set_dato($new_dato);

		// 		$section->save_component_dato(
		// 			$component,
		// 			'direct',
		// 			false // bool $save_to_database
		// 		);
		// 		$dato_from_section = $section_dato->components->{$tipo}->dato->{$lang};

		// 	// section 2
		// 		$section2 = section::get_instance(
		// 			$section_id, // string|null section_id
		// 			$section_tipo, // string section_tipo
		// 			'list',
		// 			// false
		// 		);
		// 	// component 2
		// 		$component2 = component_common::get_instance(
		// 			$model, // string model
		// 			$tipo, // string tipo
		// 			$section_id, // string section_id
		// 			$mode, // string mode
		// 			$lang, // string lang
		// 			$section_tipo, // string section_tipo
		// 			// false
		// 		);
		// 			// dump($component2->get_dato(), '$component2->get_dato() 2 ++ '.to_string($component2->uid));

		// 	$this->assertSame(
		// 		$component->uid, $component2->uid,
		// 		'expected component is the same uid '.$component->uid.' => '.$component2->uid
		// 	);
		// }//end test_save_component_dato



	/**
	* TEST_LOGOUT_USERS
	* @return void
	*/
		// public function XXX_test_logout_users(): void {

		// 	$users = [
		// 		-1,
		// 		1
		// 	];
		// 	foreach ($users as $user_id) {

		// 		// login_Test::logout($user_id);

		// 		$options = (object)[
		// 			'mode'	=> null,
		// 			'cause'	=> 'test unit exit'
		// 		];
		// 		login::quit($options);

		// 		// unset($_SESSION['dedalo']);

		// 		$this->assertTrue(
		// 			!isset($_SESSION['dedalo']['auth']),
		// 			'expected session dedalo auth is not set'
		// 		);
		// 	}
		// }//end test_logout_users



}//end class component_common_test
