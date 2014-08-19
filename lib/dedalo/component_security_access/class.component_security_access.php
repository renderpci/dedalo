<?php
/*
* CLASS COMPONENT SECURITY ACCESS
*/


class component_security_access extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	protected $caller_id;
	
	
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
		

		parent::__construct($id, $tipo, $modo, $parent, $lang=$this->lang);

		# caller_id from parent var (default)
		if(!empty($parent)) {
			$this->caller_id = $parent;			
		}
		#dump($id,'id');	#throw new Exception("component_security_access Request", 1);
		# caller_id is set in main to this obj from request 'caller_id' (is id section parent of current component)
	}

	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set allways lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {


		# para llevar al componente hay que cambiar el modo en que se gestiona el tipo, ya que el tipo recibido no es el del componente sino el del dato
		# y crea inconsistencia al cargarlo con component_common::load_component ya que este método despeja el nombre a partir del tipo dado que en 
		# este caso no cuadra, aunque se necesita después...
		
		$id 	= $this->id;
		$parent	= $this->parent;
		$tipo 	= $this->tipo;
		$lang 	= DEDALO_DATA_NOLAN;
		$dato 	= $this->dato;		# Este dato es provisional y lo pasa trigger component_common Save (NO es el dato en matrix)
			#dump($dato, 'dato received to save (stopped script for debug)'); return null;

		if (!empty($id)) {
			$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$id);	#dump($dato,'dato', "$id - $parent - $tipo ") ;	
		}else{
			$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
			$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL,$parent,$tipo,$lang);	#dump($dato,'dato', "$id - $parent - $tipo ") ;	
		}
		
		# Mezclamos el nuevo dato con el existente en matrix para este registro
		if(!empty($dato)) {
			$new_dato			= $this->add_security_dato($dato, $RecordObj_matrix->get_dato());

			# Cogemos el dato completo resultante y lo establecemos como dato del componente actual, sobreescribiendo el dato temporal recibido por el trigger
			#$this->dato = $new_dato;
			$this->set_dato($new_dato);		
				#dump($this, 'save normally after this'); #return null;
		}

		# reset session permisions table
		unset($_SESSION['auth4']['permissions_table']);

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}



	/**
	* ADD_SECURITY_DATO
	*/
	public function add_security_dato($ar_dato, $ar_dato_matrix) {

		#dump($ar_dato_matrix,'$ar_dato_matrix PRE '.$this->tipo);
		
		# Empty case. Remove element from array
		if(!is_array($ar_dato) || empty($ar_dato)) {
			unset($ar_dato_matrix[$this->tipo]);
			#dump($ar_dato_matrix,'$ar_dato_matrix POST '.$this->tipo);
			return $ar_dato_matrix;
		}
		
		#$ar_dato_matrix = $this->get_dato();
			#dump($ar_dato_matrix,'ar_dato_matrix pre');
			
		foreach($ar_dato as $key => $value) {
									
			$ar_dato_matrix[$key] = intval($value);			#echo "add_security_dato:"; var_dump($ar_dato_matrix);	
			
			#$ar_dato_matrix = json_encode($ar_dato_matrix);	print_r($ar_dato_matrix);		
			#$this->set_dato($ar_dato_matrix);
		}

			#dump($ar_dato_matrix,'ar_dato_matrix post');
		
		return $ar_dato_matrix;
	}


	# GET_AR_TOOLS_OBJ : Override component_common method
	public function get_ar_tools_obj() {
		return NULL;
	}

	# GET_CALLER_ID
	public function get_caller_id() {
		return $this->caller_id ;
	}
	
	
	/**
	* GET USER AUTHORIZED AREAS
	* Get authorized areas (tipo) for current received user id
	* userID_matrix is received as caller_id
	* Es una implementación a medida de los valores de areas autorizadas para este usuario
	* selecciona las que tienen estado 2 y elimina las pseudo-areas 'xxx-admin'
	* @see component_security_areas::get_ar_authorized_areas_for_user
	*/
	protected function get_user_authorized_areas() {	

		$userID_matrix = self::get_caller_id();

			# Verificamos que caller_id es llamado en el contexto 'Admin' es decir,
			# uno de los padres en estructura, es de tipo 'area_admin'

			$matrix_table = common::get_matrix_table_from_tipo($this->tipo);

			# Section
			$current_tipo = common::get_tipo_by_id($userID_matrix, $matrix_table);			

			if (empty($current_tipo))
				throw new Exception("get_user_authorized_areas: undefined 'tipo' for user:$userID_matrix ", 1);
			
			$section_tipo 		= $current_tipo;
			#$section_obj 		= new section($userID_matrix, $ar_result[0]);
			#$section_tipo 		= $section_obj->get_tipo();

			$RecordObj_ts 		= new RecordObj_ts($section_tipo);
			$ar_section_parents	= $RecordObj_ts->get_ar_parents_of_this($ksort=true);
				#dump($ar_section_parents,'ar_section_parents',"padres en estructura de $section_tipo ");

			$is_in_admin_context = false;
			foreach ($ar_section_parents as $parent_tipo) {
				$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($parent_tipo);
				if($modelo_name=='area_admin') {
					$is_in_admin_context = true;
					break;
				}
			}
			if($is_in_admin_context!==true) throw new Exception(" get_user_authorized_areas caller_id=$userID_matrix is on NO Admin context (Not allowed)");

		# Get array of authorized areas for current user id
		$ar_authorized_areas_for_user = component_security_areas::get_ar_authorized_areas_for_user($userID_matrix, $simple_array=false);
			#dump($ar_authorized_areas_for_user,'ar_authorized_areas_for_user');

		# Gets something:
		# [dd321] => 2
	    # [dd294-admin] => 2
	    # [dd294] => 2	
	    # Clean the result to return an only areas array
	    $ar_dato = array();
	    if(is_array($ar_authorized_areas_for_user)) foreach ($ar_authorized_areas_for_user as $tipo => $estado) {
	    	
	    	#if($estado>=2 && strpos($tipo, 'admin')===false && RecordObj_ts::get_modelo_name_by_tipo($tipo)=='section')
	    	#	$ar_dato[] = $tipo ;

	    	if($estado>=1 && strpos($tipo, 'admin')===false && RecordObj_ts::get_modelo_name_by_tipo($tipo)=='section') {

	    		# Eliminamos las secciones virtuales
	    		$section_obj 		= new section(NULL,$tipo);
	    		$section_real_tipo 	= $section_obj->get_section_real_tipo();
	    		if ($section_real_tipo!=false) continue; # Skip section

	    		$ar_dato[] = $tipo ;
	    	}
	    		
	    }
		$dato = $ar_dato;
			#dump($dato,'dato',"dato of component_security_areas id=$component_security_areas_id "); 

		return $dato;
	}

	

	/**
	* GET_AR_TS_CHILDRENS_RECURSIVE . TS TREE FULL FROM PARENT
	*
	* @return $ar_tesauro
	*	array recursive of tesauro structure childrens
	*/
	public static function get_ar_ts_childrens_recursive($terminoID) {
		
		# STATIC CACHE
		static $ar_stat_data;
		$terminoID_source = $terminoID;		
		if(isset($terminoID_source) && isset($ar_stat_data[$terminoID_source])) return $ar_stat_data[$terminoID_source];	
		
		$ar_current[$terminoID] = array();
		$RecordObj_ts			= new RecordObj_ts($terminoID);				
		$ar_ts_childrens		= $RecordObj_ts->get_ar_childrens_of_this(); 
		
		if (count($ar_ts_childrens)>0) {
			
			foreach ($ar_ts_childrens as $children_terminoID) {				
				
				$RecordObj_ts			= new RecordObj_ts($children_terminoID);
				$modeloID				= $RecordObj_ts->get_modelo($children_terminoID);				
				$modelo					= RecordObj_ts::get_termino_by_tipo($modeloID);				#echo " $modelo - ";	#if ($modelo == 'section_list' || $modelo == 'Admin' ) return false;
								
				$ar_exclude_modelo		= array('login','tools','section_list','box');		# ,'filter'		
				$exclude_this_modelo 	= false;
				foreach($ar_exclude_modelo as $modelo_exclude) {					
					if( strpos($modelo,$modelo_exclude)!==false ) {
						$exclude_this_modelo = true;
						break;	
					}
				}
				#echo $modelo ; var_dump($exclude_this_modelo); echo "<br> "; 
				
				if ( $exclude_this_modelo === false ) {
			
					$ar_temp = self::get_ar_ts_childrens_recursive($children_terminoID);					
			
					#if(count($ar_ts_childrens)>0) 				
					$ar_current[$terminoID][$children_terminoID] = $ar_temp;		#echo " - $children_terminoID : " .count($ar_ts_childrens) ." $ar_temp <br>\n";					
				}				
			}
			$ar_tesauro[$terminoID] = $ar_current[$terminoID];
			
			# STORE CACHE DATA
			$ar_stat_data[$terminoID_source] = $ar_tesauro[$terminoID];
		
			return $ar_tesauro[$terminoID];			
		}
		return NULL;		
	}
	

	/**
	* WALK TS CHILDRENS RECURSIVE . DEPLOY TS TREE FULL ARRAY
	*
	* @param $ar_tesauro
	*	array of childrens tipo like 'dd15'
	* @param $arguments
	*	array of vars needed for construct final tree. default is empty array
	*
	* @return $tree_htm
	*	html final of builded tree
	*/
	public static function walk_ar_ts_childrens_recursive($ar_tesauro, $arguments=array()) {		
		
		#dump($ar_tesauro,'ar_tesauro',"array of childrens tipo like 'dd15'");	
		#dump($arguments,'arguments',"array of vars needed for construct final tree. default is empty array");	

		$html_tree = NULL;		#dump($arguments,'$arguments');

		extract($arguments);						
			
		if(is_array($ar_tesauro)) foreach($ar_tesauro as $tipo => $value) {
			
			$dato_current	= NULL;						
			if(isset($dato[$tipo])) {
				$dato_current	= intval($dato[$tipo]);		
			}	

			# TERMINO (In current data lang with fallback)
			$termino	 = RecordObj_ts::get_termino_by_tipo($tipo, DEDALO_DATA_LANG);	#get_termino_by_tipo($terminoID, $lang=false)			
			
				$html_tree	.= $open_term;
				$html_tree	.= "\n <a> ";
				$html_tree	.= component_security_access::create_radio($dato_current, $terminoID, $tipo, $id, $caller_id, $is_time_machine, $arguments);
				$html_tree	.= "\n  $termino ";
				$html_tree	.= "\n </a>\n <h7>[$tipo]  $id - $dato_current</h7> ";	
				#$html_tree	.= "\n  $termino \n </a> <h7>[$tipo]</h7>";				
				
				if(is_array($value)) {					
											
					$html_tree .= $open_group ;			
					$html_tree .= self::walk_ar_ts_childrens_recursive($value,$arguments);					
					$html_tree .= $close_group;							
				}
			
				$html_tree .= $close_term;		
		}		
		return $html_tree;
	}
	

	/**
	* CREATE RADIO BUTTON . USADO POR walk_ar_ts_childrens_recursive
	*/
	public static function create_radio($dato_current, $terminoID, $tipo, $id, $caller_id, $is_time_machine=false, $arguments) {
		#dump($tipo,'dato_current');
		$lang = DEDALO_DATA_LANG ;

		$caller_tipo = $arguments['caller_tipo'];
		
		# CASE TIME MACHINE
		$disabled		= '';
		$name_tm		= '';
		if($is_time_machine == true) {
			
			$disabled 	= 'disabled';
			$name_tm	= '_tm';
		}
		
		$html = '';		
		
		# OPTION 0 . NOT ACCESS
		$checked	= false;
		if( $dato_current == 0) $checked = 'checked="checked"';						
		/*
		$html .= "\n  <input class=\"css_security_radio_button\" type=\"radio\" 
		name=\"{$tipo}_{$name_tm}\" 
		data-tipo=\"{$tipo}\" 
		value=\"0\" id=\"{$id}\" 
		title=\"No access\" 
		data-flag=\"component_security_access\" 
		$checked 
		$disabled />-";
		*/
		# VERIFY USER LOGGED IS CURRENT VIEWED USER			
			$userID_matrix_logged = navigator::get_userID_matrix();							#dump($parent,'parent');
			$userID_matrix_viewed = $caller_id;
			
			$disabled = NULL;
			if($userID_matrix_logged==$userID_matrix_viewed)
				$disabled = "disabled";
		

		# OPTION 0 
		$html .= "\n <input class=\"css_security_radio_button\" type=\"radio\" 
						name=\"{$tipo}_{$id}_tm\" 
						data-tipo=\"{$tipo}\" data-parent=\"{$caller_id}\" data-id_matrix=\"{$id}\" data-lang=\"{$lang}\" data-caller_tipo=\"{$caller_tipo}\" data-flag=\"component_security_access\"
						value=\"0\"
						title=\"No access\"						
						$checked $disabled /> <span class=\"span_property\">X</span> ";
		
		# OPTION 1 . READ ONLY
		$checked	= false;
		if( $dato_current == 1) $checked = 'checked="checked"';
		/*
		$html .= "\n  <input class=\"css_security_radio_button\" type=\"radio\" name=\"{$tipo}_{$name_tm}\" data-tipo=\"{$tipo}\" value=\"1\" id=\"{$id}\" title=\"Read only\" flag=\"component_security_access\" $checked $disabled />r";
		*/
		$html .= "\n <input class=\"css_security_radio_button\" type=\"radio\" 
						name=\"{$tipo}_{$id}_tm\" 
						data-tipo=\"{$tipo}\" data-parent=\"{$caller_id}\" data-id_matrix=\"{$id}\" data-lang=\"{$lang}\" data-caller_tipo=\"{$caller_tipo}\" data-flag=\"component_security_access\"
						value=\"1\"
						title=\"Read only\"
						$checked $disabled /> <span class=\"span_property\">R</span> ";
		
		# OPTION 2 . READ AND WRITE
		$checked	= false;
		if( $dato_current == 2) $checked = 'checked="checked"';
		/*
		$html .= "\n  <input class=\"css_security_radio_button\" type=\"radio\" name=\"{$tipo}_{$name_tm}\" data-tipo=\"{$tipo}\" value=\"2\" id=\"{$id}\" title=\"Read and write\" flag=\"component_security_access\" $checked $disabled />w ";
		*/
		$html .= "\n <input class=\"css_security_radio_button\" type=\"radio\" 
						name=\"{$tipo}_{$id}_tm\" 
						data-tipo=\"{$tipo}\" data-parent=\"{$caller_id}\" data-id_matrix=\"{$id}\" data-lang=\"{$lang}\" data-caller_tipo=\"{$caller_tipo}\" data-flag=\"component_security_access\"
						value=\"2\"
						title=\"Read and write\"
						$checked $disabled /> <span class=\"span_property\">RW</span> ";
		
		return $html;	
	}
	




	
	
	/**
	* PROPAGATE AREAS TO ACCESS (SAVE COMPOSED DATA TO MATRIX)
	* Receive array of areas (checkboxes) from edit section 'Users' page
	* and compares with array of full areas ad components for build the
	* complete table array of permissions for this user
	* Nothing will be done when we are in context: Editing Projects
	*
	* @param $ar_areas_to_save
	*	Array of areas format:
	*		[dd321] => 2,[dd294-admin] => 2,[dd294] => 2 ..	
	*	to save in matrix db. 
	*	Note that the checkbox that no contain value will not be saved and area not in this value
	* @param $parent
	*	Section id matrix of current record. Equivalent to userID matrix (when edit Users) or Project id matrix (when edit Projects)
	*
	* @todo Special pseudo-areas admin like dd12-admin : USE ??????????????????????????????
	* @see used in class.component_security_areas.php:Save() [line 56]
	*/
	public static function propagate_areas_to_access($ar_areas_to_save, $parent, $parent_section_tipo) {
		
		# Verify if we are in 'Users' section or 'Projects' section
		
			/* Método anterior (a través de sección) lo sustituimos por una búsqueda real en estructura	
			# Create a section with parent id and search children by modelo_name=component_security_access		
			$section_obj 			= new section($parent, $parent_section_tipo);			
			$ar_children_objects_by_modelo_name_in_section = $section_obj->get_ar_children_objects_by_modelo_name_in_section($modelo_name_required='component_security_access');	
				#dump($ar_children_objects_by_modelo_name_in_section,'$ar_children_objects_by_modelo_name_in_section',"modelo $modelo_name_required , parent:$parent");
			if(empty($ar_children_objects_by_modelo_name_in_section)) {
				# We are editing 'Projects'
				# Nothing to do
				return NULL;
			}
			*/

			# STRUCTURE
			# Buscamos recusivamente el elemento
			# OBTENEMOS LOS ELEMENTOS HIJOS DE ESTA SECCIÓN
			$RecordObj_ts			= new RecordObj_ts($parent_section_tipo);	
			$ar_recursive_childrens = $RecordObj_ts->get_ar_recursive_childrens_of_this($parent_section_tipo);

			foreach ($ar_recursive_childrens as $terminoID) {
				$RecordObj_ts		= new RecordObj_ts($terminoID);				 
				$modeloID			= $RecordObj_ts->get_modelo();	
				$modelo_name		= $RecordObj_ts->get_modelo_name();		#dump($modelo_name,'modelo_name');

				if ($modelo_name=='component_security_access') {
					# Component matched
					$component_security_access_tipo = $terminoID;			
					break;
				}
			}
			#dump($component_security_access_tipo,'$component_security_access_tipo'); return;
			if(empty($component_security_access_tipo)) {
				# We are editing 'Projects'
				# Nothing to do
				return NULL;
			}


		# Verification
		if(empty($ar_areas_to_save) || !is_array($ar_areas_to_save)) throw new Exception("Error Processing Request: ar_areas_to_save is empty!", 1);


		$userID_matrix 	= $parent;
		$ar_permissions = array();
		

		# 1 Get all major areas 
		$ar_all_areas = area::get_ar_ts_children_all_areas_plain();
			#dump($ar_all_areas,'ar_all_areas',"array plain of all major areas/sections in ts structure (from area_root,area_resource,area_admin and childrens) "); return;
			#dump($ar_areas_to_save,'$ar_areas_to_save');
		
		# 2 Iterate all areas
		if(is_array($ar_all_areas)) foreach ($ar_all_areas as $tipo) {
			
			# RESET ALL AREAS, SECTIONS AND CHILDRENS TO 0
			
				# Set current area to 0
				$ar_permissions[$tipo] 		= 0;
 
					/* 
					# Método anterior (a través de sección) lo sustituimos por una búsqueda real en estructura					
					# Set current area childrens to 0
					$ar_modelo_name_required 	= array('component_','button_','section_group');
					$section_ar_children_tipo 	= section::get_section_ar_children_tipo($tipo, $ar_modelo_name_required);
					if(is_array($section_ar_children_tipo)) foreach ($section_ar_children_tipo as $children_tipo) {
						$ar_permissions[$children_tipo] = 0;
					}
					*/
					# STRUCTURE
					# OBTENEMOS TODOS LOS ELEMENTOS HIJOS DE ESTA ÁREA (RECURSIVE) !! Ojo: se reutilizan los valores abajo, en el siguiente paso
					$RecordObj_ts				= new RecordObj_ts($tipo);	
					$ar_recursive_childrens 	= $RecordObj_ts->get_ar_recursive_childrens_of_this($tipo);

					# Elementos para resetear (LOS SUSCEPTIBLES DE requerir permisos) !! Ojo: se reutilizan los valores abajo, en el siguiente paso
					$ar_modelo_name_required	= array('component_','button_','section_group');

					foreach ($ar_recursive_childrens as $terminoID) {
						$RecordObj_ts			= new RecordObj_ts($terminoID);				 
						$modeloID				= $RecordObj_ts->get_modelo();	
						$modelo_name			= $RecordObj_ts->get_modelo_name();		#dump($modelo_name,'modelo_name');

						# Iterate all ar_modelo_name_required substrings to find matches
						foreach ($ar_modelo_name_required as $name_required) {
						    if ( strpos($modelo_name, $name_required)!==false ) {
						    	# Component matched (like 'component_' in 'component_input_text')
								$ar_permissions[$terminoID] = 0;	#dump($terminoID,'$terminoID');
						    }
						}
					}
					#dump($tipo,'$tipo in area');
					
			# SET COINCIDENT AREAS (ar_areas_to_save / ar_all_areas) TO NEW VALUES

				if (array_key_exists($tipo, $ar_areas_to_save)) {

					# Set access permissions of current area as defined from received checkbox state (0,1,2) no access,read,write
					$current_state 			= $ar_areas_to_save[$tipo];
					$ar_permissions[$tipo] 	= $current_state;
					
					# Set current area childrens to same value
					# If current tipo is section, propagate their permissions to children components
					$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($tipo);
					if($modelo_name=='section') {						

						/*
						# Método anterior (a través de sección) lo sustituimos por una búsqueda real en estructura	
						$ar_modelo_name_required 	= array('component_','button_','section_group');
						$section_ar_children_tipo 	= section::get_section_ar_children_tipo($tipo, $ar_modelo_name_required);
							#dump($section_ar_children_tipo,'section_ar_children_tipo',"section_ar_children_tipo from tipo=$tipo");

						#if(empty($ar_component_obj)) error_log("MESSAGE: Alert: current section ($tipo) has no children !", 1);
						if(is_array($section_ar_children_tipo)) foreach ($section_ar_children_tipo as $children_tipo) {

							$ar_permissions[$children_tipo] = $current_state;
								#dump($component_obj_tipo,'component_obj_tipo'," add to ar_permissions : tipo:$component_obj_tipo , estado:$current_state");
						}
						*/
						# $ar_recursive_childrens está calculado en el paso anterior. Volvemos a iterar asignando el estado de la sección actual a sus componentes hijos 
						foreach ($ar_recursive_childrens as $terminoID) {
							$RecordObj_ts			= new RecordObj_ts($terminoID);				 
							$modeloID				= $RecordObj_ts->get_modelo();	
							$modelo_name			= $RecordObj_ts->get_modelo_name();		#dump($modelo_name,'modelo_name');

							# Iterate all ar_modelo_name_required substrings to find matches
							foreach ($ar_modelo_name_required as $name_required) {
							    if ( strpos($modelo_name, $name_required)!==false ) {
							    	# Component matched (like 'component_' in 'component_input_text')
									$ar_permissions[$terminoID] = $current_state ;	#dump($terminoID,'$terminoID');
							    }
							}
						}#end foreach ($ar_recursive_childrens as $terminoID)

					}#if($modelo_name=='section')
					
				}#if (array_key_exists($tipo, $ar_areas_to_save))

		}#foreach ($ar_all_areas as $tipo)
			#dump($ar_permissions,'$ar_permissions'," array of all areas + sections + components pairs tipo=>permission for user $userID_matrix (Called by trigger.component.common->Save normally) ");
		

		# 3 Save dato to matrix
			/*
			# Método anterior (a través de sección) lo sustituimos por una búsqueda real en estructura	
			# Create a section with id=$userID_matrix (current user edit section) for find their children component_security_access structure element
			$section 			 = new section($userID_matrix,$parent_section_tipo);	
			$ar_children_objects = $section->get_ar_children_objects_by_modelo_name_in_section($modelo_name_required='component_security_access');
				#dump($ar_children_objects,'$ar_children_objects',"modelo $modelo_name_required , id_matrix:$userID_matrix");
			*/
			
			# Create object ($component_security_access_tipo created at first)
			$component_security_access = new component_security_access(NULL,$component_security_access_tipo,'edit',$userID_matrix,DEDALO_DATA_NOLAN);
				#dump($component_security_access,'$component_security_access'); return;


			# Verify component
			if(empty($component_security_access) || !is_object($component_security_access) ) throw new Exception("ERROR: current section id=$userID_matrix has no component_security_access !", 1);
		
			# Configure component
			# dump($component_security_access,'component_security_access');
			/*
			$id 	= $component_security_access->get_id();
			$parent = $component_security_access->get_parent();
			$tipo 	= $component_security_access->get_tipo();
			$lang 	= $component_security_access->get_lang();

			$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
			$RecordObj_matrix 	= new RecordObj_matrix($matrix_table,$id,$parent,$tipo,$lang);	#$matrix_table=null, $id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL
			$RecordObj_matrix->set_dato($ar_permissions);
				#dump($ar_permissions,'$ar_permissions',"ar_permissions final for user $userID_matrix , in matrix record ($tipo) id=$id");
				#dump($RecordObj_matrix,'To save: $RecordObj_matrix');

			$RecordObj_matrix->Save();			

			$id = $RecordObj_matrix->get_id();
				#error_log("MESSAGE: -> propagate_areas_to_access complete to component_security_access matrix id=$id !");
			*/
			$component_security_access->set_dato($ar_permissions);
			$component_security_access->Save();

		# reset session permisions table
		unset($_SESSION['auth4']['permissions_table']);		

		return $ar_permissions;
	}
	






	
	
};
?>