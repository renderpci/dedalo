<?php declare(strict_types=1);
/**
* ONTOLOGY_CONVERTER
* Manages the ontology format conversions.
* Used to move data from matrix to jer_dd or vice-versa
* @todo WORKING PROGRESS !
*/
class ontology_converter {



	/**
	* MATRIX_TO_JER_DD
	* Converts data between matrix section and jer_dd row
	* @param string section_tipo
	* @param string|int section_id
	* @return object response
	* {
	* 	result : object|false
	* 	msg : string
	* 	errors: array
	* }
	*/
	public static function matrix_to_jer_dd( string $section_tipo, string|int $section_id ) : object {
		$start_time=start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		$jer_dd_row = new stdClass();

		// table jer_dd columns:
			// id	integer Auto Increment [nextval('jer_dd_id_seq')]
			// terminoID	character varying(32) NULL
			// parent	character varying(32) NULL
			// modelo	character varying(8) NULL
			// esmodelo	sino NULL
			// esdescriptor	sino NULL
			// visible	sino NULL
			// norden	numeric(4,0) NULL
			// tld	character varying(32) NULL
			// traducible	sino NULL
			// relaciones	text NULL
			// propiedades	text NULL
			// properties	jsonb NULL
			// term	jsonb

		// short vars
			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);

		// terminoID
			$tipo		= 'ontology7';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$tld = $component->get_value();
			if (empty($tld)) {
				$response->errors[]	= 'Empty tld value (ontology7)';
				return $response;
			}
			$jer_dd_row->terminoID = $tld . $section_id;

		// parent (ontology15)
			$tipo		= 'ontology15';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$parent_locator = $component->get_dato()[0] ?? null;
			$jer_dd_row->parent = null;
			if(!empty($parent_locator)){
				// parent tld (ontology7)
				$tipo		= 'ontology7';
				$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
				$component	= component_common::get_instance(
					$model,
					$tipo ,
					$parent_locator->section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$parent_locator->section_tipo
				);
				$parent_tld = $component->get_value();
				$jer_dd_row->parent = $parent_tld . $parent_locator->section_id;
			}

		// modelo (ontology6)
			$tipo		= 'ontology6';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_dato()[0] ?? null;
			if(!empty($value)){
				// target tld (ontology7)
				$tipo		= 'ontology7';
				$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
				$component	= component_common::get_instance(
					$model,
					$tipo ,
					$value->section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$value->section_tipo
				);
				$parent_tld = $component->get_value();
				$jer_dd_row->modelo = $parent_tld . $value->section_id;
			}else{
				$jer_dd_row->modelo = null;
			}

		// esmodelo ontology30
			$tipo		= 'ontology30';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_dato()[0] ?? null;
			$jer_dd_row->esmodelo = (!empty($value) && (int)$value->section_id===NUMERICAL_MATRIX_VALUE_YES)
				? 'si'
				: 'no';

		// esdescriptor (ontology4)
			$tipo		= 'ontology4';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_dato()[0] ?? null;
			$jer_dd_row->esdescriptor = (!empty($value) && (int)$value->section_id===NUMERICAL_MATRIX_VALUE_YES)
				? 'si'
				: 'no';

		// visible
			$jer_dd_row->visible = 'si';

		// norden
			$jer_dd_row->norden = null;
			if (!empty($parent_locator)) {
				// use the parent data to get the children data and calculate the order.
				$siblings	= ontology::get_siblings( $parent_locator );
				$order		= ontology::get_order_from_locator( $locator, $siblings );

				$jer_dd_row->norden = $order;
			}

		// tld (already calculated for terminoID -ontology7-)
			$jer_dd_row->tld = $tld;

		// traducible (ontology8)
			$tipo		= 'ontology8';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_dato()[0] ?? null;
			$jer_dd_row->traducible = (!empty($value) && (int)$value->section_id===NUMERICAL_MATRIX_VALUE_YES)
				? 'si'
				: 'no';

		// relaciones (ontology10)
			$tipo		= 'ontology10';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_dato();
			if( !empty($value) ){

				$relations = [];
				foreach ($value as $current_relation) {
					// get the relation data
					// use the locator
					$relation_term_id = ontology::get_term_id_from_locator( $current_relation );

					$relation = new stdClass();
						$relation->tipo = $relation_term_id;
					$relations[] = $relation;
				}
				$jer_dd_row->relaciones = $relations;
			}else{
				$jer_dd_row->relaciones = null;
			}

		// propiedades (v5) ontology19
			$tipo		= 'ontology19';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_dato()[0] ?? null;
			$jer_dd_row->propiedades = empty($value) || empty(get_object_vars($value))
				? null
				: $value;

		// properties (ontology16,ontology17,ontology18)
			// properties general
			$tipo		= 'ontology18';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_dato()[0] ?? null;
			$jer_dd_row->properties = !empty($value)
				? $value
				: new stdClass();

			// properties CSS
			$tipo		= 'ontology16';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_dato()[0] ?? null;
			if (!empty($value)) {
				$jer_dd_row->properties->css = $value;
			}

			// properties RQO
			$tipo		= 'ontology17';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$value = $component->get_dato()[0] ?? null;
			if (!empty($value)) {
				$jer_dd_row->properties->source = $value;
			}
			if( empty(get_object_vars($jer_dd_row->properties)) ){
				$jer_dd_row->properties = null;
			}

		// term (ontology5)
			$tipo		= 'ontology5';
			$model		= ontology_node::get_modelo_name_by_tipo( $tipo  );
			$component	= component_common::get_instance(
				$model,
				$tipo ,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$value = $component->get_dato_full();

			if( !empty($value) && !empty(get_object_vars($value)) ){
				$term = new stdClass();
				foreach ($value as $lang => $ar_term) {
					if( !empty($ar_term) ){
						$term->$lang = reset($ar_term);
					}
				}
				$jer_dd_row->term = $term;
			}else{
				$jer_dd_row->term = null;
			}

		// debug
			if(SHOW_DEBUG===true) {
				$total = exec_time_unit($start_time,'ms').' ms';
				dump($jer_dd_row, ')))))))))))))))))))))))))) +++ jer_dd_row ++ '.to_string($total));
			}

		$response->result	= $jer_dd_row;
		$response->msg		= count($response->errors)===0
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end matrix_to_jer_dd



	/**
	* JER_DD_TO_MATRIX
	* Converts data between jer_dd row and matrix section
	* @param object $jer_dd_row
	* @return object $response
	*/
	public static function jer_dd_to_matrix( object $jer_dd_row, string|int $section_id ) : object {
		$start_time=start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// table jer_dd columns:
			// id	integer Auto Increment [nextval('jer_dd_id_seq')]
			// terminoID	character varying(32) NULL
			// parent	character varying(32) NULL
			// modelo	character varying(8) NULL
			// esmodelo	sino NULL
			// esdescriptor	sino NULL
			// visible	sino NULL
			// norden	numeric(4,0) NULL
			// tld	character varying(32) NULL
			// traducible	sino NULL
			// relaciones	text NULL
			// propiedades	text NULL
			// properties	jsonb NULL
			// term	jsonb

		// short vars
			$tld					= $jer_dd_row->tld;
			$target_section_tipo	= ontology::map_tld_to_target_section_tipo( $tld );
			$node_tipo				= $jer_dd_row->terminoID;
			$parent					= $jer_dd_row->parent;
			$model					= $jer_dd_row->modelo;
			$is_model				= $jer_dd_row->esmodelo;
			$is_descriptor			= $jer_dd_row->esdescriptor;
			$visible				= $jer_dd_row->visible;
			$translatable			= $jer_dd_row->traducible;
			$relations				= !empty($jer_dd_row->relaciones)
				? ((is_string($jer_dd_row->relaciones) ? json_handler::decode($jer_dd_row->relaciones) : $jer_dd_row->relaciones) ?? null)
				: null;
			// $properties_v5		= !empty( $jer_dd_row->propiedades ) ? json_decode( $jer_dd_row->propiedades ) : new stdClass();
			$properties_v5			= !empty($jer_dd_row->propiedades)
				? ((is_string($jer_dd_row->propiedades) ? json_handler::decode($jer_dd_row->propiedades) : $jer_dd_row->propiedades) ?? null)
				: null;
			// $properties			= !empty( $jer_dd_row->properties ) ? json_decode( $jer_dd_row->properties ) : new stdClass();
			$properties				= !empty($jer_dd_row->properties)
				? ((is_string($jer_dd_row->properties) ? json_handler::decode($jer_dd_row->properties) : $jer_dd_row->properties) ?? null)
				: null;
			// $term				= !empty( $jer_dd_row->term ) ? json_decode( $jer_dd_row->term ) : new stdClass();
			$term					= !empty($jer_dd_row->term)
				? ((is_string($jer_dd_row->term) ? json_handler::decode($jer_dd_row->term) : $jer_dd_row->term) ?? null)
				: null;

			$section_tipo = $target_section_tipo;

		// section_row
			$section = section::get_instance(
				$section_id, // string|null section_id
				$section_tipo // string section_tipo
			);

		// tld
			$tld_tipo		= 'ontology7';
			$tld_model		= ontology_node::get_modelo_name_by_tipo( $tld_tipo  );
			$tld_component	= component_common::get_instance(
				$tld_model,
				$tld_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$tld_component->set_dato( [$tld] );
			$tld_component->save_to_database = false;
			$tld_component->Save();

		// model. Get the model tld and id
			if( !empty($model) && $model!=='null' ){
				$model_section_id	= get_section_id_from_tipo( $model );
				$model_tld			= get_tld_from_tipo( $model );
				$model_section_tipo	= ontology::map_tld_to_target_section_tipo( $model_tld );

				$model_locator = new locator();
					$model_locator->set_section_tipo( $model_section_tipo );
					$model_locator->set_section_id( $model_section_id );

				$model_tipo			= 'ontology6';
				$model_model		= ontology_node::get_modelo_name_by_tipo( $model_tipo );
				$model_component	= component_common::get_instance(
					$model_model,
					$model_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$model_component->set_dato( [$model_locator] );
				$model_component->save_to_database = false;
				$model_component->Save();
			}

		// descriptor
			$is_descriptor_tipo			= 'ontology4';
			$is_descriptor_model		= ontology_node::get_modelo_name_by_tipo( $is_descriptor_tipo  );
			$is_descriptor_component	= component_common::get_instance(
				$is_descriptor_model,
				$is_descriptor_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$descriptor_locator = new locator();
				$descriptor_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$descriptor_locator->set_section_id($is_descriptor==='si' ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$is_descriptor_component->set_dato( [$descriptor_locator] );
			$is_descriptor_component->save_to_database = false;
			$is_descriptor_component->Save();

		// is model
			$is_model_tipo		= 'ontology30';
			$is_model_model		= ontology_node::get_modelo_name_by_tipo( $is_model_tipo  );
			$is_model_component	= component_common::get_instance(
				$is_model_model,
				$is_model_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$is_model_locator = new locator();
				$is_model_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$is_model_locator->set_section_id($is_model==='si' ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$is_model_component->set_dato( [$is_model_locator] );
			$is_model_component->save_to_database = false;
			$is_model_component->Save();

		// translatable
			$translatable_tipo		= 'ontology8';
			$translatable_model		= ontology_node::get_modelo_name_by_tipo( $translatable_tipo  );
			$translatable_component	= component_common::get_instance(
				$translatable_model,
				$translatable_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$translatable_locator = new locator();
				$translatable_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$translatable_locator->set_section_id($translatable==='si' ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$translatable_component->set_dato( [$translatable_locator] );
			$translatable_component->save_to_database = false;
			$translatable_component->Save();

		// term
			$term_tipo	= 'ontology5';
			$term_model	= ontology_node::get_modelo_name_by_tipo( $term_tipo );
			foreach ($term as $current_lang => $term_value) {

				$term_component	= component_common::get_instance(
					$term_model,
					$term_tipo ,
					$section_id,
					'list',
					$current_lang,
					$section_tipo
				);

				$term_component->set_dato( [$term_value] );
				$term_component->save_to_database = false;
				$term_component->Save();
			}

		// properties V5
			$properties_v5_tipo			= 'ontology19';
			$properties_v5_model		= ontology_node::get_modelo_name_by_tipo( $properties_v5_tipo  );
			$properties_v5_component	= component_common::get_instance(
				$properties_v5_model,
				$properties_v5_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$properties_v5_component->set_dato( [$properties_v5] );
			$properties_v5_component->save_to_database = false;
			$properties_v5_component->Save();

		// properties CSS
			$properties_css_tipo		= 'ontology16';
			$properties_css_model		= ontology_node::get_modelo_name_by_tipo( $properties_css_tipo  );
			$properties_css_component	= component_common::get_instance(
				$properties_css_model,
				$properties_css_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$properties_css = $properties->css ?? null;

			$properties_css_component->set_dato( [$properties_css] );
			$properties_css_component->save_to_database = false;
			$properties_css_component->Save();

		// properties RQO
			$properties_rqo_tipo		= 'ontology17';
			$properties_rqo_model		= ontology_node::get_modelo_name_by_tipo( $properties_rqo_tipo  );
			$properties_rqo_component	= component_common::get_instance(
				$properties_rqo_model,
				$properties_rqo_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$properties_rqo = $properties->source ?? null;

			$properties_rqo_component->set_dato( [$properties_rqo] );
			$properties_rqo_component->save_to_database = false;
			$properties_rqo_component->Save();

		// properties
			$properties_tipo		= 'ontology18';
			$properties_model		= ontology_node::get_modelo_name_by_tipo( $properties_tipo  );
			$properties_component	= component_common::get_instance(
				$properties_model,
				$properties_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			// list thesaurus exception `dd144`
			// until 6.4 list thesaurus is an array of objects without any kind of definition
			// in 6.4 his definition change to be a `show` object with a `ddo_map` as others
			if($model === 'dd144' && !empty($properties) && is_array($properties) ){

				// generate the new objects and assign the old properties
				$new_properties = new stdClass();
					$new_properties->show = new stdClass();
					$new_properties->show->ddo_map = $properties;

				$properties = $new_properties;
			}

			if(!empty($properties)) {
				$properties_general = new stdClass();
				foreach ($properties as $pkey => $pvalue) {
					if ($pkey==='source' || $pkey==='css') {
						continue;
					}
					$properties_general->{$pkey} = $pvalue;
				}
				$properties_general_value = [$properties_general];
			}

			$properties_component->set_dato( $properties_general_value ?? null );
			$properties_component->save_to_database = false;
			$properties_component->Save();

		// debug
			if(SHOW_DEBUG===true) {
				$total = exec_time_unit($start_time,'ms').' ms';
				dump($section, ')))))))))))))))))))))))))) +++ section ++ '.to_string($total));
			}

		$response->result	= $section;
		$response->msg		= count($response->errors)===0
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end jer_dd_to_matrix



}//end ontology_converter
