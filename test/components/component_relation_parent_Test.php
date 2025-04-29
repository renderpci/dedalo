<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_relation_parent_test extends TestCase {



	public static $model		= 'component_relation_parent';
	public static $tipo			= 'test71';
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
	* @return object $component
	*/
	private function build_component_instance() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_NOLAN;

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
	* test_create_minimum_sections
	* @return object $component
	*/
	public function test_create_minimum_sections() {

		$ar_section_id = [
			2,
			3
		];
		foreach ($ar_section_id as $section_id) {
			$section = section::get_instance(
				$section_id, // string|null section_id
				self::$section_tipo, // string section_tipo
				'list'
			);
			$section->forced_create_record();

			$this->assertTrue(
				gettype($section)==='object',
				'expected type object : ' . PHP_EOL
					. gettype($section)
			);
		}
	}//end test_create_minimum_sections



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_Save
	* @return void
	*/
	public function test_Save() {

		$component = $this->build_component_instance();

		$result	= $component->Save();

		$this->assertTrue(
			gettype($result)==='integer' || gettype($result)==='NULL',
			'expected type integer|null : ' . PHP_EOL
				. gettype($result)
		);
		$this->assertTrue(
			$result==$component->section_id,
			'expected equal : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_Save



	/**
	* TEST_get_dato
	* @return void
	*/
	public function test_get_dato() {

		$component = $this->build_component_instance();

		$result	= $component->get_dato();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_dato



	/**
	* TEST_get_dato_full
	* @return void
	*/
	public function test_get_dato_full() {

		$component = $this->build_component_instance();

		$result	= $component->get_dato_full();

		$this->assertTrue(
			gettype($result)==='array' || gettype($result)==='NULL',
			'expected type array|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_dato_full



	/**
	* TEST_set_dato
	* @return void
	*/
	public function test_set_dato() {

		$component = $this->build_component_instance();

		$old_dato = $component->get_dato();

		// add dato
			$dato = json_decode('
				[{
			        "section_tipo": "test3",
			        "section_id": "2",
			        "paginated_key": 1,
			        "from_component_tipo": "test71"
			    }]
			');

			$result	= $component->set_dato($dato);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);
			$this->assertTrue(
				$result===true,
				'expected true : ' . PHP_EOL
					. to_string($result)
			);

			$reference_dato = json_decode('
				[{
			        "section_tipo": "test3",
			        "section_id": "2",
			        "from_component_tipo": "test71",
			        "type": "dd47"
			    }]
			');
			$fixed_dato = $component->get_dato();

			$this->assertTrue(
				json_encode($fixed_dato)===json_encode($reference_dato),
				'expected equal : ' . PHP_EOL
					.' fixed_dato: ' . to_string($fixed_dato) . PHP_EOL
					.' reference_dato: ' . to_string($reference_dato)
			);

		// set null or []
			$dato = null;

			$result	= $component->set_dato($dato);

			$this->assertTrue(
				$result===true,
				'expected true : ' . PHP_EOL
					. to_string($result)
			);

			$reference_dato	= []; // null value generates [] when get_dato
			$fixed_dato		= $component->get_dato();

			$this->assertTrue(
				json_encode($fixed_dato)===json_encode($reference_dato),
				'expected equal : ' . PHP_EOL
					. gettype($fixed_dato)
			);


		// set dato from api insert (UNUSED NOW)
			// $changed_data = json_decode('
			// 	{
			// 	    "action": "insert",
			// 	    "key": 0,
			// 	    "value": {
			// 	        "section_tipo": "test3",
			// 	        "section_id": "2",
			// 	        "paginated_key": 1,
			// 	        "from_component_tipo": "test71"
			// 	    }
			// 	}
			// ');

			// $result	= $component->set_dato(
			// 	$changed_data->value
			// );

			// $fixed_dato		= $component->get_dato();
			// $reference_dato	= json_decode('
			// 	[{
			//         "section_tipo": "test3",
			//         "section_id": "2",
			//         "from_component_tipo": "test71"
			// 	}]
			// ');

			// $this->assertTrue(
			// 	json_encode($fixed_dato)===json_encode($reference_dato),
			// 	'expected equal : ' . PHP_EOL
			// 		. gettype($fixed_dato)
			// );


		// set dato from api update (UNUSED NOW)
			// $changed_data = json_decode('
			// 	{
			// 	    "action": "update",
			// 	    "key": 0,
			// 	    "value": {
			// 	        "section_tipo": "test3",
			// 	        "section_id": "2",
			// 	        "paginated_key": 1,
			// 	        "from_component_tipo": "test71"
			// 	    }
			// 	}
			// ');

			// $result	= $component->set_dato(
			// 	$changed_data->value
			// );

			// $fixed_dato		= $component->get_dato();
			// $reference_dato	= json_decode('
			// 	[{
			//         "section_tipo": "test3",
			//         "section_id": "2",
			//         "from_component_tipo": "test71"
			// 	}]
			// ');

			// $this->assertTrue(
			// 	json_encode($fixed_dato)===json_encode($reference_dato),
			// 	'expected equal : ' . PHP_EOL
			// 		. gettype($fixed_dato)
			// );

		// set dato from api remove (UNUSED NOW)
			// $changed_data = json_decode('
			// 	{
			// 	    "action": "remove",
			//         "key": 0,
			//         "value": null
			// 	}
			// ');

			// dump($component->get_dato(), '$component->get_dato() ++ '.to_string());

			// $result	= $component->set_dato(
			// 	$changed_data->value
			// );

			// $fixed_dato		= $component->get_dato();
			// $reference_dato	= [];

			// 	dump($fixed_dato, ' fixed_dato ++ '.to_string());
			// 	dump($reference_dato, ' reference_dato ++ '.to_string());

			// $this->assertTrue(
			// 	json_encode($fixed_dato)===json_encode($reference_dato),
			// 	'expected equal : ' . PHP_EOL
			// 		. gettype($fixed_dato)
			// );


		// restore dato
			$result	= $component->set_dato($old_dato);

			$this->assertTrue(
				json_encode($component->dato)===json_encode($old_dato),
				'expected old dato : ' . PHP_EOL
					. to_string($component->dato)
			);
	}//end test_set_dato



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

		// null
			$dato = null;
			$component->set_dato($dato);
			$result = $component->get_valor();

			$this->assertTrue(
				gettype($result)==='NULL',
				'expected type null : ' . PHP_EOL
					. gettype($result)
			);

		// value
			$dato = json_decode('
				[{
			        "section_tipo": "test3",
			        "section_id": "2",
			        "paginated_key": 1,
			        "from_component_tipo": "test71"
			    }]
			');
			$component->set_dato($dato);
			$result = $component->get_valor();

			if (!empty($component->dato)) {
				$this->assertTrue(
					gettype($result)==='string',
					'expected type string : ' . PHP_EOL
						. gettype($result)
				);
			}
	}//end test_get_valor



	/**
	* TEST_get_diffusion_value
	* @return void
	*/
	public function test_get_diffusion_value() {

		$component = $this->build_component_instance();

		$result = $component->get_diffusion_value();

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_diffusion_value



	/**
	* TEST_update_children
	* (!) This method is not really necessary because it is private and executes actions
	* that are already done by the add_parent/remove_parent methods
	* @return void
	*/
		// public function test_update_children() {

		// 	$component = $this->build_component_instance();

		// 	// $old_dato = $component->get_dato();

		// 	// empty old values
		// 	$component->set_dato(null);

		// 	$section_id	= 2;

		// 	// private method access. Note that this method saves !
		// 	$result	= PHPUnitUtil::callMethod(
		// 		$component,
		// 		'update_children',
		// 		array(
		// 			'add', // action
		// 			$component->section_tipo,
		// 			$section_id
		// 		)
		// 	 );

		// 	$this->assertTrue(
		// 		gettype($result)==='boolean',
		// 		'expected type boolean : ' . PHP_EOL
		// 			. gettype($result)
		// 	);

		// 	if ($result===true) {

		// 		$dato_reference = json_decode('
		// 			[
		// 			    {
		// 			        "section_tipo": "'.self::$section_tipo.'",
		// 			        "section_id": "'.$section_id.'",
		// 			        "from_component_tipo": "'.self::$tipo.'"
		// 			    }
		// 			]
		// 		');
		// 		// dump($component->dato, '$component->dato ++ '.to_string());

		// 		$this->assertTrue(
		// 			json_encode($component->dato)===json_encode($dato_reference),
		// 			'expected dato_reference : ' . PHP_EOL
		// 				. to_string($component->dato)
		// 		);
		// 	}
		// }//end test_update_children



	/**
	* TEST_add_parent
	* @return void
	*/
	public function test_add_parent() {

		$component = $this->build_component_instance();

		$old_dato = $component->get_dato();

		// empty old values
		$component->set_dato(null);

		$section_id	= 3;

		$locator = new locator();
			$locator->set_section_tipo($component->section_tipo);
			$locator->set_section_id($section_id);

		$result = $component->add_parent(
			$locator
		);

		$this->assertTrue(
			gettype($result)==='boolean',
			'expected type boolean : ' . PHP_EOL
				. gettype($result)
		);

		if ($result===true) {

			$dato_reference = json_decode('
				[
				    {
				        "section_tipo": "'.self::$section_tipo.'",
				        "section_id": "'.$section_id.'",
				        "from_component_tipo": "'.self::$tipo.'"
				    }
				]
			');

			$this->assertTrue(
				json_encode($component->dato)===json_encode($dato_reference),
				'expected dato_reference : ' . PHP_EOL
					. to_string($component->dato)
			);

			// restore data
			$component->set_dato($old_dato);
			$component->Save();
		}
	}//end test_add_parent



	/**
	* TEST_remove_parent
	* @return void
	*/
	public function test_remove_parent() {

		$component = $this->build_component_instance();

		$old_dato = $component->get_dato();

		$section_id	= 3;

		$locator = new locator();
			$locator->set_section_tipo($component->section_tipo);
			$locator->set_section_id($section_id);

		// add dato (this action saves too)
			$component->set_dato(null);
			$result = $component->add_parent(
				$locator
			);

			if ($result===false) {
				debug_log(__METHOD__
					. " Unable to add_parent " . PHP_EOL
					. to_string()
					, logger::ERROR
				);
				return;
			}

		// remove added (this action saves too)
			$result = $component->remove_parent(
				$component->section_tipo,
				$section_id
			);

			$this->assertTrue(
				gettype($result)==='boolean',
				'expected type boolean : ' . PHP_EOL
					. gettype($result)
			);

			if ($result===true) {

				$dato_reference = [];
				$this->assertTrue(
					json_encode($component->dato)===json_encode($dato_reference),
					'expected dato_reference : ' . PHP_EOL
						. to_string($component->dato)
				);

				// restore data
				$component->set_dato($old_dato);
				$component->Save();
			}
	}//end test_remove_parent



	/**
	* TEST_get_component_relation_children_tipo
	* @return void
	*/
	public function test_get_component_relation_children_tipo() {

		$result = component_relation_parent::get_component_relation_children_tipo(
			self::$tipo
		);

		$this->assertTrue(
			gettype($result)==='string' || gettype($result)==='NULL',
			'expected type string|null : ' . PHP_EOL
				. gettype($result)
		);

		$model = RecordObj_dd::get_modelo_name_by_tipo($result, true);
		$this->assertTrue(
			$model==='component_relation_children',
			'expected component_relation_children : ' . PHP_EOL
				. to_string($result)
		);
	}//end test_get_component_relation_children_tipo



	/**
	* TEST_get_parents
	* @return void
	*/
	public function test_get_parents() {

		$section_id = 1;

		$result = component_relation_parent::get_parents(
			$section_id,
			self::$section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_parents



	/**
	* TEST_get_parents_recursive
	* @return void
	*/
	public function test_get_parents_recursive() {

		$section_id		= '1'; // 1;
		$section_tipo	= self::$section_tipo;

		// $section_id		= '66'; // 1;
		// $section_tipo	= 'oh0'; // self::$section_tipo

		$result = component_relation_parent::get_parents_recursive(
			$section_id,
			$section_tipo
		);

		$this->assertTrue(
			gettype($result)==='array',
			'expected type array : ' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_parents_recursive



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		$query_object = json_decode('
			{
			    "q":
			        {
			            "section_tipo": "test3",
			            "section_id": "1",
			            "from_component_tipo": "test71"
			        }
			    ,
			    "path": [
			        {
			            "name": "relation_parent",
			            "model": "component_relation_parent",
			            "section_tipo": "test3",
			            "component_tipo": "test71"
			        }
			    ],
			    "q_split": false,
			    "type": "jsonb",
			    "component_path": [
			        "components",
			        "test71",
			        "dato"
			    ],
			    "lang": "all"
			}
		');

		$result = component_relation_parent::resolve_query_object_sql(
			$query_object
		);

		$this->assertTrue(
			gettype($result)==='object',
			'expected type object : ' . PHP_EOL
				. gettype($result)
		);

		$reference_value = '["relations"]';
		$this->assertTrue(
			json_encode($result->component_path)===$reference_value,
			'unequal component_path ' . PHP_EOL
			.'$result->component_path: ' .  json_encode($result->component_path) . PHP_EOL
			.'expected $reference_value: ' .  to_string($reference_value) . PHP_EOL
			.'result: ' . to_string($result)
		);
	}//end test_resolve_query_object_sql



	/**
	* TEST_gget_component_relation_children_tipo
	* @return void
	*/
	public function test_gget_component_relation_children_tipo() {

		$component_tipo = self::$tipo;

		$result = component_relation_parent::get_component_relation_children_tipo(
			$component_tipo
		);

		$this->assertTrue(
			gettype($result)==='string',
			'expected type string : ' . PHP_EOL
				. gettype($result)
		);

		$reference_value = 'test201';
		$this->assertTrue(
			$result===$reference_value,
			'expected equal : ' . PHP_EOL
			.'result: ' . to_string($result) . PHP_EOL
			.'reference_value: ' . to_string($reference_value)
		);
	}//end test_gget_component_relation_children_tipo



}//end class component_relation_parent_test
