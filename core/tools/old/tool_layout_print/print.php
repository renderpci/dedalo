<?php
/**
*
* PRINT
* This script render final document necessary to create the pdf file from DEDALO_PDF_RENDERER (wkhtmltopdf)
* Is accesible for DEDALO_PDF_RENDERER without login (user data is created from actual logged user)
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
require_once( dirname(__FILE__) .'/class.tool_layout_print.php'); 

	#
	# VERIFY VARS
		if( !isset($_REQUEST['template_tipo']) ) {
			debug_log(__METHOD__." Error Processing Request. Few vars are received (template_tipo) ".to_string(), logger::ERROR);
			return print('Error Processing Request. Few vars are received 1');
		}
		if( !isset($_REQUEST['template_id'])   ) {
			debug_log(__METHOD__." Error Processing Request. Few vars are received (template_id) ".to_string(), logger::ERROR);			
			return print('Error Processing Request. Few vars are received 2');
		}
		if( !isset($_REQUEST['section_tipo'])  ) {
			debug_log(__METHOD__." Error Processing Request. Few vars are received (section_tipo) ".to_string(), logger::ERROR);	
			return print('Error Processing Request. Few vars are received 3');
		}
		if( !isset($_REQUEST['section_id'])	   ) {
			debug_log(__METHOD__." Error Processing Request. Few vars are received (section_id) ".to_string(), logger::ERROR);
			return print('Error Processing Request. Few vars are received 4');
		}

	# VARS
		$section_tipo 		= (string)common::setVar('section_tipo');
		$section_id 		= (string)common::setVar('section_id');	
		$section_layout_tipo= (string)common::setVar('template_tipo');
		$section_layout_id 	= (string)common::setVar('template_id');



	#
	# TEMPLATE FROM DATA
		/*
		$folder_path 	= dirname(__FILE__).'/data/'.$_SESSION['dedalo4']['auth']['user_id'];
		$data_file_name = $folder_path.'/'.$section_layout_tipo.'_'.$section_layout_id.'.data';
		if ( !$data = file_get_contents($data_file_name)) {
			if(SHOW_DEBUG) {
				dump($data_file_name, ' data_file_name'.to_string());;
			}
			throw new Exception("Error Processing Request. Print data file is unavailable", 1);			
		}
		$data = json_decode($data);
			#dump($data, ' data'.to_string()); die();
		*/


	
	#
	# VERIFY VARS
		if( !isset($data->search_options) || !isset($data->template_obj) ) {
			throw new Exception("Error Processing Request. Few vars are received from data file", 1);
		}		
		
		
		$search_options = $data->search_options;
			$search_options->filter_custom = "section_id = $section_id";
			$search_options->limit 		  = 1;
		$ar_records		= search::get_records_data($search_options);
			#dump($ar_records, ' ar_records'); die();
		$tool_layout_print_records = reset($ar_records->result);
			
		
		$template_obj = $data->template_obj;
			#dump($template_obj, ' template_obj'.to_string());	die();					

		$section_layout_label 	= isset($template_obj->label) ? $template_obj->label : '';
		$component_layout_tipo 	= $template_obj->component_layout_tipo;

		# component_layout
		#$component_layout    = component_common::get_instance('component_layout',$component_layout_tipo,$section_layout_id,'print',DEDALO_DATA_NOLAN,$section_layout_tipo);
		#$section_layout_dato = (object)$component_layout->get_dato();
		$section_layout_dato  = $template_obj->section_layout_dato ;
			#dump($section_layout_dato->pages, ' section_layout_dato'); die();

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
		#dump($pages_rendered, ' pages_rendered'.to_string());

		# Aditional css / js
		$tool_name='tool_layout_print';
		css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
		css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_layout_print/css/tool_layout_edit.css";

		#
		# HTML FINAL
			$html  = '<!DOCTYPE html>';
			$html .= "\n<html xmlns=\"http://www.w3.org/1999/xhtml\">";
			$html .= "\n<head>";
			$html .= "\n<meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\">";
			$html .= "\n<title>Dédalo Tool Layout Page</title>";
			$html .= css::get_css_link_code();
			
			
			$html .= "\n</head>";
			
			$html .= "\n<body>";
			$html .= "\n<div id=\"html_page_wrap\" style=\"display:block\">";
			$html .= "\n<div class=\"content_html\">";	
			$html .= "\n<div id=\"pages_container\">";
				$html .= implode('', $pages_rendered->ar_pages);		
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


			return;
		/*
		#
		# PDF generation
		$pdf_target_path  = DEDALO_LIB_BASE_PATH . "/tools/tool_layout_print/print_pdf/".$section_layout_label.'.pdf';
		$javascript_delay = 140000;
		$command  = DEDALO_PDF_RENDERER ;	//. " --no-stop-slow-scripts --debug-javascript --javascript-delay $javascript_delay ";
		
		$command .= "--print-media-type ";
		$command .= "--page-offset -2 ";
		$command .= "--footer-font-name 'Times' ";
		$command .= "--footer-font-size 10 ";
		$command .= "--footer-left '". label::get_label('pagina') .": [page]' ";
		
		
		#$i=0;
		#foreach ($ar_pages_url as $current_page) {
		#	#if($i<1){ $command  .="cover"; }
		#	#$command .= " $current_page";	
		#	$i++;
		#}
		
		#$command .= " http://192.168.0.7:8888/dedalo4/lib/dedalo/main/?m=tool_layout_print&t=oh1&button_tipo=oh13&context_name=render&top_tipo=oh1&top_id=&section_tipo=oh1&template_id=4&template_tipo=dd30";		
	
		$command .= " 'http://". DEDALO_HOST .$_SERVER['REQUEST_URI']."'";
		
			#dump($command ,'$command ');
		$command .= " '$pdf_target_path' ";
		if(SHOW_DEBUG) {
			$msg = "Generating pdf file from to $pdf_target_path with command: \n$command";
			error_log($msg);
		}
		$command_exc = exec($command, $output);
		if(SHOW_DEBUG) {
			print "command: $command";
			dump($output, '$output'.to_string());
		}
		*/


	#
	# AUTOLOGOUT
	#if ($autologged) {
		#unset($_SESSION['dedalo4']['auth']);
	#}

#echo "ok ($user_id)";
exit();



?>