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
	function __construct( $fichaID=null, $show_mode='edit' ) {

		if (empty($fichaID)) {
			throw new Exception("Error Processing Request. empty fichaID", 1);
		}

		$this->fichaID = $fichaID;

		$this->show_mode = $show_mode;
		
		# Fixed tipos
		$this->numero_inventario_tipo 		= 'dd1114';
		
		# Diffusion
		$this->imagen_identificativa_diffusion_element_tipo = 'dd67';
		$this->otras_imagenes_diffusion_element_tipo 		= 'dd73';

		# Imagen campos
		$this->campo_imagen_path 			= 'dd1110';
		$this->campo_imagen_nombre 			= 'dd851';
		$this->campo_imagen_default_nombre 	= 'dd750';

		# Fixed table
		$this->matrix_table = 'matrix';
	}

	#public function get_show_mode() {
	#	return $this->show_mode;
	#}


	# GET_AR_SECTION_TOP_TIPO
	protected function get_ar_section_top_tipo_DES() {
		/*
		$ar_id_section 		= array();
		$ar_final 			= array();
		$userID_matrix 		= navigator::get_userID_matrix();

		if (is_array($ar_locators)) foreach ($ar_locators as $key => $current_locator) {
			
			$locator_as_obj 		= component_common::get_locator_as_obj($current_locator);			

			# ID SECTION
			$section_top_tipo		= $locator_as_obj->section_top_tipo;	#dump($section_top_tipo,'$section_top_tipo')
			$section_top_id_matrix	= $locator_as_obj->section_top_id_matrix;
			$section_id_matrix		= $locator_as_obj->section_id_matrix;
			$component_tipo			= $locator_as_obj->component_tipo;
			$tag_id					= $locator_as_obj->tag_id;

			# SECTION_TOP_TIPO
			$ar_section_top_tipo[$section_top_tipo][$section_top_id_matrix][] = $locator_as_obj;	#$current_locator ;#substr($current_locator, strlen($id_section)+1);		
		}
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');


		# GLOBAL ADMIN
		$is_global_admin = component_security_administrator::is_global_admin($userID_matrix);
			#dump($is_global_admin,'$is_global_admin '.$userID_matrix);

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
	protected function get_ar_diffusion_map() {
		
		#if(SHOW_DEBUG) $start_time = start_time();

		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current diffuision domain name
			$diffusion_domain = diffusion::get_my_diffusion_domain('mupreva',get_called_class());
				#dump($diffusion_domain,'$diffusion_domain');

			# DIFFUSION_SECTIONS : Get sections defined in structure to view
			$ar_diffusion_section = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, $modelo_name='diffusion_section', $relation_type='children');
				#dump($ar_diffusion_section,'$ar_diffusion_section');



			# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
			foreach ($ar_diffusion_section as $diffusion_section_tipo) {

				# diffusion_section_tipo ar_relateds_terms
				$current_section_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
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


	# GET_CATALOGO_SECTION_ID
	protected function get_catalogo_section_id() {

		#if(SHOW_DEBUG) $start_time = start_time();

		# Buscamos la sección correspondiene a fichaID 
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'parent';
		$arguments['dato:json']			= (string)$this->fichaID;
		#$arguments['dato']				= (int)$this->fichaID;
		$arguments['tipo']				= (string)$this->numero_inventario_tipo;		
		$RecordObj_matrix				= new RecordObj_matrix($this->matrix_table,NULL);
		$ar_result						= $RecordObj_matrix->search($arguments);
			#dump($ar_result,'ar_result '.print_r($arguments,true));			

		if(empty($ar_result)) {
			trigger_error("Warning: dato for fichaID: $this->fichaID not found in ".DEDALO_DATABASE_CONN." $this->matrix_table with tipo:$this->numero_inventario_tipo");
			return false;
		} 
		$catalogo_section_id = $ar_result[0];

		#if(SHOW_DEBUG) echo exec_time($start_time, __METHOD__, '') ;

		return $catalogo_section_id;
	}


	# GET_DIFFUSION_OBJ_BY_TIPO
	public function get_diffusion_obj_by_tipo( $diffusion_element_tipo ) {

		# Buscamos la sección correspondiene a fichaID
		$catalogo_section_id = $this->get_catalogo_section_id();

		# Extraemos las propiedades del elemento en diffusion : Imagen identificativa [dd1208]
		# Estas propiedades seleccionan los campos del portal que queremos recibir.
		# Por ejemplo,  {"portal_list":["dd750","dd1110","dd851"]} selecciona los campos dd750 (imagen), dd1110 (path), dd851 (nombre del fichero) del portal
		# al que referencia el elemento dd1208 (diffusion component) en la estructura.
		# Utilizar elementos "diffusion_component" para referenciar los componentes a difundir		
		$RecordObj_ts 			= new RecordObj_ts($diffusion_element_tipo);
		$propiedades 			= $RecordObj_ts->get_propiedades();
		$propiedades 			= json_decode($propiedades);
			#dump($propiedades,'$propiedades');
		
		# El término relacionado será el component_portal "Imagen identificativa"
		$related_component_tipo = RecordObj_ts::get_ar_terminos_relacionados($diffusion_element_tipo, $cache=false, $simple=true)[0];
			#dump($related_component_tipo,'$related_component_tipo');
		
		# Component porta referenciado desde diffusion
		$current_component 	= new component_portal(NULL,$related_component_tipo,'list', $current_section_id = $catalogo_section_id);
			#dump($current_component,'$current_component');

		# Diffusion_obj : Recupera los datos del portal formateado por el filtro de "propiedades" definido en el elemento diffusion actual.
		# Ej.  {"portal_list":["dd750","dd1110","dd851"]} para dd1208
		$diffusion_obj = $current_component->get_diffusion_obj( $propiedades );
			#dump($diffusion_obj,'$diffusion_obj');
		
		return $diffusion_obj;
	}



	public static function get_url_full( $SID ) {
		return DEDALO_MEDIA_BASE_URL . DEDALO_IMAGE_FOLDER .'/'. DEDALO_IMAGE_QUALITY_DEFAULT .'/'. $SID .'.'. DEDALO_IMAGE_EXTENSION ;
	}
	
}
?>