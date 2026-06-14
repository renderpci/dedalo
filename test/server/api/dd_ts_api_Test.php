<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class dd_ts_api_test extends BaseTestCase {



	public static $section_tipo		= 'ts1';
	public static $root_section_id	= 1;

	/**
	 * Section ids created during a test, removed in tearDown
	 * @var array $created_section_ids
	 */
	private array $created_section_ids = [];



	/**
	* SETUP
	* Grant write permissions on the thesaurus test section (ts1) the same way
	* BaseTestCase does for its own test sections.
	* @return void
	*/
	protected function setUp(): void {
		parent::setUp();

		if (class_exists('security')) {
			security::$permissions_table_cache[self::$section_tipo . '_' . self::$section_tipo] = 2;
		}
	}//end setUp



	/**
	* TEARDOWN
	* Removes the section records created by the test
	* @return void
	*/
	protected function tearDown(): void {

		$table = common::get_matrix_table_from_tipo(self::$section_tipo);
		foreach ($this->created_section_ids as $section_id) {
			matrix_db_manager::delete($table, self::$section_tipo, (int)$section_id);
		}
		$this->created_section_ids = [];

		// instance caches may hold the deleted records
		component_instances_cache::clear();
		section_record_instances_cache::clear();

		parent::tearDown();
	}//end tearDown



	/**
	* ADD_CHILD_HELPER
	* Calls dd_ts_api::add_child under the given parent and tracks the new id
	* for cleanup.
	* @param int $parent_section_id
	* @return object $response
	*/
	private function add_child_helper( int $parent_section_id ) : object {

		$rqo = (object)[
			'source' => (object)[
				'section_tipo'	=> self::$section_tipo,
				'section_id'	=> $parent_section_id
			]
		];

		$response = dd_ts_api::add_child($rqo);

		if (is_int($response->result)) {
			$this->created_section_ids[] = $response->result;
		}

		return $response;
	}//end add_child_helper



	/**
	* GET_PARENT_DATA
	* Reads component_relation_parent data of the given section fresh (cache bypassed)
	* @param int $section_id
	* @return array|null
	*/
	private function get_parent_data( int $section_id ) : ?array {

		// clear instance caches to force a DB read
		component_instances_cache::clear();
		section_record_instances_cache::clear();

		return component_relation_parent::get_parents(
			$section_id,
			self::$section_tipo
		);
	}//end get_parent_data



	/**
	* COUNT_SECTION_ROWS
	* @param string $section_tipo
	* @return int
	*/
	private function count_section_rows( string $section_tipo ) : ?int {

		$table = common::get_matrix_table_from_tipo($section_tipo);
		if (empty($table)) {
			return null;
		}

		$conn	= DBi::_getConnection();
		$result	= pg_query_params(
			$conn,
			'SELECT count(*) AS n FROM "' . $table . '" WHERE section_tipo = $1',
			[$section_tipo]
		);
		if ($result===false) {
			return null;
		}

		return (int)pg_fetch_result($result, 0, 'n');
	}//end count_section_rows



	/**
	* TEST_RESPONSE_SHAPE
	* All actions answer with {result, msg, errors}
	* @return void
	*/
	public function test_response_shape() : void {

		$rqo = (object)[
			'source' => (object)[
				'section_tipo'	=> self::$section_tipo,
				'section_id'	=> self::$root_section_id
			]
		];

		$response = dd_ts_api::get_node_data($rqo);

		foreach (['result','msg','errors'] as $key) {
			$this->assertTrue(
				property_exists($response, $key),
				"expected response property '$key'"
			);
		}
		$this->assertTrue(
			is_array($response->errors),
			'expected errors to be an array'
		);
	}//end test_response_shape



	/**
	* TEST_ADD_CHILD_CREATES_LINKED_RECORD
	* Happy path: a new record exists AND is linked to the given parent.
	* @return void
	*/
	public function test_add_child_creates_linked_record() : void {

		$response = $this->add_child_helper(self::$root_section_id);

		$this->assertTrue(
			is_int($response->result),
			'expected new section_id as int : ' . to_string($response->result)
				. ' msg: ' . to_string($response->msg)
		);

		$new_section_id = $response->result;

		// the new record is linked to the parent
		$parent_data = $this->get_parent_data($new_section_id);
		$this->assertTrue(
			is_array($parent_data) && count($parent_data)===1,
			'expected exactly one parent locator : ' . to_string($parent_data)
		);
		$this->assertTrue(
			$parent_data[0]->section_tipo===self::$section_tipo
				&& (int)$parent_data[0]->section_id===self::$root_section_id,
			'expected parent locator pointing to root : ' . to_string($parent_data)
		);
	}//end test_add_child_creates_linked_record



	/**
	* TEST_ADD_CHILD_PRECONDITION_FAILURE_LEAVES_NO_ORPHAN
	* When the section has no component_relation_parent the action must fail
	* BEFORE creating any record.
	* @return void
	*/
	public function test_add_child_precondition_failure_leaves_no_orphan() : void {

		// find a fixture section without component_relation_parent whose
		// matrix table is resolvable (needed to count rows)
		$candidates = ['rsc197', 'dd88', 'oh1'];
		$target = null;
		$rows_before = null;
		foreach ($candidates as $candidate) {
			$ar_parent_tipo = section::get_ar_children_tipo_by_model_name_in_section($candidate, ['component_relation_parent'], true, true, true, true);
			if (!empty($ar_parent_tipo)) {
				continue;
			}
			$rows_before = $this->count_section_rows($candidate);
			if ($rows_before!==null) {
				$target = $candidate;
				break;
			}
		}
		if ($target===null) {
			$this->markTestSkipped('No fixture section without component_relation_parent available');
		}

		$rqo = (object)[
			'source' => (object)[
				'section_tipo'	=> $target,
				'section_id'	=> 1
			]
		];
		$response = dd_ts_api::add_child($rqo);

		$this->assertFalse(
			$response->result,
			'expected result false on precondition failure : ' . to_string($response->result)
		);
		$this->assertNotEmpty(
			$response->errors,
			'expected errors on precondition failure'
		);

		$rows_after = $this->count_section_rows($target);
		$this->assertSame(
			$rows_before,
			$rows_after,
			'expected NO orphan record created on precondition failure'
		);
	}//end test_add_child_precondition_failure_leaves_no_orphan



	/**
	* TEST_UPDATE_PARENT_DATA_MOVES_NODE
	* Creates A and B under root, moves A under B, verifies the relation.
	* @return void
	*/
	public function test_update_parent_data_moves_node() : void {

		$response_a = $this->add_child_helper(self::$root_section_id);
		$response_b = $this->add_child_helper(self::$root_section_id);

		$this->assertTrue(
			is_int($response_a->result) && is_int($response_b->result),
			'expected both children created : '
				. to_string($response_a->msg) .' / '. to_string($response_b->msg)
		);

		$a = $response_a->result;
		$b = $response_b->result;

		// move A under B
		$rqo = (object)[
			'source' => (object)[
				'section_tipo'				=> self::$section_tipo,
				'section_id'				=> $a,
				'old_parent_section_id'		=> self::$root_section_id,
				'old_parent_section_tipo'	=> self::$section_tipo,
				'new_parent_section_id'		=> $b,
				'new_parent_section_tipo'	=> self::$section_tipo
			]
		];
		$response = dd_ts_api::update_parent_data($rqo);

		$this->assertTrue(
			$response->result===true,
			'expected move success : ' . to_string($response->msg)
				. ' errors: ' . to_string($response->errors)
		);

		// A's parent is now B (and no longer root)
		$parent_data = $this->get_parent_data($a);
		$this->assertTrue(
			is_array($parent_data) && count($parent_data)===1,
			'expected exactly one parent locator after move : ' . to_string($parent_data)
		);
		$this->assertSame(
			$b,
			(int)$parent_data[0]->section_id,
			'expected parent locator pointing to B after move'
		);
	}//end test_update_parent_data_moves_node



	/**
	* TEST_UPDATE_PARENT_DATA_REJECTS_CYCLE
	* With A under root and B under A, moving A under B must be rejected with
	* a distinct 'cycle' error and data untouched.
	* @return void
	*/
	public function test_update_parent_data_rejects_cycle() : void {

		$response_a = $this->add_child_helper(self::$root_section_id);
		$this->assertTrue(is_int($response_a->result), 'expected child A created');
		$a = $response_a->result;

		$response_b = $this->add_child_helper($a);
		$this->assertTrue(is_int($response_b->result), 'expected child B created under A');
		$b = $response_b->result;

		// try to move A under its own descendant B
		$rqo = (object)[
			'source' => (object)[
				'section_tipo'				=> self::$section_tipo,
				'section_id'				=> $a,
				'old_parent_section_id'		=> self::$root_section_id,
				'old_parent_section_tipo'	=> self::$section_tipo,
				'new_parent_section_id'		=> $b,
				'new_parent_section_tipo'	=> self::$section_tipo
			]
		];
		$response = dd_ts_api::update_parent_data($rqo);

		$this->assertFalse(
			$response->result,
			'expected move rejected (cycle) : ' . to_string($response->msg)
		);
		$this->assertContains(
			'cycle',
			$response->errors,
			'expected distinct cycle error : ' . to_string($response->errors)
		);

		// A's parent data untouched (still root)
		$parent_data = $this->get_parent_data($a);
		$this->assertTrue(
			is_array($parent_data) && count($parent_data)===1,
			'expected one parent locator : ' . to_string($parent_data)
		);
		$this->assertSame(
			self::$root_section_id,
			(int)$parent_data[0]->section_id,
			'expected A parent untouched after rejected cycle'
		);

		// moving a node under itself is also rejected
		$rqo->source->new_parent_section_id = $a;
		$response_self = dd_ts_api::update_parent_data($rqo);
		$this->assertFalse(
			$response_self->result,
			'expected move under itself rejected'
		);
		$this->assertContains(
			'cycle',
			$response_self->errors,
			'expected cycle error on self move'
		);
	}//end test_update_parent_data_rejects_cycle



	/**
	* TEST_SAVE_ORDER
	* Permutes two siblings and verifies idempotence on a second identical call.
	* @return void
	*/
	public function test_save_order() : void {

		// order component must be configured for the fixture
		$section_map = section::get_section_map(self::$section_tipo);
		if (empty($section_map->thesaurus->order ?? null)) {
			$this->markTestSkipped('No order component configured in ts1 section_map');
		}

		$response_a = $this->add_child_helper(self::$root_section_id);
		$response_b = $this->add_child_helper(self::$root_section_id);
		$this->assertTrue(
			is_int($response_a->result) && is_int($response_b->result),
			'expected both children created'
		);
		$a = $response_a->result;
		$b = $response_b->result;

		$build_locator = function(int $section_id) {
			return (object)[
				'section_tipo'	=> self::$section_tipo,
				'section_id'	=> $section_id
			];
		};

		// permute: B first, A second
		$rqo = (object)[
			'source' => (object)[
				'section_tipo'			=> self::$section_tipo,
				'ar_locators'			=> [ $build_locator($b), $build_locator($a) ],
				'parent_section_tipo'	=> self::$section_tipo,
				'parent_section_id'		=> self::$root_section_id
			]
		];
		$response = dd_ts_api::save_order($rqo);

		$this->assertTrue(
			is_array($response->result),
			'expected changed array : ' . to_string($response->msg)
		);
		$this->assertNotEmpty(
			$response->result,
			'expected at least one changed order value'
		);

		// idempotence: same order again changes nothing
		$response_repeat = dd_ts_api::save_order($rqo);
		$this->assertTrue(
			is_array($response_repeat->result),
			'expected changed array on repeat : ' . to_string($response_repeat->msg)
		);
		$this->assertCount(
			0,
			$response_repeat->result,
			'expected no changes on identical re-order : ' . to_string($response_repeat->result)
		);
	}//end test_save_order



	/**
	* TEST_GET_CHILDREN_DATA_SHAPE
	* Response result carries ar_children_data + pagination
	* @return void
	*/
	public function test_get_children_data_shape() : void {

		// children tipo of the fixture
		$children_tipo = component_relation_parent::get_component_relation_children_tipo(
			component_relation_parent::get_parent_tipo(self::$section_tipo)
		);
		if (empty($children_tipo)) {
			$this->markTestSkipped('No component_relation_children resolved for ts1');
		}

		$rqo = (object)[
			'source' => (object)[
				'section_tipo'	=> self::$section_tipo,
				'section_id'	=> self::$root_section_id,
				'children_tipo'	=> $children_tipo
			],
			'options' => (object)[
				'pagination' => (object)[
					'limit'		=> 10,
					'offset'	=> 0
				]
			]
		];
		$response = dd_ts_api::get_children_data($rqo);

		$this->assertTrue(
			is_object($response->result),
			'expected result object : ' . to_string($response->msg)
		);
		$this->assertTrue(
			property_exists($response->result, 'ar_children_data'),
			'expected ar_children_data property'
		);
		$this->assertTrue(
			property_exists($response->result, 'pagination'),
			'expected pagination property'
		);
		$this->assertTrue(
			is_array($response->result->ar_children_data),
			'expected ar_children_data array'
		);
	}//end test_get_children_data_shape



}//end class dd_ts_api_test
