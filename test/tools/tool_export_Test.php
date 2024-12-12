<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class tool_export_Test extends TestCase {



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
	* TEST_get_export_grid
	* @return void
	*/
	public function test_get_export_grid() {

		// value (standard)
			$options	= $this->get_export_grid_options('value');
			$response	= tool_export::get_export_grid( $options );

			$this->assertTrue(
				gettype($response)==='object',
				'expected gettype result is object'
					.' and is : '.gettype($response)
			);

			$this->assertTrue(
				gettype($response->result)==='array',
				'expected gettype result is array'
					.' and is : '.gettype($response->result)
			);

		// grid_value (Break down)
			$options	= $this->get_export_grid_options('grid_value');
			$response	= tool_export::get_export_grid( $options );

			$this->assertTrue(
				gettype($response)==='object',
				'expected gettype result is object'
					.' and is : '.gettype($response)
			);

			$this->assertTrue(
				gettype($response->result)==='array',
				'expected gettype result is array'
					.' and is : '.gettype($response->result)
			);

		// dedalo_raw
			$options	= $this->get_export_grid_options('dedalo_raw');
			$response	= tool_export::get_export_grid( $options );

			$this->assertTrue(
				gettype($response)==='object',
				'expected gettype result is object'
					.' and is : '.gettype($response)
			);

			$this->assertTrue(
				gettype($response->result)==='array',
				'expected gettype result is array'
					.' and is : '.gettype($response->result)
			);
	}//end test_get_export_grid







}//end class tool_export_Test
