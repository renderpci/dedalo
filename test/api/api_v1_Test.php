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


final class api_v1_test extends TestCase {



	protected function setUp(): void   {
		// $this->markTestSkipped(
		// 	'Disabled !'
		// );
	}



	/**
	* TEST_START
	* @return void
	*/
	public function test_start(): void {

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

		// rqo valid
			$rqo = json_decode('
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

			$context	= $response->result->context;
			$data		= $response->result->data;

			// check format. Expected array for data and context
				$this->assertTrue( gettype($context)==='array' );
				$this->assertTrue( gettype($data)==='array' );
				$this->assertTrue( count($data)>0 );
				// expected running without errors
				$this->assertTrue( empty($_ENV['DEDALO_ERRORS']) );

		// rqo invalid tipo
			// $rqo = json_decode('
			// 	{
			// 		"action": "read",
			// 		"source": {
			// 			"typo": "source",
			// 			"type": "section",
			// 			"action": "search",
			// 			"model": "section",
			// 			"tipo": "x96wTrsc167pR7",
			// 			"section_tipo": "x96wTrsc167pR7k3",
			// 			"section_id": null,
			// 			"mode": "edit",
			// 			"view": null,
			// 			"lang": "lg-eng"
			// 		},
			// 		"sqo": {
			// 			"section_tipo": [
			// 				"x96wTrsc167pR7k3"
			// 			],
			// 			"limit": 1,
			// 			"offset": 0,
			// 			"select": [],
			// 			"full_count": false
			// 		}
			// 	}
			// ');
			// $_ENV['DEDALO_ERRORS'] = []; // reset
			// $response = dd_core_api::read($rqo);
			// 	// dump($_ENV['DEDALO_ERRORS'], ' DEDALO_ERRORS ++ '.to_string());
			// 	// dump($response, ' response ++ '.to_string());
			// $context	= $response->result->context;
			// $data		= $response->result->data;

			// // check format. Expected array for data and context
			// 	$this->assertTrue( gettype($context)==='array' );
			// 	$this->assertTrue( gettype($data)==='array' );
			// 	$this->assertTrue( count($data)===0 );
			// 	// expected running with errors
			// 	$this->assertTrue( !empty($_ENV['DEDALO_ERRORS']) );
	}//end test_read



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




}//end class
