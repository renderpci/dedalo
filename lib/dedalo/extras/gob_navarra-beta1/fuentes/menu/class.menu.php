<?php
/*
* CLASS MENU
*/


class menu extends common {

	protected $modo;

	
	public function __construct($modo) {

		$this->modo = $modo;
	}


	# HTML
	public function get_html() {

		if(SHOW_DEBUG) $start_time = start_time();

		$is_logged	= login::is_logged();
		if(!$is_logged) return NULL;


		$userID_matrix_logged 	= navigator::get_userID_matrix();
		$arguments_tree			= NULL;
		$is_global_admin 		= component_security_administrator::is_global_admin($userID_matrix_logged);
		if( $is_global_admin === false ) {
			# Get array of authorized areas for current logged user
			$ar_authorized_areas 	= component_security_areas::get_ar_authorized_areas_for_user($userID_matrix_logged, false);
			$arguments_tree['dato'] = $ar_authorized_areas;
				#dump($ar_authorized_areas,'ar_authorized_areas');
		}

		$html = self::get_menu_structure_html($option='create_link', $arguments_tree);

		
		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}




	/**
	* GET MENU STRUCTURE HTML (TREE)
	*
	* MÉTODO TEMPORAL .  SEPARAR EL HTML CUANDO SE PUEDA
	* @param $option
	*	Name of method to execute as decorator o every line
	* @param $arguments_tree
	*	Vars needed for option decorator
	*/
	public static function get_menu_structure_html($option, $arguments_tree) {

		#area::get_ar_ts_children_all_areas_plain();
		#dump($option,'option');

		# STATIC CACHE	(Only for menu - option='create_link' -)
		if ($option=='create_link') {
			static $menu_structure_data;
			if(isset($menu_structure_data[$option][DEDALO_APPLICATION_LANG])) return base64_decode($menu_structure_data[$option][DEDALO_APPLICATION_LANG]);
			if ( isset($_SESSION['config4']['menu_structure_html'][$option][DEDALO_APPLICATION_LANG]) ) return base64_decode($_SESSION['config4']['menu_structure_html'][$option][DEDALO_APPLICATION_LANG]);
		}


		if(SHOW_DEBUG) $start_time = start_time();

		$menu_structure_html = "\n\n<!-- MENU --> \n<ul id=\"menu\" class=\"menu_ul_{$option}\">";

			$ar_ts_children_areas = area::get_ar_ts_children_all_areas_hierarchized();

			$menu_structure_html .= self::walk_ar_tesauro($ar_ts_children_areas, $arguments_tree, $option);

			# TESAURO LINK IN MENU
			$tesauro_html = '';
			$tesauro_html .= "<li>";
			$tesauro_html .= "<a href=\"".DEDALO_LIB_BASE_URL."/ts/ts_list.php?modo=tesauro_edit&type=all\">". ucfirst(label::get_label('tesauro'))."</a>";
				$tesauro_html .= "<ul>";
				$tesauro_html .= "<li><a href=\"".DEDALO_LIB_BASE_URL."/ts/ts_list.php?modo=tesauro_edit&type=all\">". ucfirst(label::get_label('terminos'))."</a></li>";
				$tesauro_html .= "<li><a href=\"".DEDALO_LIB_BASE_URL."/ts/ts_list.php?modo=modelo_edit&type=all\">". ucfirst(label::get_label('modelos'))." </a></li>";
				$tesauro_html .= "<li><a href=\"".DEDALO_ROOT_WEB."/jer/jer_list.php\">". ucfirst(label::get_label('jerarquias'))."</a></li>";
                                #Inicio - DCA 23/02/2015
                                $tesauro_html .= "<li><a href=\"".DEDALO_LIB_BASE_URL."/cargawstracasa/actualizargdp.php\">Actualización GDP</a></li>";
                                #Fin - DCA 23/02/2015
				$tesauro_html .= "</ul>";
			$tesauro_html .= "</li>";
			$menu_structure_html .= $tesauro_html;

			# EXTRAS LINK IN MENU
			if (SHOW_DEBUG===TRUE && file_exists(DEDALO_LIB_BASE_PATH.'/extras/menu/index.php')) {
				include_once(DEDALO_LIB_BASE_PATH.'/extras/menu/index.php');
			}

		$menu_structure_html .= "\n</ul><!-- /MENU --> \n";

		# STORE CACHE DATA
		if ($option=='create_link') {

			$menu_structure_data[$option][DEDALO_APPLICATION_LANG] = base64_encode($menu_structure_html) ;
			$_SESSION['config4']['menu_structure_html'][$option][DEDALO_APPLICATION_LANG] = base64_encode($menu_structure_html);
		}		

		return $menu_structure_html ;
	}

	# CREATE LINK FOR MENU
	public static function create_link($tipo, $termino, $modelo_name=NULL, $arguments_tree) {
		if($tipo == navigator::get_selected('area'))
		$termino= "<span class=\"menu_a_span_hilite\">$termino</span>";

		#$link = "<a href=\"?t=$tipo\">$termino<span class=\"menu_a_span\"> [$tipo] [$modelo_name] </span></a>";
		$path = DEDALO_LIB_BASE_URL .'/main/';
		$link = "<a href='{$path}?t=$tipo'> $termino </a>";	#class='link'

		return $link;
	}

	# TEMPORAL .PASAR EN SU MOMENTO A COMPONENT_SECURITY_AREAS
	public static function create_checkbox($tipo, $termino, $modelo_name=NULL, $arguments_tree) {
		return component_security_areas::create_checkbox($tipo, $termino, $modelo_name, $arguments_tree) ;
	}



	/**
	* WALK AR_TESAURO RECURSIVE . DEPLOY TS TREE FULL ARRAY	*
	* Crea un listado <ul><li>termino</li></ul> a partir del array jerárquico dado
	* @param $ar_tesauro
	*	array jerarquizado from component_security_access::get_ar_ts_childrens_recursive($tipo)
	* @param $arguments_tree
	*	varibles necesarias para que el decorador haga su trabajo
	* @param $option
	*	nombre del método que decora el término en cada ciclo
	* @return html tree full created
	*/
	public static function walk_ar_tesauro($ar_tesauro, $arguments_tree, $option='create_link') {

		$html = '';		#dump($arguments_tree,'arguments_tree');

			# VERIFY CURRENT LOGGED USER IS GLOBAL ADMIN OR NOT
			# Testemos si este usuario es administrador global. Si no lo es, ocultaremos las áreas a las que no tiene acceso
			if(isset($arguments_tree['dato'])) {
				#extract($arguments_tree);
				$userID_matrix_logged 			= navigator::get_userID_matrix();
				$logged_user_is_global_admin 	= component_security_administrator::is_global_admin($userID_matrix_logged);
			}

		$open_group 	= "\n <ul>";
		$close_group 	= "\n </ul>\n";

		$open_term		= "\n <li>";
		$close_term		= "</li>";

		#$html 			.= $open_group ;

		foreach($ar_tesauro as $tipo => $value) {

			$show = true;

			/*
			* UNATHORIZED AREAS . REMOVE AREAS NOT AUTHORIZED FOR CURRENT USER
			*
			# If is received arguments[dato] and current tipo not exist in authorized areas and
			# current logged user is not global admin, current <li> element
			# is not included in final tree html
			*/
			if(isset($arguments_tree['dato'])) {

				$dato = $arguments_tree['dato'];
				if(is_array($dato) && !array_key_exists($tipo, $dato) && $logged_user_is_global_admin===false)	{
					$show = false;
				}
				#dump($arguments_tree,'$arguments_tree');
			}

			/*
			* VISIBLE . Excluimos las secciones marcadas como 'visible=no' en estructura
			*/
			$RecordObj_ts	= new RecordObj_ts($tipo);
			$visible 		= $RecordObj_ts->get_visible();
			if ($visible == 'no' && $option=='create_link') {
				$show = false;
			}
			if ($tipo == 'dd29' && $option=='create_link') { // Exclude 'Media' from menu
				$show = false;
			}

			/*
			* PROJECTS . REMOVE ADMIN ELEMENTS
			* En el contexto de edición de 'projects' eliminamos las areas de tipo admin
			*/
			if (isset($arguments_tree['context']) && $arguments_tree['context']=='projects') {

				# Get admin section tipo and childrens
				$ar_tipo_admin = component_security_areas::get_ar_tipo_admin();		#dump($ar_tipo_admin,'$ar_tipo_admin');
				if( in_array($tipo, $ar_tipo_admin) ) {
					# Remove admin element
					$show = false;
					break;
				}
			}



			# AREA ADMIN ELEMENTS diferenciate with class 'global_admin_element'
			if(isset($arguments_tree['context']) && $arguments_tree['context']=='users' && in_array($tipo, component_security_areas::get_ar_tipo_admin()) )	{
				$open_term		= "\n <li class=\"global_admin_element\" >";
			}


			$dato_current	= NULL;
			if(isset($dato[$tipo]))
			$dato_current	= intval($dato[$tipo]);

			# MODELO
			$modelo_name = RecordObj_ts::get_modelo_name_by_tipo($tipo);

			# TERMINO (In current data lang with fallback)
			$termino	 = RecordObj_ts::get_termino_by_tipo($tipo, DEDALO_DATA_LANG);	#get_termino_by_tipo($terminoID, $lang=false)

				if($show===true)	{

					$html	.= $open_term;

					# Decorate term
					$html 	.= self::$option($tipo, $termino, $modelo_name, $arguments_tree);

					if(is_array($value) && $modelo_name!='section') {
						$html .= $open_group ;
						$html .= self::walk_ar_tesauro($value, $arguments_tree, $option);	# Recursion walk_ar_tesauro
						$html .= $close_group;
					}

					$html .= $close_term;
				}

		}//end foreach

		#$html 		.= $close_group ;

		return $html;
	}
























}
?>
