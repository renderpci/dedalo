<?php


/*
* CLASS MENU
*/
class menu extends common {


	protected $modo;

	
	public function __construct($modo) {
		$this->modo = $modo;
	}



	/**
	* GET_HTML
	*/
	public function get_html() {

		if(SHOW_DEBUG===true) $start_time = start_time();

		if(!login::is_logged()) return null;

		$user_id_logged 		= navigator::get_user_id();
		$arguments_tree			= array();	
		$arguments_tree['ul_id']= 'menu';	

		if( (bool)component_security_administrator::is_global_admin($user_id_logged) !== true ) {
			# Get array of authorized areas for current logged user
			$ar_authorized_areas 	= component_security_areas::get_ar_authorized_areas_for_user($user_id_logged, $mode_result='full');
			$arguments_tree['dato'] = $ar_authorized_areas;
				#dump($ar_authorized_areas,'ar_authorized_areas');
		}

		$html = self::get_menu_structure_html($option='create_link', $arguments_tree);
		
		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}



	/**
	* GET MENU STRUCTURE HTML (TREE)
	*
	* @param $option
	*	Name of method to execute as decorator o every line
	* @param $arguments_tree
	*	Vars needed for option decorator
	*/
	public static function get_menu_structure_html($option, $arguments_tree) {
		#unset($_SESSION['dedalo4']['config']['menu_structure_html']);

		#area::get_ar_ts_children_all_areas_plain();
		#dump($option,'option');
		#dump($arguments_tree,'arguments_tree');

		/**/
		# STATIC CACHE	(Only for menu - option='create_link' -)
		if ($option==='create_link') {
			$uid=(string)$option;
			if( isset($_SESSION['dedalo4']['config']['menu_structure_html'][$uid][DEDALO_APPLICATION_LANG]) ) {
				#error_log("--get_menu_structure_html is returned from session cache");
				if(SHOW_DEBUG===true) {
					# nothing to do;
					#dump($uid, '$uid');
					return $_SESSION['dedalo4']['config']['menu_structure_html'][$uid][DEDALO_APPLICATION_LANG];	
				}else{
					return $_SESSION['dedalo4']['config']['menu_structure_html'][$uid][DEDALO_APPLICATION_LANG];	
				}											
			}				
		}

		if(SHOW_DEBUG===true) {
			$start_time = microtime(1);
		}
		$ul_id = isset($arguments_tree['ul_id']) ? $arguments_tree['ul_id'] : 'menu';

		$menu_structure_html = "<!-- MENU --> <ul id=\"$ul_id\" class=\"menu_ul_{$option}\">";
		
			/*
			# INVENTARIO MENU (area_root)
				$area_root = new area_root();
				$ar_ts_children_areas = $area_root->get_ar_ts_children_areas();
					#dump($ar_ts_children_areas,'ar_ts_children_areas'," ar_ts_children_areas de area_root ");
				$menu_structure_html .= self::walk_ar_structure($ar_ts_children_areas, $arguments_tree, $option);

			# RESOURCES MENU (area_resource)
				$area_resource = new area_resource();
				$ar_ts_children_areas = $area_resource->get_ar_ts_children_areas();
					#dump($ar_ts_children_areas,'ar_ts_children_areas'," ar_ts_children_areas de area_resource ");
				$menu_structure_html .= self::walk_ar_structure($ar_ts_children_areas, $arguments_tree, $option);

			# ADMIN MENU (area_admin)
				$area_admin = new area_admin();
				$ar_ts_children_areas = $area_admin->get_ar_ts_children_areas();
					#dump($ar_ts_children_areas,'ar_ts_children_areas'," ar_ts_children_areas de area_admin ");
				$menu_structure_html .= self::walk_ar_structure($ar_ts_children_areas, $arguments_tree, $option);
			*/
			$ar_ts_children_areas = area::get_ar_ts_children_all_areas_hierarchized();
				#dump($ar_ts_children_areas,"ar_ts_children_areas");

			# BUILD MENU RECURSIVELY
			$menu_structure_html .= self::walk_ar_structure($ar_ts_children_areas, $arguments_tree, $option);

			
			# THESAURUS ADD MENU MANUAL
			$user_id_logged 			 = navigator::get_user_id();
			$logged_user_is_global_admin = (bool)component_security_administrator::is_global_admin($user_id_logged);
			
			$security = new security();
			$tesauro_permissions = security::get_security_permissions(DEDALO_TESAURO_TIPO,DEDALO_TESAURO_TIPO);				
			if ( (array_key_exists(DEDALO_TESAURO_TIPO, $ar_ts_children_areas) && $tesauro_permissions>=2) || $logged_user_is_global_admin===true) {			
				#dump($ar_ts_children_areas,$ar_ts_children_areas);
				switch (true) {
					case ($option==='create_link'):

						# TESAURO LINK IN MENU
						if(SHOW_DEBUG===true) {						
						$tesauro_html = '';
						$tesauro_html .= "<li class=\"has-sub menu_li_inactive\">";
						$tesauro_html .= "<a href=\"".DEDALO_LIB_BASE_URL."/ts/ts_list.php?t=".DEDALO_TESAURO_TIPO."&modo=tesauro_edit&type=all\">TS V3</a>"; // ucfirst(label::get_label('tesauro'))
							$tesauro_html .= "<ul>";
							$tesauro_html .= "<li><a href=\"".DEDALO_LIB_BASE_URL."/ts/ts_list.php?t=".DEDALO_TESAURO_TIPO."&modo=tesauro_edit&type=all\">". ucfirst(label::get_label('terminos'))."</a></li>";
							$tesauro_html .= "<li><a href=\"".DEDALO_LIB_BASE_URL."/ts/ts_list.php?t=".DEDALO_TESAURO_TIPO."&modo=modelo_edit&type=all\">". ucfirst(label::get_label('modelos'))." </a></li>";
							$tesauro_html .= "<li><a href=\"".DEDALO_ROOT_WEB."/jer/jer_list.php\">". ucfirst(label::get_label('jerarquias'))."</a></li>";
							$tesauro_html .= "</ul>";
						$tesauro_html .= "</li>";
						$menu_structure_html .= $tesauro_html;
						}	

						/*
						if(SHOW_DEBUG===true) {
							# TESAURO V4 LINK IN MENU
							$tesauro_html = '';
							$tesauro_html .= "<li class=\"has-sub menu_li_inactive\">";
							$tesauro_html .= "<a href=\"".DEDALO_LIB_BASE_URL."/main?t=".DEDALO_TESAURO_TIPO."\">". RecordObj_dd::get_termino_by_tipo(DEDALO_TESAURO_TIPO, DEDALO_DATA_LANG, true) ." V4</a>";
								$tesauro_html .= "<ul>";
								$tesauro_html .= "<li><a href=\"".DEDALO_LIB_BASE_URL."/main?t=".DEDALO_TESAURO_TIPO."\">". RecordObj_dd::get_termino_by_tipo(DEDALO_TESAURO_TIPO, DEDALO_DATA_LANG, true) ." V4</a></li>";
								$tesauro_html .= "<li><a href=\"".DEDALO_LIB_BASE_URL."/main?t=".DEDALO_TESAURO_TIPO."&model\">". RecordObj_dd::get_termino_by_tipo(DEDALO_TESAURO_TIPO, DEDALO_DATA_LANG, true) ." [M] V4</a></li>";
								$tesauro_html .= "<li><a href=\"".DEDALO_LIB_BASE_URL."/main?t=".DEDALO_HIERARCHY_SECTION_TIPO."\">". RecordObj_dd::get_termino_by_tipo(DEDALO_HIERARCHY_SECTION_TIPO, DEDALO_DATA_LANG, true) ." V4</a></li>";								
								$tesauro_html .= "</ul>";
							$tesauro_html .= "</li>";
							$menu_structure_html .= $tesauro_html;
						}
						*/

						# STRUCTURE LINK IN MENU
						if(SHOW_DEBUG===true && $logged_user_is_global_admin===true && file_exists(DEDALO_LIB_BASE_PATH.'/dd')) {
							$menu_structure_html .= "<li class=\"has-sub menu_li_inactive\">";
								$menu_structure_html .= "<a href=\"".DEDALO_LIB_BASE_URL."/dd/dd_list.php?modo=tesauro_edit\">Structure</a>";
								$menu_structure_html .= "<ul>";
								$menu_structure_html .= "<li><a href=\"".DEDALO_LIB_BASE_URL."/dd/dd_list.php?modo=modelo_edit\">Modelo</a></li>";
								$menu_structure_html .= "</ul>";
							$menu_structure_html .="</li>";
						}
						break;
					
					default:
						# code...
						break;
				}			
			}//end if ( (array_key_exists(DEDALO_TESAURO_TIPO, $ar_ts_children_areas) && $tesauro_permissions==2) || $logged_user_is_global_admin===true) {
			
		$menu_structure_html .= "</ul><!-- /MENU --> ";


		
		# STORE CACHE DATA
		if ($option==='create_link') {
			if(SHOW_DEBUG===true) {
				$_SESSION['dedalo4']['config']['menu_structure_html'][$uid][DEDALO_APPLICATION_LANG] = tools::clean_html_code($menu_structure_html);
			}else{
				$_SESSION['dedalo4']['config']['menu_structure_html'][$uid][DEDALO_APPLICATION_LANG] = tools::clean_html_code($menu_structure_html);
			}
		}

		if(SHOW_DEBUG===true) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, 'html' );
			#$total=round(microtime(1)-$start_time,3); 	dump($total, 'total');
		}

		return (string)$menu_structure_html;
	}//end public static function get_menu_structure_html($option, $arguments_tree) {




	/**
	* CREATE_LINK
	*/
	public static function create_link($tipo, $termino, $modelo_name=NULL, $arguments_tree=null) {			

		#if($tipo == navigator::get_selected('area')) {
			#$termino= "<span class=\"menu_a_span_hilite\">$termino</span>";
		#}
		$path = DEDALO_LIB_BASE_URL .'/main/';
		$url  = "{$path}?t=$tipo";

		# Redirections when area is a special thesaurus class
		if ($tipo===DEDALO_THESAURUS_VIRTUALS_AREA_TIPO) { // hierarchy56			
			$url  = "{$path}?t=".DEDALO_TESAURO_TIPO;
		}elseif ($tipo===DEDALO_THESAURUS_VIRTUALS_MODELS_AREA_TIPO) {
			$url  = "{$path}?t=".DEDALO_TESAURO_TIPO.'&model=1';
		}		
		
		if ($modelo_name==='section_tool') {

			$RecordObj_dd = new RecordObj_dd($tipo);
			$propiedades  = json_decode($RecordObj_dd->get_propiedades());
			if ($propiedades) {
				$url = "{$path}?t={$tipo}&top_tipo={$propiedades->context->top_tipo}";
			}
			//dump($propiedades, ' propiedades ++ '.to_string());
		}
		
		$link = "<a href=\"$url\">$termino</a>";

		return $link;
	}



	/**
	* CREATE_CHECKBOX
	* TEMPORAL .PASAR EN SU MOMENTO A COMPONENT_SECURITY_AREAS
	*//*
	public static function create_checkbox($tipo, $termino, $modelo_name=NULL, $arguments_tree) {
		return component_security_areas::create_checkbox($tipo, $termino, $modelo_name, $arguments_tree) ;
	}
	*/


	/**
	* WALK AR_TESAURO RECURSIVE . DEPLOY TS TREE FULL ARRAY	*
	* Crea un listado <ul><li>termino</li></ul> a partir del array jerárquico dado
	* @param $ar_structure
	*	array jerarquizado from component_security_access::get_ar_ts_childrens_recursive($tipo)
	* @param $arguments_tree
	*	varibles necesarias para que el decorador haga su trabajo
	* @param $option
	*	nombre del método que decora el término en cada ciclo
	* @return html tree full created
	*/
	public static function walk_ar_structure($ar_structure, $arguments_tree, $option='create_link') {

		$html = '';		#dump($arguments_tree,'arguments_tree');

		# VERIFY CURRENT LOGGED USER IS GLOBAL ADMIN OR NOT
		# Testemos si este usuario es administrador global. Si no lo es, ocultaremos las áreas a las que no tiene acceso
			$user_id_logged 			 = navigator::get_user_id();
			$logged_user_is_global_admin = component_security_administrator::is_global_admin($user_id_logged);

		
		foreach((array)$ar_structure as $tipo => $value) {

			$show = true;
			$skip = false;

			// OPEN/CLOSE GROUP RESET
			$open_group 	= "<ul>";
			$close_group 	= "</ul>";
			// OPEN/CLOSE TERM RESET
			$open_term		= "<li>";
			$close_term		= "</li>";

			/*
			* UNATHORIZED AREAS . REMOVE AREAS NOT AUTHORIZED FOR CURRENT USER
			*
			# If is received arguments[dato] and current tipo not exist in authorized areas and
			# current logged user is not global admin, current <li> element
			# is not included in final tree html
			*/
			if(isset($arguments_tree['dato'])) {

				$dato = $arguments_tree['dato'];
				if( !isset($dato->$tipo) && $logged_user_is_global_admin===false)	{
					$show = false;
				}
				#dump($arguments_tree,'$arguments_tree');
			}

			/*
			* VISIBLE . Excluimos las secciones marcadas como 'visible=no' en estructura y las que 
			* no deben ser mostradas (tesauro selector, media area, etc.)
			*/
			$RecordObj_dd	= new RecordObj_dd($tipo);
			$visible 		= $RecordObj_dd->get_visible();
			switch (true) {
				case ($option==='create_link' && $visible === 'no'):
				case ($option==='create_link' && $tipo === DEDALO_MEDIA_AREA_TIPO):
				#case ($option==='create_link' && $tipo === DEDALO_TESAURO_TIPO):
				case ($option==='create_link' && $tipo === DEDALO_ENTITY_MEDIA_AREA_TIPO):					
						$show = false;
						break;
				case ($option==='create_link' && in_array($tipo, unserialize(DEDALO_ENTITY_MENU_SKIP_TIPOS))):
						$skip = true;
						break;
				case ($tipo===DEDALO_SECTION_PROFILES_TIPO && $logged_user_is_global_admin!==true):
						$skip = true;
						break;
			}
			
			# MODELO
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

			# TERMINO (In current data lang with fallback)
			$termino	 = RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_APPLICATION_LANG, true);

			/*
			* PROJECTS . REMOVE ADMIN ELEMENTS
			* En el contexto de edición de 'projects' eliminamos las areas de tipo admin
			*//*
			if (isset($arguments_tree['context']) && $arguments_tree['context']=='projects') {

				# Get admin section tipo and childrens
				$ar_tipo_admin = component_security_areas::get_ar_tipo_admin();		#dump($ar_tipo_admin,'$ar_tipo_admin');
				if( in_array($tipo, $ar_tipo_admin) ) {
					# Remove admin element
					$show = false;
					break;
				}
			}
			*/

			
			if (!empty($value) && $modelo_name!='section') {
				$open_term = "<li class=\"has-sub\">";
			}

			# AREA ADMIN ELEMENTS diferenciate with class 'global_admin_element'
			if(isset($arguments_tree['context']) && $arguments_tree['context']==='users' && in_array($tipo, component_security_areas::get_ar_tipo_admin()) )	{
				$open_term	= "<li class=\"global_admin_element\">";
			}

			$dato_current	= isset($dato->$tipo) ? intval($dato->$tipo) : null;
			
			
			if($skip===true) {

				if(is_array($value) && $modelo_name!='section') {
					$html .= self::walk_ar_structure($value, $arguments_tree, $option);	# Recursion walk_ar_structure
					#dump($html,'$html');
				}

			}else if($show===true) {			
				

				$html	.= $open_term;

				# Decorate term
				$html 	.= self::$option($tipo, $termino, $modelo_name, $arguments_tree);

				if(is_array($value) && $modelo_name!='section') {					
					
					$current_html = self::walk_ar_structure($value, $arguments_tree, $option);	# Recursion walk_ar_structure
					if (strlen($current_html)) {
						$html .= $open_group;
						$html .= $current_html;
						$html .= $close_group;
					}
				}

				$html .= $close_term;
			}
			
		}//end foreach($ar_structure as $tipo => $value) {		
		
		return $html;
	}//end walk_ar_structure





}//end class
?>