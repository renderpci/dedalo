<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( dirname(__FILE__) .'/class.tool_layout_print.php'); 
require_once( DEDALO_LIB_BASE_PATH .'/common/class.exec_.php'); 
	
if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print dd_error::wrap_error($string_error);
	die();
}


# set vars
$vars = array('mode','type','html_content','dato','layout_label','template_id','component_layout_tipo','section_target_tipo','section_layout_id','section_layout_tipo');	// ,'tipo','parent','layout_section'
	foreach($vars as $name) $$name = common::setVar($name);


# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode.. </span>");


/**
* SAVE_LAYOUT
* Store DOM html of page in component_layout
*/
if($mode==='save_template') {

	#$vars = array('section_layout_id','section_layout_tipo','layout_label','component_layout_tipo','type','html_content');
		#foreach($vars as $name) $$name = common::setVar($name);

	if(empty($component_layout_tipo)) 	exit('Error: component_layout_tipo not defined');
	#if(empty($parent)) 				exit('Error: parent not defined');
	if(empty($type)) 		 			exit('Error: type not defined'); // component layout type
	if(empty($html_content)) 			exit('Error: html_content not defined');
	if(empty($dato)) 					exit('Error: dato not defined');

	if(empty($section_layout_tipo)) 	exit('Error: section_layout_tipo not defined');
	if(empty($section_target_tipo)) 	exit('Error: section_target_tipo not defined');
	if(empty($layout_label)) 			exit('Error: layout_label not defined');

	/* reference only:
		# COMPONENT SECTION
		define('DEDALO_LAYOUT_PUBLIC_COMPONENT_SECTION_TIPO'	, 'dd67'); # pública
		define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_SECTION_TIPO' , 'dd61'); # Privada

		# COMPONENT LAYOUT
		define('DEDALO_LAYOUT_PUBLIC_COMPONENT_LAYOUT_TIPO'		, 'dd39'); # pública
		define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_LAYOUT_TIPO'	, 'dd23'); # Privada

		# COMPONENT TEXT (LABEL / TEMPLATE NAME) Like 'Template One'
		define('DEDALO_LAYOUT_PUBLIC_COMPONENT_LABEL_TIPO'		, 'dd38'); # pública
		define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_LABEL_TIPO'	, 'dd29'); # Privada
		*/

	# Verify tipo is accepted and set components to save label and section info
	switch ($component_layout_tipo) {
		case DEDALO_LAYOUT_PUBLIC_COMPONENT_LAYOUT_TIPO : // Public
			$component_section_tipo = DEDALO_LAYOUT_PUBLIC_COMPONENT_SECTION_TIPO;
			$component_label_tipo 	= DEDALO_LAYOUT_PUBLIC_COMPONENT_LABEL_TIPO;
			break;
		case DEDALO_LAYOUT_TEMPLATES_COMPONENT_LAYOUT_TIPO : // Privada
			$component_section_tipo = DEDALO_LAYOUT_TEMPLATES_COMPONENT_SECTION_TIPO;
			$component_label_tipo 	= DEDALO_LAYOUT_TEMPLATES_COMPONENT_LABEL_TIPO;
			break;
		default:
			throw new Exception("Error Processing Request", 1);
	}


	#
	# SECTION
		if (empty($section_layout_id)) {
			$section = section::get_instance(null, $section_layout_tipo);
			$section_layout_id = $section->Save();
		}
		if (empty($section_layout_id)) {
			throw new Exception("Error Processing Request", 1);			
		}
		if(SHOW_DEBUG===true) {
			error_log("Generated section_layout_id:  $section_layout_id - tipo:$section_layout_tipo");
		}

	#
	# LAYOUT DATA . COMPONENT_LAYOUT (template data)
		$component_layout = component_common::get_instance('component_layout',$component_layout_tipo,$section_layout_id,'edit',DEDALO_DATA_NOLAN,$section_layout_tipo);
		$original_dato    = $component_layout->get_dato();
		if(!empty($original_dato) && !is_object($original_dato)) {
			$original_dato = new layout_print();
				$original_dato->$type = array();
		}
		
		#
		# DATO REQUEST (json stringnified)		
		$dato	= json_decode($dato);
		if(!is_object($dato)) {			
			debug_log(__METHOD__." Error: dato wrong format ".to_string($dato), logger::ERROR);
			exit('Error: dato wrong format.');
		}
		if (!is_array($dato->$type)) {			
			debug_log(__METHOD__."Error: expected array. dato->type:  ".to_string($dato->$type), logger::ERROR);
			exit('Error: dato->type wrong format. Array expected');
		}

		#
		# WRITE / OVERWRITE CURRENT DATO OBJECT
		$original_dato->$type = (array)$dato->$type;	// Insert part
		$original_dato_string = json_encode($original_dato); // Always set as string
		
				
		$component_layout->set_dato( $original_dato_string );
		$component_layout->Save();
		

	#
	# SECTION TARGET 
		$component_input_text = component_common::get_instance('component_input_text',$component_section_tipo,$section_layout_id,'edit',DEDALO_DATA_NOLAN,$section_layout_tipo);
		$component_input_text->set_dato($section_target_tipo);
		$component_input_text->Save();
			

	#
	# LABEL
		$component_input_text = component_common::get_instance('component_input_text',$component_label_tipo,$section_layout_id,'edit',DEDALO_DATA_LANG,$section_layout_tipo);
		$component_input_text->set_dato($layout_label);
		$component_input_text->Save();
		

	#
	# Update session label name
	$ar_templates_mix = (array)$_SESSION['dedalo4']['config']['ar_templates_mix'];
	foreach ((array)$ar_templates_mix as $key => $obj_value) {
		if ($obj_value->section_id==$section_layout_id && 
			$obj_value->component_layout_tipo==$component_layout_tipo
			) {
			$_SESSION['dedalo4']['config']['ar_templates_mix'][$key]->label 			  = (string)$layout_label;	# Update session layout_label
			$_SESSION['dedalo4']['config']['ar_templates_mix'][$key]->section_layout_dato = (object)$dato;			# Update session section_layout_dato
			break;
		}
	}


	echo (int)$section_layout_id;
	exit();
}//end if( $mode==='save_layout' ) 



/**
* RENDER_PDF
* Trigger terminal command and return result
* @return string $result
*/
if($mode==='render_pdf') {

	// Free browser session
		session_write_close();

	$response = new stdClass();	
		$response->msg 	 = '';
		$response->debug = array();

	$render_pdf_data = common::setVar('render_pdf_data');
	if (empty($render_pdf_data) || !json_decode($render_pdf_data)) {
		$response->msg .= "Sorry. Invalid/empty argument";
		debug_log(__METHOD__." $response->msg : render_pdf_data ".to_string(), logger::ERROR);
		echo json_encode($response);
		exit;
	}

	$render_pdf_data = json_decode($render_pdf_data);
	

	foreach ((array)$render_pdf_data as $key => $command_obj) {
		$element_html = '';
		

		$command 	= rawurldecode($command_obj->command);
		# Check valid command
		if (strpos($command, DEDALO_PDF_RENDERER)!==0) {
			debug_log(__METHOD__." Security problem found! DEDALO_PDF_RENDERER not defined in current command ".to_string($command), logger::ERROR);
			continue;
		}

		$pdf_url 	= rawurldecode($command_obj->pdf_url);
		$pdf_path 	= rawurldecode($command_obj->pdf_path);
		$label 		= rawurldecode($command_obj->label);

		#
		# Exec command
		$result = exec_::live_execute_command($command,false);
		#$result  = shell_exec($command." ");	// > /dev/null 2>/dev/null &
		
		if(SHOW_DEBUG===true) {
			
			$response->debug[$key] = $result;

			$version  = shell_exec(DEDALO_PDF_RENDERER ." -V ");
			$response->debug[$key]['version'] = $version;
			$response->debug[$key]['path'] 	= DEDALO_PDF_RENDERER;		
		}

		if($result['exit_status'] === "0"){
			// command execution succeeds
			$element_html .= trim("<a href=\"$pdf_url\" class=\"icon_pdf_big\" target=\"_blank\"></a><label>View pdf file ".$label."</label>");		
		}else{
		    // command execution failure
		    $element_html .= trim("<span class=\"error\">Sorry. Error on render pdf file</span>");
		}

		if(SHOW_DEBUG===true) {
			$size = @ filesize($pdf_path);
			if ($size && $size>0) {
				$KB = (int)$size/1000 ;
				$element_html .= "<label>Filesize $KB KBytes</label>";
			}			
		}
		
		$response->msg .= "<li>".$element_html."</li>";
	}

	$response->msg = "<ul class=\"pdf_link_container\">".$response->msg."</ul>";

	echo json_encode($response); 
	return;
}//end render_pdf




/**
* DELETE_TEMPLATE
* Delete request template record 
* @return echo 'ok'
*/
if($mode==='delete_template') {

	if(empty($section_layout_tipo)) exit('Error: section_layout_tipo not defined');
	if(empty($section_layout_id)) 	exit('Error: section_layout_id not defined');


	#
	# Section
	$section = section::get_instance($section_layout_id, $section_layout_tipo);
	$result  = $section->Delete('delete_record');

	if(SHOW_DEBUG===true) {
		error_log($result);
	}

	echo "ok";
	exit();
}//end if( $mode==='delete_template' )



/**
* PRINT_PAGES
* 
* @return 
*/
if($mode==='print_pages') {	

	// Free browser session
		session_write_close();

	# Verify vars set in previous step (context_name=list)
	if( !isset($_SESSION['dedalo4']['config']['ar_templates_mix']) ||
		!isset($_GET['template_tipo']) ||
		!isset($_GET['template_id']) ||
		!isset($_GET['section_tipo'])
	  ) throw new Exception("Error Processing Request. Few vars are received", 1);

	# VARS
	$section_tipo 		= (string)safe_tipo($_GET['section_tipo']);	
	$section_layout_tipo= (string)safe_xss($_GET['template_tipo']);
	$section_layout_id 	= (string)safe_xss($_GET['template_id']);
	$ar_css_url 		= array(
							DEDALO_LIB_BASE_URL."/tools/tool_layout_print/css/tool_layout_render.css"
						);
	
	# Is set in search::get_records_data. NOTE: Only contain records in last visualized list page
	if (!isset($_SESSION['dedalo4']['config']['ar_templates_search_options'][$section_tipo])) {
		echo "Please select template"; return ;
	}
	$search_options = clone($_SESSION['dedalo4']['config']['ar_templates_search_options'][$section_tipo]);
	$ar_records		= search::get_records_data($search_options);
	
	$tool_layout_print_records = reset($ar_records->result);
		
	$ar_templates_mix = (array)$_SESSION['dedalo4']['config']['ar_templates_mix']; # Set in previous step (context_name=list)

	$array_key 	  = $section_layout_tipo .'_'. $section_layout_id;
	$template_obj = clone($_SESSION['dedalo4']['config']['ar_templates_mix'][$array_key]);

	$section_layout_label 	= isset($template_obj->label) ? $template_obj->label : '';
	$component_layout_tipo 	= $template_obj->component_layout_tipo;

	# component_layout
	$component_layout    = component_common::get_instance('component_layout',$component_layout_tipo,$section_layout_id,'print',DEDALO_DATA_NOLAN,$section_layout_tipo);
	$section_layout_dato = (object)$component_layout->get_dato();

	#
	# WRITE TO DISK
	$path_to_save = DEDALO_LIB_BASE_PATH .'/tools/tool_layout_print/data';
	$data = new stdClass();
		$data->template_obj 		= $template_obj;
		$data->section_layout_dato 	= $section_layout_dato;
		$data->ar_records 			= $ar_records;

	#
	# RENDER PAGES 
		$pages_rendered = '';
		if (isset($section_layout_dato->pages)) {
			$options = new stdClass();
				$options->pages 		= $section_layout_dato->pages;
				$options->records 		= $tool_layout_print_records;
				$options->render_type 	= 'render';

			$pages_rendered = tool_layout_print::render_pages( $options );
		}//end if (isset($section_layout_dato->pages)) {
	#$pages_rendered = '';

	# Aditional css / js
	$tool_name='tool_layout_print';
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_layout_print/css/tool_layout_edit.css";

	#
	# HTML FINAL
	$html  = '';
	$html .= "<html xmlns=\"http://www.w3.org/1999/xhtml\">";
	$html .= "\n<head>";
	$html .= "\n<meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\">";
	$html .= "\n<title>Dédalo Tool Layout Page</title>";
	$html .= css::get_css_link_code();
	foreach ($ar_css_url as $css_url) {
		//  media="screen" media=\"print\"
		$html .= "\n<link rel=\"stylesheet\" href=\"$css_url\" type=\"text/css\">";
	}

	
	$html .= "\n</head>";
	
	$html .= "\n<body>";
	$html .= "\n<div id=\"html_page_wrap\" style=\"display:block\">";
	$html .= "\n<div class=\"content_html\">";	
	$html .= "\n<div id=\"pages_container\">";	
		$html .= $pages_rendered;		
		/*
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/tools/tool_layout_print/html/tool_layout_print_render.phtml' );
		$html .= ob_get_clean();
		*/

	$html .= "\n</div>";
	$html .= "\n</div>";
	$html .= "\n</div>";
	$html .= "\n</body>";
	$html .= "\n</html>";

	echo $html;

	exit();
}//end if( $mode==='print_pages' ) {	
	


/**
* VIEW_ONE_PAGE
*/
if($mode==='view_one_page') {
	 
}//end view_one_page





die("Sorry. Mode not supported");
?>