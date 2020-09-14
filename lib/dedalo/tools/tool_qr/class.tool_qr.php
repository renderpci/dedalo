<?php
/*
* CLASS TOOL_QR
*
*
*/
class tool_qr extends tool_common {

	

	# component
	protected $section_tipo ;
	public $search_options;



	/**
	* __CONSTRUCT
	*/
	public function __construct($section_tipo, $modo='button') {
			
		# Fix modo
		$this->modo = $modo;

		// fix section tipo. (!) To unify tools vars, param section_tipo could be a full section object in some cases	
		$this->section_tipo = (is_object($section_tipo))
			? $section_tipo->get_tipo()
			: $section_tipo;

		# Fix search options
		$search_options_id		= $this->section_tipo; // section tipo like oh1
		$saved_search_options	= section_records::get_search_options( $search_options_id );
		
		// save cloned version of saved_search_options	
		$this->search_options = unserialize(serialize($saved_search_options));

		return true;
	}//end __construct



	/**
	* GET_DATA
	* 
	* @return array $data
	*/
	public function get_data($source_list) {
		
		$search_query_object = $this->search_options->search_query_object ?? null;

		if (!$search_query_object) {
			return [];
		}

		// search_query_object : change some params
			$search_query_object->limit		= false;
			$search_query_object->offset	= 0;
			$search_query_object->select	= [];

		// Search
			$search_development2	= new search_development2($search_query_object);
			$rows_data				= $search_development2->search();
			$ar_records				= (array)$rows_data->ar_records;
			// $total_records		= (int)$this->search_options->search_query_object->full_count;

		// logo
			$logo = $source_list->logo ?? null;

		// data
			$data = array_map(function($row) use($logo, $source_list){

				// label
					$label = isset($source_list->label)
						? self::get_value($source_list->label, 0, $row->section_id)
						: null;

				// image
					$image = isset($source_list->image)
						? self::get_value($source_list->image, 0, $row->section_id)
						: null;

				$item = new stdClass();
					$item->section_tipo	= $row->section_tipo;
					$item->section_id	= $row->section_id;
					$item->url			= tool_qr::build_url($row->section_tipo, $row->section_id);
					$item->logo			= $logo;
					$item->label		= $label;
					$item->image		= $image;


				return $item;
			}, $ar_records);
		

		return (array)$data;
	}//end get_data



	/**
	* GET_VALUE
	* @return string $valor;
	*/
	public static function get_value($path, $key=0, $section_id) {

		// components_with_relations
			$components_with_relations = component_relation_common::get_components_with_relations();
		

		$component_tipo = $path[$key]->component_tipo;
		$section_tipo 	= $path[$key]->section_tipo;
		
		$model		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$lang		= DEDALO_DATA_LANG;
		$component	= component_common::get_instance($model,
													 $component_tipo,
													 $section_id,
													 'list',
													 $lang,
													 $section_tipo);
		$dato = $component->get_dato();

		if (in_array($model, $components_with_relations)) {
			if (isset($path[$key+1]) && !empty($dato)) {
				// first locator
				$first_locator = reset($dato);
				// overwrite path target section tipo to allow autocomplete_hi resolve mjultisection locators
				$path[$key+1]->section_tipo = $first_locator->section_tipo;
				return self::get_value($path, $key+1, $first_locator->section_id);
			}else{
				return $component->get_valor_export();
			}
		}else{
			return $component->get_valor_export();
		}		
	}//end get_value



	/**
	* BUILD_URL
	* @return string $url
	*/
	public static function build_url($section_tipo, $section_id) {

		// $url = DEDALO_PROTOCOL . DEDALO_HOST . DEDALO_TOOL_QR_BASE_URL . '/main/?t=' . $section_tipo .'&id=' . $section_id .'&m=edit';
		$url = 'https://museuquartdepoblet.org/dedalo/lib/dedalo/main/?t=' . $section_tipo .'&id=' . $section_id .'&m=edit';
		
		return $url;
	}//end build_url



}//end tool_qr