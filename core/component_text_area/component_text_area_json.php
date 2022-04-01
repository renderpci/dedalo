<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$modo			= $this->get_modo();
	$lang			= $this->get_lang();


// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {

			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context_simple($permissions);
				$context[]		=$this->context;
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context($permissions);
				$context[]		=$this->context;

				// add buttons
				//	$context = array_merge($context, $this->get_structure_buttons($permissions));
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// Value
		switch ($modo) {
			case 'list':
				$dato	= $this->get_dato();
				$value	= component_common::extract_component_dato_fallback($this, DEDALO_DATA_LANG, DEDALO_DATA_LANG_DEFAULT);
				$total	= count($value)>0 ? count($value) : 1;
				foreach ($value as $key => $current_value) {
					$value[$key] = common::truncate_html( ceil(200/$total), $current_value, true);
				}
				// check value fallback
				if (!empty($dato) && (empty($value[0]) && $value[0]!=='')) {
					$value[0] = 'Error on extract_component_dato_fallback ['.$lang.'] for '.json_encode($dato);
				}
				$fallback_value = null; // not necessary here because value is already fallback
				break;
			case 'edit':
			default:
				$value			= $this->get_dato();
				$fallback_value	= (empty($value) || isset($value[0]) && empty($value[0]) || ($value[0]==='<br data-mce-bogus="1">') || !isset($patata))
					? (function(){
						$dato_fallback	= component_common::extract_component_dato_fallback($this, $lang=DEDALO_DATA_LANG, $main_lang=DEDALO_DATA_LANG_DEFAULT);
						$value			= common::truncate_html(700, $dato_fallback[0], true); // $maxLength, $html, $isUtf8=true
						if (!empty($value) && strlen($value)<strlen($dato_fallback[0])) {
							$value .= ' ...';
						}
						return $value;
					  })()
					: null;
				break;
		}


				// dump($fallback_value, ' fallback_value ++ '.to_string($this->tipo));

		// data item
		$item = $this->get_data_item($value);
			$item->parent_tipo			= $this->get_tipo();
			$item->parent_section_id	= $this->get_section_id();
			$item->fallback_value		= $fallback_value;

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
