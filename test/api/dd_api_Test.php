<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}



final class dd_api_Test extends TestCase {



	protected function setUp(): void   {
		// $this->markTestSkipped(
		// 	'Disabled !'
		// );
	}



	/**
	* API_REQUEST
	* Exec a curl request to the Dédalo API
	* @return object $response
	*/
	protected static function api_request(object $rqo) : object {

		$api_url = defined('DEDALO_API_URL_UNIT_TEST')
			? DEDALO_API_URL_UNIT_TEST
			: 'http://localhost:8080' .DEDALO_API_URL;

		$response = curl_request((object)[
			'url'				=> $api_url,
			'post'				=> true,
			'postfields'		=> json_encode($rqo),
			'header'			=> false,
			'httpheader'		=> array('Content-Type:application/json')
		]);

		$API_response = json_decode($response->result);

		return $API_response;
	}//end api_request



	/**
	* TEST_LOGIN
	* @return void
	*/
	public function test_login() : void {

		$rqo = json_decode('
			{
				"action": "login",
				"dd_api": "dd_utils_api",
				"options": {
					"username": "## fake user ##",
					"auth": "## fake password ##"
				}
			}
		');

		// direct exec local
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_utils_api::{$rqo->action}($rqo);
				// dump($response, ' response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);
			$this->assertTrue(
				$response->result===false,
				'expected false on login with fake data'
			);

		// request call across API REST
			$response = self::api_request($rqo);
				// dump($response, ' test_login response ++ '.to_string());

			$this->assertTrue(
				$response->result===false,
				'expected false on login with fake data'
			);
	}//end test_login



	/**
	* TEST_START
	* @return void
	*/
	public function test_start(): void {

		// login_Test::force_login('-1');

		// rqo start section
			$rqo = (object)[
				'options' => (object)[
					'search_obj'	=> (object)[
						'tipo'	=> 'oh1',
						'mode'	=> 'list'
					],
					'menu' => true
				]
			];
			$_ENV['DEDALO_ERRORS'] = []; // reset
			// no login case
				$response = dd_core_api::start($rqo);

				// no login case, expected login context as response
				$login_element = $response->result->context[0];
				$this->assertTrue( $login_element->model==='login' );

			// logged case
				login_Test::force_login(DEDALO_SUPERUSER);

				$response = dd_core_api::start($rqo);

				// expected menu context as first item
				$menu_element = $response->result->context[0];
				$this->assertTrue( $menu_element->model==='menu' );

				// expected section as second item
				$section_element = $response->result->context[1];
				$this->assertTrue( $section_element->model==='section' );
				// type expected is section
				$this->assertTrue( $section_element->type==='section' );
				$this->assertTrue( $section_element->typo==='ddo' );

				// expected result as not false
				$this->assertFalse( $response->result===false );


		// rqo start section_tool
			$rqo = (object)[
				'options' => (object)[
					'search_obj' => (object)[
						'tipo'	=> 'oh81',
						'mode'	=> 'list'
					]
				]
			];
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::start($rqo);

			// expected section as first item
			$context_element = $response->result->context[0];
			$this->assertTrue( $context_element->model==='section' );

			// context config source_section_tipo expected oh81
			$this->assertTrue( $context_element->config->source_section_tipo==='oh81' );
			// type expected is section
			$this->assertTrue( $context_element->type==='section' );
			$this->assertTrue( $context_element->typo==='ddo' );

			// expected result as not false
			$this->assertFalse( $response->result===false );


		// rqo start area_thesaurus
			$rqo = (object)[
				'options' => (object)[
					'search_obj' => (object)[
						'tipo'	=> 'dd100',
						'mode'	=> 'list'
					],
				]
			];
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::start($rqo);

			// expected area_thesaurus as first item
			$context_element = $response->result->context[0];
			$this->assertTrue( $context_element->model==='area_thesaurus' );
			// type expected is area
			$this->assertTrue( $context_element->type==='area' );
			$this->assertTrue( $context_element->typo==='ddo' );


		// rqo start tool_lang
			$rqo = (object)[
				'options' => (object)[
					'search_obj' => (object)[
						'tool'	=> 'tool_lang',
						'mode'	=> 'list'
					],
				]
			];
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::start($rqo);

			$context_element = $response->result->context[0];
			// model expected is tool_lang
			$this->assertTrue( $context_element->model==='tool_lang' );
			// type expected is area
			$this->assertTrue( $context_element->type==='tool' );
			$this->assertTrue( $context_element->typo==='ddo' );

			// expected result as not false
			$this->assertFalse( $response->result===false );


		// rqo start area
			$rqo = (object)[
				'options' => (object)[
					'search_obj' => (object)[
						'tipo'	=> 'dd355',
						'mode'	=> 'list'
					],
				]
			];
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::start($rqo);

			// expected area_thesaurus as first item
			$context_element = $response->result->context[0];
			$this->assertTrue( $context_element->model==='area' );
			// type expected is area
			$this->assertTrue( $context_element->type==='area' );
			$this->assertTrue( $context_element->typo==='ddo' );

			// expected result as not false
			$this->assertFalse( $response->result===false );


		// rqo start component
			$rqo = (object)[
				'options' => (object)[
					'search_obj' => (object)[
						'tipo'			=> 'rsc36',
						'section_tipo'	=> 'rsc167',
						'mode'			=> 'list'
					],
				]
			];
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::start($rqo);

			// expected area_thesaurus as first item
			$context_element = $response->result->context[0];
			$this->assertTrue( $context_element->model==='component_text_area' );
			// type expected is area
			$this->assertTrue( $context_element->type==='component' );
			$this->assertTrue( $context_element->typo==='ddo' );


		// rqo start component as locator
			$locator = (object)[
				'tipo'			=> 'rsc36',
				'section_tipo'	=> 'rsc167',
				'mode'			=> 'list'
			];
			$rqo = (object)[
				'options' => (object)[
					'search_obj' => (object)[
						'locator' => $locator
					]
				]
			];
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::start($rqo);

			// expected area_thesaurus as first item
			$context_element = $response->result->context[0];
			$this->assertTrue( $context_element->model==='component_text_area' );
			// type expected is area
			$this->assertTrue( $context_element->type==='component' );
			$this->assertTrue( $context_element->typo==='ddo' );
			// expected running without errors
			$this->assertTrue( empty($_ENV['DEDALO_ERRORS']) );

			// expected result as not false
			$this->assertFalse( $response->result===false );


		// rqo invalid
			$rqo = json_decode('
				{
					"invalid thing": "patata"
				}
			');
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::start($rqo);

			$context	= $response->result->context;
			$data		= $response->result->data;

			// expected array format
			$this->assertTrue( gettype($context)==='array' );
			// expected default section context
			$this->assertTrue( count($context)===1 );
			// expected array format
			$this->assertTrue( gettype($data)==='array' );
			// expected empty data
			$this->assertTrue( count($data)===0 );
			// expected running with errors
			$this->assertTrue( !empty($_ENV['DEDALO_ERRORS']) );
	}//end test_start



	/**
	* TEST_READ
	* @return void
	*/
	public function test_read(): void {

		// default search
			$rqo = json_handler::decode('
				{
					"action": "read",
					"source": {
						"typo": "source",
						"type": "section",
						"action": "search",
						"model": "section",
						"tipo": "rsc167",
						"section_tipo": "rsc167",
						"section_id": null,
						"mode": "edit",
						"view": null,
						"lang": "lg-eng"
					},
					"sqo": {
						"section_tipo": [
							"rsc167"
						],
						"limit": 10,
						"offset": 0,
						"select": [],
						"full_count": false
					}
				}
			');
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::read($rqo);
				// dump($response, ' search response ++ '.to_string());

			$context	= $response->result->context;
			$data		= $response->result->data;

			// expected result as not false
			$this->assertFalse( $response->result===false );

			// check format. Expected array for data and context
				$this->assertTrue( gettype($context)==='array' );
				$this->assertTrue( gettype($data)==='array' );
				$this->assertTrue( count($data)>0 );
				// expected running without errors
				$this->assertTrue( empty($_ENV['DEDALO_ERRORS']) );

		// related_search
			$rqo = json_handler::decode('
				{
				    "action": "read",
				    "source": {
				        "action": "related_search",
				        "model": "component_text_area",
				        "tipo": "test17",
				        "section_tipo": "test3",
				        "section_id": "1",
				        "lang": "lg-eng",
				        "mode": "related_list"
				    },
				    "sqo": {
				        "section_tipo": [
				            "all"
				        ],
				        "mode": "related",
				        "offset": 0,
				        "full_count": false,
				        "filter_by_locators": [
				            {
				                "section_tipo": "test17",
				                "section_id": "1"
				            }
				        ]
				    }
				}
			');
			// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' related_search response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='object',
				'expected response result type is object'
			);

			$this->assertTrue(
				gettype($response->result->context)==='array',
				'expected response result context type is array'
			);

			$this->assertTrue(
				gettype($response->result->data)==='array',
				'expected response result data type is array'
			);

		// get_data component
			$rqo = json_handler::decode('
				{
				    "action": "read",
				     "source": {
				        "typo": "source",
				        "type": "component",
				        "action": "get_data",
				        "model": "component_input_text",
				        "tipo": "test52",
				        "section_tipo": "test3",
				        "section_id": "1",
				        "mode": "edit",
				        "view": null,
				        "lang": "lg-eng",
				        "caller_dataframe": {
				            "section_tipo": "test3",
				            "section_id": "1"
				        },
				        "properties": {}
				    }
				}
			');
			// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' get_data response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='object',
				'expected response result type is object'
			);

			$this->assertTrue(
				gettype($response->result->context)==='array',
				'expected response result context type is array'
			);

			$this->assertTrue(
				gettype($response->result->data)==='array',
				'expected response result data type is array'
			);

		// get_data area_development
			$rqo = json_handler::decode('
				{
				    "action": "read",
				     "source": {
				        "typo": "source",
				        "type": "area",
				        "action": "get_data",
				        "model": "area_development",
				        "tipo": "dd770",
				        "section_tipo": "dd770",
				        "mode": "list",
				        "view": null,
				        "lang": "lg-eng"
				    },
				    "sqo": {
				        "section_tipo": [
				            "dd770"
				        ],
				        "limit": null,
				        "offset": 0
				    },
				    "prevent_lock": true
				}
			');
			// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' get_data response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='object',
				'expected response result type is object'
			);

			$this->assertTrue(
				gettype($response->result->context)==='array',
				'expected response result context type is array'
			);

			$this->assertTrue(
				gettype($response->result->data)==='array',
				'expected response result data type is array'
			);

		// get_data menu
			$rqo = json_handler::decode('
				{
				    "action": "read",
				     "source": {
				        "typo": "source",
				        "action": "get_data",
				        "model": "menu",
				        "tipo": "dd85",
				        "section_tipo": "dd85",
				        "mode": "edit",
				        "view": null
				    }
				}
			');
			// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' get_data response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='object',
				'expected response result type is object'
			);

			$this->assertTrue(
				gettype($response->result->context)==='array',
				'expected response result context type is array'
			);

			$this->assertTrue(
				gettype($response->result->data)==='array',
				'expected response result data type is array'
			);

		// resolve_data
			$rqo = json_handler::decode('
				{
				    "action": "read",
				     "source": {
				        "typo": "source",
				        "action": "resolve_data",
				        "model": "component_portal",
				        "tipo": "test80",
				        "section_tipo": "test3",
				        "section_id": "search_12",
				        "mode": "search",
				        "view": null,
				        "lang": "lg-eng",
				        "value": []
				    },
				    "sqo": {
				        "section_tipo": [
				            "test3"
				        ],
				        "limit": null,
				        "offset": 0,
				        "filter_by_locators": [
				            {
				                "section_tipo": "test3",
				                "section_id": "search_12"
				            }
				        ]
				    }
				}
			');
			// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' resolve_data response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='object',
				'expected response result type is object'
			);

			$this->assertTrue(
				gettype($response->result->context)==='array',
				'expected response result context type is array'
			);

			$this->assertTrue(
				gettype($response->result->data)==='array',
				'expected response result data type is array'
			);

		// get_relation_list
			$rqo = json_handler::decode('
				{
				    "action": "read",
				    "source": {
				    	"action" : "get_relation_list",
				        "section_tipo": "test3",
				        "section_id": "1",
				        "tipo": "test138",
				        "mode": "edit",
				        "model": "relation_list"
				    },
				    "sqo": {
				        "section_tipo": [
				            "all"
				        ],
				        "mode": "related",
				        "limit": 10,
				        "offset": 0,
				        "filter_by_locators": [
				            {
				                "section_tipo": "test3",
				                "section_id": "1"
				            }
				        ]
				    }
				}
			');

			// direct exec
				$_ENV['DEDALO_ERRORS'] = []; // reset
				$response = dd_core_api::{$rqo->action}($rqo);
					// dump($response, ' test_get_relation_list response  1 ++ '.to_string());

				$this->assertTrue(
					empty($_ENV['DEDALO_ERRORS']),
					'expected running without errors'
				);

				$this->assertTrue(
					$response->result!==false,
					'expected result is not false'
				);

				$this->assertTrue(
					gettype($response->result)==='object',
					'expected response result type is object'
				);

				$this->assertTrue(
					gettype($response->result->context)==='array',
					'expected response result context type is array'
				);

				$this->assertTrue(
					gettype($response->result->data)==='array',
					'expected response result data type is array'
				);

	}//end test_read



	/**
	* TEST_READ_INVALID_TIPO
	* @return void
	*/
	public function test_read_invalid_tipo(): void {

		$this->markTestSkipped(
			'Disabled !'
		);

		// rqo invalid tipo
			$rqo = json_decode('
				{
					"action": "read",
					"source": {
						"typo": "source",
						"type": "section",
						"action": "search",
						"model": "section",
						"tipo": "x96wTrsc167pR7",
						"section_tipo": "x96wTrsc167pR7k3",
						"section_id": null,
						"mode": "edit",
						"view": null,
						"lang": "lg-eng"
					},
					"sqo": {
						"section_tipo": [
							"x96wTrsc167pR7k3"
						],
						"limit": 1,
						"offset": 0,
						"select": [],
						"full_count": false
					}
				}
			');
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::read($rqo);
				// dump($_ENV['DEDALO_ERRORS'], ' DEDALO_ERRORS ++ '.to_string());
				// dump($response, ' response ++ '.to_string());
			$context	= $response->result->context;
			$data		= $response->result->data;

			// check format. Expected array for data and context
				$this->assertTrue( gettype($context)==='array' );
				$this->assertTrue( gettype($data)==='array' );
				$this->assertTrue( count($data)===0 );
				// expected running with errors
				$this->assertTrue( !empty($_ENV['DEDALO_ERRORS']) );
	}//end test_read_invalid_tipo



	/**
	* TEST_INVALID_API_CALL
	* @return void
	*/
	public function test_invalid_api_call(): void {

		$rqo = json_decode('
			{
				"method": "vaccinate the Raspa",
				"values": {
					"action": "locate the cat",
					"model": "section",
					"tipo": "x96wTrsc167pR7",
					"section_tipo": "x96wTrsc167pR7k3",
					"section_id": null,
					"mode": "edit",
					"view": null,
					"lang": "lg-fabada"
				}
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = dd_core_api::read($rqo);
			// dump($_ENV['DEDALO_ERRORS'], ' DEDALO_ERRORS ++ '.to_string());
			// dump($response, ' response ++ '.to_string());

		// expected running with errors
			$this->assertTrue( !empty($_ENV['DEDALO_ERRORS']) );

		// expected result as false
			$this->assertTrue( $response->result===false );
	}//end test_invalid_api_call



	/**
	* TEST_READ_RAW
	* @return void
	*/
	public function test_read_raw(): void {

		$rqo = json_decode('
			{
				"action": "read_raw",
				"source": {
					"typo": "source",
					"type": "section",
					"tipo": "test3",
					"section_tipo": "test3",
					"section_id": 1
				}
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = dd_core_api::read_raw($rqo);
			// dump($_ENV['DEDALO_ERRORS'], ' DEDALO_ERRORS ++ '.to_string());
			// dump($response, ' response ++ '.to_string());

		// expected running without errors
			$this->assertTrue( empty($_ENV['DEDALO_ERRORS']) );

		// expected running without errors
			$this->assertTrue( gettype($response->result)==='object' );

		// expected result as false
			$this->assertTrue( $response->result!==false );
	}//end test_read_raw



	/**
	* TEST_CREATE
	* @return void
	*/
	public function test_create(): void {

		$rqo = json_decode('
			{
				"action": "create",
				"source": {
					"typo": "source",
					"type": "section",
					"section_tipo": "test3"
				}
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = dd_core_api::create($rqo);
			// dump($_ENV['DEDALO_ERRORS'], ' DEDALO_ERRORS ++ '.to_string());
			// dump($response, ' response ++ '.to_string());

		// expected running without errors
		$this->assertTrue( empty($_ENV['DEDALO_ERRORS']) );

		// expected result as not false
		$this->assertTrue( $response->result!==false );

		// expected result type is integer
		$this->assertTrue( gettype($response->result)==='integer' );

		// expected result is bigger than zero
		$this->assertTrue( $response->result>0 );
	}//end test_create



	/**
	* TEST_DUPLICATE
	* @return void
	*/
	public function test_duplicate() : void {

		$section_id = 1;

		$rqo = json_decode('
			{
				"action": "duplicate",
				"source": {
					"typo": "source",
					"type": "section",
					"section_tipo": "test3",
					"section_id": '.$section_id.'
				}
			}
		');
		$_ENV['DEDALO_ERRORS'] = []; // reset
		$response = dd_core_api::{$rqo->action}($rqo);
			// dump($_ENV['DEDALO_ERRORS'], ' DEDALO_ERRORS ++ '.to_string());
			// dump($response, ' response ++ '.to_string());

		// expected running without errors
		$this->assertTrue( empty($_ENV['DEDALO_ERRORS']) );

		// expected result as not false
		$this->assertTrue( $response->result!==false );

		// expected result type is integer
		$this->assertTrue( gettype($response->result)==='integer' );

		// expected result is bigger than zero
		$this->assertTrue( $response->result>$section_id );
	}//end test_duplicate



	/**
	* TEST_DELETE
	* @return void
	*/
	public function test_delete() : void {

		$section_id = 2;

		$rqo = json_decode('
			{
				"action": "delete",
				"source": {
					"delete_mode"	: "delete_data",
					"typo"			: "source",
					"type"			: "section",
					"model"			: "section",
					"tipo"			: "test3",
					"section_tipo"	: "test3",
					"section_id"	: '.$section_id.'
				}
			}
		');

		// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' test_delete response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='array',
				'expected response result type is array'
			);

			$this->assertTrue(
				!empty($response->result),
				'expected result is not empty'
			);
	}//end test_delete




	/**
	* TEST_SAVE
	* @return void
	*/
	public function test_save() : void {

		$new_value = ar_random_string();

		$rqo = json_decode('
			{
				"action": "save",
				"source": {
					"typo"			: "source",
					"type"			: "component",
					"model"			: "component_input_text",
					"tipo"			: "test52",
					"section_tipo"	: "test3",
					"section_id"	: "1",
					"lang"			: "'.DEDALO_DATA_LANG.'",
					"mode"			: "edit"
				},
				"data" : {
					"tipo"					: "test52",
					"section_tipo"			: "test3",
					"section_id"			: "1",
					"lang"					: "'.DEDALO_DATA_LANG.'",
					"from_component_tipo"	: "test52",
					"value"					: '.json_encode($new_value).',
					"parent_tipo" 			: "test3",
					"parent_section_id" 	: "1",
					"changed_data": [{
						"action"	: "update",
						"key"		: 0,
						"value"		: "'.reset($new_value).'"
			        }]
				}
			}
		');

		// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' test_save response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='object',
				'expected response result type is object'
			);

			$this->assertTrue(
				!empty($response->result->context),
				'expected result context is not empty'
			);
			$this->assertTrue(
				!empty($response->result->data),
				'expected result data is not empty'
			);
	}//end test_save



	/**
	* TEST_COUNT
	* @return void
	*/
	public function test_count() : void {

		$rqo = json_handler::decode('
			{
				"action": "count",
				"source": {
					"typo"			: "source",
					"type"			: "section",
					"tipo"			: "test3",
					"section_tipo"	: "test3"
				},
				"sqo" : {
					"section_tipo" : ["test3"]
				}
			}
		');

		// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' test_count response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='object',
				'expected response result type is object'
			);

			$this->assertTrue(
				gettype($response->result->total)==='integer',
				'expected result total is integer'
			);
	}//end test_count



	/**
	* TEST_GET_ELEMENT_CONTEXT
	* @return void
	*/
	public function test_get_element_context() : void {

		// component_input_text
			$rqo = json_handler::decode('
				{
					"action": "get_element_context",
					"source": {
						"typo"			: "source",
						"type"			: "section",
						"tipo"			: "test52",
						"section_tipo"	: "test3",
						"section_id"	: "1",
						"mode"			: "edit"
					}
				}
			');

			// direct exec
				$_ENV['DEDALO_ERRORS'] = []; // reset
				$response = dd_core_api::{$rqo->action}($rqo);
					// dump($response, ' test_get_element_context response  1 ++ '.to_string());

				$this->assertTrue(
					empty($_ENV['DEDALO_ERRORS']),
					'expected running without errors'
				);
				if (!empty($_ENV['DEDALO_ERRORS'])) {
					dump($_ENV['DEDALO_ERRORS'], '$_ENV[DEDALO_ERRORS] ++ '.to_string());
				}

				$this->assertTrue(
					$response->result!==false,
					'expected result is not false'
				);

				$this->assertTrue(
					gettype($response->result)==='array',
					'expected response result type is array'
				);

		// section
			$rqo = json_handler::decode('
				{
					"action": "get_element_context",
					"source": {
						"typo"			: "source",
						"type"			: "section",
						"tipo"			: "test3",
						"section_tipo"	: "test3",
						"section_id"	: "1",
						"mode"			: "edit"
					}
				}
			');

			// direct exec
				$_ENV['DEDALO_ERRORS'] = []; // reset
				$response = dd_core_api::{$rqo->action}($rqo);
					// dump($response, ' test_get_element_context response  1 ++ '.to_string());

				$this->assertTrue(
					empty($_ENV['DEDALO_ERRORS']),
					'expected running without errors'
				);
				if (!empty($_ENV['DEDALO_ERRORS'])) {
					dump($_ENV['DEDALO_ERRORS'], '$_ENV[DEDALO_ERRORS] ++ '.to_string());
				}

				$this->assertTrue(
					$response->result!==false,
					'expected result is not false'
				);

				$this->assertTrue(
					gettype($response->result)==='array',
					'expected response result type is array'
				);
	}//end test_get_element_context



	/**
	* TEST_GET_SECTION_ELEMENTS_CONTEXT
	* @return void
	*/
	public function test_get_section_elements_context() : void {

		$rqo = json_handler::decode('
			{
				"action": "get_section_elements_context",
				"source": {
					"typo"			: "source",
					"type"			: "section",
					"section_tipo"	: "test3"
				},
				"options" : {
					"context_type" : "simple",
					"ar_section_tipo" : ["test3"],
					"ar_components_exclude"	: []
				}
			}
		');

		// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' test_get_section_elements_context response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='array',
				'expected response result type is array'
			);
	}//end test_get_section_elements_context



	/**
	* TEST_GET_INDEXATION_GRID
	* @return void
	*/
	public function test_get_indexation_grid() : void {

		$rqo = json_handler::decode('
			{
				"action": "get_indexation_grid",
				"source": {
					"typo"			: "source",
					"section_tipo"	: "test3",
					"section_id"	: "1",
					"tipo"			: "test25",
					"value"			: null
				}
			}
		');

		// $rqo = json_handler::decode('
		// 	{
		// 		"action": "get_indexation_grid",
		// 		"source": {
		// 			"typo"			: "source",
		// 			"section_tipo"	: "ts1",
		// 			"section_id"	: "29",
		// 			"tipo"			: "test25",
		// 			"value"			: null
		// 		}
		// 	}
		// ');

		// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' test_get_indexation_grid response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='array',
				'expected response result type is array'
			);
	}//end test_get_indexation_grid



	/**
	* TEST_GET_RELATION_LIST
	* @return void
	*/
	public function XXX_test_get_relation_list() : void {

		// get_relation_list
		$rqo = json_handler::decode('
			{
			    "action": "read",
			    "source": {
			    	"action" : "get_relation_list",
			        "section_tipo": "test3",
			        "section_id": "1",
			        "tipo": "test138",
			        "mode": "edit",
			        "model": "relation_list"
			    },
			    "sqo": {
			        "section_tipo": [
			            "all"
			        ],
			        "mode": "related",
			        "limit": 10,
			        "offset": 0,
			        "filter_by_locators": [
			            {
			                "section_tipo": "test3",
			                "section_id": "1"
			            }
			        ]
			    }
			}
		');

		// direct exec
			$_ENV['DEDALO_ERRORS'] = []; // reset
			$response = dd_core_api::{$rqo->action}($rqo);
				// dump($response, ' test_get_relation_list response  1 ++ '.to_string());

			$this->assertTrue(
				empty($_ENV['DEDALO_ERRORS']),
				'expected running without errors'
			);

			$this->assertTrue(
				$response->result!==false,
				'expected result is not false'
			);

			$this->assertTrue(
				gettype($response->result)==='object',
				'expected response result type is object'
			);

			$this->assertTrue(
				gettype($response->result->context)==='array',
				'expected response result context type is array'
			);

			$this->assertTrue(
				gettype($response->result->data)==='array',
				'expected response result data type is array'
			);
	}//end test_get_relation_list



	/**
	* TEST_GET_RELATION_LIST
	* @return void
	*/
		// public function test_get_relation_list() : void {

		// 	$rqo = json_handler::decode('
		// 		{
		// 		    "action": "get_relation_list",
		// 		    "source": {
		// 		        "section_tipo": "test3",
		// 		        "section_id": "1",
		// 		        "tipo": "test138",
		// 		        "mode": "edit",
		// 		        "model": "relation_list"
		// 		    },
		// 		    "sqo": {
		// 		        "section_tipo": [
		// 		            "all"
		// 		        ],
		// 		        "mode": "related",
		// 		        "limit": 10,
		// 		        "offset": 0,
		// 		        "filter_by_locators": [
		// 		            {
		// 		                "section_tipo": "test3",
		// 		                "section_id": "1"
		// 		            }
		// 		        ]
		// 		    }
		// 		}
		// 	');

		// 	// direct exec
		// 		$_ENV['DEDALO_ERRORS'] = []; // reset
		// 		$response = dd_core_api::{$rqo->action}($rqo);
		// 			// dump($response, ' test_get_relation_list response  1 ++ '.to_string());

		// 		$this->assertTrue(
		// 			empty($_ENV['DEDALO_ERRORS']),
		// 			'expected running without errors'
		// 		);

		// 		$this->assertTrue(
		// 			$response->result!==false,
		// 			'expected result is not false'
		// 		);

		// 		$this->assertTrue(
		// 			gettype($response->result)==='object',
		// 			'expected response result type is object'
		// 		);

		// 		$this->assertTrue(
		// 			gettype($response->result->context)==='array',
		// 			'expected response result context type is array'
		// 		);

		// 		$this->assertTrue(
		// 			gettype($response->result->data)==='array',
		// 			'expected response result data type is array'
		// 		);
		// }//end test_get_relation_list




}//end class