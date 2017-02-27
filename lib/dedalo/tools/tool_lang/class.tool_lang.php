<?php
/*
* CLASS TOOL LANG
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


class tool_lang extends tool_common {


	public $source_component;
	public $target_component;

	public $ar_source_langs;
	public $ar_source_components;

	public $target_langs;	# From filter 'Projects'

	public $last_target_lang;

	public $section_tipo;

	public static $source_variant = 'source_lang_';
	public static $target_variant = 'target_lang_';


	public function __construct($component_obj, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Para unificar el acceso, se copia el componente a $this->component_obj
		$this->component_obj 	= $component_obj;

		# Fix component
		$this->source_component = $component_obj;
		$this->source_component->set_modo('tool_lang');
		$this->source_component->set_variant( tool_lang::$source_variant );
			#dump($component_obj,'component_obj');

		$this->section_tipo = $component_obj->get_section_tipo();
	}


	/**
	* SOURCE COMPONENTS
	* Grouped by lang like Array([lg-esp]=>component obj)
	*/
	public function get_ar_source_components__DEPRECATED() {
		throw new Exception("Error Processing Request", 1);
		
		if (isset($this->ar_source_components)) return $this->ar_source_components;

		$tipo 			= $this->source_component->get_tipo();
		$parent 		= $this->source_component->get_parent();
		$lang 			= $this->source_component->get_lang();
		#$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

		if ($lang===DEDALO_DATA_NOLAN) {
			$msg = "Current component is not translatable!";
			throw new Exception($msg, 1);
		}
		/*
		# Filtro de registros (sólo para registros de tabla 'matrix')
		# A partir del tipo del parent del componente (la sección a que pertenece) generamos el filtro y verificamos que estamos autorizados a ver este registro
		$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
		if ($matrix_table=='matrix') {
			$RecordObj_matrix 	= new RecordObj_matrix($matrix_table,$parent);
			$section_tipo 		= $RecordObj_matrix->get_tipo();
			$ar_filter 			= filter::get_ar_filter($section_tipo);
				#dump($matrix_table,'ar_filter', "parent $parent en section tipo $section_tipo");

			if (!in_array($parent, $ar_filter)) {
				throw new Exception("Warning tool_lang: You are not authorized to see this record ", 1);
			}
		}
		*/
		$component_ar_langs = (array)$this->source_component->get_component_ar_langs();
			#dump($component_ar_langs,"component_ar_langs $lang");
		/*
		#
		# OTHER LANGS
		#
		# Calculamos todos los idiomas disponibles como origen (los registros existentes en distintos idiomas para este componente)
		$arguments=array();
		$arguments['parent']	= $parent;
		$arguments['tipo']		= $tipo;
		$matrix_table 			= common::get_matrix_table_from_tipo($section_tipo);
		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
		$ar_result				= $RecordObj_matrix->search($arguments);

		# Excluimos el actual del resultado
		#$ar_result = array_diff($ar_result, array($this->source_id_matrix));
			#dump($ar_result,'$ar_result',"$id_matrix");

		# Array de todos los componentes por idioma
		$ar_components_by_lang 	= array();
		foreach ($ar_result as $current_id) {
			$component_obj 							= component_common::get_instance(null, $tipo, $current_id);
			$current_lang 							= $component_obj->get_lang();
			$ar_components_by_lang[$current_lang]	= $component_obj;
		}
		#dump($ar_components_by_lang,'$ar_components_by_lang');
		*/

		$ar_components_by_lang=array();
		foreach ($component_ar_langs as $current_component_lang) {

			if($current_component_lang===$lang) continue; #Skip
			$ar_components_by_lang[$current_component_lang] = component_common::get_instance(get_class($this->source_component), $tipo, $parent, 'edit', $current_component_lang, $this->section_tipo);
		}
		#dump($ar_components_by_lang,"ar_components_by_lang");die();

		$this->ar_source_components = $ar_components_by_lang;

		return $this->ar_source_components;
	}//end get_ar_source_components__DEPRECATED



	/**
	* TARGET COMPONENTS
	* Grouped by lang like Array([lg-esp]=>component obj)
	*//*
	public function get_ar_target_components__DEPRECATED() {
		
		throw new Exception("Error Processing Request get_ar_target_components", 1);
		if (isset($this->ar_target_components)) return $this->ar_target_components;

		$ar_components_by_lang = array();

		$parent 		= $this->source_component->get_parent();
		$tipo 			= $this->source_component->get_tipo();
		#$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

		# Selector target
		#
		#$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
			#dump($matrix_table,'$matrix_table');

		# Section
		$current_tipo 		= $this->source_component->get_section_tipo();
		$section 			= section::get_instance($parent,$current_tipo);
			#dump($section,'section');
		$ar_all_project_langs = $section->get_ar_all_project_langs($resolve_termino=true);
			dump($ar_all_project_langs,'$ar_all_project_langs');

		# Construimos el array final de lenguajes disponibles con la suma de los que tienen todos los proyectos asociados a esta sección
		$ar_target_langs = array();
		$modo 			 = 'tool_lang';
		foreach ($ar_all_project_langs as $project_lang) {

			$ar_target_langs[$project_lang] = RecordObj_dd::get_termino_by_tipo($project_lang,null,true);		#dump($project_lang,'$project_lang');

			# Si ya existe el registro, cogemos el componente de source (ar_source_components)
			if (array_key_exists($project_lang, $this->ar_source_components)) {
				$current_id 	= $this->ar_source_components[$project_lang]->get_id();
				$current_tipo 	= $this->ar_source_components[$project_lang]->get_tipo();
				$component_obj 	= component_common::get_instance(null, $current_tipo, $parent, $modo);
			# Si no existe, creamos un componente vacío con los datos de tipo y parent del componente source y el lang de esta iteración
			}else{
				$component_obj = component_common::get_instance(null, $tipo, $parent, $modo, $project_lang);	#$id=NULL, $tipo=false, $modo='tool_lang', $parent=NULL,
				$component_obj->set_lang($project_lang);
			}

			# Lo guardamos en el array final usando como key el lenguaje actual
			$ar_components_by_lang[$project_lang]	= $component_obj;
		}
		#dump($ar_components_by_lang,'ar_components_by_lang');

		$this->ar_target_components = $ar_components_by_lang;

		return $this->ar_target_components;
	}//END get_ar_target_components__DEPRECATED
	*/



	/**
	* GET TARGET COMPONENT
	*/
	public function get_target_component() {
		/*
		$ar_target_components = $this->get_ar_target_components();
			#dump($ar_target_components,'$ar_target_components');
		if ( isset($this->last_target_lang) && isset($ar_target_components[$this->last_target_lang]) ) {

			$target_component = $ar_target_components[$this->last_target_lang];

		}else{

			$target_component = NULL;
		}

		$this->target_component = $target_component;

		return $this->target_component;
		*/

		$ar_target_langs = $this->get_target_langs();
		if ( isset($this->last_target_lang) && isset($ar_target_langs[$this->last_target_lang]) ) {
			$target_component = component_common::get_instance(get_class($this->source_component),
															$this->source_component->get_tipo(),
															$this->source_component->get_parent(),
															'edit',
															$this->last_target_lang,
															$this->section_tipo
															);			
		}else{
			$target_component = null;
		}

		$this->target_component = $target_component;

		return $this->target_component;
	}//end get_target_component



	/**
	* GET SOURCE LANGS
	*/
	public function get_source_langs() {
		
		$component_ar_langs = (array)$this->source_component->get_component_ar_langs();
	
		$ar_source_langs=array();
		foreach ($component_ar_langs as $current_lang) {

			$name = lang::get_name_from_code($current_lang);
			$ar_source_langs[$current_lang] = $name;
		}
	
		return $ar_source_langs;
	}//end get_source_langs



	/**
	* GET TARGET LANGS
	* Returns a resolved array like lg-spa => Español, lg-eng => English
	* @return array $ar_target_langs
	*/
	public function get_target_langs() {
		/*
		$parent 		 = $this->source_component->get_parent(); 	
		$tipo 			 = $this->source_component->get_tipo();		
		$section_tipo	 = $this->source_component->get_section_tipo();		
		$section	     = section::get_instance($parent, $section_tipo);
		$ar_target_langs = $section->get_ar_all_project_langs($resolve_termino=true);
		*/
		$ar_target_langs = common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);

		return (array)$ar_target_langs;
	}//end get_target_langs
	


	/**
	* GET BABEL DIRECTION
	* Convert lang format like 'lg-spa' to 'sp' for Babel compatibility
	* and return 'direction' in format: 'sp-en' (for translate lg-spa to lg-eng)
	* @param $source_lang
	* @param $target_lang
	*/
	public static function get_babel_direction($source_lang, $target_lang) {

		# for babel like "ca-es";
		$source_babel	= substr($source_lang,3,2);
		$target_babel	= substr($target_lang,3,2);

		return $source_babel . '-' . $target_babel ;
	}//end get_babel_direction



	/**
	* SANITIZE RESULT
	* Sanitize Babel result string
	* @param $result
	*/
	public static function sanitize_result(&$result) {

		# resolve babel capitalize tags (from '[index-N-4]' to '[index-n-4]')
		#string = "\[\/{0,1}(index)-([a-z])-([0-9]{1,6})\]";
		#preg_replace("/(<\/?)(\w+)([^>]*>)/e", "'\\1'.strtoupper('\\2').'\\3'", $html_body);
		#$result		= preg_replace("/(\[index-)(N)(-[0-9]{1,6}\])/", '$1'.'n'.'$3', $result);	# '$1'.strtolower('$2').'$3'
		#$result		= preg_replace("/(\[index-)(R)(-[0-9]{1,6}\])/", '$1'.'r'.'$3', $result);

		$result		= preg_replace("/(\[\/{0,1}index-)(N)(-[0-9]{1,6}\])/", '$1'.'n'.'$3', $result);	# '$1'.strtolower('$2').'$3'
		$result		= preg_replace("/(\[\/{0,1}index-)(R)(-[0-9]{1,6}\])/", '$1'.'r'.'$3', $result);

		# PATTERN IN TR CLASS: "\[\/{0,1}(index)-([a-z])-([0-9]{1,6})\]";

		return $result;
	}//end sanitize_result



}//end class
?>