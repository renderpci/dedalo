<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_relation_common_test extends BaseTestCase {



	public static $model		= 'component_portal';
	public static $tipo			= 'test80';
	public static $section_tipo	= 'test3';
	public static $section_id	= '49';
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
	* TEST_get_data
	* @return void
	*/
	public function test_get_data() : void {

		$section_inst	= section::get_instance(self::$section_tipo);
		$section_id		= (string)$section_inst->create_record();

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		// Initialize with some data
		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(101);
			$locator->set_type(self::$type);
			$locator->set_from_component_tipo(self::$tipo);
		$component->set_data([$locator]);

		$value = $component->get_data();

		$this->assertTrue(
			is_array($value),
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			!empty($value),
			'expected non empty array'
		);
	}//end test_get_data




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
	* TEST_get_data_with_references
	* @return void
	*/
	public function test_get_data_with_references() : void {

		$section_inst	= section::get_instance(self::$section_tipo);
		$section_id		= (string)$section_inst->create_record();

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		// Initialize with some data
		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(101);
			$locator->set_type(self::$type);
			$locator->set_from_component_tipo(self::$tipo);
		$component->set_data([$locator]);

		$value = $component->get_data_with_references();

		$this->assertTrue(
			is_array($value),
			'expected type array : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			!empty($value),
			'expected non empty array'
		);
	}//end test_get_data_with_references



	/**
	* TEST_set_data
	* @return void
	*/
	public function test_set_data() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			2, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->set_data([]);

		$this->assertTrue(
			gettype($value)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_set_data



	/**
	* TEST_add_locator_to_data
	* @return void
	*/
	public function test_add_locator_to_data() : void {

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
			$locator->set_section_id(49); // Used from samples/data.json
			$locator->set_type($type);
			$locator->set_from_component_tipo(self::$tipo);

		$value = $component->add_locator_to_data($locator);

		$this->assertTrue(
			gettype($value)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
		$this->assertTrue(
			$value===true,
			'expected true : ' . PHP_EOL
		);
	}//end test_add_locator_to_data



	/**
	* TEST_remove_locator_from_data
	* @return void
	*/
	public function test_remove_locator_from_data() : void {

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

			$value = $component->remove_locator_from_data($locator);

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
			$data = $component->get_data();
			if (!empty($data)) {

				$locator = $data[0];

				$value = $component->remove_locator_from_data($locator);

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
	}//end test_remove_locator_from_data



	/**
	* TEST_Save
	* @return void
	*/
	public function test_Save() : void {

		$section_inst	= section::get_instance(self::$section_tipo);
		$section_id		= (string)$section_inst->create_record();

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		// Add some valid data to save
		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(102); 
			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$locator->set_from_component_tipo(self::$tipo);
		
		$component->add_locator_to_data($locator);

		$value = $component->save();

		$this->assertTrue(
			is_int($value) || $value === true,
			'expected type integer or true : ' . PHP_EOL
				. gettype($value)
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
			(isset($value->operator) && $value->operator==='@>') || (isset($value->sentence) && strpos($value->sentence, '@>')!==false),
			'expected operator @> or sentence containing @>'
		);
		$this->assertTrue(
			!empty($value->sentence) || !empty($value->q_parsed)===true,
			'expected sentence or q_parsed is not empty'
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
	* TEST_set_data_external
	* @return void
	*/
	public function test_set_data_external() : void {

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
			'current_data'		=> [], // Provide empty array to avoid sizeof(null) error
			'references_limit'	=> 10
		];

		$value = $component->set_data_external($options);

		$this->assertTrue(
			(is_bool($value)),
			'expected type boolean : ' . PHP_EOL
				. gettype($value)
		);
	}//end test_set_data_external



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




	/**
	* TEST_validate_data_element
	* @return void
	*/
	public function test_validate_data_element() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(101); // Use different ID to avoid autoreference with self::$section_id (49)
			$locator->set_type(self::$type);
			$locator->set_from_component_tipo(self::$tipo);

		$value = $component->validate_data_element($locator);

		$this->assertTrue(
			is_object($value),
			'expected type object : ' . gettype($value)
		);
		$this->assertTrue(
			$value instanceof locator,
			'expected instance of locator'
		);
	}//end test_validate_data_element



	/**
	* TEST_get_locator_properties_to_check
	* @return void
	*/
	public function test_get_locator_properties_to_check() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->get_locator_properties_to_check();

		$this->assertTrue(
			is_array($value),
			'expected type array : ' . gettype($value)
		);
		$this->assertTrue(
			in_array('section_id', $value),
			'expected section_id in array'
		);
	}//end test_get_locator_properties_to_check



	/**
	* TEST_add_relations_search
	* @return void
	*/
	public function test_add_relations_search() : void {

		$method = new ReflectionMethod('component_relation_common', 'add_relations_search');
		$method->setAccessible(true);
		
		$query_object = (object)[
			'q' => [],
			'path' => [],
			'type' => 'jsonb',
			'component_path' => ['components', self::$tipo, 'dato'],
			'lang' => 'all'
		];

		$value = $method->invoke(null, $query_object);

		$this->assertTrue(
			is_object($value),
			'expected type object : ' . gettype($value)
		);
	}//end test_add_relations_search



	/**
	* TEST_get_diffusion_data
	* @return void
	*/
	public function test_get_diffusion_data() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);
		
		$ddo = new dd_object();

		$value = $component->get_diffusion_data($ddo);

		$this->assertTrue(
			is_array($value),
			'expected type array : ' . gettype($value)
		);
	}//end test_get_diffusion_data



	/**
	* TEST_resolve_component_data_recursively
	* @return void
	*/
	public function test_resolve_component_data_recursively() : void {

		$method = new ReflectionMethod('component_relation_common', 'resolve_component_data_recursively');
		$method->setAccessible(true);
		
		$locator = new locator();
			$locator->set_section_tipo(self::$section_tipo);
			$locator->set_section_id(1);

		$dd_object = new dd_object();
		$dd_object->set_tipo(self::$tipo);

		$value = $method->invoke(null, [], $dd_object, $locator);

		$this->assertTrue(
			is_array($value),
			'expected type array : ' . gettype($value)
		);
	}//end test_resolve_component_data_recursively



	/**
	* TEST_get_ddo_children_recursive
	* @return void
	*/
	public function test_get_ddo_children_recursive() : void {

		$method = new ReflectionMethod('component_relation_common', 'get_ddo_children_recursive');
		$method->setAccessible(true);

		$dd_object = new dd_object();
		$dd_object->set_tipo(self::$tipo);

		$value = $method->invoke(null, [], $dd_object);

		$this->assertTrue(
			is_array($value),
			'expected type array : ' . gettype($value)
		);
	}//end test_get_ddo_children_recursive



	/**
	* TEST_map_locator_to_term_id
	* @return void
	*/
	public function test_map_locator_to_term_id() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		$value = $component->map_locator_to_term_id();

		$this->assertTrue(
			$value === null || is_string($value),
			'expected type null or string : ' . gettype($value)
		);
	}//end test_map_locator_to_term_id



	/**
	* TEST_get_calculation_data
	* @return void
	*/
	public function test_get_calculation_data() : void {

		$component = component_common::get_instance(
			self::$model, // string model
			self::$tipo, // string tipo
			self::$section_id, // string section_id
			'edit', // string mode
			DEDALO_DATA_NOLAN, // string lang
			self::$section_tipo // string section_tipo
		);

		// Initialize with empty array to ensure it returns array, so get_calculation_data can proceed (or return false if empty)
		// But to avoid recursion error on null options, we must pass options. 
		// If get_data is empty, it returns false (bool), which is not array but valid per return type 'mixed'.
		// We set data to empty to test that path first.
		$component->set_data([]);
		
		$options = (object)[
			'ddo_map' => [
				(object)[
					'tipo' => 'child1',
					'parent' => 'self'
				]
			]
		];

		$value = $component->get_calculation_data($options);

		// If data is empty, it returns false.
		// If data is set (by previous tests), it attempts recursion.
		// We want to verify it doesn't crash.
		$this->assertTrue(
			is_array($value) || $value===false || $value===null,
			'expected type array, false or null : ' . gettype($value)
		);
	}//end test_get_calculation_data


}//end class component_relation_common_test
