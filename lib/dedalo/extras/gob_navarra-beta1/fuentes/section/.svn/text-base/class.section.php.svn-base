<?php
/*
* CLASS SECTION
*/


class section extends common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# FIELDS
	protected $id;
	protected $tipo;
	protected $parent;
	protected $modo;

	protected $dato;

	# STRUCTURE DATA
	protected $RecordObj_ts ;
	protected $modelo ;
	protected $norden ;
	protected $label ;

	public $ar_css ;
	public $ar_section_list_obj ;
	public $ar_section_group_obj ;
	public $ar_section_relations;			# array de etiquetas de esta sección (en relaciones)
	public $rel_locator;					# usado cuando desglosamos una relación inversa (tag=>sections)
	public $tag;							# usado cuando desglosamos una relación inversa (tag=>sections)

	protected static $ar_id_records ;		# array of records of current section (int id_matrix)

	# Buttons objs
	public $ar_buttons = array();
	public $button_new_object ;
	public $button_delete_object ;

	public $caller_id;									# Necesario para calcular relation (también se admite como REQUEST['caller_id'])
	public $caller_tipo;
	public $ar_section_relations_for_current_tipo_section;	# Necesario para calcular relation
	public $ar_id_section_custom;

	public $ar_id_records_from_portal;

	public $show_inspector = true;			# default show: true

	# Array of components (tipo) to show in portal_list mode
	# used by component_layout and set from component_portal
	public $portal_layout_components;
	public $portal_tipo;

	protected $section_virtual 	 = false;
	protected $section_real_tipo ;


	static $active_section_id;

	/**
	* CONSTRUCT
	* Extends parent abstract class common
	* La sección, a diferencia de los componentes, se comporta de un modo particular:
	* Si se le pasa sólo el tipo, se espera un listado (modo list)
	* Si se le pasa sólo el id, se espera una ficha (modo edit)
	*/
	function __construct($id=NULL, $tipo=false, $modo='edit') {

		if (!$tipo) {
			throw new Exception("Error: on construct section : tipo is mandatory. id:$id, tipo:$tipo, modo:$modo", 1);
		}

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}

		# Set general vars
		$this->id 		= $id;
		$this->tipo 	= $tipo;
		$this->modo 	= $modo;
		$this->parent 	= 0;
		


		# When tipo is set, calculate structure data
		parent::load_structure_data();

		/*
			# Relaciones
			$relaciones = $this->RecordObj_ts->get_relaciones()[0];
			#dump($relaciones,'relaciones '.$this->tipo);

			if(!empty($relaciones)) {
				foreach ($relaciones as $key => $value) {
					$modelo 	= RecordObj_ts::get_termino_by_tipo($key);
					if($modelo=='section')
					$this->tipo = $value;
				}
			}
		*/

		# ACTIVE_SECTION_ID : Set global var
		if($modo=='edit' && !isset(section::$active_section_id)) {
			section::$active_section_id = $this->get_section_id();
		}

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}
	}


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
	*		Tipo de la sección principal en la que estamos trabajando 'top'. Se guarda por html_page en $_SESSION['config4']['top_tipo']
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
		if (empty($top_tipo)) {
			$top_tipo = $_SESSION['config4']['top_tipo'];
		}

		return array(
				'top_tipo' 				=> $top_tipo,
				'portal_section_tipo' 	=> $portal_section_tipo,
				'portal_tipo' 			=> $portal_tipo
				);

	}#end build_section_locator




	/**
	* NEW SECTION RECORD
	* Create a new section record in matrix
	*/
	public function Save( $is_portal=false, $portal_tipo=false ) {

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		$tipo 			= $this->get_tipo();
		$parent 		= intval(0);

		# Verify tipo is structure data
		if( strpos($tipo,'dd')===false )
			throw new Exception("Current tipo is not valid : $tipo", 1);

		# ORIGINAL TIPO : allways keeps the original type (current)
		$original_tipo = $tipo;

		
		##
		# SECTION VIRTUAL . Correct tipo
		# Si estamos en una sección virtual, despejaremos el tipo real (la sección de destino) y
		# trabajaremos con el tipo real a partir de ahora
		$section_real_tipo = $this->get_section_real_tipo();
		if($section_real_tipo!=false) {
			# Overwrite current section tipo with real section tipo
			$tipo = $section_real_tipo;
		}
		#dump($tipo,'section tipo');
		

		##
		# NEW RECORD . Create and save matrix record in correct table
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);


			##
			# COUNTER : Counter table. Default is ¡matrix_counter¡
			# Preparamos el id del contador en función de la tabla sobre la que estamos trabajando (matrix, matrix_dd, etc.)
			# Por defecto será 'matrix_counter', peri si nuestra tabla de sección es distinta de 'matrix' usaremos una tabla de 
			# contador distinta formateada como 'matrix_counter' + substr($matrix_table, 6). Por ejemplo 'matrix_counter_dd' para matrix_dd
			$matrix_table_counter = 'matrix_counter';
			#if($matrix_table!='matrix_counter' && strpos($matrix_table, 'matrix_counter')!==false) {
			if($matrix_table!='matrix' && $matrix_table!='matrix_stats') {
				$matrix_table_counter .= substr($matrix_table, 6);
			}
			$section_id_counter = counter::get_counter_value($original_tipo, $matrix_table_counter)+1;	#counter::get_new_counter_value($original_tipo, $matrix_table_counter);
			if(SHOW_DEBUG) {
				#dump($matrix_table, 'matrix_table', array());
				#dump($matrix_table_counter, 'matrix_table_counter', array());
				error_log(__METHOD__."INFO: Saved in counter table: $matrix_table_counter :".$section_id_counter);
			}


			##
			# SECTION JSON DATA 
			# Store section dato as array(key=>value)
			# Current used keys: 'section_id', 'created_by_userID', 'created_date'
			$ar_section_dato  = array();
			$ar_section_dato['section_id']			= $section_id_counter;
			$ar_section_dato['created_by_userID']	= navigator::get_userID_matrix();
			$ar_section_dato['created_date'] 		= component_date::get_timestamp_now_for_db();	# Format 2012-11-05 19:50:44
			$ar_section_dato['ref_name']			= RecordObj_ts::get_termino_by_tipo($tipo);
			if($is_portal==true) {
				$ar_section_dato['ar_section_creator']	= section::build_ar_section_creator(null, $original_tipo, $portal_tipo); # $top_tipo=null, $portal_section_tipo=null, $portal_tipo=null
			}else{
				$ar_section_dato['ar_section_creator']	= section::build_ar_section_creator();
			}			
				#dump($ar_section_dato,'$ar_section_dato');
				#dump($this, 'this', array());
				#die();

			$RecordObj_matrix->set_dato($ar_section_dato);
			$RecordObj_matrix->set_parent($parent);
			$RecordObj_matrix->set_tipo($tipo);
			$RecordObj_matrix->set_lang(DEDALO_DATA_NOLAN);		#dump($RecordObj_matrix,'$RecordObj_matrix');

			$saved 		= $RecordObj_matrix->Save();
			$this->id 	= $RecordObj_matrix->get_ID();			#$id2 = $RecordObj_matrix->get_id();
				#dump($this, "$this->id, $saved, $id2");

		
		##
		# COUNTER : If all is ok, update section counter (counter +1) in structure 'propiedades:section_id_counter'
		if ($this->id > 0) {
			counter::update_counter($original_tipo, $matrix_table_counter);
				#dump($original_tipo,"update counter in $matrix_table_counter for tipo: $original_tipo - section_id:".$ar_section_dato['section_id']);
		}

        #Inicio - DCA 2015/03/13
        #Busco el último Registro, lo aumentamos en 1 y lo grabo en matrix
        if( $tipo == 'dd335' ){
            $host=DEDALO_HOSTNAME_CONN;
            $user=DEDALO_USERNAME_CONN;
            $password=DEDALO_PASSWORD_CONN;
            $database=DEDALO_DATABASE_CONN;
            try
            {
                $mysqli = new mysqli($host, $user, $password, $database);
                if ($mysqli->connect_errno) {
                    throw new Exception("Falló la conexión a MySQL: (" . $mysqli->connect_errno . ") " . $mysqli->connect_error);
                }

                #Buscar Ultimo número de Registro
                $call = $mysqli->prepare('CALL SP_UltimoRegistro(@result)');
                #$call->bind_param('');
                if ($call->execute() == false){
                    throw new Exception('Error al ejecutar procedimiento SP_UltimoRegistro');
                }
                $select = $mysqli->query('SELECT @result');
                $fechresult = $select->fetch_assoc();
                $resultregistro = $fechresult['@result'];
                #$resultregistro = str_replace('"', '', $resultregistro);

                #Grabar Registro en el nuevo ID
                $sql = "INSERT INTO `matrix`(`parent`, `dato`, `tipo`, `lang`) VALUES ('" . $this->id . "','" . $resultregistro . "','dd376','lg-nolan')";
                if ($mysqli->query($sql) === FALSE) {
                    throw new Exception("Error: " . $sql . "<br>" . $mysqli->error);
                };

            } catch (Exception $e) {
                throw new Exception($e->getMessage());
            } finally {
                if ($mysqli != NULL) {
                    mysqli_close($mysqli);
                }
            };
        };
        #Fin - DCA 2015/03/13

		##
		# TIME MACHINE : Get returned time_machine id on save
		$time_machine_last_id = $RecordObj_matrix->get_time_machine_last_id();
			#dump($time_machine_last_id,'$time_machine_last_id');

		##
		# SECTION VIRTUAL : Para cada propiedad, creamos un componente y lo salvamos con el valor definido en propiedades ({"filtered_by":{"dd1116":"233"}})
		# Esto asegura que no perdamos el registro (que se quede sólo en media:recursos, por ejemplo)
		# Normalmente se define en propiedades la tipología [dd1116] (audiovisual,imagen,partitura,etc.) y opcionalmente la colección/archivo [dd1131]
		if($this->section_virtual==true) {
			$propiedades = $this->get_propiedades();
				#dump($propiedades->filtered_by,'$propiedades');
			if (!empty($propiedades->filtered_by)) {
				foreach ($propiedades->filtered_by as $current_filtered_tipo => $value) {
					$filtered_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($current_filtered_tipo);
					$component_obj 			= new $filtered_modelo_name(NULL, $current_filtered_tipo, 'edit', $this->id); #$id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL
					$component_obj->set_dato($value);
					$component_obj->Save();
						#dump($component_obj,'$component_obj');
				}
			}
		}


		##
		# AUTO AUTHORIZE THIS PROYECT FOR CURRENT USER 
		# Si esta sección recien creada es un proyecto, se agrega este proyecto como autorizado al usuario que lo creó
		# Usuario logeado actualmente
		$userID_matrix = navigator::get_userID_matrix();
		if ($this->tipo==DEDALO_SECTION_PROJECTS_TIPO && !component_security_administrator::is_global_admin($userID_matrix) ) {
			
			$component_filter_master	= new component_filter_master(NULL,DEDALO_FILTER_MASTER_TIPO,'edit',$userID_matrix,DEDALO_DATA_NOLAN);
			$dato_filter_master 		= $component_filter_master->get_dato();				
			$element 					= array($this->id=>"2");
			$new_dato_filter_master		= (array)$dato_filter_master + (array)$element;				
			$component_filter_master->set_dato($new_dato_filter_master);
			$component_filter_master->Save();
				#dump($component_filter_master,'component_filter_master');				
		}


		##
		# DEFAULT PROJECT FOR CREATE STANDAR SECTIONS
		# Cuando se crea un registro de sección, se auto asigna el proyecto por defecto (definido en config DEFAULT_PROJECT)
		# cuando la sección tiene definido un 'component_filter'
		/*
		$RecordObj_ts 				= new RecordObj_ts($tipo);
		$ar_tipo_component_filter 	= $RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($tipo, 'component_filter', $relation_type='children_recursive');
		if (count($ar_tipo_component_filter)==1) {
			$component_filter 	= new component_filter(NULL,$ar_tipo_component_filter[0],'edit',$this->id,DEDALO_DATA_NOLAN);			
			$component_filter->set_dato(array(DEFAULT_PROJECT=>'2'));
			$component_filter->Save();
			error_log("-- Created and assigned filter value ".DEFAULT_PROJECT." for this section ".$this->id);						
		}else if (count($ar_tipo_component_filter)>1) {
			if(SHOW_DEBUG) dump($ar_tipo_component_filter,'$ar_tipo_component_filter');
			throw new Exception("Error Processing Request. Too much component_filter elements found", 1);			
		}
		

		##
		# DEFAULT PROJECT WHEN CREATE NEW USER
		if($tipo==DEDALO_SECTION_USERS_TIPO) {
			$RecordObj_ts 					= new RecordObj_ts($tipo);
			$ar_tipo_component_filter_master= $RecordObj_ts->get_ar_terminoID_by_modelo_name_and_relation($tipo, 'component_filter_master', $relation_type='children_recursive');
			if (count($ar_tipo_component_filter_master)==1) {
				$component_filter_master 	= new component_filter_master(NULL,$ar_tipo_component_filter_master[0],'edit',$this->id,DEDALO_DATA_NOLAN);
				$component_filter_master->set_dato(array(DEFAULT_PROJECT=>'2'));
				$component_filter_master->Save();
				error_log("-- Created and assigned filter_master value ".DEFAULT_PROJECT." for this section ".$this->id);						
			}else if (count($ar_tipo_component_filter_master)>1) {
				if(SHOW_DEBUG) dump($ar_tipo_component_filter_master,'$ar_tipo_component_filter_master');
				throw new Exception("Error Processing Request. Too much component_filter_master elements found", 1);			
			}
		}
		*/


		##
		# TOP TIPO
		$top_tipo=null;
		if(isset($_SESSION['config4']['top_tipo']))
		$top_tipo 		= $_SESSION['config4']['top_tipo'];
		# TOP_ID : Si se crea desde un portal, el top_id está fijado en sesion "$_SESSION['config4']['top_id']". Si no, es el propio id de la sección creada
		if($is_portal===true) {
			$top_id 	= $_SESSION['config4']['top_id'];
		}else{
			$top_id 	= $this->id;
			# Fix current top_id
			$_SESSION['config4']['top_id'] = $top_id;
		}

		##
		# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
		logger::$obj['activity']->log_message(
			'NEW',
			logger::INFO,
			$tipo,
			NULL,
			array(	"msg"		=> "Created section record",
					"id"		=> $this->id,
					"tipo"		=> $this->tipo,
					"is_portal"	=> intval($is_portal),
					"top_id"	=> $top_id,
					"top_tipo"	=> $top_tipo,
					"table"		=> $matrix_table,
					"tm_id"		=> $time_machine_last_id,
					"counter"	=> counter::get_counter_value($this->tipo, $matrix_table_counter)
					)
		);

		# DEDALO_CACHE_MANAGER : get_ar_filter_cache
		if( DEDALO_CACHE_MANAGER ) {
			error_log("INFO: Deleted chace keys contains '$this->tipo' from section:Save method");
			cache::del_contains( $this->tipo );
		}

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		

		return $this->id;
	}


	/**
	* DELETE (SECTION)
	* @param id_matrix (section id)
	* @param delete_mode (data / record)
	* Delete section with options
	*/
	public function Delete($delete_mode) {

		if($this->id<1) return false;

		# Force type int
		$id = intval($this->id);

		$section_tipo = $this->tipo;

		# matrix_table
		#$matrix_table 	= common::get_matrix_table_from_tipo($tipo);
		#$matrix_table 	= $this->get_matrix_table();

		# CALCULATE CHILDRENS
		$arguments=array();
		$arguments['parent']	= $id;
		$matrix_table 			= common::get_matrix_table_from_tipo($section_tipo);
		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);
		$ar_childrens			= $RecordObj_matrix->search($arguments);

		# Never remove dato from portal records (they can loose childrens)
		# Calculate all portal tipos for exclue to empty
		$ar_portal_tipos 		= RecordObj_ts::get_ar_terminoID_by_modelo_name($modelo_name='component_portal');
			#dump($ar_portal_tipos,'$ar_portal_tipos');	die("error temporal");

		# No borraremos los datos de algunos componentes ('component_av', 'component_image' , 'component_pdf',...)
		$ar_components_modelo_no_delete_dato = array( 'component_av', 'component_image' , 'component_pdf');


		switch($delete_mode) {

			case 'delete_data' :

					if(is_array($ar_childrens)) foreach($ar_childrens as $children_id) {
						if ($children_id>0) {

							$matrix_table 			= common::get_matrix_table_from_tipo($section_tipo);
							$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$children_id);
							$current_tipo 			= $RecordObj_matrix->get_tipo();
							$current_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($current_tipo);
							# If current tipo is not in array of portal tipos, and is not a component modelo not removable, set blank and save matrix record
								#if ( !in_array($current_tipo, $ar_portal_tipos) && !in_array($current_modelo_name, $ar_components_modelo_no_delete_dato) ) {
							# Experimentalmete, SI borraremos los vínculos de portales al borrar los datos de la sección ya que el funcionamiento de los portales 
							# ha cambiado varias veces. Revisar si hay alguna implicación no contemplada que desaconseje esto..
							if ( !in_array($current_modelo_name, $ar_components_modelo_no_delete_dato) ) {
								$RecordObj_matrix->set_dato(" ");
								$RecordObj_matrix->Save();

							}else{
								# Remove from deleted childrens array info
								unset($ar_childrens[$children_id]);
							}
						}#if ($children_id>0)
					}#foreach($ar_childrens)

					$logger_msg = "Deleted section and childrens data";

					break;


			case 'delete_record' :

					# Experimentalmete, SI borraremos los vínculos de portales al borrar los datos de la sección ya que el funcionamiento de los portales 
					# ha cambiado varias veces. Revisar si hay alguna implicación no contemplada que desaconseje esto..
					/*
					#  test current section contain portal
					$contain_portal = component_portal::contain_portal($id, $section_tipo);
					if ($contain_portal===true) {
						# Verify current portal have childrens
						$arguments=array();
						$arguments['parent']= $id;
						$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
						$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
						$ar_rows			= $RecordObj_matrix->search($arguments);

						foreach($ar_rows as $children_id) {
							$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
							$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$children_id);

							$children_tipo		= $RecordObj_matrix->get_tipo();
							if (in_array($children_tipo, $ar_portal_tipos)) {
								$dato = $RecordObj_matrix->get_dato();
								if (!empty($dato) && is_array($dato) && count($dato)>0) {
									$dato_string = to_string($dato);
									$msg = nl2br('Error: '. "
									The current record has portal info.
									Before deleting this record, you must remove these items ($dato_string).
									Nothing has been deleted ");
									error_log( "Del: $msg - dato:$dato_string");
									return $msg;
								}
							}
						}
					}
					#$ar_portal_references_to_section = component_portal::get_ar_portal_references_to_section( $id );	dump($ar_portal_references_to_section,'$ar_portal_references_to_section');
					*/

					# Add current id (section id) to final array for delete records
					$ar_delete[]	= $id;

					if(is_array($ar_childrens))
					$ar_delete 		= array_merge($ar_delete, $ar_childrens);

					foreach($ar_delete as $delete_id) {
						if ($delete_id>0) {
							$matrix_table 		= common::get_matrix_table_from_tipo($section_tipo);
							$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$delete_id);		#dump($delete_id,'delete_id',"to delete: delete_id for id:$id ");

							$RecordObj_matrix->MarkForDeletion();
								#error_log("MESSAGE: -> Deleted record matrix id: $delete_id (children of id:$id) ");
						}
					}

					# Portal
					# Delete possible references in component_portal
					component_portal::remove_references_to_id($id, $this->tipo);

					$logger_msg = "Deleted section and childrens records";

					# ¿¿¿ TIME MACHINE DELETE ?????

					break;
		}

		if (SHOW_DEBUG) {
			$var_ar_childrens = implode(',',$ar_childrens);
			$msg = "INFO: Deleted section $id and they childrens ($var_ar_childrens)  delete_Mode $delete_mode " ;
			error_log($msg);
		}

		$projects = filter::get_section_projects($this->id, $this->tipo, 0);
			#dump($projects, "projects for vars: id:$this->id, tipo:$this->tipo, parent:0"); #$projects = NULL;

		$top_tipo 	= $_SESSION['config4']['top_tipo'];
		$top_id 	= $_SESSION['config4']['top_id'];

		if( $top_tipo != $this->tipo ){
			$is_portal = true;
		}else{
			$is_portal 	= false;
			$top_id 	= $this->id;
			$top_tipo 	= $this->tipo;
		}

		# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
		logger::$obj['activity']->log_message(
			'DELETE',
			logger::INFO,
			$this->get_tipo(),
			$projects,
			#array("msg"=>$logger_msg)
			array(	"msg"			=> $logger_msg,
					"id"			=> $this->id,
					"tipo"			=> $this->tipo,
					"is_portal"		=> intval($is_portal),
					"top_id"		=> $top_id,
					"top_tipo"		=> $top_tipo,
					"table"			=> $matrix_table,
					"delete_mode"	=> $delete_mode
					)
		);

		# DEDALO_CACHE_MANAGER : get_ar_filter_cache
		if( DEDALO_CACHE_MANAGER ) {
			cache::del_contains( $this->tipo );
		}

		return TRUE;
	}


	/**
	* GET_SECTION_CACHE_KEY_NAME
	*/
	public function get_section_cache_key_name() {
		$pageNum='';
		if(isset($_REQUEST['pageNum'])) $pageNum = $_REQUEST['pageNum'];
		return DEDALO_DATABASE_CONN.'_section_get_html_'.$this->get_identificador_unico().'_'.$pageNum;
	}


	/**
	* GET_HTML
	*/
	public function get_html() {

		if(SHOW_DEBUG){
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_in_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		# Save current object in session var for calculate css later (Save obj in current state at this point)
		#css::save_obj_in_session($this)
		$modo = $this->modo;

		$content_html = '';

			#
			# DEDALO_CACHE_MANAGER : Read from cache if var exists ##			
			if(DEDALO_CACHE_MANAGER && CACHE_SECTIONS) {
				$cache_key_name = $this->get_section_cache_key_name();
				if (cache::exists($cache_key_name)) {
					#dump($cache_key_name,"COMPONENT SHOW FROM CACHE");
					#error_log("INFO: readed data from section cache key: $cache_key_name");
					return cache::get($cache_key_name);
				}
			}
			# /DEDALO_CACHE_MANAGER #################################


		# CALCULA Y CARGA TODOS SUS COMPONENTES GENERANDO EL CONTENIDO PARA INSERTAR EN EL WRAPPER DE LA SECCIÓN
		switch($modo) {

			case 'edit_inspector' :
						# Nothing to do
						break;
			case 'edit':
			case 'list':
			case 'list_tm':
			case 'portal_list':			
			case 'relation':
			case 'relation_reverse_sections':
			case 'relation_reverse':
						$generated_content_html = $this->generate_content_html($modo);
						#$this->ar_section_list_obj	= $this->generate_layout_list();
							#dump($this->ar_section_list_obj);
						break;

			default :	trigger_error("modo: $modo is not valid", E_USER_ERROR);
		}
			

		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. __CLASS__ .'/'. __CLASS__ .'.php' );
		$html =  ob_get_clean();
		

				#
				# DEDALO_CACHE_MANAGER : Set cache var #################
				if(DEDALO_CACHE_MANAGER && CACHE_SECTIONS) {
					#if(strpos($cache_key_name, 'list')!=false && strpos($cache_key_name, 'portal')===false) 
					cache::set($cache_key_name, $html);				
				}
				# /DEDALO_CACHE_MANAGER #################################


		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ' );
			global$TIMER;$TIMER[__METHOD__.'_out_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}	

		return $html;
	}


	/**
	*  GET_SECTION_REAL_TIPO
	*/
	public function get_section_real_tipo() {

		#if(SHOW_DEBUG) $start_time = start_time();

		#dump($this->section_real_tipo,'$this->section_real_tipo - '.$this->tipo);
		if(isset($this->section_real_tipo)) return $this->section_real_tipo;

		# RELACIONES (SECTION VIRTUAL)
		$relaciones = $this->RecordObj_ts->get_relaciones()[0];
			#dump($relaciones,'relaciones '.$this->tipo);
		if(!empty($relaciones)) {
			foreach ($relaciones as $key => $value) {
				$modelo 	= RecordObj_ts::get_termino_by_tipo($key);
				if($modelo=='section') {

					# Fix section_real_tipo
					$this->section_real_tipo = $value;
					$this->section_virtual 	 = true;

					#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [element '.get_called_class().']', $this->section_real_tipo);

					return $this->section_real_tipo;
				}
			}
		}

		
		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [element '.get_called_class().']', $this->section_real_tipo);
			#global$TIMER;$TIMER[__METHOD__.'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return false;
	}


	/**
	* GET AR ID RECORDS
	* Matrix authorized records to show
	*/
	protected function get_ar_id_records() {

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
			

		/**
		* CALLER_ID
		* Required for relation mode is used to add param to unique id (uid) and control cache use here
		* En el resto de modos tendrá valor NULL
		* Permitimos sobreescribir caller_id vía REQUEST si es necesario, pero normalmente se establece como propiedad del objeto al crearlo en modo 'relation'
		*/
		# Request override caller_id of current object
		if(!empty($_REQUEST['caller_id'])) $this->set_caller_id($_REQUEST['caller_id']);


		# STATIC CACHE
		$uid = $this->id.'_'.$this->tipo.'_'.$this->modo.'_'.$this->caller_id;		#dump($uid,'uid');		
		if (isset(static::$ar_id_records[$uid])) {
			if(SHOW_DEBUG) {
				#error_log("SECTION: Used static cache for uid: $uid");
			}
			# En casos de mas de una sección como por ejemplo en las relaciones inversas,
			# hay dos pasadas y la 2 no se ejecuta si está activa la caché..
			return static::$ar_id_records[$uid];
		}
		
			#
			# DEDALO_CACHE_MANAGER : Read from cache if var exists ##			
			if(DEDALO_CACHE_MANAGER && CACHE_AR_ID_RECORDS) {
				$cache_key_name = 'section_get_ar_id_records_'.$uid;
				if (cache::exists($cache_key_name)) {
					#dump($cache_key_name,"COMPONENT SHOW FROM CACHE");
					#error_log( "INFO: readed data from section cache key: $cache_key_name ". print_r(unserialize(cache::get($cache_key_name)),true) );

					$data_from_cache = unserialize(cache::get($cache_key_name));
					# Set static::$ar_id_records[$uid] !Important
					static::$ar_id_records[$uid] = $data_from_cache ;
					return $data_from_cache ;
				}
			}
			# /DEDALO_CACHE_MANAGER #################################


		$ar_id_records 				= array();
		$ar_id_records_from_filter 	= array();


		# FILTER TIPO
		$filter_tipo = $this->tipo;

		# SECTION VIRTUAL TEST . Overwrite filter_tipo with real value if is virtual
		$section_real_tipo = $this->get_section_real_tipo();
		if($section_real_tipo!=false) {
			$filter_tipo = $section_real_tipo;
		}
		#dump($section_real_tipo,'$section_real_tipo '.$filter_tipo);
		
		#
		# FILTRO
		#		
		#dump($this->modo, $this->tipo);
		# Filtramos la selección de datos que pueden aparecer en las listas
		# El filtro calcula los id de los registros que están autorizados para nuestro usuario
		# con el tipo dado (normalmente sección)
		if(SHOW_DEBUG) {
			#$TIMER[__METHOD__.'_GET_AR_FILTER_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		$ar_id_records_from_filter = filter::get_ar_filter($filter_tipo);	#<------------------------------------- SE APLICA EL FILTRO AQUÍ ----------------------------------------------
			#dump($ar_id_records_from_filter,'$ar_id_records_from_filter');		
		if(SHOW_DEBUG) {
			#$TIMER[__METHOD__.'_GET_AR_FILTER_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		# SWITCH MODO
		switch ($this->modo) {

			case 'list':
						/**
						* LIST AR ID RECORDS (LIST MODE)
						*/
						$ar_id_records = $ar_id_records_from_filter ;
							#dump($ar_id_records,'$ar_id_records');

							
							#
							# FILTRO DE PORTAL 
							# Si el listado es solicitado por un portal, se aplicará el filtro del portal al resultado para separar registros
							# en función de su origen de creación							
								#dump($_REQUEST['portal_section_tipo'], 'this', array());
							# Búsqueda con el concepto y valor definidos en ar_section_creator
							if(!empty($_REQUEST['portal_section_tipo']) && strpos($_REQUEST['portal_section_tipo'], 'dd')!==false) {

								$portal_tipo = $_REQUEST['t'];
								if (empty($_REQUEST['t'])) {
									if (SHOW_DEBUG) {
										throw new Exception("Error Processing Request. Portal tipo not found ($_REQUEST[t])", 1);										
									}
									return false;
								}

								$arguments=array();
								$arguments['dato:key-json']			= 'portal_tipo:'.$portal_tipo;
								$arguments['tipo']					= $section_real_tipo;							
								#$arguments['sql_cache']			= true;
								$matrix_table 						= common::get_matrix_table_from_tipo($filter_tipo);
								$RecordObj_matrix					= new RecordObj_matrix($matrix_table,NULL);
								$ar_id_search		 				= $RecordObj_matrix->search($arguments);
									#dump($ar_id_search, 'ar_id_search '. print_r($arguments,true));
								$ar_id_records = array_intersect($ar_id_search, $ar_id_records);
									#dump($ar_id_records, 'ar_id_records', array());

								error_log("INFO ".__METHOD__." filtrados resultados por portal en section list");
							}							




							#
							# SECCION VIRTUAL : Case section virtual
							# Si estamos en una sección virtual, se habrá establecido un filtro en propiedades, de tipo: {"filtered_by":{"dd1110":"1000"}}
							# Lo calculamos y lo cotejamos con los registros permitidos del filtro
							if($this->section_virtual==true) {

								$propiedades = $this->get_propiedades();
									#dump($propiedades->filtered_by,'$propiedades');

								$ar_id_search_final=array();
								if (!empty($propiedades->filtered_by)) {
										#dump($propiedades->filtered_by,'$propiedades->filtered_by');
									foreach ($propiedades->filtered_by as $key => $value) {

										$component_search_tipo 	= $key;

										

										if (is_array($value)){

											$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($component_search_tipo);
											switch (true) {
												case ($modelo_name == "component_check_box"):
													$new_ar_value = array();
													foreach ($value as $key => $value) {
														$new_ar_value[] = $value.'":"2';
													}
													$component_ar_search_value = $new_ar_value;
													break;
												
												default:
													$component_ar_search_value = $value;
													break;
											}
										}else{
											$component_ar_search_value = array($value);
										}

										#dump($component_ar_search_value,'$component_ar_search_value');
										

										# Búsqueda con el concepto y valor definidos en propiedades
										$arguments=array();
										$arguments['strPrimaryKeyName']		= 'parent';
										$arguments['tipo']					= $component_search_tipo;
										$arguments['dato:json_or']			= $component_ar_search_value;
										#$arguments['sql_limit']			= $_SESSION['config4']['max_rows'];
										$arguments['sql_cache']				= true;
										$matrix_table 						= common::get_matrix_table_from_tipo($filter_tipo);
										$RecordObj_matrix					= new RecordObj_matrix($matrix_table,NULL);
										$ar_id_search		 				= $RecordObj_matrix->search($arguments);
											#dump($this->ar_id_section,'$this->ar_id_section');dump($ar_id_search,'$ar_id_search BEFORE ', dump($arguments));
											#dump(count($ar_id_search),'count $ar_id_search');

										$ar_id_search_final[$key] = $ar_id_search;
									}									


									foreach ($ar_id_search_final as $ar_value) {
										if(!empty($result)) {
											$result = array_intersect($result, $ar_value);
										}else{
											$result = $ar_value;
										}
									}
									#dump($result,'$result');
									$ar_id_search_result = $result;
									
									/*
									# Recorremos los resultados eliminando los que no aparezcan en el filtro
									foreach ($ar_id_search_result as $key => $current_id_search) {
										if (!in_array($current_id_search, $ar_id_records)) {
											unset($ar_id_search[$key]);
										}
									}
									*/
									$result_filtered = array_intersect($ar_id_search_result, $ar_id_records);

									$ar_id_records = $result_filtered;

								}#end if (!empty($propiedades->filtered_by)) {
							}#end if(isset($section_virtual) && $section_virtual==true) : SECCION VIRTUAL

						break;

			case 'portal_edit NOT USED!':

						/**
						* LIST AR ID RECORDS (EDIT MODE)
						*/
						# Verify caller_id (component_relation id_matrix) exists. Is mandatory
						if(empty($this->caller_id)) {
							throw new Exception("Error Processing Request. Please define caller_id to continue", 1);
						}
						#dump($this->caller_id, '$this->caller_id');

						break;

			case 'portal_list': # El comportamiento es idéntico a relation.						
			case 'relation':

						/**
						* GET CUSTOM AR ID RECORDS (RELATION MODE)
						* Tenemos section tipo . Despejamos el dato del campo relation y devolvemos el array de registros
						* relacionados con esta sección
						*/
						# Verify caller_id (component_relation id_matrix) exists. Is mandatory
						if(empty($this->caller_id)) {
							# Esto era necesario. Ahora lo es ??? .Desactivo hasta verificación.
							#throw new Exception("Error Processing Request. Please define caller_id to continue", 1);
						}
						#dump($this->caller_id, '$this->caller_id');

						# CONFIGURE SECTION COMPONENT
						# Antes de llamar a section desde el controlador de commponent_relation, configurar section
						# pasándole los datos previamente extraidos de 'commponent_relation'
						# Es importante calcular los datos en el propio componente para poder variarlos en función del modo (Time machine por ejemplo)
						if (isset($this->ar_section_relations_for_current_tipo_section)) {
							$ar_section_relations_for_current_tipo_section = $this->ar_section_relations_for_current_tipo_section ;
								#dump($ar_section_relations_for_current_tipo_section,'$ar_section_relations_for_current_tipo_section');
						}
						if (empty($ar_section_relations_for_current_tipo_section)) {
							#error_log("No data found in relation component " . __METHOD__ ) ;
							return NULL;
						}

						# Almacenamos el array de etiquetas de esta sección para usarlo en el listado de relaciones en la clase 'row'
						$this->ar_section_relations = $ar_section_relations_for_current_tipo_section;
							#dump($this->ar_section_relations,'$this->ar_section_relations');

						# Del array obtenido, eliminamos el segundo nivel (los rel_locator) que ahora no interesa y nos quedamos con el key (section id)
						$ar_id_records = array();
						if (is_array($ar_section_relations_for_current_tipo_section)) foreach ($ar_section_relations_for_current_tipo_section as $section_id => $value) {
							$ar_id_records[] = $section_id;
						}
						#dump($ar_id_records,'ar_id_records');

						# Comparamos los registros obtenidos con los del filtro, que son los autorizados para este usuario
						# Si se encuentran dentro del filtro, los validamos
						$ar_id_records_final = array();
						if (is_array($ar_id_records_from_filter)) {

							foreach ($ar_id_records as $current_record_id) {
								if (in_array($current_record_id, $ar_id_records_from_filter)) {
									# Lo incluimos en el array final
									$ar_id_records_final[] = $current_record_id;
								}
							}
							# Volvemos a establecer el valor de $ar_id_records con el resultado final de los valores relacionados y admitidos para este usuario
							$ar_id_records = $ar_id_records_final;
						}
						#dump($ar_id_records,'$ar_id_records');
						break;

			case 'relation_reverse_sections':
			case 'relation_reverse':

						/**
						* GET CUSTOM AR ID RECORDS (RELATION FROM TAG MODE)
						* Previamente establecemos el array de registros con los section id matrix a mostrar
						* aquí sólo los cotejaremos con los autorizados para evitar accesos no autorizados
						* @param $this->ar_id_section_custom
						*/
						# Verify caller_id (component_relation id_matrix) is received
						#dump($ar_id_section_custom,'ar_id_section_custom');
						if(empty($this->ar_id_section_custom) || !is_array($this->ar_id_section_custom))
							throw new Exception("Error Processing Request. ar_id_section_custom is empty!", 1);

						$ar_id_records = $this->ar_id_section_custom;

						# Comparamos los registros obtenidos con los del filtro que son los autorizados para este usuario
						# Si se encuentran dentro del filtro, los validamos
						if (is_array($ar_id_records_from_filter)) {
							$ar_id_records_final = array();
							foreach ($ar_id_records as $current_record_id) {
								if (in_array($current_record_id, $ar_id_records_from_filter)) {
									$ar_id_records_final[] = $current_record_id;
								}
							}
							$ar_id_records = $ar_id_records_final;
						}
						#dump($ar_id_records,'$ar_id_records');
						break;
			/*
			case 'portal_list__DES_(ES IDÉNTICA A RELATION)':
						
						##
						# GET CUSTOM AR ID RECORDS (RELATION MODE)
						# Tenemos section tipo . Despejamos el dato del campo relation y devolvemos el array de registros
						# relacionados con esta sección
						#
						# Verify caller_id (component_relation id_matrix) exists. Is mandatory
						if(empty($this->caller_id)) {
							throw new Exception("Error Processing Request. Please define caller_id to continue", 1);
						}
						#dump($this->caller_id, '$this->caller_id');

						# CONFIGURE SECTION COMPONENT
						# Antes de llamar a section desde el controlador de commponent_relation, configurar section
						# pasándole los datos previamente extraidos de 'commponent_relation'
						# Es importante calcular los datos en el propio componente para poder variarlos en función del modo (Time machine por ejemplo)
						if (isset($this->ar_section_relations_for_current_tipo_section)) {
							$ar_section_relations_for_current_tipo_section = $this->ar_section_relations_for_current_tipo_section ;
								#dump($ar_section_relations_for_current_tipo_section,'$ar_section_relations_for_current_tipo_section');
						}
						if (empty($ar_section_relations_for_current_tipo_section)) {
							#error_log("No data found in relation component " . __METHOD__ ) ;
							dump("","NO AR_SECTION_RELATIONS_FOR_CURRENT_TIPO_SECTION FOUND!");
							return NULL;
						}

						# Almacenamos el array de etiquetas de esta sección para usarlo en el listado de relaciones en la clase 'row'
						$this->ar_section_relations = $ar_section_relations_for_current_tipo_section;
							#dump($this->ar_section_relations,'$this->ar_section_relations');

						# Del array obtenido, eliminamos el segundo nivel (los rel_locator) que ahora no interesa y nos quedamos con el key (section id)
						$ar_id_records = array();
						if (is_array($ar_section_relations_for_current_tipo_section)) foreach ($ar_section_relations_for_current_tipo_section as $section_id => $value) {
							$ar_id_records[] = $section_id;
						}
						#dump($ar_id_records,'ar_id_records');

						# Comparamos los registros obtenidos con los del filtro, que son los autorizados para este usuario
						# Si se encuentran dentro del filtro, los validamos
						$ar_id_records_final = array();
						if (is_array($ar_id_records_from_filter)) {

							foreach ($ar_id_records as $current_record_id) {
								if (in_array($current_record_id, $ar_id_records_from_filter)) {
									# Lo incluimos en el array final
									$ar_id_records_final[] = $current_record_id;
								}
							}
							# Volvemos a establecer el valor de $ar_id_records con el resultado final de los valores relacionados y admitidos para este usuario
							$ar_id_records = $ar_id_records_final;
						}
						#dump($ar_id_records,'AR_ID_RECORDS en portal_list ++1');
						break;
			*/
			case 'list_tm':

						/**
						* GET CUSTOM AR ID RECORDS (TIME MACHINE)
						* Previamente establecemos el array de registros con los section id matrix a mostrar
						* aquí sólo los cotejaremos con los autorizados para evitar accesos no autorizados
						* @param $this->ar_id_section_custom
						*/
						# Verify caller_id (component_relation id_matrix) is received
						#dump($ar_id_section_custom,'ar_id_section_custom');
						if(empty($this->ar_id_section_custom) || !is_array($this->ar_id_section_custom))
							#throw new Exception("Error Processing Request. ar_id_section_custom for list_tm is empty!", 1);
							return NULL;


						# Formateamos el array para adecuarlo a lo esperado en ar_id_records (el recibido es de tipo $key (id time machine) => $value (id matrix))
						# por lo que ignoramos el key y guardamos el valor
						#$ar_id_records = $this->ar_id_section_custom;
						foreach ($this->ar_id_section_custom as $id_tm => $id_matrix) {
							$ar_id_records[] = $id_matrix;
						}


						# Comparamos los registros obtenidos con los del filtro que son los autorizados para este usuario
						# Si se encuentran dentro del filtro, los validamos
						/* POR EL MOMENTO, OBVIAMOS ESTA COMPROBACIÓN DE SEGURIDAD. QUIZÁ ESTABLECER EL REQUERIMIENTO DE SER ADMIN PARA USAR EL ICONO TIME MACHINE..
						if (is_array($ar_id_records_from_filter)) {
							$ar_id_records_final = array();
							foreach ($ar_id_records as $current_record_id) {
								if (in_array($current_record_id, $ar_id_records_from_filter)) {
									$ar_id_records_final[] = $current_record_id;
								}
							}
							$ar_id_records = $ar_id_records_final;
						}
						*/
						#dump($ar_id_records,'$ar_id_records');
						break;

			case 'edit':

						/**
						* LIST AR ID RECORDS (EDIT MODE)
						*/
						# Comparamos el registro solicitado con los del filtro que son los autorizados para este usuario
						# Si se encuentra dentro del filtro, los validamos
						$current_record_id = $this->get_id();
						if (isset($ar_id_records_from_filter) && is_array($ar_id_records_from_filter) && in_array($current_record_id, $ar_id_records_from_filter)) {
							$ar_id_records_final[] 	= $current_record_id;
						}else{
							$ar_id_records_final 	= NULL;
						}
						$ar_id_records = $ar_id_records_final;

						break;


			default:
				trigger_error("modo: $modo is not valid", E_USER_ERROR);
		}


		#dump($ar_id_records,"AR_ID_RECORDS from caller $this->caller_id - modo:$this->modo ++2");

		# CACHE
		static::$ar_id_records[$uid] = $ar_id_records;

			#
			# DEDALO_CACHE_MANAGER : Read from cache if var exists ##			
			if(DEDALO_CACHE_MANAGER && CACHE_AR_ID_RECORDS) {				
				#error_log("INFO: write data from ar_id_records");
				#if( strpos($this->tipo, 'edit')!==false )
				cache::set($cache_key_name,serialize($ar_id_records));					
			}
			# /DEDALO_CACHE_MANAGER #################################
		

		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, "Total registros[$uid]: ".count($ar_id_records) );
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}


		return $ar_id_records;
	}







	/**
	* GENERATE CONTENT HTML
	* @param $modo
	*	String 'modo'
	*
	* @return $html
	*	String full resolved html content
	*
	* @see self::get_ar_id_records, layout_map::component_layout
	*/
	protected function generate_content_html($modo) {

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}

		#
		# FILTER
		# Verify current section id is authorized (is in filter array) for current logged user
		$ar_id_records 		= $this->get_ar_id_records();
		if (empty($ar_id_records)) {
			#return NULL;
			#throw new Exception("This content is not authorized for you or not exists! (1b) ", 1);
		}
		#dump($ar_id_records,'$ar_id_records ----'." $modo");

		# Filter is benchmark appart
		if(SHOW_DEBUG) {
			$start_time = start_time();
		}

#if($modo=='search')
#dump($modo,'modo search tipo:'.$this->tipo.' this-modo:'.$this->modo);
		#
		# CONTENT
		# Contenido html del listado / grupo.
		$html 								= '';
		$ar_components_verify_duplicates	= array();
		$ar_section_groups_resolved 		= array();
		switch ($modo) {

			case 'search':	# Same as edit
			case 'edit':

					# vars for layout
					$current_section_obj  = $this;
					$ar_exclude_elements  = array();

					# SECTION VIRTUAL CASE
					if ($this->section_virtual==true ) {
						# Clone current  section obj
						$current_section_obj  = clone $this;
						# Inject real tipo to section object clone sended to layout when mode is edit
						$current_section_obj->tipo = $this->section_real_tipo;

						# Exclude elements of layout edit.
						# Localizamos el elemento de tipo 'exclude_elements' que será hijo de la sección actual
						$exclude_elements_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo, 'exclude_elements')[0];
						#if(isset($exclude_elements_tipo[0])) $exclude_elements_tipo = $exclude_elements_tipo[0];
							#dump($exclude_elements_tipo,'$exclude_elements_tipo');

						if (!empty($exclude_elements_tipo)) {
							# Localizamos los elementos a excluir que son los términos relacionados con este elemento ('exclude_elements')
							$ar_related = RecordObj_ts::get_ar_terminos_relacionados($exclude_elements_tipo, $cache=false, $simple=true);
								#dump($ar_related,'$ar_related');
							# Los recorremos y almacenams tanto los directos como los posibles hijos (recuerda que se pueden excluir section groups completos)
							foreach ($ar_related as $current_excude_tipo) {
								# Exclusión directa
								$ar_exclude_elements[] = $current_excude_tipo;

								# Comprobamos si es un section group, y si lo es, excluimos además sus hijos
								$ar_children = RecordObj_ts::get_ar_childrens($current_excude_tipo);
								foreach ($ar_children as $current_children) {
									$ar_exclude_elements[] = $current_children;
								}
							}
						}
						#dump($ar_exclude_elements,'ar_exclude_elements '.$this->tipo);
					}
					#
					# LAYOUT MAP : PENDIENTE UNIFICAR MAQUETACIÓN CON LAYOUT MAP A PARTIR DEL MODO EDIT <------
					# Consulta el listado de componentes a mostrar en el listado / grupo actual
					$component_layout 	= new component_layout();
					$layout_map 		= $component_layout->get_layout_map( $current_section_obj );

					# WALK : Al ejecutar el walk sobre el layout map podemos excluir del rendeo de html los elementos (section_group, componente, etc.) requeridos (virtual section)
					if(SHOW_DEBUG) {
						global$TIMER;$TIMER['component_layout->walk_layout_map'.'_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
					}
					$ar = array();
					$html = $component_layout->walk_layout_map($layout_map, $ar, $ar_exclude_elements);
						#dump($html,'$layout_map');
					if(SHOW_DEBUG) {
						global$TIMER;$TIMER['component_layout->walk_layout_map'.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
					}

					break;

			case 'list':
			case 'list_tm':
			case 'portal_list':
			case 'relation':
			case 'relation_reverse_sections':
			case 'relation_reverse':			
				/**/
					#
					# LAYOUT MAP : PENDIENTE UNIFICAR MAQUETACIÓN CON LAYOUT MAP A PARTIR DEL MODO EDIT <------
					# Consulta el listado de componentes a mostrar en el listado / grupo actual
					$component_layout 	= new component_layout();
					$layout_map 		= $component_layout->get_layout_map( $this );
						#dump($layout_map, 'layout_map', array());

					if (empty($layout_map)) {
						#dump($this);
						$label = $this->get_label();
						throw new Exception("layout_map is not defined! [$modo on $label] ", 1);
					}

					# AR_ID_RECORDS : Calculamos los registros existentes autorizados de esta sección
					$total_ar_id_records = (array)$this->get_ar_id_records();

					# Iterate all relation list as section_list (normally one element)
					foreach ($layout_map as $tipo_section_list => $ar_tipo_component) {
							#dump($ar_tipo_component,'ar_tipo_component '.$modo. " $tipo_section_list");
						$section_list = new section_list($tipo_section_list, $this, $ar_tipo_component, $modo, $total_ar_id_records);	#__construct($tipo, relation $section_obj)
							#dump($section_list,'section_list',"relation list tipo $tipo_section_list ");
						$html .= $section_list->get_html();
							#dump($tipo_section_list,'$tipo_section_list',"");
					}
				
					#$html ="SECTION LIST HTML XXX";
					#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time_section_relation, __METHOD__. ' [SECTION RELATION]', 'html' );
					break;

			default:
					trigger_error("modo: $modo is not valid for section use", E_USER_ERROR);
		}

		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [FULL NOT INCLUDED FILTER]', "html($this->tipo)" );
			global$TIMER;$TIMER[__METHOD__.'_out_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}




















	/**
	* GET CHILDRENS OBJS BY MODELO NAME
	*
	* @param $modelo_name_required
	*	Name of desired filtered model. You can use partial name like 'component_' (string position search is made it)
	* @see class.section.php -> get_ar_authorized_areas_for_user
	* @return $ar_section_obj
	*	Array of objects (usually components) filtered by modelo_name_required with parent = current section id matrix
	*/
	public function get_ar_children_objects_by_modelo_name_in_section($modelo_name_required, $resolve_virtual=false) {

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$modelo_name_required.'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		$parent 		= intval($this->get_id());
		$tipo 			= $this->get_tipo();


			# RESOLVE_VIRTUAL : Resolve virtual section to real
			if($resolve_virtual) {

				# ORIGINAL TIPO : allways keeps the original type (current)
				$original_tipo = $tipo;

				# SECTION VIRTUAL
				$section_real_tipo = $this->get_section_real_tipo();
				if($section_real_tipo!=false) {

					# OVERWRITE CURRENT SECTION TIPO WITH REAL SECTION TIPO
					$tipo = $section_real_tipo;
				}
				#dump($tipo,'section tipo');

				# EXCLUDE ELEMENTS
				$tipo_exclude_elements 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($original_tipo, $modelo_name='exclude_elements', $relation_type='children')[0];

				$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($tipo_exclude_elements, $cache=false, $simple=true);

					$real_section = new section(null,$section_real_tipo);

					/**/
					# LAYOUT MAP : PENDIENTE UNIFICAR MAQUETACIÓN CON LAYOUT MAP A PARTIR DEL MODO EDIT <------
					# Consulta el listado de componentes a mostrar en el listado / grupo actual
					$component_layout 	= new component_layout();
					$layout_map 		= $component_layout->get_layout_map( $real_section );
						dump($layout_map,'layout_map');

						$html = $component_layout->walk_layout_map($layout_map, $ar, $ar_exclude_elements);


				#$ar_exclude_elements 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo_exclude_elements, $modelo_name=array('section_group','component_'), $relation_type='termino_relacionado');
					#dump($tipo_exclude_elements,'tipo_exclude_elements');
					dump($ar_terminos_relacionados,'ar_terminos_relacionados');
			}


		# STATIC CACHE
		$uid = $parent .'_'. $tipo .'_'. $modelo_name_required;
		static $ar_children_objects_by_modelo_name_in_section;
		if(isset($ar_children_objects_by_modelo_name_in_section[$uid])) {
			#error_log("get_ar_children_objects_by_modelo_name_in_section: getting data from cache: $uid , modelo_name_required:$modelo_name_required");
			if(SHOW_DEBUG) {				
				global$TIMER;$TIMER[__METHOD__.'_OUT_STATIC_'.$modelo_name_required.'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
			}
			return $ar_children_objects_by_modelo_name_in_section[$uid];
		}

		#if(SHOW_DEBUG) $start_time = start_time();

		$ar_section_obj = array();


		# OBTENEMOS LOS ELEMENTOS HIJOS DE ESTA SECCIÓN	
		#$RecordObj_ts			= new RecordObj_ts($tipo);
		#$ar_recursive_childrens = (array)$RecordObj_ts->get_ar_recursive_childrens_of_this($tipo);
		$ar_recursive_childrens = (array)self::get_ar_recursive_childrens($tipo);
			#dump($ar_recursive_childrens, 'ar_recursive_childrens', array());			
		
			#if($modelo_name_required='component_filter')
			#dump($ar_recursive_childrens,'ar_recursive_childrens');

		if( empty($ar_recursive_childrens) ) {
			#throw new Exception(__METHOD__." ar_recursive_childrens is empty! This section don't have: '$modelo_name_required' ");
			#error_log("MESSAGE: ar_recursive_childrens is empty! This section id=$parent don't have: '$modelo_name_required' (tipo:$tipo) 384 ". __METHOD__ );
			return NULL	;
		}

		# Recorremos los elementos hijos de la sección actual en el tesauro
		$ar_section_obj = array();

		foreach($ar_recursive_childrens as $terminoID) {

			# Clear obj on every iteration
			$current_obj 		= null;
			$modelo_name		= RecordObj_ts::get_modelo_name_by_tipo($terminoID);


			# Filtramos para cargar sólo los del modelo deseado
			if( strpos($modelo_name, $modelo_name_required)===false ) continue; # Skip


			# Construimos el objeto (en función del tipo deseado se construye de forma distinta: component, button, etc..)
			switch(true) {

				# Build button obj
				case (strpos($modelo_name, 'button_')!==false) :

							$current_obj = new $modelo_name($terminoID, $target=$parent);
							$current_obj->set_context_tipo($tipo);
							break;

				# Build component obj
				case (strpos($modelo_name, 'component_')!==false) :

							$current_obj = new $modelo_name($current_id=NULL, $terminoID, 'edit', $parent); #$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG
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

		 
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__,' - modelo_name_required:'.$modelo_name_required ." - ar_section_obj count:". count($ar_section_obj) );
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$modelo_name_required.'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $ar_section_obj;
	}

	/**
	* GET_AR_RECURSIVE_CHILDRENS : private alias of RecordObj_ts::get_ar_recursive_childrens
	* Experimental
	*/
	private static function get_ar_recursive_childrens($tipo) {		
		$RecordObj_ts			= new RecordObj_ts($tipo);
		$ar_recursive_childrens = (array)$RecordObj_ts->get_ar_recursive_childrens_of_this($tipo);
		#$ar_recursive_childrens = (array)RecordObj_ts::get_ar_recursive_childrens($tipo);
		return $ar_recursive_childrens;
	}

	/**
	* GET_SECTION_AR_CHILDREN_TIPO
	* @param $ar_modelo_name_required
	*	Name of desired filtered model array. You can use partial name like 'component_' (string position search is made it)
	*/
	public static function get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required) {

		# cast 'ar_modelo_name_required' to array
		$ar_modelo_name_required = (array)$ar_modelo_name_required;

		if(SHOW_DEBUG) {
			$start_time = start_time();
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$section_tipo.'_in_'.microtime(1)]=microtime(1);
		}

		$tipo 						= $section_tipo;
		$section_ar_children_tipo 	= array();


		# OBTENEMOS LOS ELEMENTOS HIJOS DE ESTA SECCIÓN	
		if($ar_modelo_name_required[0]=='section_list') {
			# En los casos en que buscamos modelos 'section_list' no buscaremos recusivamente para posibilitar el anidamiento de secciones
			# como el caso de 'Elementos y procesos' en PCI
			$RecordObj_ts			= new RecordObj_ts($tipo);
			$ar_recursive_childrens = (array)$RecordObj_ts->get_ar_childrens_of_this();
			#$ar_recursive_childrens = RecordObj_ts::get_ar_childrens($tipo);
		}else{
			#$RecordObj_ts			= new RecordObj_ts($tipo);
			#$ar_recursive_childrens = (array)$RecordObj_ts->get_ar_recursive_childrens_of_this($tipo);
			$ar_recursive_childrens = (array)self::get_ar_recursive_childrens($tipo);
				#dump($ar_recursive_childrens, 'ar_recursive_childrens', array('tipo'=>$tipo));
		}


		if( empty($ar_recursive_childrens) ) {
			#throw new Exception(__METHOD__." ar_recursive_childrens is empty! This section don't have: '$modelo_name_required' ");
			#error_log("MESSAGE: ar_recursive_childrens is empty! This section id=$parent don't have: '$modelo_name_required' ". __METHOD__ );
			return $section_ar_children_tipo; # return empty array
		}

		# Recorremos los elementos hijos de la sección actual en el tesauro
		if( is_array ($ar_recursive_childrens)) foreach($ar_recursive_childrens as $current_terminoID) {

			$RecordObj_ts		= new RecordObj_ts($current_terminoID);
			$modeloID			= $RecordObj_ts->get_modelo();
			$modelo_name		= $RecordObj_ts->get_modelo_name();

			foreach($ar_modelo_name_required as $modelo_name_required) {

				if (strpos($modelo_name, $modelo_name_required)!==false) {
					$section_ar_children_tipo[] = $current_terminoID;
				}

				# COMPONENT_FILTER : Si buscamos 'component_filter', sólo devolveremos el primero, dado que pueden haber secciones anidadas
				if($ar_modelo_name_required[0]=='component_filter' && count($ar_recursive_childrens)>1) {
					if(SHOW_DEBUG) {
						error_log("NOTICE: Breaked loop for search 'component_filter' in section ".count($ar_recursive_childrens));
					}
					break;
				}
			}
		}
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, $section_ar_children_tipo);
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$section_tipo.'_'.microtime(1)]=microtime(1);
		}
		#dump($section_ar_children_tipo,'section_ar_children_tipo',"array of tipos:'$modelo_name' childrens of this section tipo={$tipo} ");
		
		return $section_ar_children_tipo;
	}

	


	/**
	* SET_AR_BUTTONS
	* Calcula los bonones de esta sección y los deja disponibles como : $this->ar_buttons
	* @see section_list.php modo:list 
	*/
	public function set_ar_buttons() {

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}	
		#$ar_buttons = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo, 'button_');
		$ar_buttons = $this->get_ar_children_objects_by_modelo_name_in_section('button_',false);
		foreach ($ar_buttons as $current_button) {
			$current_modelo_name = get_class($current_button);
				#dump($current_modelo_name,'$current_modelo_name');
			$this->ar_buttons[$current_modelo_name][] = $current_button;
		}
		#dump($this->ar_buttons,'$this->ar_buttons');

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
	}



	/**
	* GET SECTION ID
	* Section id está en el dato (registro matrix) de la sección estructurado en json
	* tal que: {"section_id":"2"..}
	*/
	public function get_section_id() {
		$dato = $this->get_dato();
		if( isset($dato['section_id']) )  return $dato['section_id'];
		return false;
	}

	public function get_created_date() {
		$dato = $this->get_dato();
		if( !isset($dato['created_date']) ) return false;

		$valor_local = component_date::timestamp_to_date($dato['created_date'], $full=true);

		return $valor_local;
	}

	public function get_created_by_userID() {
		$dato = $this->get_dato();
		if( isset($dato['created_by_userID']) )  return $dato['created_by_userID'];
		return false;
	}

	public function get_created_by_user() {
		$userID_matrix = $this->get_created_by_userID();
		if( !$userID_matrix ) return false;

		$component_input_text = new component_input_text(NULL, DEDALO_USER_NAME, 'edit', $userID_matrix, DEDALO_DATA_LANG);	#$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
		$user_name = $component_input_text->get_valor();
		return $user_name;
	}

	public function get_ar_section_creator() {
		$dato = $this->get_dato();
		if( isset($dato['ar_section_creator']) )  return $dato['ar_section_creator'];
	}

	/**
	* GET DATO
	*/
	protected function get_dato() {

		#dump($this,'pre load_matrix_data');
		parent::load_matrix_data();

		$dato = parent::get_dato();
		#dump($this,'post load_matrix_data');

		return $dato;
	}



	


	/**
	* GET_AR_ALL_PROJECT_LANGS
	* @see common::get_ar_all_langs (for all global langs of all projects)
	* @return array (like lg-spa,lg-eng,...)
	* If not result (component_filter) are found in section, return a default array with DEDALO_PROJECTS_DEFAULT_LANGS
	*/
	public function get_ar_all_project_langs() {

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		$ar_all_project_langs_final = array();

		$section_id 	= $this->get_id();
		$section_tipo 	= $this->get_tipo();

		static $ar_all_project_langs;
		if(isset($ar_all_project_langs[$section_id])) return $ar_all_project_langs[$section_id];
			#dump($this); return null;

		switch (true) {

			case ($section_tipo==DEDALO_SECTION_PROJECTS_TIPO):

				# Get langs from component_project_langs
				#$ar_children_objects_by_modelo_name	= $this->get_ar_children_objects_by_modelo_name_in_section('component_project_langs');
				#$ar_all_project_langs_final 			= $ar_children_objects_by_modelo_name[0]->get_dato();
				
				$ar_children_tipo_by_modelo_name	= section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_project_langs');
				$component_project_langs 			= new component_project_langs(NULL,$ar_children_tipo_by_modelo_name[0],'edit',$section_id,DEDALO_DATA_NOLAN);	#$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG
				$ar_all_project_langs_final 		= $component_project_langs->get_dato();
					#dump($ar_all_project_langs_final,'ar_all_project_langs_final 1');
				break;

			default:

				# We locate 'component_filter' in current section to obtain all projects
				$ar_component_filter	= $this->get_ar_children_objects_by_modelo_name_in_section('component_filter');
				#$ar_component_filter	= section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_filter');
					#dump($ar_component_filter,'ar_component_filter');

				# No component_filter is located in current section
				if(count($ar_component_filter)!=1) {
					$msg = "Warning: number of 'component_filter' invalid. Number founded: ".count($ar_component_filter)." in section $section_id - $section_tipo (necessary for get_ar_all_project_langs)";
					#trigger_error($msg);
					#throw new Exception($msg, 1);

					# Return a default data lang value when no 'component_filter' is provided
					return unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
				}

				# component_filter is properly defined in structure of current section
				$component_filter_obj = $ar_component_filter[0];
				#$component_filter_obj->set_modo('list');


				$filter_dato = $component_filter_obj->get_dato();
					#dump($component_filter_obj,'$filter_dato');

				# No projects are selected
				if (empty($filter_dato) || !is_array($filter_dato) ) {

					$dato = $this->get_dato();
					$section_id = $dato['section_id'];
					$msg = "Warning: No Project selected. Please select at least one in record $section_id ";
					if(SHOW_DEBUG) $msg .= "[$this->id]";
					#trigger_error($msg);
					#throw new Exception($msg , 1);
						#dump(DEDALO_PROJECTS_DEFAULT_LANGS);


					# Return a default data lang value when no 'component_filter' is provided
					return unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
				}

				# Iterate all section projects to add their langs to the array
				if (is_array($filter_dato)) foreach ($filter_dato as $id_project => $state) {
					# ignore state (is info about checkbox state. Only state '2' is used here)

					if(intval($id_project)<1) continue;

					# Section
					$section_project_tipo 		= common::get_tipo_by_id($id_project, 'matrix');
					$section_project			= new section($id_project, $section_project_tipo);
						#dump($section_project,'section_project');
					$ar_component_project_lang 	= $section_project->get_ar_children_objects_by_modelo_name_in_section('component_project_lang');
						#dump($ar_component_project_lang,'ar_component_project_lang');
					if (!empty($ar_component_project_lang[0])) {
						$dato = $ar_component_project_lang[0]->get_dato();
							#dump($dato,'dato');
						if (is_array($dato)) foreach ($dato as $key => $dato_lang) {
							if (!in_array($dato_lang, $ar_all_project_langs_final)) $ar_all_project_langs_final[] = $dato_lang;
						}
					}
				}
				break;
		}
		#dump($ar_all_project_langs_final,'$ar_all_project_langs_final '.$section_tipo);

		# Static cache
		$ar_all_project_langs[$section_id] = $ar_all_project_langs_final;


		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $ar_all_project_langs_final;
	}


	
















	# GET PROJECTS BY SECTION
	private function get_ar_projects_by_section() {

		# "NO ESTA ACABADO.. !";
		die("Stopped secuence get_ar_projects_by_section");

		# Obtenemos los hijos de esta seccion
		$section	 	= self::get_tipo();
		$modelo_name	= 'filter_';

		# Obtenemos el filtro (terminoID)
		$filtroID		= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo=$section , $modelo_name, $relation_type='children'); 				#dump($filtroID);

		# Obtenemos su filtro relacionado
		$filtroID_rel	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo=$filtroID, $modelo_name, $relation_type='termino_relacionado'); 		#dump($filtroID_rel);

		# Buscamos el termino relacionado con el filtro encontrado
		$filtroID_rel2	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($tipo=$filtroID_rel, $modelo_name, $relation_type='termino_relacionado');	#dump($filtroID_rel2);

		/*
		# los recorremos para filtrar por modelo
		if(is_array($ar_childrens)) foreach($ar_childrens as $terminoID) {

			$RecordObj_ts	= new RecordObj_ts($terminoID);
			$modelo			= $RecordObj_ts->get_modelo();
			$modelo_name	= $RecordObj_ts->get_termino_by_tipo($modelo);	#dump($modelo_name);

			if(strpos($modelo_name,'filter_') !== false) {
				$filter_tipo = $terminoID;
				break;
			}
		}
		if(empty($filter_tipo)) return false;
		*/



		# del filtro, sacamos los términos relacionados
		#$ar_terminos_relacionados = RecordObj_ts::get_ar_terminos_relacionados($filter_tipo, $cache=true, $simple=true);		dump($ar_terminos_relacionados);
	}




}
?>
