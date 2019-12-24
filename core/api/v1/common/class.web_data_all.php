<?php

/**
* WEB_DATA
* Manage web source data with Dédalo
*
*/
class web_data {


	// Version. Important!
		static $version = "1.0.0";  // 05-06-2019


	/**
	*
	* CREATE
	* @return array $result
	*/
	function create($json_data) {

		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		# FIX SECTION TIPO
		define('SECTION_TIPO', $section_tipo);

		$section = section::get_instance( NULL, $section_tipo );

		# Section save returns the section_id created
		$section_id = $section->Save();


		# Update search_query_object full_count property
		$search_options = section_records::get_search_options($section_tipo);
		if (isset($search_options->search_query_object)) {
			$search_options->search_query_object->full_count = true; // Force re-count records
		}


		$response->result 	= $section_id;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end create


	/**
	*
	* READ
	* @return array $result
	*/
	function read($json_data) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('search_query_object','layout_map');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='options') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}

		$layout_map = [
				[
					'component_tipo' 	=> "oh14",
					'model' 			=> "component_input_text",
					'modo' 				=> "list",
					'group' 			=> "oh2",
					"section_tipo" 		=> "oh1"
				],
				[
					'component_tipo' 	=> "oh16",
					'model' 			=> "component_input_text",
					'modo' 				=> "list",
					'group' 			=> "oh2",
					"section_tipo" 		=> "oh1"
				],
				#[
				#	'component_tipo' 	=> "oh24",
				#	'model' 			=> "component_portal",
				#	'modo' 				=> "list",
				#	'group' 			=> "oh2",
				#	"section_tipo" 		=> "oh1",
				#	"related_list"		=> ["rsc197","rsc85","rsc86"]
				#]
			];

		$dd_obj =	'
				{
					"tipo": "oh1",
					"translatable": true,
					"model": false,
					"type":"term",
					"model_tipo": "dd6",
					"descriptor": [
						{
							"lang": "lg-spa",
							"term": "memoria oral",
							"definition": "explicación es",
							"observartions": "poz ezo"
						},
						{
							"lang": "lg-eng",
							"term": "oral memory",
							"definition": "explain en",
							"observartions": "like this"
						}
					],
					"parent": "dd1",
					"display_items": [
						{
							"section_tipo": "numisdata3",
							"tipo": "numisdata27"
						},
						{
							"section_tipo": "numisdata3",
							"tipo": "numisdata77"
						},
						{
							"section_tipo": "numisdata6",
							"tipo": "numisdata16"
						},
						{
							"section_tipo": "numisdata6",
							"tipo": "numisdata18"
						}
					],
					"properties": {
						"css": {
							".wrap_component": {
								"mixin": [
									".vertical"
								],
								"style": {
									"width": "25%"
								}
							}
						}
					}
				},
				{
				  "tipo": "oh24",
				  "translatable": true,
				  "model": false,
				  "type":"term",
				  "model_tipo": "dd6",
				  "descriptor": [
				    {
						"lang": "lg-spa",
						"term": "informantes",
						"definition": "explicación es",
						"observartions": "poz ezo"
				    },
				    {
						"lang": "lg-eng",
						"term": "oral memory",
						"definition": "explain en",
						"observartions": "like this"
				    }
				  ],
				  "parent": "oh1",
				  "display_items": [
					{
						"section_tipo": "rsc87",
						"tipo": "rsc197",
						"mode":"edit"
					},
					{
						"section_tipo": "rsc88",
						"tipo": "rsc197",
						"mode":"edit"
					},
					{
						"section_tipo": "rsc87",
						"tipo": "rsc197",
						"mode":"list"
					},
					{
						"section_tipo": "rsc88",
						"tipo": "rsc197",
						"mode":"list"
					},
					{
						"section_tipo": "rsc87",
						"tipo": "rsc197",
						"mode":"edit_in_list",
						"edit_view": "view_single_line"
					},
					{
						"section_tipo": "rsc88",
						"tipo": "rsc197",
						"mode":"edit_in_list",
						"edit_view": "view_single_line"
				    }
				  ],
				  "properties": {
				    "css": {
				      ".wrap_component": {
				        "mixin": [
				          ".vertical"
				        ],
				        "style": {
				          "width": "25%"
				        }
				      }
				    }
				  }
				}
			';


		$search = new search($search_query_object);
		$result = $search->search();


		$response->result 		= $result;
		$response->msg 	  		= 'Ok. Request done';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end read



	/**
	*
	* UPDATE
	* @return array $result
	*/
	function update($json_data) {
	}//end update


	/**
	*
	* DELETE
	* @return array $result
	*/
	function delete($json_data) {
	}//end delete








////////////// trigger.area_thesaurus.php
	/**
	*
	* SEARCH_THESAURUS
	* @return array $result
	*/
	function search_thesaurus($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('search_options');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		// force search_query_object->select not empty
			if (empty($search_options->search_query_object->select)) {

				$search_options->search_query_object->select = json_decode('
				  [
				    {
				      "path": [
				        {
				          "section_tipo": "'.DEDALO_TESAURO_TIPO.'",
				          "component_tipo": "hierarchy22",
				          "modelo": "component_section_id",
				          "name": "Id"
				        }
				      ]
				    }
				  ]
				');
			}
			#dump( json_encode($search_options, JSON_PRETTY_PRINT), ' search_options ++ '.to_string()); die();

		$area_thesaurus = new area_thesaurus(DEDALO_TESAURO_TIPO);
		$response 		= $area_thesaurus->search_thesaurus( $search_options );
			#dump( json_encode((array)$response), ' $response ++ '.to_string()); die();

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end search_thesaurus


////////////// trigger.db_utils.php

	/**
	* trigger.db_utils.php
	* EXPORT_STR
	* Export db (export_structure)
	*/
	function export_str($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= "";//'Error. Request failed ['.__FUNCTION__.']';

		# Dump all historic data first
		$db_name 				= 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
		$res_export_structure 	= backup::export_structure($db_name, $exclude_tables=false);	// Full backup
		if ($res_export_structure->result===false) {
			$response->result 	= false;
			$response->msg 		= $res_export_structure->msg;
			return $response;
		}else{
			# Append msg
			$response->msg .= $res_export_structure->msg;
		}



		# Dump official structure version 'dedalo4_development_str.custom' (partial backup)
		$res_export_structure2 = (object)backup::export_structure(null, $exclude_tables=true);	 // Partial backup
		if ($res_export_structure2->result===false) {
			$response->result 	= false;
			$response->msg 		= $res_export_structure2->msg;
			return $response;
		}else{
			# Append msg
			$response->msg .= $res_export_structure2->msg;
		}


		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";

			$response->debug = $debug;
		}

		return (object)$response;
	}//end export_str



////////////// trigger.button_delete.php
	/**
	* DEL
	* @return
	*/
	function Del($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('modo','section_tipo','section_id','top_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		# FIX SECTION TIPO
		define('SECTION_TIPO', $section_tipo);

		$delete_mode = $modo;

		# Delete method
		$section 	= section::get_instance($section_id, $section_tipo);
		$delete 	= $section->Delete($delete_mode);


		# Update search_query_object full_count property
		$search_options = section_records::get_search_options($section_tipo);
		if ($search_options->search_query_object) {
			$search_options->search_query_object->full_count = true; // Force re-count records
		}


		$response->result 	= $delete;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end Del



////////////// trigger.button_new.php
	/**
	* NEW_RECORD
	* @return object $response
	*/
	function new_record($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','top_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		# FIX SECTION TIPO
		define('SECTION_TIPO', $section_tipo);

		$section = section::get_instance( NULL, $section_tipo );

		$options = new stdClass();
			$options->top_tipo = $section_tipo;

		# Section save returs the section_id created
		$section_id = $section->Save($options);


		# Update search_query_object full_count property
		$search_options = section_records::get_search_options($section_tipo);
		if (isset($search_options->search_query_object)) {
			$search_options->search_query_object->full_count = true; // Force re-count records
		}


		$response->result 	= $section_id;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end new_record



////////////// trigger.button_stats.php

	# set vars
		$vars = array('mode','context_tipo','fecha');
			foreach($vars as $name) $$name = common::setVar($name);

	# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


	# FIX SECTION TIPO
		define('SECTION_TIPO', $context_tipo);


	# NEW
	if ($mode=='Stats') {

		# DATA VERIFY
		if(empty($context_tipo) || strlen($context_tipo)<3) exit("Trigger Error: context_tipo is mandatory");
			#dump($context_tipo,"$fecha");die();

		$diffusion_section = new diffusion_section_stats($context_tipo, $fecha);

		$html = $diffusion_section->get_html();
		#dump($html,'$html');

		echo $html;
		exit();
	}



////////////// trigger.button_trigger.php

	# set vars
		$vars = array('mode','component_tipo','component_parent','target_url','lang_filter','ar_prefix_filter','component_pdf_tipo','section_tipo');
			foreach($vars as $name) $$name = common::setVar($name);


	# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


	# FIX SECTION TIPO
		define('SECTION_TIPO', $section_tipo);


	# NEW
	if ($mode==='trigger') {


		die();
	}


	# TESAURO PRESENTACION
	# TESAURO_ALFABETICO_GENERATE_HTML_FILE
	if ($mode==='tesauro_presentacion_generate_pdf_file') {

		require_once(DEDALO_CORE_PATH.'/common/class.exec_.php');

		if (empty($target_url)) {
			die("Error. Empty target_url");
		}
		if (empty($component_tipo)) {
			die("Error. Empty component_tipo");
		}
		if (empty($component_pdf_tipo)) {
			die("Error. Empty component_pdf_tipo");
		}
		# pasados automáticamente por el botón
		if (empty($component_parent)) {
			die("Error. Empty component_parent");
		}
		if (empty($lang_filter)) {
			die("Error. Empty lang_filter");
		}
		if (empty($section_tipo)) {
			die("Error. Empty section_tipo");
		}


		if (!isset($title_pagina)) {
			$title_pagina='Page';
		}

		#
		# PDF
		$component_pdf 	 	= component_common::get_instance('component_pdf',
															$component_pdf_tipo,
															$component_parent,
															'edit',
															$lang_filter,
															$section_tipo);

		$pdf_target_path = $component_pdf->get_pdf_path();


		if( strpos($_SERVER['HTTP_HOST'], '8888')!==false ) {
			$ar_pages[] = 'http://'.$_SERVER['HTTP_HOST'] . $target_url .'?lang='.$lang_filter;
		}else{
			# REALM APACHE AUTH WEB EN PRUEBAS . Pasamos al 8080 para evitar el bloqueo de la autorización de momento
			$ar_pages[] = 'http://'.$_SERVER['HTTP_HOST'].':8080' . $target_url .'?lang='.$lang_filter;
		}



		if(!empty($pdf_target_path)) {

			#
			# PDF generation
			$command  = "/usr/local/bin/wkhtmltopdf --no-stop-slow-scripts --debug-javascript ";

			# Footer page
			$command .= "--print-media-type ";
			$command .= "--page-offset -2 ";
			$command .= "--footer-font-name 'Times' ";
			$command .= "--footer-font-size 20 ";
			$command .= "--footer-left '".$title_pagina.": [page]' ";

			$i=0;
			foreach ($ar_pages as $current_page) {
				if($i<1){
					$command  .="cover";
				}
				$command .= " $current_page";
				$i++;
			}

				#dump($command ,'$command ');
			$command .= " $pdf_target_path";
			if(SHOW_DEBUG) {
				$msg = "Generating pdf file from to $pdf_target_path with command: $command";
				error_log($msg);
			}
			$command_exc = exec_::exec_command($command);
				#print "command: $command";


			$pdf_url = $component_pdf->get_pdf_url();
			print "<br><a href=\"$pdf_url\" target=\"_blank\"> PDF file </a>";

			if(SHOW_DEBUG) {
				$url = $ar_pages[0];
				echo "<br>DEBUG: pdf generated from <a href=\"$url\" target=\"_blank\" >$url</a>";
			}
		}

		exit();
	}#end if ($mode=='tesauro_presentacion_generate_pdf_file')





	# TESAURO_ALFABETICO_GENERATE_HTML_FILE
	if ($mode==='tesauro_alfabetico_generate_html_file') {

		if (empty($target_url)) {
			die("Error. Empty target_url");
		}
		if (empty($component_tipo)) {
			die("Error. Empty component_tipo");
		}
		if (empty($component_parent)) {
			die("Error. Empty component_parent");
		}
		if (empty($lang_filter)) {
			die("Error. Empty lang_filter");
		}
		if (empty($component_pdf_tipo)) {
			die("Error. Empty component_pdf_tipo");
		}
		if (empty($section_tipo)) {
			die("Error. Empty section_tipo");
		}


		#
		# HTML FILE
		# Llama a '/dedalo/ts/lib/trigger.ts_works.php' que rendea el html correspondiente
		$target_url_full = 'http://'.$_SERVER['HTTP_HOST'] . $target_url .'?mode=tesauro_alfabetico_html&lang_filter='.$lang_filter.'&ar_prefix_filter='.implode(',', $ar_prefix_filter);
		# Leemos el fichero desde la url (se genera en dedalo3)
		$html	= file_get_contents($target_url_full);
		if(!empty($html)) {

			#$component_html_file 	= new component_html_file(NULL,$component_tipo,'edit',$component_parent,DEDALO_DATA_LANG); #$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG
			$component_html_file 	= component_common::get_instance('component_html_file',$component_tipo,$component_parent,'edit',DEDALO_DATA_LANG, $section_tipo);
			$valor 					= $component_html_file->get_valor();

			$target_file_path 		= DEDALO_MEDIA_PATH . DEDALO_HTML_FILES_FOLDER .'/'.$valor .'.'.DEDALO_HTML_FILES_EXTENSION;
			$file_put_contents_res	= file_put_contents($target_file_path, $html);
			$html_file_url 			= DEDALO_MEDIA_URL . DEDALO_HTML_FILES_FOLDER .'/'.$valor.'.'.DEDALO_HTML_FILES_EXTENSION;

			if(SHOW_DEBUG) {
				$msg = "Generating html_file from $target_url_full to $html_file_url";
				error_log($msg);
			}
			print "<a href=\"$html_file_url\" target=\"_blank\"> HTML file </a>";
		}


		#
		# PDF
		$component_pdf 	 	= component_common::get_instance('component_pdf',
															 $component_pdf_tipo,
															 $component_parent,
															 'edit',
															 $lang_filter,
															 $section_tipo);
		$pdf_target_path = $component_pdf->get_pdf_path();

		if(!empty($pdf_target_path)) {

			$target_url_full = 'http://'.$_SERVER['HTTP_HOST'].$target_url.'?mode=tesauro_alfabetico_pdf&lang_filter='.$lang_filter.'&ar_prefix_filter='.implode(',', $ar_prefix_filter).'&pdf_target_path='.$pdf_target_path;
			#$target_url_full = urlencode($target_url_full);

			# leemos el fichero url	.
			# Realmente no esperamos respuesta, pues el trigger requerido ya guarda el resultado en su sitio.
			# Por ello dará error, ero lo ignoraremos, sólo nos interesa la llamada
			try {
				$ctx = stream_context_create(array(
				    'http' => array(
				        'timeout' => 30
				        )
				    )
				);
				file_get_contents($target_url_full, 0, $ctx);
			} catch (Exception $e) {
			   # echo 'Caught exception: ',  $e->getMessage(), "\n";
			}

			/*
			$command = DEDALO_PDF_RENDERER." --no-stop-slow-scripts --load-error-handling ignore '$target_url_full' '$pdf_target_path' ";
			if(SHOW_DEBUG) {
				$msg = "Generating pdf file from $target_url_full to $pdf_target_path with command: $command";
				error_log($msg);
			}
			require_once( DEDALO_CORE_PATH . '/common/class.exec_.php');
			$command_exc = exec_::exec_command($command);

			$pdf_url = $component_pdf->get_pdf_url();
			*/
			$pdf_url = $component_pdf->get_pdf_url();
			print "<br><a href=\"$pdf_url\" target=\"_blank\"> PDF file </a>";
		}

		exit();
	}




	# TESAURO_JERARQUICO_GENERATE_HTML_FILE
	if ($mode==='tesauro_jerarquico_generate_html_file') {

		if (empty($target_url)) {
			die("Error. Empty target_url");
		}
		if (empty($component_tipo)) {
			die("Error. Empty component_tipo");
		}
		if (empty($component_parent)) {
			die("Error. Empty component_parent");
		}
		if (empty($lang_filter)) {
			die("Error. Empty lang_filter");
		}
		if (empty($component_pdf_tipo)) {
			die("Error. Empty component_pdf_tipo");
		}
		if (empty($section_tipo)) {
			die("Error. Empty section_tipo");
		}

		#
		# HTML FILE
		# Llama a '/dedalo/ts/lib/trigger.ts_works.php' que rendea el html correspondiente
		$target_url_full = 'http://'.$_SERVER['HTTP_HOST'] . $target_url .'?mode=tesauro_jerarquico_html&lang_filter='.$lang_filter.'&ar_prefix_filter='.implode(',', $ar_prefix_filter);

		$html	= file_get_contents($target_url_full);

		if(!empty($html)) {

			$component_html_file 	= component_common::get_instance('component_html_file',
																	 $component_tipo,
																	 $component_parent,
																	 'edit',
																	 DEDALO_DATA_LANG,
																	 $section_tipo);
			$valor 					= $component_html_file->get_valor();

			$target_file_path 		= DEDALO_MEDIA_PATH . DEDALO_HTML_FILES_FOLDER .'/'.$valor .'.'.DEDALO_HTML_FILES_EXTENSION;
			$file_put_contents_res	= file_put_contents($target_file_path, $html);
			$html_file_url 			= DEDALO_MEDIA_URL . DEDALO_HTML_FILES_FOLDER .'/'.$valor.'.'.DEDALO_HTML_FILES_EXTENSION;

			if(SHOW_DEBUG) {
				$msg = "Generating html_file from $target_url_full to $html_file_url";
				error_log($msg);
			}
			print "<a href=\"$html_file_url\" target=\"_blank\"> HTML file </a>";
		}

		# unlock session allows continue brosing
		#session_write_close();

		#
		# PDF
		$component_pdf 	 = component_common::get_instance('component_pdf',$component_pdf_tipo,$component_parent,'edit',$lang_filter,$section_tipo);
		$pdf_target_path = $component_pdf->get_pdf_path();

		if(!empty($pdf_target_path)) {

			$target_url_full = 'http://'.$_SERVER['HTTP_HOST'].$target_url.'?mode=tesauro_jerarquico_pdf&lang_filter='.$lang_filter.'&ar_prefix_filter='.implode(',', $ar_prefix_filter).'&pdf_target_path='.$pdf_target_path;

			# leemos el fichero url	.
			# Realmente no esperamos respuesta, pues el trigger requerido ya guarda el resultado en su sitio.
			# Por ello dará error, pero lo ignoraremos, sólo nos interesa la llamada
			try {
				$ctx = stream_context_create(array(
				    'http' => array(
				        'timeout' => 30
				        )
				    )
				);
				file_get_contents($target_url_full, 0, $ctx);
			} catch (Exception $e) {
			   # echo 'Caught exception: ',  $e->getMessage(), "\n";
			}


			/*
			$command = DEDALO_PDF_RENDERER." --no-stop-slow-scripts '$html_file_full_url' '$pdf_target_path' ";
			if(SHOW_DEBUG) {
				$msg = "Generating pdf file from $html_file_full_url to $pdf_target_path with command: $command";
				error_log($msg);
			}
			require_once( DEDALO_CORE_PATH . '/common/class.exec_.php');
			$command_exc = exec_::exec_command($command);
			*/
			$pdf_url = $component_pdf->get_pdf_url();
			print "<br><a href=\"$pdf_url\" target=\"_blank\"> PDF file </a>";
		}

		exit();
	}



////////////// trigger.common.php
	/**
	* CHANGE_LANG
	* @return object $response
	*/
	function change_lang($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= true;
			$response->msg 		= 'Ok. Request done ['.__METHOD__.']';

		$vars = array('dedalo_data_lang','dedalo_application_lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='dedalo_data_lang' || $name==='dedalo_application_lang') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__METHOD__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		if (!empty($dedalo_data_lang)) {
			$dedalo_data_lang = trim( safe_xss($dedalo_data_lang) );
			# Save in session
			$_SESSION['dedalo4']['config']['dedalo_data_lang'] = $dedalo_data_lang;

			$response->msg .= ' Changed dedalo_data_lang to '.$dedalo_data_lang;
		}

		if (!empty($dedalo_application_lang)) {
			$dedalo_application_lang = trim( safe_xss($dedalo_application_lang) );
			# Save in session
			$_SESSION['dedalo4']['config']['dedalo_application_lang'] = $dedalo_application_lang;

			$response->msg .= ' Changed dedalo_application_lang to '.$dedalo_application_lang;
		}


		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}
		debug_log(__METHOD__." response ".to_string($response), logger::DEBUG);

		return (object)$response;
	}//end change_lang



////////////// trigger.autocomplete.php
	/**
	* NEW_ELEMENT
	* Render form to submit new record to source list
	* @param object $json_data
	*/
	function new_element($json_data) {
		global $start_time;

		# Write session to unlock session file
		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$vars = array('tipo','parent','section_tipo','target_section_tipo','tipo_to_search','top_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		$lang = DEDALO_DATA_LANG;
		$RecordObj_dd = new RecordObj_dd($tipo);
		$propiedades 	 = $RecordObj_dd->get_propiedades(true);

		if(isset($propiedades->source->search)){
				foreach ($propiedades->source->search as $current_search) {
					if($current_search->type === "internal"){
						$ar_terminos_relacionados =  $current_search->components;
					}
				}
			}else{
				$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($tipo, true, true);
			}
			#dump($ar_terminos_relacionados, ' ar_terminos_relacionados ++ '.to_string());

		if(SHOW_DEBUG) {
			#$ar_related = common::get_ar_related_by_model('section' $tipo);
			if (empty($ar_terminos_relacionados)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Missing required ar_terminos_relacionados for current component';
				return $response;
			}
		}

		// View html page
		$page_html	= DEDALO_CORE_PATH .'/component_autocomplete/html/component_autocomplete_new.phtml';
		ob_start();
		include ( $page_html );
		$html = ob_get_clean();


		$response->result 	= $html;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end function new_element')



	/**
	* SUBMIT_NEW_ELEMENT
	* Fire submit form of new element
	* @param object $json_data
	*/
	function submit_new_element($json_data) {
		global $start_time;

		# Write session to unlock session file
		#session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		#$vars = array('tipo','parent','section_tipo','target_section_tipo','ar_data','propiedades','top_tipo');
		$vars = array('tipo','parent','section_tipo','target_section_tipo','ar_data','top_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		if (!$ar_data = json_decode($ar_data)) {
			$response->msg = 'Trigger Error: ('.__FUNCTION__.') Error on json decode ar_data!';
			return $response;
		}

		if (empty($target_section_tipo)) {
			$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty target_section_tipo is not valid!';
			return $response;
		}

		$referenced_tipo = key($ar_data);
		if ( !is_object($ar_data) || empty($referenced_tipo) ) {
			$response->msg = 'Trigger Error: ('.__FUNCTION__.') ar_data is not object!';
			return $response;
		}

		$new_locator = (object)component_autocomplete::create_new_autocomplete_record($parent, $tipo, $target_section_tipo, $section_tipo, $ar_data);

		$response->result 	= $new_locator;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end function submit_new_element')



////////////// trigger.autocomplete_hi.php
	/**
	* UPDATE_COMPONENT_RELATED
	* @return object $response
	*/
	function update_component_related($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('ar_locators');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		if(!$ar_locators = json_decode($ar_locators)) {
			return (object)$response;
		}

		$ar_locators = json_decode($ar_locators);
		$locator = end($ar_locators);

		$section_id = $locator->section_id;
		$section_tipo = $locator->section_tipo;

		# Geo
		$component_geo	= component_common::get_instance('component_geolocation',
														 DEDALO_THESAURUS_GEOLOCATION_TIPO,
														 $section_id,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		$geo_dato = $component_geo->get_dato();

		$response = new stdClass();
			$response->result 	= $geo_dato;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $current_locator) {
					$debug->{$current_locator} = $$current_locator;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end update_component_related



	/**
	* BUILD_GRID_IMAGES
	* @return object $response
	*/
	function build_grid_images($json_data) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed '.__METHOD__;

		$vars = array('search_query_object','component_tipo','locator');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='max_records' || $name==='offset' || $name==='distinct_values') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = "Trigger Error: (".__METHOD__.") Empty ".$name." (is mandatory)";
					return $response;
				}
			}

		// Locator
			$locator = json_decode($locator);

		// (!) NOTE: search_query_object is not used anymore. Remove all code related with search_query_object here ann javascript when you this is stable this way !

			// Build new filted based on locator
				/*
				$filter_section_id = '
				{
		            "q": "'.$locator->section_id.'",
		            "q_operator": null,
		            "path": [
		                {
		                    "section_tipo": "'.$locator->section_tipo.'",
		                    "component_tipo": "hierarchy22",
		                    "modelo": "component_section_id",
		                    "name": "Id"
		                }
		            ]
		        }';
		        $op = '$and';
				$search_query_object->filter->$op[] = $filter_section_id;
				*/

			// Filter is indexable
			    /*
				$filter_indexable = json_decode('
			      {
			        "q": "{\"section_id\":\"1\",\"section_tipo\":\"dd64\",\"type\":\"dd151\",\"from_component_tipo\":\"hierarchy24\"}",
			        "q_operator": null,
			        "path": [
			          {
			            "section_tipo": "hierarchy20",
			            "component_tipo": "hierarchy24",
			            "modelo": "component_radio_button",
			            "name": "Usable in indexing"
			          }
			        ]
			      }
			    ');
				$op = '$and';
				$search_query_object->filter->$op[] = $filter_indexable;
				#dump($search_query_object, ' search_query_object ++ '.to_string());
				*/

			// Search
				/*
				$search_development2 = new search_development2($search_query_object);
				$search_result 		 = $search_development2->search();
				$ar_records 		 = $search_result->ar_records;
				*/

			// add_childrens. Recombine result rows with childrens recursive
				/*
				$item = new stdClass();
					$item->section_tipo = $locator->section_tipo;
					$item->section_id   = $locator->section_id;
				$ar_records = component_common::add_childrens([$item], true);
				*/

		// childrens . Get childrens recursive from user selected term no indexable
		$ar_records = component_relation_children::get_childrens($locator->section_id, $locator->section_tipo, null, true);

		$ar_items = [];
		foreach ($ar_records as $key => $row) {

			// Check if is indexable
			$is_indexable = ts_object::is_indexable($row->section_tipo, $row->section_id);
			if ($is_indexable!==true) {
				continue; // Skip non indable terms
			}

			$current_locator = new locator();
				$current_locator->set_section_tipo($row->section_tipo);
				$current_locator->set_section_id($row->section_id);
				$current_locator->set_component_tipo($component_tipo);

			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $row->section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $row->section_tipo);

			$url = $component->get_url();


			$item = new stdClass();
				$item->url 		= $url . '?' . start_time();
				$item->locator 	= $current_locator;


			$ar_items[] = $item;
		}


		$response->result 	 = $ar_items;
		$response->msg 		 = 'Ok. Request done ['.__FUNCTION__.']';


		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end build_grid_images



////////////// trigger.component_av.php
	/**
	* GET_VIDEO_STREAMS_INFO
	* @return object $response
	*/
	function get_video_streams_info($json_data) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('video_path');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		# Ffmpeg functions
		require_once(DEDALO_CORE_PATH.'/media_engine/class.Ffmpeg.php');

		# get_media_streams from av file
		$media_streams = Ffmpeg::get_media_streams($video_path);

		$response->result 	= $media_streams;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end get_video_streams_info



////////////// trigger.component_common.php
	/**
	* SAVE
	* Save component data in DB
	* @return object $response
	*/
	function Save($json_data) {
		global $start_time;

		# Write session to unlock session file
		#session_write_close();
		#dump($maintenance_mode, ' maintenance_mode ++ '.to_string());
		#debug_log(__METHOD__." maintenance_mode ".to_string($maintenance_mode), logger::DEBUG);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// vars
			$vars = array('parent','tipo','lang','modo','section_tipo','dato','top_tipo','top_id','caller_dataset');
				foreach($vars as $name) {
					$$name = common::setVarData($name, $json_data);
					# DATA VERIFY
					if ($name==='dato' || $name==='top_id' || $name==='caller_dataset') continue; # Skip non mandatory
					if (empty($$name)) {
						$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
						return $response;
					}
				}

		// dato . json decode try
			if (!$dato_clean = json_decode($dato)) {
				$dato_clean = $dato;
			}

		// caller_dataset check
			if (!empty($caller_dataset)) {
				$caller_dataset = json_decode($caller_dataset);
			}

		// permissions
			// case tool user admin (user editing self)
				$ar_user_allow_tipos = [
					DEDALO_USER_PASSWORD_TIPO, // password
					DEDALO_FULL_USER_NAME_TIPO, // full user name
					DEDALO_USER_EMAIL_TIPO, // email
					DEDALO_USER_IMAGE_TIPO // image
				];
				$user_id = navigator::get_user_id(); // current logged user
				$is_user_admin_edit = (bool)($section_tipo===DEDALO_SECTION_USERS_TIPO && in_array($tipo, $ar_user_allow_tipos) && $parent==$user_id);
			// switch
				if ($is_user_admin_edit===true) {

					$permissions = 2;

				}else{
					if(isset($caller_dataset->component_tipo)) {
						# if the component send a dataset, the tipo will be the component_tipo of the caller_dataset
						$permissions = common::get_permissions($section_tipo, $caller_dataset->component_tipo);
					}else{
						$permissions = common::get_permissions($section_tipo, $tipo);
					}
				}
			// return on insufficient permissions
				if ($permissions<2) {
					$response->msg = "Trigger Error: Nothing is saved. Invalid user permissions for this component. ($permissions)";
					debug_log(__METHOD__." $response->msg ".to_string(), logger::DEBUG);
					return $response;
				}

		// model
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);

		// callable : Verify component name is callable
			if (!class_exists($modelo_name)) {
				#throw new Exception("Trigger Error: class: $modelo_name not found", 1);
				$response->msg = "Trigger Error: Nothing is saved. class: '$modelo_name' not found in Dédalo";
				return $response;
			}

		// component : Build component as construct ($id=NULL, $tipo=false, $modo='edit', $parent=NULL)
			$component_obj = component_common::get_instance($modelo_name,
															$tipo,
															$parent,
															$modo,
															$lang,
															$section_tipo);

		// unique value server check
			$properties = $component_obj->get_propiedades();
			if(isset($properties->unique->server_check) && $properties->unique->server_check===true){
				$check_dato = (is_array($dato_clean)) ?	reset($dato_clean) : $dato_clean;
				$unique_server_check = $component_obj->unique_server_check($check_dato);
				if($unique_server_check === false){
					// Trigger Error: Nothing is saved.
					$response->msg = label::get_label("value_already_exists");
					return $response;
				}
			}

		// caller_dataset optional
			if (!empty($caller_dataset)) {

				# inject component caller_dataset
				$component_obj->caller_dataset = $caller_dataset;

				# force to save component
				$old_dato 	= 'impossible data' . microtime(true);

			}else{

				# get current dato to compare with received dato
				$old_dato 	= $component_obj->get_dato();
			}

		// Assign received dato to component
			$component_obj->set_dato( $dato_clean );

		// Check if dato is changed
		$new_dato	= $component_obj->get_dato();

		// Response . Check if new dato is different of current dato.
		// (!) Important: use operator '==' to allow compare objects properly
			if((is_object($new_dato) && $new_dato==$old_dato) || $new_dato===$old_dato){

				$response->result 	= $parent;
				$response->msg 		= 'Ok. Request done [Save]. Data is not changed. Is not necessary update component db data';

			}else{

				# Call the specific function of the current component that handles the data saving with your specific preprocessing language, etc ..
				$section_id = $component_obj->Save();
				#debug_log(__METHOD__." current (get_dato) ".to_string($component_obj->get_dato()), logger::DEBUG);

				if ($section_id>0 || $parent===DEDALO_SECTION_ID_TEMP) {
					# Return id
					$response->result 	= $section_id;
					$response->msg 		= 'Ok. Request done [Save]';
				}else{
					$response->result 	= false;
					$response->msg 		= 'Error. Received section_id is invalid [Save] '.json_encode($section_id);
				}
			}


		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time 	= exec_time_unit($start_time,'ms')." ms";
				$debug->modelo_name = $modelo_name;
				$debug->label 		= $component_obj->get_label();
				$debug->tipo 		= $tipo;
				$debug->section_tipo= $section_tipo;
				$debug->section_id 	= $parent;
				$debug->lang 		= $lang;
				$debug->modo 		= $modo;

			$response->debug = $debug;
		}

		# DEDALO_MAINTENANCE_MODE
		if (DEDALO_MAINTENANCE_MODE===true && (isset($_SESSION['dedalo4']['auth']['user_id']) && $_SESSION['dedalo4']['auth']['user_id']!=DEDALO_SUPERUSER)) {
			# Unset user session login
			# Delete current Dédalo session
			unset($_SESSION['dedalo4']['auth']);

			$response->maintenance = true;
		}

		# Write session to unlock session file
		#session_write_close();

		return (object)$response;
	}//end Save



	/**
	* LOAD COMPONENT BY AJAX
	* load ajax html component
	* Cargador genérico de componentes. Devuelve el html costruido del componente resuelto y en el modo recibido
	*/
	#if ($mode=='load_component_by_ajax') {
	function load_component_by_ajax($json_data) {
		global $start_time;

		# Write session to unlock session file
		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// vars
			$vars = array('parent','tipo','lang','modo','section_tipo','current_tipo_section','context_name','arguments','top_tipo','top_id');
				foreach($vars as $name) {
					$$name = common::setVarData($name, $json_data);
					# DATA VERIFY
					if ($name==='current_tipo_section' || $name==='context_name' || $name==='arguments' || $name==='top_id') continue; # Skip non mandatory
					if (empty($$name)) {
						$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
						return $response;
					}
				}

		// component
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component_obj 	= component_common::get_instance($modelo_name,
															 $tipo,
															 $parent,
															 $modo,
															 $lang,
															 $section_tipo);

		// current_tipo_section
			// Si se recibe section_tipo, configuramos el objeto para que tenga ese parámetro asignado
			// Por ejemplo, en relaciones, se requiere para discriminar qué seccion querenmos actualizar
			if (!empty($current_tipo_section)) {
				$component_obj->current_tipo_section = $current_tipo_section;
			}

		// context_name : context of component
			if (!empty($context_name)) {
				$context = new stdClass();
					$context->context_name = $context_name;
				$component_obj->set_context($context);
				#dump($context_name,"context_name");
			}

		// arguments
			if (!empty($arguments)) {
				$component_obj->set_arguments($arguments);
			}

		// tool user admin case
			$user_id = navigator::get_user_id();
			if ( $section_tipo===DEDALO_SECTION_USERS_TIPO && $user_id==$parent && $tipo===DEDALO_USER_IMAGE_TIPO ) {
				$component_obj->permissions = 2;
			}

		// html. Get component html
			# $arguments = new stdClass();
			# 	$arguments->permissions = 1;
			# if (isset($arguments->permissions)) {
			# 	// set custom permissions (to load html as read only for example)
			# 		$component_obj->set_permissions($arguments->permissions);
			# }
			$html = $component_obj->get_html();
			# dump($html, ' html ++ '.to_string());

		// write session to unlock session file
			#session_write_close();

		// response
			$response->result 	= $html;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time 	= exec_time_unit($start_time,'ms')." ms";
					$debug->modelo_name = $modelo_name;
					$debug->label 		= $component_obj->get_label();
					$debug->tipo 		= $tipo;
					$debug->section_tipo= $section_tipo;
					$debug->section_id 	= $parent;
					$debug->lang 		= $lang;
					$debug->modo 		= $modo;

				$response->debug = $debug;
			}


		return (object)$response;
	}//end load_component_by_ajax



	function remove_server_dato_of_hidden_components($json_data){
		global $start_time;

		# Write session to unlock session file
		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// vars
			$vars = array('section_id','ar_group','lang','modo','section_tipo');
				foreach($vars as $name) {
					$$name = common::setVarData($name, $json_data);
					# DATA VERIFY
					if (empty($$name)) {
						$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
						return $response;
					}
				}
		//create the section group

			foreach ($ar_group as $current_tipo) {
				//get the childrens of the current section group
				$ar_recursive_childrens = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, 'component_', 'children_recursive', $search_exact=false);

					#dump($ar_recursive_childrens);
				foreach ($ar_recursive_childrens as $current_tipo) {

					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					$component		= component_common::get_instance($modelo_name,
																	 $current_tipo,
																	 $section_id,
																	 $modo,
																	 $lang,
																	 $section_tipo);

					$dato_empty = null;
					$component->set_dato($dato_empty);
					$component->Save();
				}

			}

	}



////////////// trigger.component_portal.php
	/**
	* SAVE
	* @return object $response
	*/
	function save($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed [save]';

		# Write session to unlock session file
		#session_write_close();

		$vars = array('portal_tipo','portal_parent','section_tipo','dato');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		# Verify vars
		if( $dato===false ) {
			$response->msg .= 'Trigger Error: ('.__FUNCTION__.') Empty dato (is mandatory)';
			return $response;
		}
		$dato 		= json_decode($dato);
		$dato_count = count($dato);

		$modelo_name 	  = RecordObj_dd::get_modelo_name_by_tipo($portal_tipo, true);
		$modo 			  = 'edit';
		$component_portal = component_common::get_instance( $modelo_name,
															$portal_tipo,
															$portal_parent,
															$modo,
															DEDALO_DATA_NOLAN,
															$section_tipo,
															false);
		# EXPECTED FORMAT IS :
		# value: Array
		#	(
		#	    [0] => stdClass Object
		#	        (
		#	            [section_id] => 225077
		#	        )
		#
		#	    [1] => stdClass Object
		#	        (
		#	            [tag_id] => 2
		#	            [component_tipo] => dd751
		#	            [section_id] => 225041
		#	        )
		#
		#	    [2] => stdClass Object
		#	        (
		#	            [section_id] => 225050
		#	        )
		#
		#	)
		#	type: array

		# Verify first element
		/*
		if (isset($dato[0]) && !is_object($dato[0])) {
			if(SHOW_DEBUG===true) {
				dump($dato,"debug dato");
			}
			die("Error: dato format is wrong");
		}*/

		$component_portal->set_dato($dato);
		$component_portal->Save();
		#debug_log(__METHOD__." Saved component portal $section_tipo $portal_tipo $portal_parent with values: ".to_string($dato), logger::DEBUG);


		$response->result 	= true;
		$response->msg 		= "Ok. Request done. Saved $section_tipo $portal_tipo $portal_parent. Received elements: $dato_count. [save]";

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time 	= exec_time_unit($start_time,'ms')." ms";
				$debug->modelo_name = $modelo_name;
				$debug->label 		= $component_portal->get_label();
				$debug->tipo 		= $portal_tipo;
				$debug->section_tipo= $section_tipo;
				$debug->section_id 	= $portal_parent;
				$debug->lang 		= DEDALO_DATA_NOLAN;
				$debug->modo 		= $modo;
				$debug->dato 		= $dato;

			$response->debug = $debug;
		}


		return (object)$response;
	}//end save



	/**
	* ADD_NEW_ELEMENT
	* Save on matrix current relation
	* @param $portal_id (Int id matrix from portal component)
	* @param $portal_tipo (String tipo from portal
	* @param $target_section_tipo (String tipo from section)
	* @return object $response
	*/
	function add_new_element($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# Write session to unlock session file
		#session_write_close();

		$vars = array('portal_tipo','portal_parent','portal_section_tipo','target_section_tipo','top_tipo','top_id');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='top_id') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($portal_tipo, true);
		$component 		= component_common::get_instance($modelo_name,
														 $portal_tipo,
														 $portal_parent,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $portal_section_tipo);
		$add_options = new stdClass();
			$add_options->section_target_tipo 	= $target_section_tipo;
			$add_options->top_tipo 				= $top_tipo;
			$add_options->top_id 				= $top_id;

		$response = $component->add_new_element($add_options);

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end add_new_element



	/**
	* REMOVE_ELEMENT
	* @return object $response
	*/
	function remove_element($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		$vars = array('tipo','parent','section_tipo','locator','remove_mode');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='top_id') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $parent,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);

		$remove_options = new stdClass();
			$remove_options->locator 	 = $locator;
			$remove_options->remove_mode = $remove_mode;
		$response = $component->remove_element( $remove_options );


		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end remove_element



	/**
	* BUILD_COMPONENT_JSON_DATA
	* @return object $response
	*/
	function build_component_json_data($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		$vars = array('tipo','parent','modo','lang','section_tipo','propiedades','dato','context','build_options');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='propiedades' || $name==='dato' || $name==='context') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}
		#debug_log(__METHOD__." Portal trigger ** build_options ".to_string($build_options), logger::DEBUG); #die();

		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component   	= component_common::get_instance($modelo_name,
														 $tipo,
														 $parent,
														 $modo,
														 $lang,
														 $section_tipo);

		// Inject custom propiedades here as needed
		if (!empty($propiedades)) {
			$component->set_propiedades($propiedades);
		}

		// Context
		if (!empty($context)) {
			$component->set_context($context);

			// Inject received dato here ONLY when context_name is tool_time_machine
			if (isset($context->context_name) && $context->context_name==='tool_time_machine') {
				$component->set_dato($dato);
			}
		}

		$result = $component->build_component_json_data($build_options);

		$response->result 	= $result;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end build_component_json_data



////////////// trigger.component_relation_children.php
	/**
	* ADD_CHILDREN
	* @return object $response
	*/
	function add_children($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed [add_children]';

		$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				if (empty($$name)) {
					exit("Error. ".$$name." is mandatory");
				}
			}

		// tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo
		$modelo_name 	= 'component_relation_children';
		$modo 			= 'edit';
		$lang 			= DEDALO_DATA_NOLAN;
		$component_relation_children   = component_common::get_instance($modelo_name,
														  				$tipo,
														  				$parent,
														  				$modo,
														  				$lang,
														  				$section_tipo);

		$added = (bool)$component_relation_children->make_me_your_children( $target_section_tipo, $target_section_id );
		if ($added===true) {
			$component_relation_children->Save();
			$response->result 	= true;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
		}

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end add_children



	/**
	* REMOVE_CHILDREN
	* @return object $response
	*/
	function remove_children($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed [remove_children]';

		$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				if (empty($$name)) {
					exit("Error. ".$$name." is mandatory");
				}
			}


		$modelo_name 	= 'component_relation_children';
		$modo 			= 'edit';
		$lang 			= DEDALO_DATA_NOLAN;
		$component_relation_children   = component_common::get_instance($modelo_name,
														  				$tipo,
														  				$parent,
														  				$modo,
														  				$lang,
														  				$section_tipo);

		# REMOVE_ME_AS_YOUR_CHILDREN
		# We use this this method (remove_me_as_your_children) instead 'remove_children' to unify calls with add_children
		# and avoid errors on create locators (this way force always recrete locator in component)
		$removed = (bool)$component_relation_children->remove_me_as_your_children( $target_section_tipo, $target_section_id );
		if ($removed===true) {
			$component_relation_children->Save();
			$response->result 	= true;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
		}

		/* Método eliminando por locator:
			$locator = json_decode($locator);
			$removed = (bool)$component_relation_children->remove_children($locator);
			if ($removed===true) {
				$component_relation_children->Save();
				$result = true;
			}
			*/

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end remove_children



////////////// trigger.component_relation_parent.php
	/**
	* ADD_PARENT
	* @return bool
	*/
	function add_parent($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$vars = array('tipo','parent','section_tipo','children_section_tipo','children_section_id');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$add_parent = component_relation_parent::add_parent($tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id);

		$response->result 	= $add_parent;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end add_parent



	/**
	* REMOVE_PARENT
	* @return bool
	*/
	function remove_parent($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		$vars = array('tipo','parent','section_tipo','children_section_tipo','children_section_id','children_component_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				if (empty($$name)) {
					exit("Error. ".$$name." is mandatory");
				}
			}

		$remove_parent 		= component_relation_parent::remove_parent($tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo);

		$response->result 	= $remove_parent;
		$response->msg 		= 'Ok. Request done [remove_parent]';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end remove_parent



////////////// trigger.component_relation_related.php
	/**
	* ADD_RELATED
	* @return bool
	*/
	function add_related($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$vars = array('tipo','parent','section_tipo','target_section_tipo','target_section_id');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				if (empty($$name)) {
					exit("Error. ".$$name." is mandatory");
				}
			}

		// tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo
		$modelo_name 	= 'component_relation_related';
		$modo 			= 'edit';
		$lang 			= DEDALO_DATA_NOLAN;
		$component_relation_related    = component_common::get_instance($modelo_name,
														  				$tipo,
														  				$parent,
														  				$modo,
														  				$lang,
														  				$section_tipo);
		$locator = new locator();
			$locator->set_section_tipo($target_section_tipo);
			$locator->set_section_id($target_section_id);
			$locator->set_type($component_relation_related->get_relation_type());
			$locator->set_type_rel($component_relation_related->get_relation_type_rel());
			$locator->set_from_component_tipo($tipo);
				#dump($locator, ' locator ++ '.to_string());

		$added = (bool)$component_relation_related->add_related( $locator );
		if ($added===true) {
			$component_relation_related->Save();

			$response->result 	= true;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
		}

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end add_related



////////////// trigger.component_security_acces.php
	/**
	* SAVE
	*/
	function Save($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$vars = array('parent','tipo','lang','modo','section_tipo','dato');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='dato') continue; # Skip non mandatory filled
				if (empty($$name)) {
					exit("Error. ".$$name." is mandatory");
				}
			}

		# DATO . JSON DECODE TRY
		# dump($dato, ' dato ++ '.to_string());
		if (!$dato_clean = json_decode($dato)) {
			exit("Trigger Error: dato is not valid");
		}
		//dump($dato_clean, ' dato_clean ++ lang: '.to_string($lang)); die();

		# COMPONENT : Build component as construct ($id=NULL, $tipo=false, $modo='edit', $parent=NULL)
		$modelo_name   = 'component_security_access';
		$component_obj = component_common::get_instance($modelo_name,
														$tipo,
														$parent,
														$modo,
														$lang,
														$section_tipo);


		# Get curren dato in DB
		$current_dato = $component_obj->get_dato();

		$new_dato = component_security_access::merge_dato((array)$current_dato, (array)$dato_clean);
			#dump($current_dato, ' current_dato ++ '.to_string());
			#dump($dato_clean, ' dato_clean ++ '.to_string());
			#dump($new_dato, ' new_dato ++ '.to_string());
			#return false;

		# Assign dato
		$component_obj->set_dato( $new_dato );

		# Call the specific function of the current component that handles the data saving with your specific preprocessing language, etc ..
		$section_id = $component_obj->Save();

		# Write session to unlock session file
		session_write_close();

		$response->result 	= $section_id;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end Save



////////////// trigger.component_security_areas.php
	/**
	* LOAD_ACCESS_ELEMENTS
	*/
	function load_access_elements($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$vars = array('tipo','parent');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='dato') continue; # Skip non mandatory filled
				if (empty($$name)) {
					exit("Error. ".$$name." is mandatory");
				}
			}

		#
		# SECTION ELEMENTS CHILDREN
		$ar_ts_childrens = component_security_access::get_ar_ts_childrens_recursive($tipo);
			#dump($ar_ts_childrens, ' ar_ts_childrens ++ '.to_string());


		#
		# DATO_ACCESS
		$component_security_access = component_common::get_instance('component_security_access',
																	 DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO,
																	 $parent,
																	 'list',
																	 DEDALO_DATA_NOLAN,
																	 DEDALO_SECTION_PROFILES_TIPO);
		$dato_access = $component_security_access->get_dato();
			#dump($dato_access, ' dato_access ++ '.to_string());

		$access_arguments=array();
			$access_arguments['dato'] 				= $dato_access;
			$access_arguments['parent'] 			= $parent;
			$access_arguments['dato_section_tipo'] 	= $tipo;

		$li_elements_html = component_security_access::walk_ar_elements_recursive($ar_ts_childrens, $access_arguments);

		# Write session to unlock session file
		session_write_close();

		$response->result 	= $li_elements_html;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end load_access_elements



////////////// trigger.component_state.php
	/**
	* UPDATE_STATE_LOCATOR
	*/
	function update_state_locator($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('tipo','parent','modo','lang','section_tipo','top_tipo','options','type','dato');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$options = json_decode($options);
		$dato 	 = (int)$dato;

		$component_state = component_common::get_instance( 'component_state',
															$tipo,
															$parent,
															'edit',
															$lang,
															$section_tipo);

		$component_state->set_options($options);
		$current_valor   = $component_state->get_valor_for_checkbox();

		if($type == 'user'){
			$ar_dato = [$dato,$current_valor[1]];
		}else if($type == 'admin'){
			$ar_dato = [$current_valor[0],$dato];
		}else{
			exit('Error: Invalid type');
		}

		$result = (bool)$component_state->update_state_locator( $options, $ar_dato);

		if($result!==true){
			debug_log(__METHOD__." Error on update_state_locator. result: ".to_string($result), logger::WARNING);
		}

		$response->result 	= $result;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end update_state_locator



////////////// trigger.component_text_area.php
	/**
	* LOAD_TR
	*/
	function load_tr($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('tipo','parent','section_tipo','lang','top_tipo','top_id');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		$modelo_name 		 = 'component_text_area';
		$modo 				 = 'load_tr';
		$component_text_area = component_common::get_instance($modelo_name,
															  $tipo,
															  $parent,
															  $modo,
															  $lang,
															  $section_tipo);

		$html = $component_text_area->get_html();


		$response->result 	= $html;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end load_tr



	/**
	* LOAD_TAGS_PERSON
	* @return object $response
	*/
	function load_tags_person($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('tipo','parent','section_tipo','lang','top_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}
			/*
			if (TOP_TIPO===false) {
				$response->msg .= ' top tipo is empty';
				return $response;
			}*/


		# Component text area build
		$modelo_name 		 = 'component_text_area';
		$modo 				 = 'load_tr';
		$component_text_area = component_common::get_instance($modelo_name,
															  $tipo,
															  $parent,
															  $modo,
															  $lang,
															  $section_tipo);
		# TAGS_PERSON
		$ar_tags_person = $component_text_area->get_tags_person($top_tipo);
			#dump($ar_tags_person, ' ar_tags_person ++ '.to_string());

		/*
		ob_start();
		include ( dirname(__FILE__) .'/html/component_text_area_persons.phtml' );
		$html =  ob_get_clean();
		*/
		$response->result 	= $ar_tags_person;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end load_tags_person




	/**
	* SHOW_PERSON_INFO
	* @return
	*/
	function show_person_info($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('locator');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		if(!$locator = json_decode($locator)) {
			return (object)$response;
		}

		# Label
		$label = (object)component_text_area::get_tag_person_label($locator);

		$response = new stdClass();
			$response->result 	= $label;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end show_person_info



	/**
	* PERSON_USED
	* @return array $ar_section_id
	*/
	function person_used($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('locator');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$locator = json_decode($locator);

		$ar_section_id = component_text_area::person_used($locator);
			#dump($ar_section_id, ' ar_section_id ++ '.to_string());

		$response = new stdClass();
			$response->result 	= (array)$ar_section_id;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end person_used



	/**
	* CREATE_NEW_NOTE
	* @return
	*/
	function create_new_note($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('note_number');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$response = (object)component_text_area::create_new_note();

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end create_new_note



	/**
	* SHOW_NOTE_INFO
	* @return
	*/
	function show_note_info($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','section_id','lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		// COMPONENT_TEXT_HTML
		$tipo 			= DEDALO_NOTES_TEXT_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component_text = component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'edit_note',
														 $lang,
														 $section_tipo);
		$component_text_html = $component_text->get_html();

		// Component publication html
		$tipo 			= DEDALO_NOTES_PUBLICATION_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component_publication = component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'edit_note',
														 $lang,
														 $section_tipo);
		$component_publication_html = $component_publication->get_html();

		// SECTION INFO
		$section = section::get_instance($section_id, $section_tipo);
		$modified_by_userID 	= $section->get_modified_by_userID();
		$modified_date 			= $section->get_modified_date();
		$created_by_userID 		= $section->get_created_by_userID();
		$created_by_user_name 	= $section->get_created_by_user_name();
		$created_date 			= $section->get_created_date();


		$response->result 				= true;
		$response->msg 					= 'Request done successfully [show_note_info]';
		$response->component_text_html 	= $component_text_html . $component_publication_html;
		$response->modified_by_userID 	= $modified_by_userID;
		$response->modified_date 		= $modified_date;
		$response->created_by_userID 	= $created_by_userID;
		$response->created_by_user_name = $created_by_user_name;
		$response->created_date 		= $created_date;

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end show_note_info



	/**
	* DELETE_NOTE
	* @return object $response
	*/
	function delete_note($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','section_id','lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		$section = section::get_instance($section_id, $section_tipo);
		$result  = $section->Delete($delete_mode='delete_record');
		if ($result===true) {
			$response->result 	= true;
			$response->msg 		= 'Section '.$section_tipo.' - '.$section_id.' deleted successfully [delete_note]';
		}

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end delete_note



	/**
	* SHOW_REFERENCE_INFO
	* @return object $response
	*/
	function show_reference_info($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('data','lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		#$response = component_text_area::show_reference_info();

		$user_id 		= navigator::get_user_id();
		$temp_id		= DEDALO_SECTION_ID_TEMP.'_reference_'.$user_id;

		$component_tipo = DEDALO_TS_REFERENCES_COMPONENT_TIPO;
		$section_tipo 	= DEDALO_TS_REFERENCES_SECTION_TIPO;
		$modelo_name 	= 'component_autocomplete_hi';	//RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
		$component 		= component_common::get_instance($modelo_name,
														 $component_tipo,
														 $temp_id,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		# Inject custom propiedades
		/*
		$propiedades = json_decode('{
		  "source": {
		    "mode": "autocomplete",
		    "hierarchy_types": [1],
		    "hierarchy_sections": []
		  },
		  "value_with_parents": false,
		  "limit": 1
		}');
		$component->set_propiedades( $propiedades );
		*/

		# Inject custom permissions
		$component->set_permissions(2);
		if ($data = json_decode($data)) {
			$component->set_dato($data);
		}
		# Component html
		$response->component_autocomplete_hi_html = $component->get_html();

		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end show_reference_info



	/**
	* SET_SECTION_TITLES
	* Used by new text editor
	* @return object $response
	*/
	function set_section_titles($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed (set_section_titles)';

		$vars = array('ar_locators', 'lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				if ($$name===false) {
					$response->msg = 'Error. Empty mandatory var '.$name;
					return $response;
				}
			}
		$ar_locators = json_decode($ar_locators);

		if (is_array($ar_locators)) {

			$result = array();
			foreach ($ar_locators as $current_string_locator) {

				$locator = json_decode( str_replace("'", '"', $current_string_locator) );
				if ($locator) {
					# get_struct_note_data from db
					$struct_note_data = tool_structuration::get_struct_note_data($locator, $lang);
					if ($struct_note_data->result!==false) {
						$result[$current_string_locator] = (object)$struct_note_data->result;
					}
				}
			}
			$response->result 	= $result;
			$response->msg 		= 'Request done successfully (set_section_titles) Total: '.count($result);
		}

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end set_section_titles



	/**
	* SHOW_STRUCTURATION_INFO
	* @return object $response
	*/
	function show_structuration_info($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','section_id','lang');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='max_records' || $name==='offset') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$section = section::get_instance($section_id, $section_tipo);

		// Section info
		$section_info = new stdClass();
			$section_info->modified_by_userID 	= $section->get_modified_by_userID();
			$section_info->modified_date 		= $section->get_modified_date();
			$section_info->created_by_userID 	= $section->get_created_by_userID();
			$section_info->created_by_user_name = $section->get_created_by_user_name();
			$section_info->created_date 		= $section->get_created_date();

		// COMPONENT_TEXT_HTML
		$ar_component_tipo = array(DEDALO_STRUCTURATION_TITLE_TIPO, DEDALO_STRUCTURATION_DESCRIPTION_TIPO);
			$html = '';
			foreach ($ar_component_tipo as $component_tipo) {

				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				$component 	 	= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $section_id,
																 'edit',
																 $lang,
																 $section_tipo);
				$html .= $component->get_html();
			}//foreach

		$structuration_info = new stdClass();
			$structuration_info->section_info 	= $section_info;
			$structuration_info->html 	    	= $html;


		$response->result 				= true;
		$response->msg 					= 'Request done successfully [show_structuration_info]';
		#$response->fragment_text 		= $fragment_text;
		#$response->indexations_list 	= $indexations_list;
		$response->structuration_info 	= isset($structuration_info) ? $structuration_info : null;

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end show_note_info



////////////// trigger.herarchy.php
	/**
	* GENERATE_VIRTUAL_SECTION
	* @return object $response
	*/
	function generate_virtual_section($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('component_parent','section_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$options = new stdClass();
			$options->section_id   = $component_parent;
			$options->section_tipo = $section_tipo;

		$result = (object)hierarchy::generate_virtual_section( $options );
			#dump($result, ' $result ++ '.to_string());

		switch (true) {
			case isset($result->result) && $result->result===true:
				$class = 'ok';
				break;
			case isset($result->result) && $result->result===false:
				$class = 'warning';
				break;
			default:
				$class = 'warning';
				break;
		}
		if (isset($result->msg)) {

			$msg = '<div class="'.$class.'">'. nl2br($result->msg) .'</div>';

			$response->result 	= true;
			$response->msg 		= $msg;	//'Ok. Request done ['.__FUNCTION__.']';

			# Remove structure cache to reconize new structure sections
			# Delete all session data config except search_options
			foreach ($_SESSION['dedalo4']['config'] as $key => $value) {
				if ($key==='search_options') continue;
				unset($_SESSION['dedalo4'][$key]);
			}
		}

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end generate_virtual_section



	/**
	* UPDATE_TARGET_SECTION
	* @return object $response
	*/
	function update_target_section($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('parent');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		$options = new stdClass();
			$options->section_tipo = DEDALO_HIERARCHY_SECTION_TIPO;
			$options->section_id   = (int)$parent;

		$response = hierarchy::update_target_section($options);

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end update_target_section



////////////// trigger.lock_compnents.php
	/**
	* UPDATE_EVENTS_STATE
	* Connects to database and updates user lock components state
	* on focus or blur user actions
	* @return object $response
	*/
	function update_lock_components_state($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_id','section_tipo','component_tipo','action');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		$user_id = (int)$_SESSION['dedalo4']['auth']['user_id'];
		if ($user_id<0) {
			$full_username 	= "Debug user";
		}else{
			$full_username 	= $_SESSION['dedalo4']['auth']['full_username'];
		}

		$event_element = new stdClass();
			$event_element->section_id 	 	= $section_id;
			$event_element->section_tipo 	= $section_tipo;
			$event_element->component_tipo 	= $component_tipo;
			$event_element->action 		 	= $action;
			$event_element->user_id 		= $user_id;
			$event_element->full_username  	= $full_username;
			$event_element->date  			= date("Y-m-d H:i:s");

		$response = (object)lock_components::update_lock_components_state( $event_element );

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return $response;
	}//end update_lock_components_state



////////////// trigger.login.php
	# LOGIN	 #################################################################################################################
	function Login($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$trigger_post_vars = array();
		foreach ($json_data as $key => $value) {
			$trigger_post_vars[$key] = trim($value); // trim to avoid write space errors
		}

		# If all is ok, return string 'ok'
		$response = (object)login::Login( $trigger_post_vars );

		# Close script session
		session_write_close();

		# Exit printing result
		# exit($result);

		#$response->result 	= $result;
		#$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";

			$response->debug = $debug;
		}

		return (object)$response;
	}//end Login



	# QUIT ###################################################################################################################
	function Quit($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// post vars
			$trigger_post_vars = array();
			foreach ($json_data as $key => $value) {
				$trigger_post_vars[$key] = $value;
			}

		// Login type . Get before unset session
			$login_type = isset($_SESSION['dedalo4']['auth']['login_type']) ? $_SESSION['dedalo4']['auth']['login_type'] : 'default';

		// Quit action
			$result = login::Quit( $trigger_post_vars );

		// Close script session
			session_write_close();

		// Response
			$response->result 	= $result;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

			// saml logout
				if ($login_type==='saml' && defined('SAML_CONFIG') && SAML_CONFIG['active']===true && isset(SAML_CONFIG['logout_url'])) {
					$response->saml_redirect = SAML_CONFIG['logout_url'];
				}

			// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";

				$response->debug = $debug;
			}

		return (object)$response;
	}//end Quit()



////////////// trigger.relation_list.php
	/**
	* GET_RELATION_LIST_JSON
	* @return object $response
	*/
	function get_relation_list_json($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= null;
			$response->msg 		= 'Error. fail to parse request vars [get_relation_list_json]';

		$vars = array('tipo','section_tipo','section_id','modo','value_resolved','limit','offset','count');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
			}

		$relation_list 		= new relation_list($tipo, $section_id, $section_tipo, $modo='edit');
		$relation_list->set_value_resolved($value_resolved);
		$relation_list->set_limit($limit);
		$relation_list->set_offset($offset);
		$relation_list->set_count($count);
		$relation_list_json = $relation_list->get_json();

		if ($relation_list_json !== false) {
			$response->result 	= $relation_list_json;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
		}else{
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed [get_relation_list_json]';
		}

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;

	}//end get_relation_list_json



////////////// trigger.seach2.php
	# Common vars
	define('_PRESETS_LIST_SECTION_TIPO', 				'dd623');
	define('_PRESETS_LIST_FIELD_NAME_TIPO', 			'dd624');
	define('_PRESETS_LIST_FIELD_SECTION_NAME_TIPO', 	'dd642');
	define('_PRESETS_LIST_FIELD_SAVE_ARGUMENTS_TIPO', 	'dd648');
	define('_PRESETS_LIST_FIELD_JSON_DATA_TIPO', 		'dd625');

	# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
	common::trigger_manager();



	/**
	* GET_COMPONENTS_FROM_SECTION
	* @return object $response
	*/
	function get_components_from_section($json_data) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}


		$components_from_section = search_development2::get_components_from_section($section_tipo);


		$response->result 	= $components_from_section->result;
		$response->msg 		= $components_from_section->msg;

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end get_components_from_section



	/**
	* LOAD_COMPONENTS
	* @return object $response
	*/
	function load_components($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		# set vars
		$vars = array('components');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='modo') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}

		if (!is_array($components)) {
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed. components is not an array!';
			return $response;
		}


		$html = '';
		foreach ((array)$components as $key => $component_info) {

			if (empty($component_info->modo)) {
				# Default
				$component_info->modo = 'search';
			}

			$component_tipo = $component_info->component_tipo;

			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_info->component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_info->component_tipo,
															 $component_info->section_id,
															 $component_info->modo,
															 DEDALO_DATA_LANG,
															 $component_info->section_tipo);
			#if ($component_info->modo==="search") {
			#	$component->search_input_name = $component_info->component_tipo.'_'.$component_info->section_id;
			#}

			# DATO CLEAN
			if (isset($component_info->clean) && $component_info->clean===true) {
				$component->set_dato(null);
			}

			# DATO SET CUSTOM VALUE
			if (!empty($component_info->current_value)) {
				$current_value = $component_info->current_value;
				$component->set_dato($current_value);
				#debug_log(__METHOD__." [trigger.search2.load_components] Set current_value as  ".to_string($current_value), logger::DEBUG);
			}

			# Q_OPERATOR
			if(isset($component_info->q_operator)) {
				$component->q_operator = $component_info->q_operator;  // Inject q_operator value
			}

			$component_html = $component->get_html();

			$html .= $component_html;
		}


		$response->result 	= $html;
		$response->msg 		= 'Ok. Request done';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end load_components



	/**
	* GET_COMPONENT_PRESETS
	* @return object $response
	*/
	function get_component_presets($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		# set vars
		$vars = array('target_section_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='modo') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}


		$logged_user_id 		= navigator::get_user_id();
		$ar_component_presets 	= search_development2::get_component_presets($logged_user_id, $target_section_tipo);

		# Get permissions to allow/disallow buttons
		$section_tipo 		 	= _PRESETS_LIST_SECTION_TIPO; // Presets list
		$section_permissions 	= common::get_permissions($section_tipo, $section_tipo);

		$response->result 		= $ar_component_presets;
		$response->permissions 	= $section_permissions;
		$response->msg 	  		= 'Ok. Request done';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end get_component_presets



	/**
	* SAVE_PRESET
	* @return object $response
	*/
	function save_preset($json_data) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('filter','data_section_tipo','preset_section_id');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='options') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}

		$presets_section_tipo = _PRESETS_LIST_SECTION_TIPO; // Presets list

		if (strpos($preset_section_id, DEDALO_SECTION_ID_TEMP)!==false || empty($preset_section_id)) {

			// Create new record
			$section = section::get_instance(null, $presets_section_tipo);
			$section->forced_create_record();
			$parent  = $section->get_section_id();

			#
			# SECTION TIPO FIELD
				$component_tipo = _PRESETS_LIST_FIELD_SECTION_NAME_TIPO; // Section tipo
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $parent,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $presets_section_tipo);
				$component->set_dato($data_section_tipo); // Like oh1
				# Save component
				$component->Save();

			#
			# NAME, PUBLIC, DEFAULT (TEMPORAL SECTION)
			# Propagate all section temp data to the new created real section
				$temp_data_uid = $preset_section_id;
				if (isset($_SESSION['dedalo4']['section_temp_data'][$temp_data_uid])) {
					$temp_section_data = $_SESSION['dedalo4']['section_temp_data'][$temp_data_uid];
					section::propagate_temp_section_data($temp_section_data, $presets_section_tipo, $parent);
					#debug_log(__METHOD__." propagate_temp_section_data $temp_data_uid  ".to_string($temp_section_data), logger::DEBUG);
				}

			/*
			#
			# NAME FIELD
				$component_tipo = _PRESETS_LIST_FIELD_NAME_TIPO; // Name
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component 		= component_common::get_instance($modelo_name,
																 $component_tipo,
																 $parent,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 $presets_section_tipo);

				$preset_name = $preset_name ? $preset_name : "Untitled $parent";
				$component->set_dato([$preset_name]);
				# Save component
				$component->Save();
			*/


		}else{
			$parent  = $preset_section_id;
		}


		#
		# JSON DATA FIELD (Always is saved)
			$component_tipo = _PRESETS_LIST_FIELD_JSON_DATA_TIPO; // JSON data
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $parent,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $presets_section_tipo);

			$component->set_dato( $filter );
			# Save component
			$result = $component->Save();


		#
		# USER
			$user_id 		= navigator::get_user_id();
			$component_tipo = 'dd654'; // component_select
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $parent,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $presets_section_tipo);
			$user_locator = new locator();
				$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
				$user_locator->set_section_id($user_id);
				$user_locator->set_from_component_tipo($component_tipo);
				$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$component->set_dato( array($user_locator) );
			$result[] = $component->Save();



		$response->result 		= $result;
		$response->msg 	  		= 'Ok. Request done (section_id: '.$parent.')';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end save_preset



	/**
	* DELETE_PRESET
	* @return object $response
	*/
	function delete_preset($json_data) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_id');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='options') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}

		$presets_section_tipo = _PRESETS_LIST_SECTION_TIPO; // Presets list

		$section = section::get_instance($section_id, $presets_section_tipo);

		# Delete section
		$result = $section->Delete('delete_record');


		$response->result 		= $result;
		$response->msg 	  		= 'Ok. Request done (section_id: $parent)';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end delete_preset




	/**
	* SEARCH
	* @return object $response
	*/
	function search($json_data) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('search_query_object');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='options') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}


		$search_development2 = new search_development2($search_query_object);
		$result = $search_development2->search();


		$response->result 		= $result;
		$response->msg 	  		= 'Ok. Request done';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end search



	/**
	* SAVE_TEMP_PRESET
	* @return object $response
	*/
	function save_temp_preset($json_data) {
		global $start_time;

		session_write_close();
		ignore_user_abort(true);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','filter_obj');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}

		$user_id = navigator::get_user_id();

		$save_temp_preset = search_development2::save_temp_preset($user_id, $section_tipo, $filter_obj);
		if ($save_temp_preset===true) {
			$response->result 	= $save_temp_preset;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
		}


		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end save_temp_preset



	/**
	* LOAD_TEMP_FILTER
	* @return object $response
	*/
	function load_temp_filter($json_data) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}


		$user_id 	 = navigator::get_user_id();
		$temp_preset = search_development2::get_preset(DEDALO_TEMP_PRESET_SECTION_TIPO, $user_id, $section_tipo);
		$temp_filter = isset($temp_preset->json_filter) ? $temp_preset->json_filter : null;

		$response->result 	= $temp_filter;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end load_temp_filter



////////////// trigger.section.php
	/**
	* GET_DATUM
	* @param $json_data
	*/
	function get_datum($json_data) {
		global $start_time;

		# Write session to unlock session file
		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$vars = array('section_tipo','section_id','mode');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
			}

		$search_query_object = [
			'id' 			=> 'get_datum',
			'section_tipo' 	=> $section_tipo,
			'limit' 		=> 10000,
			'order' 		=> null,
			'offset' 		=> 0,
			'full_count' 	=> false,
			'filter'		=> null,
			'select'		=> null
		];
		#dump($search_query_object, ' search_query_object ++ '.to_string());

		$search_development2 = new search_development2($search_query_object);
		$rows_data 		 	 = $search_development2->search();
			#dump($rows_data, ' rows_data ++ '.to_string()); die();

		$ar_list_map = new stdClass();
			$ar_list_map = [
				[
					'tipo' 	=> "oh14",
					'model' => "component_input_text",
					'modo' 	=> "list",
					'group' => "oh2",
					"section_tipo" => "oh1"
				],
				[
					'tipo' 	=> "oh16",
					'model' => "component_input_text",
					'modo' 	=> "list",
					'group' => "oh2",
					"section_tipo" => "oh1"
				],
				[
					'tipo' 	=> "oh24",
					'model' => "component_portal",
					'modo' 	=> "list",
					'group' => "oh2",
					"section_tipo" => "oh1"
				],
				[
					'tipo' 	=> "rsc85",
					'model' => "component_input_text",
					'modo' 	=> "list",
					'parent' => "oh24",
					'group' => "rsc76",
					"section_tipo" => "rsc197"
				]
			];
		$datum = section::build_json_rows($rows_data, 'list', $ar_list_map);

		// response
			$response->result 	= $datum;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		// Debug
			if(SHOW_DEBUG===true) {

				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
					foreach($vars as $name) {
						$debug->{$name} = $$name;
					}
				$response->debug = $debug;
			}

		return (object)$response;
	}//end get_datum



////////////// trigger.section_records.php
	/**
	* LOAD_ROWS
	*/
	function load_rows($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('options');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				# if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}

		# Received post var 'options' is a json object stringnified. Decode to regenrate original object
		# $options = json_decode($options);
		if (!is_object($options)) {
			$response->msg = 'Trigger Error: ('.__FUNCTION__.') Received data must be a object (options)';
			return $response;
		}

		if (empty($options->modo)) {
			$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty options->modo (is mandatory)';
			return $response;
		}

		$section_tipo = $options->search_query_object->section_tipo;


		if (!defined('SECTION_TIPO')) {
			define('SECTION_TIPO', $section_tipo);
		}


		$section_records 	= new section_records($section_tipo, $options);
		$html 				= $section_records->get_html();


		#session_write_close();


		$response->result 	= $html;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end load_rows



	/**
	* SEARCH_ROWS (JSON VERSION)
	*/
	function search_rows($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('search_query_object','result_parse_mode','ar_list_map');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if ($name==='result_parse_mode') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.safe_xss($name).' (is mandatory)';
					return $response;
				}
			}

		# Received post var 'options' is a json object stringnified. Decode to regenrate original object
		# $options = json_decode($options);
			if (!is_object($search_query_object)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Received data must be a object (search_query_object)';
				return $response;
			}

		// Remove search query object select to force get 'datos' container full (!)
			$search_query_object->select = [];

		// Change search_query_object id to avoid collisions
			$search_query_object->id = $search_query_object->section_tipo . '_search_rows_temp';

		// Debug
			#$search_query_object->limit = 20;

		// Search against database
			$search_development2 = new search_development2($search_query_object);
			$rows_data 		 	 = $search_development2->search();

		// result_parse_mode optional
			switch ($result_parse_mode) {
				case 'list':
					// Resolve components in mode list
					$result = section::build_json_rows($rows_data, $result_parse_mode, $ar_list_map);
					break;
				case 'edit':
					// Resolve components in mode edit
					$result = section::build_json_rows($rows_data, $result_parse_mode, $ar_list_map);
					break;
				#case 'db':
				#	// Only format data as {data:ar_records,context:ar_context}
				#	$result = section::build_json_rows($rows_data, $result_parse_mode, $ar_list_map);
				#	break;
				default:
					// false / none mode. Nothing to do
					$result = $rows_data->ar_records;
					break;
			}

		// search_query_object. Add updated search_query_object
			$result->search_query_object = $search_query_object;

		// Save current search options
			$search_options = new stdClass();
				$search_options->modo 	 = 'list';
				$search_options->context = new stdClass();
					$search_options->context->context_name = 'default';
				$search_options->search_query_object = $search_query_object;
			$search_options_id = $search_query_object->section_tipo . '_json'; // section tipo like oh1
			section_records::set_search_options($search_options, $search_options_id);


		$response->result 	= $result;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end search_rows



////////////// trigger.service_autocomplete.php
	/**
	* AUTOCOMPLETE_SEARCH
	* Get list of mathed DB results for current string by ajax call
	* @param object $json_data
	*/
	function autocomplete_search($json_data) {
		global $start_time;

		# Write session to unlock session file
		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$vars = array('component_tipo','section_tipo','divisor','search_query_object');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='filter_sections') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		/*
		if (!$search_query_object = json_decode($search_query_object)) {
			$response->msg = "Trigger Error. Invalid search_query_object";
			return $response;
		}
		*/
		if(SHOW_DEBUG===true) {
			#debug_log(__METHOD__." search_query_object ".to_string($search_query_object), logger::DEBUG);
			#dump(null, ' trigger search_query_object ++ '. json_encode($search_query_object, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); #die();
		}

		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component 	 = component_common::get_instance($modelo_name,
													 $component_tipo,
													 null,
													 'list',
													 DEDALO_DATA_LANG,
													 $section_tipo);

		$result 	 = (array)$component->autocomplete_search(
													 $search_query_object,
													 $divisor);

		$response->result 	= $result;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';


		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end function autocomplete_search')



////////////// trigger.time_machine_list.php
	/**
	* GET_TIME_MACHINE_LIST_JSON
	* @return object $response
	*/
	function get_time_machine_list_json($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= null;
			$response->msg 		= 'Error. fail to parse request vars [get_time_machine_list_json]';

		$vars = array('tipo','section_tipo','section_id','modo','value_resolved','limit','offset','count');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
			}

		$time_machine_list 		= new time_machine_list($tipo, $section_id, $section_tipo, $modo='edit');
		$time_machine_list->set_value_resolved($value_resolved);
		$time_machine_list->set_limit($limit);
		$time_machine_list->set_offset($offset);
		$time_machine_list->set_count($count);
		$time_machine_list_json = $time_machine_list->get_json();

		if ($time_machine_list_json !== false) {
			$response->result 	= $time_machine_list_json;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
		}else{
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed [get_time_machine_list_json]';
		}

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;

	}//end get_time_machine_list_json



////////////// trigger.ts_object.php
	include(DEDALO_CORE_PATH.'/ts_object/class.ts_object.php');

	# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
	$options = new stdClass();
	if (isset($_GET['mode']) && $_GET['mode']==='get_childrens_data') {
		$options->source = 'GET';
	}else{
		$options->source = 'php://input';
	}
	common::trigger_manager($options);

	# IGNORE_USER_ABORT
	ignore_user_abort(true);



	/**
	* GET_CHILDRENS_DATA
	* Get json data of all childrens of current element
	* @return object $response
	*/
	function get_childrens_data($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','section_id','node_type','tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		if($node_type==='hierarchy_node') {

			// Childrens are the same current data
			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);
			$childrens = array($locator);
				#dump($childrens, ' childrens ++ '.to_string());

		}else{

			// Calculate childrens from parent
			$modelo_name='component_relation_children';
			$modo 		='list_thesaurus';
			$lang		=DEDALO_DATA_NOLAN;
			$component_relation_children = component_common::get_instance($modelo_name,
																		  $tipo,
																		  $section_id,
																		  $modo,
																		  $lang,
																		  $section_tipo);
			$dato 	   = $component_relation_children->get_dato();
			$childrens = $dato;

			# sort_elements
			#if(SHOW_DEBUG===true) $start_time = start_time();
			#$childrens = ts_object::sort_elements($childrens, 'asc');
			#if(SHOW_DEBUG===true) debug_log(__METHOD__." Titme to sort childrens ".count($childrens)." - ".exec_time($start_time,""), logger::DEBUG);
		}


		$options = new stdClass();
		if (isset($_SESSION['dedalo4']['config']['thesaurus_view_mode']) && $_SESSION['dedalo4']['config']['thesaurus_view_mode']==='model') {
			$options->model = true;
		}

		try{

			$childrens_data = array();
			foreach ((array)$childrens as $locator) {

				$section_id 		= $locator->section_id;
				$section_tipo 		= $locator->section_tipo;

				$ts_object  		= new ts_object( $section_id, $section_tipo, $options );
				$childrens_object 	= $ts_object->get_childrens_data();
				#debug_log(__METHOD__." childrens_object ".to_string($childrens_object), logger::DEBUG);

				# Add only descriptors
				#if ($childrens_object->is_descriptor===true) {
					$childrens_data[] 	= $childrens_object;
				#}
			}

			$response->result 	= (array)$childrens_data;
			$response->msg 		= 'Ok. Request done [get_childrens_data]';

		}catch(Exception $e) {

			$response->result 	= false;
			$response->msg 		= 'Error. Caught exception: '.$e->getMessage();
		}



		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end get_ar_childrens_data_real



	/**
	* ADD_CHILDREN
	* @return object $response
	*/
	function add_children($json_data) {
		global $start_time;

		$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// set vars
			$vars = array('section_tipo','section_id','node_type','tipo');
				foreach($vars as $name) {
					$$name = common::setVarData($name, $json_data);
					# DATA VERIFY
					#if ($name==='dato') continue; # Skip non mandatory
					if (empty($$name)) {
						$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
						return $response;
					}
				}

		// new section. Create a new empty section
			$new_section 	= section::get_instance(null,$section_tipo);
			$new_section_id	= $new_section->Save();
							if (empty($new_section_id)) {
								#debug_log(__METHOD__." Error on create new section from parent. Stoped add_children process !".to_string(), logger::ERROR);
								$response->msg 		= 'Error on create new section from parent. Stoped add_children process !';
								return $response;
							}

		// section map
			$section_map = hierarchy::get_section_map_elemets( $section_tipo );

		// set new section component 'is_descriptor' value
			if (!isset($section_map['thesaurus']->is_descriptor)) {
				debug_log(__METHOD__." Invalid section_map 'is_descriptor' property from section $section_tipo ".to_string($section_map), logger::DEBUG);
			}else{
				if ($section_map['thesaurus']->is_descriptor!==false) {
					$component_tipo = $section_map['thesaurus']->is_descriptor;
					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component 	 	= component_common::get_instance($modelo_name,
																	 $component_tipo,
																	 $new_section_id,
																	 'edit', // note mode edit autosave default value
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);
					$component->get_dato();
					debug_log(__METHOD__." Saved default dato to 'is_descriptor' component ($component_tipo : $modelo_name) on section_id: ".to_string($new_section_id), logger::DEBUG);
				}
			}

		// is_indexable default value set
			if (!isset($section_map['thesaurus']->is_indexable)) {
				debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $section_tipo ".to_string($section_map), logger::DEBUG);
			}else{
				if ($section_map['thesaurus']->is_indexable!==false) {
					$component_tipo = $section_map['thesaurus']->is_indexable;
					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component 	 	= component_common::get_instance($modelo_name,
																	 $component_tipo,
																	 $new_section_id,
																	 'edit', // note mode edit autosave default value
																	 DEDALO_DATA_NOLAN,
																	 $section_tipo);
					$component->get_dato();
					debug_log(__METHOD__." Saved default dato to 'is_indexable' component ($component_tipo : $modelo_name) on section_id: ".to_string($new_section_id), logger::DEBUG);
				}
			}


		// component_relation_children
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			if ($modelo_name!=='component_relation_children') {
				$response->msg = 'Error on create new section from parent. Invalid model: '.$modelo_name.'. Expected: "component_relation_children" ';
				return $response;
			}
			$modo 			= 'edit';
			$lang			= DEDALO_DATA_NOLAN;
			$component_relation_children = component_common::get_instance($modelo_name,
																		  $tipo,
																		  $section_id,
																		  $modo,
																		  $lang,
																		  $section_tipo);
		// add
			$added = (bool)$component_relation_children->make_me_your_children( $section_tipo, $new_section_id );
			if ($added===true) {

				# Save relation children data
				$component_relation_children->Save();

				# All is ok. Result is new created section section_id
				$response->result  	= (int)$new_section_id;
				$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

				// debug
					if(SHOW_DEBUG===true) {
						$debug = new stdClass();
							$debug->exec_time 	= exec_time_unit($start_time,'ms')." ms";
							foreach($vars as $name) {
								$debug->{$name} = $$name;
							}
						$response->debug = $debug;
					}
			}


		return (object)$response;
	}//end add_children



	/**
	* ADD_CHILDREN_FROM_HIERARCHY
	* @return object $response
	*/
	function add_children_from_hierarchy($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// vars
			$vars = array('section_tipo','section_id','target_section_tipo','tipo');
				foreach($vars as $name) {
					$$name = common::setVarData($name, $json_data);
					# DATA VERIFY
					#if ($name==='dato') continue; # Skip non mandatory
					if (empty($$name)) {
						$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
						return $response;
					}
				}

		// new section
			$new_section 	= section::get_instance(null,$target_section_tipo);
			$new_section_id	= $new_section->Save();
							if (empty($new_section_id)) {
								debug_log(__METHOD__." Error on create new section from parent. Stoped add_children process !".to_string(), logger::ERROR);
								$response->msg = 'Trigger Error: ('.__FUNCTION__.') Error on create new section from parent. Stoped add_children process !';
								return $response;
							}
		// section map
			$section_map = hierarchy::get_section_map_elemets( $target_section_tipo );

		// set new section component 'is_descriptor' value
			if (!isset($section_map['thesaurus']->is_descriptor)) {
				debug_log(__METHOD__." Invalid section_map 'is_descriptor' property from section $target_section_tipo ".to_string($section_map), logger::DEBUG);
			}else{
				if ($section_map['thesaurus']->is_descriptor!==false) {
					$component_tipo = $section_map['thesaurus']->is_descriptor;
					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component 	 	= component_common::get_instance($modelo_name,
																	 $component_tipo,
																	 $new_section_id,
																	 'edit', // note mode edit autosave default value
																	 DEDALO_DATA_NOLAN,
																	 $target_section_tipo);
					$component->get_dato();
				}
			}

		// set new section component 'is_indexable' value
			if (!isset($section_map['thesaurus']->is_indexable)) {
				debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $target_section_tipo ".to_string($section_map), logger::DEBUG);
			}else{
				if ($section_map['thesaurus']->is_indexable!==false) {
					$component_tipo = $section_map['thesaurus']->is_indexable;
					$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component 	 	= component_common::get_instance($modelo_name,
																	 $component_tipo,
																	 $new_section_id,
																	 'edit', // note mode edit autosave default value
																	 DEDALO_DATA_NOLAN,
																	 $target_section_tipo);
					$component->get_dato();
				}
			}

		// component_relation_children
			$modelo_name 	= 'component_relation_children';
			$modo 			= 'edit';
			$lang			= DEDALO_DATA_NOLAN;
			$component_relation_children = component_common::get_instance($modelo_name,
																		  $tipo,
																		  $section_id,
																		  $modo,
																		  $lang,
																		  $section_tipo);

		// add
			$added = (bool)$component_relation_children->make_me_your_children( $target_section_tipo, $new_section_id );
			if ($added===true) {
				$component_relation_children->Save();

				# All is ok. Result is new created section section_id
				$response->result  	= (int)$new_section_id;
				$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';
			}

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
					foreach($vars as $name) {
						$debug->{$name} = $$name;
					}

				$response->debug = $debug;
			}

		return (object)$response;
	}//end add_children_from_hierarchy



	/**
	* DELETE
	* Removes current thesaurus element an all references in parents
	* @return object $response
	*/
	function delete($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$vars = array('section_tipo','section_id','node_type');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}


		# CHILDRENS . Verify that current term don't have childrens. If yes, stop process.
		$modelo_name 		= 'component_relation_children';
		$modo 				= 'edit';
		$lang				= DEDALO_DATA_NOLAN;
		$ar_children_tipo 	= section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, array($modelo_name), $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
		foreach ($ar_children_tipo as $current_tipo) {

		 	$component_relation_children = component_common::get_instance($modelo_name,
																		  $current_tipo,
																		  $section_id,
																		  $modo,
																		  $lang,
																		  $section_tipo);
		 	$dato = $component_relation_children->get_dato();

		 	if (!empty($dato)) {
		 		debug_log(__METHOD__." Stopped delete term from thesaurus. Current term have childrens".to_string($dato), logger::DEBUG);
		 		$response->msg = 'Trigger Error: ('.__FUNCTION__.') ' . "Stopped delete term from thesaurus. Current term have childrens ".to_string($dato);
		 		return (object)$response;
		 	}
		}


		# REFERENCES . Calculate parents and removes references to current section
		$relation_response = component_relation_common::remove_parent_references($section_tipo, $section_id, false);


		# RECORD . Finally, delete target section
		$section_to_remove	= section::get_instance($section_id, $section_tipo);
		$result 			= (bool)$section_to_remove->Delete('delete_record');

		debug_log(__METHOD__." Removed section $section_id, $section_tipo ".to_string(), logger::DEBUG);

		$response->result	= $result;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}
			$debug->relation_response = $relation_response;

			$response->debug = $debug;

		}

		return (object)$response;
	}//end delete



	/**
	* UPDATE_PARENT_DATA
	* Updates element
	* @return object $response
	*/
	function update_parent_data($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','section_id','old_parent_section_id','old_parent_section_tipo','parent_section_id','parent_section_tipo','parent_node_type','tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				if (empty($$name)) {
					echo "Error. ".$$name." is mandatory";
					return false;
				}
			}

		# Remove current element as children from previous parent (old parentt)
			$locator = new locator();
				$locator->set_section_tipo($old_parent_section_tipo);
				$locator->set_section_id($old_parent_section_id);
			$filter   = array($locator);
			$relation_response = component_relation_common::remove_parent_references($section_tipo, $section_id, $filter);
			if ($relation_response->result===true) {
				debug_log(__METHOD__." Removed me as children from old parent  ".to_string(), logger::DEBUG);
			}

		# Add me as children of new parent
			$modelo_name 	= 'component_relation_children';
			#$tipo 			= ($parent_node_type=='root') ? DEDALO_HIERARCHY_CHIDRENS_TIPO : DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO;
			$modo 			= 'edit';
			$lang			= DEDALO_DATA_NOLAN;
			$component_relation_children = component_common::get_instance($modelo_name,
																		  $tipo,
																		  $parent_section_id,
																		  $modo,
																		  $lang,
																		  $parent_section_tipo);

			$added = (bool)$component_relation_children->make_me_your_children( $section_tipo, $section_id );
			if ($added===true) {

				$component_relation_children->Save();

				debug_log(__METHOD__." Added dropped element as children of target wrap ".to_string(), logger::DEBUG);

				# All is ok. Result is new created section section_id
				$response->result 	= true;
				$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

				# Debug
				if(SHOW_DEBUG===true) {
					$debug = new stdClass();
						$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
						foreach($vars as $name) {
							$debug->{$name} = $$name;
						}
						$debug->remove_parent_references= $relation_response;
						$debug->added					= $added;

					$response->debug = $debug;
				}
			}

		return (object)$response;
	}//end update_parent_data



	/**
	* SHOW_INDEXATIONS
	* @return object $response
	*/
	function show_indexations($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','section_id','component_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				#if ($name==='dato') continue; # Skip non mandatory
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}

		# DIFFUSION_INDEX_TS
		$diffusion_index_ts = new diffusion_index_ts($section_tipo, $section_id, $component_tipo);
		$html 				= $diffusion_index_ts->get_html();


		$response->result 	= $html;
		$response->msg 		= "Request done successufully";

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


		return (object)$response;
	}//end show_indexations



	/**
	* SAVE_ORDER
	* @return object $response
	*/
	function save_order($json_data) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		# set vars
		$vars = array('section_tipo','section_id','component_tipo','ar_locators');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				if (empty($$name)) {
					$response->msg = $name." is mandatory";
					return $response;
				}
			}

		#$ar_locators = json_decode($ar_locators);
		$dato = array();
		foreach ((array)$ar_locators as $current_locator) {
			$locator = new locator();
				$locator->set_section_tipo($current_locator->section_tipo);
				$locator->set_section_id($current_locator->section_id);
				$locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
				$locator->set_from_component_tipo($component_tipo);

			$dato[] = $locator;
		}

		$component_relation_children = component_common::get_instance('component_relation_children',
																	  $component_tipo,
																	  $section_id,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);
		// Current component dato is replaced completly with the new dato
		// This action returns the dato parsed with method component_relation_common->set_dato()
		$component_relation_children->set_dato($dato);
		$result = $component_relation_children->Save();


		$response->result 	= $result;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

		# Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}

		return (object)$response;
	}//end save_order
