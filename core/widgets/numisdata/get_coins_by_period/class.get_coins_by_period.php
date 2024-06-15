<?php


/**
* CLASS GET_COINS_BY_PERIOD
*
* Used to count every coin into his period (specify by chronological thesaurus)
* and group then into "Era" terms
* Every coin could has his own period as "s.I to s.II" this period could has a parent term as era "Roman"
* example of ipo:
*
*	{
*		"ipo": [{
*			"input": [
*				{
*					"type": "source",
*					"section_tipo": "numisdata5",
*					"component_tipo": "numisdata322"
*				},
*				{
*					"type": "period",
*					"use_parent": true,
*					"section_tipo": "numisdata4",
*					"component_tipo": "numisdata1373",
*					"target_sections":["dc1"],
*					"target_model_section_id": 1
*				},
*				{
*					"type": "target_component_section_id",
*					"section_tipo": "numisdata4",
*					"component_tipo": "numisdata130"
*				},
*				{
*					"type": "duplicated",
*					"section_tipo": "numisdata4",
*					"component_tipo": "numisdata157"
*				}
*			],
*			"output": [
*				{
*					"id": "period",
*					"value": "string"
*				}
*			]
*		}],
*		"path": "/numisdata/get_coins_by_period",
*		"data_source": [
*			{
*				"type": "source",
*				"section_tipo": "numisdata5",
*				"component_tipo": "numisdata322"
*			},
*			{
*				"type": "period",
*				"section_tipo": "numisdata4",
*				"component_tipo": "numisdata1373"
*			},
*			{
*				"type": "duplicated",
*				"section_tipo": "numisdata4",
*				"component_tipo": "numisdata157"
*			}
*		],
*		"widget_info": "Create a summatory of elements by period.",
*		"widget_name": "get_coins_by_period",
*		"widget_path": "/numisdata/widgets"
*	}
*/
class get_coins_by_period extends widget_common {

	/**
	* get_dato
	* @return
	*/
	public function get_dato() {

		// check the time of the current processes
		// $time = 0;
		// $widget_time = start_time();

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$ipo			= $this->ipo;

		$data = [];
		foreach ($ipo as $key => $current_ipo) {

			$input	= $current_ipo->input;
			$output	= $current_ipo->output;

			// get the components from the input object
				// source - the source component with data to be used
				$component_source = array_reduce($input, function ($carry, $item){
					if ($item->type==='source') {
						return $item;
					}
					return $carry;
				});

				// period -  the thesaurus of the periods to be used and match with data
				$component_period = array_reduce($input, function ($carry, $item){

					if ($item->type==='period') {
						return $item;
					}
					return $carry;
				});

				$component_tipo_period		= $component_period->component_tipo;
				$section_tipo_period		= $component_period->section_tipo;
				$target_sections			= $component_period->target_sections;
				$target_model_section_id	= $component_period->target_model_section_id;
				$use_parent					= $component_period->use_parent ?? null;
				$period_model_name			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_period,true); // Expected portal


				// duplicated - to be removed if duplicated coins is set
				$component_duplicated = array_reduce($input, function ($carry, $item){
					if ($item->type==='duplicated') {
						return $item;
					}
					return $carry;
				});
				if (empty($component_duplicated)) {
					debug_log(__METHOD__
						. " !!!!!!!!!!!!!!! Skipped component_duplicated (type == duplicated) not found in input " . PHP_EOL
						. ' input: ' . to_string($input)
						, logger::ERROR
					);
					continue;
				}
				$component_tipo_duplicated	= $component_duplicated->component_tipo;
				$duplicated_modelo_name		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_duplicated,true); // Expected portal


			// Resolve thesaurus
				$ts_sqo = new search_query_object();
					$ts_sqo->set_section_tipo($target_sections);
					$ts_sqo->offset	= 0;
					$ts_sqo->limit	= 0;

				$ts_search = search::get_instance($ts_sqo);
					$ts_search_result	= $ts_search->search();
					$ts_ar_records		= $ts_search_result->ar_records;



				// main term of ts, search in hierarchies section to get the main terms of the thesaurus
				// create a OR statement of sqo for each thesaurus section_tipo
				$filter_or = [];
				foreach ($target_sections as $current_section_tipo) {
					$filter = new stdClass();
						$filter->q = $current_section_tipo;
						$filter->path = json_decode('[{
							"section_tipo": "'.DEDALO_HIERARCHY_SECTION_TIPO.'",
							"component_tipo":"'.DEDALO_HIERARCHY_TARGET_SECTION_TIPO.'"
						}]');
						$filter_or[] = $filter;
				}

				$search_query_object = json_decode('{
					"section_tipo": ["'.DEDALO_HIERARCHY_SECTION_TIPO.'"],
					"filter": {
						"$or": '.json_encode($filter_or).'
					}
				}');

				$hierarchies_search = search::get_instance($search_query_object);
					$hierarchies_search_result	= $hierarchies_search->search();
					$hierarchies_records		= $hierarchies_search_result->ar_records;

				$ordered_hierarchy = [];
				foreach ($hierarchies_records as $current_hierarchy_section_data) {

					$root_hierarchy_children = array_filter($current_hierarchy_section_data->datos->relations, function($el) {
						return $el->from_component_tipo === DEDALO_HIERARCHY_CHILDREN_TIPO;
					});

					foreach ($root_hierarchy_children as $current_locator) {

						$result = $this->get_hierarchy_children_recursive($ts_ar_records, $current_locator, null);
						if (!empty($result)) {
							$ordered_hierarchy = array_merge($ordered_hierarchy, $result);
						}
					}
				}

				$ar_hierarchies = [];
				foreach ($ordered_hierarchy as $section) {
					$hierarchy_object = new stdClass();
						$hierarchy_object->section_id	= $section->section_id;
						$hierarchy_object->section_tipo	= $section->section_tipo;
						$hierarchy_object->parent		= $section->parent;
						$period_label					= ts_object::get_term_by_locator( $hierarchy_object, DEDALO_DATA_LANG, true );
						$hierarchy_object->label		= $period_label;
						$hierarchy_object->count		= null;

						$model = array_find($section->datos->relations, function($el){
							return $el->from_component_tipo === DEDALO_THESAURUS_RELATION_MODEL_TIPO;
						});

						$hierarchy_object->model_section_id = (is_object($model))
							? $model->section_id
							: $target_model_section_id+1; // something different to the target_model

					$ar_hierarchies[] = $hierarchy_object;
				}


			// data
				// search the locators of the component data in the section to get whole data of every coin

				// get the source data, is the coins to count
				$source_component_tipo 	= $component_source->component_tipo;
				$source_section_tipo 	= $component_source->section_tipo;

				// get the source data
				$model_name 	  = RecordObj_dd::get_modelo_name_by_tipo($source_component_tipo,true); // Expected a portal
				$component_portal = component_common::get_instance(
					$model_name,
					$source_component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$source_section_tipo
				);
				// all related objects (coins) to this.
				$component_dato = $component_portal->get_dato();

				if (empty($component_dato)) {
					return [];
				}

				// reduce all locators into a flat array with section_id,
				// it will be used to search all sections with this section_id
				$ar_target_section_id = array_map( function ($item){
					return $item->section_id;
				}, $component_dato);


				$target_component_section_id = array_reduce($input, function ($carry, $item){
					if ($item->type==='target_component_section_id') {
						return $item;
					}
					return $carry;
				});
				// use the section_id of the locators to get the filter by section_id into the search
				// q = "1,4,77,17,34,..."
				$q = implode(',', $ar_target_section_id);
				$sqo_filter = json_decode('
					{
						"$and":[{
								"q": "'.$q.'",
				 				"q_operator": null,
				 				"path": [
				 					'.json_encode($target_component_section_id).'
				 				],
				 				"type": "number",
				 				"component_path": [
				 					"section_id"
				 				],
				 				"lang": "all",
				 				"unaccent": false,
				 				"format": "in_column",
				 				"column_name": "section_id",
				 				"operator": "IN"
						}]}
					');

				$sqo = new search_query_object();
					$sqo->set_section_tipo([$target_component_section_id->section_tipo]);
					$sqo->offset	= 0;
					$sqo->limit		= 0;
					$sqo->set_filter( $sqo_filter );

				$search			= search::get_instance($sqo);
				$search_result	= $search->search();
				$ar_records		= $search_result->ar_records;


			// get the value of the component using portal dato
				$periods = [];
				$empty_period_count = null;

				foreach ($ar_records as $current_section_data) {
					// $component_time = start_time();
					$target_section_id		= $current_section_data->section_id;
					$target_section_tipo	= $current_section_data->section_tipo;

					$relations = $current_section_data->datos->relations;
					$duplicated_dato = array_find($relations, function($el) use($component_tipo_duplicated){
						return $el->from_component_tipo === $component_tipo_duplicated;
					});
					// sample of duplicated dato: object|null
						// {
						//     "type": "dd151",
						//     "section_id": "2",
						//     "section_tipo": "numisdata341",
						//     "from_component_tipo": "numisdata157"
						// }
					if ( is_object($duplicated_dato) && $duplicated_dato->section_id=='2') {
						continue;
					}

					$period_dato = array_filter($relations, function($el) use($component_tipo_period) {
						return $el->from_component_tipo === $component_tipo_period;
					});
					if(empty($period_dato)){
						$empty_period_count++;
					}

					foreach ($period_dato as $current_period) {

						$ts_term = array_find($ar_hierarchies, function($el) use($current_period){
							return $el->section_tipo === $current_period->section_tipo
									&& $el->section_id === $current_period->section_id;
						});
						// Check if the source specify that need any parent with specific model (as "Era" model terms)
						if($use_parent === true){
							// find the parent term with the target model section_id
							$area_term = $this->get_parent_with_specific_model($ar_hierarchies, $ts_term, $target_model_section_id);

							// if the term do not has any parent with the model to find add it to the unknown term (?)
							if(!isset($area_term)){
								$empty_period_count + 1;
							}else{
								// count the coin into the term
								$area_term->count = $area_term->count + 1;
							}

						}else{
							// count the coin into the term
							if(is_object($ts_term)){
								$ts_term->count = $ts_term->count + 1;
							}
						}
					}
				}

				$period = array_filter($ar_hierarchies, function($el){
					return $el->count !== null;
				});
				// add empty period hierarchy at end of the
				if(isset($empty_period_count)){
					$empty_hierarchy = new stdClass();
						$empty_hierarchy->section_id	= null;
						$empty_hierarchy->section_tipo	= null;
						$empty_hierarchy->parent		= null;
						$empty_hierarchy->label			= '?';
						$empty_hierarchy->count			= $empty_period_count;

					$period[] = $empty_hierarchy;
				}

			foreach ($output as $data_map) {
				$current_id = $data_map->id;
				$current_data = new stdClass();
					$current_data->widget 	= get_class($this);
					$current_data->key  	= $key;
					$current_data->id 		= $current_id;
					$current_data->value 	= $$current_id ?? null;
				$data[] = $current_data;
			}
		}//foreach ipo

		 // $time = $time + (start_time()-$widget_time);
		 // dump($time/1000000, ' widget_time ++ '.to_string());

		return $data;
	}//end get_dato




	/**
	* GET_HIERARCHY_CHILDREN_RECURSIVE
	*
	* get the children recursively of the term
	* this function is used to get all children of all terms (thesaurus section) in flat way (not nested)
	*
	* @param array $ts_ar_records // whole thesaurus data in matrix
	* @param object $locator // current section locator to be processed (term of the thesaurus)
	* @param object|null $parent // current parent term of the locator
	* @return array $ar_children
	*/
	private	function get_hierarchy_children_recursive(array $ts_ar_records, object $locator, ?object $parent) : array {
							// find the section with the current component inside the whole thesaurus.
		$ar_children = [];
		$ts_term_section = array_find($ts_ar_records, function($el) use($locator){
			return $el->section_tipo === $locator->section_tipo
					&& $el->section_id === $locator->section_id;
		});
		// if find it, save into the children and get all children of them.
		if(is_object($ts_term_section)){

			$ar_children[] = $ts_term_section;
			// set the parent as himself to be used as reference.
			$ts_term_section->parent = $parent;

			// filter all children of the current thesaurus section.
			$root_hierarchy_children = array_filter($ts_term_section->datos->relations, function($el){
				return $el->from_component_tipo === DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO;
			});
			// if this section has children do recursion
			if(!empty($root_hierarchy_children)){

				foreach ($root_hierarchy_children as $current_locator) {
					$result = $this->get_hierarchy_children_recursive($ts_ar_records, $current_locator, $locator);
					// save the result in a flat array
					if (!empty($result)) {
						$ar_children = array_merge($ar_children, $result);
					}
				}
			}
		}
		return $ar_children;
	}// end get_hierarchy_children_recursive



	/**
	* GET_PARENT_WITH_SPECIFIC_MODEL
	*
	* get the the top parent of specified model
	* this function is used to find the parent of the current term(as locator) that has specific model (in this case 1, named "Era")
	*
	* @param array $ar_hierarchies // whole thesaurus in a processed and reduced format
	* @param object $ts_term // current section locator to be processed (term of the thesaurus)
	* @param string|int $target_model_section_id // current section_id of the model to be found
	* @return object|null $ts_term
	*/
	private function get_parent_with_specific_model(array $ar_hierarchies, object $ts_term, string|int $target_model_section_id) : ?object {

		// check if the current term has the correct model section_id (take account that section_id could be int or string, so cast to int to compare)
		if((int)$ts_term->model_section_id !== (int)$target_model_section_id){

			// if the term doesn't match, get his parent and do the recursion
			$parent = $ts_term->parent;

			// if the term has not parent (top term) is not possible continue, so return null (don''t found)
			if(!isset($parent)){
				return null;
			}
			// find his parent into the whole hierarchies
			$parent_term = array_find($ar_hierarchies, function($el) use($parent){
				return $el->section_tipo === $parent->section_tipo
						&& $el->section_id === $parent->section_id;
			});
			if(!is_object($parent_term)){
				return null;
			}

			return $this->get_parent_with_specific_model($ar_hierarchies, $parent_term, $target_model_section_id);
		}else{
			// if match with the section_id model return it.
			return $ts_term;
		}
	}//end get_parent_with_specific_model



}//end get_coins_by_period
