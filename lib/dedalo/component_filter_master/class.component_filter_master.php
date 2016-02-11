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

	private $user_id ;

	protected $caller_id;

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;
	

	/**
	* __CONSTRUCT	
	*/
	function __construct($tipo=false, $parent=null, $modo='edit', $lang=NULL, $section_tipo=null) {
		
		parent::__construct($tipo, $parent, $modo, DEDALO_DATA_NOLAN, $section_tipo);

		$this->user_id  = $this->get_parent();

		# caller_id from parent var (default)
		if(!empty($parent)) {
			$this->caller_id = $parent;			
		}

		#$id = $this->get_id();	dump($id,'id');
		#dump($tipo,'tipo');
		#dump($parent,'parent');

		#dump($this,"component_filter_master");
	}


	/**
	* NOTA ACERCA DE GET DATO (24-08-2014) :
	* De momento, cambiaremos el tipo para la variable 'dato' en get_dato() por compatibilidad de los métodos de las clases de los componentes actuales.
	* Sería muy recomendable modificar cada uno de los componentes para poder unificar los tipos de entrada y salida, ya que esta fórmula es muy dada a errores
	* Esto es aplicable a TODOS los componentes
	*/

	/**
	* GET DATO : Format {"7":2,"269":2,"298":2}
	* @see component_filter->get_dato() for maintain unifyed format of projetcs
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}

	/**
	* SET_DATO
	* @see component_filter->set_dato() for maintain unifyed format of projetcs
	*/
	public function set_dato($dato) {
		if (empty($dato)) {
			$dato=array();
		}
		parent::set_dato( (object)$dato );
	}


	/**
	* SAVE OVERRIDE
	* Overwrite component_common method 
	*/
	public function Save() {
		# Reset cache session IMPORTANT !
		unset($_SESSION['dedalo4']['config']['get_user_projects']);

		return parent::Save();
	}

	
	# Override component_common method
	public function get_ar_tools_obj() {
		return NULL;
	}		

	

	/**
	* GET VALOR
	* Devuelve los valores del array 'dato' separados por '<br>'
	*/
	public function get_valor() {
		
		$dato 	= (array)$this->get_dato();
		$html 	= '';
		
		foreach ($dato as $section_id => $state) {

			if($state!=2) continue;

			$current_component = component_common::get_instance('component_input_text',
																DEDALO_PROJECTS_NAME_TIPO,
																$section_id,
																'list',
																DEDALO_DATA_LANG,
																DEDALO_SECTION_PROJECTS_TIPO);
			$name = $current_component->get_valor();
				
			$html .= $name ;
			if(SHOW_DEBUG) {
				#$html .= " [$section_id]";
				#dump($name, " name ".to_string());
			}
			$html .= '<br>';			
		}
		$html = substr($html, 0, -4);
		
		return $html;		
	}

	/**
	* GET AR PROYECTOS SECTION ID 
	* Devuelve un array de section_id de los proyectos que usan las areas autorizadas (estado 2) al usuario actual
	* @return $ar_projects_final
	*	Array formated as id=>project_name  like: [250] => Proyecto de Historia Oral
	*/
	protected function get_ar_proyectos_section() {

		$user_id 			= navigator::get_user_id();
		$ar_projects_final	= array();

		$logged_user_is_global_admin 	= (bool)component_security_administrator::is_global_admin( $user_id );

		if ($logged_user_is_global_admin===true) {
			# ALL PROJECTS
			$strQuery 	= "SELECT section_id FROM matrix_projects";
			$result		= JSON_RecordObj_matrix::search_free($strQuery);
			while ($rows = pg_fetch_assoc($result)) {				
				$ar_proyectos_section_id[] = $rows['section_id'];
			}
			#dump($ar_proyectos_section_id, ' ar_proyectos_section_id');#die();
		}else{
			# ONLY PROJECTS THAT CURRENT USER HAVE AUTHORIZED
			$component_filter_master = component_common::get_instance('component_filter_master',
																	  DEDALO_FILTER_MASTER_TIPO,
																	  $user_id,
																	  'list',
																	  DEDALO_DATA_NOLAN,
																	  DEDALO_SECTION_USERS_TIPO);
				#dump($component_filter_master, ' component_filter_master');
			$dato = $component_filter_master->get_dato();
			if (empty($dato)) {
				$ar_proyectos_section_id = array();
			}else{
				$dato = $component_filter_master->get_dato();
				$ar_proyectos_section_id = array_keys($dato);				
			}			
		}

		if (empty($ar_proyectos_section_id)) {
			
			log_messages("Not projects found. Plese, create one before continue");
			return $ar_projects_final;
		}

		# Final returned array formated as id=>project_name 
		# like: [250] => Proyecto de Historia Oral
		$ar_projects_final = (array)component_common::get_ar_records_with_lang_fallback($ar_proyectos_section_id, DEDALO_PROJECTS_NAME_TIPO, DEDALO_SECTION_PROJECTS_TIPO);
			#dump($ar_projects_final, ' ar_projects_final');
		
		return $ar_projects_final;
	}

	/*
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	*/
	public function get_valor_lang(){

		$relacionados = (array)$this->RecordObj_dd->get_relaciones();
		
		#dump($relacionados,'$relacionados');
		if(empty($relacionados)){
			return $this->lang;
		}

		$termonioID_related = array_values($relacionados[0])[0];
		$RecordObjt_dd = new RecordObj_dd($termonioID_related);

		if($RecordObjt_dd->get_traducible() =='no'){
			$lang = DEDALO_DATA_NOLAN;
		}else{
			$lang = DEDALO_DATA_LANG;
		}
		return $lang;

	}
	
	
}
?>