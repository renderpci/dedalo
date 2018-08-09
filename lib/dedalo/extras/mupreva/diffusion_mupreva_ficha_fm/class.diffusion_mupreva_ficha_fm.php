<?php
/*
* CLASS DIFFUSION_MUPREVA_FICHA_FM
* Ficha de fotos a mostrar en un iframe de Filemaker, en el catálogo del MUPREVA
*/


class diffusion_mupreva_ficha_fm extends diffusion {
	
	public $fichaID;

	public $numero_inventario_tipo;	

	public $matrix_table;
	
	public $show_mode;

	public $image_widht=160;
	public $image_height=120;
	public $shoot=0;


	

	/**
	* CONSTRUCT
	*/
	function __construct( $fichaID=null, $diffusion_section=null, $show_mode='edit' ) {

		if (empty($fichaID)) {
			throw new Exception("Error Processing Request. empty fichaID", 1);
		}
		if (empty($diffusion_section)) {
			throw new Exception("Error Processing Request. empty diffusion_section", 1);
		}

		$this->fichaID 			 = $fichaID;
		$this->diffusion_section = $diffusion_section;
		$this->show_mode 		 = $show_mode;
		$this->domain 			 = 'mupreva';
		$this->initial_media_path= '';

		# Fixed table
		$this->matrix_table 	 = 'matrix';

		$this->get_ar_diffusion_map();

		$this->set_up();

		parent::__construct();
	}



	/**
	* SET_UP
	*/
	public function set_up() {
		
		switch ($this->diffusion_section) {
			case 'mupreva35':	// diffusion_section Imágenes de catálogo 

				# Fixed tipos
					$this->section_tipo 								= 'mupreva1';
					$this->numero_inventario_tipo 						= 'mupreva13';	// Campo nº inventario en Catálogo (mupreva1)
					# Imagen campos (Cambios en estructura (b4))
					$this->campo_imagen_path 							= 'mupreva214';	// Ex rsc33
					$this->campo_imagen_nombre 							= 'mupreva215';	// Ex rsc34
					$this->campo_imagen_default_nombre 					= 'mupreva212';	// Ex mupreva37 (component_image)
				
				# Diffusion
				$this->imagen_identificativa_diffusion_element_tipo 	= 'mupreva36';	//'dd67'
				$this->otras_imagenes_diffusion_element_tipo 			= 'mupreva37';	//'dd73'
				$this->initial_media_path 								= '/catalogo';	//				
				break;
			
			case 'mupreva274':	// diffusion_section Dibujos de catálogo

				# Fixed tipos 
					$this->section_tipo 								= 'mupreva1';
					$this->numero_inventario_tipo 						= 'mupreva13';	// Campo nº inventario en Catálogo (mupreva1)
					# Imagen campos (Cambios en estructura (b4))
					$this->campo_imagen_path 							= 'mupreva214';	// Ex rsc33
					$this->campo_imagen_nombre 							= 'mupreva215';	// Ex rsc34
					$this->campo_imagen_default_nombre 					= 'mupreva212';	// Ex mupreva37 (component_image)
				
				# Diffusion
				$this->imagen_identificativa_diffusion_element_tipo 	= 'mupreva275';	// Dibujos identificativos (diffusion_component) --> mupreva151
				$this->otras_imagenes_diffusion_element_tipo 			= 'mupreva276';	// Dibujos adicionales (diffusion_component) --> mupreva152
				$this->initial_media_path 								= '/dibujos_catalogo';	//	
				break;

			case 'mupreva1232':	// diffusion_section Restauración
					$this->section_tipo 								= 'mupreva770';
					$this->numero_inventario_tipo 						= 'mupreva1231';	// Campo nº inventario en Restauración (mupreva1)
					# Imagen campos (Cambios en estructura (b4))
					$this->campo_imagen_path 							= 'mupreva214';	// Ex rsc33
					$this->campo_imagen_nombre 							= 'mupreva215';	// Ex rsc34
					$this->campo_imagen_default_nombre 					= 'mupreva212';	// Ex mupreva37 (component_image)

				# Diffusion
				$this->imagen_identificativa_diffusion_element_tipo 	= 'mupreva1233';	// Dibujos identificativos (diffusion_component) --> mupreva151
				$this->otras_imagenes_diffusion_element_tipo 			= 'mupreva1234';	// Dibujos adicionales (diffusion_component) --> mupreva152
				$this->initial_media_path 								= '/restauracion';	//	
				break;

			case 'mupreva1488':	// diffusion_ephemera Restauración
					$this->section_tipo 								= 'mupreva159';
					$this->numero_inventario_tipo 						= 'mupreva1324';	// Campo nº inventario en Ephemera (mupreva1324)
					# Imagen campos (Cambios en estructura (b4))
					$this->campo_imagen_path 							= NULL;	// Ex rsc33
					$this->campo_imagen_nombre 							= NULL;	// Ex rsc34
					$this->campo_imagen_default_nombre 					= 'mupreva660';	// Ex mupreva37 (component_image)

				# Diffusion
				$this->imagen_identificativa_diffusion_element_tipo 	= 'mupreva1489';	// Dibujos identificativos (diffusion_component) --> mupreva151
				$this->otras_imagenes_diffusion_element_tipo 			= NULL;	// Dibujos adicionales (diffusion_component) --> mupreva152
				$this->initial_media_path 								= '/ephemera';	//	
				break;

			case 'mupreva1490':	// diffusion_ephemera Restauración
					$this->section_tipo 								= 'mupreva667';
					#$this->numero_inventario_tipo 						= 'mupreva1324';	// Campo nº inventario en Ephemera (mupreva1324)
					# Imagen campos (Cambios en estructura (b4))
					$this->campo_imagen_path 							= NULL;	// Ex rsc33
					$this->campo_imagen_nombre 							= NULL;	// Ex rsc34
					$this->campo_imagen_default_nombre 					= 'mupreva660';	// Ex mupreva37 (component_image)

				# Diffusion
				$this->imagen_identificativa_diffusion_element_tipo 	= 'mupreva2045';	// Dibujos identificativos (diffusion_component) --> mupreva151
				$this->otras_imagenes_diffusion_element_tipo 			= 'mupreva2046';	// Dibujos adicionales (diffusion_component) --> mupreva152
				$this->initial_media_path 								= '/ephemera';	//	
				break;


			default:
				throw new Exception("Error Processing Request. Invalid diffusion_section: $this->diffusion_section", 1);				
				break;
		}

	}#end set_up





	/**
	* GET_HTML : overwrite parent method
	*/
	public function get_html() {

		if(SHOW_DEBUG) $start_time = start_time();
		
		# Class name is called class (ex. component_input_text), not this class (common)
		$class_name	= get_called_class();	#dump($class_name,'$class_name');		
		
		$file = dirname(__FILE__) .'/'. $class_name .'.php' ;	
		ob_start();
		include ( $file );
		$html =  ob_get_clean();		


		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [element '.$class_name.']', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.microtime(1)]=microtime(1);
		}
		
		return $html;
	}


	


	# GET_CATALOGO_SECTION_ID
	protected function get_catalogo_section_id() {

		$catalogo_section_id = $this->fichaID;

		return $catalogo_section_id;
		/*
		# Buscamos la sección correspondiene a fichaID
		$section_tipo 		= $this->diffusion_section;
		$matrix_table		= common::get_matrix_table_from_tipo($this->numero_inventario_tipo);
		$strQuery='-- '.__METHOD__.'
		SELECT section_id FROM "'.$matrix_table.'"
		WHERE
		"section_id" = '.(int)$this->fichaID.'AND "section_tipo" = "mupreva770"';

		//BETA 3 
		#datos @> \'{"components":{"'.(string)$this->numero_inventario_tipo.'":{"dato":{"lg-nolan":"'.(string)$this->fichaID.'"}}}}\'::jsonb
		#';


		dump($strQuery, 'strQuery'); #die();
		$result		= JSON_RecordObj_matrix::search_free($strQuery);
		$ar_result 	= pg_fetch_assoc($result);
			#dump($ar_result," ar_result");die();

		if(empty($ar_result['section_id'])) {
			trigger_error("Warning: dato for fichaID: $this->fichaID not found in ".DEDALO_DATABASE_CONN." $this->matrix_table with tipo:$this->numero_inventario_tipo");
			return false;
		} 
		$catalogo_section_id = $ar_result['section_id'];
			#dump($catalogo_section_id, ' catalogo_section_id');

		return $catalogo_section_id;
		*/
	}


	# GET_DIFFUSION_OBJ_BY_TIPO
	public function get_diffusion_obj_by_tipo( $diffusion_element_tipo ) {

		# Buscamos la sección correspondiene a fichaID
		$catalogo_section_id = $this->get_catalogo_section_id();
			#dump($catalogo_section_id, ' catalogo_section_id');

		# Extraemos las propiedades del elemento en diffusion : Imagen identificativa [dd1208]
		# Estas propiedades seleccionan los campos del portal que queremos recibir.
		# Por ejemplo,  {"portal_list":["dd750","dd1110","dd851"]} selecciona los campos dd750 (imagen), dd1110 (path), dd851 (nombre del fichero) del portal
		# al que referencia el elemento dd1208 (diffusion component) en la estructura.
		# Utilizar elementos "diffusion_component" para referenciar los componentes a difundir		
		$RecordObj_dd 			= new RecordObj_dd($diffusion_element_tipo);
		$propiedades 			= $RecordObj_dd->get_propiedades();
		$propiedades 			= json_decode($propiedades);
			#dump($propiedades,'$propiedades');
		
		# El término relacionado será el component_portal "Imagen identificativa"
		$related_component_tipo = RecordObj_dd::get_ar_terminos_relacionados($diffusion_element_tipo, $cache=false, $simple=true)[0];
			#dump($related_component_tipo,'$related_component_tipo');
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($related_component_tipo);
		#dump($modelo_name,'modelo_name');#die();
		
		# Component portal referenciado desde diffusion
		$current_component 	= component_common::get_instance($modelo_name, $related_component_tipo, $catalogo_section_id, 'list', DEDALO_DATA_NOLAN, $this->section_tipo);
			#dump($current_component,"current_component $related_component_tipo");

		# Diffusion_obj : Recupera los datos del portal formateado por el filtro de "propiedades" definido en el elemento diffusion actual.
		# Ej.  {"portal_list":["dd750","dd1110","dd851"]} para dd1208
		$diffusion_obj = $current_component->get_diffusion_obj( $propiedades );
			#dump($diffusion_obj,'$diffusion_obj');

		return $diffusion_obj;
	}



	public static function get_url_full( $SID, $initial_media_path ) {
		return DEDALO_MEDIA_BASE_URL . DEDALO_IMAGE_FOLDER .$initial_media_path.'/'. DEDALO_IMAGE_QUALITY_DEFAULT .'/'. $SID .'.'. DEDALO_IMAGE_EXTENSION ;
	}



	# GET_AR_SECTION_TOP_TIPO
	protected function get_ar_section_top_tipo__DES() {
		/*
		$ar_id_section 		= array();
		$ar_final 			= array();
		$user_id 		= navigator::get_user_id();

		if (is_array($ar_locators)) foreach ($ar_locators as $key => $current_locator) {
			
			$locator_as_obj 		= component_common::get_locator_as_obj($current_locator);			

			# ID SECTION
			$section_top_tipo		= $locator_as_obj->section_top_tipo;	#dump($section_top_tipo,'$section_top_tipo')
			$section_top_id_matrix	= $locator_as_obj->section_top_id_matrix;
			$section_id				= $locator_as_obj->section_id;
			$component_tipo			= $locator_as_obj->component_tipo;
			$tag_id					= $locator_as_obj->tag_id;

			# SECTION_TOP_TIPO
			$ar_section_top_tipo[$section_top_tipo][$section_top_id_matrix][] = $locator_as_obj;	#$current_locator ;#substr($current_locator, strlen($id_section)+1);		
		}
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');


		# GLOBAL ADMIN
		$is_global_admin = component_security_administrator::is_global_admin($user_id);
			#dump($is_global_admin,'$is_global_admin '.$user_id);

		if($is_global_admin!==true) {
			
			# Filter
			foreach ($ar_section_top_tipo as $section_top_tipo => $ar_values) {				

				# TIPO : Filter for current top tipo
				$ar_filter_id = filter::get_ar_filter($section_top_tipo);
					#dump($ar_filter_id ,'$ar_filter_id '.$section_top_tipo);
				
				# REMOVE : Remove not authorized id's
				foreach ($ar_section_top_tipo[$section_top_tipo] as $section_top_id_matrix => $locator_as_obj) {
					if ( !in_array($section_top_id_matrix, $ar_filter_id) ) {		
						unset($ar_section_top_tipo[$section_top_tipo][$section_top_id_matrix]);
					}
				}
			}			

			# DELETE EMPTY TOP TIPOS ARRAYS
			$ar_section_top_tipo = array_filter($ar_section_top_tipo);				

		#dump($ar_section_top_tipo,'$ar_section_top_tipo FILTERED');
		}
		#print "<pre>";	
		#print_r($ar_section_top_tipo).'';
		#print "</pre>";	

		return $ar_section_top_tipo;
		*/
	}


	# GET_AR_DIFFUSION_MAP
	protected function get_ar_diffusion_map__DES() {
		
		#if(SHOW_DEBUG) $start_time = start_time();

		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current diffuision domain name
			$diffusion_domain = diffusion::get_my_diffusion_domain('mupreva',get_called_class());
				#dump($diffusion_domain,'$diffusion_domain');

			# DIFFUSION_SECTIONS : Get sections defined in structure to view
			$ar_diffusion_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, $modelo_name='diffusion_section', $relation_type='children');
				#dump($ar_diffusion_section,'$ar_diffusion_section');



			# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
			foreach ($ar_diffusion_section as $diffusion_section_tipo) {

				# diffusion_section_tipo ar_relateds_terms
				$current_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
					#dump($current_section_tipo,'$current_section_tipo');
				
				# current_section_tipo : Verify
				if (empty($current_section_tipo)) {
					throw new Exception("Error Processing Request get_ar_diffusion_map: diffusion section related is empty. Please configure structure with one diffusion section related", 1);
				}

				$ar_diffusion_map[] = $current_section_tipo;		
				
			}#end foreach ($ar_diffusion_section as $diffusion_section_tipo

		

		#if(SHOW_DEBUG) dump( exec_time($start_time, __METHOD__) );

		return $ar_diffusion_map;
	}
}
?>