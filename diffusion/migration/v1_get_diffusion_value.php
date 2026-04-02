<?php

use PhpParser\Node\Stmt\Switch_;

function get_diffusion_value($tipo, $model, $custom_arguments, $process_dato_arguments, $output, $data_to_be_used, $option_obj, $ddo_map){

	$process = new stdClass();

	switch($model){
		case 'component_3d':
		case 'component_av':
		case 'component_image':
		case 'component_pdf':
		case 'component_svg':

			$parser_process = (object)[
				"output_format" => "string"
			];

			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "/dedalo/media/image.jpg";

			break;
		case 'component_check_box':

			$fields_separator = $custom_arguments[0]->divisor ??', ';

			$related_component = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'component_','related', false);
			$related_section = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'section','related', true);
			$letter_ids = [];
			if (!empty($related_section)) {

				$letter_ids = [];
				foreach ($related_component as $i => $component_tipo) {
					$letter_id = chr(ord('a') + $i);
					$letter_ids[] = $letter_id;
					$ddo_map[] = (object)[
						'id' => $letter_id,
						'tipo' => $component_tipo,
						'parent' => $tipo,
						'section_tipo' => $related_section[0]
					]; 
				}
			}

			$parser_process = (object)[					
				'parser' => [
					(object)[
						'fn' => 'parser_text::text_format',
						'options' => (object)[
							'pattern' => implode($fields_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids))
						]
					]
				],
				"output_format" => "string"
			];
			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "Goméz Pérez, Raspa";

			break;
		case 'component_date':

			$date_mode = component_date::get_date_mode_static($tipo);

			$parser_process = (object)[					
				'parser' => [
					(object)[
						'fn' => 'parser_date::default',
						'options' => (object)[
							'date_mode' => $date_mode
						]
					]
				],
				"output_format" => "string"
			];

			$process = $parser_process;

			if(isset($output) && $output==='merged'){
				$process->output_format = "json";
			}else{
				$process->output_format = "string";
			}
			
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "2026-02-26 19:39:16";

			break;
		case 'component_dataframe':
			break;
		case 'component_email':

			$fields_separator =', ';
			$records_separator =' | ';

			$parser_process = (object)[
				"output_format" => "string"
			];

			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "raspa@dedalo.dev | boss@dedalo.dev";

			break;
		case 'component_external':
			break;
		case 'component_filter':

			$records_separator =' | ';

			$ddo_map[] = (object)[
				'tipo' => DEDALO_PROJECTS_NAME_TIPO,
				'parent' => $tipo,
				'section_tipo' => DEDALO_SECTION_PROJECTS_TIPO
			];			

			$parser_process = (object)[					
				"output_format" => "string"
			];
			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "My project | Another project";
			break;
		case 'component_geolocation':

			$parser_process = (object)[					
				'parser' => [
					(object)[
						'fn' => 'parser_helper::get_first',
					]
				],
				"output_format" => "json"
			];

			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = ["lat"=> 41.3851, "long"=> 2.1734];
			break;

		case 'component_info':
			$records_separator =', ';

			$arguments = $custom_arguments[0];

			$options = new stdClass();
			if($arguments->separator){
				$options->records_separator = $arguments->separator ?? $records_separator;
			}
			if($arguments->key_values){
				$options->keys = $arguments->key_values;
			}

			$parser_process = (object)[		
				'fn' => 'component_info::get_data_parsed',			
				'parser' => [
					(object)[
						'fn' => 'parser_info::default',
						'options' => $options
					]
				],
				"output_format" => "string"
			];
			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "1 year, 2 months, 3 days";
			
			break;
		case 'component_input_text':
			$records_separator =' | ';
			// nothing to do, the default proceess is compatible with the v6
			break;
		case 'component_inverse':
			break;
		case 'component_iri':
			$fields_separator =', ';							
			$records_separator =' | ';

			$parser_process = (object)[					
				'parser' => [
					(object)[
						'fn' => 'parser_iri::flat',
						'options' => (object)[]
					]
				],
				"output_format" => "string"
			];
			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "dedalo.dev, https://dedalo.dev";
			
			break;
		case 'component_json':

			$parser_process = (object)[
				"output_format" => "json"
			];

			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "{\"key\":\"value\"}";
			break;
		case 'component_number':

			$parser_process = (object)[
				'parser' => [
					(object)[
						'fn' => 'parser_helper::get_first'
					]
				],
				"output_format" => "string"
			];

			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "123";
			break;
		case 'component_portal':

			switch($data_to_be_used){
				case 'valor_list':
					$fields_separator = $custom_arguments[0]->divisor ??' ';
					$records_separator =' | ';
											
					$related_component = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'component_','related', false);
					$related_section = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'section','related', true);
					if (!empty($related_section)) {

						$letter_ids = [];
						foreach ($related_component as $i => $component_tipo) {
							$letter_id = chr(ord('a') + $i);
							$letter_ids[] = $letter_id;
							$ddo_map[] = (object)[
								'id' => $letter_id,
								'tipo' => $component_tipo,
								'parent' => $tipo,
								'section_tipo' => $related_section[0]
							]; 
						}
					}

					$parser_process = (object)[					
						'parser' => [
							(object)[
								'fn' => 'parser_text::text_format',
								'options' => (object)[
									'pattern' => implode($fields_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids))
								]
							]
						],
						"output_format" => "string"
					];
					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = "Goméz Pérez, Raspa";
					break;
				case 'valor':
					$fields_separator = $custom_arguments[0]->divisor ??', ';
					$records_separator =' | ';
											
					$related_component = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'component_','related', false);
					$related_section = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'section','related', true);
					if (!empty($related_section)) {

						$letter_ids = [];
						foreach ($related_component as $i => $component_tipo) {
							$letter_id = chr(ord('a') + $i);
							$letter_ids[] = $letter_id;
							$ddo_map[] = (object)[
								'id' => $letter_id,
								'tipo' => $component_tipo,
								'parent' => $tipo,
								'section_tipo' => $related_section[0]
							]; 
						}
					}

					$parser_process = (object)[					
						'parser' => [
							(object)[
								'fn' => 'parser_text::text_format',
								'options' => (object)[
									'pattern' => implode($fields_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids))
								]
							]
						],
						"output_format" => "string"
					];
					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = "Goméz Pérez, Raspa";
					break;
				case 'dato_full':
					$parser_process = (object)[
						"output_format" => "json"
					];

					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = '[{"section_id":"1", "section_tipo":"rsc197"}, {"section_id":"2", "section_tipo":"rsc197"}]';
					break;
				case 'dato':
				default:
					$parser_process = (object)[
						"parser" => [
							(object)[
								'fn' => 'parser_locator::get_section_id'
							]
						],
						"output_format" => "json"
					];

					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = ["1", "2"];
					break;
			}
			break;
		case 'component_autocomplete':
			// @TODO: the exception is_publicable is not handled here!! check if it is needed
			$fields_separator = $custom_arguments[0]->divisor ??' ';
			$records_separator =' | ';

			$ontology_node = ontology_node::get_instance($tipo);
			$properties = $ontology_node->get_properties();

			$show = $properties->source->request_config[0]->show ?? null;
			if(!empty($show)) {
				$deep_ddo = [];
				foreach ($show->ddo_map as $ddo) {
					$model = ontology_node::get_model_by_tipo($ddo->tipo);
					if($model === 'component_dataframe'){
						continue;
					}
					if($ddo->parent === 'self') {
						$ddo->parent = $tipo;
					}
					$deep_ddo[] = $ddo;
				}

				$letter_ids = [];
				foreach ($deep_ddo as $i => $ddo) {					

					$children = array_find($deep_ddo, fn($ddo) => $ddo->parent === $ddo->tipo);

					if(empty($children)) {

						$letter_id = chr(ord('a') + $i);
						$letter_ids[] = $letter_id;

						$ddo_map[] = (object)[
							'id' => $letter_id,
							'tipo' => $ddo->tipo,
							'parent' => $ddo->parent
						];
					}else{
						$ddo_map[] = (object)[
							'tipo' => $ddo->tipo,
							'parent' => $ddo->parent
						];

					}
				}
			}else{		
				$related_component = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'component_','related', false);
				$related_section = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'section','related', true);
				if (!empty($related_section)) {

					$letter_ids = [];
					foreach ($related_component as $i => $component_tipo) {
						$letter_id = chr(ord('a') + $i);
						$letter_ids[] = $letter_id;
						$ddo_map[] = (object)[
							'id' => $letter_id,
							'tipo' => $component_tipo,
							'parent' => $tipo,
							'section_tipo' => $related_section[0]
						]; 
					}
				}
			}

			$parser_process = (object)[					
				'parser' => [
					(object)[
						'fn' => 'parser_text::text_format',
						'options' => (object)[
							'pattern' => implode($fields_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids))
						]
					]
				],
				"output_format" => "string"
			];
			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "Goméz Pérez, Raspa";
			
			break;
		case 'component_autocomplete_hi':
		case 'component_autocomplete_ts':
			$fields_separator =' - ';
			$records_separator =', ';
			
			if($option_obj || $custom_arguments) {
				$option_obj = $option_obj ?? new stdClass();

				$add_parents 					= $option_obj->add_parents ?? null;
				$parent_section_tipo 			= $option_obj->parent_section_tipo ?? null;
				$process_dato_arguments 		= $option_obj->process_dato_arguments ?? null;
				$check_publishable 				= $option_obj->check_publishable ?? null;
				
				$custom_parents = $option_obj->custom_parents ?? null;
				if (!$custom_parents && isset($custom_arguments)) {
					$first_custom_arg = is_array($custom_arguments) ? ($custom_arguments[0] ?? null) : $custom_arguments;
					$custom_parents = $first_custom_arg->custom_parents ?? null;
				}

				$divisor 						= $option_obj->divisor ?? null;
				$parent_term_id 				= $option_obj->parent_term_id ?? null;
				$divisor_parents 				= $option_obj->divisor_parents ?? null;
				$records_separator 				= $option_obj->records_separator ?? null;
				
				// 1.1 "add_parents" alone and true or false
				if( isset($add_parents) 
					&& $parent_section_tipo === null
					&& $process_dato_arguments === null
					&& $check_publishable === null
					&& $custom_parents === null								
					&& $parent_term_id === null								
					) {
					
					$parser_process = (object)[
						'fn' => 'add_parents',
						'parser' => [
							(object)[
								'fn' => 'parser_locator::parents',
								'options' => (object)[
									'value' => 'term',
									"include_parents" => $add_parents,
									'fields_separator' => $divisor ?? ' - ',
									'records_separator' => $divisor_parents ?? $records_separator ?? ', '
								]
							]
						],
						'output_format' => 'string'							
					];
					$process = $parser_process;
					if(!empty($ddo_map)){
						unset($parser_process->fn);
						$ddo_map[count($ddo_map)-1]->fn='add_parents';
						$process->ddo_map = $ddo_map;

					}
					$process->output_sample = "Bilbao, Abergement-Clémenciat (L')";

					break;
				}// end if( add_parents alone and true or false)

				// 1.2 "check_publishable" alone and true
				if( isset($check_publishable) 
					&& $add_parents === null
					&& $parent_section_tipo === null
					&& $process_dato_arguments === null
					&& $custom_parents === null									
					&& $parent_term_id === null							
				    ) {
					
					$parser_process = (object)[
							'is_publishable' => true,
							'fn' => 'add_parents',
							'parser' => [
								(object)[
									'fn' => 'parser_locator::parents',
									'options' => (object)[
										'value' => 'term',														
										'records_separator' => $divisor_parents ?? $records_separator ?? ', '
									]
								]
							],
							"output_format" => "string"
						];
					$process = $parser_process;
					if(!empty($ddo_map)){
						unset($parser_process->fn);
						$ddo_map[count($ddo_map)-1]->fn='add_parents';
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = "Bilbao, Abergement-Clémenciat (L')";

					break;
				}// end if( check_publishable alone and true)

				// 1.3 "custom_parents" alone
				if( isset($custom_parents) 
					&& $add_parents === null
					&& $parent_section_tipo === null
					&& $process_dato_arguments === null
					&& $check_publishable === null									
					&& $parent_term_id === null									
				    ) {

					$parents_splice 			= $custom_parents->parents_splice ?? null;
					$parent_end_by_term_id 		= $custom_parents->parent_end_by_term_id ?? null;
					$parent_end_by_model 		= $custom_parents->parent_end_by_model ?? null;
					
					$parser_process = (object)[
							'is_publishable' => true,
							'fn' => 'add_parents',
							'parser' => [
								(object)[
									'fn' => 'parser_locator::parents',
									'options' => (object)[
										"parents_splice" 					=> $parents_splice,
										"parent_end_by_term_id" 			=> $parent_end_by_term_id,
										"parent_end_by_typology_term_id" 	=> $parent_end_by_model
									]
								]
							],
							"output_format" => "string"
						]
					;
					$process = $parser_process;
					if(!empty($ddo_map)){
						unset($parser_process->fn);
						$ddo_map[count($ddo_map)-1]->fn='add_parents';
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = "Bilbao - Bizkaia, Abergement-Clémenciat (L') - Bourg-en-Bresse";

					break;
				}// end if($custom_parents)

				// 1.4 "parent_section_tipo" and "process_dato_arguments"
				if( isset($parent_section_tipo) 
					&& isset($process_dato_arguments)				
					&& $custom_parents === null									
					&& $check_publishable === null									
					&& $parent_term_id === null									
				    ) {

					$parents_splice = $process_dato_arguments->custom_parents->parents_splice ?? null;
					$parent_end_by_term_id = $process_dato_arguments->custom_parents->parent_end_by_term_id ?? null;
					$parent_end_by_model = $process_dato_arguments->custom_parents->parent_end_by_model ?? null;

					$parser_options = new stdClass();
					if(isset($add_parents)){
						$parser_options->include_parents = $add_parents;
					}
					if(isset($parents_splice)){
						$parser_options->parents_splice = $parents_splice;
					}
					if(isset($parent_end_by_term_id)){
						$parser_options->parent_end_by_term_id = $parent_end_by_term_id;
					}
					if(isset($parent_end_by_model)){
						$parser_options->parent_end_by_typology_term_id = $parent_end_by_model;
					}
					if(isset($divisor)){
						$parser_options->fields_separator = $divisor;
					}
					if(isset($records_separator)){
						$parser_options->records_separator = $records_separator;
					}
					if($parent_term_id !== null){
						$parser_options->parent_term_id = $parent_term_id;
					}

					$parser_process = (object)[
						(object)[
							'fn' => 'add_parents',
							'parser' => [
								(object)[
									'fn' => 'parser_locator::parents',
									'options' => $parser_options
								]
							],
							"output_format" => "string"
						]
					];
					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = "Bilbao - Bizkaia, Abergement-Clémenciat (L') - Bourg-en-Bresse";

					break;
				}
			}

			//empty options
			if(empty($option_obj)) {

				$fields_separator =', ';
				$records_separator =' - ';

				$ontology_node = ontology_node::get_instance($tipo);
				$properties = $ontology_node->get_properties();
				
				$show = $properties->source->request_config[0]->show ?? null;
				if(!empty($show)) {
					$deep_ddo = [];
					foreach ($show->ddo_map as $ddo) {
						$model = ontology_node::get_model_by_tipo($ddo->tipo);
						if($model === 'component_dataframe'){
							continue;
						}						
						if($ddo->parent === 'self') {
							$ddo->parent = $tipo;
						}
						$deep_ddo[] = $ddo;
					}

					$letter_ids = [];
					foreach ($deep_ddo as $i => $ddo) {					

						$children = array_find($deep_ddo, fn($ddo) => $ddo->parent === $ddo->tipo);

						if(empty($children)) {

							$letter_id = chr(ord('a') + $i);
							$letter_ids[] = $letter_id;

							$ddo_map[] = (object)[
								'id' => $letter_id,
								'tipo' => $ddo->tipo,
								'parent' => $ddo->parent
							];
						}else{
							$ddo_map[] = (object)[
								'tipo' => $ddo->tipo,
								'parent' => $ddo->parent
							];

						}
					}
				}
				
				$parser_process = (object)[					
					'parser' => [
						(object)[
							'fn' => 'parser_text::text_format',
							'options' => (object)[
								'pattern' => implode($fields_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids ?? [])),
								'records_separator' => $records_separator,
								'fields_separator' => $fields_separator
							]
						]
					],
					"output_format" => "string"
				];
				$process = $parser_process;
				if(!empty($ddo_map)){
					$process->ddo_map = $ddo_map;
				}
				$process->output_sample = "Pere | Manuel";
				
				break;

			}
			break;
		case 'component_publication':  
			break;
		case 'component_relation_children':
		case 'component_relation_index':
			$parser_process = (object)[
				"output_format" => "json"
			];

			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = (object)["section_id"=>"1", "section_tipo"=>"rsc197"];
		
			break;
		case 'component_relation_model':

			$fields_separator = $custom_arguments[0]->divisor ??', ';

			$related_component = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'component_','related', false);
			$related_section = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'section','related', true);
			$letter_ids = [];
			if (!empty($related_section)) {

				$letter_ids = [];
				foreach ($related_component as $i => $component_tipo) {
					$letter_id = chr(ord('a') + $i);
					$letter_ids[] = $letter_id;
					$ddo_map[] = (object)[
						'id' => $letter_id,
						'tipo' => $component_tipo,
						'parent' => $tipo,
						'section_tipo' => $related_section[0]
					]; 
				}
			}

			$parser_process = (object)[					
				'parser' => [
					(object)[
						'fn' => 'parser_text::text_format',
						'options' => (object)[
							'pattern' => implode($fields_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids))
						]
					]
				],
				"output_format" => "string"
			];
			$process = $parser_process;
			if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}
			$process->output_sample = "Goméz Pérez, Raspa";

			break;
		case 'component_relation_parent':
			$fields_separator =', ';
			$records_separator =', ';

			if($option_obj) {

				$add_parents 					= $option_obj->add_parents ?? null;
				$parent_section_tipo 			= $option_obj->parent_section_tipo ?? null;
				$process_dato_arguments 		= $option_obj->process_dato_arguments ?? null;
				$check_publishable 				= $option_obj->check_publishable ?? null;
				$custom_parents 				= $option_obj->custom_parents ?? null;
				$divisor 						= $option_obj->divisor ?? null;
				$parent_term_id 				= $option_obj->parent_term_id ?? null;
				$divisor_parents 				= $option_obj->divisor_parents ?? null;
				$records_separator 				= $option_obj->records_separator ?? null;

				$resolve_value 					= $option_obj->resolve_value ?? false;
				
				// 1.1 "add_parents" with resolve_value false
				if( isset($add_parents) 
					&& $resolve_value !== true
					&& $parent_section_tipo === null
					&& $process_dato_arguments === null
					&& $check_publishable === null
					&& $custom_parents === null								
					&& $parent_term_id === null												
					) {
					
					$parser_process = (object)[
						'fn' => 'add_parents',
						'parser' => [
							(object)[
								'fn' => 'parser_locator::parents',
								'options' => (object)[
									'value' => 'section_id',
									"include_parents" => $add_parents,
									'fields_separator' => $fields_separator,
									'records_separator' => $records_separator
								]
							]
						],
						'output_format' => 'json'							
					];
					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = '["1", "4", "5"]';

				break;
				}// end if( add_parents alone and true or false)

				// 1.2 "add_parents" with resolve_value true
				if( isset($add_parents) 
					&& $resolve_value === true
					&& $check_publishable === null
					&& $custom_parents === null								
					&& $parent_term_id === null												
					) {

					$parser_options = (object)[
						'value' => 'term',
						"include_parents" => $add_parents,
						'fields_separator' => $fields_separator,
						'records_separator' => $records_separator,
						'merge' => 'flat'
					];
					if($parent_section_tipo !== false) {
						$parser_options->parent_section_tipo = $parent_section_tipo;
					}

					$parents_splice = $process_dato_arguments->custom_parents->parents_splice ?? null;
					$parent_end_by_term_id = $process_dato_arguments->custom_parents->parent_end_by_term_id ?? null;
					$parent_end_by_model = $process_dato_arguments->custom_parents->parent_end_by_model ?? null;

					if(isset($parents_splice)){
						$parser_options->parents_splice = $parents_splice;
					}
					if(isset($parent_end_by_term_id)){
						$parser_options->parent_end_by_term_id = $parent_end_by_term_id;
					}
					if(isset($parent_end_by_model)){
						$parser_options->parent_end_by_typology_term_id = $parent_end_by_model;
					}
					
					$parser_process = (object)[
							'fn' => 'add_parents',
							'parser' => [
								(object)[
									'fn' => 'parser_locator::parents',
									'options' => $parser_options
								]
							],
							'output_format' => 'json'							
						]
					;
					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = '["Bilbao, Bizkaia, Pais Vasco, España"]';

				break;
				}// end if( add_parents alone and true or false)


				// 1.3 "add_parents" with resolve_value false
				if( !isset($add_parents)
					&& $resolve_value !== true
					&& $parent_section_tipo === null
					&& $process_dato_arguments === null
					&& $check_publishable === null
					&& $custom_parents === null								
					&& $parent_term_id === null												
					) {
					
					$parser_process = (object)[
							'output_format' => 'json'							
						]
					;
					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = '[{"section_id":"1", "section_tipo":"rsc197"}]';

				break;
				}// end if( add_parents alone and true or false)

				// 1.4 "add_parents" with resolve_value true
				if( !isset($add_parents)
					&& $resolve_value === true
					&& $parent_section_tipo === null
					&& $process_dato_arguments === null
					&& $check_publishable === null
					&& $custom_parents === null								
					&& $parent_term_id === null												
					) {
					
					$parser_process = (object)[
							'fn' => 'add_parents',
							'parser' => [
								(object)[
									'fn' => 'parser_locator::parents',
									'options' => (object)[
										'value' => 'term',
										"include_parents" => false,
										'fields_separator' => $fields_separator,
										'records_separator' => $records_separator
									]
								]
							],
							'output_format' => 'json'							
						]
					;
					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = '["Bilbao"]';

				break;
				}// end if( add_parents alone and true or false)

			}//end if($option_obj)
			break;
		case 'component_relation_related':
			$fields_separator =' | ';
			$records_separator ='<br>';

			if(empty($option_obj)) {
				$ontology_node = ontology_node::get_instance($tipo);
				$properties = $ontology_node->get_properties();
				
				$show = $properties->source->request_config[0]->show ?? null;
				if(!empty($show)) {
					$deep_ddo = [];
					foreach ($show->ddo_map as $ddo) {
						$model = ontology_node::get_model_by_tipo($ddo->tipo);
						if($model === 'component_dataframe'){
							continue;
						}
						if($ddo->parent === 'self') {
							$ddo->parent = $tipo;
						}
						$deep_ddo[] = $ddo;
					}

					$letter_ids = [];
					foreach ($deep_ddo as $i => $ddo) {					

						$children = array_find($deep_ddo, fn($ddo) => $ddo->parent === $ddo->tipo);

						if(empty($children)) {

							$letter_id = chr(ord('a') + $i);
							$letter_ids[] = $letter_id;

							$ddo_map[] = (object)[
								'id' => $letter_id,
								'tipo' => $ddo->tipo,
								'parent' => $ddo->parent
							];
						}else{
							$ddo_map[] = (object)[
								'tipo' => $ddo->tipo,
								'parent' => $ddo->parent
							];

						}
					}
				}

				$parser_process = (object)[					
					'parser' => [
						(object)[
							'fn' => 'parser_text::text_format',
							'options' => (object)[
								'pattern' => implode($fields_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids ?? [])),
								'records_separator' => $records_separator,
								'fields_separator' => $fields_separator
							]
						]
					],
					"output_format" => "string"
				];
				$process = $parser_process;
				if(!empty($ddo_map)){
					$process->ddo_map = $ddo_map;
				}
				$process->output_sample = "Castulo | Kastilo<br>Uncertain mint. Imitations of Castulo";			

			}

			break;
		case 'component_section_id':
			break;
		case 'component_select':
		case 'component_radio_button':
			$fields_separator = $custom_arguments[0]->divisor ??', ';

			$related_component = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'component_','related', false);	

			$letter_ids = [];
			foreach ($related_component as $i => $component_tipo) {
				$letter_id = chr(ord('a') + $i);
				$letter_ids[] = $letter_id;
				$ddo_map[] = (object)[
					'id' => $letter_id,
					'tipo' => $component_tipo,
					'parent' => $tipo
				]; 
			}			

			$parser_process = (object)[					
				'parser' => [
					(object)[
						'fn' => 'parser_text::text_format',
						'options' => (object)[
							'pattern' => implode($fields_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids))
						]
					]
				],
				"output_format" => "string"
			];
			$process = $parser_process;
			$process->ddo_map = $ddo_map;
			$process->output_sample = "Goméz Pérez, Raspa";

			break;  
		
		case 'component_text_area':

			$parser_process = (object)[
				'parser' => [
					(object)[
						'fn' => 'parser_text::v5_html'
					]
				],
				"output_format" => "string"
			];
			$process = $parser_process;
			break;
		case 'component_select_lang':

			$fields_separator = $custom_arguments[0]->divisor ?? ', ';

			$ddo_map[] = (object)[
				'id'		=> 'a',
				'tipo'		=> 'hierarchy25', // Standard term component for lg1
				'label'		=> 'Term',
				'parent'	=> $tipo,
			];
			
			$parser_process = (object)[					
				'parser' => [
					(object)[
						'fn' => 'parser_text::text_format',
						'options' => (object)[
							'pattern' => '${a}'
						]
					]
				],
				"output_format" => "string"
			];

			$process = $parser_process;
			$process->ddo_map = $ddo_map;
			$process->output_sample = "English";

			break; 	if(!empty($ddo_map)){
				$process->ddo_map = $ddo_map;
			}			
			$process->output_sample = "Hi<br>My text";


			break;

		case 'component_html_text':

			$ontology_node = ontology_node::get_instance($tipo);
			$properties = $ontology_node->get_properties();
			$tags_reference_tipo = $properties->tags_reference->tipo ?? null;

			if( !empty($tags_reference_tipo) ){
				$parser_process = (object)[
					'fn' => 'get_diffusion_v5_references_html',
					'parser' => [
						(object)[
							'fn' => 'parser_text::v5_html'
						]
					],
					"output_format" => "string"
				];
				$process = $parser_process;
				if(!empty($ddo_map)){
					$process->ddo_map = $ddo_map;
				}
				$process->output_sample = "Hi<br>My html text";
			}else{
				$parser_process = (object)[
					'parser' => [
						(object)[
							'fn' => 'parser_text::v5_html'
						]
					],
					"output_format" => "string"
				];
				$process = $parser_process;
				if(!empty($ddo_map)){
					$process->ddo_map = $ddo_map;
				}
				$process->output_sample = "Hi<br>My html text";
			}

			break;
		case 'relation_list':

			switch($data_to_be_used){
				case 'custom':
					$custom_map = $process_dato_arguments->custom_map ?? [];
					
					// Ensure base DDO node for relation_list
					$ddo_map[0]->info = 'a relation list node, used to obtain the locators that are calling to this section. As lots of sections can be linked here, but the next ddo in the chain will need to use a filter of the locators with specific section, so section_tipo is apply to reduce the data';
					
					$v7_map = [];
					$letter_index = 0;
					$parser_prechain = [];
					
					// Helper to allocate a new letter id
					$get_letter = function() use (&$letter_index) {
						return chr(ord('a') + $letter_index++);
					};
					
					// Recursive helper function to parse diffusion objects and build ddo_map
					$parse_diffusion = function($node, $parent_tipo, $section_tipo) use (&$parse_diffusion, &$ddo_map, &$get_letter, &$parser_prechain) {
						if (isset($node->process_dato) && $node->process_dato === 'diffusion_sql::return_fixed_value') {
							$val = $node->process_dato_arguments->value ?? '';
							if (is_array($val)) {
								$val = implode(', ', $val);
							}
							return $val;
						}

						$method = $node->component_method ?? null;
						$args = $node->custom_arguments ?? null;
						
						if (is_array($args)) {
							$args = $args[0] ?? null;
						}
						
						$pda = $args->process_dato_arguments ?? null;
						if (!$pda) return '';
						
						if (isset($pda->process_dato) && $pda->process_dato === 'diffusion_sql::map_locator_to_int' && isset($pda->component_method) && $pda->component_method === 'get_dato') {
							$target_component_tipo = trim($pda->target_component_tipo ?? "");
							if (empty($target_component_tipo)) return '';
							
							$letter_id = $get_letter();
							
							$ddo_map[] = (object)[
								'id' => $letter_id,
								'tipo' => $target_component_tipo,
								'parent' => $parent_tipo,
								'section_tipo' => $section_tipo
							];
							
							$parser_prechain[] = (object)[
								'fn' => 'parser_locator::get_section_id',
								'id' => $letter_id
							];
							
							return '${' . $letter_id . '}';
						}
						
						$dato_splice = $pda->dato_splice ?? null;
						$target_component_tipo = trim($pda->target_component_tipo ?? "");
						
						if (empty($target_component_tipo)) return '';
						
						$model = ontology_node::get_model_by_tipo($target_component_tipo, true);
						$is_relation = in_array($model, component_relation_common::get_components_with_relations());
						
						// Create base DDO entry for target
						$ddo_entry = (object)[
							'tipo' => $target_component_tipo,
							'parent' => $parent_tipo,
							'section_tipo' => $section_tipo
						];
						
						if (isset($dato_splice) && is_array($dato_splice) && isset($dato_splice[0])) {
							$ddo_entry->data_slice = (object)[
								'offset' => 0,
								'length' => (int)$dato_splice[0]
							];
						}
						
						// If the method resolves another value deeply
						if ($method === 'get_diffusion_resolve_value' && isset($pda->custom_arguments)) {
							$ddo_map[] = $ddo_entry;
							// Find relation's section type to pass down to children if needed
							$related_section = ontology_node::get_ar_tipo_by_model_and_relation($target_component_tipo, 'section', 'related', true);
							$child_section_tipo = !empty($related_section) ? $related_section[0] : null;
							
							return $parse_diffusion($pda, $target_component_tipo, $child_section_tipo);
						} 
						
						// End of recursion, format string according to relation or normal component
						if ($is_relation) {
							$ddo_map[] = $ddo_entry;
							$pattern_parts = [];
							
							$ontology_node_rel = ontology_node::get_instance($target_component_tipo);
							$properties_rel = $ontology_node_rel->get_properties();
							$show = $properties_rel->source->request_config[0]->show ?? null;
							
							if (!empty($show)) {
								$deep_ddo = [];
								foreach ($show->ddo_map as $ddo) {
									$model = ontology_node::get_model_by_tipo($ddo->tipo);
									if($model === 'component_dataframe'){
										continue;
									}
									$cloned_ddo = clone $ddo;
									if ($cloned_ddo->parent === 'self') {
										$cloned_ddo->parent = $target_component_tipo;
									}
									$deep_ddo[] = $cloned_ddo;
								}
								
								foreach ($deep_ddo as $ddo) {
									$children = array_find($deep_ddo, fn($child) => $child->parent === $ddo->tipo);
									
									if (empty($children)) {
										$letter_id = $get_letter();
										$ddo_map[] = (object)[
											'id' => $letter_id,
											'tipo' => $ddo->tipo,
											'parent' => $ddo->parent
										];
										$pattern_parts[] = '${' . $letter_id . '}';
									} else {
										$ddo_map[] = (object)[
											'tipo' => $ddo->tipo,
											'parent' => $ddo->parent
										];
									}
								}
							} else {
								$related_components = ontology_node::get_ar_tipo_by_model_and_relation($target_component_tipo, 'component_', 'related', false);
								$related_section = ontology_node::get_ar_tipo_by_model_and_relation($target_component_tipo, 'section', 'related', true);
								
								foreach ($related_components as $current_component_tipo) {
									$letter_id = $get_letter();
									$ddo_map[] = (object)[
										'id' => $letter_id,
										'tipo' => $current_component_tipo,
										'parent' => $target_component_tipo,
										'section_tipo' => $related_section[0] ?? ''
									];
									$pattern_parts[] = '${' . $letter_id . '}';
								}
							}
							return implode(', ', $pattern_parts);
						} else {
							$letter_id = $get_letter();
							$ddo_entry->id = $letter_id;
							$ddo_map[] = $ddo_entry;
							return '${' . $letter_id . '}';
						}
					};

					foreach ($custom_map as $v6_map_item) {
						$map_item = new stdClass();
						$current_section_tipo = $v6_map_item->section_tipo ?? null;
						
						foreach ($v6_map_item as $key => $value) {
							// Ignore disabled keys
							if (strpos($key, '***') === 0) continue;

							if (is_string($value)) {
								$map_item->{$key} = $value;
							} else if (is_object($value)) {
								$pattern = $parse_diffusion($value, $tipo, $current_section_tipo);
								if ($pattern) {
									$map_item->{$key} = $pattern;
								}
							}
						}
						// Always include section_id reference Native to V7
						$map_item->section_id = '${section_id}';
						$v7_map[] = $map_item;
					}

					$process_parsers = $parser_prechain;
					$process_parsers[] = (object)[
						'fn' => 'parser_map::custom',
						'info' => 'Create a json data with the result to be insert into the column',
						'options' => (object)[
							'map' => $v7_map
						]
					];

					$parser_process = (object)[
						'parser' => $process_parsers,
						'output_format' => 'json'
					];
					
					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					
					break;
				case 'filtered_values':

					$fields_separator = $process_dato_arguments->separator ?? ' | ';

					$output 				= $process_dato_arguments->output ?? "string";
					$direct_value 			= $process_dato_arguments->direct_value ?? true;
					$filter_section 		= $process_dato_arguments->filter_section ?? "";
					$target_component_tipo 	= trim($process_dato_arguments->target_component_tipo ?? "");
					$component_method 		= $process_dato_arguments->component_method ?? "get_value";

					if($component_method === 'get_value'){

						// add the direct reference
						$ddo_map[] = (object)[
							'tipo' => $target_component_tipo,
							'parent' => $tipo,
							'section_tipo' => $filter_section
						];

						$model = ontology_node::get_model_by_tipo($target_component_tipo, true);
						if(in_array($model, component_relation_common::get_components_with_relations())){

							// get the related components
							$related_component = ontology_node::get_ar_tipo_by_model_and_relation($target_component_tipo, 'component_','related', false);	

							$letter_ids = [];
							foreach ($related_component as $i => $current_component_tipo) {
								$letter_id = chr(ord('a') + $i);
								$letter_ids[] = $letter_id;
								$ddo_map[] = (object)[
									'id' => $letter_id,
									'tipo' => $current_component_tipo,
									'parent' => $target_component_tipo
								]; 
							}						

							$parser_process = (object)[					
								'parser' => [
									(object)[
										'fn' => 'parser_text::text_format',
										'options' => (object)[
											'pattern' => implode($fields_separator, array_map(fn($l) => '${' . $l . '}', $letter_ids))
										]
									]
								],
								"output_format" => "string"
							];
							$process = $parser_process;
						}else{
							$process = new stdClass();
						}
						if(!empty($ddo_map)){
							$process->ddo_map = $ddo_map;
						}
						$process->output_sample = "Raspa";

						break;
					}else if($component_method === 'get_dato'){
						$ddo_map[] = (object)[
							'tipo' => $target_component_tipo,
							'parent' => $tipo,
							'section_tipo' => $filter_section
						];

						// component with relations
						$model = ontology_node::get_model_by_tipo($target_component_tipo, true);
						if(in_array($model, component_relation_common::get_components_with_relations())){
							
							$parser_process = (object)[
								"parser" => [
									(object)[
										'fn' => 'parser_locator::get_section_id'
									]
								],
								"output_format" => "json"
							];
							$process = $parser_process;
						}else{
							$process = new stdClass();
						}
						if(!empty($ddo_map)){
							$process->ddo_map = $ddo_map;
						}
						$process->output_sample = ["1", "2"];

						
						
					}else if($component_method === 'get_diffusion_value'){

						if($target_component_tipo === 'numisdata161'){
							$process = json_decode('
								{

										"parser": [
										{
											"fn": "parser_helper::merge",
											"options": {
											"merge": "string",
											"fields_separator": " | ",
											"records_separator": " - "
											}
										}
										],
										"ddo_map": [
										{
											"tipo": "numisdata578",
											"section_tipo": "self",
											"section_filter": [
											"numisdata3"
											],
											"component_filter": [
											"numisdata77"
											]
										},
										{
											"tipo": "numisdata309",
											"parent": "numisdata578"
										},
										{
											"tipo": "numisdata303",
											"parent": "numisdata309"
										},
										{
											"tipo": "numisdata27",
											"parent": "numisdata578"
										},
										{
											"tipo": "numisdata30",
											"parent": "numisdata578"
										},
										{
											"tipo": "numisdata16",
											"parent": "numisdata30"
										},
										{
											"tipo": "numisdata34",
											"parent": "numisdata578"
										},
										{
											"tipo": "numisdata97",
											"parent": "numisdata34"
										},
										{
											"tipo": "numisdata81",
											"parent": "numisdata578"
										},
										{
											"tipo": "numisdata1447",
											"parent": "numisdata578"
										}
										],
										"output_format": "json",
										"output_sample": [
										"MIB",
										"ACIP"
										]
									}						
							');

							break;
						}

					
						if (!empty($target_component_tipo)) {
							$second_entry = (object)[
								'tipo'   => $target_component_tipo,
								'parent' => $tipo,
							];
							$ddo_map[] = $second_entry;
						
							// Resolve target component's related leaf via get_diffusion_value (e.g. component_select)
							$model_target = ontology_node::get_legacy_model_by_tipo($target_component_tipo);
							if($model_target === 'component_input_text'){
								$process->ddo_map = $ddo_map;
								$process->output_sample = 'MIB';
								break;
							}
							$process = get_diffusion_value(
								$target_component_tipo,
								$model_target,
								[(object)[]], // safe empty custom_arguments for component_select divisor access
								null,
								null,
								null,
								null,
								$ddo_map
							);
							$process->output_sample = ['MIB', 'ACIP'];
						}
					}

					
					break;
				case 'dato':
					$filter_section = $process_dato_arguments->filter_section ?? null;
					$filter_component = $process_dato_arguments->filter_component ?? null;
					$target_component_tipo = trim($process_dato_arguments->target_component_tipo ?? "");
					
					if(!empty($ddo_map) && isset($ddo_map[0])) {
						if($filter_section) {
							$ddo_map[0]->section_filter = $filter_section;
						}
						if($filter_component) {
							$ddo_map[0]->component_filter = $filter_component;
						}
					}
					
					if($target_component_tipo) {
						$target_ddo = (object)[
							'tipo' => $target_component_tipo,
							'parent' => $tipo
						];
						if($filter_section && !empty($filter_section[0])) {
							$target_ddo->section_tipo = $filter_section[0];
						}
						$ddo_map[] = $target_ddo;
					}

					$parser_process = (object)[
						"parser" => [
							(object)[
								'fn' => 'parser_locator::get_section_id'
							]
						],
						"output_format" => "json"
					];

					$process = $parser_process;
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = ["1", "2"];	
					
					break;
				case 'section_id':
					// ddo_map[0] already has section_filter/component_filter applied by caller
					$process = new stdClass();
					$process->parser = [(object)['fn' => 'parser_locator::get_section_id']];
					$process->output_format = 'json';
					if(!empty($ddo_map)){
						$process->ddo_map = $ddo_map;
					}
					$process->output_sample = ['1', '2'];
					break;
				case 'resolve_value':
					// ddo_map[0] already has section_filter/component_filter applied by caller
					// Add target_component_tipo as second ddo entry, then resolve its model via get_diffusion_value
					$target_component_tipo = trim($process_dato_arguments->target_component_tipo ?? '');
					$filter_section        = $process_dato_arguments->filter_section ?? null;
					
					if (!empty($target_component_tipo)) {
						$second_entry = (object)[
							'tipo'   => $target_component_tipo,
							'parent' => $tipo,
						];
						if ($filter_section && !empty($filter_section[0])) {
							$second_entry->section_tipo = $filter_section[0];
						}
						$ddo_map[] = $second_entry;
					
						// Resolve target component's related leaf via get_diffusion_value (e.g. component_select)
						$model_target = ontology_node::get_legacy_model_by_tipo($target_component_tipo);
						if($model_target === 'component_input_text'){

							// add the merge to pipe
							$process->parser = (object)[
								'fn' => 'parser_helper::merge',
								'options' => [
									'merge' => 'string',
									'records_separator' => ' | '
								]
							];
							$process->ddo_map = $ddo_map;
							$process->output_sample = 'MIB';
							break;
						}
						$process = get_diffusion_value(
							$target_component_tipo,
							$model_target,
							[(object)[]], // safe empty custom_arguments for component_select divisor access
							null,
							null,
							null,
							null,
							$ddo_map
						);
						$process->output_sample = ['MIB', 'ACIP'];

						if($model_target === 'component_select'){

							// add the merge to pipe
							$process->parser = (object)[
								'fn' => 'parser_helper::merge'								
							];
							$process->output_sample = ['MIB'];
							break;
						}
					}
					break;
				}
			break;
	}
	
	return $process;
}
