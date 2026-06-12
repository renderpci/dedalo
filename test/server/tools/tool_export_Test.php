<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tool_export_test extends BaseTestCase {



	protected function setUp(): void   {
		parent::setUp();
		// $this->markTestSkipped(
		// 	'Disabled !'
		// );
	}



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
	* GET_EXPORT_GRID_OPTIONS
	* @param string $data_format
	* @return object $grid_options
	*/
	private function get_export_grid_options($data_format) {

		$grid_options = json_handler::decode('
			{
			  "section_tipo": "test3",
			  "model": "section",
			  "data_format": "'.$data_format.'",
			  "ar_ddo_to_export": [
			    {
			      "id": "test3_test102_list_lg-nolan",
			      "tipo": "test102",
			      "section_tipo": "test3",
			      "model": "component_section_id",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>section_id</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test102",
			          "model": "component_section_id",
			          "name": "section_id"
			        }
			      ]
			    },
			    {
			      "id": "test3_test26_list_lg-nolan",
			      "tipo": "test26",
			      "section_tipo": "test3",
			      "model": "component_3d",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>3d</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test26",
			          "model": "component_3d",
			          "name": "3d"
			        }
			      ]
			    },
			    {
			      "id": "test3_test94_list_lg-nolan",
			      "tipo": "test94",
			      "section_tipo": "test3",
			      "model": "component_av",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>av</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test94",
			          "model": "component_av",
			          "name": "av"
			        }
			      ]
			    },
			    {
			      "id": "test3_test88_list_lg-nolan",
			      "tipo": "test88",
			      "section_tipo": "test3",
			      "model": "component_check_box",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>check_box</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test88",
			          "model": "component_check_box",
			          "name": "check_box"
			        }
			      ]
			    },
			    {
			      "id": "test3_test145_list_lg-nolan",
			      "tipo": "test145",
			      "section_tipo": "test3",
			      "model": "component_date",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>date</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test145",
			          "model": "component_date",
			          "name": "date"
			        }
			      ]
			    },
			    {
			      "id": "test3_test208_list_lg-nolan",
			      "tipo": "test208",
			      "section_tipo": "test3",
			      "model": "component_email",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>email</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test208",
			          "model": "component_email",
			          "name": "email"
			        }
			      ]
			    },
			    {
			      "id": "test3_test101_list_lg-nolan",
			      "tipo": "test101",
			      "section_tipo": "test3",
			      "model": "component_filter",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>filter</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test101",
			          "model": "component_filter",
			          "name": "filter"
			        }
			      ]
			    },
			    {
			      "id": "test3_test70_list_lg-nolan",
			      "tipo": "test70",
			      "section_tipo": "test3",
			      "model": "component_filter_master",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>filter_master</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test70",
			          "model": "component_filter_master",
			          "name": "filter_master"
			        }
			      ]
			    },
			    {
			      "id": "test3_test69_list_lg-nolan",
			      "tipo": "test69",
			      "section_tipo": "test3",
			      "model": "component_filter_records",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>filter_records</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test69",
			          "model": "component_filter_records",
			          "name": "filter_records"
			        }
			      ]
			    },
			    {
			      "id": "test3_test100_list_lg-nolan",
			      "tipo": "test100",
			      "section_tipo": "test3",
			      "model": "component_geolocation",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>geolocation</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test100",
			          "model": "component_geolocation",
			          "name": "geolocation"
			        }
			      ]
			    },
			    {
			      "id": "test3_test99_list_lg-nolan",
			      "tipo": "test99",
			      "section_tipo": "test3",
			      "model": "component_image",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>image</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test99",
			          "model": "component_image",
			          "name": "image"
			        }
			      ]
			    },
			    {
			      "id": "test3_test52_list_lg-eng",
			      "tipo": "test52",
			      "section_tipo": "test3",
			      "model": "component_input_text",
			      "parent": "test3",
			      "lang": "lg-eng",
			      "mode": "search",
			      "label": "<mark>input_text</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test52",
			          "model": "component_input_text",
			          "name": "input_text"
			        }
			      ]
			    },
			    {
			      "id": "test3_test68_list_lg-nolan",
			      "tipo": "test68",
			      "section_tipo": "test3",
			      "model": "component_inverse",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>inverse</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test68",
			          "model": "component_inverse",
			          "name": "inverse"
			        }
			      ]
			    },
			    {
			      "id": "test3_test140_list_lg-nolan",
			      "tipo": "test140",
			      "section_tipo": "test3",
			      "model": "component_iri",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>iri</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test140",
			          "model": "component_iri",
			          "name": "iri"
			        }
			      ]
			    },
			    {
			      "id": "test3_test18_list_lg-nolan",
			      "tipo": "test18",
			      "section_tipo": "test3",
			      "model": "component_json",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>json</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test18",
			          "model": "component_json",
			          "name": "json"
			        }
			      ]
			    },
			    {
			      "id": "test3_test211_list_lg-nolan",
			      "tipo": "test211",
			      "section_tipo": "test3",
			      "model": "component_number",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>number</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test211",
			          "model": "component_number",
			          "name": "number"
			        }
			      ]
			    },
			    {
			      "id": "test3_test85_list_lg-nolan",
			      "tipo": "test85",
			      "section_tipo": "test3",
			      "model": "component_pdf",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>pdf</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test85",
			          "model": "component_pdf",
			          "name": "pdf"
			        }
			      ]
			    },
			    {
			      "id": "test3_test80_list_lg-nolan",
			      "tipo": "test80",
			      "section_tipo": "test3",
			      "model": "component_portal",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>portal</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test80",
			          "model": "component_portal",
			          "name": "portal"
			        }
			      ]
			    },
			    {
			      "id": "test3_test92_list_lg-nolan",
			      "tipo": "test92",
			      "section_tipo": "test3",
			      "model": "component_publication",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>publication</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test92",
			          "model": "component_publication",
			          "name": "publication"
			        }
			      ]
			    },
			    {
			      "id": "test3_test87_list_lg-nolan",
			      "tipo": "test87",
			      "section_tipo": "test3",
			      "model": "component_radio_button",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>radio_button</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test87",
			          "model": "component_radio_button",
			          "name": "radio_button"
			        }
			      ]
			    },
			    {
			      "id": "test3_test201_list_lg-nolan",
			      "tipo": "test201",
			      "section_tipo": "test3",
			      "model": "component_relation_children",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>relation_children</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test201",
			          "model": "component_relation_children",
			          "name": "relation_children"
			        }
			      ]
			    },
			    {
			      "id": "test3_test25_list_lg-nolan",
			      "tipo": "test25",
			      "section_tipo": "test3",
			      "model": "component_relation_index",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>relation_index</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test25",
			          "model": "component_relation_index",
			          "name": "relation_index"
			        }
			      ]
			    },
			    {
			      "id": "test3_test169_list_lg-nolan",
			      "tipo": "test169",
			      "section_tipo": "test3",
			      "model": "component_relation_model",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>relation_model</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test169",
			          "model": "component_relation_model",
			          "name": "relation_model"
			        }
			      ]
			    },
			    {
			      "id": "test3_test71_list_lg-nolan",
			      "tipo": "test71",
			      "section_tipo": "test3",
			      "model": "component_relation_parent",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>relation_parent</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test71",
			          "model": "component_relation_parent",
			          "name": "relation_parent"
			        }
			      ]
			    },
			    {
			      "id": "test3_test54_list_lg-nolan",
			      "tipo": "test54",
			      "section_tipo": "test3",
			      "model": "component_relation_related",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>relation_related</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test54",
			          "model": "component_relation_related",
			          "name": "relation_related"
			        }
			      ]
			    },
			    {
			      "id": "test3_test157_list_lg-nolan",
			      "tipo": "test157",
			      "section_tipo": "test3",
			      "model": "component_security_access",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>security_access</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test157",
			          "model": "component_security_access",
			          "name": "security_access"
			        }
			      ]
			    },
			    {
			      "id": "test3_test91_list_lg-nolan",
			      "tipo": "test91",
			      "section_tipo": "test3",
			      "model": "component_select",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>select</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test91",
			          "model": "component_select",
			          "name": "select"
			        }
			      ]
			    },
			    {
			      "id": "test3_test89_list_lg-nolan",
			      "tipo": "test89",
			      "section_tipo": "test3",
			      "model": "component_select_lang",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>select_lang</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test89",
			          "model": "component_select_lang",
			          "name": "select_lang"
			        }
			      ]
			    },
			    {
			      "id": "test3_test177_list_lg-nolan",
			      "tipo": "test177",
			      "section_tipo": "test3",
			      "model": "component_svg",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "<mark>svg</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test177",
			          "model": "component_svg",
			          "name": "svg"
			        }
			      ]
			    },
			    {
			      "id": "test3_test17_list_lg-eng",
			      "tipo": "test17",
			      "section_tipo": "test3",
			      "model": "component_text_area",
			      "parent": "test3",
			      "lang": "lg-eng",
			      "mode": "search",
			      "label": "<mark>text_area</mark>",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "test17",
			          "model": "component_text_area",
			          "name": "text_area"
			        }
			      ]
			    },
			    {
			      "id": "test3_dd200_list_lg-nolan",
			      "tipo": "dd200",
			      "section_tipo": "test3",
			      "model": "component_select",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "Created by user",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "dd200",
			          "model": "component_select",
			          "name": "Created by user"
			        }
			      ]
			    },
			    {
			      "id": "test3_dd199_list_lg-nolan",
			      "tipo": "dd199",
			      "section_tipo": "test3",
			      "model": "component_date",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "Creation date",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "dd199",
			          "model": "component_date",
			          "name": "Creation date"
			        }
			      ]
			    },
			    {
			      "id": "test3_dd197_list_lg-nolan",
			      "tipo": "dd197",
			      "section_tipo": "test3",
			      "model": "component_select",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "Modified by user",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "dd197",
			          "model": "component_select",
			          "name": "Modified by user"
			        }
			      ]
			    },
			    {
			      "id": "test3_dd201_list_lg-nolan",
			      "tipo": "dd201",
			      "section_tipo": "test3",
			      "model": "component_date",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "Modification date",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "dd201",
			          "model": "component_date",
			          "name": "Modification date"
			        }
			      ]
			    },
			    {
			      "id": "test3_dd271_list_lg-nolan",
			      "tipo": "dd271",
			      "section_tipo": "test3",
			      "model": "component_date",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "First publication",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "dd271",
			          "model": "component_date",
			          "name": "First publication"
			        }
			      ]
			    },
			    {
			      "id": "test3_dd1223_list_lg-nolan",
			      "tipo": "dd1223",
			      "section_tipo": "test3",
			      "model": "component_date",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "Last publication",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "dd1223",
			          "model": "component_date",
			          "name": "Last publication"
			        }
			      ]
			    },
			    {
			      "id": "test3_dd1224_list_lg-nolan",
			      "tipo": "dd1224",
			      "section_tipo": "test3",
			      "model": "component_select",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "First publication user",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "dd1224",
			          "model": "component_select",
			          "name": "First publication user"
			        }
			      ]
			    },
			    {
			      "id": "test3_dd1225_list_lg-nolan",
			      "tipo": "dd1225",
			      "section_tipo": "test3",
			      "model": "component_select",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "Last publication user",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "dd1225",
			          "model": "component_select",
			          "name": "Last publication user"
			        }
			      ]
			    },
			    {
			      "id": "test3_dd1596_list_lg-nolan",
			      "tipo": "dd1596",
			      "section_tipo": "test3",
			      "model": "component_inverse",
			      "parent": "test3",
			      "lang": "lg-nolan",
			      "mode": "search",
			      "label": "Relations",
			      "path": [
			        {
			          "section_tipo": "test3",
			          "component_tipo": "dd1596",
			          "model": "component_inverse",
			          "name": "Relations"
			        }
			      ]
			    }
			  ],
			  "sqo": {
			    "section_tipo": [
			      "test3"
			    ],
			    "limit": 1,
			    "offset": 0
			  }
			}
		');


		return $grid_options;
	}//end get_export_grid_options



	/**
	* BUILD_EXPORT_TOOL
	* Instance-level test access: constructs the tool, runs setup() (protected)
	* and optionally injects a small pre-fetched records set. Since setup()
	* forces the 'ALL' limit sentinel (the export serialises the whole
	* selection by design), tests must bound their dataset by injecting
	* $tool_export->records — otherwise every test would export the full
	* test3 section (3000+ records).
	* @param object $options get_export_grid_options() shape
	* @param int|null $records_limit = null
	* @return tool_export
	*/
	private function build_export_tool( object $options, ?int $records_limit=null ) : tool_export {

		$tool_export = new tool_export(null, $options->section_tipo);

		$setup = new ReflectionMethod(tool_export::class, 'setup');
		$setup->invoke($tool_export, (object)[
			'data_format'		=> $options->data_format,
			'breakdown'			=> $options->breakdown ?? 'default',
			'fill_the_gaps'		=> $options->fill_the_gaps ?? true,
			'value_with_parents'=> $options->value_with_parents ?? false,
			'ar_ddo_map'		=> $options->ar_ddo_to_export,
			'sqo'				=> $options->sqo,
			'model'				=> $options->model,
			'section_tipo'		=> $options->section_tipo
		]);

		if ($records_limit!==null) {
			// server-built sqo (does not pass the client gate)
			$records_sqo = json_handler::decode('{"section_tipo":["'.$options->section_tipo.'"],"limit":'.$records_limit.',"offset":0}');
			$sections = sections::get_instance(null, $records_sqo, $options->section_tipo);
			$tool_export->records = $sections->get_data();
		}

		return $tool_export;
	}//end build_export_tool



	/**
	* DRAIN_EXPORT_LINES
	* Collects iterate_export_lines() into the buffered flat-table shape
	* @param tool_export $tool_export
	* @return object {meta, columns, rows, end}
	*/
	private function drain_export_lines( tool_export $tool_export ) : object {

		$export_grid = new stdClass();
			$export_grid->meta		= null;
			$export_grid->columns	= [];
			$export_grid->rows		= [];
			$export_grid->end		= null;

		foreach ($tool_export->iterate_export_lines() as $line) {
			switch ($line->t) {
				case 'meta':	$export_grid->meta		= $line; break;
				case 'col':		$export_grid->columns[]	= $line; break;
				case 'row':		$export_grid->rows[]	= $line; break;
				case 'end':		$export_grid->end		= $line; break;
				default: break;
			}
		}

		return $export_grid;
	}//end drain_export_lines



	/**
	* ASSERT_PROTOCOL_INVARIANTS
	* Shared invariants of the export flat-table protocol:
	* - meta present and first-class
	* - every row cell references a declared column ordinal
	* - end.columns is a permutation of all declared column ordinals
	* - end totals match the emitted lines
	* @param object $export_grid {meta, columns, rows, end}
	* @param string $label
	* @return void
	*/
	private function assert_protocol_invariants( object $export_grid, string $label ) : void {

		$this->assertNotNull($export_grid->meta, "expected meta line ($label)");
		$this->assertSame('meta', $export_grid->meta->t, "($label)");
		$this->assertNotNull($export_grid->end, "expected end line ($label)");

		// declared ordinals
			$declared = [];
			foreach ($export_grid->columns as $col) {
				$this->assertSame('col', $col->t, "($label)");
				$this->assertIsInt($col->i, "($label)");
				$this->assertFalse(isset($declared[$col->i]), "expected unique column ordinal ($label)");
				$declared[$col->i] = true;
			}

		// every cell ordinal declared
			foreach ($export_grid->rows as $row) {
				$this->assertSame('row', $row->t, "($label)");
				foreach ((array)$row->c as $ordinal => $cell_value) {
					$this->assertTrue(
						isset($declared[(int)$ordinal]),
						"expected cell ordinal $ordinal declared by a col line ($label)"
					);
					$this->assertTrue(
						$cell_value===null || is_scalar($cell_value),
						"expected scalar cell ($label)"
					);
				}
			}

		// end.columns permutation-complete
			$end_columns = $export_grid->end->columns;
			sort($end_columns);
			$declared_ordinals = array_keys($declared);
			sort($declared_ordinals);
			$this->assertSame(
				$declared_ordinals,
				$end_columns,
				"expected end.columns to be a permutation of all declared ordinals ($label)"
			);

		// totals
			$this->assertSame(sizeof($export_grid->rows), $export_grid->end->rows, "($label)");
	}//end assert_protocol_invariants



	/**
	* TEST_export_ignores_client_limit
	* The export serialises the WHOLE filtered selection: any client-sent
	* sqo limit/offset (which the API gate clamps anyway) is replaced by the
	* internal 'ALL' sentinel in setup(). Regression guard for the bug where
	* exports silently truncated at DEDALO_SEARCH_CLIENT_MAX_LIMIT rows.
	* @return void
	*/
	public function test_export_ignores_client_limit() {

		$this->user_login();

		// expected total: independent server-built sqo with the 'ALL' sentinel
		// (the same pattern tool_export::get_records uses internally)
			$count_sqo = json_handler::decode('{"section_tipo":["test3"],"limit":"ALL","offset":0}');
			$sections	= sections::get_instance(null, $count_sqo, 'test3');
			$expected_records = $sections->get_data()->row_count();
			$this->assertGreaterThan(
				2,
				$expected_records,
				'fixture guard: test3 must hold more records than the client limit under test'
			);

		// export with a small client limit/offset (simulates the gate-clamped value).
		// Use the full static entry (get_export_grid) and a single ddo column
		// (section_id) to keep the full-section export fast.
			$options = $this->get_export_grid_options('value');
			$options->ar_ddo_to_export = [ $options->ar_ddo_to_export[0] ]; // section_id only
			$options->sqo->limit	= 2;
			$options->sqo->offset	= 5;

			$response = tool_export::get_export_grid( $options );
			$this->assertTrue(gettype($response->result)==='object');

		// the whole selection was exported, ignoring the client limit/offset
			$this->assertSame(
				$expected_records,
				$response->result->end->records,
				'expected the export to serialise ALL records regardless of the client sqo limit'
			);
			$this->assertSame(
				$expected_records,
				sizeof($response->result->rows),
				'expected one row per record in value format'
			);
	}//end test_export_ignores_client_limit



	/**
	* TEST_get_export_grid
	* All three data formats produce a protocol-valid flat table
	* (bounded records set: setup() forces the full selection, see
	* build_export_tool / test_export_ignores_client_limit)
	* @return void
	*/
	public function test_get_export_grid() {

		$this->user_login();

		foreach (['value', 'grid_value', 'dedalo_raw'] as $data_format) {

			$options		= $this->get_export_grid_options($data_format);
			$tool_export	= $this->build_export_tool($options, 3);
			$export_grid	= $this->drain_export_lines($tool_export);

			$this->assert_protocol_invariants($export_grid, $data_format);

			$this->assertNotEmpty($export_grid->columns, "expected columns ($data_format)");
			$this->assertNotEmpty($export_grid->rows, "expected rows ($data_format)");
			$this->assertSame(3, $export_grid->end->records, "expected injected records count ($data_format)");
		}
	}//end test_get_export_grid



	/**
	* TEST_get_export_grid_breakdown_modes
	* grid_value in the three breakdown modes: protocol-valid; rows mode
	* never mints '|n' suffixed columns; columns mode emits exactly one
	* row per record
	* @return void
	*/
	public function test_get_export_grid_breakdown_modes() {

		$this->user_login();

		foreach (['default', 'rows', 'columns'] as $breakdown) {

			$options = $this->get_export_grid_options('grid_value');
			$options->breakdown = $breakdown;

			$tool_export	= $this->build_export_tool($options, 3);
			$export_grid	= $this->drain_export_lines($tool_export);

			$this->assert_protocol_invariants($export_grid, "breakdown:$breakdown");

			$this->assertSame($breakdown, $export_grid->meta->breakdown, "($breakdown)");

			if ($breakdown==='rows') {
				foreach ($export_grid->columns as $col) {
					$this->assertStringNotContainsString(
						'|',
						$col->key,
						'rows mode explodes vertically: no |n suffixed columns expected'
					);
				}
			}

			if ($breakdown==='columns') {
				foreach ($export_grid->rows as $row) {
					$this->assertSame(0, $row->sub, 'columns mode emits one row per record');
				}
			}
		}
	}//end test_get_export_grid_breakdown_modes



	/**
	* TEST_export_value_format_parity
	* The 'value' format cells must equal the legacy component flat value
	* (resolve_value of get_grid_value) for direct (single-path) ddos,
	* modulo the server-side text cleanup that replaced the client one.
	* @return void
	*/
	public function test_export_value_format_parity() {

		$this->user_login();

		$options		= $this->get_export_grid_options('value');
		$tool_export	= $this->build_export_tool($options, 2);
		$export_grid	= $this->drain_export_lines($tool_export);

		// column key => ordinal
			$ordinal_by_key = [];
			foreach ($export_grid->columns as $col) {
				$ordinal_by_key[$col->key] = $col->i;
			}

		// first record row
			$first_row	= $export_grid->rows[0];
			$cells		= (array)$first_row->c;
			$section_id	= $first_row->rec;

		$compared = 0;
		foreach ($options->ar_ddo_to_export as $ddo) {

			// direct components only: multi-path ddos (portals) need the
			// legacy request_config injection to compare, covered by the
			// component-level parity test instead
			if (sizeof($ddo->path) > 1) {
				continue;
			}

			$first_path	= $ddo->path[0];
			$key		= $first_path->section_tipo.'_'.$first_path->component_tipo;
			if (!isset($ordinal_by_key[$key])) {
				continue;
			}

			// legacy reference (same lang/mode resolution as the export)
				$is_translatable	= ontology_node::get_translatable($first_path->component_tipo);
				$component			= component_common::get_instance(
					$first_path->model,
					$first_path->component_tipo,
					$section_id,
					'edit',
					$is_translatable ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN,
					$first_path->section_tipo,
					false
				);
				$component->set_caller('tool_export'); // legacy absolute media URLs
				$legacy_flat = dd_grid_cell_object::resolve_value( $component->get_grid_value() );
				$legacy_flat = export_tabulator::clean_text_value($legacy_flat);

			$export_cell = isset($cells[$ordinal_by_key[$key]])
				? (string)$cells[$ordinal_by_key[$key]]
				: '';

			// accepted deviation: relation components without ddo children
			// produced separator-only strings in the legacy grid; the atoms
			// path produces a clean empty cell instead
				if ($export_cell==='' && trim($legacy_flat, ' |,')==='') {
					continue;
				}

			$this->assertSame(
				$legacy_flat,
				$export_cell,
				"expected value format parity for $key ($first_path->model)"
			);
			$compared++;
		}

		$this->assertGreaterThan(3, $compared, 'expected meaningful direct-ddo coverage');
	}//end test_export_value_format_parity



	/**
	* TEST_export_dedalo_raw_cells
	* dedalo_raw cells must be byte-equal to the legacy get_raw_value
	* encoding ({"dedalo_data":...} / plain int section_id) and the
	* headers must follow the import grammar (tipo / 'section_id')
	* @return void
	*/
	public function test_export_dedalo_raw_cells() {

		$this->user_login();

		$options		= $this->get_export_grid_options('dedalo_raw');
		$tool_export	= $this->build_export_tool($options, 2);
		$export_grid	= $this->drain_export_lines($tool_export);

		$col_by_ordinal = [];
		foreach ($export_grid->columns as $col) {
			$col_by_ordinal[$col->i] = $col;
		}

		$first_row	= $export_grid->rows[0];
		$cells		= (array)$first_row->c;
		$section_id	= $first_row->rec;

		$compared = 0;
		foreach ($cells as $ordinal => $cell_value) {

			$col		= $col_by_ordinal[(int)$ordinal];
			$first_path	= null;
			foreach ($options->ar_ddo_to_export as $ddo) {
				$fp = $ddo->path[0];
				if ($fp->section_tipo.'_'.$fp->component_tipo === $col->key) {
					$first_path = $fp;
					break;
				}
			}
			if ($first_path===null) {
				continue;
			}

			// legacy reference
				$is_translatable	= ontology_node::get_translatable($first_path->component_tipo);
				$component			= component_common::get_instance(
					$first_path->model,
					$first_path->component_tipo,
					$section_id,
					'edit',
					$is_translatable ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN,
					$first_path->section_tipo,
					false
				);
				$legacy_raw = $component->get_raw_value();

			if ($col->label==='section_id') {
				// plain int (record key on re-import)
					$this->assertIsInt($cell_value, "expected int section_id cell");
			}else{
				// byte-equal pre-encoded string + import grammar header (tipo)
					$this->assertSame(
						json_encode($legacy_raw->value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
						$cell_value,
						"expected raw byte parity for $col->key"
					);
					$this->assertSame(
						$first_path->component_tipo,
						$col->label,
						'expected raw header = component tipo (import grammar)'
					);
			}
			$compared++;
		}

		$this->assertGreaterThan(3, $compared, 'expected meaningful raw coverage');
	}//end test_export_dedalo_raw_cells



	/**
	* TEST_value_with_parents_per_ddo
	* The 'export parents' option is honored per export column: the per-ddo
	* flag (current_ddo->value_with_parents, per-component checkbox) enables
	* the ancestor chain for that column only; the global option (setup
	* value_with_parents, general checkbox) enables it for every column.
	* Uses a synthetic row (relation data injected, no DB writes) whose
	* portal locator targets test3 record 1, which has parents (test71).
	* @return void
	*/
	public function test_value_with_parents_per_ddo() {

		$this->user_login();

		// fixture: seed a resolvable thesaurus term (test3 thesaurus.term =
		// test52) on every record of record 1 CURRENT parent chain (lifecycle
		// tests rewrite the parent locator across runs), then bust the ts
		// session term cache (earlier tests may have cached empty values)
			$ar_parents = component_relation_parent::get_parents_recursive(1, 'test3');
			$this->assertNotEmpty($ar_parents, 'fixture guard: test3 record 1 must have parents (test71)');
			foreach ($ar_parents as $parent_locator) {
				$term_component = component_common::get_instance(
					'component_input_text', 'test52', (string)$parent_locator->section_id,
					'edit', DEDALO_DATA_LANG, 'test3', false
				);
				if (empty($term_component->get_data())) {
					$term_component->set_data(['Parent term ' . $parent_locator->section_id]);
					$this->assertNotFalse($term_component->Save(), 'fixture seed: failed saving the parent term');
				}
			}
			ts_object::$term_by_locator_data_cache = [];

		// export column: portal (test80) resolving the target section_id (test102)
			$build_portal_ddo = function(bool $with_parents) : object {
				$ddo = json_handler::decode('{
					"id": "test3_test80_test3_test102_list_lg-nolan",
					"tipo": "test80",
					"section_tipo": "test3",
					"model": "component_portal",
					"parent": "test3",
					"lang": "lg-nolan",
					"label": "Portal",
					"path": [
						{"section_tipo":"test3","component_tipo":"test80","model":"component_portal","name":"Portal"},
						{"section_tipo":"test3","component_tipo":"test102","model":"component_section_id","name":"Id"}
					]
				}');
				if ($with_parents) {
					$ddo->value_with_parents = true;
				}
				return $ddo;
			};

		// synthetic row: host record 2 (NOT 1: autoreference locators are
		// dropped) with the portal locator injected as row relation data
			$row = (object)[
				'section_tipo'	=> 'test3',
				'section_id'	=> 2,
				'relation'		=> (object)[
					'test80' => [ (object)['section_tipo'=>'test3', 'section_id'=>'1'] ]
				]
			];

		// helper: run get_record_atoms and collect the parents atoms
			$get_parents_atoms = function(object $options_tpl, object $ddo, object $row) : array {
				$options = clone $options_tpl;
				$options->ar_ddo_to_export = [$ddo];
				$tool_export = $this->build_export_tool($options);
				$get_record_atoms = new ReflectionMethod(tool_export::class, 'get_record_atoms');
				$ar_entries = $get_record_atoms->invoke($tool_export, $options->ar_ddo_to_export, $row);
				$this->assertCount(1, $ar_entries);
				return array_values(array_filter($ar_entries[0]->value->atoms, function($atom){
					return $atom->get_leaf_segment()->sub_id==='parents';
				}));
			};

		$options_tpl = $this->get_export_grid_options('value');

		// per-ddo flag ON (global off): parents atoms present
			$parents_on = $get_parents_atoms($options_tpl, $build_portal_ddo(true), $row);
			$this->assertNotEmpty($parents_on, 'expected parents atoms with the per-ddo flag on');

		// per-ddo flag OFF and global OFF (defaults): no parents atoms
			$parents_off = $get_parents_atoms($options_tpl, $build_portal_ddo(false), $row);
			$this->assertSame([], $parents_off, 'expected NO parents atoms with both flags off');

		// global ON, per-ddo absent: parents atoms present (general checkbox)
			$options_global = clone $options_tpl;
			$options_global->value_with_parents = true;
			$parents_global = $get_parents_atoms($options_global, $build_portal_ddo(false), $row);
			$this->assertNotEmpty($parents_global, 'expected parents atoms with the global flag on');

		// same chain in both enabled variants
			$this->assertSame(
				array_map(fn($a) => $a->value, $parents_on),
				array_map(fn($a) => $a->value, $parents_global)
			);
	}//end test_value_with_parents_per_ddo



	/**
	* TEST_iterate_export_lines_order
	* The generator yields meta first, then col/row lines (every col
	* before any row that uses it), end last
	* @return void
	*/
	public function test_iterate_export_lines_order() {

		$this->user_login();

		$options		= $this->get_export_grid_options('grid_value');
		$tool_export	= $this->build_export_tool($options, 2);

		// setup() must have replaced the client limit/offset with the
		// internal full-selection sentinel (regression guard)
			$this->assertSame('ALL', $tool_export->sqo->limit, 'expected setup() to force the ALL sentinel');
			$this->assertSame(0, $tool_export->sqo->offset, 'expected setup() to reset the offset');

		$seen_meta	= false;
		$seen_end	= false;
		$declared	= [];
		$line_count	= 0;
		foreach ($tool_export->iterate_export_lines() as $line) {
			$line_count++;
			$this->assertFalse($seen_end, 'no lines after end');
			switch ($line->t) {
				case 'meta':
					$this->assertSame(1, $line_count, 'meta must be the first line');
					$seen_meta = true;
					break;
				case 'col':
					$declared[$line->i] = true;
					break;
				case 'row':
					$this->assertTrue($seen_meta);
					foreach ((array)$line->c as $ordinal => $v) {
						$this->assertTrue(
							isset($declared[(int)$ordinal]),
							'every col line must precede the rows that use it'
						);
					}
					break;
				case 'end':
					$seen_end = true;
					break;
			}
		}
		$this->assertTrue($seen_meta && $seen_end, 'expected complete protocol stream');
	}//end test_iterate_export_lines_order







}//end class tool_export_Test
