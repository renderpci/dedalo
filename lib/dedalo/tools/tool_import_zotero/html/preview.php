<?php 
/**
* TOOL_IMPORT_ZOTERO PREVIEW
*
*/
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');
require_once( dirname(dirname(__FILE__)) .'/class.tool_import_zotero.php');  # Read constants from here

# Button tipo set
$button_tipo = isset($_REQUEST['button_tipo']) ? $_REQUEST['button_tipo'] : null;

#
# SEARCH FOR JSON ZOTERO FILE
$ar_files = (array)glob(TOOL_IMPORT_ZOTERO_UPLOAD_DIR . '*.json');
if (empty($ar_files[0])) {
			echo "<div class=\"no_json_file_found\">Sorry. No JSON file exists. Please upload a zotero export file in JSON format.</div>";
			return;
		}
		if (count($ar_files)>1) {
			echo "<div class=\"no_json_file_found\">Sorry. Only one JSON file can be processed at once. Please, delete additional json files </div>";
			return;
		}
	#dump($ar_files, ' ar_files');exit();
	$file_data = json_decode(file_get_contents($ar_files[0]));	// @return expected: array of objects 
	#dump($file_data, ' file_data');#exit();


	

/* REFERENCE EXAMPLE DATA OBJECT
	(
		[id] => 4
		[type] => entry-encyclopedia
		[title] => Hamlet
		[container-title] => Wikipedia, la enciclopedia libre
		[source] => Wikipedia
		[abstract] => La tragedia de Hamlet, Príncipe de Dinamarca (título original en inglés: The Tragedy of Hamlet, Prince of Denmark), o simplemente Hamlet es una tragedia del dramaturgo inglés William Shakespeare. Su autor probablemente basó su Hamlet en dos fuentes: la leyenda de Amleth y una perdida obra isabelina conocida hoy como Ur-Hamlet o Hamlet original (hecho que se deduce de otros textos).
		[URL] => http://es.wikipedia.org/w/index.php?title=Hamlet&oldid=79103751
		[note] => Page Version ID: 79103751
		[language] => es
		[issued] => stdClass Object (
				[date-parts] => Array (
						[0] => Array (
								[0] => 2014
								[1] => 12
								[2] => 30
							)
					)
			)
		[accessed] => stdClass Object (
				[date-parts] => Array (
						[0] => Array (
								[0] => 2015
								[1] => 1
								[2] => 12
							)
					)
				[season] => 12:57:26
			)
	)
*/


	$html  = '';
	$html .= "<form class=\"form_preview\">";

	#
	# JSON TABLE
	# Data map like 'rsc140' => 'title'
	$data_map  		= (array)tool_import_zotero::get_data_map();
	# Section tipo (for links to go current record)
	$section_tipo 	= ZOTERO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA;	# 'rsc205'; # is virtual section (Bibliografía)

	foreach ((array)$file_data as $key => $current_obj) {

		$added_caption=false;
		$html .= '<table class="table_preview">';		
		foreach ($current_obj as $name => $value) {

			$current_tipo = array_search($name, $data_map);

			# CAPTION
			if ( !$added_caption ) {
				$html .= '<caption>';

				$checked = "checked";
				
				$call_number_name 	= 'call-number';		#dump($current_obj->$call_number_name, '$current_obj->$call_number_name');				
				if (!isset($current_obj->$call_number_name) || empty($current_obj->$call_number_name) ) {
					$checked = '';
					$html .= "<span class=\"error\">".label::get_label('sin_fichero')."</span>";
				}else{
					$file_name 		= trim($current_obj->$call_number_name).'.pdf';
					$file_path 		= TOOL_IMPORT_ZOTERO_UPLOAD_DIR . $file_name;
					if(!file_exists($file_path)) {
						$checked = '';
						$html .= "<span class=\"error\">".label::get_label('sin_fichero')."</span>";
					}
				}
				
				#
				# Checkbox
				$html .= "<input type=\"checkbox\" name=\"import_zotero_checkbox[]\" value=\"$key\" $checked />";


				#
				# Title
				if (property_exists($current_obj, 'title')) {
					$html .= '<span>'.$current_obj->title.'</span>';
				}else{
					$html .= '<span> </span>';
				}
				

				#
				# Button go_to_file
				# $section_id = tool_import_zotero::get_section_id_from_zotero_id($current_obj->id); OLD WORLD
				$optional_id = 'call-number';
				if (isset($current_obj->$optional_id)) {
					$section_id = (int)$current_obj->$optional_id;	// Optionally, if is defined zotero->call-number, use this as section id
				}else{
					$section_id = (int)$current_obj->id;	// Default, get from zotero id
				}
				
				if ($section_id>0) {
					$url='?t='.$section_tipo.'&id='.$section_id;			
					$html .= "<div class=\"btn_inside_section_buttons_container button_go_to_file\">";
					$html .= " <a href=\"$url\" target=\"_blank\">".label::get_label('informacion').' '.label::get_label('ficha');
					#$html .= label::get_label('ver_ficha_existente');
					if(SHOW_DEBUG) {
						$html .= " [$section_id]";
					}
					$html .= "</div>";
				}				

				$html .= '</caption>';
				$added_caption=true;			
			}//end if ( $value==reset($current_obj) )			

				

			# JSON DATA 
			$html .= '<tr>';

				# TH Zotero label like 'author'
				$html .= ' <th nowrap>';
				$html .= $name;
				$html .= ' </th>';			
				
				# TD Type (like rsc52)
				if(SHOW_DEBUG) {
					$html .= '<td>';
					$html .= "$current_tipo";
					$html .= '</td>';
				}
				
				# TD Name like 'Código'
				if ($current_tipo) {				
					$html .= '<td class="dedalo_label">';
					$html .= RecordObj_dd::get_termino_by_tipo($current_tipo,DEDALO_DATA_LANG,true);				
					$html .= '</td>';
				}else{
					$html .= '<td class="dedalo_label ignored">';
					$html .= 'Ignored';
					$html .= '</td>';
				}
				
				# TD Value
				if ($section_id>0) {
					$html .= '<td class="id_exist">';
				}else{
					$html .= '<td>';
				}
				
					$prev_value=$value;
					if ($name=='issued' || $name=='accessed') {				             
						$value = tool_import_zotero::zotero_date_to_timestamp($value);						
						if(SHOW_DEBUG) {
							$value .= "<br>".print_r($prev_value,true);
						}
					}
					if ($name=='author' || $name=='editor') {   
						$value = tool_import_zotero::zotero_name_to_name($value);
						if(SHOW_DEBUG) {
							$value .= "<br>".print_r($prev_value,true);
						}
					}
					if ($name==$call_number_name) {
						$value = trim($value).'.pdf';
					}

					
					
					$html .= to_string($value);

					if ($name=='type') {
						$res = tool_import_zotero::get_tipologia_from_zotero_type($value);
						if (empty($res)) {
							$html .=" <span class=\"warning\">Warning: This typology is not defined in Dédalo (ignored info)</span>";
						}
					}

				$html .= '</td>';

			$html .= '</tr>';			
		}#end foreach ($current_obj as $name => $value)
		
		$html .= '</table><br>';			
	}#end foreach ((array)$file_data as $key => $current_obj)


	#
	# Form elements (buttons etc)
	$html .= "<div class=\"form_elements\">";	
	$html .= "	<input type=\"button\" class=\"css_button_generic submit_import\" data-button_tipo=\"$button_tipo\" value=\" ". strtoupper( label::get_label('procesar') )." \" onclick=\"tool_import_zotero.process_file(this)\">";
	$html .= "</div>";

	
	$html .= "</form>"; //form




echo $html;

	
?>