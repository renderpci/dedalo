# LOCATORS MANAGER ####################################################################################

	/**
	* ADD LOCATOR TO DATO
	* Add element (tag locator) received to locators array (dato) and return resultant array
	* @param $tag_locator
	*	String full tag like '861.0.0'
	* @param $dato
	*	Array of relations. Key=auto, Value=tag,  like '0=>861.0.0, 1=>875.0.0'
	*/
	public static function add_locator_to_dato(object $tag_locator, array $dato) {

		$locator_exists=false;
		foreach ($dato as $key => $current_locator_obj) {
			if ((object)$tag_locator==(object)$current_locator_obj) {
				$locator_exists=true; break;
			}
			#dump( (object)$tag_locator == (object)$current_locator_obj ,"equal $key");
		}
			#dump($dato,"locator_exists");

		if (!$locator_exists) {
			array_push($dato, $tag_locator);
		}

		return $dato;
	}
	/**
	* REMOVE LOCATOR TO DATO
	* Remove element (tag locator) received on relations/portal array (dato) and return resultant array
	* !Important: force build new array to keep numeric key correlation (maintain json array format in matrix)
	* @param $tag_locator
	*	String full tag like '861.0.0'
	* @param $dato
	*	Array of relations. Key=auto, Value=tag,  like '0=>861.0.0,1=>875.0.0'
	*/
	public static function remove_locator_to_dato($tag_locator, $dato) {

		if(!is_array($dato)) return NULL;

		$ar_final = array();
		foreach ($dato as $current_target) {

			if ($current_target != $tag_locator) {
				# !Important: rebuilding array from index 0 (mantains json format)
				$ar_final[] = $current_target;
			}
		}

		return $ar_final;
	}
	/**
	* BUILD_LOCATOR : For index only
	*/
	public static function build_locator($section_top_tipo=null, $section_top_id_matrix=null, $section_id_matrix=null, $component_tipo='0', $tag_id='0') {

		if ( empty($section_top_tipo) || strpos($section_top_tipo,'dd')===false ) {
			throw new Exception("Error Processing Request: build_locator - section_top_tipo is empty", 1);
		}
		if (empty($section_top_id_matrix) || $section_top_id_matrix=='0') {
			throw new Exception("Error Processing Request: build_locator - section_top_id_matrix is empty", 1);
		}
		if (empty($section_id_matrix)) {
			throw new Exception("Error Processing build_locator Request: build_locator - section_id_matrix is empty", 1);
		}

		$rel_locator = new stdClass();
		$rel_locator->section_top_tipo		= (string)$section_top_tipo;
		$rel_locator->section_top_id_matrix	= (string)$section_top_id_matrix;
		$rel_locator->section_id		= (string)$section_id;
		$rel_locator->component_tipo 		= (string)$component_tipo;
		$rel_locator->tag_id				= (string)$tag_id;


		/* OLD WORLD
		$ar_parts = array();
		$ar_parts['section_top_tipo']		= $section_top_tipo;
		$ar_parts['section_top_id_matrix'] 	= $section_top_id_matrix;
		$ar_parts['section_id_matrix']		= $section_id_matrix;
		$ar_parts['component_tipo'] 		= $component_tipo;
		$ar_parts['tag_id']					= $tag_id;

		$rel_locator = implode('.', $ar_parts);
			#dump($rel_locator,'$rel_locator');
		*/
		return $rel_locator ;
	}
	/**
	* GET_LOCATOR_AS_OBJ : For index only
	*/
	/*
	$section_top_tipo		= $ocator_as_obj->section_top_tipo;
	$section_top_id_matrix	= $ocator_as_obj->section_top_id_matrix;
	$section_id_matrix		= $ocator_as_obj->section_id_matrix;
	$component_tipo			= $ocator_as_obj->component_tipo;
	$tag_id					= $ocator_as_obj->tag_id;
	*/
	public static function get_locator_as_obj($rel_locator) {

		$ar_bits = explode('.', $rel_locator);

		if(	!isset($ar_bits[0]) || !isset($ar_bits[1]) || !isset($ar_bits[2]) || !isset($ar_bits[3]) || !isset($ar_bits[4]) ) {
			dump($rel_locator,'$rel_locator');
			throw new Exception("Error Processing Request. Wrong rel_locator format ($rel_locator)", 1);
		}

		$ar_parts['section_top_tipo']		= $ar_bits[0];
		$ar_parts['section_top_id_matrix'] 	= $ar_bits[1];
		$ar_parts['section_id_matrix']		= $ar_bits[2];
		$ar_parts['component_tipo'] 		= $ar_bits[3];
		$ar_parts['tag_id']					= $ar_bits[4];

		$obj = (object) $ar_parts;
			#dump($obj);

		return $obj;
	}
	public static function build_locator_from_obj($locator_obj) {
		return component_common::build_locator($locator_obj->section_top_tipo, $locator_obj->section_top_id_matrix, $locator_obj->section_id_matrix, $locator_obj->component_tipo, $locator_obj->tag_id);
	}


	/**
	* BUILD_LOCATOR_RELATION : For relation only
	*/
	public static function build_locator_relation($section_id_matrix=null, $component_tipo='0', $tag_id='0') {

		if (empty($section_id_matrix)) {
			throw new Exception("Error Processing build_locator Request: build_locator - section_id_matrix is empty", 1);
		}

		$ar_parts = array();
		$ar_parts['section_id_matrix']		= $section_id_matrix;
		$ar_parts['component_tipo'] 		= $component_tipo;
		$ar_parts['tag_id']					= $tag_id;

		$rel_locator = implode('.', $ar_parts);
			#dump($rel_locator,'$rel_locator');

		return $rel_locator ;
	}
	/**
	* GET_LOCATOR_RELATION_AS_OBJ : For relation only
	*/
	public static function get_locator_relation_as_obj($rel_locator) {
		#dump($rel_locator,'$rel_locator');
		$ar_bits = explode('.', $rel_locator);

		if(	!isset($ar_bits[0]) || !isset($ar_bits[1]) || !isset($ar_bits[2]) ) {
			#dump($rel_locator,'$rel_locator');
			trigger_error("Error Processing Request. Wrong rel_locator format : '$rel_locator' ");
			return false;
		}

		$ar_parts = array();
		$ar_parts['section_id_matrix']		= $ar_bits[0];
		$ar_parts['component_tipo'] 		= $ar_bits[1];
		$ar_parts['tag_id']					= $ar_bits[2];

		$obj = (object) $ar_parts;
			#dump($obj);

		return $obj;
	}