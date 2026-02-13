<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class menu_test extends BaseTestCase {



	public static $model		= 'menu';
	public static $tipo		= 'dd85'; // menu class tipo
	public static $section_tipo = 'dd1'; // root section tipo



	/**
	 * BUILD_MENU_INSTANCE
	 * @return menu
	 */
	private function build_menu_instance() {

		$this->user_login();

		$model		= self::$model;
		$mode		= 'edit';

		$menu = new menu($mode);

		return $menu;
	}//end build_menu_instance



	/**
	 * TEST_CONSTRUCT
	 * @return void
	 */
	public function test_construct() {

		$menu = $this->build_menu_instance();

		$this->assertInstanceOf(
			menu::class,
			$menu,
			"Expected menu instance"
		);

		$this->assertEquals(
			self::$tipo,
			$menu->get_tipo(),
			"Expected tipo to be " . self::$tipo
		);

		$this->assertEquals(
			'edit',
			$menu->get_mode(),
			"Expected mode to be 'edit'"
		);

		$this->assertEquals(
			DEDALO_ROOT_TIPO,
			$menu->get_section_tipo(),
			"Expected section_tipo to be DEDALO_ROOT_TIPO"
		);
	}//end test_construct



	/**
	 * TEST_GET_TREE_DATALIST
	 * @return void
	 */
	public function test_get_tree_datalist() {

		$menu = $this->build_menu_instance();
		$result = $menu->get_tree_datalist();

		$this->assertIsArray(
			$result,
			"Expected get_tree_datalist to return an array"
		);

		$this->assertNotEmpty(
			$result,
			"Expected get_tree_datalist to return non-empty array for logged user"
		);

		// Test structure of returned items
		if (!empty($result)) {
			$first_item = $result[0];
			$this->assertObjectHasProperty('tipo', $first_item);
			$this->assertObjectHasProperty('model', $first_item);
			$this->assertObjectHasProperty('parent', $first_item);
			$this->assertObjectHasProperty('label', $first_item);
		}
	}//end test_get_tree_datalist



	/**
	 * TEST_GET_TREE_DATALIST_EMPTY_USER
	 * @return void
	 */
	public function test_get_tree_datalist_empty_user() {

		// Temporarily clear user session
		$original_user_id = $_SESSION['dedalo']['user_id'] ?? null;
		$_SESSION['dedalo']['user_id'] = null;

		$menu = $this->build_menu_instance();
		$result = $menu->get_tree_datalist();

		$this->assertIsArray(
			$result,
			"Expected get_tree_datalist to return an array even for empty user"
		);

		// Note: The menu may still return areas if the user is a global admin or developer
		// even with empty user_id, so we just verify it's an array and doesn't crash
		$this->assertIsArray($result);

		// Restore user session
		if ($original_user_id) {
			$_SESSION['dedalo']['user_id'] = $original_user_id;
		}
	}//end test_get_tree_datalist_empty_user



	/**
	 * TEST_GET_INFO_DATA
	 * @return void
	 */
	public function test_get_info_data() {

		$menu = $this->build_menu_instance();
		$result = $menu->get_info_data();

		$this->assertIsObject(
			$result,
			"Expected get_info_data to return an object"
		);

		// Test required properties
		$this->assertObjectHasProperty('dedalo_version', $result);
		$this->assertObjectHasProperty('dedalo_build', $result);
		$this->assertObjectHasProperty('dedalo_db_name', $result);
		$this->assertObjectHasProperty('pg_version', $result);
		$this->assertObjectHasProperty('php_version', $result);
		$this->assertObjectHasProperty('memory', $result);
		$this->assertObjectHasProperty('entity', $result);

		// Test values are not empty
		$this->assertNotEmpty(
			$result->dedalo_version,
			"Expected dedalo_version to be set"
		);

		$this->assertNotEmpty(
			$result->php_version,
			"Expected php_version to be set"
		);
	}//end test_get_info_data



	/**
	 * TEST_GET_STRUCTURE_CONTEXT
	 * @return void
	 */
	public function test_get_structure_context() {

		$menu = $this->build_menu_instance();
		$result = $menu->get_structure_context();

		$this->assertInstanceOf(
			dd_object::class,
			$result,
			"Expected get_structure_context to return dd_object instance"
		);

		// Test required properties
		$this->assertObjectHasProperty('label', $result);
		$this->assertObjectHasProperty('tipo', $result);
		$this->assertObjectHasProperty('model', $result);
		$this->assertObjectHasProperty('lang', $result);
		$this->assertObjectHasProperty('mode', $result);
		$this->assertObjectHasProperty('permissions', $result);
		$this->assertObjectHasProperty('tools', $result);

		// Test values
		$this->assertEquals(
			self::$tipo,
			$result->tipo,
			"Expected tipo to match menu tipo"
		);

		$this->assertEquals(
			'edit',
			$result->mode,
			"Expected mode to be 'edit'"
		);

		$this->assertIsArray(
			$result->tools,
			"Expected tools to be an array"
		);
	}//end test_get_structure_context



	/**
	 * TEST_GET_STRUCTURE_CONTEXT_WITH_PERMISSIONS
	 * @return void
	 */
	public function test_get_structure_context_with_permissions() {

		$menu = $this->build_menu_instance();
		$permissions = 2;
		$result = $menu->get_structure_context($permissions);

		$this->assertEquals(
			$permissions,
			$result->permissions,
			"Expected permissions to match input parameter"
		);
	}//end test_get_structure_context_with_permissions



	/**
	 * TEST_GET_MY_PARENT
	 * @return void
	 */
	public function test_get_my_parent() {

		// Use reflection to access private method
		$reflection = new ReflectionClass(menu::class);
		$method = $reflection->getMethod('get_my_parent');
		$method->setAccessible(true);

		// Create test area objects
		$area1 = (object)[
			'tipo' => 'test1',
			'parent' => 'test2'
		];

		$area2 = (object)[
			'tipo' => 'test2',
			'parent' => 'test3'
		];

		$area3 = (object)[
			'tipo' => 'test3',
			'parent' => null
		];

		$skip_parents = [$area2]; // area2 should be skipped

		// Test with skip parent
		$result = $method->invoke(null, $area1, $skip_parents);
		$this->assertEquals(
			'test3',
			$result,
			"Expected parent to be 'test3' when area2 is in skip_parents"
		);

		// Test without skip parent
		$skip_parents = [];
		$result = $method->invoke(null, $area1, $skip_parents);
		$this->assertEquals(
			'test2',
			$result,
			"Expected parent to be 'test2' when no skip_parents"
		);

		// Test with null parent
		$result = $method->invoke(null, $area3, $skip_parents);
		$this->assertNull(
			$result,
			"Expected parent to be null for root area"
		);
	}//end test_get_my_parent



	/**
	 * TEST_GET_MY_PARENT_RECURSIVE
	 * @return void
	 */
	public function test_get_my_parent_recursive() {

		// Use reflection to access private method
		$reflection = new ReflectionClass(menu::class);
		$method = $reflection->getMethod('get_my_parent');
		$method->setAccessible(true);

		// Create recursive test case
		$area1 = (object)[
			'tipo' => 'test1',
			'parent' => 'test2'
		];

		$area2 = (object)[
			'tipo' => 'test2',
			'parent' => 'test3'
		];

		$area3 = (object)[
			'tipo' => 'test3',
			'parent' => 'test4'
		];

		$area4 = (object)[
			'tipo' => 'test4',
			'parent' => null
		];

		// Both area2 and area3 should be skipped
		$skip_parents = [$area2, $area3];

		$result = $method->invoke(null, $area1, $skip_parents);
		$this->assertEquals(
			'test4',
			$result,
			"Expected recursive parent to be 'test4' when area2 and area3 are skipped"
		);
	}//end test_get_my_parent_recursive



}//end menu_test
