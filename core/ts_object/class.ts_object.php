<?php
/*
* CLASS TS_OBJECT
* Manage tesaurus hierarchycal elements. Every element is a section used as thesaurus term
*
*/
class ts_object {


	# int (mandatory)
	protected $section_id;
	# string (mandatory)
	protected $section_tipo;
	# object
	protected $section;
	# mixed object|null (default null)
	protected $options;
	# string (default 'edit')
	protected $mode;
	# int
	public $order;

	public $ar_elements;



	/**
	* __CONSTRUCT
	* @param int $section_id
	* @param string $section_tipo
	* @param object $options
	*	Default null
	* @param string $mode
	*	Default 'edit'
	*/
	public function __construct( int $section_id, string $section_tipo, object $options=null, string $mode='edit' ) {

		$this->section_id   = $section_id;
		$this->section_tipo = $section_tipo;

		# Build and set current section obj
		$this->section = section::get_instance( $section_id, $section_tipo );

		# Fix options
		$this->options = $options;

		# Fix mode
		$this->mode = $mode;

		# Set default order
		$this->order = 1000; // Default is 1000. When get_html is called, this var is updated with component value if exits and have data
	}//end __construct



	/**
	* GET_HTML
	* @return string $html
	*/
	public function get_html() : string {

		ob_start();
		include ( dirname(__FILE__) .'/'. get_class() .'.php' );
		$html = ob_get_clean();

		return (string)$html;
	}//end get_html



	/**
	* GET_AR_ELEMENTS
	* Get elements from section_list_thesaurus -> properties
	* @return array $ar_elements
	*/
	public static function get_ar_elements( string $section_tipo, ?bool $model=false ) : array {

		$ar_elements = array();

		// Elements are stored in current section > section_list_thesaurus
		// Search element in current section
			$ar_modelo_name_required = array('section_list_thesaurus');

		// Search in current section
			$ar_children  = section::get_ar_children_tipo_by_modelo_name_in_section(
				$section_tipo, // tipo
				$ar_modelo_name_required, // ar_modelo_name_required
				true, // from_cache
				false, // resolve_virtual
				false, // recursive
				true // search_exact
			);
			# relation map defined in properties
			$ar_properties = (function($ar_children){
				if (!isset($ar_children[0])) {
					return false;
				}
				$RecordObj_dd	= new RecordObj_dd($ar_children[0]);
				return $RecordObj_dd->get_properties();
			})($ar_children);

			// Fallback to real section when in virtual
			if (empty($ar_properties)) {
				$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
				if ($section_tipo!==$section_real_tipo) {
					$ar_children  = section::get_ar_children_tipo_by_modelo_name_in_section(
						$section_real_tipo,
						$ar_modelo_name_required,
						true, // from_cache
						false, // resolve_virtual
						false, // recursive
						true // search_exact
					);
					# relation map defined in properties
					$RecordObj_dd	= new RecordObj_dd($ar_children[0]);
					$ar_properties	= $RecordObj_dd->get_properties();
				}
			}//end if (!isset($ar_children[0]))


		# If element exists (section_list_thesaurus) we get element 'properties' json value as array
		# dump($ar_children, ' ar_children ++ '.to_string($section_tipo));
			if ( !empty($ar_properties) ) {

				// DES
					// # SUBSTITUTION : When is set $this->options->model as true, we substitute structure properties link_children with link_children_model
					// # for look children in other hierarchy component children
					// if (isset($this->options->model) && $this->options->model===true) {
					// 	foreach ($ar_elements as $key => $value_obj) {
					// 		if ($value_obj->type==='link_children') {
					// 			unset($ar_elements[$key]);
					// 		}elseif ($value_obj->type==='link_children_model') {
					// 			$value_obj->type = 'link_children';
					// 		}
					// 	}
					// }

					// [
					//   {
					//     "tipo": "hierarchy5",
					//     "type": "term"
					//   },
					//   {
					//     "tipo": "hierarchy45",
					//     "type": "link_children"
					//   },
					//   {
					//     "tipo": "hierarchy59",
					//     "type": "link_children_model"
					//   }
					// ]

					// if (isset($this->options->model) && $this->options->model===true) {

					// 	$element_children = new stdClass();
					// 		$element_children->type = 'link_children';
					// 		$element_children->tipo = null;

					// 		foreach ($ar_properties as $key => $value_obj) {
					// 			if($value_obj->type === 'link_children_model'){
					// 				$element_children->tipo = $value_obj->tipo;
					// 				break;
					// 			}
					// 		}

					// 	$ar_elements = array();
					// 	foreach ($ar_properties as $key => $value_obj) {
					// 		if($value_obj->type === 'link_children' || $value_obj->type === 'link_children_model'){
					// 			#unset($ar_properties[$key]);
					// 		}else{
					// 			$ar_elements[] = $value_obj;
					// 		}
					// 	}

					// 	$ar_elements[] = $element_children;
					// }else{
					// 	$ar_elements = $ar_properties;
					// }
					// debug_log(__METHOD__." ar_elements ".to_string($ar_elements), logger::DEBUG);

				foreach ($ar_properties as $key => $value_obj) {

					if (!isset($model) && ($value_obj->type==='link_childrens_model' || $value_obj->type==='link_children_model')) {
						unset($ar_properties[$key]);
					}else if (isset($model) && $model===true) {
						if (($value_obj->type==='link_childrens' || $value_obj->type==='link_children') && $section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
							unset($ar_properties[$key]);
						}else if ($value_obj->type==='link_childrens_model' || $value_obj->type==='link_children_model') {
							$value_obj->type = 'link_children';
						}
					}

					if ($value_obj->type==='link_childrens_model' || $value_obj->type==='link_childrens') {
						$value_obj->type = 'link_children';
					}

				}//end foreach ($ar_properties as $key => $value_obj)
				$ar_elements = array_values($ar_properties);
				#debug_log(__METHOD__." ar_properties ".to_string($ar_properties), logger::DEBUG);
			}


		return $ar_elements;
	}//end get_ar_elements



	/**
	* GET_CHILDREN_DATA
	* @return object $children_data
	*/
	public function get_children_data() : object {
		if(SHOW_DEBUG===true) $start_time=start_time();

		# Global object
		$children_data = new stdClass();
			$children_data->section_tipo				= $this->section_tipo;
			$children_data->section_id					= $this->section_id;
			$children_data->mode						= 'edit';	//'list_thesaurus';
			$children_data->lang						= DEDALO_DATA_LANG;
			$children_data->is_descriptor				= true;
			$children_data->is_indexable				= (bool)self::is_indexable($this->section_tipo, $this->section_id);
			$children_data->permissions_button_new		= $this->get_permissions_element('button_new');
			$children_data->permissions_button_delete	= $this->get_permissions_element('button_delete');
			$children_data->permissions_indexation		= $this->get_permissions_element('component_relation_index');
			$children_data->permissions_structuration	= $this->get_permissions_element('component_relation_struct');

			$children_data->ar_elements = array();

		// model
			$model = $this->options->model ?? null; // options are fixed on construct the class

		# elements
		$ar_elements = ts_object::get_ar_elements($this->section_tipo, $model);
		foreach ($ar_elements as $k_element_tipo => $current_object) {

			// element_tipo
				$element_tipo = $current_object->tipo;
				if (empty($element_tipo)) {
					debug_log(__METHOD__." Error. Empty element_tipo in current_object: ".to_string($current_object), logger::DEBUG);
					continue;
				}

			// render_vars
				$render_vars = $current_object;

			// No descriptors do not have children. Avoid calculate children
				if ($children_data->is_descriptor===false && $render_vars->type==='link_children') {
					continue;
				}

			# Each element
			$element_obj = new stdClass();
				$element_obj->type	= $render_vars->type;
				$element_obj->tipo	= $element_tipo;

				$modelo_name			= RecordObj_dd::get_modelo_name_by_tipo($element_tipo,true);
				// $legacy_model_name	= RecordObj_dd::get_legacy_model_name_by_tipo($element_tipo);
				$lang					= common::get_element_lang($element_tipo, $data_lang=DEDALO_DATA_LANG);
				$component				= component_common::get_instance($modelo_name,
																		 $element_tipo,
																		 $this->section_id,
																		 'list_thesaurus',
																		 $lang,
																		 $this->section_tipo);
				$dato = $component->get_dato();
				if ($modelo_name==='component_autocomplete_hi' || $modelo_name==='component_portal') {

					$dato = $component->get_valor();

				}else if ($modelo_name==='component_input_text') {

					$dato = $component->get_valor();

				}else if ($modelo_name==='component_relation_related') {

					# Add inverse related (bidirectional only)
					# dump($dato, ' dato ++ '.to_string($element_tipo));
					$type_rel = $component->get_type_rel();

					if($type_rel!==DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO){
						$component_rel = $component->get_references(); //$component->relation_type_rel
						#$inverse_related = component_relation_related::get_inverse_related($this->section_id, $this->section_tipo, DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO);
						$dato = array_merge($dato, $component_rel);
					}

				}else if ($modelo_name==='component_svg'){

					# file exists check
					$file_path	= $component->get_file_path();
					$file_url	= (file_exists($file_path)===true)
						? $component->get_url() . '?' . start_time()
						: '';

					$dato = $file_url;
				}


				#if ($element_tipo==='hierarchy25') {
				#	debug_log(__METHOD__." dato $modelo_name - element_tipo:$element_tipo - section_id:$this->section_id - $lang - valor:". $component->get_valor($lang).' - dato:'. to_string($dato), logger::DEBUG);
				#}

				#if (isset($ar_elements[$k_element_tipo])) {
					#dump($element_obj->type, ' $element_obj->type ++ '.to_string());
				#debug_log(__METHOD__." render_vars ".to_string($render_vars), logger::DEBUG);
				#}
				#debug_log(__METHOD__." k_element_tipo ".to_string($k_element_tipo), logger::DEBUG);
				#debug_log(__METHOD__." element_obj ".to_string($element_obj), logger::DEBUG);
				#debug_log(__METHOD__." render_vars ".to_string($render_vars), logger::DEBUG);

				switch (true) {
					case ($element_obj->type==='term'):
						# term Is traducible and uses lang fallback here
						// $value, $tipo, $parent, $mode, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null
						if (empty($dato)) {
							$modelo_name_term 	= RecordObj_dd::get_modelo_name_by_tipo($element_tipo,true);
							$element_value 		= component_common::extract_component_value_fallback($component);
						}else{
							$element_value = $dato;
						}
						$element_obj->value = $element_value;
							#dump($element_obj->value, '$element_obj->value ++ '.to_string( $element_tipo));
							#debug_log(__METHOD__." dato $modelo_name - element_tipo:$element_tipo - section_id:$this->section_id - $lang - valor:". $component->get_valor($lang).' - dato:'. to_string($dato), logger::DEBUG);
							#debug_log(__METHOD__." element_obj->value $element_tipo ".to_string($dato).' - '.DEDALO_DATA_LANG, logger::DEBUG);
						break;

					case ($element_obj->type==='icon'):

						if($render_vars->icon==='CH') {
							continue 2;
						}

						// ND element can change term value when 'esdecriptor' value is 'no' (locator of 'no')
							if($render_vars->icon==='ND') {
								#debug_log(__METHOD__." children_data->ar_elements ".to_string($children_data->ar_elements), logger::DEBUG);
								#debug_log(__METHOD__." dato->section_id ".to_string($dato), logger::DEBUG);
								if (isset($dato[0]) && isset($dato[0]->section_id) && (int)$dato[0]->section_id===2) {
									ts_object::set_term_as_nd($children_data->ar_elements);
									$children_data->is_descriptor = false;
								}
								continue 2;
							}

						# icon Not need more info. Value is property 'type'
						$element_obj->value = $render_vars->icon;

						// dato check
							if(empty($dato)) continue 2; // Skip empty icon value links

						if ($modelo_name==='component_relation_index' || $modelo_name==='component_relation_struct') {
							#dump($dato, ' dato ++ '.to_string($element_tipo));
							$total = count($dato);
							$element_obj->value .= ':' . $total;
						}
						break;

					case ($element_obj->type==='link_children'):

						# D : Descriptors
						$element_obj->value = ($this->have_children_of_type($dato, 'descriptor')===true)
							? 'button show children'
							: 'button show children unactive';

						# ND : No descriptors case
						if($this->have_children_of_type($dato, 'nd')===true) {

							$nd_element = new stdClass();
								$nd_element->type	= 'link_children_nd';
								$nd_element->tipo	= $element_tipo;
								$nd_element->value	= 'ND';

							$children_data->ar_elements[] = $nd_element;
						}
						break;

					default:
						$element_obj->value = $dato;
						break;
				}

			# Add
			$children_data->ar_elements[] = $element_obj;
		}//end foreach ($ar_elements as $k_element_tipo => $current_object)

		// debug
			if(SHOW_DEBUG===true) {
				// $total = round( (start_time()-$start_time), 3 );
				#debug_log(__METHOD__." Total ($n): ".exec_time_unit($start_time,'ms')." ms - ratio(total/n): " . ($total/$n), logger::DEBUG);
				// $children_data->total_time = $total;
				// error_log('********************* get_children_data total:'. exec_time_unit($start_time,'ms'));
			}


		return $children_data;
	}//end get_children_data



	/**
	* HAVE_CHILDREN_OF_TYPE
	* @return bool
	*/
	public function have_children_of_type( array $ar_children, string $type ) : bool {

		if (empty($ar_children)) {
			return false;
		}

		$descriptor_value = ($type==='descriptor') ? 1 : 2;  # 1 for descriptors, 2 for non descriptors

		foreach($ar_children as $key => $current_locator) {

			$section_map = section::get_section_map( $current_locator->section_tipo );
			if (empty($section_map) || !isset($section_map->thesaurus->is_descriptor)) {
				debug_log(__METHOD__." Invalid section_map 'is_descriptor' property from section $current_locator->section_tipo ".to_string($section_map), logger::ERROR);
				continue;
			}

			$component_tipo	= $section_map->thesaurus->is_descriptor;
			$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $current_locator->section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $current_locator->section_tipo);
			$dato = $component->get_dato();

			// When first element is found, return true
			if (isset($dato[0]) && isset($dato[0]->section_id) && (int)$dato[0]->section_id===$descriptor_value) {
				return true;
			}
		}


		return false;
	}//end have_children_of_type



	/**
	* IS_INDEXABLE
	* @return bool
	*/
	public static function is_indexable( string $section_tipo, int $section_id ) : bool {

		if (strpos($section_tipo, 'hierarchy')===0) {
			# Root hierarchies are always false
			return false;
		}

		$section_map = section::get_section_map( $section_tipo );
		if (!isset($section_map->thesaurus->is_indexable)) {
			debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $section_tipo ".to_string($section_map), logger::DEBUG);
			return false;
		}

		if ($section_map->thesaurus->is_indexable===false) {
			# properties set as false case
			return false;
		}

		$component_tipo = $section_map->thesaurus->is_indexable;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component 	 	= component_common::get_instance($modelo_name,
														 $component_tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		$dato = $component->get_dato();

		$indexable_value = 1; // Yes

		// When firts element is found, return true
		if (isset($dato[0]) && isset($dato[0]->section_id) && (int)$dato[0]->section_id===$indexable_value) {
			return true;
		}

		return false;
	}//end is_indexable



	/**
	* GET_DESCRIPTORS_FROM_CHILDREN
	* @return
	*/
		// public static function get_descriptors_from_children__DES( $ar_children ) {

		// 	$ar_descriptors = array();

		// 	foreach ((array)$ar_children as $key => $current_locator) {

		// 		$section_map = section::get_section_map( $current_locator->section_tipo );
		// 		#dump($section_map['thesaurus']->is_descriptor, ' $section_map ++ '.to_string($current_locator->section_tipo));

		// 		if (!isset($section_map['thesaurus']->is_descriptor)) {
		// 			debug_log(__METHOD__." Invalid section_map 'is_descriptor' property fro section $current_locator->section_tipo ".to_string($section_map), logger::ERROR);
		// 			continue;
		// 		}

		// 		$component_tipo = $section_map['thesaurus']->is_descriptor;

		// 		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		// 		$component 	 = component_common::get_instance($modelo_name,
		// 													  $component_tipo,
		// 													  $current_locator->section_id,
		// 													  'list',
		// 													  DEDALO_DATA_NOLAN,
		// 													  $current_locator->section_tipo);
		// 		$dato = $component->get_dato();

		// 		if (isset($dato[0]) && isset($dato[0]->section_id) && (int)$dato[0]->section_id===1) {
		// 			$ar_descriptors[] = $current_locator;
		// 		}
		// 	}


		// 	return $ar_descriptors;
		// }//end get_descriptors_from_children



	/**
	* SET_TERM_AS_ND
	* Modifies received array data on term to set as ND (no descriptor)
	* @return array $ar_elements
	*/
	public static function set_term_as_nd( array &$ar_elements ) : array {

		foreach ($ar_elements as $key => $obj_value) {

			if ($obj_value->type==='term') {
				if(SHOW_DEBUG===true) {
					if (!is_string($obj_value->value)) {
						#dump($obj_value->value, '$obj_value->value ++ EXPECTED STRING. Instead received type: '.gettype($obj_value->value) ." - ".to_string($obj_value->value));
						debug_log(__METHOD__."  ".'$obj_value->value ++ EXPECTED STRING. But received type: '.gettype($obj_value->value) ." - value:".to_string($obj_value->value), logger::ERROR);
					}
				}
				$ar_elements[$key]->value = '<span class="no_descriptor">' . $obj_value->value . '</span>';
				break;
			}
		}

		return $ar_elements;
	}//end set_term_as_nd



	/**
	* GET_TERM_BY_LOCATOR
	* Resolve locator to string value to show in list etc.
	* @param object $locator
	* @param string $lang = DEDALO_DATA_LANG
	* @param bool $from_cache = false
	*
	* @return string|null $valor
	*/
	public static function get_term_by_locator(object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false) : ?string {

		$valor = null;

		// check locator->section_tipo mandatory property
			if (!property_exists($locator, 'section_tipo')) {
				if(SHOW_DEBUG===true) {
					#throw new Exception("Error Processing Request. locator is not object: ".to_string($locator), 1);
					debug_log(__METHOD__." ERROR on get term. locator is not of type object: ".gettype($locator)." FALSE VALUE IS RETURNED !", logger::ERROR);
				}
				return $valor; // null
			}

		// Cache control (session)
			$cache_uid = $locator->section_tipo.'_'.$locator->section_id.'_'.$lang;
			#if ($from_cache===true && isset($_SESSION['dedalo']['config']['term_by_locator'][$cache_uid])) {
			#	return $_SESSION['dedalo']['config']['term_by_locator'][$cache_uid];
			static $term_by_locator_data;
			if ($from_cache===true && isset($term_by_locator_data[$cache_uid])) {
				return $term_by_locator_data[$cache_uid];
			}

		// thesaurus_map conditional value
			$section_map	= section::get_section_map($locator->section_tipo);
			$thesaurus_map	= isset($section_map->thesaurus) ? $section_map->thesaurus : false;
			if ($thesaurus_map===false) {

				$valor = $locator->section_tipo .'_'. $locator->section_id ;
				if(isset($locator->component_tipo))
					$valor .= '_'. $locator->component_tipo;
				if(isset($locator->tag_id))
					$valor .= '_'. $locator->tag_id;
			}else{

				$term		= is_array($thesaurus_map->term) ? $thesaurus_map->term : [$thesaurus_map->term]; // source could be an array or string
				$ar_valor	= [];
				foreach ($term as $tipo) {

					$parent			= $locator->section_id;
					$section_tipo	= $locator->section_tipo;
					$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					// debug
						// if(SHOW_DEBUG===true) {
						// 	$real_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
						// 	if ($real_modelo_name!==$modelo_name) {
						// 		trigger_error("Error. modelo_name of component $tipo must be $modelo_name. $#real_modelo_name is defined");#
						// 	}
						// }
					$component = component_common::get_instance(
						$modelo_name,
						$tipo,
						$parent,
						'edit',
						$lang,
						$section_tipo
					);
					$current_value = $component->get_valor($lang);
					if (!empty($current_value)) {
						$ar_valor[] = $current_value;
					}
				}
				$valor = implode(', ', $ar_valor);

				if (empty($valor)) {

					$main_lang = hierarchy::get_main_lang( $locator->section_tipo );
					#	#dump($main_lang, ' main_lang ++ '.to_string($locator->section_tipo));
					#if($lang!==$main_lang) {
					#	$component->set_lang($main_lang);
					#	$valor = $component->get_valor($main_lang);
					#	if (strlen($valor)>0) {
					#		$valor = component_common::decore_untranslated( $valor );
					#	}
					#
					#	# return component to previous lang
					#	$component->set_lang($lang);
					#}
					#
					#if (empty($valor)) {

						$dato_full = $component->get_dato_full();
						# get_value_with_fallback_from_dato_full( $dato_full_json, $decore_untranslated=false, $main_lang=DEDALO_DATA_LANG_DEFAULT)
						$valor = component_common::get_value_with_fallback_from_dato_full($dato_full, true, $main_lang);
						if (is_array($valor)) {
							$valor = implode(', ', $valor);
						}
						#dump($valor, ' valor ++ '.to_string());
					#}
				}
			}
			#dump($valor, ' valor ++ '.to_string($locator->section_tipo."-".$locator->section_id));

		/*
			# En proceso. De momento devuelve el locator en formato json, sin resolver..
			if (!isset($valor)) {
				$valor = json_encode($locator);
			}

			if(SHOW_DEBUG===true) {
				$valor .= " <span class=\"debug_info notes\">".json_encode($locator)."</span>";
			}
			*/

		// cache control
			// $_SESSION['dedalo']['config']['term_by_locator'][$cache_uid] = $valor;
			$term_by_locator_data[$cache_uid] = $valor;


		return $valor;
	}//end get_term_by_locator



	/**
	* GET_COMPONENT_ORDER_TIPO
	* @return string|null $element_tipo
	*/
	public static function get_component_order_tipo( string $section_tipo ) : ?string {

		# Calculated way
		$element_tipo = hierarchy::get_element_tipo_from_section_map( $section_tipo, 'order' );
		#debug_log(__METHOD__." ORDER TIPO: ".to_string($element_tipo), logger::DEBUG);

		return $element_tipo;
	}//end get_component_order_tipo



	/**
	* GET_PERMISSIONS_ELEMENT
	* @return int $permissions
	*/
	public function get_permissions_element( string $element_name ) : int {

		switch ($element_name) {
			case 'button_new':
				if ($this->section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
					$tipo = DEDALO_HIERARCHY_BUTTON_NEW_TIPO;
					$permissions = common::get_permissions($this->section_tipo,$tipo);
				}elseif ($this->section_tipo===DEDALO_THESAURUS_SECTION_TIPO) {
					$tipo = DEDALO_THESAURUS_BUTTON_NEW_TIPO;
					$permissions = common::get_permissions($this->section_tipo,$tipo);
				}else{
					$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($this->section_tipo, [$element_name], $from_cache=true, $resolve_virtual=true, $recursive=false, $search_exact=true);
					# dump($ar_children, ' ar_children ++ '.to_string());
					if (isset($ar_children[0])) {
						$permissions = common::get_permissions($this->section_tipo, $ar_children[0]);
					}else{
						$permissions = 0;
					}
				}
				break;
			case 'button_delete':
				# hierarchy1 case
				if ($this->section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
					$permissions = 0; // Always is 0
				}elseif ($this->section_tipo===DEDALO_THESAURUS_SECTION_TIPO) {
					$tipo = DEDALO_THESAURUS_BUTTON_DELETE_TIPO;
					$permissions = common::get_permissions($this->section_tipo,$tipo);
				}else{
					$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($this->section_tipo, [$element_name], $from_cache=true, $resolve_virtual=true, $recursive=false, $search_exact=true);
					# dump($ar_children, ' ar_children ++ '.to_string());
					if (isset($ar_children[0])) {
						$permissions = common::get_permissions($this->section_tipo, $ar_children[0]);
					}else{
						$permissions = 0;
					}
				}
				break;
			default:
				$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section(
					$this->section_tipo,
					[$element_name], // ar_model_name
					$from_cache=true,
					$resolve_virtual=true,
					$recursive=true,
					$search_exact=true
				);
				# dump($ar_children, ' ar_children ++ '.to_string());
				if (isset($ar_children[0])) {
					$permissions = common::get_permissions($this->section_tipo, $ar_children[0]);
				}else{
					$permissions = 0;
					// debug_log(__METHOD__." ERROR. Element not defined: $element_name . Zero value is returned as permissions ".to_string(), logger::DEBUG);
				}
				break;
		}//end switch ($element_name)


		return (int)$permissions;
	}//end get_permissions_element



	# ACCESSORS
	final public function __call(string $strFunction, array $arArguments) {

		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' :
				if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
				return($this->SetAccessor($strMethodMember, $arArguments[0]));
				break;
			case 'get_' :
				return($this->GetAccessor($strMethodMember));
				break;
		}
		return(false);
	}
	# SET
	final protected function SetAccessor(string $strMember, $strNewValue) : bool {

		if(property_exists($this, $strMember)) {

			// fix value
			$this->$strMember = $strNewValue;

			return true;
		}else{
			return false;
		}
	}
	# GET
	final protected function GetAccessor(string $strMember) {

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor



}//end class ts_object
