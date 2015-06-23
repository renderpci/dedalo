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
	*/
	function __construct($tipo=false, $parent=null, $modo='edit',  $lang=null, $section_tipo=null) {	#__construct($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)
		

		parent::__construct($tipo, $parent, $modo, $lang=$this->lang, $section_tipo);

		# caller_id from parent var (default)
		if(!empty($parent)) {
			$this->caller_id = $parent;			
		}
		#dump($id,'id');	#throw new Exception("component_security_access Request", 1);
		# caller_id is set in main to this obj from request 'caller_id' (is id section parent of current component)
	}


	# GET DATO : Format {"dd242-admin":"2","dd242":"2"}
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}
	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		$dato 	= $this->dato;		# Este dato ($this->dato) es inyectado y lo pasa trigger component_common Save (NO es el dato existente en matrix)
			if(SHOW_DEBUG) {
				#dump($dato, 'dato received to save (stopped script for debug)'); #return null;
			}			
		
		# Clean dato 
		$clean_dato = component_security_access::clean_dato_for_save($dato);
			#dump($clean_dato,"clean_dato");
		$this->set_dato( $clean_dato );

		# A partir de aquí, salvamos de forma estándar
		$result = parent::Save();

		# reset session permisions table
		# unset($_SESSION['dedalo4']['auth']['permissions_table']);	

		return $result;
	}

	# CLEAN_DATO_FOR_SAVE : Remove values zero like [dd710] => 0 to reduce saved data size
	private static function clean_dato_for_save($dato) {
		$ar_clean = array();
		
		foreach ((array)$dato as $element_tipo => $state) {			
			if ( (int)$state>=1 ) {
				$ar_clean[$element_tipo] = $state;
			}
		}
		return $ar_clean;
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
	* user_id is received as caller_id
	* Es una implementación a medida de los valores de areas autorizadas para este usuario
	* selecciona las que tienen estado 2 y elimina las pseudo-areas 'xxx-admin'
	* @see component_security_areas::get_ar_authorized_areas_for_user
	*/
	protected function get_user_authorized_areas() {

		if(SHOW_DEBUG) {
			#$start_time=microtime(1);
		}

		$user_id = self::get_caller_id();			
			
				/*
				# Verificamos que caller_id es llamado en el contexto 'Admin' es decir,
				# uno de los padres en estructura, es de tipo 'area_admin'

				$matrix_table = common::get_matrix_table_from_tipo($this->tipo);

				# Section
				$current_tipo = common::get_tipo_by_id($user_id, $matrix_table);			
					dump($current_tipo,"current_tipo");	

				if (empty($current_tipo))
					throw new Exception("get_user_authorized_areas: undefined 'tipo' for user:$user_id ", 1);
				*/
			/*
			$section_tipo 		= DEDALO_SECTION_USERS_TIPO;

			$RecordObj_dd 		= new RecordObj_dd($section_tipo);
			$ar_section_parents	= $RecordObj_dd->get_ar_parents_of_this($ksort=true);
				#dump($ar_section_parents,'ar_section_parents',"padres en estructura de $section_tipo ");

			$is_in_admin_context = false;
			foreach ($ar_section_parents as $parent_tipo) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($parent_tipo,true);
				if($modelo_name=='area_admin') {
					$is_in_admin_context = true;
					break;
				}
			}
			if($is_in_admin_context!==true) throw new Exception(" get_user_authorized_areas caller_id=$user_id is on NO Admin context (Not allowed)");
			*/
		# Get array of authorized areas for current user id
			//dump(DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO); die();
		$ar_authorized_areas_for_user = (array)component_security_areas::get_ar_authorized_areas_for_user($user_id, $mode_result='full', DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO);
			#dump($ar_authorized_areas_for_user,'ar_authorized_areas_for_user');

		
		# Gets something:
		# [dd321] => 2
	    # [dd294-admin] => 2
	    # [dd294] => 2	
	    # Clean the result to return an only areas array
	    $ar_dato = array();
	    foreach ($ar_authorized_areas_for_user as $tipo => $estado) {

	    	if ($tipo==DEDALO_SECTION_PROFILES_TIPO) continue; # Skip section profiles
	    
	    	#if($estado>=2 && strpos($tipo, 'admin')===false && RecordObj_dd::get_modelo_name_by_tipo($tipo)=='section')
	    	#	$ar_dato[] = $tipo ;

	    	if($estado>=1 && strpos($tipo, 'admin')===false && RecordObj_dd::get_modelo_name_by_tipo($tipo,true)=='section'){ 
/*******************************************************************PROVISIONAL DESACCTIVO, AHORA LAS VIRTUALES TIENEN POTESTAD**************************************************************
	    		# Eliminamos las secciones virtuales
	    		$section_real_tipo = section::get_section_real_tipo_static($tipo);

	    		if ($section_real_tipo != $tipo) {
	    			#dump($section_real_tipo,"section_real_tipo skipped ($tipo)");
	    			continue; # Skip section
	    		}
				*/
	    		$ar_dato[] = $tipo ;
	    	}
	    		
	    }
		$dato = $ar_dato;
			#dump($dato,'dato',"dato of component_security_areas id=$component_security_areas_id "); 

		if(SHOW_DEBUG) {
			#$total=round(microtime(1)-$start_time,3); dump($total, 'total');	#dump($ar_authorized_areas_for_user, 'ar_authorized_areas_for_user');				
		}

		return (array)$dato;

	}//end get_user_authorized_areas

	


	/**
	* GET_AR_TS_CHILDRENS_RECURSIVE . TS TREE FULL FROM PARENT
	* @param string $terminoID
	* @return $ar_tesauro OR null
	*	array recursive of tesauro structure childrens
	*/
	public static function get_ar_ts_childrens_recursive($terminoID) {

		if(SHOW_DEBUG) {
			#$start_time=microtime(1);
		}
		
		# STATIC CACHE
		static $ar_stat_data;
		$terminoID_source = $terminoID;		
		if(isset($terminoID_source) && isset($ar_stat_data[$terminoID_source])) return $ar_stat_data[$terminoID_source];	
		
		$ar_current[$terminoID] = array();
		$RecordObj_dd			= new RecordObj_dd($terminoID);				
		$ar_ts_childrens		= $RecordObj_dd->get_ar_childrens_of_this(); 
		
		if (count($ar_ts_childrens)>0) {
			
			foreach ($ar_ts_childrens as $children_terminoID) {				
				
				#$RecordObj_dd			= new RecordObj_dd($children_terminoID);
				#$modeloID				= $RecordObj_dd->get_modelo($children_terminoID);				
				#$modelo				= RecordObj_dd::get_termino_by_tipo($modeloID);				#echo " $modelo - ";	#if ($modelo == 'section_list' || $modelo == 'Admin' ) return false;
				$modelo 				= RecordObj_dd::get_modelo_name_by_tipo($children_terminoID,true);
								
				$ar_exclude_modelo		= array('component_security_administrator','relation_list','section_list','box_elements','exclude_elements');		# ,'filter'	,'tools','search_list'
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

		if(SHOW_DEBUG) {
			#$total=round(microtime(1)-$start_time,3); dump($total, 'total');	#dump($ar_authorized_areas_for_user, 'ar_authorized_areas_for_user');				
		}

		return NULL;

	}//end get_ar_ts_childrens_recursive
	



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

		if(SHOW_DEBUG) {
			#$start_time=microtime(1);
		}	
		
		#dump($ar_tesauro,'ar_tesauro',"array of childrens tipo like 'dd15'");	
		#dump($arguments,'arguments',"array of vars needed for construct final tree. default is empty array");	

		$html_tree = NULL;		

		extract($arguments);
		/* arguments example
		[terminoID] => dd128
		[dato] => Array (
            [dd14] => 1
            [dd40] => 2 ..)
		[caller_id] => 1
	    [caller_tipo] => dd148
	    [parent] => 1
	    [is_time_machine] => 
	    [open_group] => "<ul class="menu">"
	    [open_term] => "<!-- li dd148 --><li class="expanded">"
	    [close_term] => "</li>"
	    [close_group] => "</ul>"
		*/						
		
		if(SHOW_DEBUG) {
			#dump($arguments,'$arguments');
			#dump($dato, ' dato');;
		}
		foreach((array)$ar_tesauro as $tipo => $value) {
			
			$dato_current	= NULL;						
			if(isset($dato[$tipo])) {
				$dato_current	= intval($dato[$tipo]);		
			}	

			# TERMINO (In current data lang with fallback)
			$termino	 = RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_DATA_LANG, true);			
			
				$html_tree	.= $open_term;

					$html_tree	.= "\n <a> ";
					$html_tree	.= component_security_access::create_radio($dato_current, $terminoID, $tipo, $parent, $caller_id, $is_time_machine, $arguments);
					$html_tree	.= "\n  $termino ";
					$html_tree	.= "\n </a>\n <h7>[$tipo]  $parent - $dato_current</h7> ";
					
					if(is_array($value)) {												
						$html_tree .= $open_group;
						$html_tree .= component_security_access::walk_ar_ts_childrens_recursive($value, $arguments);					
						$html_tree .= $close_group;							
					}
			
				$html_tree .= $close_term;

		}//end foreach((array)$ar_tesauro as $tipo => $value) {

		if(SHOW_DEBUG) {
			#$total=round(microtime(1)-$start_time,3); dump($total, 'total');	#dump($ar_authorized_areas_for_user, 'ar_authorized_areas_for_user');				
		}

		return (string)$html_tree;

	}//end walk_ar_ts_childrens_recursive
	



	/**
	* CREATE RADIO BUTTON . USADO POR walk_ar_ts_childrens_recursive
	*/
	public static function create_radio($dato_current, $terminoID, $tipo, $parent, $caller_id, $is_time_machine=false, $arguments) {
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
			$user_id_logged = navigator::get_user_id();							#dump($parent,'parent');
			$user_id_viewed = $caller_id;
			if(!TOP_TIPO) trigger_error("Waring: TOP_TIPO is empty");
			
			switch (true) {
				case (TOP_TIPO==DEDALO_SECTION_PROFILES_TIPO): # case editing profiles (order is important here)
					$disabled = '';
					break;
				case ($user_id_logged==$user_id_viewed): # case editing users and current logged user is the edited user
					$disabled = "disabled";
					break;				
				default:
					$disabled = '';
					break;
			}
		

		# OPTION 0 
		$html .= "\n <input class=\"css_security_radio_button\" type=\"radio\" 
						name=\"{$tipo}_{$parent}_tm\" 
						data-tipo=\"{$tipo}\" data-parent=\"{$caller_id}\" data-id_matrix=\"{$parent}\" data-lang=\"{$lang}\" data-caller_tipo=\"{$caller_tipo}\" data-flag=\"component_security_access\"
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
						name=\"{$tipo}_{$parent}_tm\" 
						data-tipo=\"{$tipo}\" data-parent=\"{$caller_id}\" data-id_matrix=\"{$parent}\" data-lang=\"{$lang}\" data-caller_tipo=\"{$caller_tipo}\" data-flag=\"component_security_access\"
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
						name=\"{$tipo}_{$parent}_tm\" 
						data-tipo=\"{$tipo}\" data-parent=\"{$caller_id}\" data-id_matrix=\"{$parent}\" data-lang=\"{$lang}\" data-caller_tipo=\"{$caller_tipo}\" data-flag=\"component_security_access\"
						value=\"2\"
						title=\"Read and write\"
						$checked $disabled /> <span class=\"span_property\">RW</span> ";
		
		return (string)$html;	

	}//end create_radio
	




	
	
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
			$section_obj 			= section::get_instance($parent, $parent_section_tipo);			
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
			$RecordObj_dd			= new RecordObj_dd($parent_section_tipo);	
			$ar_recursive_childrens = $RecordObj_dd->get_ar_recursive_childrens_of_this($parent_section_tipo);

			foreach ($ar_recursive_childrens as $terminoID) {
				$RecordObj_dd		= new RecordObj_dd($terminoID);				 
				$modeloID			= $RecordObj_dd->get_modelo();	
				$modelo_name		= $RecordObj_dd->get_modelo_name();		#dump($modelo_name,'modelo_name');

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


		#$user_id 	= $parent;
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
					$RecordObj_dd				= new RecordObj_dd($tipo);	
					$ar_recursive_childrens 	= (array)$RecordObj_dd->get_ar_recursive_childrens_of_this($tipo);

					# Elementos para resetear (LOS SUSCEPTIBLES DE requerir permisos) !! Ojo: se reutilizan los valores abajo, en el siguiente paso
					$ar_modelo_name_required	= array('component_','button_','section_group');

					foreach ($ar_recursive_childrens as $terminoID) {
						$RecordObj_dd			= new RecordObj_dd($terminoID);				 
						$modeloID				= $RecordObj_dd->get_modelo();	
						$modelo_name			= $RecordObj_dd->get_modelo_name();		#dump($modelo_name,'modelo_name');

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
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
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
							$RecordObj_dd			= new RecordObj_dd($terminoID);				 
							$modeloID				= $RecordObj_dd->get_modelo();	
							$modelo_name			= $RecordObj_dd->get_modelo_name();		#dump($modelo_name,'modelo_name');

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
			#dump($ar_permissions,'$ar_permissions'," array of all areas + sections + components pairs tipo=>permission for user $user_id (Called by trigger.component.common->Save normally) ");
		

		# 3 Save dato to matrix
			/*
			# Método anterior (a través de sección) lo sustituimos por una búsqueda real en estructura	
			# Create a section with id=$user_id (current user edit section) for find their children component_security_access structure element
			$section 			 = section::get_instance($user_id,$parent_section_tipo);	
			$ar_children_objects = $section->get_ar_children_objects_by_modelo_name_in_section($modelo_name_required='component_security_access');
				#dump($ar_children_objects,'$ar_children_objects',"modelo $modelo_name_required , id_matrix:$user_id");
			*/
			
			# Create object ($component_security_access_tipo created at first)
			#$component_security_access = new component_security_access($component_security_access_tipo, $user_id, 'edit', DEDALO_DATA_NOLAN);
			$component_security_access = component_common::get_instance('component_security_access', $component_security_access_tipo, $parent, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
				#dump($component_security_access,'$component_security_access'); return;


			# Verify component
			if(empty($component_security_access) || !is_object($component_security_access) ) throw new Exception("ERROR: current section id=$parent has no component_security_access !", 1);
		
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
				#dump($ar_permissions,'$ar_permissions',"ar_permissions final for user $user_id , in matrix record ($tipo) id=$id");
				#dump($RecordObj_matrix,'To save: $RecordObj_matrix');

			$RecordObj_matrix->Save();			

			$id = $RecordObj_matrix->get_id();
				#error_log("MESSAGE: -> propagate_areas_to_access complete to component_security_access matrix id=$id !");
			*/
			$component_security_access->set_dato($ar_permissions);
			$component_security_access->Save();

		# reset session permisions table
		# unset($_SESSION['dedalo4']['auth']['permissions_table']);		

		return $ar_permissions;

	}//end propagate_areas_to_access
	






	
	
};
?>