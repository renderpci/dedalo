<?php
/*
* CLASS SECTION
*/
require_once(DEDALO_LIB_BASE_PATH . '/search/records_search/class.records_search.php');
require_once(DEDALO_LIB_BASE_PATH . '/search/records_navigator/class.records_navigator.php');



class section extends common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# FIELDS
	# protected $id;
	protected $section_id;
	protected $tipo;
	protected $dato;

	# STATE
	protected $modo;

	# STRUCTURE DATA
	protected $RecordObj_dd ;
	protected $modelo ;
	protected $norden ;
	protected $label ;

	public $ar_section_list_obj ;
	public $ar_section_group_obj ;
	public $ar_section_relations;			# array de etiquetas de esta sección (en relaciones)
	public $rel_locator;					# usado cuando desglosamos una relación inversa (tag=>sections)
	public $tag;							# usado cuando desglosamos una relación inversa (tag=>sections)

	protected static $ar_id_records ;		# array of records of current section (int id_matrix)

	# Buttons objs
	public $ar_buttons ;
	public $button_new_object ;
	public $button_delete_object ;

	public $caller_id;						# Necesario para calcular relation (también se admite como REQUEST['caller_id'])
	public $caller_tipo;
	public $ar_section_relations_for_current_tipo_section;	# Necesario para calcular relation
	public $ar_id_section_custom;

	public $ar_id_records_from_portal;
	public $ar_all_project_langs;

	public $show_inspector = true;			# default show: true

	# Array of components (tipo) to show in portal_list mode
	# used by component_layout and set from component_portal
	public $portal_layout_components;
	public $portal_tipo;

	public $section_virtual 	 = false;
	public $section_real_tipo ;

	static $active_section_id;

	public $is_temp = false;	# Used to force save data to session instead database. Default is false
	
	public $options;
	# CACHE SECTIONS INSTANCES
	#public static $ar_section_instances = array(); # array chache of called instances of components

	#protected $relations; * Ver de fijar la variable en la sección al construir el objeto ......


	# SAVE_HANDLER
	# Default is 'database'. Other options like 'session' are accepted
	# Note that section change automatically this value (to 'session' for example) when received section_id is like 'temp1' for manage this cases as temporal section
	public $save_handler = 'database';


	# DIFFUSION INFO
	# Store section diffusion info. If empty, current section is not publish.
	# Format is array or null
	# protected $diffusion_info;
	

	# INVERSE RELATIONS
	# Parents sections that call to this sections with portals or autocompletes
	# array of locators with, section_id, section_tipo and component_tipo (the compoment that call),
	# public $inverse_locators;

	/**
	* GET_INSTANCE
    * Singleton pattern
    * @returns array array of section objects by key
    */
    public static function get_instance($section_id=null, $tipo=false, $modo='edit', $cache=true) {

    	if ($tipo===false) {
			throw new Exception("Error: on construct section : tipo is mandatory. section_id:$section_id, tipo:$tipo, modo:$modo", 1);
		}		

		# Not cache new sections (without section_id)
    	if (empty($section_id)) {
    		return new section(null, $tipo, $modo);
    	}

		# Direct construct without cache instance
		# Use this config in imports
		if ($cache===false) {
			return new section($section_id, $tipo, $modo);
		}

    	static $ar_section_instances;

    	# key for cache
    	$key = $section_id .'_'. $tipo;

    	$max_cache_instances = 160*2; // 500
		$cache_slice_on 	 = 40*2; // 200 //$max_cache_instances/2;

    	# OVERLOAD : If ar_section_instances > 99 , not add current section to cache to avoid overload
    	# array_slice ( array $array , int $offset [, int $length = NULL [, bool $preserve_keys = false ]] )
    	if (isset($ar_section_instances) && count($ar_section_instances)>$max_cache_instances) { // 200 | 300
			#$first_section = reset($ar_section_instances);
    		#unset($first_section);
    		$ar_section_instances = array_slice($ar_section_instances, $cache_slice_on, null, true); // 100 | 150
    		if(SHOW_DEBUG===true) {
    			debug_log(__METHOD__.' '.DEDALO_HOST." Overload secions prevent (max $max_cache_instances). Unset first $cache_slice_on cache items [$key]");
    		}

    		// let GC do the memory job
			time_nanosleep(0, 10000000); // 10 ms
    		#return new section($section_id, $tipo, $modo);
    	}

    	# FIND CURRENT INSTANCE IN CACHE
    	if ( !array_key_exists($key, (array)$ar_section_instances) ) {    		  	
    		$ar_section_instances[$key] = new section($section_id, $tipo, $modo);
    		#debug_log(__METHOD__." NO exite una instancia de la sección $key. Se devuelve el objeto estático");
    	}else{
    		if(SHOW_DEBUG===true) {
    			#debug_log(__METHOD__." Ya exite una instancia de la sección $key. Se devuelve el objeto estático");
    		}			
    	}
    	if(SHOW_DEBUG===true) {
    		#debug_log('ar_section_instances: '.count($ar_section_instances));;
    	}
    	#dump( array_keys($ar_section_instances), ' ar_section_instances'); 	
       
        return $ar_section_instances[$key];
    }//end get_instance



	/**
	* CONSTRUCT
	* Extends parent abstract class common
	* La sección, a diferencia de los componentes, se comporta de un modo particular:
	* Si se le pasa sólo el tipo, se espera un listado (modo list)
	* Si se le pasa sólo el section_id, se espera una ficha (modo edit)
	*/
	private function __construct($section_id=null, $tipo=false, $modo='edit') {

		if ($tipo===false) {
			throw new Exception("Error: on construct section : tipo is mandatory. section_id:$section_id, tipo:$tipo, modo:$modo", 1);
		}

		if(SHOW_DEBUG===true) {
			#$section_name = RecordObj_dd::get_termino_by_tipo($tipo,null,true);
			#global$TIMER;$TIMER[__METHOD__.'_' .$section_name.'_IN_'.$tipo.'_'.$modo.'_'.$section_id.'_'.microtime(1)]=microtime(1);
		}

		# Set general vars
		$this->section_id 	= $section_id;
		$this->tipo 		= $tipo;
		$this->modo 		= $modo;
		$this->parent 		= 0;


		# When tipo is set, calculate structure data
		parent::load_structure_data();

		/*
			# Relaciones
			$relaciones = $this->RecordObj_dd->get_relaciones()[0];
			#dump($relaciones,'relaciones '.$this->tipo);

			if(!empty($relaciones)) {
				foreach ($relaciones as $key => $value) {
					$modelo 	= RecordObj_dd::get_termino_by_tipo($key);
					if($modelo=='section')
					$this->tipo = $value;
				}
			}
		*/

		# ACTIVE_SECTION_section_id : Set global var
		if($modo==='edit'
		 	&& ($this->section_id>0 || strpos($this->section_id, DEDALO_SECTION_ID_TEMP)!==false)
			&& !isset(section::$active_section_id) ) {
				section::$active_section_id = $this->get_section_id();
		}

		if(SHOW_DEBUG===true) {
			#global$TIMER;$TIMER[__METHOD__.'_' .$section_name.'_OUT_'.$tipo.'_'.$modo.'_'.$section_id.'_'.microtime(1)]=microtime(1);
		}
	}//end __construct
	


	/**
	* GET DATO
	*/
	public function get_dato() {

		if ($this->modo!=='edit') {
			#return NULL;
		}

			# If section_id have a temporal string the save hander will be 'session' the section will save into the menory NOT to database
			if( strpos($this->section_id, DEDALO_SECTION_ID_TEMP)!==false ){
				$this->save_handler = 'session';
			}

			#
			# SAVE_HANDLER DIFFERENT TO DATABASE CASE
			# Sometimes we need use section as temporal element without save real data to database. Is this case
			# data is saved to session as temporal data and can be recovered from $_SESSION['dedalo4']['section_temp_data'] using key '$this->tipo.'_'.$this->section_id'
			if (isset($this->save_handler) && $this->save_handler==='session') {
				$temp_data_uid = $this->tipo.'_'.$this->section_id;
				# Fix dato as object
				if (isset($_SESSION['dedalo4']['section_temp_data'][$temp_data_uid])) {
					$section_temp_data = clone $_SESSION['dedalo4']['section_temp_data'][$temp_data_uid];
					$this->dato = $section_temp_data;
				}else{
					$this->dato = new stdClass();
				}				
				return $this->dato;
			}


		if(SHOW_DEBUG===true) {
			#$start_time = start_time();
			#global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
			/*
		#dump($this,'pre load_matrix_data');
		parent::load_matrix_data();

		$dato = parent::get_dato();
		#dump($this,'post load_matrix_data');
		*/

		# CACHE DATO
		/*
		static $section_dato_static;

		if(isset($section_dato_static[$this->section_id])) {
			#trigger_error("Cacheado dato in section $this->section_id ($this->tipo)");
			#return($section_dato_static[$this->section_id]);
		}
		*/

		if( empty($this->section_id) || (abs($this->section_id)<1 && strpos($this->section_id, DEDALO_SECTION_ID_TEMP)===false) ) {

			# Experimental (devolvemos como que ya se ha intentado cargar, aunque sin section_id)
			#$this->bl_loaded_matrix_data = true;
			debug_log(__METHOD__." error on get dato . Trying get dato from section section_id = 0 ($this->section_id) ", logger::DEBUG);
			if(SHOW_DEBUG===true) {
				#dump($this,"this section");
				#throw new Exception("Error on get dato:  Trying get dato in modo edit without section_id section. Section section_id = ($this->section_id) in modo $this->modo", 1);
			}			
			
			return null;
		}

		if( $this->bl_loaded_matrix_data!==true ) {
		# Experimental (si ya se ha intentado cargar pero con sin section_id, y ahora se hace con section_id, lo volvemos a intentar)
		#if( !$this->bl_loaded_matrix_data || ($this->bl_loaded_matrix_data && intval($this->section_id)<1) ) {

			#if the section virtual have the section_tipo "real" in properties change the tipo of the section to the real
			if(isset($this->propiedades->section_tipo) && $this->propiedades->section_tipo==='real'){
				$tipo = $this->get_section_real_tipo();
			}else{
				$tipo = $this->tipo;
			}
			
			$section_tipo 			= $this->tipo;
			$matrix_table 			= common::get_matrix_table_from_tipo($section_tipo);
			$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table,$this->section_id, $tipo);

			$dato = $JSON_RecordObj_matrix->get_dato();
				#dump($dato,"dato $matrix_table - $this->section_id"); die();

			# Fix dato as object
			$this->dato = (object)$dato;
				#dump($dato, ' dato ++ '.to_string());

			# Fix inverse_locators 
			$this->inverse_locators = isset($dato->inverse_locators) ? (array)$dato->inverse_locators : array();

			/* modificar esta verificación. con secciones virtuales no funciona..
			if ( !empty($this->section_id) && (!property_exists($this->dato, 'section_tipo') || $this->dato->section_tipo!=$this->tipo) ) {
				if(SHOW_DEBUG===true) {
					dump($this->dato->section_tipo, "dato->section_tipo/tipo: ".$this->dato->section_tipo."/$this->tipo");
				}
				#dump($this->dato, ' $this->dato');
				throw new Exception("Error Processing Request. Section tipo inconsistency detected!", 1);					
			}
			*/

			$this->bl_loaded_matrix_data = true;

			# CACHE DATO
			/*
			trigger_error("Loaded dato in section $this->section_id ($this->tipo)");
			$section_dato_static[$this->section_id] = $this->dato;
			*/
		}

		if(SHOW_DEBUG===true) {
			#$start_time = start_time();
			#global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		
		return $this->dato;
	}//end get_dato



	/**
	* GET_COMPONENT_DATO
	* Extrae del contenedor de la sección, el dato específico de cada componente en el idioma requerido
	* will be depercated with the get_all_component_data (08-2017)
	*/
	public function get_component_dato($component_tipo, $lang, $lang_fallback=false) {

		$component_dato = null;

		if(SHOW_DEBUG===true) {
			#$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$component_tipo.'_'.$lang .'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
	
		if ( abs($this->section_id)<1 && strpos($this->section_id, DEDALO_SECTION_ID_TEMP)===false ) {
			if(SHOW_DEBUG===true) {
				if ($this->section_id==='result') {
					throw new Exception("Error Processing Request. 'result' is not valid section_id. Maybe you are using foreach 'ar_list_of_values' incorrectly", 1);				
				};
			}
			throw new Exception("Error Processing Request. get_component_dato of section section_id <1 is not allowed (section_id:'$this->section_id')", 1);			
		}

		$section_tipo 	= $this->tipo;
		$datos 			= $this->get_dato();
			#dump($datos,'$datos');
			#if ($component_tipo==='oh22') {
			#	dump($datos,"DATOS A OF FILTER section_tipo:$section_tipo - section_id:$this->section_id, $lang");#die();
			#}
			#dump($datos," datos");
		
		
		if (is_object($datos)) {

			if (isset($datos->components->$component_tipo->dato->$lang)) {
				$component_dato = $datos->components->$component_tipo->dato->$lang;
			}else{
				
				if ($lang_fallback===true) {
					$lang_default = DEDALO_DATA_LANG_DEFAULT;
					if (isset($datos->components->$component_tipo->dato->$lang_default)) {
						$component_dato = $datos->components->$component_tipo->dato->$lang_default;
					}
					# Opcionalmente se podría hacer otro intento para el NOLAN en los casos en que se pida un dato en el idioma actual a un componente no traducible.. 
					# valorar...
				}
				#dump($datos->components->$component_tipo->dato,"obj dato");die();
				#throw new Exception("Error Processing Request", 1);				
			}
		}else{
			trigger_error("Error on read component_dato $component_tipo" ); 
			#dump($datos->components->$component_tipo->dato->$lang,'$datos->components->$component_tipo->dato->$lang');
		}

		if(SHOW_DEBUG===true) {
			#$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$component_tipo.'_'.$lang .'_'.$this->modo.'_'.microtime(1)]=microtime(1);
			#if ($component_tipo==='oh22') {
			#	dump($datos," DATOS B OF FILTER section_tipo:$section_tipo - section_id:$this->section_id");	
			#}
			#dump($component_dato," component_dato component_tipo:$component_tipo - lang:$lang");	
		}
		#debug_log(__METHOD__." component_dato ".to_string($component_dato), logger::DEBUG);

		return $component_dato;
	}#end get_component_dato



	/**
	* GET_ALL_COMPONENT_DATA
	* @return component_data
	* get all data of the component, with dato, valor, valor_list and dataframe
	* this function will be the only comunication with the component for get the information (08-2017)
	*/
	public function get_all_component_data($component_tipo) {

		$component_data = null;

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$component_tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
	
		if ( abs($this->section_id)<1 && strpos($this->section_id, DEDALO_SECTION_ID_TEMP)===false ) {
			if(SHOW_DEBUG===true) {
				if ($this->section_id==='result') {
					throw new Exception("Error Processing Request. 'result' is not valid section_id. Maybe you are using foreach 'ar_list_of_values' incorrectly", 1);				
				};
			}
			throw new Exception("Error Processing Request. get_component_data of section section_id <1 is not allowed (section_id:'$this->section_id')", 1);			
		}

		$section_tipo 	= $this->tipo;
		$section_data 	= $this->get_dato();
			#dump($section_data,'$section_data');
			#if ($component_tipo==='oh22') {
			#	dump($section_data,"section_DATa A OF FILTER section_tipo:$section_tipo - section_id:$this->section_id, $lang");#die();
			#}
			#dump($section_data," section_data");
		
		
		if (is_object($section_data)) {

			if (isset($section_data->components->$component_tipo)) {
				$component_data = $section_data->components->$component_tipo;
			}
		}else{
			trigger_error("Error on read component_data $component_tipo" ); 
			#dump($section_data->components->$component_tipo->dato->$lang,'$section_data->components->$component_tipo->dato->$lang');
		}

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$component_tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);		
		}


		return $component_data;		
	}//end get_all_component_data



	/**
	* SAVE_COMPONENT_DATO
	* Salva el dato del componente recibido en el contenedor JSON de la sección
	* Reconstruye el objeto global de la sección (de momento no se puede salvar sólo una parte del objeto json en postgresql)
	* procesa los datos indirectos del componente (valor y valor_list) y guarda el nuevo objeto global reemplazando el anterior
	*/
	public function save_component_dato($component_obj) {

		#dump($this->get_id(),"obj");die();
		#dump(get_class($component_obj),"class");die("8");
		#dump($component_obj->get_tipo(),"tipo");

		# La sección es necesaria antes de gestionar el dato del componente. Si no existe, la crearemos previamente
		if (abs($this->get_section_id())<1  && strpos($this->get_section_id(), DEDALO_SECTION_ID_TEMP)===false) {
			$section_id = $this->Save();
			trigger_error("Se ha creado una sección ($section_id) disparada por el salvado del componente ".$component_obj->get_tipo());
			if(SHOW_DEBUG===true) {
				throw new Exception("Warning : Trying save component in section without section_id. Created section and saved", 1);				
			}
		}

		#
		# SECTION GLOBAL DATO : Dato objeto global de la sección
		$dato = $this->get_dato();
			#dump($dato,"dato");
			if (!is_object($dato)) {
				throw new Exception("Error Processing Request. Section Dato is not object", 1);				
			}

		#
		# COMPONENT_GLOBAL_DATO : Extrae la parte del componente desde el objeto global de la sección
		$component_tipo 		= $component_obj->get_tipo();
		$component_lang 		= $component_obj->get_lang();
		$component_valor_lang 	= $component_obj->get_valor_lang();
		$component_modelo_name 	= get_class($component_obj);	#RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component_traducible 	= $component_obj->get_traducible();

		if (empty($component_tipo)) {
			throw new Exception("Error Processing Request: component_tipo is empty", 1);			
		}

			#unset($dato->components->$component_tipo);

			# SELECT COMPONENT IN SECTION DATO
			if (isset($dato->components->$component_tipo)) {
				# Si el dato del componente existe en la sección, lo seccionamos
				$component_global_dato = $dato->components->$component_tipo;
					#dump($component_global_dato,"component_global_dato");
			}else{
				# Si no existe, lo creamos con la información actual
				$obj_global 						= new stdClass();
				$obj_global->$component_tipo 		= new stdClass();
				$component_global_dato 				= new stdClass();
				$component_global_dato				= $obj_global->$component_tipo;

				# INFO : Creamos la info del componente actual
				$component_global_dato->info 		= new stdClass();
				$component_global_dato->info->label  = RecordObj_dd::get_termino_by_tipo($component_tipo,null,true);
				$component_global_dato->info->modelo = $component_modelo_name;

				$component_global_dato->dato		= new stdClass();
				$component_global_dato->valor		= new stdClass();
				$component_global_dato->valor_list	= new stdClass();
				$component_global_dato->dataframe	= new stdClass();			
			}
	

			# DATO OBJ
			if (!isset($component_global_dato->dato->$component_lang)) {
				$component_global_dato->dato->$component_lang = new stdClass();
			}

			# VALOR OBJ
			if (!isset($component_global_dato->valor)) {
				$component_global_dato->valor = new stdClass();
				}
				if (!isset($component_global_dato->valor->$component_lang)) {
					$component_global_dato->valor->$component_lang = new stdClass();
				}

			# VALOR LIST OBJ
			if (!isset($component_global_dato->valor_list)) {
				$component_global_dato->valor_list = new stdClass();
				}
				if (!isset($component_global_dato->valor_list->$component_lang)) {
					$component_global_dato->valor_list->$component_lang = new stdClass();
				}

			# DATAFRAME  OBJ
			if (!isset($component_global_dato->dataframe)) {
				$component_global_dato->dataframe = new stdClass();
				}
		
		#
		# DATO : Actualizamos el dato en el idioma actual		
			$component_global_dato->dato->$component_lang = $component_obj->get_dato_unchanged(); ## IMPORTANT !!!!! (NO usar get_dato() aquí ya que puede cambiar el tipo fijo establecido por set_dato)
				#dump($component_global_dato,"component_global_dato");
	
		#
		# VALOR : Actualizamos el valor en el idioma actual
			switch ($component_modelo_name) {
				case 'component_security_access':
				case 'component_security_areas':
				case 'component_security_tools':
					$component_global_dato->valor->$component_lang = ''; // Don't save valor'
					break;
				
				default:
					if($component_lang===$component_valor_lang && $component_traducible==='si') {
						$component_global_dato->valor->$component_lang = $component_obj->get_valor();
					}else{
						$component_global_dato->valor->$component_lang = $component_obj->get_dato_unchanged();
					}
					break;
			}			

		#
		# VALOR LIST : Actualizamos el Html del componente en modo list		
			if(SHOW_DEBUG===true) $start_time = microtime(true);
			
			# valor_list is dato for some components			
			
			# Every component have a method to return value to save in json container 'valor_list' 
			# (if not, they use component common defined method)
			$html = $component_obj->get_valor_list_html_to_save();
		
			if(SHOW_DEBUG===true) {
				$total=round(microtime(true)-$start_time,3);
				if ($total>1000) {
					debug_log(__METHOD__." SLOW Time To Generate list html of ".RecordObj_dd::get_termino_by_tipo($component_tipo,null,true)." [$component_tipo]: ". $total );
				}
			}
			if($component_lang === $component_valor_lang ){
				$component_global_dato->valor_list->$component_lang = $html;
			}else{
				$component_global_dato->valor_list->$component_lang = $component_obj->get_dato_unchanged();	
			}
				#dump($component_global_dato->valor_list->$component_lang);#die();

		#
		# DATO_SEARCH
			switch ($component_modelo_name) {				
				case 'component_autocomplete_ts':					
					if (!isset($component_global_dato->dato_search)) {
						$component_global_dato->dato_search = new stdClass();
						}
						if (!isset($component_global_dato->dato_search->$component_lang)) {
							$component_global_dato->dato_search->$component_lang = new stdClass();
						}
					$component_global_dato->dato_search->$component_lang = $component_obj->get_dato_search();
					break;
				default: // Nothing to do
			}


		# DATAFRAME
			$component_global_dato->dataframe = $component_obj->get_dataframe();

		#
		# REPLACE COMPONENT PORTION OF GLOBAL OBJECT :  Actualizamos todo el componente en el objeto global
		if (!isset($dato->components->$component_tipo)) {
			if (!isset($dato->components)) {
				$dato->components = new stdClass();
			}
			$dato->components->$component_tipo = new stdClass();
		}
		$dato->components->$component_tipo = $component_global_dato;
			#dump($component_global_dato,"dato del componente");


		#
		# DIFFUSION_INFO
		$dato->diffusion_info = null;	// Always reset section diffusion_info on save components	


		#
		# Fix main section dato
		$this->dato = $dato;		
	

		#
		# OPTIONAL STOP THE SAVE PROCESS TO DELAY DDBB ACCESS		
		if (isset($component_obj->save_to_database) && $component_obj->save_to_database===false) {
			# Stop here (remember make a real section save later!)
			# No component time machine data will be saved when section saves later
			#debug_log(__METHOD__." Stopped section save process component_obj->save_to_database = true ".to_string(), logger::ERROR);
			return $this->section_id;
		}


		#
		# TIME MACHINE DATA
		# We save only current component lang 'dato' in time machine
		$save_options = new stdClass();
			$save_options->time_machine_data = $component_obj->get_dato_unchanged();
			$save_options->time_machine_lang = $component_lang;
			$save_options->time_machine_tipo = $component_tipo;

		
		$result = $this->Save( $save_options );

		#
		# DIFFUSION_INFO
		# Note that this process can be very long if there are many inverse locators in this section
		# To optimize save process in scripts of importation, you can dissable this option if is not really necessary
		#		
		#$dato->diffusion_info = null;	// Always reset section diffusion_info on save components
		#register_shutdown_function( array($this, 'diffusion_info_propagate_changes') ); // exec on __destruct current section
		if ($component_obj->update_diffusion_info_propagate_changes===true) {
			$this->diffusion_info_propagate_changes();
			# debug_log(__METHOD__." Deleted diffusion_info data for section $this->tipo - $this->section_id ", logger::DEBUG);
		}
		

		return $result;
	}#end save_component_dato




	/**
	* BUILD_AR_SECTION_CREATOR
	* Construye el array con los datos de creación de la sección
	* Se utilizará para filtrar las secciones virtuales en recuperación, que quedarán 'vinculadas' al portal desde donde se crearon
	* Principalmente, se plantea para gestionar eficientemente los recursos compartidos (imágenes, documentos, etc.) y poder filtrarlos por 'creador'
	* al acceder a los listados desde los mismos.
	* Ej. Las fotos de informantes creadas desde el portal de informantes, debería acceder (botón '+ Existente') a los listados de las imágenes creadas
	* desde ese portal para no mezclarlas con las imágenes de investigadores u otras secciones que acceden a la misma tipología de imagen
	*
	* @var top_tipo
	*		Tipo de la sección principal en la que estamos trabajando 'top'. Se guarda por html_page en TOP_TIPO
	*		Será el mismo que el de la propia sección, salvo que se cree desde un portal
	*
	* @var portal_section_tipo
	*		Tipo de la sección del portal desde donde se crea esta sección (si se crea desde un portal)
	* 				  
	* @var portal_tipo
	*		Tipo del portal desde donde se crea esta sección (si se crea desde un portal)
	*/
	public static function build_ar_section_creator($top_tipo=null, $portal_section_tipo=null, $portal_tipo=null) {
	
		# top_tipo
		if (is_null($top_tipo) || empty($top_tipo) || !$top_tipo) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." empty received top_tipo. Fallback made to top_tipo = $top_tipo - ".TOP_TIPO." - tipe: ".gettype($top_tipo) , logger::DEBUG);
				#dump(debug_backtrace());
			}
			$top_tipo = TOP_TIPO;			
		}		

		return array(
				'top_tipo' 				=> $top_tipo,
				'portal_section_tipo' 	=> $portal_section_tipo,
				'portal_tipo' 			=> $portal_tipo
				);
	}#end build_section_locator


	

	/**
	* SAVE 
	* Create a new section or update section record in matrix
	*/
	public function Save( $save_options=null ) {

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		# OPTIONS DEFAULT
		$options = new stdClass();
			$options->is_portal			 	= false;
			$options->portal_tipo 		 	= false;
			$options->main_components_obj 	= false;
			$options->top_tipo				= TOP_TIPO;
			$options->top_id				= TOP_ID;
			$options->new_record			= false;
			
			# Time machine options (overwrite when save component)
			$options->time_machine_data		= false;
			$options->time_machine_lang		= false;
			$options->time_machine_tipo		= false;

			$options->time_machine_section_id = (int)$this->section_id; // always


		if ($save_options!=null) {
			if (!is_object($save_options)) {
				trigger_error("Error: save_options is not an object : ".print_r($save_options,true));
				return false;
			}
			# Options overwrite sql_options defaults
			foreach ((object)$save_options as $key => $value) {
				# Si la propiedad recibida en el array options existe en sql_options, la sobreescribimos
				#if (isset($options->$key)) {
				if (property_exists($options, $key)) {
					$options->$key = $value;
					#dump($value, "key: $key changed from ", array());
				}
			}
			#dump($options,"options"); #dump($save_options,"save_options");die();
		}
		#dump($options,"options"); die();#dump($save_options,"save_options");die();

		$tipo = $this->get_tipo();

		#if the section virtual have the section_tipo "real" in properties change the tipo of the section to the real
		if(isset($this->propiedades->section_tipo) && $this->propiedades->section_tipo === "real"){
			$tipo = $this->get_section_real_tipo();
		}
		
		# TIPO : Verify tipo is structure data		 
		if( !(bool)verify_dedalo_prefix_tipos($tipo) )
			throw new Exception("Current tipo is not valid : $tipo", 1);

		# ORIGINAL TIPO : always keeps the original type (current)
		$original_tipo = $tipo;

		# SECTION VIRTUAL . Correct tipo
		# Si estamos en una sección virtual, despejaremos el tipo real (la sección de destino) y
		# trabajaremos con el tipo real a partir de ahora
		if($original_tipo===DEDALO_ACTIVITY_SECTION_TIPO){
			$section_real_tipo = $original_tipo;
		}else{
			$section_real_tipo = $this->get_section_real_tipo();
		}
		
		/*
		if($section_real_tipo!=$original_tipo) {
			# Overwrite current section tipo with real section tipo
			$tipo = $section_real_tipo;
		}
		*/		
			#
			# SAVE_HANDLER DIFFERENT TO DATABASE CASE
			# Sometimes we need use section as temporal element without save real data to database. Is this case
			# data is saved to session as temporal data and can be recovered from $_SESSION['dedalo4']['section_temp_data'] using key '$this->tipo.'_'.$this->section_id'
			if (isset($this->save_handler) && $this->save_handler==='session') {
				#dump($this->dato, ' this->dato ++ '.to_string());
				$temp_data_uid = $this->tipo.'_'.$this->section_id;
				if(!isset($_SESSION['dedalo4']['section_temp_data'][$temp_data_uid])) {
					$section_temp_data = (object)$this->dato;
				}else{
					$section_temp_data = (object)$this->get_dato();
				}
				
				# Set value to session
				# Always encode and decode data before store in session to avoid problems on unserialize not loaded classes
				$_SESSION['dedalo4']['section_temp_data'][$temp_data_uid] = json_decode( json_encode($section_temp_data) );

				return $this->section_id;
			}
		

		$matrix_table = common::get_matrix_table_from_tipo($original_tipo); // This function fallback to real section if virtal section don't have table defined

		
		if ($this->section_id >= 1) { # UPDATE RECORD 

			################################################################################
			# UPDATE RECORD : Update current matrix section record trigered by one component
							
			$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix( (string)$matrix_table, (int)$this->section_id, (string)$tipo);
			$dato 					= (object)$this->get_dato();

			# Section modified by userID
			$dato->modified_by_userID 	= (int)navigator::get_user_id();
			
			# Section modified date
			$dato->modified_date 		= (string)component_date::get_timestamp_now_for_db();	# Format 2012-11-05 19:50:44

			# Inverse locators
			#$dato->inverse_locators 	= (array)$this->inverse_locators;

			$JSON_RecordObj_matrix->set_datos($dato);
			$saved 				= $JSON_RecordObj_matrix->Save( $options );		#dump($options,"options ".to_string($dato));
			#$this->section_id 	= $JSON_RecordObj_matrix->get_ID();
			

		}else{ # NEW RECORD 

			################################################################################
			# NEW RECORD . Create and save matrix section record in correct table	

			##
			# COUNTER : Counter table. Default is ¡matrix_counter¡
			# Preparamos el id del contador en función de la tabla sobre la que estamos trabajando (matrix, matrix_dd, etc.)
			# Por defecto será 'matrix_counter', peri si nuestra tabla de sección es distinta de 'matrix' usaremos una tabla de 
			# contador distinta formateada como 'matrix_counter' + substr($matrix_table, 6). Por ejemplo 'matrix_counter_dd' para matrix_dd
			$matrix_table_counter = 'matrix_counter';
			if ( substr($matrix_table, -3)==='_dd' ) {
				$matrix_table_counter = 'matrix_counter_dd';
			}				
			$current_id_counter = (int)counter::get_counter_value($original_tipo, $matrix_table_counter);	#counter::get_new_counter_value($original_tipo, $matrix_table_counter);
			$section_id_counter = $current_id_counter+1;
			if(SHOW_DEBUG===true) {
				#dump($matrix_table, 'matrix_table', array());
				#dump($matrix_table_counter, 'matrix_table_counter', array());
				#dump($current_id_counter, 'section_id_counter for '.$original_tipo, array());
				#debug_log(__METHOD__." Saved in counter table: $matrix_table_counter : $section_id_counter ($tipo) ".RecordObj_dd::get_termino_by_tipo($tipo));
			}
			#dump($section_id_counter,"section_id_counter");

			# Fix section_id
			$this->section_id = (int)$section_id_counter;

			##
			# SECTION JSON DATA 
			# Store section dato as array(key=>value)

				# SECTION_OBJ
				# When section is created at first time, section_obj is created wit basic data to write a 'empty section'
				# In some cases, before save at first time, data exits in section object. Take care of this data is added to
				# current first section data or not 
				$section_obj = new stdClass();

					# Section id
					$section_obj->section_id		= (int)$section_id_counter;
					
					# Section tipo
					$section_obj->section_tipo 		= (string)$original_tipo;

					# Section real tipo
					$section_obj->section_real_tipo	= (string)$section_real_tipo;
					
					# Section label
					$section_obj->label 			= (string)RecordObj_dd::get_termino_by_tipo($original_tipo,null,true);
					
					# Section created by userID
					$section_obj->created_by_userID = (int)navigator::get_user_id();
					
					# Section created date
					$section_obj->created_date 		= (string)component_date::get_timestamp_now_for_db();	# Format 2012-11-05 19:50:44

					# diffusion_info
					$section_obj->diffusion_info 	= array(); // Empty array by default

					# Inverse locators
					if (isset($this->dato->inverse_locators)) {
					$section_obj->inverse_locators 	= (array)$this->dato->inverse_locators;
					}

					# Relations container
					if (isset($this->dato->relations)) {
					$section_obj->relations 	= (array)$this->dato->relations;
					}					
					
						
					# ar_section_creator
					switch (true) {
						# ACTIVITY CASE
						case ($section_obj->section_tipo===DEDALO_ACTIVITY_SECTION_TIPO):
							# Nothing to do
							break;

						# PORTAL CASE
						case ($options->is_portal===true):
							$ar_section_creator	= section::build_ar_section_creator($options->top_tipo, $original_tipo, $options->portal_tipo); # $top_tipo=null, $portal_section_tipo=null, $portal_tipo=null
							# Section creator
							$section_obj->section_creator_top_tipo 				= (string)$ar_section_creator['top_tipo'];
							$section_obj->section_creator_portal_section_tipo 	= (string)$ar_section_creator['portal_section_tipo'];
							$section_obj->section_creator_portal_tipo 			= (string)$ar_section_creator['portal_tipo'];
							break;

						# DEFAULT CASE (Normal sections)
						default:
							$ar_section_creator	= section::build_ar_section_creator($options->top_tipo);
							# Section creator
							$section_obj->section_creator_top_tipo 				= (string)$ar_section_creator['top_tipo'];
							$section_obj->section_creator_portal_section_tipo 	= (string)$ar_section_creator['portal_section_tipo'];
							$section_obj->section_creator_portal_tipo 			= (string)$ar_section_creator['portal_tipo'];
							break;
					}
					
					
					# Components (empty when insert)
					$section_obj->components = new stdClass();

					# MAIN_COMPONENTS_OBJ : Al crear una sección, opcionalmente se le pueden pasar los datos de los componentes directamente
					if (!empty($options->main_components_obj)) {
						$section_obj->components = $options->main_components_obj;	# Añade el dato de todos los componentes de una sola vez (activity)
					}
		
			$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table, $section_obj->section_id, $section_obj->section_tipo);			
			$JSON_RecordObj_matrix->set_datos($section_obj);
			$JSON_RecordObj_matrix->set_section_id($section_id_counter);
			$JSON_RecordObj_matrix->set_section_tipo($original_tipo);

			#
			# TIME MACHINE DATA
			# We save only current new section in time machine once (section info not change, only components changes)			
			$time_machine_data = clone $section_obj;
			unset($time_machine_data->components); 	# Remove unnecessary empty 'components' object
			$save_options = new stdClass();
				$save_options->time_machine_data = $time_machine_data;
				$save_options->time_machine_lang = DEDALO_DATA_NOLAN;	# Always nolan for section	
				$save_options->time_machine_tipo = $section_obj->section_tipo;
				$save_options->new_record		 = true;	
			
			//dump($section_obj, ' section_obj before save ++ '.to_string( ));
			$saved_id_matrix 				= $JSON_RecordObj_matrix->Save( $save_options );	
			#$this->section_id 	= (int)$JSON_RecordObj_matrix->get_ID();			#$id2 = $JSON_RecordObj_matrix->get_id();
				#dump($saved, "$saved, $this->id");die();
			

			if ($section_obj->section_tipo!==DEDALO_ACTIVITY_SECTION_TIPO && $saved_id_matrix<1) {
				trigger_error("Error on triying save->insert record. Nothing is saved!");
				if(SHOW_DEBUG===true) {
					throw new Exception("Error Processing Request. Returned section_id on save section is mandatory. Received section_id: $this->section_id ", 1);
				}
			}			
			
			##
			# COUNTER : If all is ok, update section counter (counter +1) in structure 'propiedades:section_id_counter'
			if ($section_obj->section_tipo!=DEDALO_ACTIVITY_SECTION_TIPO && $saved_id_matrix > 0) {
				counter::update_counter($original_tipo, $matrix_table_counter, $current_id_counter);
					#dump($original_tipo,"update counter in $matrix_table_counter for tipo: $original_tipo - section_id:".$ar_section_dato['section_id']);
			}
			#dump($this->section_id,"section_id_counter $matrix_table - $matrix_table_counter"); ;die();

			##
			# TIME MACHINE : Get returned time_machine section_id on save (used for activity)
			#$time_machine_last_id = $JSON_RecordObj_matrix->get_time_machine_last_id();
				#dump($time_machine_last_id,'$time_machine_last_id');

			##
			# SECTION VIRTUAL : Como ya tenemos section_id de sección, para cada propiedad, creamos un componente y lo salvamos con el valor definido en propiedades ({"filtered_by":{"dd1116":"233"}})
			# Esto asegura que no perdamos el registro (que se quede sólo en media:recursos, por ejemplo)
			# Normalmente se define en propiedades la tipología [dd1116] (audiovisual,imagen,partitura,etc.) y opcionalmente la colección/archivo [dd1131]
			if($this->section_virtual===true) {
				$propiedades = $this->get_propiedades();
					#dump($propiedades->filtered_by,'$propiedades');
				if (!empty($propiedades->filtered_by)) {
					foreach ($propiedades->filtered_by as $current_filtered_tipo => $value) {
						
						$filtered_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_filtered_tipo,true);
						$current_component_obj 	= component_common::get_instance($filtered_modelo_name, $current_filtered_tipo, $section_obj->section_id, 'edit', DEDALO_DATA_NOLAN, $original_tipo); #$section_id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL
						$current_component_obj->set_dato($value);
						$current_component_obj->Save();
							#dump($value,"value of current_filtered_tipo:$current_filtered_tipo assigned (section tipo:$original_tipo, section_id: $section_obj->section_id)");
							#dump($current_component_obj," current_component_obj");
							#$temp_section = section::get_instance($section_obj->section_id,$original_tipo);
							#dump($temp_section," temp_section");
						
					}#end foreach ($propiedades->filtered_by as $current_filtered_tipo => $value)
				}
			}


			##
			# AUTO AUTHORIZE THIS PROYECT FOR CURRENT USER 
			# Si esta sección recien creada es un proyecto, se agrega este proyecto como autorizado al usuario que lo creó
			# Usuario logeado actualmente
			$user_id = navigator::get_user_id();
			if ($this->tipo===DEDALO_SECTION_PROJECTS_TIPO) { // && !component_security_administrator::is_global_admin($user_id) 
				
				$component_filter_master	= component_common::get_instance('component_filter_master',
																			 DEDALO_FILTER_MASTER_TIPO,
																			 $user_id,
																			 'edit',
																			 DEDALO_DATA_NOLAN,
																			 DEDALO_SECTION_USERS_TIPO);
				$dato_filter_master 		= $component_filter_master->get_dato();				
				$element 					= array($this->section_id => "2");
				$new_dato_filter_master		= (array)$dato_filter_master + $element;	dump($new_dato_filter_master, ' new_dato_filter_master ++ '.to_string());			
				$component_filter_master->set_dato($new_dato_filter_master);
				$component_filter_master->Save();
					#dump($component_filter_master,'component_filter_master');				
			}


			##
			# STATE DEFAULTS
			# Set default values on component_state when is present component_state
			# Important: Set 'resolve_virtual' to true to enable virtual section locate component
			$ar_component_state = section::get_ar_children_tipo_by_modelo_name_in_section($section_obj->section_tipo, 'component_state', $from_cache=true, $resolve_virtual=true);
			if (isset($ar_component_state[0])) {
				$component_state = component_common::get_instance('component_state',
																  $ar_component_state[0],
																  $section_obj->section_id,
																  'edit',
																  DEDALO_DATA_NOLAN,
																  $section_obj->section_tipo);
				$component_state->set_defaults();
				$component_state->Save();
			}//end if (isset($ar_component_state[0])) {


			##
			# DEFAULT PROJECT FOR CREATE STANDAR SECTIONS
			# Cuando se crea un registro de sección, se auto asigna el proyecto por defecto (definido en config DEDALO_DEFAULT_PROJECT)
			# cuando la sección tiene definido un 'component_filter'
			/*
			$RecordObj_dd 				= new RecordObj_dd($tipo);
			$ar_tipo_component_filter 	= $RecordObj_dd->get_ar_terminoID_by_modelo_name_and_relation($tipo, 'component_filter', $relation_type='children_recursive');
			if (count($ar_tipo_component_filter)==1) {
				$component_filter 	= component_common::get_instance('component_filter', $ar_tipo_component_filter[0],$this->section_id,'edit',DEDALO_DATA_NOLAN);			
				$component_filter->set_dato(array(DEDALO_DEFAULT_PROJECT=>'2'));
				$component_filter->Save();
				debug_log(__METHOD__." -- Created and assigned filter value ".DEDALO_DEFAULT_PROJECT." for this section ".$this->section_id);						
			}else if (count($ar_tipo_component_filter)>1) {
				if(SHOW_DEBUG===true) dump($ar_tipo_component_filter,'$ar_tipo_component_filter');
				throw new Exception("Error Processing Request. Too much component_filter elements found", 1);			
			}
			

			##
			# DEFAULT PROJECT WHEN CREATE NEW USER
			if($tipo==DEDALO_SECTION_USERS_TIPO) {
				$RecordObj_dd 					= new RecordObj_dd($tipo);
				$ar_tipo_component_filter_master= $RecordObj_dd->get_ar_terminoID_by_modelo_name_and_relation($tipo, 'component_filter_master', $relation_type='children_recursive');
				if (count($ar_tipo_component_filter_master)==1) {
					$component_filter_master 	= component_common::get_instance('component_filter_master', $ar_tipo_component_filter_master[0],$this->id,'edit',DEDALO_DATA_NOLAN);
					$component_filter_master->set_dato(array(DEDALO_DEFAULT_PROJECT=>'2'));
					$component_filter_master->Save();
					debug_log(__METHOD__." -- Created and assigned filter_master value ".DEDALO_DEFAULT_PROJECT." for this section ".$this->id);						
				}else if (count($ar_tipo_component_filter_master)>1) {
					if(SHOW_DEBUG===true) dump($ar_tipo_component_filter_master,'$ar_tipo_component_filter_master');
					throw new Exception("Error Processing Request. Too much component_filter_master elements found", 1);			
				}
			}
			*/

			##
			# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			if($this->tipo!==DEDALO_ACTIVITY_SECTION_TIPO) {
				
				# TOP_ID : Si se crea desde un portal, el top_id está fijado en sesion "TOP_ID". Si no, es el propio section_id de la sección creada
				if($options->is_portal===true) {
					$top_id 	= TOP_ID;
				}else{
					$top_id 	= $this->section_id;
				}

				logger::$obj['activity']->log_message(
					'NEW',
					logger::INFO,
					$this->tipo,
					NULL,
					array(	"msg"			=> "Created section record",
							"section_id"	=> $this->section_id,
							"tipo"			=> $this->tipo,
							"is_portal"		=> intval($options->is_portal),
							"top_id"		=> $top_id,
							"top_tipo"		=> TOP_TIPO,
							"table"			=> $matrix_table,
							"tm_id"			=> 'desactivo',#$time_machine_last_id,
							"counter"		=> counter::get_counter_value($this->tipo, $matrix_table_counter),
							"section_tipo"	=> $this->tipo
							)
				);

				# Reset session search_options
				/* DESACTIVO
					$search_options_session_key = $this->tipo.'_'.$this->modo.'_'.TOP_TIPO;
					if ( isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
						unset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);
						debug_log(__METHOD__." Reset session search_options from Save->New record section key: $search_options_session_key");
					}
					*/				
			}#end if($this->tipo!=DEDALO_ACTIVITY_SECTION_TIPO)

		}#end if ($this->id >= 1)
	


		# DEDALO_CACHE_MANAGER : reset caches
		if( DEDALO_CACHE_MANAGER===true ) {
			debug_log(__METHOD__." Deleted cache keys contains '$this->tipo' from section:Save method");
			cache::del_contains( $this->tipo );
		}

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}		

		return $this->section_id;
	}#end Save



	/**
	* DELETE (SECTION)
	* @param section id
	* @param delete_mode (data / record)
	* Delete section with options
	*/
	public function Delete($delete_mode) {

		if($this->section_id<1) return false;

		# Force type int
		$section_id = intval($this->section_id);

		$section_tipo = $this->tipo;

		#if the section virtual have the section_tipo "real" in properties change the tipo of the section to the real
		if(isset($this->propiedades->section_tipo) && $this->propiedades->section_tipo === "real"){
			$section_tipo = $this->get_section_real_tipo();
		}

		# matrix_table
		$matrix_table 	= common::get_matrix_table_from_tipo($section_tipo);		


		switch($delete_mode) {

			case 'delete_data' :

					# CHILDRENS : Calculate component childrens of current section
					$children_components = (array)$this->get_ar_children_objects_by_modelo_name_in_section('component_', $resolve_virtual=true);
						#dump($children_components,"children_components");die( " !! BORRADO DE DATOS EN PROCESO  ");

					# No borraremos los datos de algunos componentes ('component_av', 'component_image' , 'component_pdf',...)
					$ar_components_modelo_no_delete_dato = array( 'component_av', 'component_image' , 'component_pdf', 'component_filter');

					foreach ($children_components as $key => $current_component) {
						
						$current_tipo 		 = $current_component->get_tipo();
						$current_modelo_name = get_class($current_component);

						if (!in_array($current_modelo_name, $ar_components_modelo_no_delete_dato)) {
							$dato_empty = null;
							$current_component->set_dato($dato_empty);
							$current_component->Save();
						}
					}

					$logger_msg = "Deleted section and children data";
					break;


			case 'delete_record' :

					if(SHOW_DEBUG===true) {
						if ((int)$this->section_id===0) {
							dump((int)$this->section_id,"this section_id");
							throw new Exception("Error Processing Request. Record is NOT deleted (1)", 1);					
						}
					}
					
					#	
					# TIME MACHINE : prepare matrix_time_machine data for recover this section later
					# Get time machine id based on section tipo and section_id 
					$ar_id_time_machine = (array)RecordObj_time_machine::get_ar_time_machine_of_this($section_tipo, $this->section_id, 'lg-nolan', $section_tipo); // $tipo, $parent, $lang=NULL, $section_tipo
					if (empty($ar_id_time_machine[0])) {
						#return "Error on delete record. Time machine version of this record not exists. Please contact with your admin to delete this record";
						$RecordObj_time_machine_new = new RecordObj_time_machine(null);
						$RecordObj_time_machine_new->set_section_id((int)$this->section_id);
						$RecordObj_time_machine_new->set_section_tipo((string)$section_tipo);
						$RecordObj_time_machine_new->set_tipo((string)$section_tipo);
						$RecordObj_time_machine_new->set_lang((string)$this->get_lang());
						$RecordObj_time_machine_new->set_timestamp((string)component_date::get_timestamp_now_for_db());	# Format 2012-11-05 19:50:44
						$RecordObj_time_machine_new->set_userID((int)navigator::get_user_id());
						$RecordObj_time_machine_new->set_dato((object)$this->dato);
						$id_time_machine = (int)$RecordObj_time_machine_new->Save();
					}else{
						$id_time_machine = (int)$ar_id_time_machine[0];
					}
					if ($id_time_machine<1) {
						throw new Exception("Error Processing Request. id_time_machine is empty", 1);						
					}
					# Update time machine record
					$RecordObj_time_machine = new RecordObj_time_machine($id_time_machine);
					$RecordObj_time_machine->set_dato($this->get_dato());	# Update dato with the last data stored in this section before is deleted
					$RecordObj_time_machine->set_state('deleted');	# Mark state as 'deleted' for fast recovery
					$tm_save = $RecordObj_time_machine->Save();		# Expected int id_time_machine returned if all is ok
					# Verify time machine is updated properly before delete this section
					if ($tm_save!==$id_time_machine) {
						# Something failed in time machine save
						if(SHOW_DEBUG===true) {
							dump($tm_save, " tm_save is distinct: tm_save:$tm_save - id_time_machine:$id_time_machine");
						}
						trigger_error("ERROR: Failed save update data for time machine record $id_time_machine [Section:Delete]. Record is NOT deleted (2)");
						return false;
					}
					$dato_time_machine 	= $RecordObj_time_machine->get_dato();
					$dato_section 		= $this->get_dato();
					if ($dato_time_machine != $dato_section) {
						if(SHOW_DEBUG===true) {
							dump($dato_time_machine,"SHOW_DEBUG COMPARE ERROR dato_time_machine");
							dump($dato_section,"SHOW_DEBUG COMPARE ERROR dato_section");
						}
						#trigger_error("ERROR: Failed compare data of time machine record $id_time_machine [Section:Delete]. Record is NOT deleted (3)");
						throw new Exception("ERROR: Failed compare data of time machine record $id_time_machine [Section:Delete]. Record is NOT deleted (3)", 1);
						
						return false;
					}
					#dump($RecordObj_time_machine, 'RecordObj_time_machine', array()); die();

					
					#
					# SECTION DELETE
					# Delete matrix record
					$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table, $this->section_id, $section_tipo);					
					$JSON_RecordObj_matrix->MarkForDeletion();
						#dump($JSON_RecordObj_matrix," JSON_RecordObj_matrix"); #die();
						#return true;
					
					
					#
					# INVERSE REFERENCES
					# Remove all inverse references to this section
					$this->remove_all_inverse_references();


					#
					# RELATION REFERENCES
					# Remove all relation references (children, model, etc.)
					$this->remove_all_relation_references();


					#
					# MEDIA
					# Remove media files associated to this section
					$this->remove_section_media_files();				
					

					$logger_msg = "DEBUG INFO ".__METHOD__." Deleted section and children records. delete_mode $delete_mode";				

					# ¿¿¿ TIME MACHINE DELETE ?????

					break;
		}

		if (SHOW_DEBUG) {			
			debug_log(__METHOD__." Deleted section $this->section_id and their 'childrens'. delete_mode $delete_mode");
		}
		


		if( TOP_TIPO != $this->tipo ){
			$is_portal = true;
		}else{
			$is_portal 	= false;
			$top_id 	= $this->section_id;
			#$top_tipo 	= $this->tipo;
		}
		# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
		logger::$obj['activity']->log_message(
			'DELETE',
			logger::INFO,
			$this->get_tipo(),
			null,
			#array("msg"=>$logger_msg)
			array(	"msg"			=> $logger_msg,
					"section_id"	=> $this->section_id,
					"tipo"			=> $this->tipo,
					"is_portal"		=> intval($is_portal),
					"top_id"		=> TOP_ID,
					"top_tipo"		=> TOP_TIPO,
					"table"			=> $matrix_table,
					"delete_mode"	=> $delete_mode,
					"section_tipo"	=> $this->tipo
					)
		);

		# DEDALO_CACHE_MANAGER : get_ar_filter_cache
		if( DEDALO_CACHE_MANAGER===true ) {
			cache::del_contains( $this->tipo );
		}

		# Reset session search_options
		/* DESACTIVO
			if (isset($_SESSION['dedalo4']['config']['search_options'][$this->tipo])) {
				unset($_SESSION['dedalo4']['config']['search_options'][$this->tipo]);
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." Reset session search_options from Delete section");
				}			
			}
			*/		

		return true;
	}



	/**
	* GET_SECTION_CACHE_KEY_NAME
	*/
	public function get_section_cache_key_name() {
		$pageNum='';

		$var_requested = common::get_request_var('m');
		if(!empty($var_requested)) $pageNum = $var_requested;
		//if(isset($_REQUEST['pageNum'])) $pageNum = $_REQUEST['pageNum'];
		return DEDALO_DATABASE_CONN.'_section_get_html_'.$this->get_identificador_unico().'_'.$pageNum;
	}



	/**
	* GET_HTML
	*/
	public function get_html($options=null) {

		if(SHOW_DEBUG===true){
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_in_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

			
			# DEDALO_CACHE_MANAGER : Read from cache if var exists ##################
			if(DEDALO_CACHE_MANAGER===true && CACHE_SECTIONS===true) {
				$cache_key_name = $this->get_section_cache_key_name();
				if (cache::exists($cache_key_name)) {
					#dump($cache_key_name,"COMPONENT SHOW FROM CACHE");
					#debug_log(__METHOD__. " readed data from section cache key: $cache_key_name");
					return cache::get($cache_key_name);
				}
			}
			# /DEDALO_CACHE_MANAGER #################################################
		

		# Load controller
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. __CLASS__ .'/'. __CLASS__ .'.php' );
		$html =  ob_get_clean();
		

			
			# DEDALO_CACHE_MANAGER : Set cache var #################################
			if(DEDALO_CACHE_MANAGER===true && CACHE_SECTIONS===true) {
				#if(strpos($cache_key_name, 'list')!=false && strpos($cache_key_name, 'portal')===false) 
				cache::set($cache_key_name, $html);				
			}
			# /DEDALO_CACHE_MANAGER #################################################


		if(SHOW_DEBUG===true) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ' );
			global$TIMER;$TIMER[__METHOD__.'_out_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}	

		return $html;
	}//end get_html
	

	/**
	*  GET_SECTION_REAL_TIPO
	* @return string $section_real_tipo
	*/
	public function get_section_real_tipo() {

		if(isset($this->section_real_tipo)) return $this->section_real_tipo;

		$section_real_tipo = section::get_section_real_tipo_static( $this->tipo );
		if ($section_real_tipo!==$this->tipo) {
			# Fix section_real_tipo
			$this->section_real_tipo = $section_real_tipo;
			$this->section_virtual 	 = true;
		}else{
			# Fix section_real_tipo
			$this->section_real_tipo = $section_real_tipo;
			$this->section_virtual 	 = false;
		}
		#dump($this->section_real_tipo, '$this->section_real_tipo ++ '.to_string($this->tipo ));

		return $section_real_tipo;
	}//end get_section_real_tipo



	/**
	* GET_SECTION_REAL_TIPO_STATIC
	* @param string $section_tipo
	* @return string $section_real_tipo
	*	If not exists related section, returns the same received section_tipo 
	*/
	public static function get_section_real_tipo_static( $section_tipo ) {	

		$ar_related = common::get_ar_related_by_model($modelo_name='section', $section_tipo);
		if (isset($ar_related[0])) {
			$section_real_tipo = $ar_related[0];
		}else{
			$section_real_tipo = $section_tipo;
		}
		#dump($ar_related, ' section_real_tipo ++ from '.to_string($section_tipo));

		return $section_real_tipo;
	}//end get_section_real_tipo_static



	/**
	* GET CHILDRENS OBJS BY MODELO NAME
	*
	* @param $modelo_name_required
	*	Name of desired filtered model. You can use partial name like 'component_' (string position search is made it)
	* @see class.section.php -> get_ar_authorized_areas_for_user
	* @return $ar_section_obj
	*	Array of objects (usually components) filtered by modelo_name_required with parent = current section id matrix
	*/
	public function get_ar_children_objects_by_modelo_name_in_section($modelo_name_required, $resolve_virtual=true) {
		$ar_section_obj = array();

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$modelo_name_required.'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		$parent  = intval($this->get_section_id());
		$tipo	 = $this->get_tipo();


			# RESOLVE_VIRTUAL : Resolve virtual section to real
			if($resolve_virtual) {

				# ORIGINAL TIPO : always keeps the original type (current)
				$original_tipo = $tipo;
			
				# SECTION VIRTUAL
				$section_real_tipo = $this->get_section_real_tipo();
				if($section_real_tipo!=$original_tipo) {
				
					# OVERWRITE CURRENT SECTION TIPO WITH REAL SECTION TIPO
					$tipo = $section_real_tipo;
				}
				#dump($tipo,'section tipo');
				/*
				# EXCLUDE ELEMENTS
					$tipo_exclude_elements 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($original_tipo, $modelo_name='exclude_elements', $relation_type='children')[0];

					$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($tipo_exclude_elements, $cache=false, $simple=true);					

						$real_section = section::get_instance(null,$section_real_tipo);					
						
						/*
						# LAYOUT MAP : PENDIENTE UNIFICAR MAQUETACIÓN CON LAYOUT MAP A PARTIR DEL MODO EDIT <------
						# Consulta el listado de componentes a mostrar en el listado / grupo actual					
						$layout_map = component_layout::get_layout_map_from_section( $real_section );
						if(SHOW_DEBUG===true) {
							dump($layout_map,'layout_map');
						}						

						$html = component_layout::walk_layout_map($real_section, $layout_map, $ar, $ar_exclude_elements);


					#$ar_exclude_elements 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo_exclude_elements, $modelo_name=array('section_group','component_'), $relation_type='termino_relacionado');
						#dump($tipo_exclude_elements,'tipo_exclude_elements');
						dump($ar_terminos_relacionados,'ar_terminos_relacionados');
						*/
			}
			#dump($tipo,"");die();


		# STATIC CACHE
		$uid = $parent .'_'. $tipo .'_'. $modelo_name_required;
		static $ar_children_objects_by_modelo_name_in_section;
		if(isset($ar_children_objects_by_modelo_name_in_section[$uid])) {
			
			if(SHOW_DEBUG===true) {				
				global$TIMER;$TIMER[__METHOD__.'_OUT_STATIC_'.$modelo_name_required.'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
				#debug_log(__METHOD__." Returned '$modelo_name_required' for tipo:$this->tipo FROM STATIC CACHE");
			}
			return $ar_children_objects_by_modelo_name_in_section[$uid];
		}		


		# GET SECTION ELEMENT CHILDRENS - OBTENEMOS LOS ELEMENTOS HIJOS DE ESTA SECCIÓN	
		switch (true) {
			# For buttons only need one level
			case (strpos($modelo_name_required, 'button_')!==false):				
				$ar_recursive_childrens = (array)RecordObj_dd::get_ar_childrens($tipo);								
				break;			
			default:
				$ar_recursive_childrens = (array)self::get_ar_recursive_childrens($tipo);
		}
		if(SHOW_DEBUG===true) {
			#dump($ar_recursive_childrens, 'ar_recursive_childrens tipo:'.$tipo." - modelo_name_required:$modelo_name_required", array()); dump($this," ");	
			#debug_log( __METHOD__." get_ar_children_objects_by_modelo_name_in_section: ".json_encode($modelo_name_required) );			
		}
		

		if( empty($ar_recursive_childrens) ) {
			#throw new Exception(__METHOD__." ar_recursive_childrens is empty! This section don't have: '$modelo_name_required' ");
			#debug_log(__METHOD__." ar_recursive_childrens is empty! This section id=$parent don't have: '$modelo_name_required' (tipo:$tipo) 384 ". __METHOD__ );
			return NULL	;
		}

		# Recorremos los elementos hijos de la sección actual en el tesauro
		$ar_section_obj = array();
		foreach($ar_recursive_childrens as $terminoID) {

			# Clear obj on every iteration
			$current_obj 		= null;
			$modelo_name		= RecordObj_dd::get_modelo_name_by_tipo($terminoID, true);


			# Filtramos para cargar sólo los del modelo deseado
			if( strpos($modelo_name, $modelo_name_required)===false ) continue; # Skip


			# Construimos el objeto (en función del tipo deseado se construye de forma distinta: component, button, etc..)
			switch(true) {

				# Build component obj
				case (strpos($modelo_name, 'component_')!==false) :

							$current_obj = component_common::get_instance($modelo_name, $terminoID, $parent,'edit', DEDALO_DATA_LANG, $this->tipo ); #$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG
							break;

				# Build button obj
				case (strpos($modelo_name, 'button_')!==false) :

							if ($modelo_name==='button_delete') break; # Skip Delete buttons

							$current_obj = new $modelo_name($terminoID, $target=$parent, $this->tipo);
							$current_obj->set_context_tipo($tipo);
							break;
				
				default :
							trigger_error("Sorry, element $modelo_name is not defined for build object");
			}
			

			# Add well formed object to array
			if(is_object($current_obj))
				$ar_section_obj[] = $current_obj;

		}
		#dump($ar_section_obj,'ar_section_obj',"array of elements:'$modelo_name' childrens of this section tipo={$tipo} id={$this->get_id()}");


		# STORE CACHE DATA
		$ar_children_objects_by_modelo_name_in_section[$uid] = $ar_section_obj ;

		 
		if(SHOW_DEBUG===true) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__,' - modelo_name_required:'.$modelo_name_required ." - ar_section_obj count:". count($ar_section_obj) );
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$modelo_name_required.'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
			#debug_log( __METHOD__." get_ar_children_objects_by_modelo_name_in_section: ".json_encode($modelo_name_required).' '. exec_time($start_time,'ms') );
		}

		return $ar_section_obj;		
	}//end get_ar_children_objects_by_modelo_name_in_section



	/**
	* GET_SECTION_AR_CHILDREN_TIPO
	* @param string $section_tipo
	* @param array $ar_modelo_name_required
	* @param bool $from_cache
	*	default true
	* @param bool $resolve_virtual
	*	Force resolve section if is virtal section. default false
	*	Name of desired filtered model array. You can use partial name like 'component_' (string position search is made it)
	*/
	public static function get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false) { # Nota: mantener default resolve_virtual=false !

		$cache_uid = $section_tipo.'_'.serialize($ar_modelo_name_required).'_'.(int)$resolve_virtual.'_'.(int)$recursive;
		if ($from_cache && isset($_SESSION['dedalo4']['config']['ar_children_tipo_by_modelo_name_in_section'][$cache_uid])) {
			return $_SESSION['dedalo4']['config']['ar_children_tipo_by_modelo_name_in_section'][$cache_uid];
		}

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$section_tipo.'_'.$cache_uid.'_'.microtime(1)]=microtime(1);
		}

		$ar_terminos_relacionados_to_exclude=array();

		#
		# RESOLVE_VIRTUAL : Resolve virtual section to real
		if($resolve_virtual) {

			# ORIGINAL TIPO : always keeps the original type (current)
			$original_tipo = $section_tipo;

			# SECTION VIRTUAL
			$section_real_tipo = section::get_section_real_tipo_static($section_tipo);

			if($section_real_tipo!==$original_tipo) {

				# OVERWRITE CURRENT SECTION TIPO WITH REAL SECTION TIPO
				$section_tipo = $section_real_tipo;

				# EXCLUDE ELEMENTS
				$ar_tipo_exclude_elements 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($original_tipo, $modelo_name='exclude_elements', $relation_type='children', $search_exact);
					#dump($tipo_exclude_elements,"tipo_exclude_elements ");
				if (!isset($ar_tipo_exclude_elements[0])) {
					throw new Exception("Error Processing Request. exclude_elements of section $original_tipo not found. Exclude elements is mandatory (1)", 1);				
				}
				$tipo_exclude_elements = $ar_tipo_exclude_elements[0];
				
				$ar_terminos_relacionados_to_exclude = RecordObj_dd::get_ar_terminos_relacionados($tipo_exclude_elements, $cache=false, $simple=true);

				foreach ($ar_terminos_relacionados_to_exclude as $key => $component_tipo) {
					
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
					if($modelo_name === 'section_group'){
						$ar_recursive_childrens = (array)self::get_ar_recursive_childrens($component_tipo);
						//dump($ar_recursive_childrens,'ar_recursive_childrens');
						$ar_terminos_relacionados_to_exclude = array_merge($ar_terminos_relacionados_to_exclude,$ar_recursive_childrens);
					}					

				}#end foreach ($ar_terminos_relacionados_to_exclude as $key => $component_tipo) {
				#dump($ar_terminos_relacionados_to_exclude,'ar_terminos_relacionados_to_exclude');
			
			}#end if($section_real_tipo!=$original_tipo) {

		}#end if($resolve_virtual) {


		# AR_MODELO_NAME_REQUIRED cast 'ar_modelo_name_required' to array
		$ar_modelo_name_required 	= (array)$ar_modelo_name_required;
		$tipo 						= $section_tipo;
		$section_ar_children_tipo 	= array();


		# OBTENEMOS LOS ELEMENTOS HIJOS DE ESTA SECCIÓN
		if (count($ar_modelo_name_required)>1) {
			
			if ($recursive) { // Default is recursive
				$ar_recursive_childrens = (array)self::get_ar_recursive_childrens( $tipo );
			}else{
				$RecordObj_dd			= new RecordObj_dd($tipo);
				$ar_recursive_childrens = (array)$RecordObj_dd->get_ar_childrens_of_this();	
			}
		
		}else{

			switch (true) {
				// Components are searched recursively
				case (strpos($ar_modelo_name_required[0], 'component')!==false && $recursive!=false):
					$ar_recursive_childrens = (array)self::get_ar_recursive_childrens($tipo);
					break;
				// Others (section_xx, buttons, etc.) are in the first level
				default:
					$RecordObj_dd			= new RecordObj_dd($tipo);
					$ar_recursive_childrens = (array)$RecordObj_dd->get_ar_childrens_of_this();					
			}
		}
				
		/*
		if($ar_modelo_name_required[0]=='section_list') {
			# En los casos en que buscamos modelos 'section_list' no buscaremos recusivamente para posibilitar el anidamiento de secciones
			# como el caso de 'Elementos y procesos' en PCI
			$RecordObj_dd			= new RecordObj_dd($tipo);
			$ar_recursive_childrens = (array)$RecordObj_dd->get_ar_childrens_of_this();			
		}else{
			#$RecordObj_dd			= new RecordObj_dd($tipo);
			#$ar_recursive_childrens = (array)$RecordObj_dd->get_ar_recursive_childrens_of_this($tipo);
			$ar_recursive_childrens = (array)self::get_ar_recursive_childrens($tipo);
				#dump($ar_recursive_childrens, 'ar_recursive_childrens', array('tipo'=>$tipo));
		}
		*/

		if( empty($ar_recursive_childrens) ) {
			#throw new Exception(__METHOD__." ar_recursive_childrens is empty! This section don't have: '$modelo_name_required' ");
			#debug_log(__METHOD__." ar_recursive_childrens is empty! This section id=$parent don't have: '$modelo_name_required' ". __METHOD__ );
			return $section_ar_children_tipo; # return empty array
		}
		//dump($ar_recursive_childrens,'ar_recursive_childrens '.$section_tipo.print_r($ar_modelo_name_required,true));

		# UNSET the exclude elements of the virtual section to the origianl section
		if($resolve_virtual) {
			$ar_recursive_childrens = array_diff($ar_recursive_childrens,$ar_terminos_relacionados_to_exclude);
		}
		#dump($ar_recursive_childrens,'final '.$section_tipo.print_r($ar_modelo_name_required,true));
		# Recorremos los elementos hijos de la sección actual en el tesauro
		foreach($ar_recursive_childrens as $current_terminoID) {

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_terminoID, true);
			foreach((array)$ar_modelo_name_required as $modelo_name_required) {
				
				if (strpos($modelo_name, $modelo_name_required)!==false && !in_array($current_terminoID, $section_ar_children_tipo) ) {

					if($search_exact===true && $modelo_name!=$modelo_name_required) {
						# No is accepted model
					}else{
						$section_ar_children_tipo[] = $current_terminoID;	
					}						
					#dump($current_terminoID, ' $current_terminoID ++ required:'.$modelo_name_required.' - '.to_string($modelo_name));
				}

				# COMPONENT_FILTER : Si buscamos 'component_filter', sólo devolveremos el primero, dado que pueden haber secciones anidadas
				if($ar_modelo_name_required[0]==='component_filter' && count($ar_recursive_childrens)>1) {
					if(SHOW_DEBUG===true) {
						#debug_log(__METHOD__." Breaked loop for search 'component_filter' in section $section_tipo ".count($ar_recursive_childrens). " " .to_string($ar_modelo_name_required));
						#throw new Exception("Error Processing Request", 1);						
					}
					continue;
				}
			}
		}
		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$section_tipo.'_'.$cache_uid.'_'.microtime(1)]=microtime(1);
		}
		#dump($section_ar_children_tipo,'section_ar_children_tipo',"array of tipos:'$modelo_name' childrens of this section tipo={$tipo} ");

		$_SESSION['dedalo4']['config']['ar_children_tipo_by_modelo_name_in_section'][$cache_uid] = $section_ar_children_tipo;
		
		return $section_ar_children_tipo;
	}//end get_ar_children_tipo_by_modelo_name_in_section



	/**
	* GET_AR_RECURSIVE_CHILDRENS : private alias of RecordObj_dd::get_ar_recursive_childrens
	* Note th use of $ar_exclude_models to exclude not desired section elements, like auxiliar sections in ich
	*/
	private static function get_ar_recursive_childrens( $tipo ) {		
		#$RecordObj_dd			= new RecordObj_dd($tipo);
		#$ar_recursive_childrens = (array)$RecordObj_dd->get_ar_recursive_childrens_of_this($tipo);
		
		# AR_EXCLUDE_MODELS
		# Current elements and childrens are not considerated part of section and must be excluded in children results
		$ar_exclude_models = array('box elements','area');		

		$ar_recursive_childrens = RecordObj_dd::get_ar_recursive_childrens($tipo, false, $ar_exclude_models);

		return (array)$ar_recursive_childrens;
	}//end get_ar_recursive_childrens



	/**
	* GET_PORTAL_TIPO_FROM_COMPONENT
	* Return portal tipo from section and portal inside component
	* @param string $section_tipo
	* @param string $component_tipo_inside_portal
	* @return string $portal_tipo / bool false
	*/
	public static function get_portal_tipo_from_component($section_tipo, $component_tipo_inside_portal) {
		#$ar_portals = (array)section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_portal');
		$ar_portals = (array)section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array('component_portal'), $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
			#dump($ar_portals, ' $ar_portals ++ '.to_string());
		if (empty($ar_portals)) return false;
		foreach ($ar_portals as $current_portal_tipo) {
			# portal related terms
			$ar_related = RecordObj_dd::get_ar_terminos_relacionados($current_portal_tipo, true, true);
				#dump($ar_related, ' $ar_related ++ '.to_string());
			if (in_array($component_tipo_inside_portal, $ar_related)) {
				return $current_portal_tipo;
			}
		}
		return false;
	}//end get_portal_tipo_from_component



	/**
	* get_portal_tipo_from_component_in_search_list
	* Return portal tipo from section and portal inside component
	* @param string $section_tipo
	* @param string $component_tipo_inside_portal
	* @return string $portal_tipo / bool false
	*/
	public static function get_portal_tipo_from_component_in_search_list($section_tipo, $component_tipo_inside_portal) {
		#$ar_portals = (array)section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_portal');
		$ar_portals = (array)section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array('component_portal'), $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
			#dump($ar_portals, ' $ar_portals ++ '.to_string());
		if (empty($ar_portals)) return false;
		foreach ($ar_portals as $current_portal_tipo) {

			# $portal search list = 
			$portal_search_list = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_portal_tipo, 'search_list', 'children', true);

			if (empty($portal_search_list[0])) {
				continue;
			}

			# portal related terms
			$ar_related = RecordObj_dd::get_ar_terminos_relacionados($portal_search_list[0], true, true);
				#dump($ar_related, ' $ar_related ++ '.to_string());
			if (in_array($component_tipo_inside_portal, $ar_related)) {
				return $current_portal_tipo;
			}
		}
		return false;
	}//end get_portal_tipo_from_component_in_search_list



	/**
	* GET_AR_BUTTONS
	* Calcula los bonones de esta sección y los deja disponibles como : $this->ar_buttons
	* @see section_records.php modo:list 
	*/
	public function get_ar_buttons() {

		if (isset($this->ar_buttons)) return $this->ar_buttons;

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		
		# SECTION_REAL_TIPO
		$section_real_tipo  = $this->get_section_real_tipo();	# Fija $this->section_real_tipo que es necesario luego

		#
		# VIRTUAL SECTION
		#	
		# SECTION VIRTUAL CASE
		#dump($this->section_virtual,"virtual");
		if ($this->section_virtual===true ) {
			# Exclude elements of layout edit.
			# Localizamos el elemento de tipo 'exclude_elements' que será hijo de la sección actual
			# $exclude_elements_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo, 'exclude_elements')[0];
			$ar_exclude_elements_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo, 'exclude_elements');
				#dump($ar_exclude_elements_tipo, ' ar_exclude_elements_tipo');
			if (!isset($ar_exclude_elements_tipo[0])) {
				throw new Exception("Error Processing Request. exclude_elements of section $this->tipo not found. Exclude elements is mandatory (2)", 1);				
			}
			$exclude_elements_tipo = $ar_exclude_elements_tipo[0];			

			if (!empty($exclude_elements_tipo)) {
				# Localizamos los elementos a excluir que son los términos relacionados con este elemento ('exclude_elements')
				$ar_excluded_tipo = RecordObj_dd::get_ar_terminos_relacionados($exclude_elements_tipo, $cache=false, $simple=true);
					#dump($ar_excluded_tipo,'$ar_excluded_tipo');

			}
			#dump($ar_exclude_elements,'ar_exclude_elements '.$this->tipo);
			$ar_obj_button_all = $this->get_ar_children_objects_by_modelo_name_in_section('button_',true);			
				#dump($ar_obj_button_all,'$ar_obj_button_all');
			$ar_secton_real_buttons = array();
			foreach ($ar_obj_button_all as $current_obj_button) {
				if(!in_array($current_obj_button->get_tipo(), $ar_excluded_tipo)){
					$ar_secton_real_buttons[] = $current_obj_button;
				}
			}
			#add the specific buttons of the virtual section, if the virtual have buttons add to the list.
			$ar_section_virtual_buttons = $this->get_ar_children_objects_by_modelo_name_in_section('button_',false);
			$ar_buttons = array_merge($ar_section_virtual_buttons,$ar_secton_real_buttons);
			#dump($ar_buttons,'$ar_buttons in virtual section');

		}else{
			#if the section is a real section see the buttons directly
			#$ar_buttons = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo, 'button_');
			$ar_buttons = $this->get_ar_children_objects_by_modelo_name_in_section('button_',false);
			#dump($ar_buttons,'$ar_buttons_real');
		}#end if ($this->section_virtual==true )

		# Group result by modelo name
		foreach ($ar_buttons as $current_obj_button) {
			$current_modelo_name = get_class($current_obj_button);		#dump($current_modelo_name,'$current_modelo_name');
			$this->ar_buttons[$current_modelo_name][] = $current_obj_button;
		}
		#dump($this->ar_buttons,'$this->ar_buttons');

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $this->ar_buttons;
	}//end get_ar_buttons



	/**
	* GET_BUTTON
	*/
	public function get_button($modelo_name) {
	
		$ar_buttons = (array)$this->get_ar_children_objects_by_modelo_name_in_section($modelo_name,false);
		foreach ($ar_buttons as $current_button_object) {
			return $current_button_object;	# Only first element		
		}
	}//end get_button
	


	/**
	* GET_AR_ALL_PROJECT_LANGS
	* Alias of static method common::get_ar_all_project_langs
	* @return array $ar_all_project_langs
	*	(like lg-spa, lg-eng)
	*/
	public function get_ar_all_project_langs(  ) {

		$ar_all_project_langs = common::get_ar_all_langs();

		return (array)$ar_all_project_langs;
	}//end get_ar_all_project_langs



	/**
	* GET_AR_PROJECTS_BY_SECTION
	*/
	private function get_ar_projects_by_section() {

		# "NO ESTA ACABADO.. !";
		die("Stopped secuence get_ar_projects_by_section");

		# Obtenemos los hijos de esta seccion
		$section	 	= self::get_tipo();
		$modelo_name	= 'filter_';

		# Obtenemos el filtro (terminoID)
		$filtroID		= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo=$section , $modelo_name, $relation_type='children'); 				#dump($filtroID);

		# Obtenemos su filtro relacionado
		$filtroID_rel	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo=$filtroID, $modelo_name, $relation_type='termino_relacionado'); 		#dump($filtroID_rel);

		# Buscamos el termino relacionado con el filtro encontrado
		$filtroID_rel2	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo=$filtroID_rel, $modelo_name, $relation_type='termino_relacionado');	#dump($filtroID_rel2);

		/*
		# los recorremos para filtrar por modelo
		if(is_array($ar_childrens)) foreach($ar_childrens as $terminoID) {

			$RecordObj_dd	= new RecordObj_dd($terminoID);
			$modelo			= $RecordObj_dd->get_modelo();
			$modelo_name	= $RecordObj_dd->get_termino_by_tipo($modelo);	#dump($modelo_name);

			if(strpos($modelo_name,'filter_') !== false) {
				$filter_tipo = $terminoID;
				break;
			}
		}
		if(empty($filter_tipo)) return false;
		*/

		# del filtro, sacamos los términos relacionados
		#$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($filter_tipo, $cache=true, $simple=true);
	}//end get_ar_projects_by_section



	/**
	* GET_AR_SECTION_CREATOR
	*/
	public function get_ar_section_creator() {
		die("REHACER");
		$dato = $this->get_dato();
		if( isset($dato->created_date->ar_section_creator) )  return $dato->created_date->ar_section_creator;
	}//end get_ar_section_creator



	/**
	* GET SECTION ID
	* Section id está en el dato (registro matrix) de la sección estructurado en json
	* tal que: {"section_id":"2"..}
	*/
	public function get_section_id() {
		return $this->section_id;
		/*
		if ($this->modo!='edit') {
			return null;
		}

		if (!isset($this->section_id)) {
			trigger_error("Triying get_section_id without section section_id defined.. modo:$this->modo");
			#throw new Exception("Error Processing Request", 1);							
		}
		$dato = $this->get_dato();
		if( isset($dato->section_id) ){
			//dump($dato->section_id); 
			return $dato->section_id;
		}   
		return false;
		*/
	}//end get_section_id



	/**
	* SET_CREATED_DATE
	* @param string $timestamp
	*	$date is timestamp as "2016-06-15 20:01:15" or "2016-06-15"
	* This method is used mainly in importations
	*/
	public function set_created_date( $timestamp ) {

		$date = dd_date::get_date_with_format( $timestamp, $format="Y-m-d H:i:s" );

		$dato = $this->get_dato(); // Force load
		$dato->created_date = $date;
		$this->set_dato($dato); // Force update
	}#end set_created_date



	/**
	* SET_MODIFIED_DATE
	* @param string $timestamp
	*	$date is timestamp as "2016-06-15 20:01:15" or "2016-06-15"
	* This method is used mainly in importations
	*/
	public function set_modified_date( $timestamp ) {

		$date = dd_date::get_date_with_format( $timestamp, $format="Y-m-d H:i:s" );

		$dato = $this->get_dato(); // Force load
		$dato->modified_date = $date;
		$this->set_dato($dato); // Force update
	}#end set_modified_date


	/**
	* GET_CREATED_DATE
	*/
	public function get_created_date() {
		$dato = $this->get_dato();
		if( !isset($dato->created_date) ){
			return false;
		};
		$valor_local = component_date::timestamp_to_date($dato->created_date, $full=true);
		return $valor_local;
	}//end get_created_date



	/**
	* GET_MODIFIED_DATE
	*/
	public function get_modified_date() {
		$dato = $this->get_dato();
		if( !isset($dato->modified_date) ){
			return false;
		};
		$valor_local = component_date::timestamp_to_date($dato->modified_date, $full=true);
		return $valor_local;
	}//end get_modified_date



	/**
	* GET_CREATED_BY_USERID
	*/
	public function get_created_by_userID() {
		$dato = $this->get_dato();
		if( isset($dato->created_by_userID) )  return $dato->created_by_userID;
		return false;
	}//end get_created_by_userID



	/**
	* GET_CREATED_BY_USER_NAME
	*/
	public function get_created_by_user_name() {
		$dato = $this->get_dato();
		if( !isset($dato->created_by_userID) ){
			return false;
		}
		$user_id = $dato->created_by_userID;
		if( !$user_id ) return false;

		$component_input_text = component_common::get_instance('component_input_text',DEDALO_USER_NAME_TIPO, $user_id, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
		$user_name = $component_input_text->get_valor();

		return $user_name;
	}//end get_created_by_user_name



	/**
	* GET_MODIFIED_BY_USER_NAME
	*/
	public function get_modified_by_user_name() {
		$dato = $this->get_dato();
		if( !isset($dato->modified_by_userID) ){
			return false;
		}
		$user_id = $dato->modified_by_userID;
		if( !$user_id ) return false;

		$component_input_text = component_common::get_instance('component_input_text',DEDALO_USER_NAME_TIPO, $user_id, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
		$user_name = $component_input_text->get_valor();

		return $user_name;
	}//end get_modified_by_user_name
	


	/**
	* GET_SECTION_INFO
	* @param string $format
	*/
	public function get_section_info($format='json') {
		
		$section_info = new stdClass();
		
		$section_info->created_date 			= (string)$this->get_created_date();		
		$section_info->created_by_user_name		= (string)$this->get_created_by_user_name();	
		$section_info->modified_date 			= (string)$this->get_modified_date();
		$section_info->modified_by_user_name	= (string)$this->get_modified_by_user_name();

		$section_info->label					= (string)rawurlencode($this->get_label());
		$section_info->section_id				= (string)$this->get_section_id();
			#dump($section_info,"section_info");

		switch ($format) {
			case 'json':
				return json_handler::encode($section_info);
				break;
			
			default:
				return $section_info;
				break;
		}
	}//end get_section_info



	/**
	* GET_AR_ALL_SECTION_RECORDS_UNFILTERED
	* @param string $section_tipo
	* @return array $ar_records
	* @see fifussion::build_table_data_recursive
	*/
	public static function get_ar_all_section_records_unfiltered($section_tipo) {

		$result = section::get_resource_all_section_records_unfiltered($section_tipo);
		
		if(SHOW_DEBUG===true) {
			$n_rows = pg_num_rows($result);
			if ($n_rows>1000) {
				debug_log(__METHOD__." WARNING: TOO MUCH RESULTS IN QUERY. TO OPTIMIZE MEMORY NOT STORE RESULTS IN ARRAY IN THIS SEARCH. BETTER USE 'get_resource_all_section_records_unfiltered' ".to_string(), logger::ERROR);
			}
		}
		$ar_records=array();
		while ($rows = pg_fetch_assoc($result)) {
			$ar_records[] = $rows['section_id'];
		}

		return $ar_records;
	}//end get_ar_all_section_records_unfiltered



	/**
	* GET_RESOURCE_ALL_SECTION_RECORDS_UNFILTERED
	* @param string $section_tipo
	* @return resource $result
	*/
	public static function get_resource_all_section_records_unfiltered($section_tipo) {

		$matrix_table 	= common::get_matrix_table_from_tipo($section_tipo);
		$filter 		= "section_tipo = '$section_tipo'";
		$strQuery 		= "-- ".__METHOD__." \nSELECT section_id FROM \"$matrix_table\" WHERE section_tipo = '$section_tipo' ORDER BY section_id ASC ";
		$result			= JSON_RecordObj_matrix::search_free($strQuery);	
				
		return $result;
	}//end get_resource_all_section_records_unfiltered



	/**
	* GET_MEDIA_COMPONENTS_MODELO_NAME
	* Return array with modelo names of defined as 'media components'. Add future media components here
	* @return array
	*/
	public static function get_media_components_modelo_name() {
		return array(
			'component_av',
			'component_image',
			'component_pdf',
			'component_html_file' // Not remove nothing for now		
			);
	}



	/**
	* REMOVE_SECTION_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file vinculated to current section (all quality versions)
	* @see section->Delete
	* @return bool
	*/
	protected function remove_section_media_files() {

		$section_tipo 	= $this->tipo;
		$section_id 	= $this->section_id;
		$section_dato 	= $this->get_dato();
		if(SHOW_DEBUG===true) {
			#dump($section_dato->components, ' section_dato');
			#debug_log(__METHOD__." Called method $section_tipo - $section_id ".__METHOD__);
		}

		$ar_media_elements = section::get_media_components_modelo_name();
		
		if (!isset($section_dato->components)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Nothing to remove");
			}
			return false;
		}
		foreach ($section_dato->components as $component_tipo => $component_value) {
			
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			if (!in_array($modelo_name, $ar_media_elements)) continue; # Skip

			if(SHOW_DEBUG===true) {
				#dump($component_value, "component_value $component_tipo - $modelo_name");
			}

			$component = component_common::get_instance($modelo_name, $component_tipo, $section_id, 'edit', DEDALO_DATA_LANG, $section_tipo);
			if ( !$component->remove_component_media_files() ) {
				if(SHOW_DEBUG===true) {
					trigger_error("Error on remove_component_media_files: $modelo_name, component_tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo");
				}
			}
			
		}# end foreach
			
		return true;
	}//end remove_section_media_files



	/**
	* RESTORE_DELETED_SECTION_MEDIA_FILES
	* Use when recover section from time machine. Get files "deleted" (renamed in 'deleted' folder) and move and rename to the original media folder
	*/
	public function restore_deleted_section_media_files() {
		# WORK IN PROGRESS.. !!
		#return true;

		$section_tipo 	= $this->tipo;
		$section_id 	= $this->section_id;
		$section_dato 	= $this->get_dato();
		if(SHOW_DEBUG===true) {
			#dump($section_dato->components, ' section_dato');
			#debug_log(__METHOD__." Called method $section_tipo - $section_id ".__METHOD__);
		}

		$ar_media_elements = section::get_media_components_modelo_name();
		
		if (!isset($section_dato->components)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Nothing to remove");
			}
			return false;
		}

		foreach ($section_dato->components as $component_tipo => $component_value) {
		
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			if (!in_array($modelo_name, $ar_media_elements)) continue; # Skip

			if(SHOW_DEBUG===true) {
				#dump($component_value, "component_value $component_tipo - $modelo_name");
			}

			$component = component_common::get_instance($modelo_name, $component_tipo, $section_id, 'edit', DEDALO_DATA_LANG, $section_tipo);
			if ( !$component->restore_component_media_files() ) {
				if(SHOW_DEBUG===true) {
					trigger_error("DEBUG INFO ".__METHOD__." Error on restore_deleted_section_media_files: modelo_name:$modelo_name, component_tipo:$component_tipo, section_id:$section_id, section_tipo:$section_tipo");
				}
			}
		
		}# end foreach
			
		return true;
	}//end restore_deleted_section_media_files



	/**
	* GET_SECTION_TIPO : alias of $this->get_tipo()
	*/
	public function get_section_tipo() {
		return $this->get_tipo();
	}



	/**
	* FORCED_CREATE_RECORD : 
	* Check if the section exists in the DB, if the section exist, return true, else create new section with 
	* the section_id and section_tipo into the database and return true.
	* Default value component filter is saved too for maintain accessibility 
	* @return bool true is insert / false if not
	*/
	public function forced_create_record() {

		$start_time = start_time();		

		if(is_null($this->section_id)) {

			$this->Save();
			return true;

		}else{

			$section_tipo = $this->tipo;
			$matrix_table = common::get_matrix_table_from_tipo($section_tipo);

			$strQuery = "SELECT section_id FROM \"$matrix_table\" WHERE section_id = $this->section_id AND section_tipo = '$section_tipo' ";
			$result	  = JSON_RecordObj_matrix::search_free($strQuery);
			$num_rows = pg_num_rows($result);
				#dump($strQuery, ' strQuery '." $this->section_id - $this->tipo");

			# Record already exists. Not continue
			if($num_rows>0) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." == SECTION : Record already exists ($this->section_id, $section_tipo)");
				}
				return false;
			}
		}
		

		# datos for new section
		$datos = new stdClass();
			$datos->section_id 			= (int)$this->section_id;
			$datos->section_tipo 		= (string)$this->tipo;
			$datos->label 				= (string)RecordObj_dd::get_termino_by_tipo($this->tipo,null,true);
			$datos->created_by_userID 	= (int)navigator::get_user_id();
			$datos->created_date 		= (string)component_date::get_timestamp_now_for_db();	# Format 2012-11-05 19:50:44					

		$strQuery = "INSERT INTO \"$matrix_table\" (section_id, section_tipo, datos) VALUES ($1, $2, $3)";		
		$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $this->section_id, $this->tipo, json_encode($datos) ));
		if(!$result) {
			if(SHOW_DEBUG===true) {
				dump($strQuery,"strQuery section_id:$section_id, section_tipo:$this->tipo");	
				throw new Exception("Error Processing Save Insert Request ". pg_last_error(), 1);;
			}
			return "!!! Error: sorry an error ocurred on INSERT record. Data is not saved";
		}
		
		$this->Save();

		#
		# FILTER always save default project
			// $section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false
			$ar_filter_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo, array('component_filter'), true, true, true, false);
				#dump($filter_tipo, ' filter_tipo');
			if (!isset($ar_filter_tipo[0])) {
				
				#throw new Exception("Error Processing Request. component_filter not found in this section ($this->tipo - $this->section_id)", 1);
				debug_log(__METHOD__." Error Processing Request. component_filter not found in this section ($this->tipo - $this->section_id) ".to_string(), logger::DEBUG);		
			
			}else{

				$filter_tipo 	  = $ar_filter_tipo[0];

				# Filter can be component_filter or component_filter_master in user section case
				# When you are in import useres context, you need use 'component_filter_master' as projects data
				$filter_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($filter_tipo,true);
				
				$component_filter 	= component_common::get_instance($filter_modelo_name,
																	 $filter_tipo,
																	 $this->section_id,
																	 'edit',
																	 DEDALO_DATA_NOLAN,
																	 $this->tipo);
				$dato 			  = array(DEDALO_DEFAULT_PROJECT=>2);
				$component_filter->set_dato($dato);
				$component_filter->Save();
			}

		#
		# COUNTER
		# CONSOLIDATE COUNTER VALUE
		# Search last section_id for current section and set counter to this value (when user later create a new record manually, counter will be ok)
		counter::consolidate_counter( $this->tipo, $matrix_table );


		if(SHOW_DEBUG===true) {
			#$msg = " SECTION : Record new created ($this->section_id, $this->tipo) time ms: ".exec_time_unit($start_time,'ms');
			#debug_log(__METHOD__." $msg ", logger::DEBUG);
		}
		return true;
	}#end forced_create_record	



	/**
	* GET_DIFFUSION_INFO
	* @return 
	*/
	public function get_diffusion_info() {
		$dato = $this->get_dato();
		
		if(is_object($dato) && property_exists($dato, 'diffusion_info')) return $dato->diffusion_info;
		return null;	
	}#end get_diffusion_info



	/**
	* DIFFUSION_INFO_ADD
	* @param string $diffusion_element_tipo
	*/
	public function diffusion_info_add( $diffusion_element_tipo ) {
		$dato = $this->get_dato();

		if (!isset($dato->diffusion_info) || !is_object($dato->diffusion_info)) {	// property_exists($dato, 'diffusion_info')
			$dato->diffusion_info = new stdClass();
		}
		if (!isset($dato->diffusion_info->$diffusion_element_tipo)) {
	
			$diffusion_element_data = new stdClass();
				$diffusion_element_data->date 	 = date('Y-m-d H:i:s');;
				$diffusion_element_data->user_id = $_SESSION['dedalo4']['auth']['user_id'];

			$dato->diffusion_info->$diffusion_element_tipo = $diffusion_element_data;
			
			$this->set_dato($dato); // Force update section dato
		}
	}#end diffusion_info_add



	/**
	* DIFFUSION_INFO_PROPAGATE_CHANGES
	* Resolve section caller to current section (from inverse locators)
	* and set every diffusion info as null to set publication as Outdated
	*/
	public function diffusion_info_propagate_changes() {
		
		$inverse_locators = $this->get_inverse_locators();

		foreach((array)$inverse_locators as $locator) {

			$section = section::get_instance($locator->section_id, $locator->section_tipo, $modo='list');
			$dato 	 = $section->get_dato();

			if (!empty($dato->diffusion_info)) {

				// Unset section diffusion_info in section dato
				$dato->diffusion_info = null; // Default value

				// Update section whole dato
				$section->set_dato($dato);

				// Save section with updated dato
				$section->Save();
				debug_log(__METHOD__." Propagated diffusion_info changes to section  $locator->section_tipo, $locator->section_id ".to_string(), logger::DEBUG);						
			}else{
				debug_log(__METHOD__." Unnecessary do diffusion_info changes to section  $locator->section_tipo, $locator->section_id ".to_string(), logger::DEBUG);
			}			
		}
	}#end diffusion_info_propagate_changes



	/**
	* DIFFUSION_INFO_REMOVE
	* @param string $diffusion_element_tipo
	*//*
	public function diffusion_info_remove__DES( $diffusion_element_tipo ) {
		$dato = $this->get_dato();

		if (!property_exists($dato, 'diffusion_info')) return false;

		if (isset($dato->diffusion_info->$diffusion_element_tipo)) {
			
			# Remove diffusion element info
			unset($dato->diffusion_info->$current_diffusion_element_tipo);
			$this->set_dato($dato); // Force update section dato	

			# Propagate changes to parent sections (inverse_locators)
			#register_shutdown_function($this->diffusion_info_propagate_changes);
			$this->diffusion_info_propagate_changes();
		}
	}#end diffusion_info_remove
	*/


	/**
	* DIFFUSION_INFO_RESET
	* @return bool
	*//*
	public function diffusion_info_reset__DES() {
		$dato = $this->get_dato();

		if (!empty($dato->diffusion_info)) {
			$dato->diffusion_info = null; // Default value
			$this->set_dato($dato);
			return true;
		}
		return false;
	}#end diffusion_info_reset
	*/



	/**
	* GET_INVERSE_LOCATORS
	* @return array $inverse_locators
	*/
	public function get_inverse_locators() {

		if (empty($this->section_id)) {
			# Section not exists yet. Return empty array
			return array();
		}

		$dato = $this->get_dato(); // Force load data

		if( isset($dato->inverse_locators) )  {

			# In rare cases sorce data inverse_locators is a aphp asociative array encoded with json. On decode, undesired object is created
			if (is_object($dato->inverse_locators)) {
				$ar_locators=array();
				foreach ($dato->inverse_locators as $key => $value) {
					$ar_locators[] = $value;
				}
				$dato->inverse_locators = $ar_locators;	// Replace object (json asociative array) for pure array with reindexed keys
				debug_log(__METHOD__." Replaced invalid data (object) with real array compatible json encode ".to_string(), logger::DEBUG);
			}

			return (array)$dato->inverse_locators;
		}
		return array();
	}//end get_inverse_locators



	/**
	* ADD_INVERSE_LOCATOR
	* @param object locator $locator
	*/
	public function add_inverse_locator( $locator ) {

		if (!is_object($locator)) {
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request. var 'locator' is not of type locator ", 1);	
			}
			debug_log(__METHOD__." Invalid locator is received to add. Locator was ignored (type:".gettype($locator).") ".to_string($locator), logger::WARNING);
			return false;		
		}
		$locator = new locator($locator);
		
		$inverse_locators = $this->get_inverse_locators();
			#dump($inverse_locators, ' inverse_locators ++ '.to_string());

		# DATA INTEGRITY: Clean possible bad format locators (old and beta errors)
		foreach ((array)$inverse_locators as $key => $current_inverse_locator) {
			if (!is_object($current_inverse_locator) || !isset($current_inverse_locator->section_id) || !isset($current_inverse_locator->section_tipo)) {				
				unset($inverse_locators[$key]);
				debug_log(__METHOD__." !! REMOVED BAD FORMAT INVERSE LOCATOR: (type:".gettype($current_inverse_locator).") ".to_string($current_inverse_locator), logger::WARNING);
			}
		}
		# maintain array index after unset value. ! Important for encode json as array later (if keys are not correlatives, object is created)
		$inverse_locators = array_values($inverse_locators);
		
		# Test if already exists
		$object_exists = false;
		foreach ((array)$inverse_locators as $key => $current_locator_obj) {
			if ( $current_locator_obj->section_tipo === $locator->section_tipo 
				 && $current_locator_obj->section_id == $locator->section_id 
				) {
				$object_exists=true;
				break;				
			}
		}
		#dump($dato,"object_exists");

		if ($object_exists===false) {
			array_push($inverse_locators, $locator);
			//$inverse_locators[] = $locator;

			# Force load 'dato' if not exists / loaded
			if ( empty($this->dato) && $this->section_id>0 ) {
				$this->get_dato();
			}
			if (empty($this->dato)) {
				$this->dato = new stdClass();
			}

			$this->dato->inverse_locators = $inverse_locators;
			//$this->set_inverse_locators($inverse_locators);

			return true;
		}

		return false;
	}//end add_inverse_locator



	/**
	* REMOVE_INVERSE_LOCATOR
	* @param object locator $locator
	*/
	public function remove_inverse_locator( $locator ) {

		if(!is_object($locator)) {
			return false;
		}
		$locator = new locator($locator);
		
		$inverse_locators = (array)$this->get_inverse_locators();

		# Locator is locator object and inverse_locators are stdClass. Convert current locator to standar class to compare
		$locator_std = json_encode($locator);
		$locator_std = json_decode($locator_std);

		foreach ($inverse_locators as $key => $current_locator) {
			if ( $current_locator==$locator_std ) {
				unset($inverse_locators[$key]);
				break;
			}
		}
		# maintain array index after unset value. ! Important for encode json as array later (if keys are not correlatives, object is created)
		$inverse_locators = array_values($inverse_locators);

		$this->dato->inverse_locators = $inverse_locators;
		return false;
	}//end remove_inverse_locator



	/**
	* REMOVE_ALL_INVERSE_LOCATOR
	*/
	public function remove_all_inverse_locator() {
		$this->dato->inverse_locators = array();
	}//end remove_all_inverse_locator



	/**
	* REMOVE_ALL_INVERSE_REFERENCES
	* @return 
	*/
	public function remove_all_inverse_references() {
		
		$inverse_locators = $this->get_inverse_locators();
		foreach ((array)$inverse_locators as $current_locator) {
			
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo( $current_locator->component_tipo, true );
			if ($modelo_name!=='component_portal' && $modelo_name!=='component_autocomplete') {
				if(SHOW_DEBUG===true) {
					trigger_error("ERROR (remove_all_inverse_references): Only portals are supported!! Received: $modelo_name");
				}
				//return false;
			}
			$component 	 = component_common::get_instance(	$modelo_name,
															$current_locator->component_tipo,
															$current_locator->section_id,
															'edit',
															DEDALO_DATA_NOLAN,
															$current_locator->section_tipo
															);
			
			$locator = new locator();
				$locator->set_section_tipo($this->tipo);
				$locator->set_section_id($this->section_id);			

			$component->remove_inverse_locator_reference( $locator );
			$component->Save();

			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Removed inverse reference to tipo:$this->tipo, section_id:$this->section_id in $modelo_name: tipo:$current_locator->component_tipo, section_id:$current_locator->section_id, section_tipo:$current_locator->section_tipo ");
			}
		}

		return $inverse_locators;
	}#end remove_all_inverse_references



	/**
	* GET_RELATIONS
	* @return array $relations
	*
	* Ver de fijar la variable en la sección al construir el objeto ......
	*
	*/
	public function get_relations() {

		if (empty($this->section_id)) {
			# Section not exists yet. Return empty array
			return array();
		}

		$dato = $this->get_dato(); // Force load data

		if( isset($dato->relations) )  {
			#dump($dato->section_id, ' dato->section_id ++ '.to_string());
			#dump((array)$dato->relations, ' var ++ '.to_string());

				# Option conterrting to locator objects
				/*
				$relations=array();
				foreach ((array)$dato->relations as $value) {
					$relations[] = new locator($value);
				}
					dump($relations, ' relations ++ '.to_string());
				return $relations;
				*/

			return (array)$dato->relations;
		}

		return array();
	}//end get_relations



	/**
	* ADD_RELATION
	* @param object locator $locator
	*	locator with valid 'type' property defined mandatory	
	*/
	public function add_relation( $locator ) {

		if(empty($locator)) return false;

		if (!is_object($locator) || !isset($locator->type)) {
			if(SHOW_DEBUG===true) {
				throw new Exception("Error Processing Request. var 'locator' not contains property 'type' ", 1);	
			}
			debug_log(__METHOD__." Invalid locator is received to add. Locator was ignored (type:".gettype($locator).") ".to_string($locator), logger::WARNING);
			return false;		
		}

		$current_type = $locator->type;		
		$relations 	  = $this->get_relations();
			#dump($relations, ' relations ++ '.to_string());	
			

		# DATA INTEGRITY: Clean possible bad format locators (old and beta errors)
		foreach ((array)$relations as $key => $current_relation) {
			if (!is_object($current_relation) || !isset($current_relation->section_id) || !isset($current_relation->section_tipo) || !isset($current_relation->type)) {		
				//unset($relations[$key]);
				#debug_log(__METHOD__." !! FOUNDED BAD FORMAT RELATION LOCATOR: (type:".gettype($current_relation).") ".to_string($current_relation), logger::WARNING);
				throw new Exception("Error Processing Request. !! FOUNDED BAD FORMAT RELATION LOCATOR IN SECTION_RELATION DATA: (type:".gettype($current_relation).") ".to_string($current_relation), 1);				
			}
			#if ($remove_previous_of_current_type && $current_relation->type===$current_type) {
			#	debug_log(__METHOD__." Removing locator of type $current_type from relation locator: ".to_string($current_relation), logger::DEBUG);
			#	unset($relations[$key]);
			#}
		}
		# maintain array index after unset value. ! Important for encode json as array later (if keys are not correlatives, undesired object is created)
		$relations = array_values($relations);
		
		# Test if already exists	
		$ar_properties=array('section_tipo','section_id','type');
		if (isset($locator->tag_id)) 		 	$ar_properties[] = 'tag_id';
		if (isset($locator->component_tipo)) 	$ar_properties[] = 'component_tipo';
		if (isset($locator->section_top_tipo))	$ar_properties[] = 'section_top_tipo';
		if (isset($locator->section_top_id)) 	$ar_properties[] = 'section_top_id';
		$object_exists = locator::in_array_locator( $locator, $ar_locator=$relations, $ar_properties );
		if ($object_exists===false) {

			array_push($relations, $locator);
			//$relations[] = $locator;

			# Force load 'dato' if not exists / loaded
			if ( empty($this->dato) && $this->section_id>0 ) {
				$this->get_dato();
			}
			if (empty($this->dato)) {
				$this->dato = new stdClass();
			}

			$this->dato->relations = (array)$relations;
			//$this->set_relations($relations);

			return true;
		}else{
			debug_log(__METHOD__." Ignored add locator action: locator ".json_encode($locator)." already exists. Tested properties: ".to_string($ar_properties), logger::DEBUG);
		}

		return false;
	}//end add_relation



	/**
	* ADD_RELATIONS
	* Run add_relation for each locator element contained in received array
	* If $remove_previous_of_current_type is true and $type!=false, previous locators of requested type will be removed.
	* In this case, if $ar_relation array is empty, relations of current type will be empty (set dato empty cases)
	* @param array $ar_relation
	*	Array of locators
	* @return bool $result
	*	If any of added relation result is false (no added), this method return false. Otherwise true
	* @see component_relation_common->set_dato
	*/
	public function add_relations( $ar_relation, $remove_previous_of_current_type=false, $type=false ) {
		$result=true;

		if ($remove_previous_of_current_type===true && !empty($type)) {
			$this->remove_relations_of_type( $type );			
		}

		if(!empty($ar_relation)) {
			foreach ((array)$ar_relation as $locator) {
				$add_relation = $this->add_relation( $locator );
				// If any fail, returns false
				if($add_relation===false) $result = false;
			}
		}		
		#dump($this->dato->relations, ' $this->dato->relations ++ type: '.to_string($type));

		return (bool)$result;
	}//end add_relations



	/**
	* REMOVE_RELATION
	* @param object locator $locator
	*/
	public function remove_relation( $locator ) {
		
		$relations = (array)$this->get_relations();

		$ar_properties=array('section_tipo','section_id','type');
		if (isset($locator->tag_id)) 		 	$ar_properties[] = 'tag_id';
		if (isset($locator->component_tipo)) 	$ar_properties[] = 'component_tipo';
		if (isset($locator->section_top_tipo))	$ar_properties[] = 'section_top_tipo';
		if (isset($locator->section_top_id)) 	$ar_properties[] = 'section_top_id';

		$new_relations = array();
		$removed = false;
		foreach ($relations as $key => $current_locator_obj) {

			# Test if already exists
			$equal = locator::compare_locators( $current_locator_obj, $locator, $ar_properties );
			if ( $equal===true ) {
				
				#unset($relations[$key]);				
				#debug_log(__METHOD__." Removed key $key ".to_string($locator), logger::DEBUG);
				
				# maintain array index after unset value. ! Important for encode json as array later (if keys are not correlatives, object is created)
				#$relations = array_values($relations);
				#$this->dato->relations = $relations;

				#return true;				
				#break;
				$removed = true;

			}else{

				$new_relations[] = $current_locator_obj;
			}
		}

		# Updates current dato relations with clean array of locators
		$this->dato->relations = $new_relations;		

		return (bool)$removed;
	}//end remove_relation



	/**
	* REMOVE_RELATIONS_OF_TYPE
	* Delete all locators of type requested from section relation dato
	* Note this method not save
	* @return array $ar_deleted_locators
	*/
	public function remove_relations_of_type( $relation_type ) {
		
		$relations = (array)$this->get_relations();

		$ar_deleted_locators = array();
		foreach ($relations as $key => $current_locator) {

			# Test if type
			if ( isset($current_locator->type) && $current_locator->type===$relation_type) {
				$ar_deleted_locators[] = $current_locator;
				#debug_log(__METHOD__." Deleting locator of type $relation_type ".to_string($current_locator), logger::DEBUG);
				unset($relations[$key]);
			}
		}
		# maintain array index after unset value. ! Important for encode json as array later (if keys are not correlatives, object is created)
		$relations = array_values($relations);

		# update section dato relations on finish
		$this->dato->relations = $relations;

		return (array)$ar_deleted_locators;
	}//end remove_relations_of_type



	/**
	* GET_SECTION_MAP
	* Section map data is in 'propiedades' of element of model 'section_map' placed in first level of section
	* 
	* @return object $setion_map or null
	*/
	public static function get_section_map( $section_tipo ) {

		static $section_map_cache;

		if(isset($section_map_cache[$section_tipo])) return $section_map_cache[$section_tipo];
		
		$ar_modelo_name_required = array('section_map');
		$resolve_virtual 		 = false;

		// Locate section_map element in current section (virtual ot not)
		$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual, $recursive=false, $search_exact=true);

		// If not found children, try resolving real section
		if (empty($ar_children)) {
			$resolve_virtual = true;
			$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual, $recursive=false, $search_exact=true);
		}

		if( !isset($ar_children[0]) ) {
			$section_map = null;
		
		}else{

			$tipo 			= $ar_children[0];
			$RecordObj_dd 	= new RecordObj_dd($tipo);
			$propiedades 	= $RecordObj_dd->get_propiedades();

			if ($section_map  = json_decode($propiedades)) {
				$section_map  = (object)$section_map;
			}else{
				$section_map  = null;
			}
		}

		$section_map_cache[$section_tipo] = $section_map;	

		return $section_map;	
	}//end get_section_map



	/**
	* REMOVE_ALL_RELATION_REFERENCES
	* Used on delete section, to exterminate locator references
	* @return 
	*/
	private function remove_all_relation_references() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$section_tipo 	= $this->tipo;
		$section_id 	= $this->section_id;

		# remove_parent_references
		$result = component_relation_common::remove_parent_references($section_tipo, $section_id, $filter=false);
		debug_log(__METHOD__." Removed children references to current section $section_tipo - $section_id, ".to_string(), logger::DEBUG);

		# related references
		# TO DO

		return (object)$response;
	}//end remove_all_relation_references	

	

}
?>