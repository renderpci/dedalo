<?php declare(strict_types=1);

use PHPUnit\TextUI\Configuration\Php;

// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_common_test extends BaseTestCase {



	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$result = $this->user_login();

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);

	}//end test_user_login



	/////////// ⬇︎ test start ⬇︎ ////////////////



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
				$is_translatable = ontology_node::get_translatable($element->tipo);
				$with_lang_versions = $component3->with_lang_versions;
				$expected_component_lang = ($is_translatable===true || $with_lang_versions===true)
					? DEDALO_DATA_LANG
					: DEDALO_DATA_NOLAN;
				if ($with_lang_versions===true && $element->model!=='component_iri') {
					$expected_component_lang = DEDALO_DATA_LANG; // component_iri case
				}
				$component_lang = $component3->get_lang();
				if ($expected_component_lang!==$component_lang) {
					error_log($element->model.' - expected_component_lang:'.$expected_component_lang . ' => component_lang:' . $component_lang);
				}
				$this->assertTrue(
					$expected_component_lang===$component_lang ,
					"expected same lang:  $expected_component_lang => $component_lang" . PHP_EOL
						.'expected_component_lang: ' . to_string($expected_component_lang) . PHP_EOL
						.'component_lang: ' . to_string($component_lang) . PHP_EOL
						.'model: ' . $element->model . PHP_EOL
						.'translatable: ' . to_string(ontology_node::get_translatable($element->tipo)) . PHP_EOL
						.'with_lang_versions: ' . to_string( $component3->with_lang_versions ) . PHP_EOL
						.'$element->lang: ' . to_string( $element->lang ) . PHP_EOL
						.'translatable: ' . to_string(ontology_node::get_translatable($element->tipo)) . PHP_EOL
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
			
			// 1 - Check result type
			$this->assertTrue(
				gettype($result)==='string',
				'result type expected string. current type: ' .gettype($result)
			);

			// 2 - Check result format			
			// expected format: test89_test3_1
			$expected =   $component->get_tipo() . locator::DELIMITER 
						. $component->get_section_tipo() . locator::DELIMITER 
						. $component->get_section_id();
			$this->assertTrue(
				$result===$expected,
				'result expected is not correct ' . PHP_EOL
					.'expected: ' . $expected . PHP_EOL
					.'result: ' . $result
			);

			// 3 - Check errors
			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);
		}
	}//end test_get_identifier



	/**
	* TEST_set_data_default
	* @return void
	*/
	public function test_set_data_default() {

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

			$result = $component->set_data_default();

			// 1 - Check result type
			$this->assertTrue(
				gettype($result)==='boolean',
				'result type expected boolean. current type: ' .gettype($result)
			);

			// 2 - Check errors
			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);
		}
	}//end test_set_data_default



	/**
	* TEST_set_data_resolved
	* @return void
	*/
	public function test_set_data_resolved() {

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo, // string section_tipo
				false // cache
			);

			$data		= ['fake data resolved'];
			$expected	= ['fake data resolved'];

			$component->set_data_resolved($data);

			// $result = $component->data_resolved;
			$result = $component->get_data_resolved();

			// 1 - Check result type
			$this->assertTrue(
				gettype($result)==='array',
				'result type expected array. current type: ' .gettype($result)
			);

			// 2 - Check result value
			$this->assertTrue(
				$result===$expected,
				'result expected is not correct (data_resolved) '. $component->label . PHP_EOL
					.'expected: ' . json_encode($expected) . PHP_EOL
					.'result: ' . json_encode($result)
			);

			// 3 - Check errors
			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);
		}
	}//end test_set_data_resolved



	/**
	* TEST_SET_DATA
	* @return void
	*/
	public function test_set_data() {

		$this->user_login();

		$direct_data = component_common::get_direct_data_components();

		foreach (get_elements() as $element) {
			$_ENV['DEDALO_LAST_ERROR'] = null; // reset
			
			if (isset($element->test_save) && $element->test_save===false || !isset($element->new_value)) {
				echo '- Ignored save test for model: ' . $element->model . PHP_EOL;
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
					// dump($new_data, ' new_data ++ '.to_string($element->model));
					continue;
				}

				// Add id to new data
				$new_data_fixed = array_map(function($item) use ($element, $direct_data) {					
					if(in_array($element->model, $direct_data)) {
						$data_element = $item;
						$data_element->id = 1;
					}else{
						$data_element = new stdClass();
						$data_element->value = $item;
						$data_element->id = 1;
					}
					return $data_element;
				}, $new_data);
			
				// 1 - Check new_data_fixed type
				$this->assertTrue(
					gettype($new_data_fixed)==='array',
					'new_data_fixed type expected array. current type: ' .gettype($new_data_fixed)
				);

				// 2 - Set data
				$component->set_data($new_data_fixed);

			// 3 - Check errors
			$last_error = $_ENV['DEDALO_LAST_ERROR'] ?? null;
			$this->assertTrue(
				empty($last_error),
				'expected running without errors' . PHP_EOL
				.' last_error: '. json_encode($last_error, JSON_PRETTY_PRINT)
			);

			// 5 - Check data
			// Skip component_relation_related beacuse uses a special 'type_rel' added to the locator by the component
			if(!in_array($element->model, ['component_relation_related'])) {
				$data = $component->get_data();
				// dump($data, ' data ++ '.to_string($element->model));
				// dump($new_data_fixed, ' new_data_fixed ++ '.to_string($element->model));
				foreach ($data as $key => $data_element) {
					$is_eq = $data_element == $new_data_fixed[$key];
					$this->assertTrue(
					$is_eq,
					'expected data element is the same as new data' . PHP_EOL
					.'model: ' . $element->model . PHP_EOL
					.'data_element: ' . json_encode($data_element, JSON_PRETTY_PRINT) . PHP_EOL
					.'new_data: ' . json_encode($new_data_fixed[$key], JSON_PRETTY_PRINT) . PHP_EOL
					.gettype($data_element).PHP_EOL
					.gettype($new_data_fixed[$key]).PHP_EOL
				);
			}
		}//end foreach

			// foreach ($component->get_data_resolved() as $key => $value) {
			// 	$this->assertTrue(
			// 		$value == $new_data_fixed[$key],
			// 		'expected data resolved element is the same as new data.'
			// 		.'model: ' . $element->model . PHP_EOL
			// 		.'value: ' . json_encode($value, JSON_PRETTY_PRINT) . PHP_EOL
			// 		.'new_data_fixed: ' . json_encode($new_data_fixed[$key], JSON_PRETTY_PRINT) .PHP_EOL
			// 		.gettype($value).PHP_EOL
			// 		.gettype($new_data_fixed[$key]).PHP_EOL
			// 	);
			// }

			// 7 - Check ar_list_of_values
			$this->assertTrue(
				is_null($component->ar_list_of_values)===true,
				'expected ar_list_of_values is null: ' . is_null($component->ar_list_of_values)
			);
		}
	}//end test_set_data



	/**
	* TEST_GET_DATA
	* @return void
	*/
	public function test_get_data(): void {

		// default data
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

			// data
			$data = $component->get_data();

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			switch ($element->model) {
				case 'component_section_id':
					$this->assertTrue(
						gettype($data[0])==='integer' ,
						'expected type integer'
					);
					// $component->set_data('string');
					// $data = $component->get_data();
					// $this->assertTrue( gettype($data)==='integer' );
					break;
				default:
					$this->assertTrue(
						gettype($data)==='array' || ($data===null),
						'expected type array or null'
					);
					break;
			}
		}
	}//end test_get_data



	/**
	* TEST_LOAD_COMPONENT_DATA
	* @return void
	*/
	public function test_load_component_data() {

		// default data
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

			// $component->load_component_data(); is protected method (!)
			// get_data forces to load_component_data and therefore, section_record.
			$component->get_data();

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			if (!in_array($element->model, [
				'component_relation_index', // data is external, not loaded from section
				'component_relation_children', // data is external, not loaded from section
				'component_inverse', // data is external, not loaded from section
				'component_section_id' // data is direct, not loaded from section
			])) {
				
				$this->assertInstanceOf(section_record::class, $component->section_record);

				$this->assertTrue(
					$component->section_record->section_id == $component->section_id,
					'expected section_record section_id is the same as $component->section_id'. PHP_EOL
					.'component->section_record: ' . to_string($component->section_record)
				);
			}
		}
	}//end test_load_component_data



	/**
	* TEST_IS_TRANSLATABLE
	* @return void
	*/
	public function test_is_translatable() {

		// default data
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

		$this->user_login();

		// default data
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
				'expected running without errors' . PHP_EOL
				.'$_ENV[DEDALO_LAST_ERROR]: ' . to_string($_ENV['DEDALO_LAST_ERROR'])
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

		$this->user_login();

		// default data
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
			
			$this->assertInstanceOf(dd_grid_cell_object::class, $dd_grid_cell_object);

			switch ($element->model) {
				case 'component_section_id':
					$this->assertTrue(
						gettype($dd_grid_cell_object->value)==='integer',
						'expected get_grid_value type is object->value. ' .gettype($dd_grid_cell_object->value) ." ($element->model)"
					);
					break;
				default:
					$this->assertTrue(
						gettype($dd_grid_cell_object->value)==='array' || gettype($dd_grid_cell_object->value)==='NULL',
						'expected get_grid_value type is object->value. ' .gettype($dd_grid_cell_object->value) ." ($element->model)"
					);
					break;		
			}

			// Columns type test
			$this->assertTrue(
				gettype($dd_grid_cell_object->ar_columns_obj)==='array',
				'expected get_grid_value type is object. ' .gettype($dd_grid_cell_object->ar_columns_obj) ." ($element->model)"
			);
		}
	}//end test_get_grid_value



	/**
	* TEST_GET_RAW_VALUE
	* @return void
	*/
	public function test_get_raw_value() {

		$this->user_login();

		// default data
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

			$this->assertInstanceOf(dd_grid_cell_object::class, $dd_grid_cell_object);

			if (empty($dd_grid_cell_object->value)) {
				continue;
			}

			if ($element->model==='component_section_id') {
				$this->assertTrue(
					gettype($dd_grid_cell_object->value)==='array',
					'expected get_grid_value type is array. ' .gettype($dd_grid_cell_object->value) ." ($element->model)"
				);
			}else{
				if (in_array($element->model, component_relation_common::get_components_with_relations())) {
					$this->assertTrue(
						gettype($dd_grid_cell_object->value)==='array',
						'expected get_grid_value type is array. ' .gettype($dd_grid_cell_object->value) ." ($element->model)"
					);
				}else{						
					$this->assertTrue(
						gettype($dd_grid_cell_object->value)==='array',
						'expected get_grid_value type is array. ' .gettype($dd_grid_cell_object->value) ." ($element->model)"
					);				
				}
			}			
		}//end foreach (get_elements() as $element)
	}//end test_get_raw_value



	/**
	* TEST_get_grid_flat_value
	* @return void
	*/
	public function test_get_grid_flat_value() {

		$this->user_login();

		// default data
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

			$this->assertInstanceOf(dd_grid_cell_object::class, $dd_grid_cell_object);

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
	public function test_save() {

		$this->user_login();

		$checked = [];

		// default data
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

			$component_data = $component->get_data();

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			// new data
				$arguments	= $element->new_value_params ?? [];
				$new_data_base	= call_user_func_array($element->new_value, $arguments);

				// Add id to new data
				$new_data = array_map(function($item) use ($element) {					
					if(in_array($element->model, component_relation_common::get_components_with_relations())) {
						$data_element = clone $item;
						$data_element->id = 1;
					}else{
						$data_element = new stdClass();
						$data_element->id = 1;
						$data_element->value = $item;
					}
					return $data_element;
				}, $new_data_base);

				$this->assertTrue(
					gettype($new_data)==='array',
					'new_data type expected array. current type: ' .gettype($new_data)
				);

				$component->set_data($new_data);

			// check new data assignation
				$component_data2 = $component->get_data();

				switch($element->model) {

					case 'component_filter':
					case 'component_filter_master':
						// Nothing to do
						break;
					case 'component_relation_related':
						$included = locator::in_array_locator($new_data[0], $component_data2, ['section_tipo','section_id']);
						$this->assertTrue(
							$included===true,
							'Current component data must contain all new locators '.$element->model .PHP_EOL							
								.'new_data        : '.json_encode($new_data, JSON_PRETTY_PRINT) . PHP_EOL							
								.'component_data2 : '.json_encode($component_data2, JSON_PRETTY_PRINT) .PHP_EOL
								.'$element->new_value: '.json_encode($element->new_value, JSON_PRETTY_PRINT) .PHP_EOL
								.'$element->new_value_params: '.json_encode($element->new_value_params, JSON_PRETTY_PRINT) .PHP_EOL
								.'new_data_base   : '.json_encode($new_data_base, JSON_PRETTY_PRINT) .PHP_EOL
						);
						break;
					default:
						$this->assertEquals(
							$component_data2, $new_data,
							'both data and new_data expected equal. model: '.$element->model .' '. PHP_EOL
							.'new_data        : '.json_encode($new_data, JSON_PRETTY_PRINT) .PHP_EOL	
							.'component_data2 : '.json_encode($component_data2, JSON_PRETTY_PRINT)
						);
					break;
				}

				$result = $component->save();

				$this->assertTrue(
					gettype($result)==='boolean',
					'expected type boolean : ' . PHP_EOL
						. gettype($result)
				);

				$this->assertTrue(
					$result===true,
					'save result expected as true '.$element->section_id.' - obtained: '. to_string($result)
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

				$component_copy_data = $component_copy->get_data();

				switch($element->model) {

					case 'component_filter':
					case 'component_filter_master':
						// Nothing to do
						break;
					case 'component_relation_related':
						$included = locator::in_array_locator($new_data[0], $component_data2, ['section_tipo','section_id']);
						$this->assertTrue(
							$included===true,
							'Current component data must contain all new locators '.$element->model .PHP_EOL							
								.'new_data            : '.json_encode($new_data, JSON_PRETTY_PRINT) . PHP_EOL							
								.'component_copy_data : '.json_encode($component_copy_data, JSON_PRETTY_PRINT) .PHP_EOL
						);
						break;
					default:
						$this->assertEquals(
							$component_copy_data,
							$new_data,
							'expected data is equal '.gettype($component_copy_data).'/'.gettype($new_data) .PHP_EOL
							.'component_copy_data : '.json_encode($component_copy_data, JSON_PRETTY_PRINT) .PHP_EOL
							.'new_data            : '.json_encode($new_data, JSON_PRETTY_PRINT)
						);
					break;
				}
				
			$checked[] = $element->model;
			
		}//end foreach (get_elements() as $element)
	}//end test_save



	/**
	* TEST_SAVE_ACTIVITY
	* @return void
	*/
	public function test_save_activity() {

		// default data
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

		// default data
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

		$this->user_login();

		// default data
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

			switch ($element->model) {
				case 'component_inverse':
				case 'component_section_id':
					break;
				
				default:
					$this->assertTrue(
						$component->get_data()===null,
						'response component->data expected null. current: ' . PHP_EOL
						.json_encode($component->get_data()) . PHP_EOL
						.' - '.$element->model
					);
					break;
			}
		}
	}//end test_empty_data



	/**
	* TEST_GET_AR_LIST_OF_VALUES
	* @return void
	*/
	public function test_get_ar_list_of_values() {

		$this->user_login();

		// default data
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



	// /**
	// * TEST_GET_COMPONENT_AR_LANGS
	// * @return void
	// */
	// public function test_get_component_ar_langs() {

	// 	// default data
	// 	foreach (get_elements() as $element) {
	// 		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

	// 		$component = component_common::get_instance(
	// 			$element->model, // string model
	// 			$element->tipo, // string tipo
	// 			$element->section_id, // string section_id
	// 			$element->mode, // string mode
	// 			$element->lang, // string lang
	// 			$element->section_tipo, // string section_tipo
	// 			false
	// 		);

	// 		$result = $component->get_component_ar_langs();
	// 			// dump($result, ' get_component_ar_langs result ++ '.to_string($element->model));

	// 		$this->assertTrue(
	// 			empty($_ENV['DEDALO_LAST_ERROR']),
	// 			'expected running without errors'
	// 		);

	// 		$this->assertTrue(
	// 			gettype($result)==='array',
	// 			'result type expected array. current type: ' .gettype($result) .' - '.$element->model
	// 		);
	// 	}
	// }//end test_get_component_ar_langs



	/**
	* TEST_get_ar_target_section_ddo
	* @return void
	*/
	public function test_get_ar_target_section_ddo() {

		$this->user_login();

		// default data
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

		$this->user_login();

		// default data
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
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		// default data
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

			$response = $component::update_data_version((object)[
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
	}//end test_update_data_version



	/**
	* TEST_REGENERATE_COMPONENT
	* @return void
	*/
	public function test_regenerate_component() {

		// default data
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

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
					'expected running without errors' . PHP_EOL
					. to_string($_ENV['DEDALO_LAST_ERROR'])  . PHP_EOL
					. ' response: ' . to_string($response)  . PHP_EOL
			);

			$this->assertTrue(
				gettype($response)==='boolean',
				'response type expected boolean. current type: ' .gettype($response) .' - '.$element->model
			);
		}
	}//end test_regenerate_component



	/**
	* TEST_GET_COMPONENT_DATA_FALLBACK
	* Only for component_string_common extends
	* @return void
	*/
	public function test_get_component_data_fallback() {

		// default data
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

			if (!is_subclass_of($component, 'component_string_common')) {
				// ignore
				continue;
			}

			$result = $component->get_component_data_fallback(
				$element->lang,
				DEDALO_DATA_LANG_DEFAULT
			);
				// dump($result, ' result ++ '.to_string($element->model));

			$this->assertTrue(
				empty($_ENV['DEDALO_LAST_ERROR']),
				'expected running without errors'
			);

			$this->assertTrue(
				gettype($result)==='array' || gettype($result)==='NULL',
				'result type expected array or NULL. current type: ' .gettype($result) .' - '.$element->model . PHP_EOL
				. ' lang: ' . $element->lang . PHP_EOL
				. ' DEDALO_DATA_LANG_DEFAULT: ' . DEDALO_DATA_LANG_DEFAULT . PHP_EOL
			);
		}
	}//end test_get_component_data_fallback



	/**
	* TEST_GET_COMPONENT_PERMISSIONS
	* @return void
	*/
	public function test_get_component_permissions() {

		// default data
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

		// default data
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
				'expected running without errors' . PHP_EOL
					.'model: ' . to_string($element->model) . PHP_EOL
					.'tipo: ' . to_string($element->tipo) . PHP_EOL
					.'section_id: ' . to_string($element->section_id) . PHP_EOL
					.'section_tipo: ' . to_string($element->section_tipo) . PHP_EOL
					.'DEDALO_LAST_ERROR: '.to_string($_ENV['DEDALO_LAST_ERROR'])
			);

			$this->assertTrue(
				gettype($json_data->context)==='array',
				'expected json_data->context type is array'
			);
			$this->assertTrue(
				gettype($json_data->data)==='array',
				'expected json_data->data type is array'
			);

			// data could be formed for various items (from subdatum) in different order.
			// We get the matching item with current component tipo.
			$data		= $json_data->data ?? [];
			$found_data	= array_find($data, function($el) use ($element){
				return $el->tipo===$element->tipo;
			});

			if ($found_data) {

				$this->assertTrue( $found_data->section_id===$component->get_section_id() );
				$this->assertTrue( $found_data->section_tipo===$component->get_section_tipo() );
				
				// Lang check
				$is_translatable = ontology_node::get_translatable($component->tipo);
				$with_lang_versions = $component->with_lang_versions;
				$expected_component_lang = ($is_translatable===true || $with_lang_versions===true)
					? $component->get_lang()
					: DEDALO_DATA_NOLAN;
				if($element->model !== 'component_iri') {
				
					$this->assertTrue( 
						$found_data->lang === $expected_component_lang,
						$element->model.' expected found_data->lang: ' . $found_data->lang . PHP_EOL
						. 'component_lang: ' . $component->get_lang() . PHP_EOL
						. 'expected_component_lang: ' . $expected_component_lang . PHP_EOL
					);
				}
				
				$this->assertTrue( $found_data->from_component_tipo===$component->get_tipo() );

				// if (gettype($found_data->value)!=='array' && !is_null($found_data->value)) {
				// 	dump($found_data, ' var ++ ))))))))))))))))) '.to_string($element->model));
				// 	dump(gettype($found_data->value), ' gettype ((((((((((((((((((( ))))))))))))))))))) ++ '.to_string($element->model));
				// }
				
				$this->assertTrue(
					gettype($found_data->value)==='array' || gettype($found_data->value)==='NULL',
					'expected type array|null value. type: '.gettype($found_data->value)
				);				
			}
		}
	}//end test_get_component_json



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



}//end class component_common_test
