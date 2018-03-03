<?php
/*
* BUTTON_COMMON
*
*
*/
class button_common extends common {
	
	protected $tipo ;
	protected $modelo ;
	protected $label ;
	protected $modo ;
	protected $lang ;
	protected $target ;
	protected $section_tipo ;

	public $context_tipo; //dependiendo de quien realice la llamada (area, seccion...) enviará su tipo, independiente de modelo, el tipo será el contexto de la llamada (dd12, dd323...)
	
	function __construct($tipo, $target, $section_tipo) {
		
		$this->tipo 		= $tipo;
		$this->target 		= $target;
		$this->section_tipo = $section_tipo;

		$this->define_id(NULL);
		$this->define_lang(DEDALO_APPLICATION_LANG);	
		$this->define_modo(navigator::get_selected('modo'));

		parent::load_structure_data();

		# Target is normally a int section id matrix
		if(!empty($target) && !is_int($target)) throw new Exception("Error creating delete button (target $target is not valid int id matrix)", 1);		
	}

	# define id
	protected function define_id($id) {	$this->id = $id ; }
	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }

	
	/**
	* GET_BUTTON_CACHE_KEY_NAME
	*/
	public function get_button_cache_key_name() {
		return DEDALO_DATABASE_CONN.'_button_get_html_'.$this->modo.'_'.$this->lang.'_'.$this->tipo; //.'_'.common::get_permissions($this->tipo);
	}

	# GET HTML CODE . RETURN INCLUDE FILE __CLASS__.PHP
	public function get_html() {

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_IN_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}
		/*
		# No se meten en cahe ni devuelven nada
		$permissions = 0;
		if(login::is_logged()===true && isset($this->tipo)) {
			$permissions = common::get_permissions($this->tipo);
			if($permissions<1) return null;
		}
		*/
		# DEDALO_CACHE_MANAGER : var
		if(DEDALO_CACHE_MANAGER && CACHE_BUTTONS) {
			$cache_key_name = $this->get_button_cache_key_name();
			if (cache::exists($cache_key_name)) {
				return cache::get($cache_key_name);
			}
		}
		
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. get_called_class() .'/'. get_called_class() . '.php' );
		$html =  ob_get_clean();
		

		# DEDALO_CACHE_MANAGER : Lo metemos en cache
		if(DEDALO_CACHE_MANAGER && CACHE_BUTTONS) {
			cache::set($cache_key_name, $html);
		}

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_OUT_'.$this->tipo.'_'.microtime(1)]=microtime(1);
		}
		
		return $html;
	}	
	
	
	
	# LOAD ONE COMPONENT BY ID OR TIPO
	public static function load_button($tipo, $target) {
		
		die("DEPRECATED!");
		/*
		# Creamos un nuevo objeto de estructura (tesauro)
		$RecordObj_dd		= new RecordObj_dd($tipo);
		
		# Obtenemos su modeloID para identificar el tipo del componente
		$modeloID			= $RecordObj_dd->get_modelo();
		
		if(!$modeloID)		die(__METHOD__ ." -> Invalid modeloID ($modeloID) from id: $current_id , tipo: $tipo");	
		
		# Despejamos el nombre del modelo que será el tipo del componente (ej. 'component_input_text') y es también el nombre de la clase del mismo
		$clase_name			= RecordObj_dd::get_termino_by_tipo($modeloID);	#DEDALO_APPLICATION_LANG	
		
		
		# COMPONENT . CREATE COMPONENT OBJ BY CLASS NAME
		# var_dump( is_callable($clase_name, true, $component) );				
		$button				= new $clase_name($tipo, $target);			
		
		return $button ;
		*/
	}//end load_button
	

}//end button_common
?>