<?php
/*
* CLASS COMPONENT FILTER MASTER

1 - Miramos su relación (llama a Proyectos)
2 - Despejamos el tipo (dd156)
3 - Despejar a qué áreas tiene acceso este usuario (llamando al component_security_areas en su registro)
4 - Buscamos el  component_security_areas de proyectos (del tipo de la sesión del relacionado en proyectos, sacamos el hijo que toca)
5 - Buscamos en matrix, con las áreas obtenidas que el usuario tiene acceso,  los proyectos que se corresponden.
6 - Generamos los checkbox de selección con las secciones obtenidas y con la etiqueta despejada del tipo (dd156) 

*/


class component_filter_master extends component_common {

	private $userID_matrix ;

	protected $caller_id;

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;
	
	/**
	* CONSTRUCT
	* @param $id
	*	id matrix
	* @param $tipo
	*	structure tipo like 'dd152'
	* @param $modo
	*	current modo (edit,list, ...)
	* @param $parent
	*	matrix id parent
	* @param $ar_css
	*	array of css
	*/
	function __construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL) {	#__construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)
		
		
		parent::__construct($id, $tipo, $modo, $parent, DEDALO_DATA_NOLAN);

		$this->userID_matrix  = $this->get_parent();

		# caller_id from parent var (default)
		if(!empty($parent)) {
			$this->caller_id = $parent;			
		}

		#$id = $this->get_id();	dump($id,'id');
		#dump($tipo,'tipo');
		#dump($parent,'parent');

		#dump($this,"component_filter_master");
	}

	
	# Override component_common method
	public function get_ar_tools_obj() {
		return NULL;
	}
	

	/**
	* GET VALOR
	* Devuelve los valores del array 'dato' separados por '<br>'
	*/
	public function get_valor( $format='html' ) {
		
		$dato 	= $this->get_dato();
		$html 	= '';
		
		if(is_array($dato)) foreach ($dato as $id_matrix => $state) {

			if($state!=2) continue;

			$component_filter = new component_input_text(NULL,DEDALO_PROJECTS_NAME_TIPO,'list',$id_matrix); #(id, tipo, 'edit', parent, DEDALO_DATA_LANG); # ($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
				#dump($component_filter, 'component_filter', array());
			$name = $component_filter->get_valor();

			$html .= $name ;
			if(SHOW_DEBUG) {
				$html .= " [$id_matrix]";
			}
			if ($id_matrix!=end($dato)) $html .= '<br>';
			
		}
		
		
		return $html;		
	}

	/**
	* GET AR PROYECTOS SECTION ID MATRIX
	* Devuelve un array de id matrix de los proyectos que usan las areas autorizadas (estado 2) al usuario actual
	* @return $ar_projects_final
	*	Array formated as id=>project_name  like: [250] => Proyecto de Historia Oral
	*/
	protected function get_ar_proyectos_section() {

		$userID_matrix 			= $this->userID_matrix;			#dump($userID_matrix,'$userID_matrix',"",true);
		$ar_projects_final		= NULL;

	  # USUARIOS
		$section_tipo = $this->RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($this->tipo, $modelo_name='section', $relation_type='parent');	
		$component_security_areas_tipo = $this->RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($section_tipo, $modelo_name='component_security_areas', $relation_type='children_recursive');
			#dump($component_security_areas_tipo,'$component_security_areas_tipo',"",true);

		# Array to string conversion
		if(empty($component_security_areas_tipo[0])) return NULL;	$component_security_areas_tipo = $component_security_areas_tipo[0];
		
		# Search matrix record areas authorized for current user
		$arguments=array();
		$arguments['parent']	= $userID_matrix;
		$arguments['tipo']		= $component_security_areas_tipo;
		$matrix_table 			= common::get_matrix_table_from_tipo($component_security_areas_tipo);		
		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
		$ar_records				= $RecordObj_matrix->search($arguments);
			#dump($ar_records,"ar_records authorized areas matrix record for user $userID_matrix ".print_r($arguments,true));die();

		# Array to string conversion
		if(empty($ar_records[0])) return NULL;	$id = $ar_records[0];	

		# Array of auth areas for this user
		$matrix_table 			= common::get_matrix_table_from_tipo($component_security_areas_tipo);
		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);
		$dato 					= $RecordObj_matrix->get_dato();
			#dump($dato,"dato for $id");die();

		# Get real element where locate name of project

		$ar_terminos_relacionados = $this->RecordObj_ts->get_ar_terminos_relacionados($this->tipo, $cache=true, $simple=true);		
			#dump($ar_terminos_relacionados,'$ar_terminos_relacionados',"Get real element where locate name of project $this->tipo",true);		
		/*
		# Array to string conversion
		#if(empty($ar_terminos_relacionados[0])) return NULL;	$termino_relacionado_tipo = $ar_terminos_relacionados[0];	# <- TIPO SECCION PROYECTO		
		#	#dump($termino_relacionado_tipo,'$termino_relacionado_tipo',"",true);

		# Array to string conversion
		if(empty($ar_terminos_relacionados[0]))
			return NULL;
		else
			$termino_relacionado_tipo = $ar_terminos_relacionados[0];	# <- NOMBRE DEL PROYECTO (TIPO)	
				#dump($termino_relacionado_tipo,'$termino_relacionado_tipo');
		*/
		# método acceso directo al componente
		$ar_terminos_relacionados = $this->get_relaciones();
		if(empty($ar_terminos_relacionados))
			return NULL;
		foreach ($ar_terminos_relacionados as $modelo => $termino_relacionado_tipo) {
			break;
		}
		#dump($ar_terminos_relacionados,'$ar_terminos_relacionados');die();
			#dump($termino_relacionado_tipo,"termino_relacionado_tipo");die();

	  # PROYECTOS
		$section_tipo_proyectos = $this->RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($termino_relacionado_tipo, $modelo_name='section', $relation_type='parent');
			#dump($section_tipo_proyectos,"section_tipo_proyectos");die();
		$component_security_areas_proyectos_tipo = $this->RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($section_tipo_proyectos, $modelo_name='component_security_areas', $relation_type='children_recursive');
			#dump($component_security_areas_proyectos_tipo, "component_security_areas_proyectos_tipo - tipo del dato de proyectos, usualmente dd243");die();

		# Array to string conversion. component_security_areas tipo in projects
		if(empty($component_security_areas_proyectos_tipo[0])) return NULL;		$component_security_areas_proyectos_tipo = $component_security_areas_proyectos_tipo[0];
			#dump($component_security_areas_proyectos_tipo,'$component_security_areas_proyectos_tipo',"",true);

		# array id matrix de los proyectos
		$ar_proyectos_section_id = array();
		if(is_array($dato)) foreach ($dato as $area_tipo => $estado) {			
		
			# If area estado is 2 (read/write) search and add to auth projects . like case "dd288":"2" for example
			if($estado==2) {

				# Search 
				$arguments=array();
				$arguments['strPrimaryKeyName']	= 'parent';
				$arguments['tipo']				= $component_security_areas_proyectos_tipo;

				/**
				* ARGUMENT DATO:JSON AREA TIPO [$arguments['dato:json']]
				* Seleccionamos sólo los que tienen areas con estado 2
				* Ojo: cuando asignamos áreas a un  proyecto, se asignan con el arbol estándar por
				* lo que los padres quedan guardados también con estado 1
				* Por ello es necesario buscar en matrix json especificándolo como: "$area_tipo\":\"2"
				* para descartar los de estado 1
				* Esto es necesario para manterner unificado y coherente el comportamiento del componente 'component_security_areas'
				* que es el selector en arbol de checkboxes de las áreas, usado tanto para usuarios como para proyectos
				* @example $area_tipo.'":"2' 	(format json in matrix is like "dd14":"2")
				*/
				$arguments['dato:json']			= "$area_tipo\":\"2";

				$matrix_table 					= common::get_matrix_table_from_tipo($component_security_areas_proyectos_tipo);
				$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
				$ar_records						= $RecordObj_matrix->search($arguments);					#dump($ar_records,'ar_records',"busqueda de parent con tipo:$component_security_areas_tipo y dato:$area_tipo");

					#dump($arguments,'arguments');

				$ar_proyectos_section_id 	= array_merge($ar_proyectos_section_id, $ar_records);
			}			
		}
		# Clean posible duplicate projects
		$ar_proyectos_section_id 			= array_unique($ar_proyectos_section_id);
			#dump($ar_proyectos_section_id,"ar_proyectos_section_id array final de array_merge(ar_proyectos_section_id) $termino_relacionado_tipo");die();


		# Final returned array formated as id=>project_name 
		# like: [250] => Proyecto de Historia Oral
		$ar_projects_final = component_common::get_ar_records_with_lang_fallback($ar_proyectos_section_id, $termino_relacionado_tipo);
			#dump($ar_proyectos_section_id,'ar_projects_final',"array de section id matrix del proyecto => estado (normalmente 2)");

		return $ar_projects_final;
	}


	
	
}
?>