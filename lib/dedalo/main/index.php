<?php
$TIMER['main_start']=microtime(1);
/**
* MAIN PAGE ######################################################################################
* Crea un objeto de página (habitualmente una sección o un tool) a partir de la información recibida 
* y la pasa a la clase 'html_page' para construir la página a visualizar.
*
*/
require dirname(dirname(__FILE__)).'/config/config4.php';

$TIMER['config4_includes']=microtime(1);

# Avoid this page is showed inside external iframes 
header('X-Frame-Options: SAMEORIGIN');
# Avoid mim change content type
#header('X-Content-Type-Options: nosniff');

# FORCE REDIRECT TO DEDALO/MAIN 
/*
if ( strpos($_SERVER["REQUEST_URI"], '.php')!==false ) {
	header("HTTP/1.1 301 Moved Permanently");
	header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".MAIN_FALLBACK_SECTION);
	exit();
}
*/

	# set vars
	$vars = array('t','tipo','m','modo','id','h','parent');
		foreach($vars as $name) $$name = common::setVar($name);


	if(SHOW_DEBUG===true) {
		if ($tipo) {
			debug_log(__METHOD__." Plese use 't' instead 'tipo' in request! ".to_string(), logger::DEBUG);
		}
	}

	if($t!==false) $tipo = $t;
	if($m!==false) $modo = $m;


	# Safe tipo test
	# When tipo is defined, check if is valid (avoid sql injection)
	if ($tipo!==false) {		
		if (safe_tipo($tipo)===false) die("Bad tipo");
	}

	#
	# TIPO : Verify
	# IS MANDATORY. Verify tipo received is valid. If not, redirect to default fallback section
	if( empty($tipo) || false===verify_dedalo_prefix_tipos($tipo)) {
		$tipo_to_msg 						= 'empty';
		if (strlen($tipo)>0) $tipo_to_msg 	= 'not valid';
		$msg = "Error Processing Request: Main Page tipo:'$tipo' is $tipo_to_msg! Main Page redirected to secure MAIN_FALLBACK_SECTION: ".MAIN_FALLBACK_SECTION." ".RecordObj_dd::get_termino_by_tipo(MAIN_FALLBACK_SECTION);
		debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
		
		if (verify_dedalo_prefix_tipos(MAIN_FALLBACK_SECTION)) {
			header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".MAIN_FALLBACK_SECTION);
		}else{
			header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".DEDALO_AREA_ROOT_TIPO); # Avoid loop on misconfig
		}	
		exit();
	}


	#
	# MODO : list, edit, etc..
	# @ default 'list'
	# @ Si se pasa id, default 'edit'
	if( empty($modo) ) {
		$modo = 'list';
		if( !empty($id) ) {
			$modo = 'edit';
		}
	}
	navigator::set_selected('modo', $modo);	# Fix modo
	

	#
	# ID :
	# Force id type as int
	if(strlen($id)>0) $id = intval($id);
	# If id==0, redirect to current section in list mode
	if ($modo==='edit' && $id<1) {		
		$msg = "Error Processing Request: Main Page id:'$id' is not valid! Main Page redirected to modo 'list' and requested tipo: ".$tipo. " ". RecordObj_dd::get_termino_by_tipo($tipo);
		debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
		header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".$tipo."&m=list");
		exit();		
	}


	$TIMER['begin_html_page']=microtime(1);
	
	#
	# MODO SWITCH
	switch(true) {		

		# TOOLS GENERIC
		case (strpos($modo, 'tool_')===0) :
				
				# build element (component / section)
				$tool_name 	 = $modo;

				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				switch (true) {
					
					case ($modelo_name==='section_tool 99999'):

						$current_section_id   = !empty($id) ? $id : null;
						$current_section_tipo = isset($_REQUEST['section_tipo']) ? safe_tipo($_REQUEST['section_tipo']) : null;
						
						/*
						$RecordObj_dd 		 = new RecordObj_dd($tipo);
						$current_propiedades = $RecordObj_dd->get_propiedades(true);	
						if (!isset($current_propiedades->context->target_section_tipo)) {
							trigger_error("Undefined propiedades->context->target_section_tipo in structure of section_tool $tipo");
						}
						*/
						$element = section::get_instance($current_section_id, $current_section_tipo);
						$element->set_tool_section_tipo($tipo);						

						#
						# FIX SECTION TIPO
						define('SECTION_TIPO', $current_section_tipo);
						break;
					
					case ($modelo_name==='section'):

						$current_section_id = !empty($id) ? $id : null;
						$element = section::get_instance($current_section_id, $tipo);
	
						#
						# FIX SECTION TIPO
						define('SECTION_TIPO', $tipo);
						break;
					
					case (strpos($modelo_name,'component')!==false):

						// section tipo
							$section_tipo = isset($_REQUEST['section_tipo']) ? safe_tipo($_REQUEST['section_tipo']) : null;
						
						#
						# FIX SECTION TIPO
						define('SECTION_TIPO', $section_tipo);

						if ($modo==='tool_portal') {
							$element = component_common::get_instance($modelo_name, $tipo, $parent, $modo, DEDALO_DATA_NOLAN, $section_tipo);
							$target_section_tipo = isset($_REQUEST['target_section_tipo']) ? safe_tipo($_REQUEST['target_section_tipo']) : false;
							$element->set_target_section_tipo($target_section_tipo);
								
						}else{
							$tool_source_component_lang = isset($_GET['lang']) ? safe_lang($_GET['lang']) : DEDALO_DATA_LANG;
							$element = component_common::get_instance($modelo_name, $tipo, $parent, 'edit', $tool_source_component_lang, $section_tipo);
						}
						break;

					default:
						$element = null;
				}				
				#dump($element, ' element ++ '.to_string($modo));
				
				# Build tool
				$tool_obj 		= new $tool_name($element, 'page');
				$content		= $tool_obj->get_html();

				$html 			= html_page::get_html($content);
				print($html);
				break;
		
		# SECTION
		case ($modo==='edit' || $modo==='list' || $modo==='section_tool') :	

				#
				# MODELO_NAME : Can be section / area 
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				tools::$globals['modelo_name'] = $modelo_name;

				try {			

					switch(true) {

						case ($modelo_name==='section') :

								$element_obj = section::get_instance($id, $tipo, $modo);
									#dump($element_obj," element_obj");
									#$element_obj->set_caller_id($caller_id);

								# FIX SECTION TIPO
								define('SECTION_TIPO', $tipo);
								break;
						
						case ($modelo_name==='section_tool') :

								# Confiure section from section_tool data
								$RecordObj_dd = new RecordObj_dd($tipo);
								$propiedades  = json_decode($RecordObj_dd->get_propiedades());
									#dump($propiedades->context->target_section_tipo, ' propiedades ++ '.to_string());

								$section_tipo = $propiedades->context->target_section_tipo;
								
								$element_obj = section::get_instance($id, $section_tipo, $modo);
								
								# Fix section_tool context params
								$element_obj->context = (object)$propiedades->context;

								# FIX SECTION TIPO
								define('SECTION_TIPO', $section_tipo);
								break;

						case (strpos($modelo_name, 'area')===0) :
						
								$element_obj = new $modelo_name($tipo, $modo);
								break;

						default :	
								#throw new Exception("Error Processing Request: modelo name '".safe_xss($modelo_name)."' not valid (1)", 1);									
								$msg = "Error Processing Request: modelo name: '".$modelo_name."' is not valid for main page tipo ";
								debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
								
								if (verify_dedalo_prefix_tipos(MAIN_FALLBACK_SECTION)) {
									header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".MAIN_FALLBACK_SECTION);
								}else{
									header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".DEDALO_AREA_ROOT_TIPO); # Avoid loop on misconfig
								}	
								exit();									
								break;						
					}

				} catch (Exception $e) {

					debug_log(__METHOD__." Exception occurred when create section element: ".to_string( $e->getMessage() ), logger::DEBUG);
					
					#
					# NO ENOUGHT INFO FOR CREATE A SECTION
					# Create a default area_root section
					# If we are not logged, when html_page::get_html is called, we jump to login window
					# When login, we go to current created 'area_root' section
					#
					# Try again create a section (by model name 'area_root') 
					$element_obj = new area_root(DEDALO_AREA_ROOT_TIPO, 'list');						
				}


				if(empty($element_obj) || !is_object($element_obj)) {
					die("<hr><h3>Error on create section. Please define a valid section</h3>");		
				}	


				# NAVIGATOR . Fixx tipo
				navigator::set_selected('area', $tipo); # Fix area
				

				# HTML CONTENT
				$html = html_page::get_html( $element_obj );

				print($html);
				break;

		default : # MODO NOT VALID
				die("main: used modo is not valid");
				break;	
	}


	# CLOSE DB CONNECTION
	# dump(DBi::_getConnection());	
	pg_close(DBi::_getConnection());

	# Write session to unlock session file
	session_write_close();
	
/*
if(SHOW_DEBUG===true) {
	$TIMER['main_end']=microtime(1);
	echo "<table id=\"load_time_table\"><tr><td>name</td><td>so far</td><td>delta</td><td>%</td></tr>";
	reset($TIMER);
	$start=$prev=current($TIMER);
	$total=end($TIMER)-$start;
	foreach($TIMER as $name => $value) {
		$sofar=round($value-$start,3);
		$delta=round($value-$prev,3);
		if($delta>0.025) {
			if($delta>0.1) {
				$delta="<span class=\"error\">$delta</span>";
			}else{
				$delta="<span class=\"warning\">$delta</span>";
			}			
		}
		$percent=round($delta/$total*100);
		echo "<tr><td>$name</td><td>$sofar s</td><td>$delta s</td><td>$percent</td></tr>";
		$prev=$value;
	}
	echo "<tr><td>PHP memory usage</td><td>".tools::get_memory_usage('pid')."</td><td></td><td></td></tr>";
	echo "</table>";
}
*/
#dump(get_included_files(),"get_included_files");
?>