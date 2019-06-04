<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* GET_DATUM
* @param $json_data
*/
function get_datum($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('section_tipo','section_id','mode');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);			
		}

	$datum = json_decode('{
	  "context": [
	    {
	      "type": "section_info",
	      "section_tipo": "numisdata3",
	      "section_label": "Types",
	      "modo": "list"
	    },
	    {
	      "type": "component_info",
	      "tipo": "numisdata27",
	      "model": "component_input_text",
	      "label": "Number",
	      "section_tipo": "numisdata3",
	      "lang": "lg-nolan",
	      "translatable": false,
	      "properties": {
	        "css": {
	          ".wrap_component": {
	            "mixin": [
	              ".vertical"
	            ],
	            "style": {
	              "width": "25%"
	            }
	          }
	        }
	      },
	      "parent": "numisdata25",
	      "related": []
	    },
	    {
	      "type": "component_info",
	      "tipo": "numisdata77",
	      "model": "component_select",
	      "label": "Coins",
	      "section_tipo": "numisdata3",
	      "lang": "lg-nolan",
	      "translatable": false,
	      "properties": {
	        "source": {
	          "mode": "external",
	          "section_to_search": [
	            "numisdata4"
	          ],
	          "component_to_search": [
	            "numisdata161"
	          ],
	          "data_from_field": [
	            "numisdata36"
	          ]
	        },
	        "edit_view": "view_mosaic",
	        "max_records": 9,
	        "css": {
	          ".wrap_component": {
	            "mixin": [
	              ".vertical",
	              ".line_top"
	            ],
	            "style": {
	              "width": "100%"
	            }
	          },
	          ">.content_data >.portal_section >.mosaic_ul >.mosaic_li": {
	            "style": {
	              "border-left": "solid 1px #dedede",
	              "border-top": "solid 1px #dedede",
	              "width": "33.33%",
	              "height": "160px"
	            }
	          },
	          ">.content_data >.portal_section >.mosaic_ul >.mosaic_li >.mosaic_item": {
	            "style": {
	              "width": "50%",
	              "height": "100%"
	            }
	          },
	          ".css_button_generic >span": {
	            "style": {
	              "display": "none"
	            }
	          },
	          ">.content_data >.portal_section >.mosaic_ul >.mosaic_li >.mosaic_item .div_image_portal_list_view_mosaic": {
	            "style": {
	              "background-size": "contain",
	              "background-color": "#ffffff",
	              "height": "160px"
	            }
	          }
	        }
	      },
	      "parent": "numisdata74",
	      "related": [
	        "numisdata4",
	        "numisdata164",
	        "numisdata165",
	        "numisdata154",
	        "numisdata197"
	      ],
	      "related_list": [
	        "numisdata164",
	        "numisdata165"
	      ]
	    },
	    {
	      "type": "component_info",
	      "tipo": "numisdata164",
	      "model": "component_select",
	      "label": "Obverse",
	      "section_tipo": "numisdata4",
	      "lang": "lg-nolan",
	      "translatable": false,
	      "properties": {
	        "dragable_connectWith": "numisdata165",
	        "ar_tools_name": {
	          "tool_import_files": {
	            "target_component": "rsc29",
	            "layout_map": [
	              "rsc52",
	              "rsc31",
	              "rsc23"
	            ],
	            "target_date": "rsc44"
	          }
	        },
	        "edit_view": "view_mosaic",
	        "portal_link_open": false,
	        "css": {
	          ".wrap_component": {
	            "mixin": [
	              ".vertical",
	              ".line_top"
	            ],
	            "style": {
	              "width": "25%"
	            }
	          },
	          ".mosaic_ul": {
	            "style": {
	              "overflow": "auto",
	              "height": "160px"
	            }
	          },
	          ".css_button_generic > span": {
	            "style": {
	              "display": "none"
	            }
	          }
	        }
	      },
	      "parent": "numisdata129",
	      "related": [
	        "rsc170",
	        "rsc29"
	      ],
	      "related_list": [
	        "rsc29"
	      ]
	    },
	    {
	      "type": "component_info",
	      "tipo": "rsc29",
	      "model": "component_input_text",
	      "label": "Image",
	      "section_tipo": "rsc170",
	      "lang": "lg-nolan",
	      "translatable": false,
	      "properties": {
	        "max_items_folder": 1000,
	        "aditional_path": "rsc33",
	        "image_id": "rsc34",
	        "target_filename": "rsc398",
	        "external_source": "rsc496",
	        "state": {
	          "edit_tool": [
	            {
	              "section_tipo": "dd90",
	              "section_id": 1,
	              "component_tipo": "dd127"
	            }
	          ]
	        },
	        "css": {
	          ".wrap_component": {
	            "mixin": [
	              ".vertical",
	              ".width_50"
	            ],
	            "style": {}
	          }
	        }
	      },
	      "parent": "rsc6",
	      "related": [
	        "rsc30"
	      ]
	    },
	    {
	      "type": "component_info",
	      "tipo": "numisdata165",
	      "model": "component_select",
	      "label": "Reverse",
	      "section_tipo": "numisdata4",
	      "lang": "lg-nolan",
	      "translatable": false,
	      "properties": {
	        "dragable_connectWith": "numisdata164",
	        "ar_tools_name": {
	          "tool_import_files": {
	            "target_component": "rsc29",
	            "layout_map": [
	              "rsc52",
	              "rsc31",
	              "rsc23"
	            ],
	            "target_date": "rsc44"
	          }
	        },
	        "edit_view": "view_mosaic",
	        "portal_link_open": false,
	        "css": {
	          ".wrap_component": {
	            "mixin": [
	              ".vertical",
	              ".line_top"
	            ],
	            "style": {
	              "width": "25%"
	            }
	          },
	          ".mosaic_ul": {
	            "style": {
	              "overflow": "auto",
	              "height": "160px"
	            }
	          },
	          ".css_button_generic > span": {
	            "style": {
	              "display": "none"
	            }
	          }
	        }
	      },
	      "parent": "numisdata129",
	      "related": [
	        "rsc170",
	        "rsc29"
	      ],
	      "related_list": [
	        "rsc29"
	      ]
	    }
	  ],
	  "data": [
	    {
	      "section_id": "24",
	      "tipo": "numisdata27",
	      "from_component_tipo": "numisdata27",
	      "section_tipo": "numisdata3",
	      "value": [
	        "24"
	      ]
	    },
	    {
	      "section_id": "569",
	      "tipo": "rsc29",
	      "from_component_tipo": "numisdata164",
	      "from_section_tipo": "numisdata4",
	      "section_tipo": "rsc170",
	      "value": [
	        {
	          "url": "/dedalo/media_test/media_development/image/1.5MB/0/rsc29_rsc170_569.jpg",
	          "quality": "1.5MB"
	        }
	      ]
	    },
	    {
	      "section_id": "1",
	      "tipo": "numisdata164",
	      "from_component_tipo": "numisdata77",
	      "section_tipo": "numisdata4",
	      "model": "component_select",
	      "value": {
	        "type": "dd151",
	        "section_id": "569",
	        "section_tipo": "rsc170",
	        "from_component_tipo": "numisdata164"
	      }
	    },
	    {
	      "section_id": "568",
	      "tipo": "rsc29",
	      "from_component_tipo": "numisdata165",
	      "from_section_tipo": "numisdata4",
	      "section_tipo": "rsc170",
	      "value": [
	        {
	          "url": "/dedalo/media_test/media_development/image/1.5MB/0/rsc29_rsc170_568.jpg",
	          "quality": "1.5MB"
	        }
	      ]
	    },
	    {
	      "section_id": "1",
	      "tipo": "numisdata165",
	      "from_component_tipo": "numisdata77",
	      "section_tipo": "numisdata4",
	      "model": "component_select",
	      "value": {
	        "type": "dd151",
	        "section_id": "568",
	        "section_tipo": "rsc170",
	        "from_component_tipo": "numisdata165"
	      }
	    },
	    {
	      "section_id": "24",
	      "tipo": "numisdata77",
	      "from_component_tipo": "numisdata77",
	      "section_tipo": "numisdata3",
	      "model": "component_select",
	      "value": {
	        "type": "dd151",
	        "section_id": "1",
	        "section_tipo": "numisdata4",
	        "from_component_tipo": "numisdata77"
	      }
	    },
	    {
	      "section_id": "25",
	      "tipo": "numisdata27",
	      "from_component_tipo": "numisdata27",
	      "section_tipo": "numisdata3",
	      "value": [
	        "25"
	      ]
	    },
	    {
	      "section_id": "237",
	      "tipo": "rsc29",
	      "from_component_tipo": "numisdata164",
	      "from_section_tipo": "numisdata4",
	      "section_tipo": "rsc170",
	      "value": [
	        {
	          "url": "/dedalo/media_test/media_development/image/1.5MB/0/rsc29_rsc170_237.jpg",
	          "quality": "1.5MB"
	        }
	      ]
	    },
	    {
	      "section_id": "2",
	      "tipo": "numisdata164",
	      "from_component_tipo": "numisdata77",
	      "section_tipo": "numisdata4",
	      "model": "component_select",
	      "value": {
	        "type": "dd151",
	        "section_id": "237",
	        "section_tipo": "rsc170",
	        "from_component_tipo": "numisdata164"
	      }
	    },
	    {
	      "section_id": "638",
	      "tipo": "rsc29",
	      "from_component_tipo": "numisdata165",
	      "from_section_tipo": "numisdata4",
	      "section_tipo": "rsc170",
	      "value": [
	        {
	          "url": "/dedalo/media_test/media_development/image/1.5MB/0/rsc29_rsc170_638.jpg",
	          "quality": "1.5MB"
	        }
	      ]
	    },
	    {
	      "section_id": "2",
	      "tipo": "numisdata165",
	      "from_component_tipo": "numisdata77",
	      "section_tipo": "numisdata4",
	      "model": "component_select",
	      "value": {
	        "type": "dd151",
	        "section_id": "638",
	        "section_tipo": "rsc170",
	        "from_component_tipo": "numisdata165"
	      }
	    },
	    {
	      "section_id": "25",
	      "tipo": "numisdata77",
	      "from_component_tipo": "numisdata77",
	      "section_tipo": "numisdata3",
	      "model": "component_select",
	      "value": {
	        "type": "dd151",
	        "section_id": "2",
	        "section_tipo": "numisdata4",
	        "from_component_tipo": "numisdata77"
	      }
	    }
	  ]}');

	
	$search_query_object = [
		'id' 			=> 'get_datum',
		'section_tipo' 	=> $section_tipo,
		'limit' 		=> 10000,
		'order' 		=> null,
		'offset' 		=> 0,
		'full_count' 	=> false,
		'filter'		=> null,
		'select'		=> null
	];
	#dump($search_query_object, ' search_query_object ++ '.to_string());

	$search_development2 = new search_development2($search_query_object);
	$rows_data 		 	 = $search_development2->search();
		#dump($rows_data, ' rows_data ++ '.to_string()); die();

	$ar_list_map = new stdClass();
		$ar_list_map->oh1 = [			
			[
				'tipo' 	=> "oh14",
				'model' => "component_input_text",
				'modo' 	=> "list"
			],
			[
				'tipo' 	=> "oh16",
				'model' => "component_input_text",
				'modo' 	=> "list"
			],
			[
				'tipo' 	=> "oh24",
				'model' => "component_portal",
				'modo' 	=> "list"
			]
		];	
	$datum = section::build_json_rows($rows_data, 'list', $ar_list_map);

	// response
		$response->result 	= $datum;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	// Debug
		if(SHOW_DEBUG===true) {

			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}
			$response->debug = $debug;
		}
	
	return (object)$response;
}//end get_datum

