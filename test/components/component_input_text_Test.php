<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_input_text_test extends TestCase {



	public static $model		= 'component_input_text';
	public static $tipo			= 'test52';
	public static $section_tipo	= 'test3';



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
	* BUILD_COMPONENT_INSTANCE
	* @return
	*/
	private function build_component_instance() {

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
	* TEST_get_dato
	* @return void
	*/
	public function test_get_dato() {

		$component = $this->build_component_instance();

		$value = $component->get_dato();

		$this->assertTrue(
			gettype($value)==='array' || gettype($value)==='NULL',
			'expected type array or NULL : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_dato



	/**
	* TEST_set_dato
	* @return void
	*/
	public function test_set_dato() {

		$component = $this->build_component_instance();

		$old_dato = $component->get_dato();

		$value = $component->set_dato(null);

		$this->assertTrue(
			$value===true,
			'expected true : ' . PHP_EOL
				. to_string($value)
		);

		$result = $component->set_dato('["patata"]');

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);

		$result = $component->set_dato('patata');

		$this->assertTrue(
			$result===true,
			'expected true : ' . PHP_EOL
				. to_string($result)
		);
		$this->assertTrue(
			$component->dato===["patata"],
			'expected ["patata"] : ' . PHP_EOL
				. to_string($component->dato)
		);

		// restore dato
		$component->set_dato($old_dato);
	}//end test_set_dato



	/**
	* TEST_is_empty
	* @return void
	*/
	public function test_is_empty() {

		$component = $this->build_component_instance();

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

		$value = $component->is_empty('');

		$this->assertTrue(
			$value===true,
			'expected empty : ' . PHP_EOL
				. to_string($value)
		);

		$value = $component->is_empty(' ');

		$this->assertTrue(
			$value===true,
			'expected empty : ' . PHP_EOL
				. to_string($value)
		);

		$value = $component->is_empty("\n");

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
	}//end test_get_grid_value



	/**
	* TEST_get_valor
	* @return void
	*/
	public function test_get_valor() {

		$component = $this->build_component_instance();

		$result = $component->get_valor();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_valor



	/**
	* TEST_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() {

		$component = $this->build_component_instance();

		$value = $component->get_valor_export();

		$this->assertTrue(
			gettype($value)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_valor_export



	/**
	* TEST_update_dato_version
	* @return void
	*/
	public function test_update_dato_version() {

		$options = new stdClass();
			$options->update_version = [6,0,0];
			$options->dato_unchanged = null;

		$value = component_input_text::update_dato_version($options);

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
	}//end test_update_dato_version



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		$query_object = json_decode('{
			    "q": [
			        "as"
			    ],
			    "q_operator": null,
			    "path": [
			        {
			            "section_tipo": "test3",
			            "component_tipo": "test52",
			            "model": "component_input_text",
			            "name": "Title"
			        }
			    ],
			    "type": "jsonb",
			    "component_path": [
			        "components",
			        "test3",
			        "dato"
			    ],
			    "lang": "all"
			}
		');

		$value = component_text_area::resolve_query_object_sql(
			$query_object
		);
		// dump($value, ' value ++ '.to_string());

		$this->assertTrue(
			$value->operator==='~*',
				'expected value do not match:' . PHP_EOL
				.' expected: ~*' . PHP_EOL
				.' value: '.to_string($value->operator)
		);
		$this->assertTrue(
			$value->q_parsed==="'.*\".*as.*'",
				'expected value do not match:' . PHP_EOL
				.' expected: '. "'.*\".*as.*'" . PHP_EOL
				.' value: '.to_string($value->q_parsed)
		);
		$this->assertTrue(
			$value->unaccent===true,
				'expected value do not match:' . PHP_EOL
				.' expected: true' . PHP_EOL
				.' value: '.to_string($value->unaccent)
		);
	}//end test_resolve_query_object_sql



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



	/**
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		$component = $this->build_component_instance();

		$value = $component->get_diffusion_value();

		$this->assertTrue(
			gettype($value)==='string',
				'expected value do not match:' . PHP_EOL
				.' expected type: string' . PHP_EOL
				.' type: '.gettype($value)
		);

		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_diffusion_value



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
	* TEST_set_bl_loaded_matrix_data
	* @return void
	*/
	public function test_set_bl_loaded_matrix_data() {

		$component = $this->build_component_instance();

		$value = $component->set_bl_loaded_matrix_data(
			true
		);

		$this->assertTrue(
			gettype($value)==='boolean',
				'expected value do not match:' . PHP_EOL
				.' expected type: boolean' . PHP_EOL
				.' type: '.gettype($value)
		);

		$this->assertTrue(
			$component->bl_loaded_matrix_data===true,
				'expected bl_loaded_matrix_data do not match:' . PHP_EOL
				.' expected: component_input_text' . PHP_EOL
				.' bl_loaded_matrix_data: '.to_string($component->bl_loaded_matrix_data)
		);

		$value = $component->set_bl_loaded_matrix_data(
			false
		);

		$this->assertTrue(
			$component->bl_loaded_matrix_data===false,
				'expected bl_loaded_matrix_data do not match:' . PHP_EOL
				.' expected: component_input_text' . PHP_EOL
				.' bl_loaded_matrix_data: '.to_string($component->bl_loaded_matrix_data)
		);
	}//end test_set_bl_loaded_matrix_data



	/**
	* TEST_get_bl_loaded_matrix_data
	* @return void
	*/
	public function test_get_bl_loaded_matrix_data() {

		$component = $this->build_component_instance();

		$value = $component->get_bl_loaded_matrix_data();

		$this->assertTrue(
			gettype($value)==='boolean',
				'expected value do not match:' . PHP_EOL
				.' expected type: boolean' . PHP_EOL
				.' type: '.gettype($value)
		);
	}//end test_get_bl_loaded_matrix_data



	/**
	* TEST_load_structure_data
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
	* TEST_set_to_force_reload_dato
	* @return void
	*/
	public function test_set_to_force_reload_dato() {

		$component = $this->build_component_instance();

		$result = $component->set_to_force_reload_dato();

		$this->assertTrue(
			gettype($result)==='NULL',
				'expected value do not match:' . PHP_EOL
				.' expected type: NULL' . PHP_EOL
				.' type: '.gettype($result)
		);
	}//end test_set_to_force_reload_dato



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



}//end class component_input_text_test
