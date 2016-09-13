<?php





class hierarchy {



	/**
	* GENERATE_VIRTUAL_SECTION
	* @return 
	*/
	public static function generate_virtual_section( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';
		
		$options = new stdClass();
			$options->section_id   = null;
			$options->section_tipo = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# ACTIVE
		$active_tipo 	= 'hierarchy4';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($active_tipo, true);
		$component 		= component_common::get_instance( $modelo_name,
														  $active_tipo,
														  $options->section_id,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $options->section_tipo);
		$dato 	 = (array)$component->get_dato();
		$locator = reset($dato);
				if( !isset($locator->section_tipo) || $locator->section_tipo!=DEDALO_SECTION_SI_NO_TIPO
				 || !isset($locator->section_id) || $locator->section_id!=NUMERICAL_MATRIX_VALUE_YES) {
				 	$response->result 	= false;
					$response->msg 		= label::get_label('error_generate_hierarchy'); //'Current hierarchy is not active.';
					return $response;
				}

		#
		# TLD
		$tld2_tipo 		= 'hierarchy6';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tld2_tipo, true);
		$component 		= component_common::get_instance( $modelo_name,
														  $tld2_tipo,
														  $options->section_id,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $options->section_tipo);
		$tld2 = strtolower($component->get_dato());	

		#
		# NAME
		$name_tipo 		= 'hierarchy5';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($name_tipo, true);
		$component 		= component_common::get_instance( $modelo_name,
														  $name_tipo,
														  $options->section_id,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $options->section_tipo);
		$name = $component->get_valor();

		#
		# COMMANDS SEQUENCE
		
		#
		# VIRTUAL SECTION . Tesaurus term
		$options = new stdClass();
			$options->terminoID 	= $tld2.'1';
			$options->parent 		= 'dd101';
			$options->modelo 		= 'dd6';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd6":"hierarchy20"}]');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= $name;

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}
		
		#
		# VIRTUAL SECTION MODELO . Model term
		$options = new stdClass();
			$options->terminoID 	= $tld2.'2';
			$options->parent 		= 'dd101';
			$options->modelo 		= 'dd6';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd6":"hierarchy20"}]');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= $name . ' modelos';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SECTION-LIST . terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'3';
			$options->parent 		= $tld2.'1';
			$options->modelo 		= 'dd91';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd9":"hierarchy25"},{"dd9":"hierarchy27"},{"dd10":"hierarchy28"},{"dd57":"hierarchy24"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"}]');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Listado';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SECTION-LIST . MODELO . Model terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'4';
			$options->parent 		= $tld2.'2';
			$options->modelo 		= 'dd91';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd9":"hierarchy25"},{"dd9":"hierarchy27"},{"dd10":"hierarchy28"},{"dd57":"hierarchy24"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"}]');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Listado';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SECTION-EXLUDE-ELEMENTS . terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'5';
			$options->parent 		= $tld2.'1';
			$options->modelo 		= 'dd1129';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Excluidos';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}


		#
		# VIRTUAL SECTION-EXLUDE-ELEMENTS . MODELO . Model terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'6';
			$options->parent 		= $tld2.'2';
			$options->modelo 		= 'dd1129';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Excluidos';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}


		#
		# VIRTUAL SEARCH-LIST . terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'7';
			$options->parent 		= $tld2.'1';
			$options->modelo 		= 'dd524';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd195":"dd196"},{"dd1747":"hierarchy22"},{"dd9":"hierarchy25"},{"dd428":"hierarchy27"},{"dd57":"hierarchy23"},{"dd10":"hierarchy28"},{"dd429":"hierarchy36"},{"dd57":"hierarchy24"},{"dd57":"hierarchy26"},{"dd43":"hierarchy41"},{"dd635":"hierarchy30"},{"dd10":"hierarchy32"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"},{"dd592":"hierarchy40"}]');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Búsqueda';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SEARCH-LIST . MODELO . Model terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'8';
			$options->parent 		= $tld2.'2';
			$options->modelo 		= 'dd524';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd195":"dd196"},{"dd1747":"hierarchy22"},{"dd9":"hierarchy25"},{"dd428":"hierarchy27"},{"dd57":"hierarchy23"},{"dd10":"hierarchy28"},{"dd429":"hierarchy36"},{"dd57":"hierarchy24"},{"dd57":"hierarchy26"},{"dd43":"hierarchy41"},{"dd635":"hierarchy30"},{"dd10":"hierarchy32"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"},{"dd592":"hierarchy40"}]');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Búsqueda';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}


		#
		# VIRTUAL SECTION-LIST-THESARURUS . terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'3';
			$options->parent 		= $tld2.'1';
			$options->modelo 		= 'dd91';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd43":"hierarchy42"},{"dd57":"hierarchy24"},{"dd9":"hierarchy25"},{"dd10":"hierarchy28"},{"dd10":"hierarchy32"},{"dd10":"hierarchy33"},{"dd431":"hierarchy35"},{"dd432":"hierarchy40"},{"dd43":"hierarchy41"},{"dd57":"hierarchy23"},{"dd428":"hierarchy27"},{"dd57":"hierarchy26"}]');
			$options->propiedades 	= json_decode('{
										  "hierarchy42": "change",
										  "hierarchy24": ">>",
										  "hierarchy25": "edit",
										  "hierarchy28": "NA",
										  "hierarchy32": "IN",
										  "hierarchy33": "OB",
										  "hierarchy35": "TR",
										  "hierarchy40": "U",
										  "hierarchy41": "OF",
										  "hierarchy23": "ND",
										  "hierarchy27": "M"
										}');
			$options->tld2 			= $tld2;
			$options->name 			= 'Listado';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SECTION-LIST-THESARURUS . MODELO . Model terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'4';
			$options->parent 		= $tld2.'2';
			$options->modelo 		= 'dd91';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd9":"hierarchy25"},{"dd9":"hierarchy27"},{"dd10":"hierarchy28"},{"dd57":"hierarchy24"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"}]');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Listado';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		
		
		return $response;
		#$section = section::get_instance($section_id, $section_tipo);
	}//end generate_virtual_section



	/**
	* CREATE_TERM
	* Creates new structure term with request params. If term already exists, return false
	* @return object $response
	*/
	public static function create_term( $request_options ) {

		$options = new stdClass();
			$options->terminoID 	= '';
			$options->parent 		= '';
			$options->modelo 		= '';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= '';
			$options->propiedades 	= '';
			$options->tld2 			= '';
			$options->name 			= '';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= '';
		

		# STRUCTURE ELEMENT TEST . Test record exits
		$RecordObj_dd 	= new RecordObj_dd($options->terminoID, $options->tld2);
		$parent_test = $RecordObj_dd->get_parent();
			if (!empty($parent_test)) {
				$response->result 	= false;
				$response->msg 		= "Current hierarchy ($options->terminoID) already exists. Nothing is created. \n";
				return $response;
			}

		$ar_childrens = RecordObj_dd::get_ar_childrens($options->parent);
		$norden 	  = (int)count($ar_childrens)+1;
			
		# Defaults
		$RecordObj_dd->set_terminoID($options->terminoID);
		$RecordObj_dd->set_parent($options->parent);
		$RecordObj_dd->set_modelo($options->modelo);
		$RecordObj_dd->set_esmodelo($options->esmodelo);
		$RecordObj_dd->set_esdescriptor($options->esdescriptor);
		$RecordObj_dd->set_visible($options->visible);
		$RecordObj_dd->set_norden($norden);
		$RecordObj_dd->set_tld($options->tld2);
		$RecordObj_dd->set_traducible($options->traducible);
		$RecordObj_dd->set_relaciones($options->relaciones);
		$RecordObj_dd->set_propiedades($options->propiedades);
		
		$RecordObj_dd->set_force_insert_on_save(true); # important !
			
		# SAVE : After save, we can recover new created terminoID (prefix+autoIncrement)
		$created_id_ts = $RecordObj_dd->save_term_and_descriptor( $options->name );
			if ($created_id_ts) {
				$response->result 	= true;
				$response->msg 		= "Created record ($options->terminoID): $created_id_ts \n";
			}

		return $response;
	}//end create_term



	/**
	* UPDATE_FROM_4_0_TO_4_1
	* @return 
	*/
	public static function update_jerarquia_from_4_0_to_4_1() {

		#
		# SOURCE TABLE DATA
		$strQuery = "SELECT * FROM \"jerarquia\" ORDER BY tipo ASC, alpha2 ASC";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		$i= 1;
		while ($rows = pg_fetch_assoc($result)) {

			# Data from v40 tables (pre-matrix)
			$alpha3 		= (string)$rows['alpha3'];
			$alpha2			= (string)$rows['alpha2'];
			$nombre			= (string)$rows['nombre'];
			$tipo_orig		= (int)$rows['tipo'];
			$activa_orig	= (string)$rows['activa'];
			$mainLang_orig	= (string)$rows['mainLang'];

			$tipo_orig = ($tipo_orig == 4) ? 1 : $tipo_orig;
			$tipo_orig = ($tipo_orig == 7) ? 4 : $tipo_orig;

			$tipo = new locator();
				$tipo->set_section_tipo("hierarchy13");
				$tipo->set_section_id($tipo_orig);
			
			$activa = new locator();
				$activa->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				if ($activa_orig == 'si') {
					$activa->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
				}else{
					$activa->set_section_id(NUMERICAL_MATRIX_VALUE_NO);
				}

			$mainLang = new locator();
			if(empty($mainLang_orig)){
				$mainLang_orig = 'lg-spa';
			}
				$mainLang->set_section_tipo($mainLang_orig);

				$lang_ts = new RecordObj_ts($mainLang_orig);
				$lang_id = $lang_ts->get_ID();
				$mainLang->set_section_id($lang_id);		

			$section_tipo = 'hierarchy1';

			$section = section::get_instance($id = $i, $section_tipo);

			#$section->Save();
			$section->forced_create_record();

			$component_alpha3	= self::row_to_json_obj('hierarchy7', $i, $alpha3, $lang='lg-spa',$section_tipo);
			$component_alpha2	= self::row_to_json_obj('hierarchy6', $i, $alpha2, $lang='lg-spa',$section_tipo);
			$component_nombre	= self::row_to_json_obj('hierarchy5', $i, $nombre, $lang='lg-spa',$section_tipo);
			$component_tipo		= self::row_to_json_obj('hierarchy9', $i, $tipo, $lang=DEDALO_DATA_NOLAN,$section_tipo);
			$component_activa	= self::row_to_json_obj('hierarchy4', $i, $activa, $lang=DEDALO_DATA_NOLAN,$section_tipo);
			$component_mainLang	= self::row_to_json_obj('hierarchy8', $i, $mainLang, $lang=DEDALO_DATA_NOLAN,$section_tipo);

			$i++;

		}//end while ($rows = pg_fetch_assoc($result)) {		
	}//end update_from_4_0_to_4_1



	/**
	* UPDATE_JER_ES_FROM_4_0_TO_4_1
	* @return 
	*/
	public static function update_jer_from_4_0_to_4_1($tld, $modelo) {

		#
		# GENERATE_VIRTUAL_SECTION
		# Generamos la sección virtual en estructura antes de nada
		# pero solo en la llamada de los NO modelos como 'es1'
		if($modelo=='no') {
			$prefix = strtoupper($tld);
			$data_nolan = DEDALO_DATA_NOLAN;
			$component_tld_tipo = DEDALO_HIERARCHY_TLD2_TIPO;
			$strQuery = "SELECT section_id, section_tipo FROM \"matrix_hierarchy_main\" WHERE datos#>>'{components,$component_tld_tipo,dato,$data_nolan}' = '$prefix' LIMIT 1; ";
			$result	  = JSON_RecordObj_matrix::search_free($strQuery);
			while ($rows = pg_fetch_assoc($result)) {
				$options = new stdClass();
					$options->section_tipo 	= $rows['section_tipo'];
					$options->section_id 	= $rows['section_id'];
				$res = self::generate_virtual_section( $options );
				echo to_string($res);
				break;
			}
		}
		
	

		#
		# SOURCE TABLE DATA
		$strQuery = "SELECT * FROM \"jer_$tld\" WHERE esmodelo = '$modelo' ORDER BY id ASC";

		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		#$i= 1;
		while ($rows = pg_fetch_assoc($result)) {

			# Data from v40 tables (pre-matrix)
			#id	terminoID	parent	modelo	esmodelo	esdescriptor	visible	norden	usableIndex	traducible	relaciones	propiedades
			$id 			= (int)$rows['id'];
			$terminoID 		= (string)$rows['terminoID'];
			$parent			= (string)$rows['parent'];
			if ($modelo == 'no') {
				$dato_modelo	= (string)$rows['modelo'];
				$section_tipo_id = 1;
			}else{
				$dato_modelo = false;
				$section_tipo_id = 2;
			}
			$esdescriptor_orig	= (string)$rows['esdescriptor'];
			$visible_orig		= (string)$rows['visible'];
			$norden				= (int)$rows['norden'];
			$usableIndex_orig	= (string)$rows['usableIndex'];
			#$traducible		= (string)$rows['traducible'];
			$relaciones		= (string)$rows['relaciones'];
			$propiedades	= (string)$rows['propiedades'];

			$matrix_jer = self::rows_jer_to_matrix_json($id,
														$terminoID, 
														$parent,
														$dato_modelo,
														$section_tipo_id,
														$esdescriptor_orig,
														$visible_orig,
														$norden,
														$usableIndex_orig,
														$relaciones,
														$propiedades,
														$tld,
														$modelo);

			unset($matrix_jer);
			unset($id);
			unset($terminoID); 
			unset($parent);
			unset($dato_modelo);
			unset($section_tipo_id);
			unset($esdescriptor_orig);
			unset($visible_orig);
			unset($norden);
			unset($usableIndex_orig);
			unset($relaciones);
			unset($propiedades);

			#$i++;

			// let GC do the memory job
			time_nanosleep(0, 15000000); // 10 ms

		}//end while ($rows = pg_fetch_assoc($result)) {		
	}//end update_jer_es_from_4_0_to_4_1



	/**
	* ROWS_JER_TO_MATRIX_JSON
	* @return null 
	*/
	public static function rows_jer_to_matrix_json($id, $terminoID, $parent, $dato_modelo, $section_tipo_id, $esdescriptor_orig, $visible_orig, $norden, $usableIndex_orig, $relaciones, $propiedades, $tld, $modelo) {

		$esdescriptor = new locator();
			$esdescriptor->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			if ($esdescriptor_orig == 'si') {
				$esdescriptor->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			}else{
				$esdescriptor->set_section_id(NUMERICAL_MATRIX_VALUE_NO);
			}
		
		$visible = new locator();
			$visible->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			if ($visible_orig == 'si') {
				$visible->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			}else{
				$visible->set_section_id(NUMERICAL_MATRIX_VALUE_NO);
			}

		$usableIndex = new locator();
			$usableIndex->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			if ($usableIndex_orig == 'si') {
				$usableIndex->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			}else{
				$usableIndex->set_section_id(NUMERICAL_MATRIX_VALUE_NO);
			}

		$dato_parent = new locator();
			$dato_parent->set_section_tipo($tld.$section_tipo_id);
			$parent_id = substr($parent, 2);
			$dato_parent->set_section_id($parent_id);
			$dato_parent->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);

		$loc_modelo = new locator();
			$loc_modelo->set_section_tipo($tld.'2');
			$modelo_id = substr($dato_modelo, 2);
			$loc_modelo->set_section_id($modelo_id);
			$loc_modelo->set_type(DEDALO_RELATION_TYPE_MODEL_TIPO);


		#["ts2","pt234","fr37028"]
		$relaciones	= json_decode($relaciones);
		$relacion = array();
		if(!empty($relacones) && is_array($relaciones)){
			
			foreach ($relaciones as $value) {

				$locator = new locator();

				$prefix = RecordObj_dd::get_prefix_from_tipo($value);
				$locator->set_section_tipo($prefix.'1');

				$relation_id = substr($value, strlen($prefix));
				$locator->set_section_id($relation_id);

				$locator->set_type(DEDALO_RELATION_TYPE_RELATED_TIPO);

				$relacion[]	= $locator;
				unset($locator );
			}
		}


		unset($section);
		$section_tipo = $tld.$section_tipo_id;

		$section = section::get_instance($id, $section_tipo);

		#$section->Save();
		$section->forced_create_record();

		$section->add_relation($dato_parent);
		$section->add_relations($relacion);
		$section->add_relation($loc_modelo);

		$component_esdescriptor	= self::row_to_json_obj('hierarchy23', $id, $esdescriptor, DEDALO_DATA_NOLAN,$section_tipo);
		$component_visible		= self::row_to_json_obj('hierarchy26', $id, $visible, DEDALO_DATA_NOLAN,$section_tipo);
		$component_norden		= self::row_to_json_obj('hierarchy42', $id, $norden, DEDALO_DATA_NOLAN,$section_tipo);
		$component_usableIndex	= self::row_to_json_obj('hierarchy24', $id, $usableIndex, DEDALO_DATA_NOLAN,$section_tipo);
		$component_parent		= self::row_to_json_obj('hierarchy36', $id, $dato_parent, DEDALO_DATA_NOLAN,$section_tipo);
		$component_relacion		= self::row_to_json_obj('hierarchy35', $id, $relacion, DEDALO_DATA_NOLAN,$section_tipo);
		$component_modelo		= self::row_to_json_obj('hierarchy27', $id, $loc_modelo, DEDALO_DATA_NOLAN,$section_tipo);

		unset($esdescriptor );
		unset($visible );
		unset($norden );
		unset($usableIndex);
		unset($dato_parent );
		unset($relacion );
		unset($loc_modelo );

		unset($component_esdescriptor );
		unset($component_visible );
		unset($component_norden );
		unset($component_usableIndex );
		#unset($component_parent );
		#unset($component_relacion );
		unset($component_modelo );
		
		$strQuery_descriptors = "SELECT * FROM \"matrix_descriptors\" WHERE parent = '$terminoID'";
		$result_descriptors	  = JSON_RecordObj_matrix::search_free($strQuery_descriptors);
			while ($rows_descriptors = pg_fetch_assoc($result_descriptors)) {

				$dato 			= (string)$rows_descriptors['dato'];
				$tipo 			= (string)$rows_descriptors['tipo'];
				$lang 			= (string)$rows_descriptors['lang'];

				if($tipo == 'termino'){
					$component_termino	= self::row_to_json_obj('hierarchy25', $id, $dato, $lang ,$section_tipo);
					unset($component_termino);
				}
				if($tipo == 'def'){
					$component_def	= self::row_to_json_obj('hierarchy28', $id, $dato, $lang ,$section_tipo);
					unset($component_def);
				}
				if($tipo == 'notes'){
					$component_notes	= self::row_to_json_obj('hierarchy33', $id, $dato, $lang ,$section_tipo);
					unset($component_notes);
				}
				if($tipo == 'index'){
					$dato = json_decode($dato);

					foreach ($dato as $locator) {
						#$locator->set_type(DEDALO_RELATION_TYPE_INDEX_TIPO);
						$locator->type = DEDALO_RELATION_TYPE_INDEX_TIPO; // note is a stdClass now
					}

					$section->add_relations($dato);
					#$component_index	= self::row_to_json_obj('hierarchy40', $id, $dato, DEDALO_DATA_NOLAN ,$section_tipo);
					#unset($component_index);
				}
				if($tipo == 'obs'){
					$component_obs	= self::row_to_json_obj('hierarchy32', $id, $dato, $lang ,$section_tipo);
					unset($component_obs);
				}
				#{"lat":"39.462571","lon":"-0.376295","zoom":17}
				if($tipo == 'altitude'){

					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo('hierarchy31');
					$component = component_common::get_instance($modelo_name,
																	  'hierarchy31',
																	  $id,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);

					$component_dato = $component->get_dato();

					if(!is_object($component_dato)){
						$component_dato = new stdClass();
					}
					$component_dato->alt =(int)$dato;
					$component_alt	= self::row_to_json_obj('hierarchy31', $id, $component_dato, DEDALO_DATA_NOLAN ,$section_tipo);

					unset($modelo_name);
					unset($component);
					unset($component_dato);
					unset($component_alt);
				}
				if($tipo == 'geolocalizacion'){

					$datos = explode(",", $dato); 

					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo('hierarchy31');
					$component = component_common::get_instance($modelo_name,
																	  'hierarchy31',
																	  $id,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);

					$component_dato = $component->get_dato();

					if(!is_object($component_dato)){
						$component_dato = new stdClass();
					}
					$component_dato->lat = $datos[0];
					$component_dato->lon = $datos[1];
					
					$component_notes	= self::row_to_json_obj('hierarchy31', $id, $component_dato, DEDALO_DATA_NOLAN ,$section_tipo);

					unset($modelo_name);
					unset($component);
					unset($component_dato);
					unset($component_notes);

				}
				if($tipo == 'nomenclator_code'){
					$component_notes	= self::row_to_json_obj('hierarchy41', $id, (int)$dato, DEDALO_DATA_NOLAN ,$section_tipo);
				}
				#31/12/1973-01/07/1976
				if($tipo == 'tiempo'){

					if (strpos($dato, '-')!==false) {
						$fechas = explode("-", $dato);
						$fecha_ini = explode("/", $fechas[0]);
						$fecha_fin = explode("/", $fechas[1]);

						$dato_time = new stdClass();

						$dd_date = new dd_date();
						$dd_date->set_day($fecha_ini[0]);
						$dd_date->set_month($fecha_ini[1]);
						$dd_date->set_year($fecha_ini[2]);

						$dato_time->start = $dd_date;

						$dd_date = new dd_date();
						$dd_date->set_day($fecha_fin[0]);
						$dd_date->set_month($fecha_fin[1]);
						$dd_date->set_year($fecha_fin[2]);

						$dato_time->end = $dd_date;


					}else{
						
						$fecha = explode("/", $dato);

						$dato_time = new dd_date();
						$dato_time->set_day($fecha[0]);
						$dato_time->set_month($fecha[1]);
						$dato_time->set_year($fecha[2]);

					}

					$component_tiempo	= self::row_to_json_obj('hierarchy30', $id, $dato_time, DEDALO_DATA_NOLAN ,$section_tipo);

					unset($fechas);
					unset($fecha_ini);
					unset($fecha_fin);
					unset($dato_time);
					unset($dd_date);
					unset($component_tiempo);

				}
				unset($dato);
				unset($tipo);
				unset($lang);

				// let GC do the memory job
				time_nanosleep(0, 15000000); // 10 ms

			}//end while

		return null;		
	}//end rows_to_matrix_json



	/**
	* ROW_TO_JSON_OBJ
	* @return 
	*/
	public static function row_to_json_obj($tipo, $parent, $dato, $lang='lg-spa',$section_tipo) {

		if(empty($dato)){
			return false;
		}

		$modo ='edit';
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo);
		$component = component_common::get_instance($modelo_name,
														  $tipo,
														  $parent,
														  $modo,
														  $lang,
														  $section_tipo);

		$component->set_dato($dato);
		$component->Save();
		unset($modelo_name);
		unset($component);

		return null;		
	}//end row_to_json_obj



	/**
	* GET_MAIN_LANG
	* Search in section HIERARCHY (DEDALO_HIERARCHY_SECTION_TIPO) the lang for requested 'thesaurus' section by section_tipo
	* Do a direct db search request for speed and store results in a static var for avoid resolve the same main_lang twice
	* Speed here is very important because this method is basic for thesaurus sections defined in hierarchies
	* @return string $main_lang
	*/
	public static function get_main_lang($section_tipo) {
		
		static $ar_main_lang;

		if(isset($ar_main_lang[$section_tipo])) return $ar_main_lang[$section_tipo];
			
		$matrix_table			= 'matrix_hierarchy_main';
		$hierarchy_lang_tipo 	= DEDALO_HIERARCHY_LANG_TIPO;
		$hierarchy_section_tipo = DEDALO_HIERARCHY_SECTION_TIPO;
		$hierarchy_tld_tipo 	= DEDALO_HIERARCHY_TLD2_TIPO;
		$lang 					= DEDALO_DATA_NOLAN;

		$prefix = RecordObj_dd::get_prefix_from_tipo($section_tipo);
		$prefix = strtoupper($prefix); // data is stored always in uppercase

		$strQuery  ='-- '.__METHOD__;
		$strQuery .= "\nSELECT section_id, datos#>>'{components,$hierarchy_lang_tipo,dato,$lang}' AS main_lang_locator \nFROM $matrix_table WHERE";
		$strQuery .= "\n section_tipo = '$hierarchy_section_tipo' AND";
		$strQuery .= "\n datos#>>'{components,$hierarchy_tld_tipo,dato,$lang}' = '$prefix' LIMIT 1";
			
		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		$main_lang = null;		
		while ($rows = pg_fetch_assoc($result)) {
			$section_id			= $rows['section_id'];			
			$main_lang_locator	= $rows['main_lang_locator'];

			// dato in db is json string representation of locators array 
			if (!$main_lang_locator	= json_decode($main_lang_locator)) {
				if(SHOW_DEBUG) {
					dump($main_lang_locator, ' main_lang_locator ++ '.to_string());
					throw new Exception("Error Processing Request. main_lang_locator dato is not json valid!", 1);					
				}
			}
			$main_lang_locator	= reset($main_lang_locator);
				#dump($main_lang_locator, ' main_lang_locator ++ '.to_string($strQuery));

			$main_lang = $ar_main_lang[$section_tipo] = $main_lang_locator->section_tipo;	
			break;
		}//end while
		
		return (string)$main_lang;
	}//end get_main_lang


}
?>