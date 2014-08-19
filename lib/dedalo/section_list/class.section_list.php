<?php
/*
* CLASS SECTION LIST
*/
require_once(DEDALO_LIB_BASE_PATH . '/section_list/rows_search/class.rows_search.php');
require_once(DEDALO_LIB_BASE_PATH . '/section_list/rows_paginator/class.rows_paginator.php');
require_once(DEDALO_LIB_BASE_PATH . '/section_list/rows_header/class.rows_header.php');
require_once(DEDALO_LIB_BASE_PATH . '/section_list/rows/class.rows.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_ts.php');


class section_list extends common {
	
	protected $id;
	protected $tipo;
	protected $lang;
	protected $modo;

	# Datos de la sección que lo llama (parent)
	public $section_obj;
	protected $parent_section_tipo;
	
	# STRUCTURE DATA
	protected $RecordObj_ts ;
	protected $modelo;
	protected $norden;
	protected $label;
	
	public $ar_id_section;
	public $ar_id_section_page;	
	public $ar_buttons_tipo;

	public $ar_components_tipo;
	public $ar_components_search;
	

	public static $static_ar_id_section_page ;

	# Objects calculated on get html
	protected $rows_search ;	
	protected $rows_header ;
	protected $rows_paginator	;
	protected $rows ;


	/**
	* CONSTRUCT
	* @param $tipo 
	*	String tesauro like dd142
	* @param $section_obj
	*	Section obj previously created
	* @param $ar_id_section
	*	Array. Optional var 
	*	Default is NULL
	*/
	function __construct($tipo, section $section_obj, $ar_tipo_component=null, $modo, $total_ar_id_records) {

		$this->define_id(NULL);
		$this->define_tipo($tipo);
		$this->define_lang(DEDALO_DATA_LANG);	
		#$this->define_modo($section_obj->get_modo());
		$this->define_modo($modo);
			#dump($modo,'modo en section list');

		parent::load_structure_data();		

		# SECTION OBJ
		$this->section_obj			= $section_obj;
		$this->parent_section_tipo	= $section_obj->get_tipo();				#dump($this->section_obj); die();
		#$this->caller_id			= $this->section_obj->caller_id;		#dump($this->section_obj->caller_id);
			#dump($section_obj);	
		
		# LOAD AR ID SECTION (Array de registros totales autorizados de esta sección -luego se paginarán-)
		$this->ar_id_section		= $total_ar_id_records;		
			#dump($this->ar_id_section,'$this->ar_id_section');

		
		# LOAD AR ID SECTION PAGE (los registros a mostrar en esta página. Definidos por max-rows y gestionados por paginator)		
		$this->ar_id_section_page	= array();	

		# OPTIONALS (triggered when request exists)

			# SEARCH (When request)
			if(isset($_REQUEST['search']))		$this->search_ar_id_section();

			# ORDER ROWS (When request)
			if(isset($_REQUEST['order_by']))	$this->order_ar_id_section();
		
		
		# AR_COMPONENTS_TIPO : Calculate and set components si no se han pasado como variable
		if (empty($ar_tipo_component)) throw new Exception("Few vars.. 'ar_tipo_component' is null", 1);		
		$this->ar_components_tipo = $ar_tipo_component;
				

		# AR_COMPONENTS_SEARCH : Calculate and set search components
		$this->ar_components_search = $this->get_ar_components_search();
	}

	# define id
	protected function define_id($id) {	$this->id = $id ; }
	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }

	
	/*
	* HTML
	*/
	public function get_html() {

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.$this->modo.'_IN_'.microtime(1)]=microtime(1);
		}
		
		# CONTEXT : 'component_portal_inside_portal_list'
		# En este contexto (portal dentro de portal) no calcularemos el html
		$context				= $this->get_context();
			#dump($context,'context');
		#if($context=='component_portal_inside_portal_list') return null;
	
		/*
		$this->rows_search 		= $this->get_rows_search();	
		$this->rows_header 		= $this->get_rows_header();
		$this->rows_paginator	= $this->get_rows_paginator();
		$this->rows 			= $this->get_rows(); 					#dump($this->rows);		
		*/

		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'.get_called_class().'/'.get_called_class().'.php' );
		$html =  ob_get_clean();
	

		 
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ' );
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.$this->modo.'_OUT_'.microtime(1)]=microtime(1);
		}
		
		return $html;
	}



	
	
	
	/*
	protected function get_section_name() {
		return RecordObj_ts::get_termino_by_tipo($this->tipo, DEDALO_APPLICATION_LANG);	
	}
	*/
	
	/**
	* SEARCH MATRIX ROWS (ar_id_section)
	*/
	private function search_ar_id_section() {
		
		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.$this->modo.'_IN_'.microtime(1)]=microtime(1);
		}	
		
		$section_tipo 			= $this->parent_section_tipo;
		$current_matrix_table 	= common::get_matrix_table_from_tipo($section_tipo);
			#dump($this->section_obj,'current_matrix_table');
		
		# Verifica si realmente se está buscando
		if(empty($_REQUEST['search'])) return false;
		
		# Portales en list : Evita que se duplique la búsqueda. Sólo se ejecutará para el top tipo actual
		# Si no hay $selected_section, estamos en un tool_portal
		$selected_modo = navigator::get_selected('modo');
		if( $this->parent_section_tipo != $_SESSION['config4']['top_tipo'] && $selected_modo!='tool_portal' ) {
			#dump($this->parent_section_tipo,'$this->parent_section_tipo');
			return false;
		}
		
		
		# FILTER SQL (FROM PREVIOUS AR RECORDS SEARCH)
		$sql_filter = '`id` IS NOT NULL';
		/*
		if(is_array($this->ar_id_section) && count($this->ar_id_section)>0) {
			
			foreach($this->ar_id_section as $id) {
				$sql_filter .=	"parent={$id} OR ";
			}
			$sql_filter	= ' AND (' .substr($sql_filter,0,-4) . ')';
		}
		*/	
		
		# SEARCH SQL
		$ar_request = $_POST;		#if(SHOW_DEBUG) dump($ar_request,'$ar_request');
		$sql_search = '';
		$counter=0;
		if(is_array($ar_request)) foreach($ar_request as $name => $value) {			
			
			#if(SHOW_DEBUG) dump($value, "name: $name");

			if(!empty($value) && $name!='search' && $name!='max_rows') {

				# PORTAL TEST
				$current_section_tipo = component_common::get_section_tipo_from_component_tipo($name);
					#dump($current_section_tipo,'$current_section_tipo - section_tipo:'.$section_tipo);

				# Allow search into portal fields
				# NO está acabado y entra en conflicto con las secciones virtuales. Desactivado de momento
				$allow_search_into_portal_fields = false;
				
				if($current_section_tipo!=$section_tipo && $allow_search_into_portal_fields) {
					
					# PORTALES
					$sql_search_portal='';
					if(is_array($value)) foreach($value as $value2) {
						$sql_search_portal .= "(tipo = '$name' AND dato LIKE '%\"$value2\"%') ";		#echo "<br> - $name => $value2 ";						
					}else{
						$sql_search_portal = "(tipo = '$name' AND dato LIKE '%".$value."%') ";		#echo "<br> - $name => $value ";						
					}
					$arguments=array();
					$ar_arguments['strPrimaryKeyName']	= 'parent';
					$ar_arguments['sql_code']			= $sql_search_portal;
					$matrix_table 						= $current_matrix_table;
					$RecordObj_matrix					= new RecordObj_matrix($matrix_table,NULL);
					$ar_id_search_portal 				= $RecordObj_matrix->search($ar_arguments);

					if (!empty($ar_id_search_portal[0])) {

						# Buscamos registros que contengan referencias a este registro como portal,
						# es decir como [123.0.0]. Se encontrarán todos los existentes y posteriormente se filtrarán para quitar los que no sean de esta sección (la actual del listado) 
						$portal_dato = $ar_id_search_portal[0].".0.0";
						$sql_search .= "OR (dato LIKE '%\"$portal_dato\"%') ";
						$counter++;

					}else{

						# Pasamos un dato imposible para cumplir el expediente y mantener el formato del query
						$sql_search .= "OR (dato = 'dato_imposible_en_dedalo_que_anula_cualquier_otro')";
						$counter++;
					}

				}else{

					# NORMAL
					if(is_array($value)) foreach($value as $value2) {

						if (strpos($value2, ',')!==false) {
							$ar_value2 = explode(',', $value2);
							foreach ($ar_value2 as $current_value2) {
								$sql_search .= "OR (`tipo` = '$name' AND `dato` LIKE '%\"$current_value2\"%') ";
							}
						}else{
							$sql_search .= "OR (`tipo` = '$name' AND `dato` LIKE '%\"$value2\"%') ";		#echo "<br> - $name => $value2 ";
						}						
						$counter++;

					}else{

						if (strpos($value, ',')!==false) {
							$ar_value = explode(',', $value);
							foreach ($ar_value as $current_value) {
								#$sql_search .= "OR (`tipo` = '$name' AND `dato` = '\"{$current_value}\"') ";
								$sql_search .= "OR (`tipo` = '$name' AND `dato` LIKE '%\"$current_value\"%')";
							}
						}else{
							#$sql_search .= "OR (`tipo` = '$name' AND `dato` = '\"{$value}\"') ";		#echo "<br> - $name => $value ";
							$sql_search .= "OR (`tipo` = '$name' AND `dato` LIKE '%\"$value\"%')";
						}
						$counter++;
					}
					/*
					if(is_array($value)) foreach($value as $value2) {
						$sql_search .= "OR (`tipo` = '$name' AND `dato` LIKE '%\"$value2\"%') ";		#echo "<br> - $name => $value2 ";
						$counter++;
					}else{
						$sql_search .= "OR (`tipo` = '$name' AND `dato` LIKE '%".$value."%') ";			#echo "<br> - $name => $value ";
						$counter++;
					}
					*/
				}
				
						
			}
		}
		if(strlen($sql_search)==0) return false;
		
		$sql_search = substr($sql_search,3);	$counter--;

		# GROUP_BY
		$group_by = "GROUP BY `parent` HAVING COUNT(*)>{$counter}";

		# SQL QUERY
		$sql = "$sql_filter AND $sql_search AND (`lang` = '".DEDALO_DATA_LANG."' OR `lang` = '".DEDALO_DATA_NOLAN."') $group_by";	

		if(SHOW_DEBUG===true) {
			dump($sql,'sql');
			$_SESSION['debug_content'][__METHOD__." => $sql"] = $sql;
		}
		
		
		$arguments=array();
		$ar_arguments['strPrimaryKeyName']	= 'parent';
		$ar_arguments['sql_code']			= $sql;		
		$matrix_table 						= $current_matrix_table;
		$RecordObj_matrix					= new RecordObj_matrix($matrix_table,NULL);
		$ar_id_search		 				= $RecordObj_matrix->search($ar_arguments);
			#dump($this->ar_id_section,'$this->ar_id_section');
			#dump($ar_id_search,'$ar_id_search BEFORE');

		/*
		# Recorremos los resultados eliminando los que no aparezcan en el filtro
		if(is_array($ar_id_search)) foreach ($ar_id_search as $key => $current_id_search) {
			if (!in_array($current_id_search, $this->ar_id_section)) {
				unset($ar_id_search[$key]);
				if (SHOW_DEBUG) {
					#dump($current_id_search, "removed $current_id_search from ar_id_search $current_matrix_table");
				}
			}
		}
		*/
		# Versión con array_intersect (es más rápida) VERIFICAR EL FILTRO
		$result_filtered = array_intersect($ar_id_search, $this->ar_id_section);
		$ar_id_search 	 = $result_filtered;
			#dump($ar_id_search,'$ar_id_search AFTER');
		

		
		# Set class var value
		$this->ar_id_section	= $ar_id_search;				#dump($ar_id_search," sql:$sql");
		
		# Store for speed
		$_SESSION['ar_id_section'][$this->tipo]	= $this->ar_id_section ;


		$activity_dato = $ar_request;
		foreach ($activity_dato as $key => $value) {
			if( $key=='max_rows' || $key=='search' || empty($value) )
				unset($activity_dato[$key]);
		}
		$activity_dato = array_merge(	array(	"msg" 				=> "Searched data [$this->modo]",
												"records_founded" 	=> count($this->ar_id_section)
										)
										, $activity_dato);
		
		# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)	
		logger::$obj['activity']->log_message(
				'SEARCH',
				logger::INFO,
				$this->parent_section_tipo,
				NULL,
				$activity_dato
			);


		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, ' '.to_string($sql) );
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.$this->modo.'_OUT_'.microtime(1)]=microtime(1);
		} 
		#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= __METHOD__ . $sql;
		return true;	
	}
	




	/**
	* ORDER MATRIX ROWS (ar_id_section)
	*/
	private function order_ar_id_section() {	
		
		if(empty($_REQUEST['order_by'])) return false;

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.$this->modo.'_IN_'.microtime(1)]=microtime(1);
		}
		
		$order_by	= $_REQUEST['order_by'];
		
		$order_dir	= 'ASC';
		if(!empty($_REQUEST['order_dir']))	$order_dir 	= $_REQUEST['order_dir']; 		
		
		$direction 		= strtoupper($order_dir);
		$tipo			= $order_by;
		
		if($tipo=='id') {
			
			if($direction=='ASC') $this->ar_id_section = array_reverse($this->ar_id_section,true);			
			return $this->ar_id_section;
		}

		
		$section_tipo 			= $this->parent_section_tipo;
		$current_matrix_table 	= common::get_matrix_table_from_tipo($section_tipo);
			#dump($this->section_obj,'current_matrix_table');

		
		# Recorremos el ar_id_section y buscamos los componentes cuyo parent es el id section actual
		$matrix_table 				= $current_matrix_table;
		$RecordObj_ts 				= new RecordObj_ts($tipo);
		$component_name 			= $RecordObj_ts->get_modelo_name();

		# Lang of component
		$traducible 				= $RecordObj_ts->get_traducible();
		if ($traducible=='no') {
			$component_lang 		= DEDALO_DATA_NOLAN;
		}else{
			$component_lang 		= $this->lang;
		}

		$ar_valor 		= array();
		$ar_arguments 	= array();
		if(is_array($this->ar_id_section)) foreach($this->ar_id_section as $id) {
			
			$ar_arguments['parent']	= $id;
			$ar_arguments['tipo']	= $tipo;
			$ar_arguments['lang']	= $component_lang;
			
			$matrix_table 			= $current_matrix_table;
			$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
			$ar_id_2		 		= $RecordObj_matrix->search($ar_arguments);
				#dump($ar_arguments,'$ar_arguments');
			
			# Extraemos el dato de cada registro para ordenar luego por el mismo
			foreach($ar_id_2 as $idc) {				

				$component_obj		= new $component_name($idc, $tipo, $this->modo, $id, $component_lang);
				$ar_valor[$id]		= $component_obj->get_valor();		#echo "<br> $id - $ido - [$tipo] " .$ar_valor[$id];	 print_r($dato);						
			}			
		}
		#dump($ar_valor);
		
		# ORDER . ORDENA NATURALMENTE
		if(is_array($ar_valor))	natcasesort($ar_valor);		
		if($direction=='ASC')	$ar_valor = array_reverse($ar_valor,true);
		
		# AR ID ORDER . Recorremos todos los sectionID de los componentes que tienen valor
		$ar_id_order = array();
		foreach($ar_valor as $key => $valor) {
			$ar_id_order[] = $key;		#echo "<br> - $key => $valor ";
		}
		
		# AR ID EMPTY . Del array global, los que no están en el array de los componentes, los metemos en un array de id's sin datos
		$ar_id_empty = array();
		if(is_array($this->ar_id_section)) foreach($this->ar_id_section as $id) {			
			if(!in_array($id, $ar_id_order)) $ar_id_empty[] = $id;
		}
		
		# AR ID FINAL . mEzclamos el array de id's con datos de componentes, con el de id's vacios a continuación
		$this->ar_id_section = array_merge($ar_id_order, $ar_id_empty);

		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, to_string($ar_arguments) );
			global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.$this->modo.'_OUT_'.microtime(1)]=microtime(1);
		}

		return true;	
	}
	
	
	
	/**
	* GET_ROWS_SEARCH
	* @return Object
	*/
	private function get_rows_search() {
		if($this->modo!='list') return false;	
		$rows_search = new rows_search($this);				
			#dump($this->modo, 'rows_search', array());
		return $rows_search;
	}
	/**
	* GET_ROWS_HEADER
	* @return Object
	*/
	private function get_rows_header() {
		$rows_header = new rows_header($this);
		return $rows_header;
	}
	/**
	* GET_ROWS_PAGINATOR
	* @return Object
	*/
	private function get_rows_paginator() {		
		$rows_paginator = new rows_paginator($this);

		# FIJA EL ARRAY DE ROWS DE LA PÁGINA ACTUAL
		$this->ar_id_section_page = $rows_paginator->get_ar_id_section_page();

		# Se fija globalmente para que el filtro pueda acceder a ella, agrupándola por section tipo
		# para separar los registros de la sección principal de los de los portales
		$section_tipo = $this->parent_section_tipo;
		section_list::$static_ar_id_section_page[$section_tipo] = $this->ar_id_section_page;
			#dump(section_list::$static_ar_id_section_page,'section_list::$static_ar_id_section_page');
			#dump($rows_paginator, '$rows_paginator', array());
		return $rows_paginator;	
	}
	/**
	* GET_ROWS
	* @return Object
	*/
	private function get_rows() {
		if(isset($this->rows)) {
			dump($this->modo,'rows for '.$this->parent_section_tipo);
			return $this->rows;
		}
		$rows = new rows($this);
			#dump($rows, 'rows', array());
			
		return $rows;
	}
	
	
	
	
	
	
	
	
	private function get_group_search_DEPRECATED($terminoID_group){
		
		# SECTION GROUP
		# Creamos un section_group para extraerle su html y el array de componentes que lo integran
		$group_search 		= new section_group(NULL, $terminoID_group, 'search');
			#dump($terminoID_group);	

		//print_r ($ar_group_search);die();	
		return $group_search;		
	}

	
	
	



	##################### AJAX VERSION METHODS #####################################################

		/**
		* GET_N_ROWS
		* Calculate result number of rows for a query_sql
		*/
		public static function get_n_rows($query_sql,$conn) {
			$all_rs = mysql_query($query_sql, $conn);
			if (! $all_rs) {
				if (SHOW_DEBUG)
					echo "SQL query failed. Check your query.<br /><br />Error Returned: " . mysql_error();
				return false;
			}
			return mysql_num_rows($all_rs);
		}




	
	
}
?>