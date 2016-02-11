<?php

class js {

	static $ar_url = array();
	
	
	# JS LINK CODE . RETURN COMBINATED JS LINKS FOR INSERT IN HEADER  
	public static function get_js_link_code() {
		global $modo;
		
		$html 	= '';		
		
		# Insertamos las librerías principales			
			$ar_url_basic 	= array();

			# JQUERY LIBS
			$ar_url_basic[] = JQUERY_LIB_URL_JS;
			$ar_url_basic[] = JQUERY_UI_URL_JS;
			#$ar_url_basic[] = JQUERY_TABLESORTER_JS;
			$ar_url_basic[] = DEDALO_ROOT_WEB . '/lib/jquery/jquery.cookie.js' ;
			#$ar_url_basic[] = DEDALO_ROOT_WEB . '/lib/head/head.load.min.js' ;
			#$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/component_image/js/component_image_read.js' ;
			#$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/component_geolocation/js/component_geolocation_read.js' ;
			#$ar_url_basic[] = DEDALO_ROOT_WEB .'/lib/jquery/jquery.fullscreen-min.js';
			#$ar_url_basic[] = DEDALO_ROOT_WEB .'/lib/paper/dist/paper-full.min.js';
			
			# GRIDSTER
			#$ar_url_basic[] = DEDALO_ROOT_WEB .'/lib/jquery/gridster/jquery.gridster.min.js';

			# PAGE LIBS
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/html_page/js/html_page.js';

			# LOGIN
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/login/js/login.js';

			# MENU
			# $ar_url_basic[] = DEDALO_LIB_BASE_URL . '/menu/js/menu.js' ;

			# COMMON LIBS
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/common/js/common.js';
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/tools/tool_common/js/tool_common.js';
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/tools/tool_portal/js/tool_portal.js'; // Cuando añadimos un fragmento, no está disponible..
			#$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/common/js/labels.php';
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/common/js/lang/'.DEDALO_APPLICATION_LANG.'.js';
			
			# SEARCH		
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/search/js/search.js' ;

			# COMPONENT_PORTAL
			#$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/component_portal/js/component_portal.js';

			switch ($modo) {
				case 'edit':
					$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/tools/tool_indexation/js/tool_indexation.js';
				case 'list':
					$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/tools/tool_time_machine/js/tool_time_machine.js';
					$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/tools/tool_update_cache/js/tool_update_cache.js';
					break;
			}
				
			# Ponemos las librerías básicas al principio de la lista
			js::$ar_url = array_merge($ar_url_basic, js::$ar_url);

		
		# Recorremos los elemetos usados, por modeloID es decir: root=dd117, etc..
		$ar_excepciones  		= array('relation_list');
		$ar_loaded_modelos_name = array_unique(common::$ar_loaded_modelos_name);	#dump($ar_loaded_modelos_name,"ar_loaded_modelos_name");		
		foreach($ar_loaded_modelos_name as $modelo_name) {
			
			#$modelo_name = RecordObj_dd::get_termino_by_tipo($modeloID);
			
			# Load específico del componente actual
			if (!in_array($modelo_name, $ar_excepciones)) {
				js::$ar_url[] 	= DEDALO_LIB_BASE_URL . '/'. $modelo_name .'/js/'. $modelo_name .'.js';				
			}			
		}
		# Portales
		if (in_array(DEDALO_LIB_BASE_URL . '/component_portal/js/component_portal.js', js::$ar_url)) {

			js::$ar_url[] = DEDALO_LIB_BASE_URL . '/tools/tool_portal/js/tool_portal.js';

			/**
			* PROVISIONAL !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			*//*		
			#dump(js::$ar_url,'js::$ar_url');
			# Si se carga 'component_score' desde un portal, cargar todas sus librerías
			foreach (js::$ar_url as $current_url) {
				switch (true) {
					case (strpos($current_url, 'component_score_DES')!==false):
						# JS includes SCORE	
							# MIDI
							js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/MIDI/MIDI.min.js';
							# MIDI BYNARY
							js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/MIDI/inc/base64binary.js';
							# VEXFLOW
							js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/vexflow/vexflow-min.js';
							# UNDERSCORE
							js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/vextab/support/underscore-min.js';
							# TAB-DIV
							js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/vextab/tabdiv-min.js';
							# PLAYER
							js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/vexflow/vextab/output/player.js';							
							break;
					case (strpos($current_url, 'component_image')!==false && $modo=='edit'):
						# JS includes IMAGE	
							js::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_image/js/component_image_read.js';
							break;
					default:
						# code...
							break;
				}#end switch (true) {
			}#foreach (js::$ar_url as $current_url)	
			*/
		}#END if (in_array(DEDALO_LIB_BASE_URL . '/component_portal/js/component_portal.js', js::$ar_url)) {

		# TOOLS SPECIFIC
		#if (strpos($modo, 'tool_')!==false) {
		#	js::$ar_url[] = DEDALO_LIB_BASE_URL . '/tools/'.$modo.'/js/'.$modo.'.js?'.DEDALO_VERSION;
		#}


		# eliminamos las duplicidades de links	
		js::$ar_url = array_unique(js::$ar_url);	#dump($ar_url);


		# ITERATE AR_URL TO BUILD FINAL HTML
		foreach (js::$ar_url as $url) {
				
			# Si hay algún componente, le insertamos antes el component_common (una vez)
			if( strpos($url,'component_')!==false && !isset($added_component_commons) ) {

				# component common functions	
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_common/js/component_common.js' );

				# inspector functions
				#if($modo=='edit')
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/inspector/js/inspector.js' );						

				# component relation .En algunos contextos es necesario el js de component_relation aunque no tengamos cargado el componente. Por tanto lo cargaremos siempre				
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_relation/js/component_relation.js' );

				# button delete .En algunos contextos es necesario el js de button_delete aunque no tengamos cargado el componente. Por tanto lo cargaremos siempre
				if(navigator::get_selected('modo')=='list') {
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/button_delete/js/button_delete.js' );
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/button_stats/js/button_stats.js' );
				}
				

				# tool common
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/tools/tool_common/js/tool_common.js' );
				
				$current_context = navigator::get_selected('context');
				if (strpos($current_context, 'tool_portal')!==false) {
					$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/tools/tool_portal/js/tool_portal.js' );
				}

				$added_component_commons = true;		
			}
				
			

			# Si se carga un componente tex_area cargamos la librería tinymce y especiíficas
			if( strpos($url,'component_text_area')!== false && !isset($added_component_text_area_commons) && navigator::get_selected('modo')!='list' ) {
				# Tinymce
				$html .= self::build_tag( TEXT_EDITOR_URL_JS );				
				
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_text_area/js/text_editor.js' );
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/tools/tool_indexation/js/tool_indexation.js' );						
				$added_component_text_area_commons = true;		
			}

			# Si se carga un componente html_text cargamos la librería tinymce y especiíficas
			if( strpos($url,'component_html_text')!== false && !isset($added_component_html_text_commons) && navigator::get_selected('modo')!='list' ) {
				# Tinymce
				$html .= self::build_tag( TEXT_EDITOR_URL_JS );
				
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_html_text/js/component_html_text_editor.js' );
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/tools/tool_indexation/js/tool_indexation.js' );						
				$added_component_html_text_commons = true;		
			}

			# Si se carga un componente av cargamos el tool
			if( strpos($url,'component_av')!== false && !isset($added_component_av_commons) ) {
				#$html .= self::build_tag( DEDALO_UPLOADER_URL . '/js/jquery.fileupload.js');						
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/tools/tool_upload/js/tool_upload.js' );	
				#$added_component_av_commons = true;		
			}			

			# EVITA DUPLICIDADES
			if(strpos($html,$url)===false)					
			$html .= self::build_tag($url);
		}

		return $html;
	}



	/**
	* BUILD_TAG
	*/
	public static function build_tag($url) {
		if (strpos($url, 'section_group_')!==false) return null;

		// LOCAL VERIONS
		if (!USE_CDN) {
			/*
			if(SHOW_DEBUG) {
				#$url .= "?".date("ymdhis");
			}else{
				if (strpos($url, 'labels')===false) {
					#$url .= "?".date("ymd");
				}				
			}
			*/
			$url = $url.'?v='.DEDALO_VERSION;
			return "\n<script src=\"$url\" type=\"text/javascript\" charset=\"utf-8\"></script>";
		}

		// CDN VERSIONS
		switch ($url) {
			case JQUERY_LIB_URL_JS:
				return "\n<script src=\"//ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js\"></script>\n<script>window.jQuery || document.write('<script src=\"".JQUERY_LIB_URL_JS."\"><\/script>')</script>";
				break;
			case JQUERY_UI_URL_JS:
				return "\n<script src=\"//code.jquery.com/ui/1.11.1/jquery-ui.min.js\"></script>\n<script>window.jQuery.ui || document.write('<script src=\"".JQUERY_UI_URL_JS."\"><\/script>')</script>";
				break;
			case PAPER_JS_URL: 
				$url='//cdn.jsdelivr.net/paperjs/0.9.20/paper-core.min.js';	# //cdnjs.cloudflare.com/ajax/libs/paper.js/0.9.9/paper.min.js
				return "\n<script src=\"$url\"></script>\n<script>window.paper || document.write('<script src=\"".PAPER_JS_URL."\"><\/script>')</script>";
				break;	
			case TEXT_EDITOR_URL_JS: # @see http://www.tinymce.com/wiki.php/Configuration:external_plugins
				return "\n<script src=\"//tinymce.cachefly.net/4.1/tinymce.min.js\"></script>\n<script>window.tinymce || document.write('<script src=\"".TEXT_EDITOR_URL_JS."\"><\/script>')</script>";
				break;
			case D3_URL_JS:
				$url='//cdn.jsdelivr.net/d3js/3.1.6/d3.min.js';
				return "\n<script src=\"$url\"></script>\n<script>window.d3 || document.write('<script src=\"".D3_URL_JS."\"><\/script>')</script>";
				break;
			case NVD3_URL_JS:
				$url='//cdn.jsdelivr.net/nvd3/1.1.15-beta/nv.d3.min.js';
				return "\n<script src=\"$url\"></script>\n<script>window.nv || document.write('<script src=\"".NVD3_URL_JS."\"><\/script>')</script>";
				break;			
			default:

				if (strpos($url, DEDALO_HOST)===false) {
					$url = 'http://'.DEDALO_HOST.$url;
				}

				if(SHOW_DEBUG) {
					$url .= "?".date("m.d.y.h");	#DEDALO_VERSION; .i.s
				}
				return "\n<script src=\"$url\" type=\"text/javascript\" charset=\"utf-8\"></script>";
		}	
	}
	
	
}


?>