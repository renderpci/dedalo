<?php
$TIMER['main_start']=microtime(1);
/**
* MAIN PAGE ######################################################################################
* Crea un objeto de página (habitualmente una sección o un tool) a partir de la información recibida y la pasa a 'html_page' para construir la página
* a visualizar.
*
*/
require_once(dirname(dirname(__FILE__)).'/config/config4.php');

$TIMER['config4_includes']=microtime(1);

# FORCE REDIRECT TO DEDALO/MAIN 
/*
if ( strpos($_SERVER["REQUEST_URI"], '.php')!==false ) {
	header("HTTP/1.1 301 Moved Permanently");
	header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".MAIN_FALLBACK_SECTION);
	exit();
}
*/

	#dump($_SESSION,"");

	# set vars
	$vars = array('t','tipo','m','modo','id','h','parent');
	foreach($vars as $name) $$name = common::setVar($name);


	if(SHOW_DEBUG) {
		if ($tipo) {
			trigger_error("Plese use 't' instead 'tipo' in request! ");
		};
	}

	if($t) $tipo = $t;
	if($m) $modo = $m;


	#
	# TIPO : Verify
	# IS MANDATORY. Verify tipo received is valid. If not, redirect to default fallback section
	if( !(bool)verify_dedalo_prefix_tipos($tipo) ) {
		$tipo_to_msg 						= 'empty';
		if (strlen($tipo)>0) $tipo_to_msg 	= 'not valid';		
		$msg = "Error Processing Request: Main Page tipo:'$tipo' is $tipo_to_msg! Main Page redirected to secure MAIN_FALLBACK_SECTION: ".MAIN_FALLBACK_SECTION." ".RecordObj_dd::get_termino_by_tipo(MAIN_FALLBACK_SECTION);
		if(SHOW_DEBUG) {
			error_log($msg);
		}
		
		if (verify_dedalo_prefix_tipos(MAIN_FALLBACK_SECTION)) {
			header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=".MAIN_FALLBACK_SECTION);
		}else{
			header("Location: ".DEDALO_LIB_BASE_URL."/main/?t=dd242"); # Avoid loop on misconfig
		}	
		exit();
	}

	#
	# MODO : list, edit, etc..
	# @ default 'list'
	# @ Si se pasa id, default 'edit'
	if( empty($modo) ) {
		$modo = 'list';
		if( !empty($id) ) $modo = 'edit';
	}
	navigator::set_selected('modo', $modo);	# Fix modo
	


	#
	# ID :
	# Force id type as int
	if(strlen($id)) $id = intval($id);
	# If id==0, redirect to current section in list mode
	if ($modo=='edit' && $id<1) {
		$msg = "Error Processing Request: Main Page id:'$id' is not valid! Main Page redirected to modo 'list' and requested tipo: ".$tipo. " ". RecordObj_dd::get_termino_by_tipo($tipo);
		error_log($msg);
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
					
				if ($modelo_name=='section') {

					$element = section::get_instance(null, $tipo);

					#
					# FIX SECTION TIPO
					define('SECTION_TIPO', $tipo);
				
				}else{

					$section_tipo = isset($_REQUEST['section_tipo']) ? $_REQUEST['section_tipo'] : null;

					#
					# FIX SECTION TIPO
					define('SECTION_TIPO', $section_tipo);

					if ($modo=='tool_portal') {
						$element = component_common::get_instance($modelo_name, $tipo, $parent, $modo, DEDALO_DATA_NOLAN, $section_tipo); 	#dump($modo, ' modo');
					}else{
						$element = component_common::get_instance($modelo_name, $tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);
					}
				}

				# build tool
				$tool_obj 		= new $tool_name($element, 'page');
				$content		= $tool_obj->get_html();

				$html 			= html_page::get_html($content);				
				print($html);
				break;
		
		# SECTION
		case ($modo=='edit' || $modo=='list') :	
				
				# Si tenemos el id pero no el tipo, paramos (el tipo es necesario siempre para identificar la tabla)
				if($id>0 && empty($tipo)) {
					throw new Exception("Sorry. 'tipo' is mandatory", 1);					
				}

				/*
				# Averiguamos el modelo del tipo pasado. Lo usaremos commo nombre de la clase del nuevo objeto a crear (usualmente section)
				if(!empty($tipo)) {
					#$RecordObj_dd 	= new RecordObj_dd($tipo);
					#$modelo_name 	= $RecordObj_dd->get_modelo_name();
					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				}else{
					$modelo_name 	= 'section';
				}
				*/

				# MODELO_NAME : Can be section / area 
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);#'section';
				tools::$globals['modelo_name'] = $modelo_name;
					#dump($modelo_name,'$modelo_name');

				# Force 'section'
				#$modelo_name = 'section';

				try {			

					switch(true) {

						case ($modelo_name=='section') :
									
									$element_obj = section::get_instance($id, $tipo, $modo);
										#dump($element_obj," element_obj");
									#$element_obj->set_caller_id($caller_id);

									# FIX SECTION TIPO
									define('SECTION_TIPO', $tipo);
									break;

						case (strpos($modelo_name, 'area')!==false) :
									$element_obj = new $modelo_name($tipo, $modo);	#__construct($id=NULL, $tipo=false, $modo='edit') 											
									break;

						default :	throw new Exception("Error Processing Request: modelo name '$modelo_name' not valid (1)", 1);
									break;
						
					}

				} catch (Exception $e) {
					
					/**
					* NO ENOUGHT INFO FOR CREATE A SECTION
					* Create a default area_root section
					* If we are not logged, when html_page::get_html is called, we jump to login window
					* When login, we go to current created 'area_root' section
					*/
					# Search default 'area_root' tipo
					$modelo_name 	= 'area_root';
					$ar_terminoID 	= RecordObj_dd::get_ar_terminoID_by_modelo_name($modelo_name, $prefijo='dd');	#dump($modelo_name,'$ar_terminoID: ' . dump($ar_terminoID));
					if (!empty($ar_terminoID[0])) {
						$tipo = $ar_terminoID[0];
					}else{
						throw new Exception("Error Processing Request. 'area_root' is not found ! (modelo_name:$modelo_name)", 1);			
					}

					# Try again create a section (by model name 'area_root') 
					$element_obj = new $modelo_name($tipo, $modo='list');	
							

					if(empty($element_obj) || !is_object($element_obj)) {

						echo 'Exception: ' .$e->getMessage();
						
						if(strpos(DEDALO_HOST, 'localhost')!==false) {
							#dump($e,'exception $e');
							#dump( $_REQUEST, '$_REQUEST' );
						}		

						die("<hr><h3>Error on create section. Please define a valid section</h3>");				
					}		
				}
				

				#dump($element_obj); #die();
				#$html = $element_obj->get_html();	die($html);
		
				# NAVIGATOR 
				navigator::set_selected('area', $tipo);


				

				$html = html_page::get_html( $element_obj );

				print($html);
				break;


		default : # MODO NOT VALID
				throw new Exception("main: used modo: '$modo' is not valid in page vars!", 1);
				break;	
	}


	#dump( RecordDataBoundObject::$ar_RecordDataObject_query_search,'$ar_RecordDataObject_query_search');

	# CLOSE DB CONNECTION
	# dump(DBi::_getConnection());	
	pg_close(DBi::_getConnection());
	
	
	
/*
//if(SHOW_DEBUG) {
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
//}
*/
#dump(get_included_files(),"get_included_files");
?>