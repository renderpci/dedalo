<?php

// JSON DOCUMENT
header('Content-Type: application/json');

require_once(dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');

# Write session to unlock session file
session_write_close();


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	$json_params = null;
	if(SHOW_DEBUG===true) {
		$json_params = JSON_PRETTY_PRINT;
	}
	echo json_encode($result, $json_params);
}



/**
* PROCESS_TOPO
* 
*/
function process_topo() {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';

		$section_tipo 		= 'dd1447';
		$component_tipo_in 	= 'dd1450';
		$modelo_name_in		= 'component_input_text';
		$component_tipo_out = 'dd1451';
		$modelo_name_out 	= 'component_autocomplete_hi';

#
		# RECORDS
		# Use actual list search options as base to build current search

			# SEARCH_OPTIONS
				$search_options_id    = $section_tipo; // section tipo like oh1
				$saved_search_options = section_records::get_search_options($search_options_id);

			# SEARCH_QUERY_OBJECT
				# Use saved search options (deep cloned to avoid propagation of changes !)
					// $search_options 	 = unserialize(serialize($saved_search_options));
					// $search_query_object = $search_options->search_query_object;
					// 	$search_query_object->limit  = 0;  // unset limit
					// 	$path = json_decode('										
					// 						{
					// 							"path": [
					// 								{
					// 									"modelo": "component_section_id",
					// 									"component_tipo": "section_id",
					// 									"section_tipo": "dd1447"
					// 								}
					// 							],
					// 							"component_path": [],
					// 							"type": "string"
					// 						}
					// 						');
					// 	$search_query_object->select = [$path]; // unset select

					//fixed
						$sqo = json_decode('
											{
												"id": "dd1447_list",
												"modo": "list",
												"parsed": false,
												"section_tipo": "dd1447",
												"limit": 0,
												"offset": 0,
												"type": "search_json_object",
												"full_count": false,
												"order": false,
												"filter": {
												    "$and": [
																{
																	"q": ">=50000",
																	"q_operator": null,
																"path": [
																			{
																				"section_tipo": "dd1447",
																				"component_tipo": "dd1449",
																				"modelo": "component_section_id"
																			}
																		]
																}
													]
												},
												"select": [
															{
																"path": [
																	{
																		"modelo": "component_section_id",
																		"component_tipo": "section_id",
																		"section_tipo": "dd1447"
																	}
																],
																"component_path": [],
																"type": "string"
															}
												]
											}
										');
						$search_query_object = $sqo;


	
			# SEARCH
				$search_develoment2  = new search_development2($search_query_object);
				$rows_data 		 	 = $search_develoment2->search();

		foreach ($rows_data->ar_records as $key => $row) {

				$section_id = $row->section_id;

				$component_in = component_common::get_instance($modelo_name_in,
																 $component_tipo_in,
																 $section_id,
																 'list',
																 DEDALO_DATA_NOLAN,
															 $section_tipo);

				$dato_origen = $component_in->get_dato();
				// echo($dato[0].PHP_EOL);

				$dato = mb_strtolower($dato_origen[0]);				
				
				$dato = empty(preg_split('/\Arc\W/i', $dato)[0])
					? preg_split('/\Arc\W*/i', $dato)[1] 
					: preg_split('/\Arc\W*/i', $dato)[0];

				$dato = empty(preg_split('/\Ar\Wc\W/i', $dato)[0])
					? preg_split('/\Ar\Wc\W/i', $dato)[1] 
					: preg_split('/\Ar\Wc\W/i', $dato)[0];

				$dato = preg_replace('/\Ar\W\WC\W/i', '$2', $dato);
				$dato = preg_replace('/\Ar\W*\s*civil\W?/i', '$2', $dato);
				$dato = preg_replace('/\ARegistre Civil\W*/i', '$2', $dato);
				$dato = preg_replace('/\AReg\W*Civil\W*/i', '$2', $dato);
				$dato = preg_replace('/\AR\W*Civil\W*/i', '$2', $dato);

				$dato = empty(preg_split('/\A(D|d)e /', $dato)[0])
					? preg_split('/\A(D|d)e /', $dato)[1] 
					: preg_split('/\A(D|d)e /', $dato)[0];

				$dato = preg_replace('/\Ad\W/i', '$2', $dato);

				$dato = preg_split('/\(.*\)/', $dato)[0];
				$dato = preg_split('/,/', $dato)[0];
				$dato = preg_split('/\./', $dato)[0];
				$dato = preg_split('/:/', $dato)[0];
				$dato = preg_split('/_/', $dato)[0];

				$dato = trim($dato);

				echo($section_id."\t".$dato.PHP_EOL);

				// #Query all rows with this section_tipo into the DB
				$strQuery = '
					SELECT mix.section_id,
					mix.section_tipo,
					mix.datos#>>\'{components,hierarchy25,dato,lg-spa}\' as hierarchy25
					FROM matrix_hierarchy AS mix
					WHERE mix.id in (
						SELECT DISTINCT ON(mix.section_id,mix.section_tipo) mix.id FROM matrix_hierarchy AS mix
						WHERE (
						mix.section_tipo=\'es1\' 
						--OR mix.section_tipo=\'fr1\'
						) AND (
						f_unaccent(mix.datos#>>\'{components,hierarchy25,dato}\') ~* f_unaccent(\'.*\[".*'.pg_escape_string($dato).'.*\')
						)
						ORDER BY mix.section_id ASC
						LIMIT 10
					)
					ORDER BY section_id ASC
					LIMIT 10;
				';

					// dump($strQuery, ' strQuery +----+ '.to_string());

				# perform query
				$result = JSON_RecordObj_matrix::search_free($strQuery);

				$match = [];

				while ($row = pg_fetch_assoc($result)) {
					// echo(json_encode($row).PHP_EOL);
					$term = json_decode($row['hierarchy25'])[0];
					// lowecase
					$term = mb_strtolower($term);
					// check
					$sim = similar_text($dato, $term , $percent);

					$element = new stdClass();
					$element->percent = $percent;
					$element->section_id = $row['section_id'];
					$element->section_tipo = $row['section_tipo'];
					// $element = [$percent,$row['section_id'],$row['section_tipo']];

					$match[] = $element;

					// echo "similarity: $sim ($percent %)\t";

					// echo($row['section_id']."\t".$row['section_tipo']."\t".$term.PHP_EOL);
				}

				usort($match, fn($a, $b) => $a->percent < $b->percent);

				// echo('++++++++'.json_encode($match).PHP_EOL);

				$locator = new stdClass;
				$locator->section_id 	= $match[0]->section_id;
				$locator->section_tipo 	= $match[0]->section_tipo;

				$component_out = component_common::get_instance($modelo_name_out,
												 $component_tipo_out,
												 $section_id,
												 'list',
												 DEDALO_DATA_NOLAN,
												 $section_tipo);

				$component_out->set_dato($locator);
				$component_out->save();


				// echo($dato_origen[0]."\t".$dato.PHP_EOL);
		}

	
		// $response->result 	= true;
		// $response->msg 		= 'Removed session sum_total: '.$dato;

		$response->msg = $strQuery;

	


	return (object)$response;
}//end process_topo
