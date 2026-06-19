<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class area_maintenance_test extends BaseTestCase {



	public static $model	= 'area_maintenance';
	public static $tipo		= 'dd88';



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
	* BUILD_INSTANCE
	* @return
	*/
	private function build_instance() {

		$model	= self::$model;
		$tipo	= self::$tipo;
		$mode	= 'list';

		$instance = area::get_instance(
			$model, // string model
			$tipo, // string tipo
			$mode // mode
		);

		return $instance;
	}//end build_instance



	/////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_get_ar_widgets
	* @return void
	*/
	public function test_get_ar_widgets() {

		$area = $this->build_instance();

		$result = $area->get_ar_widgets();

		$this->assertTrue(
			gettype($result)==='array' ,
			'expected array' . PHP_EOL
				. gettype($result)
		);
	}//end test_get_ar_widgets



	/**
	* TEST_GET_AR_WIDGET_IDS_MATCHES_GET_AR_WIDGETS
	* The lightweight whitelist (get_ar_widget_ids) must stay in sync with the
	* authoritative widget enumeration (get_ar_widgets). This drift guard lets
	* the API validate widget names without building every widget — which would
	* otherwise probe diffusion connections, run DB sequence checks, etc. on
	* every polled request.
	* @return void
	*/
	public function test_get_ar_widget_ids_matches_get_ar_widgets() {

		$area = $this->build_instance();

		$ids		= $area->get_ar_widget_ids();
		$built_ids	= array_map(fn($widget) => $widget->id, $area->get_ar_widgets());

		// non-empty list of string ids
		$this->assertNotEmpty($ids, 'expected a non-empty widget id list');
		foreach ($ids as $id) {
			$this->assertIsString($id, 'widget id must be a string');
		}

		// same set, regardless of order
		sort($ids);
		sort($built_ids);
		$this->assertSame(
			$built_ids,
			$ids,
			'get_ar_widget_ids() is out of sync with get_ar_widgets()'
		);
	}//end test_get_ar_widget_ids_matches_get_ar_widgets



	/**
	* TEST_widget_factory
	* @return void
	*/
	public function test_widget_factory() {

		$area = $this->build_instance();

		$item = json_decode('
			{
			    "id": "update_code",
			    "typo": "widget",
			    "label": "Actualizar Código"
			}
		');

		$result = $area->widget_factory(
			$item
		);

		$this->assertTrue(
			gettype($result)==='object' ,
			'expected object' . PHP_EOL
				. gettype($result)
		);

		$this->assertTrue(
			$result->type==='widget' ,
			'expected result->type == widget' . PHP_EOL
				. $result->type
		);

		$this->assertTrue(
			gettype($result->tipo)==='string' ,
			'expected gettype($result->tipo) == string' . PHP_EOL
				. gettype($result->tipo)
		);

		$this->assertTrue(
			gettype($result->label)==='string' ,
			'expected gettype($result->label) == string' . PHP_EOL
				. gettype($result->label)
		);
	}//end test_widget_factory



	/**
	* TEST_widgets_value
	* @return void
	*/
	public function test_widgets_value() {

		$ar_widgets = [
			'add_hierarchy',
			'build_database_version',
			'check_config',
			// 'counters_status', // Not ready
			'database_info',
			'dedalo_api_test_environment',
			// 'dedalo_version', // Removed
			'environment',
			'export_hierarchy',
			'lock_components',
			'make_backup',
			'media_control',
			'move_lang',
			'move_locator',
			'move_tld',
			'move_to_portal',
			'move_to_table',
			'php_info',
			'php_runtime',
			'publication_api',
			'regenerate_relations',
			'register_tools',
			'sequences_status',
			'sqo_test_environment',
			'system_info',
			'unit_test',
			'update_code',
			'update_data_version',
			'update_ontology'
		];

		foreach ($ar_widgets as $name) {

			$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/$name/class.$name.php";
			if (!file_exists($class_file)) {
				continue;
			}

			include_once $class_file;

			$result = $name::get_value();

			$this->assertTrue(
				gettype($result)==='object' ,
				'expected object' . PHP_EOL
					. gettype($result)
			);
		}

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset
	}//end test_widgets_value



	/**
	* TEST_REGISTER_TOOLS
	* @return void
	*/
	public function test_register_tools(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		// Use widget class instead of area_maintenance
		$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/register_tools/class.register_tools.php";
		$this->assertTrue(
			file_exists($class_file),
			'expected register_tools widget class file exists'
		);

		include_once $class_file;

		$response = register_tools::register_tools();
			// dump($response, ' response ++ '.to_string());

		$this->assertTrue(
			gettype($response->result)==='array',
			'expected result type is array - gettype: ' .gettype($response->result)
		);

		$this->assertTrue(
			count($response->result)>0,
			'expected result is not empty '
		);

		// Test API_ACTIONS constant
		$this->assertTrue(
			defined('register_tools::API_ACTIONS'),
			'expected API_ACTIONS constant defined'
		);
		$this->assertTrue(
			in_array('register_tools', register_tools::API_ACTIONS),
			'expected register_tools in API_ACTIONS'
		);
	}//end test_register_tools



	// IA UNIT TEST



	    // Assuming the class containing the widget_factory method is named WidgetClass
	    protected $widgetClass;

	    protected function setUp(): void {
	        // $this->widgetClass = area::get_instance('area_maintenance', 'dd88');
	        $this->widgetClass = $this->build_instance();
	    }

	    public function testWidgetFactoryWithCompleteData() {
	        $item = (object)[
	            'id' => 1,
	            'class' => 'test-class',
	            'tipo' => 'test-tipo',
	            'parent' => 'test-parent',
	            'label' => 'Test Label',
	            'info' => 'Test Info',
	            'body' => 'Test Body',
	            'run' => ['run1', 'run2'],
	            'trigger' => 'Test Trigger',
	            'value' => 'Test Value',
	        ];

	        $widget = $this->widgetClass->widget_factory($item);

	        $this->assertEquals(1, $widget->id);
	        $this->assertEquals('test-class', $widget->class);
	        $this->assertEquals('widget', $widget->type);
	        $this->assertEquals('test-tipo', $widget->tipo);
	        $this->assertEquals('test-parent', $widget->parent);
	        $this->assertEquals('Test Label', $widget->label);
	        $this->assertEquals('Test Info', $widget->info);
	        $this->assertEquals('Test Body', $widget->body);
	        $this->assertEquals(['run1', 'run2'], $widget->run);
	        $this->assertEquals('Test Trigger', $widget->trigger);
	        $this->assertEquals('Test Value', $widget->value);
	    }

	    public function testWidgetFactoryWithPartialData() {
	        $item = (object)[
	            'id' => 2,
	            'label' => 'Partial Label',
	        ];

	        $this->widgetClass->tipo = 'default-tipo';

	        $widget = $this->widgetClass->widget_factory($item);

	        $this->assertEquals(2, $widget->id);
	        $this->assertNull($widget->class);
	        $this->assertEquals('widget', $widget->type);
	        $this->assertEquals('default-tipo', $widget->tipo);
	        $this->assertEquals('default-tipo', $widget->parent);
	        $this->assertEquals('Partial Label', $widget->label);
	        $this->assertNull($widget->info);
	        $this->assertNull($widget->body);
	        $this->assertEmpty($widget->run);
	        $this->assertNull($widget->trigger);
	        $this->assertNull($widget->value);
	    }

	    public function testWidgetFactoryWithDefaultLabel() {
	        $item = (object)[
	            'id' => 3,
	        ];

	        $this->widgetClass->tipo = 'default-tipo';

	        $widget = $this->widgetClass->widget_factory($item);

	        $this->assertEquals(3, $widget->id);
	        $this->assertEquals('Undefined label for: default-tipo', $widget->label);
	    }






	/**
	* TEST_MOVE_TLD_WIDGET
	* Test the move_tld widget class
	* @return void
	*/
	public function test_move_tld_widget(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/move_tld/class.move_tld.php";
		$this->assertTrue(
			file_exists($class_file),
			'expected move_tld widget class file exists'
		);

		include_once $class_file;

		// Test get_value
		$result = move_tld::get_value();
		$this->assertTrue(
			gettype($result)==='object',
			'expected object from get_value'
		);
		$this->assertTrue(
			isset($result->result),
			'expected result property in response'
		);
		$this->assertTrue(
			isset($result->result->files),
			'expected files property in result'
		);

		// Test API_ACTIONS constant
		$this->assertTrue(
			defined('move_tld::API_ACTIONS'),
			'expected API_ACTIONS constant defined'
		);
		$this->assertTrue(
			in_array('move_tld', move_tld::API_ACTIONS),
			'expected move_tld in API_ACTIONS'
		);
	}//end test_move_tld_widget



	/**
	* TEST_MOVE_LOCATOR_WIDGET
	* Test the move_locator widget class
	* @return void
	*/
	public function test_move_locator_widget(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/move_locator/class.move_locator.php";
		$this->assertTrue(
			file_exists($class_file),
			'expected move_locator widget class file exists'
		);

		include_once $class_file;

		// Test get_value
		$result = move_locator::get_value();
		$this->assertTrue(
			gettype($result)==='object',
			'expected object from get_value'
		);
		$this->assertTrue(
			isset($result->result),
			'expected result property in response'
		);
		$this->assertTrue(
			isset($result->result->files),
			'expected files property in result'
		);

		// Test API_ACTIONS constant
		$this->assertTrue(
			defined('move_locator::API_ACTIONS'),
			'expected API_ACTIONS constant defined'
		);
		$this->assertTrue(
			in_array('move_locator', move_locator::API_ACTIONS),
			'expected move_locator in API_ACTIONS'
		);
	}//end test_move_locator_widget



	/**
	* TEST_MOVE_TO_PORTAL_WIDGET
	* Test the move_to_portal widget class
	* @return void
	*/
	public function test_move_to_portal_widget(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/move_to_portal/class.move_to_portal.php";
		$this->assertTrue(
			file_exists($class_file),
			'expected move_to_portal widget class file exists'
		);

		include_once $class_file;

		// Test get_value
		$result = move_to_portal::get_value();
		$this->assertTrue(
			gettype($result)==='object',
			'expected object from get_value'
		);
		$this->assertTrue(
			isset($result->result),
			'expected result property in response'
		);
		$this->assertTrue(
			isset($result->result->files),
			'expected files property in result'
		);

		// Test API_ACTIONS constant
		$this->assertTrue(
			defined('move_to_portal::API_ACTIONS'),
			'expected API_ACTIONS constant defined'
		);
		$this->assertTrue(
			in_array('move_to_portal', move_to_portal::API_ACTIONS),
			'expected move_to_portal in API_ACTIONS'
		);
	}//end test_move_to_portal_widget



	/**
	* TEST_MOVE_TO_TABLE_WIDGET
	* Test the move_to_table widget class
	* @return void
	*/
	public function test_move_to_table_widget(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/move_to_table/class.move_to_table.php";
		$this->assertTrue(
			file_exists($class_file),
			'expected move_to_table widget class file exists'
		);

		include_once $class_file;

		// Test get_value
		$result = move_to_table::get_value();
		$this->assertTrue(
			gettype($result)==='object',
			'expected object from get_value'
		);
		$this->assertTrue(
			isset($result->result),
			'expected result property in response'
		);
		$this->assertTrue(
			isset($result->result->files),
			'expected files property in result'
		);

		// Test API_ACTIONS constant
		$this->assertTrue(
			defined('move_to_table::API_ACTIONS'),
			'expected API_ACTIONS constant defined'
		);
		$this->assertTrue(
			in_array('move_to_table', move_to_table::API_ACTIONS),
			'expected move_to_table in API_ACTIONS'
		);
	}//end test_move_to_table_widget



	/**
	* TEST_MOVE_LANG_WIDGET
	* Test the move_lang widget class
	* @return void
	*/
	public function test_move_lang_widget(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/move_lang/class.move_lang.php";
		$this->assertTrue(
			file_exists($class_file),
			'expected move_lang widget class file exists'
		);

		include_once $class_file;

		// Test get_value
		$result = move_lang::get_value();
		$this->assertTrue(
			gettype($result)==='object',
			'expected object from get_value'
		);
		$this->assertTrue(
			isset($result->result),
			'expected result property in response'
		);
		$this->assertTrue(
			isset($result->result->files),
			'expected files property in result'
		);

		// Test API_ACTIONS constant
		$this->assertTrue(
			defined('move_lang::API_ACTIONS'),
			'expected API_ACTIONS constant defined'
		);
		$this->assertTrue(
			in_array('move_lang', move_lang::API_ACTIONS),
			'expected move_lang in API_ACTIONS'
		);
	}//end test_move_lang_widget



	/**
	* TEST_UPDATE_ONTOLOGY_WIDGET
	* Test the update_ontology widget class
	* @return void
	*/
	public function test_update_ontology_widget(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/update_ontology/class.update_ontology.php";
		$this->assertTrue(
			file_exists($class_file),
			'expected update_ontology widget class file exists'
		);

		include_once $class_file;

		// Test get_value
		$result = update_ontology::get_value();
		$this->assertTrue(
			gettype($result)==='object',
			'expected object from get_value'
		);
		$this->assertTrue(
			isset($result->result),
			'expected result property in response'
		);

		// Test API_ACTIONS constant
		$this->assertTrue(
			defined('update_ontology::API_ACTIONS'),
			'expected API_ACTIONS constant defined'
		);
		$this->assertTrue(
			in_array('update_ontology', update_ontology::API_ACTIONS),
			'expected update_ontology in API_ACTIONS'
		);
		$this->assertTrue(
			in_array('export_to_translate', update_ontology::API_ACTIONS),
			'expected export_to_translate in API_ACTIONS'
		);
	}//end test_update_ontology_widget



	/**
	* TEST_BUILD_DATABASE_VERSION_WIDGET
	* Test the build_database_version widget class
	* @return void
	*/
	public function test_build_database_version_widget(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/build_database_version/class.build_database_version.php";
		$this->assertTrue(
			file_exists($class_file),
			'expected build_database_version widget class file exists'
		);

		include_once $class_file;

		// Test get_value
		$result = build_database_version::get_value();
		$this->assertTrue(
			gettype($result)==='object',
			'expected object from get_value'
		);
		$this->assertTrue(
			isset($result->result),
			'expected result property in response'
		);

		// Test API_ACTIONS constant
		$this->assertTrue(
			defined('build_database_version::API_ACTIONS'),
			'expected API_ACTIONS constant defined'
		);
		$this->assertTrue(
			in_array('build_install_version', build_database_version::API_ACTIONS),
			'expected build_install_version in API_ACTIONS'
		);
	}//end test_build_database_version_widget



	/**
	* TEST_UPDATE_DATA_VERSION_WIDGET
	* Test the update_data_version widget class
	* @return void
	*/
	public function test_update_data_version_widget(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/update_data_version/class.update_data_version.php";
		$this->assertTrue(
			file_exists($class_file),
			'expected update_data_version widget class file exists'
		);

		include_once $class_file;

		// Test get_value
		$result = update_data_version::get_value();
		$this->assertTrue(
			gettype($result)==='object',
			'expected object from get_value'
		);
		$this->assertTrue(
			isset($result->result),
			'expected result property in response'
		);

		// Test API_ACTIONS constant
		$this->assertTrue(
			defined('update_data_version::API_ACTIONS'),
			'expected API_ACTIONS constant defined'
		);
		$this->assertTrue(
			in_array('update_data_version', update_data_version::API_ACTIONS),
			'expected update_data_version in API_ACTIONS'
		);
	}//end test_update_data_version_widget



	/**
	* TEST_CHECK_CONFIG_WIDGET
	* Test the check_config widget class
	* @return void
	*/
	public function test_check_config_widget(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$class_file = DEDALO_CORE_PATH . "/area_maintenance/widgets/check_config/class.check_config.php";
		$this->assertTrue(
			file_exists($class_file),
			'expected check_config widget class file exists'
		);

		include_once $class_file;

		// Test get_value
		$result = check_config::get_value();
		$this->assertTrue(
			gettype($result)==='object',
			'expected object from get_value'
		);
		$this->assertTrue(
			isset($result->result),
			'expected result property in response'
		);

		// Test API_ACTIONS constant
		$this->assertTrue(
			defined('check_config::API_ACTIONS'),
			'expected API_ACTIONS constant defined'
		);
		$this->assertTrue(
			is_array(check_config::API_ACTIONS),
			'expected API_ACTIONS to be array'
		);
	}//end test_check_config_widget

}//end class area_maintenance_test
