<?php
/*
* CLASE Navigation
*/

class Navigation {
	
	
	/*	
	function __construct()
	{
		#$this->file($file);
	}
	*/
	
	
	
	# SET CURRENT URL TO SAVE IN SESSION ARRRAY (ar_last_list)
	public static function set_current_list_url($page) {
		
		$current_list_url = $_SERVER['REQUEST_URI'];
		
		# fix last list
		$_SESSION['ar_last_list'][$page] = $current_list_url;
	}
	
	# GET CURRENT URL FROM SESSION ARRRAY (ar_last_list)
	public static function get_current_list_url($page) {
		
		if(!isset($_SESSION['ar_last_list'][$page])) return false;
	
		return $_SESSION['ar_last_list'][$page];
	}
	
	# GET CURRENT URL FROM SESSION ARRRAY (ar_last_list)
	public static function delete_current_list_url($page) {
		
		if(isset($_SESSION['ar_last_list'][$page])) unset($_SESSION['ar_last_list'][$page]);		
	}
	
	
	public static function goto_last_list($page) {
	
		# REFERER PAGE
		$referer	= false;
		if(isset($_SERVER['HTTP_REFERER']))	$referer = $_SERVER['HTTP_REFERER'];
		
		# LAST LIST OF CURRENT page
		$last_list = Navigation::get_current_list_url($page);
		
		# DETERMINE WATHS UP
		if($last_list && strpos($referer,$page)===false ) {
			
			Navigation::delete_current_list_url($page);
			header("Location: $last_list"); 
			exit();
			
		}else{
			
			Navigation::set_current_list_url($page);
			return true;
		}	
	}
	
	
	
	# crear boton
	static function crearBoton($nombre, $enlace, $estilo='botonTabla') {
			
		$html = false ;
		
		global $localizacion, $captaciones_title, $informantes_title, $cintas_title ;
				
		global $administracion_abrev_title, $proyectos_title, $usuarios_title , $municipios_title, $actividad_title ;
				
		if(isset($_GET['t'])) $t = safe_xss($_GET['t']);
		global $comarcas_title ;
		global $provincias_title ;
		global $comunidades_title ;
		global $paises_title ;
		
		global $localizacion2 ;
		global $inicio_title ;
		global $ayuda_title ;
		global $estadisticas_title ;
		global $trascripcion_title ;
		global $traduccion_title ;
		
		if( $localizacion == $nombre ) $estilo='botonTablaZactual' ; #echo " $nombre  - $localizacion <br>";
		
		/*
		* caso captaciones que tiene subniveles
		*/	
		if( $nombre == $captaciones_title && ($localizacion == $informantes_title || $localizacion == $cintas_title || $localizacion == $ayuda_title) ) $estilo='botonTablaZactual' ;	
		/*
		* caso transcripción que tiene subniveles
		*/	
		#if( $nombre == $transcripcion_title && ($localizacion == $trascripcion_title || $localizacion == $traduccion_title || $localizacion == $ayuda_title) ) $estilo='botonTablaZactual' ;	
		
		
		/*
		* caso admin que tiene subniveles
		*/	
		if( $nombre == $administracion_abrev_title && ($localizacion == $proyectos_title || $localizacion == $usuarios_title || $localizacion == $municipios_title || $localizacion == $actividad_title) ) $estilo='botonTablaZactual' ;
		/*
		* caso municipios de nivel 3
		*/	
		if( $nombre == $comarcas_title && $t == 'comarca' ) $estilo='botonTablaZactual' ;
		if( $nombre == $provincias_title && $t == 'provincia' ) $estilo='botonTablaZactual' ;
		if( $nombre == $comunidades_title && $t == 'comunidad' ) $estilo='botonTablaZactual' ;
		if( $nombre == $paises_title && $t == 'pais' ) $estilo='botonTablaZactual' ;
		/*
		* caso home
		*/	
		#if( $nombre == $ayuda_title && $localizacion2 == $ayuda_title ) $estilo='botonTablaZactual' ;
		#if( $nombre == $estadisticas_title && $localizacion2 == $estadisticas_title ) $estilo='botonTablaZactual' ;
			
		$html .= '<table  border="0" cellpadding="0" cellspacing="0" class="'.$estilo.'">'  ;
		$html .= '<tr>' ;
		$html .= "<td height=\"16\" width=\"4\"><img src=\"../images/b_left.gif\" width=\"4\" height=\"16\" vspace=\"0\" onClick=\"javascript:top.location='$enlace';\"></td>" ;
		$html .= '<td height="16" align="center" background="../images/b_center.gif" nowrap="nowrap"><div class="botonT"><a href="'.$enlace.'">'.$nombre.'</a></div></td>' ; 
		$html .= '<td height="16" width="4"><img src="../images/b_right.gif" alt="." width="4" height="16" hspace="0" vspace="0"></td>' ;
		$html .= '</tr>' ;
		$html .= '</table>' ;
		
		return $html ;
	}
	
	/*
	* Crea Pestaña de Sección (INICIO, CAPTACIONES, TESAURO, TRANSCRIPCION, INDEXACION, BUSQUEDA, ADMINISTRACION)
	*/
	static function makeTab($nombre, $enlace, $estilo='topTab', $estiloSelected='topTabSelected') {
		
		$selected = false ;
		
		global $localizacion ;
		global $ayuda_title ;
		
		if( $localizacion == $nombre ) $selected = true ;
		
		/*
		* Caso inicio
		*/
		global $inicio_title ; #echo "$nombre : $inicio_title - $localizacion : $ayuda_title.'inicio' <hr>";
		if( $nombre == $inicio_title && $localizacion == $ayuda_title.'inicio' ) $selected = true ;	
	
		/*
		* caso captaciones que tiene subniveles
		*/
		global $captaciones_title, $informantes_title,  $cintas_title, $expediente_title ;
		
		if( $nombre == $captaciones_title && ($localizacion == $informantes_title || $localizacion == $cintas_title || $localizacion == $expediente_title || $localizacion == $ayuda_title.'captaciones' ) ) $selected = true ;
		
		/*
		* Caso tesauro
		*/
		global $tesaurus_title ;
		if( $nombre == $tesaurus_title && ($localizacion == $ayuda_title.'tesauro' ) ) $selected = true ;
		
		/*
		* Caso transcripcion
		*/
		global $transcripcion_title, $traduccion_title ;
		if( $nombre == $transcripcion_title && ($localizacion == $ayuda_title.'transcripcion' || $localizacion == $traduccion_title)  ) $selected = true ;
		
		/*
		* Caso indexacion
		*/
		global $indexacion_title ;
		if( $nombre == $indexacion_title && ($localizacion == $ayuda_title.'indexacion' ) ) $selected = true ;
		
		
		/*
		* caso admin que tiene subniveles
		*/
		global $administracion_abrev_title ;
		global $proyectos_title ;
		global $usuarios_title ;
		global $actividad_title ;
		if( $nombre == $administracion_abrev_title && ($localizacion == $proyectos_title || $localizacion == $usuarios_title || $localizacion == $actividad_title || $localizacion == $ayuda_title.'admin') ) $selected = true ;
		
		$html = false ;
		if(!$selected)
		{
			# CASO NORMAL
			$html .= "\n<div class=\"$estilo\" onClick=\"javascript:top.location='$enlace';\" style=\"z-index:999\" >";
			$html .= "<a href=\"$enlace\" >$nombre</a>";
			$html .= '</div>' ;
			
		}else{
			# CASO PESTAÑA SELECCIONADA
			$html .= "\n<div class=\"$estiloSelected\" >";
			$html .= "<a>$nombre</a>";
			$html .= '</div>' ;
		}
		
		return $html ;
	}
	
	/*
	* Crea link de apartado. ejemplo: En CAPTACIONES (Captaciones, Informantes, Cintas)
	*/
	static function makeLink($nombre, $enlace, $estilo='linkSeccion', $estiloSelected='linkSeccionSelected') {
		
		global $localizacion, $localizacion2, $tesaurus_title, $modelo_title, $ayuda_title, $traduccion_title ;
		
		$selected = false ;
		
		/*
		* caso tesauro que tiene subniveles
		*/
		if($nombre==$tesaurus_title || $nombre==$modelo_title || strpos(" $localizacion", $ayuda_title))
		{
			if( $localizacion2 == $nombre ) $selected = true ;
		}else{
			if( $localizacion2 == $nombre || $localizacion == $nombre ) $selected = true ;
		}
				
		
		$html = false ;	
		if(!$selected)
		{
			# CASO NORMAL
			$html .= "<a class=\"$estilo\" href=\"$enlace\">$nombre</a>";
			
		}else{
			# CASO SELECCIONADO
			$html .= "<a class=\"$estiloSelected\">$nombre</a>";
		}
		
		return $html ;
	}
	
	
	/*
	* crear situación actual
	*/
	static function crearSituacion($zonaAct, $localizacion2) {
		
		$html = false ;
		
		$html .= "<div id=\"infoSituacion\">";
		$html .= "<strong>$zonaAct</strong> : $localizacion2 ";
		$html .= "</div>";
		
		return $html ;
	}
	
	/*
	* Crea link de acción. ejemplo: En Informantes (Nuevo informante)
	*/
	static function makeLinkAccion($nombre, $enlace, $accion=false, $estilo='linkAccion', $estiloSelected='linkAccionSelected')	{
		
		$selected 	= false ;	
		$html 		= false ;
		global $localizacion ;
		global $localizacion2 ;
		if( $localizacion2 == $nombre || $localizacion == $nombre ) $selected = true ;
		
		/*
		* caso municipios de nivel 3
		*/
		if(isset($_GET['t'])) $t = safe_xss($_GET['t']);
		global $municipios_title ;
		global $comarcas_title ;
		global $provincias_title ;
		global $comunidades_title ;
		global $paises_title ;
		if( $nombre == $municipios_title && $t ) 					$selected = false ;	
		if( $nombre == $comarcas_title && $t == 'comarca' ) 		$selected = true ;
		if( $nombre == $provincias_title && $t == 'provincia' ) 	$selected = true ;
		if( $nombre == $comunidades_title && $t == 'comunidad' )	$selected = true ;
		if( $nombre == $paises_title && $t == 'pais' ) 				$selected = true ;
		
		/*
		* caso jerarquia de nivel 3
		
		global $volver_title ;
		global $a_title ;
		global $jernomia_title ;
		if( $nombre == "$volver_title $a_title $jernomia_title" ) 	$selected = false ;
		*/
		$icono = false ;	
		if($accion=='new') $icono 		= "<img src=\"../images/iconos/bullet_mas.png\" align=\"absmiddle\" border=\"0\">";
		if($accion=='standar') $icono 	= "<img src=\"../images/iconos/bullet1_back.png\" align=\"absmiddle\" border=\"0\">";
		
		if(!$selected) {
			
			# CASO NORMAL
			$html .= "<a class=\"$estilo\" href=\"$enlace\">";
			$html .= $icono ;
			$html .= $nombre ;
			$html .= "</a>";
			
		}else{
			# CASO SELECCIONADO
			$html .= "<a class=\"$estiloSelected\" >";
			$html .= $icono ;
			$html .= $nombre ;
			$html .= "</a>";
		}
		
		
		
		return $html ;
	}





}

?>