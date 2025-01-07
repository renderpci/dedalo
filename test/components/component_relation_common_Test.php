<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_relation_common_test extends TestCase {



	public static $model		= 'component_portal';
	public static $tipo			= 'test80';
	public static $section_tipo	= 'test3';
	public static $section_id	= '1';
	public static $type			= DEDALO_RELATION_TYPE_LINK;



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
	* TEST_get_components_with_relations
	* @return void
	*/
	public function test_get_components_with_relations() : void {

		$value = component_relation_common::get_components_with_relations();

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			in_array('component_portal', $value),
			'expected true in_array component_portal '
		);
	}//end test_get_components_with_relations



	/**
	* TEST_get_dato
	* @return void
	*/
	public function test_get_dato() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_dato();

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_dato



	/**
	* TEST_get_dato_full
	* @return void
	*/
	public function test_get_dato_full() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_dato_full();

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_dato_full



	/**
	* TEST_get_grid_value
	* @return void
	*/
	public function test_get_grid_value() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_grid_value();

		$this->assertTrue(
			gettype($value)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			gettype($value->value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value->value)
		);
	}//end test_get_grid_value



	/**
	* TEST_get_all_data
	* @return void
	*/
	public function test_get_all_data() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_all_data();

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_all_data



	/**
	* TEST_get_dato_generic
	* @return void
	*/
	public function test_get_dato_generic() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_dato_generic();

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_dato_generic



	/**
	* TEST_get_dato_with_references
	* @return void
	*/
	public function test_get_dato_with_references() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_dato_with_references();

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_dato_with_references



	/**
	* TEST_get_dato_as_string
	* @return void
	*/
	public function test_get_dato_as_string() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_dato_as_string();

		$this->assertTrue(
			gettype($value)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_dato_as_string



	/**
	* TEST_set_dato
	* @return void
	*/
	public function test_set_dato() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			2, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->set_dato([]);

		$this->assertTrue(
			gettype($value)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_set_dato



	/**
	* TEST_get_valor_export
	* @return void
	*/
	public function test_get_valor_export() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			2, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_valor_export([]);

		$this->assertTrue(
			gettype($value)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_valor_export



	/**
	* TEST_add_locator_to_dato
	* @return void
	*/
	public function test_add_locator_to_dato() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			2, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$type = $component->get_relation_type();

		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(3);
			$locator->set_type($type);

		$value = $component->add_locator_to_dato($locator);

		$this->assertTrue(
			gettype($value)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			$value===true,
			'expected true : ' . PHP_EOL
		);
	}//end test_add_locator_to_dato



	/**
	* TEST_remove_locator_from_dato
	* @return void
	*/
	public function test_remove_locator_from_dato() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		// locator with bad relation type
			$locator = new locator();
				$locator->set_section_tipo(self::$section_tipo);
				$locator->set_section_id(3);
				$locator->set_type($component->get_relation_type());

			$value = $component->remove_locator_from_dato($locator);

			$this->assertTrue(
				gettype($value)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($value)
			);
			$this->assertTrue(
				$value===false,
				'expected false : ' . PHP_EOL
			);

		// locator valid
			$dato = $component->get_dato();
			if (!empty($dato)) {

				$locator = $dato[0];

				$value = $component->remove_locator_from_dato($locator);

				$this->assertTrue(
					gettype($value)==='boolean',
					'expected type boolean : ' . PHP_EOL
						. gettype($value)
				);
				$this->assertTrue(
					$value===true,
					'expected true : ' . PHP_EOL
				);
			}
	}//end test_remove_locator_from_dato



	/**
	* TEST_Save
	* @return void
	*/
	public function test_Save() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->Save();

		$this->assertTrue(
			gettype($value)==='integer',
			'expected type integer : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			$value===1,
			'expected 1 : ' . PHP_EOL
		);
	}//end test_Save



	/**
	* TEST_get_locator_value
	* @return void
	*/
	public function test_get_locator_value() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(1);
			$locator->set_type(self::$type);

		$value = $component->get_locator_value($locator);

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_locator_value



	/**
	* TEST_remove_parent_references
	* @return void
	*/
	public function test_remove_parent_references() : void {

		$value = component_relation_common::remove_parent_references(
			self::$section_tipo,
			1,
			null
		);

		$this->assertTrue(
			gettype($value)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			gettype($value->result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($value->result)
		);
	}//end test_remove_parent_references



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() : void {

		$query_object = json_decode('{
		    "q": [
		        {
		            "section_tipo": "test3",
		            "section_id": "6422",
		            "from_component_tipo": "test80"
		        }
		    ],
		    "path": [
		        {
		            "section_tipo": "test3",
		            "component_tipo": "test80",
		            "model": "component_portal",
		            "name": "portal"
		        }
		    ],
		    "type": "jsonb",
		    "component_path": [
		        "components",
		        "test80",
		        "dato"
		    ],
		    "lang": "all"
		}');

		$value = component_relation_common::resolve_query_object_sql(
			$query_object
		);

		$this->assertTrue(
			gettype($value)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			$value->component_path===['relations'],
			'expected component_path relations : ' . PHP_EOL
				. ($value->component_path===['relations'])
		);
		$this->assertTrue(
			$value->operator==='@>',
			'expected operator: @> : ' . PHP_EOL
				. ($value->operator)
		);
		$this->assertTrue(
			!empty($value->q_parsed)===true,
			'expected q_parsed is not empty : ' . PHP_EOL
				. to_string(empty($value->q_parsed))
		);
	}//end test_resolve_query_object_sql



	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->search_operators_info();

		$this->assertTrue(
			gettype($value)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_search_operators_info



	/**
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_diffusion_value();

		$this->assertTrue(
			gettype($value)==='string' || gettype($value)==='NULL',
			'expected type string | NULL : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_diffusion_value



	/**
	* TEST_get_diffusion_dato
	* @return void
	*/
	public function test_get_diffusion_dato() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_diffusion_dato();

		$this->assertTrue(
			gettype($value)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_diffusion_dato



	/**
	* TEST_get_diffusion_resolve_value
	* @return void
	*/
	public function test_get_diffusion_resolve_value() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$option_obj = (object)[
			'lang'						=> DEDALO_DATA_LANG,
			'process_dato_arguments'	=> (object)[
				'target_component_tipo'	=> 'test52',
				'component_method'		=> 'get_diffusion_value'
			]
		];

		$value = $component->get_diffusion_resolve_value( $option_obj );

		$this->assertTrue(
			(gettype($value)==='string' || gettype($value)==='NULL'),
			'expected type string|null : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_diffusion_resolve_value



	/**
	* TEST_get_diffusion_value_term_id
	* @return void
	*/
	public function test_get_diffusion_value_term_id() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_diffusion_value_term_id();

		$this->assertTrue(
			(gettype($value)==='string'),
			'expected type string : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_diffusion_value_term_id



	/**
	* TEST_set_dato_external
	* @return void
	*/
	public function test_set_dato_external() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$options = (object)[
			'save'				=> false,
			'changed'			=> false,
			'current_dato'		=> false,
			'references_limit'	=> 10
		];

		$value = $component->set_dato_external($options);

		$this->assertTrue(
			(gettype($value)==='boolean'),
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_set_dato_external



	/**
	* TEST_get_relations_search_value
	* @return void
	*/
	public function test_get_relations_search_value() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_relations_search_value();

		$this->assertTrue(
			(gettype($value)==='array' || gettype($value)==='NULL'),
			'expected type array|null : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_relations_search_value



	/**
	* TEST_get_filter_list_data
	* @return void
	*/
	public function test_get_filter_list_data() : void {

		$value = component_relation_common::get_filter_list_data([]);

		$this->assertTrue(
			(gettype($value)==='array'),
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_filter_list_data



	/**
	* TEST_get_hierarchy_terms_filter
	* @return void
	*/
	public function test_get_hierarchy_terms_filter() : void {

		$value = component_relation_common::get_hierarchy_terms_filter([]);

		$this->assertTrue(
			(gettype($value)==='array'),
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_hierarchy_terms_filter



	/**
	* TEST_get_hierarchy_sections_from_types
	* @return void
	*/
	public function test_get_hierarchy_sections_from_types() : void {

		$value = component_relation_common::get_hierarchy_sections_from_types([]);

		$this->assertTrue(
			(gettype($value)==='array'),
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_hierarchy_sections_from_types



	/**
	* TEST_get_request_config_section_tipo
	* @return void
	*/
	public function test_get_request_config_section_tipo() : void {

		$ar_section_tipo_sources = json_decode('
			[
			    {
			        "value": [
			            "test3"
			        ],
			        "source": "section"
			    }
			]
		');

		$value = component_relation_common::get_request_config_section_tipo(
			$ar_section_tipo_sources,
			'test3'
		);

		$this->assertTrue(
			(gettype($value)==='array'),
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_request_config_section_tipo



	/**
	* TEST_get_fixed_filter
	* @return void
	*/
	public function test_get_fixed_filter() : void {

		$value = component_relation_common::get_fixed_filter(
			[],
			self::$section_tipo,
			self::$section_id
		);

		$this->assertTrue(
			(gettype($value)==='array'),
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_fixed_filter



	/**
	* TEST_get_sortable
	* @return void
	*/
	public function test_get_sortable() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_sortable();

		$this->assertTrue(
			(gettype($value)==='boolean'),
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
		// $this->assertTrue(
		// 	($value===false),
		// 	'expected false : ' . PHP_EOL
		// 		. to_string($value)
		// );
	}//end test_get_sortable



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_list_value();

		$this->assertTrue(
			(gettype($value)==='array' || gettype($value)==='NULL'),
			'expected type array|null : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_get_list_value



	/**
	* TEST_conform_import_data
	* @return void
	*/
	public function test_conform_import_data() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->conform_import_data(
			'1', // import_value
			self::$tipo // column_name
		);

		$this->assertTrue(
			(gettype($value)==='object'),
			'expected type object : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			(gettype($value->result)==='array'),
			'expected type array : ' . PHP_EOL
				. gettype($value->result)
		);
	}//end test_conform_import_data



	/**
	* TEST_add_new_element
	* @return void
	*/
	public function test_add_new_element() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			1, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$options = (object)[
			'target_section_tipo' => 'test3'
		];

		$value = $component->add_new_element(
			$options
		);

		$this->assertTrue(
			(gettype($value)==='object'),
			'expected type object : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			(gettype($value->result)==='boolean'),
			'expected type boolean : ' . PHP_EOL
				. gettype($value->result)
		);
	}//end test_add_new_element




}//end class component_relation_common_test
