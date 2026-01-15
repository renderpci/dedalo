<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_input_text_test extends BaseTestCase {



	public static $model		= 'component_input_text';
	public static $tipo			= 'test52';
	public static $section_tipo	= 'test3';



	/**
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

		$this->user_login();

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);

		return $component;
	}//end build_component_instance



	/**
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() {

		$component = $this->build_component_instance();

		// 1 - Get data in all langs
		$data = $component->get_data();

		$this->assertTrue(
			gettype($data)==='array' || gettype($data)==='NULL',
			'expected type array or NULL : ' . PHP_EOL
				. gettype($data)
		);
	}//end test_get_data



	/**
	* TEST_get_data_lang
	* @return void
	*/
	public function test_get_data_lang() {

		$component = $this->build_component_instance();

		// Set sample data
		$sample_data = $this->get_sample_data(self::$model);
		$component->set_data($sample_data);

		// 1 - Get data in specific lang
		$data = $component->get_data_lang('lg-eng');


		$this->assertTrue(
			gettype($data)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($data)
		);

		foreach ($data as $data_item) {
			$this->assertTrue(
				$data_item->lang==='lg-eng',
				'expected lang lg-eng : ' . PHP_EOL
					. $data_item->lang
			);
		}

		// 2 - Get data in specific lang (lg-spa)
		$data = $component->get_data_lang('lg-spa');

		$this->assertTrue(
			gettype($data)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($data)
		);

		foreach ($data as $data_item) {
			$this->assertTrue(
				$data_item->lang==='lg-spa',
				'expected lang lg-spa : ' . PHP_EOL
					. $data_item->lang
			);
		}

		// 3 - Get data in specific lang (lg-deu)
		$data = $component->get_data_lang('lg-deu');

		$this->assertTrue(
			gettype($data)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($data)
		);

		foreach ($data as $data_item) {
			$this->assertTrue(
				$data_item->lang==='lg-deu',
				'expected lang lg-deu : ' . PHP_EOL
					. $data_item->lang
			);
		}
	}//end test_get_data_lang



	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() {

		$component = $this->build_component_instance();

		$old_data = $component->get_data();

		// 1 - Set null
		$result = $component->set_data(null);

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);

		// 2 - Set sample data
		$sample_data = $this->get_sample_data(self::$model);
		$result = $component->set_data($sample_data);

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);

		$this->assertTrue(
			$component->get_data()===$sample_data,
			'expected true : ' . PHP_EOL
				. to_string($component->get_data()) . PHP_EOL
				. to_string($sample_data)
		);

		// restore data
		$component->set_data($old_data);
	}//end test_set_data



	/**
	* TEST_set_data_lang
	* @return void
	*/
	public function test_set_data_lang() {

		$lang = 'lg-eng';

		$component = $this->build_component_instance();
		$component->set_lang($lang);

		$sample_data = $this->get_sample_data(self::$model);
		$component->set_data($sample_data);

		// 1 - Set null
		$result = $component->set_data_lang(null, $lang);

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);

		$this->assertTrue(
			$component->get_data_lang($lang)===[],
			'expected true : ' . PHP_EOL
				. to_string($component->get_data_lang($lang)) . PHP_EOL
				. to_string([])
		);
		
		// 2 - Set sample data in current lang
		$lang_data = array_values(array_filter($sample_data, function($item) use ($lang) {
			return $item->lang===$lang;
		}));
		$result = $component->set_data_lang($lang_data, $lang);

		$this->assertTrue(
			$component->get_data_lang($lang) == $lang_data,
			'expected true : ' . PHP_EOL
				. to_string($component->get_data_lang($lang)) . PHP_EOL
				. to_string($lang_data)
		);

		// 3 - Set sample data in other lang (lg-spa)
		$lang = 'lg-spa';
		$lang_data = array_values(array_filter($sample_data, function($item) use ($lang) {
			return $item->lang===$lang;
		}));
		$result = $component->set_data_lang($lang_data, $lang);

		$this->assertTrue(
			$component->get_data_lang($lang) == $lang_data,
			'expected true : ' . PHP_EOL
				. to_string($component->get_data_lang($lang)) . PHP_EOL
				. to_string($lang_data)
		);

		// 4 - Set sample data in other lang (lg-deu)
		$lang = 'lg-deu';
		$lang_data = array_values(array_filter($sample_data, function($item) use ($lang) {
			return $item->lang===$lang;
		}));
		$result = $component->set_data_lang($lang_data, $lang);

		$this->assertTrue(
			$component->get_data_lang($lang) == $lang_data,
			'expected true : ' . PHP_EOL
				. to_string($component->get_data_lang($lang)) . PHP_EOL
				. to_string($lang_data)
		);
	}//end test_set_data_lang



	/**
	* TEST_is_empty
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

		// 1 - Set null
		$value = $component->is_empty(null);

		$this->assertTrue(
			gettype($value)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			$value===true,
			'expected empty : ' . PHP_EOL
				. to_string($value)
		);

		$value = $component->is_empty((object)[]);

		$this->assertTrue(
			$value===true,
			'expected empty : ' . PHP_EOL
				. to_string($value)
		);

		$value = $component->is_empty((object)['value'=>' ']);

		$this->assertTrue(
			$value===true,
			'expected empty : ' . PHP_EOL
				. to_string($value)
		);

		$value = $component->is_empty((object)['value'=>"\n"]);

		$this->assertTrue(
			$value===true,
			'expected empty : ' . PHP_EOL
				. to_string($value)
		);
	}//end test_is_empty



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() {

		$component = $this->build_component_instance();

		$sample_data = $this->get_sample_data(self::$model);
		$component->set_data($sample_data);

		$component->set_lang('lg-spa');

		$result = $component->get_grid_value(null);

		$this->assertTrue(
			gettype($result->value)==='array' || gettype($result->value)==='NULL',
			'expected type array or NULL : ' . PHP_EOL
				. gettype($result->value)
		);
		$this->assertTrue(
			gettype($result->fallback_value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result->fallback_value)
		);
		$this->assertTrue(
			$result->type==='column',
			'expected type array : ' . PHP_EOL
				. gettype($result->type)
		);
		$this->assertTrue(
			$result->cell_type==='text',
			'expected cell_type text : ' . PHP_EOL
				. to_string($result->cell_type)
		);
		
		// value
		$items = array_filter($sample_data, function($el){
			return $el->lang === 'lg-spa';
		});
		$values = array_map(function($el){
			return $el->value;
		}, $items);
		$value_plain = implode(' | ', $values);		
		$this->assertTrue(
			$result->value === [$value_plain],
			'expected value do not match:' . PHP_EOL
				. 'expected: ' . to_string($value_plain) . PHP_EOL
				. 'value: ' . to_string($result->value)
		);

		// fallback_value
		$items = array_filter($sample_data, function($el){
			return $el->lang === 'lg-eng';
		});
		$values = array_map(function($el){
			return $el->value;
		}, $items);
		$value_plain = implode(' | ', $values);	
		$this->assertTrue(
			$result->fallback_value === [$value_plain],
			'expected fallback_value do not match:' . PHP_EOL
				. 'expected: ' . to_string($value_plain) . PHP_EOL
				. 'value: ' . to_string($result->fallback_value)
		);

	}//end test_get_grid_value



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$options = new stdClass();
			$options->update_version = [6,0,0];
			$options->data_unchanged = null;

		$value = component_input_text::update_data_version($options);

		// expected sample
			//  {
			//     "result": 0,
			//     "msg": "This component component_input_text don't have update to this version (6.0.0). Ignored action"
			// }

		$this->assertTrue(
			gettype($value->result)==='integer',
				'expected value do not match:' . PHP_EOL
				.' expected: integer' . PHP_EOL
				.' value: '.gettype($value->result)
		);
		$this->assertTrue(
			$value->result===0,
				'expected value do not match:' . PHP_EOL
				.' expected: 0' . PHP_EOL
				.' value: '.to_string($value->result)
		);
	}//end test_update_data_version



	/**
	* TEST_conform_import_data
	* @return void
	*/
	public function test_conform_import_data() {

		$component = $this->build_component_instance();

		// 1 - String case
		$import_value = "Hello World";
		$column_name  = "Title";
		$response     = $component->conform_import_data($import_value, $column_name);

		$this->assertTrue(
			is_object($response),
			'expected response to be an object'
		);
		$this->assertTrue(
			$response->result === ["Hello World"],
			'expected result to be ["Hello World"], got: ' . to_string($response->result)
		);

		// 2 - JSON case
		$import_value = '["Hello", "World"]';
		$response     = $component->conform_import_data($import_value, $column_name);

		$this->assertTrue(
			$response->result === ["Hello", "World"],
			'expected result to be ["Hello", "World"], got: ' . to_string($response->result)
		);

		// 3 - Malformed JSON case
		$import_value = '["Hello"';
		$response     = $component->conform_import_data($import_value, $column_name);
		
		$this->assertTrue(
			$response->result === null,
			'expected result to be null for malformed JSON, got: ' . to_string($response->result)
		);
		$this->assertTrue(
			!empty($response->errors),
			'expected errors for malformed JSON'
		);
	}//end test_conform_import_data



	/**
	* TEST_get_grid_value_empty
	* @return void
	*/
	public function test_get_grid_value_empty() {

		$component = $this->build_component_instance();

		// Set empty data
		$component->set_data(null);

		$result = $component->get_grid_value(null);

		$this->assertTrue(
			empty($result->value),
			'expected value to be empty array, got: ' . to_string($result->value)
		);
		$this->assertTrue(
			empty($result->fallback_value),
			'expected fallback_value to be empty array, got: ' . to_string($result->fallback_value)
		);
	}//end test_get_grid_value_empty




	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() {

		$component = $this->build_component_instance();

		$value = $component->search_operators_info();

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);
		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_search_operators_info



	/////////// ⬇︎ common methods ⬇︎ ////////////////



	/**
	* TEST_get_model
	* @return void
	*/
	public function test_get_model() {

		$component = $this->build_component_instance();

		$value = $component->get_model();

		$this->assertTrue(
			gettype($value)==='string',
				'expected value do not match:' . PHP_EOL
				.' expected type: string' . PHP_EOL
				.' type: '.gettype($value)
		);

		$this->assertTrue(
			$value==='component_input_text',
				'expected value do not match:' . PHP_EOL
				.' expected: component_input_text' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_model



	/**
	* TEST_set_permissions
	* @return void
	*/
	public function test_set_permissions() {

		$component = $this->build_component_instance();

		$new_value = 1;

		$value = $component->set_permissions($new_value);

		$this->assertTrue(
			gettype($value)==='NULL',
				'expected value do not match:' . PHP_EOL
				.' expected type: NULL' . PHP_EOL
				.' type: '.gettype($value)
		);

		// permissions
		// $permissions = $component->get_permissions();
		$permissions = $component->get_component_permissions();

		$this->assertTrue(
			$component->permissions===$new_value,
				'expected permissions do not match:' . PHP_EOL
				.' expected: component_input_text' . PHP_EOL
				.' permissions: '.to_string($permissions)
		);
	}//end test_set_permissions


	
	/**
	* TEST_LOAD_STRUCTURE_DATA
	* @return void
	*/
	public function test_load_structure_data() {

		$component = $this->build_component_instance();

		$value = $component->load_structure_data();

		$this->assertTrue(
			gettype($value)==='boolean',
				'expected value do not match:' . PHP_EOL
				.' expected type: boolean' . PHP_EOL
				.' type: '.gettype($value)
		);
	}//end test_load_structure_data



	/**
	* TEST_is_translatable
	* @return void
	*/
	public function test_is_translatable() {

		$component = $this->build_component_instance();

		$value = $component->is_translatable();

		$this->assertTrue(
			gettype($value)==='boolean',
				'expected value do not match:' . PHP_EOL
				.' expected type: boolean' . PHP_EOL
				.' type: '.gettype($value)
		);

		$this->assertTrue(
			$value===true,
				'expected value do not match:' . PHP_EOL
				.' expected: true' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_is_translatable



	/**
	* TEST_set_lang
	* @return void
	*/
	public function test_set_lang() {

		$component = $this->build_component_instance();

		$result = $component->set_lang(
			'lg-spa'
		);

		$this->assertTrue(
			gettype($result)==='boolean',
				'expected value do not match:' . PHP_EOL
				.' expected type: boolean' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			$component->lang==='lg-spa',
				'expected result do not match:' . PHP_EOL
				.' expected: true' . PHP_EOL
				.' result: '.to_string($component->lang)
		);
	}//end test_set_lang



	/**
	* TEST_set_to_force_reload_data
	* @return void
	*/
	public function test_set_to_force_reload_data() {

		$component = $this->build_component_instance();

		$result = $component->set_to_force_reload_data();

		$this->assertTrue(
			gettype($result)==='NULL',
				'expected value do not match:' . PHP_EOL
				.' expected type: NULL' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_set_to_force_reload_data



	/**
	* TEST_get_properties
	* @return void
	*/
	public function test_get_properties() {

		$component = $this->build_component_instance();

		$result = $component->get_properties();

		$this->assertTrue(
			gettype($result)==='object' || gettype($result)==='NULL',
				'expected value do not match:' . PHP_EOL
				.' expected type: object|null' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_properties



	/**
	* TEST_set_properties
	* @return void
	*/
	public function test_set_properties() {

		$component = $this->build_component_instance();

		$result = $component->set_properties(
			(object)[
				'label' => 'rsc654'
			]
		);

		$this->assertTrue(
			gettype($result)==='boolean',
				'expected value do not match:' . PHP_EOL
				.' expected type: boolean' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			$result===true,
				'expected result do not match:' . PHP_EOL
				.' expected: true' . PHP_EOL
				.' result: '.to_string($result)
		);
	}//end test_set_properties



	/**
	* TEST_get_propiedades
	* @return void
	*/
	public function test_get_propiedades() {

		$component = $this->build_component_instance();

		$result = $component->get_propiedades();

		$this->assertTrue(
			gettype($result)==='NULL',
				'expected value do not match:' . PHP_EOL
				.' expected type: NULL' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_propiedades



	/**
	* TEST_get_ar_related_component_tipo
	* @return void
	*/
	public function test_get_ar_related_component_tipo() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_related_component_tipo();

		$this->assertTrue(
			gettype($result)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_ar_related_component_tipo



	/**
	* TEST_get_json
	* @return void
	*/
	public function test_get_json() {

		$component = $this->build_component_instance();

		$result = $component->get_json();

		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			gettype($result->context)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($result->context)
		);

		$this->assertTrue(
			gettype($result->data)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($result->data)
		);
	}//end test_get_json



	/**
	* TEST_get_structure_context
	* @return void
	*/
	public function test_get_structure_context() {

		$component = $this->build_component_instance();

		$result = $component->get_structure_context(
			2,
			true
		);

		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			$result->typo==='ddo',
				'expected value do not match:' . PHP_EOL
				.' expected type: ddo' . PHP_EOL
				.' type: '.to_string($result->typo)
		);

		$this->assertTrue(
			$result->tipo===$component->tipo,
				'expected value do not match:' . PHP_EOL
				.' expected type: ddo' . PHP_EOL
				.' type: '.to_string($result->tipo)
		);
	}//end test_get_structure_context



	/**
	* TEST_get_structure_context_simple
	* @return void
	*/
	public function test_get_structure_context_simple() {

		$component = $this->build_component_instance();

		$result = $component->get_structure_context_simple();

		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			$result->typo==='ddo',
				'expected value do not match:' . PHP_EOL
				.' expected type: ddo' . PHP_EOL
				.' type: '.to_string($result->typo)
		);

		$this->assertTrue(
			$result->tipo===$component->tipo,
				'expected value do not match:' . PHP_EOL
				.' expected type: ddo' . PHP_EOL
				.' type: '.to_string($result->tipo)
		);
	}//end test_get_structure_context_simple



	/**
	* TEST_build_request_config
	* @return void
	*/
	public function test_build_request_config() {

		$component = $this->build_component_instance();

		$result = $component->build_request_config();

		$this->assertTrue(
			gettype($result)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($result)
		);

		// $this->assertTrue(
		// 	$result->typo==='ddo',
		// 		'expected value do not match:' . PHP_EOL
		// 		.' expected type: ddo' . PHP_EOL
		// 		.' type: '.to_string($result->typo)
		// );

		// $this->assertTrue(
		// 	$result->tipo===$component->tipo,
		// 		'expected value do not match:' . PHP_EOL
		// 		.' expected type: ddo' . PHP_EOL
		// 		.' type: '.to_string($result->tipo)
		// );
	}//end test_build_request_config



	/**
	* TEST_get_ar_request_config
	* @return void
	*/
	public function test_get_ar_request_config() {

		$component = $this->build_component_instance();

		$result = $component->get_ar_request_config();

		$this->assertTrue(
			gettype($result)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_ar_request_config



	/**
	* TEST_get_request_config_object
	* @return void
	*/
	public function test_get_request_config_object() {

		$component = $this->build_component_instance();

		$result = $component->get_request_config_object();

		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_request_config_object



	/**
	* TEST_get_subdatum
	* @return void
	*/
	public function test_get_subdatum() {

		$component = $this->build_component_instance();

		$result = $component->get_subdatum();

		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_subdatum



	/**
	* TEST_get_records_mode
	* @return void
	*/
	public function test_get_records_mode() {

		$component = $this->build_component_instance();

		$result = $component->get_records_mode();

		$this->assertTrue(
			gettype($result)==='string',
				'expected value do not match:' . PHP_EOL
				.' expected type: string' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_records_mode



	/**
	* TEST_get_source
	* @return void
	*/
	public function test_get_source() {

		$component = $this->build_component_instance();

		$result = $component->get_source();

		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_source



	/**
	* TEST_get_section_id
	* @return void
	*/
	public function test_get_section_id() {

		$component = $this->build_component_instance();

		$result = $component->get_section_id();

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='string',
				'expected value do not match:' . PHP_EOL
				.' expected type: integer|string' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_section_id



	/**
	* TEST_get_data_item
	* @return void
	*/
	public function test_get_data_item() {

		$component = $this->build_component_instance();

		$result = $component->get_data_item(
			['my value']
		);

		$this->assertTrue(
			gettype($result)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_data_item



	/**
	* TEST_get_tools
	* @return void
	*/
	public function test_get_tools() {

		$component = $this->build_component_instance();

		$result = $component->get_tools();

		$this->assertTrue(
			gettype($result)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_tools



	/**
	* TEST_get_buttons_context
	* @return void
	*/
	public function test_get_buttons_context() {

		$component = $this->build_component_instance();

		$result = $component->get_buttons_context();

		$this->assertTrue(
			gettype($result)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_buttons_context



	/**
	* TEST_get_columns_map
	* @return void
	*/
	public function test_get_columns_map() {

		$component = $this->build_component_instance();

		$result = $component->get_columns_map();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
				'expected value do not match:' . PHP_EOL
				.' expected type: array|null' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_get_columns_map



	/**
	* TEST_set_view
	* @return void
	*/
	public function test_set_view() {

		$component = $this->build_component_instance();

		$result = $component->set_view(
			'line'
		);

		$this->assertTrue(
			gettype($result)==='NULL' ,
				'expected value do not match:' . PHP_EOL
				.' expected type: NULL' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			$component->view==='line' ,
				'expected value do not match:' . PHP_EOL
				.' expected view line' . PHP_EOL
				.' type: '.gettype($component->view)
		);
	}//end test_set_view



	/**
	* TEST_get_view
	* @return void
	*/
	public function test_get_view() {

		$component = $this->build_component_instance();

		$result = $component->get_view();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL' ,
				'expected value do not match:' . PHP_EOL
				.' expected type: string|null' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			$component->view==='line' ,
				'expected value do not match:' . PHP_EOL
				.' expected view line' . PHP_EOL
				.' type: '.gettype($component->view)
		);
	}//end test_get_view



	/**
	* TEST_get_children_view
	* @return void
	*/
	public function test_get_children_view() {

		$component = $this->build_component_instance();

		$result = $component->get_children_view();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL' ,
				'expected value do not match:' . PHP_EOL
				.' expected type: string|null' . PHP_EOL
				.' type: '.gettype($result)
		);

		$this->assertTrue(
			$component->view==='line' ,
				'expected value do not match:' . PHP_EOL
				.' expected view line' . PHP_EOL
				.' type: '.gettype($component->view)
		);
	}//end test_get_children_view



	/**
	* TEST_resolve_limit
	* @return void
	*/
	public function test_resolve_limit() {

		$component = $this->build_component_instance();

		$result = $component->resolve_limit();

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='NULL' ,
				'expected value do not match:' . PHP_EOL
				.' expected type: integer|null' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_resolve_limit



	/**
	* TEST_sanitize_text
	* @return void
	*/
	public function test_sanitize_text() {

		$input    = "Hello <script>alert('pwned');</script> World <noscript>No JS</noscript>";
		$expected = "Hello  World";
		$result   = component_input_text::sanitize_text($input);

		$this->assertTrue(
			$expected === $result,
			'expected sanitized text to match:' . PHP_EOL
				. 'expected: ' . to_string($expected) . PHP_EOL
				. 'result:   ' . to_string($result)
		);
	}



	/**
	* TEST_truncate_text
	* @return void
	*/
	public function test_truncate_text() {

		$input    = "The quick brown fox jumps over the lazy dog";
		$limit    = 16;
		$expected = "The quick brown...";
		$result   = component_input_text::truncate_text($input, $limit);

		$this->assertTrue(
			$expected === $result,
			'expected truncated text to match:' . PHP_EOL
				. 'expected: ' . to_string($expected) . PHP_EOL
				. 'result:   ' . to_string($result)
		);
	}



	/**
	* TEST_truncate_html
	* @return void
	*/
	public function test_truncate_html() {

		$input    = "<div><p>The <b>quick</b> brown fox jumps over the lazy dog</p></div>";
		$length   = 15;
		$expected = "<div><p>The <b>quick</b>...</p></div>";
		$result   = component_input_text::truncate_html($length, $input);

		$this->assertTrue(
			$expected === $result,
			'expected truncated HTML to match:' . PHP_EOL
				. 'expected: ' . to_string($expected) . PHP_EOL
				. 'result:   ' . to_string($result)
		);
	}



	/**
	* TEST_get_data_lang_with_fallback
	* @return void
	*/
	public function test_get_data_lang_with_fallback() {

		$component = $this->build_component_instance();
		$component->set_lang('lg-deu'); // Empty lang

		$sample_data = [
			(object)['id'=>1, 'lang'=>'lg-spa', 'value'=>'Hola']
		];
		$component->set_data($sample_data);

		$result = $component->get_data_lang_with_fallback();

		$this->assertTrue(
			!empty($result),
			'expected fallback data to be returned'
		);
		$this->assertTrue(
			'lg-spa' === $result[0]->lang,
			'expected fallback lang to be lg-spa, got: ' . to_string($result[0]->lang)
		);
	}



	/**
	* TEST_get_value_with_fallback_from_data
	* @return void
	*/
	public function test_get_value_with_fallback_from_data() {

		$data = [
			(object)['lang'=>'lg-eng', 'value'=>'Hello'],
			(object)['lang'=>'lg-spa', 'value'=>'Hola']
		];

		// 1 - Direct match
		$result = component_input_text::get_value_with_fallback_from_data($data, false, 'lg-eng', 'lg-spa');
		$this->assertTrue(
			'Hola' === $result,
			'expected Hola, got: ' . to_string($result)
		);

		// 2 - Fallback to main_lang
		$result = component_input_text::get_value_with_fallback_from_data($data, false, 'lg-eng', 'lg-fra');
		$this->assertTrue(
			'Hello' === $result,
			'expected Hello, got: ' . to_string($result)
		);

		// 3 - Fallback to any lang
		$data_other = [
			(object)['lang'=>'lg-ita', 'value'=>'Ciao']
		];
		$result = component_input_text::get_value_with_fallback_from_data($data_other, false, 'lg-eng', 'lg-fra');
		$this->assertTrue(
			'Ciao' === $result,
			'expected Ciao, got: ' . to_string($result)
		);
	}



	/**
	* TEST_get_string_components
	* @return void
	*/
	public function test_get_string_components() {

		$result = component_input_text::get_string_components();

		$this->assertTrue(
			is_array($result),
			'expected array'
		);
		$this->assertTrue(
			in_array('component_input_text', $result),
			'expected component_input_text in result'
		);
		$this->assertTrue(
			in_array('component_text_area', $result),
			'expected component_text_area in result'
		);
	}



}//end class component_input_text_test
