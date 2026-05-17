<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
 * DD_AGENT_API CONTRACT TEST
 * Validates the agent-tier API surface: request/response shapes,
 * permission gates, and action allowlist. Does NOT test business
 * logic depth (that belongs to component / search test suites).
 *
 * @package Dedalo
 * @subpackage Test
 */
final class dd_agent_api_Test extends BaseTestCase {

	public static $section_tipo = 'test3';
	public static $tipo = 'test17';

	/**
	* TEST_ACTIONS_ALLOWLIST
	* Only declared actions may be dispatched.
	* @return void
	*/
	public function test_actions_allowlist() : void {

		$actions = dd_agent_api::API_ACTIONS;

		$this->assertContains('describe_section', $actions);
		$this->assertContains('read_record_view', $actions);
		$this->assertContains('search_records_view', $actions);
		$this->assertContains('set_field_by_label', $actions);
		$this->assertContains('count_records', $actions);
	}//end test_actions_allowlist


	/**
	* TEST_DESCRIBE_SECTION_SHAPE
	* Validates the response envelope and field descriptor schema.
	* @return void
	*/
	public function test_describe_section_shape() : void {

		$this->user_login();

		$rqo = (object)[
			'action' => 'describe_section',
			'dd_api' => 'dd_agent_api',
			'source' => (object)[
				'section_tipo' => self::$section_tipo,
				'lang' => DEDALO_DATA_LANG,
			],
		];

		$response = dd_agent_api::describe_section($rqo);

		$this->assertIsObject($response);
		$this->assertTrue($response->result !== false, 'expected success result');

		$result = $response->result;
		$this->assertObjectHasProperty('section_tipo', $result);
		$this->assertObjectHasProperty('section_label', $result);
		$this->assertObjectHasProperty('lang', $result);
		$this->assertObjectHasProperty('fields', $result);

		$this->assertIsArray($result->fields);
		if (count($result->fields) > 0) {
			$field = $result->fields[0];
			$this->assertObjectHasProperty('label', $field);
			$this->assertObjectHasProperty('type', $field);
			$this->assertContains($field->type, ['text', 'html', 'date', 'number', 'link', 'media']);
		}
	}//end test_describe_section_shape


	/**
	* TEST_DESCRIBE_SECTION_WITH_TIPOS
	* When include_tipos=true, _meta.field_tipos must be present.
	* @return void
	*/
	public function test_describe_section_with_tipos() : void {

		$this->user_login();

		$rqo = (object)[
			'action' => 'describe_section',
			'dd_api' => 'dd_agent_api',
			'source' => (object)[
				'section_tipo' => self::$section_tipo,
				'lang' => DEDALO_DATA_LANG,
				'include_tipos' => true,
			],
		];

		$response = dd_agent_api::describe_section($rqo);

		$this->assertTrue($response->result !== false, 'expected success result');
		$result = $response->result;

		$this->assertObjectHasProperty('_meta', $result);
		$this->assertObjectHasProperty('field_tipos', $result->_meta);

		if (count($result->fields) > 0) {
			$field = $result->fields[0];
			$this->assertObjectHasProperty('tipo', $field);
			$this->assertObjectHasProperty('model', $field);
		}
	}//end test_describe_section_with_tipos


	/**
	* TEST_READ_RECORD_VIEW_SHAPE
	* Validates the agent-view record envelope.
	* @return void
	*/
	public function test_read_record_view_shape() : void {

		$this->user_login();

		$rqo = (object)[
			'action' => 'read_record_view',
			'dd_api' => 'dd_agent_api',
			'source' => (object)[
				'section_tipo' => self::$section_tipo,
				'section_id' => 1,
				'lang' => DEDALO_DATA_LANG,
				'include_tipos' => true,
			],
		];

		$response = dd_agent_api::read_record_view($rqo);

		$this->assertIsObject($response);

		if ($response->result === false) {
			$this->markTestSkipped('test record not available');
		}

		$result = $response->result;
		$this->assertObjectHasProperty('section_tipo', $result);
		$this->assertObjectHasProperty('section_id', $result);
		$this->assertObjectHasProperty('section_label', $result);
		$this->assertObjectHasProperty('fields', $result);
		$this->assertObjectHasProperty('_meta', $result);
		$this->assertObjectHasProperty('section_tipo', $result->_meta);
		$this->assertObjectHasProperty('field_tipos', $result->_meta);
	}//end test_read_record_view_shape


	/**
	* TEST_SEARCH_RECORDS_VIEW_SHAPE
	* Validates the search response envelope and pagination block.
	* @return void
	*/
	public function test_search_records_view_shape() : void {

		$this->user_login();

		$rqo = (object)[
			'action' => 'search_records_view',
			'dd_api' => 'dd_agent_api',
			'source' => (object)[
				'section_tipo' => self::$section_tipo,
				'lang' => DEDALO_DATA_LANG,
				'limit' => 5,
				'offset' => 0,
				'full_count' => false,
				'include_tipos' => false,
			],
		];

		$response = dd_agent_api::search_records_view($rqo);

		$this->assertIsObject($response);
		$this->assertTrue($response->result !== false, 'expected success result');

		$result = $response->result;
		$this->assertObjectHasProperty('section_tipo', $result);
		$this->assertObjectHasProperty('section_label', $result);
		$this->assertObjectHasProperty('lang', $result);
		$this->assertObjectHasProperty('records', $result);
		$this->assertObjectHasProperty('pagination', $result);
		$this->assertObjectHasProperty('limit', $result->pagination);
		$this->assertObjectHasProperty('offset', $result->pagination);
		$this->assertObjectHasProperty('count', $result->pagination);
	}//end test_search_records_view_shape


	/**
	* TEST_SET_FIELD_BY_LABEL_PERMISSION_GATE
	* Writing without sufficient permissions must fail cleanly.
	* @return void
	*/
	public function test_set_field_by_label_permission_gate() : void {

		$this->user_login();

		$rqo = (object)[
			'action' => 'set_field_by_label',
			'dd_api' => 'dd_agent_api',
			'source' => (object)[
				'section_tipo' => self::$section_tipo,
				'section_id' => 999999,
				'field' => 'Title',
				'value' => 'test',
				'lang' => DEDALO_DATA_LANG,
			],
		];

		$response = dd_agent_api::set_field_by_label($rqo);

		$this->assertIsObject($response);
		$this->assertTrue(
			$response->result === false || in_array('permissions_denied', $response->errors ?? []) || in_array('out_of_scope', $response->errors ?? []),
			'expected failure for non-existent / out-of-scope record'
		);
	}//end test_set_field_by_label_permission_gate


	/**
	* TEST_COUNT_RECORDS_SHAPE
	* Validates the count_records response shape.
	* @return void
	*/
	public function test_count_records_shape() : void {

		$this->user_login();

		$rqo = (object)[
			'action' => 'count_records',
			'dd_api' => 'dd_agent_api',
			'source' => (object)[
				'section_tipo' => self::$section_tipo,
				'lang' => DEDALO_DATA_LANG,
			],
		];

		$response = dd_agent_api::count_records($rqo);

		$this->assertIsObject($response);
		$this->assertTrue($response->result !== false, 'expected success result');

		$result = $response->result;
		$this->assertObjectHasProperty('section_tipo', $result);
		$this->assertObjectHasProperty('section_label', $result);
		$this->assertObjectHasProperty('total', $result);
	}//end test_count_records_shape


	/**
	* TEST_BUILD_SQO_FILTER_FROM_LABEL_RULES
	* The private helper must resolve labels and emit valid SQO shapes.
	* @return void
	*/
	public function test_build_sqo_filter_from_label_rules() : void {

		$this->user_login();

		$method = new ReflectionMethod(dd_agent_api::class, 'build_sqo_filter_from_label_rules');
		$method->setAccessible(true);

		$filter = (object)[
			'operator' => 'AND',
			'rules' => [
				(object)[
					'field' => 'Title',
					'operator' => 'contains',
					'value' => 'test',
				],
			],
		];

		$sqo_filter = $method->invoke(null, self::$section_tipo, DEDALO_DATA_LANG, $filter);

		if ($sqo_filter !== null) {
			$this->assertTrue(
				isset($sqo_filter->{'$and'}) || isset($sqo_filter->{'$or'}),
				'expected $and or $or key in SQO filter'
			);
		}
	}//end test_build_sqo_filter_from_label_rules

}//end class dd_agent_api_Test