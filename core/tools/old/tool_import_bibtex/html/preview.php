<?php 
/**
* TOOL_IMPORT_BIBTEX PREVIEW
*
*/
require_once( DEDALO_CONFIG_PATH .'/config.php');
require_once( dirname(dirname(__FILE__)) .'/class.tool_import_bibtex.php');  # Read constants from here

# Button tipo set
$button_tipo = safe_tipo( get_request_var('button_tipo') ); // Core function

#
# SEARCH FOR .BIB FILE
$ar_files = (array)glob(TOOL_IMPORT_BIBTEX_UPLOAD_DIR . '*.bib');
if (empty($ar_files[0])) {
			echo "<div class=\"no_bib_file_found\">Sorry. No BIB file exists. Please upload a BIBTex export file in BIB format.</div>";
			return;
		}
		if (count($ar_files)>1) {
			echo "<div class=\"no_bib_file_found\">Sorry. Only one BIB file can be processed at once. Please, delete additional BIB files </div>";
			return;
		}
	#$file_data = json_decode(file_get_contents($ar_files[0]));	// @return expected: array of objects 
	$file_data = tool_import_bibtex::parse_bibex($ar_files[0]);


	

/* REFERENCE EXAMPLE DATA OBJECT
	(
		[raw] => @book{SerraiGuell1991,
			address = {Barcelona},
			annote = {Cat�leg exposici�},
			author = {{Serra i G{"{u}}ell}, Eudald and Huera, Carmen and {Soriano Marin}, Mar{'{i}}a Dolores},
			isbn = {8476094760},
			keywords = {Escultura antropol{`{o}}gica - Exposicions,Eudald - Exposicions,MEB,Museu Etnol{`{o}}gic - Barcelona - Exposicions,Serra},
			mendeley-tags = {MEB},
			publisher = {Ajuntament de Barcelona; Fundaci� Folch},
			title = {{Escultures antropol{`{o}}giques d' Eudald Serra i G{"{u}}ell: Museu Etnol{`{o}}gic octubre 1991 - gener 1992}},
			year = {1991}
			}
        [type] => book
        [reference] => SerraiGuell1991
        [lines] => Array
            (
                [start] => 1
                [end] => 11
            )
        [address] => Barcelona
        [annote] => Cat�leg exposici�
        [author] => Array
            (
                [0] => Serra i G uell, Eudald
                [1] => Huera, Carmen
                [2] => Soriano Marin, Mar ia Dolores
            )
        [isbn] => 8476094760
        [keywords] => Escultura antropol ogica - Exposicions,Eudald - Exposicions,MEB,Museu Etnol ogic - Barcelona - Exposicions,Serra
        [mendeley-tags] => MEB
        [publisher] => Ajuntament de Barcelona; Fundaci� Folch
        [title] => Escultures antropol ogiques d  Eudald Serra i G uell: Museu Etnol ogic octubre 1991 - gener 1992
        [year] => 1991
	)
*/


	$html  = '';
	$html .= "<form class=\"form_preview\">";

	#
	# JSON TABLE
	# Data map like 'rsc140' => 'title'
	$data_map  		= (array)tool_import_bibtex::get_data_map();
	# Section tipo (for links to go current record)
	$section_tipo 	= BIBLIO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA;	# 'rsc205'; # is virtual section (Bibliografía)

	#$preview_showed_names = array("type","reference","address","annote","author","isbn","keywords","publisher","title","year","url","file");
	if(SHOW_DEBUG) {
		$ar_excluded_preview = array("lines");
	}else{
		$ar_excluded_preview = array("raw","lines");
	}
	

	foreach ((array)$file_data as $key => $current_obj) {

		$current_obj = (object)$current_obj;	// Convert to object for easy selections

		#
		# PDF FILE
		$file_name 		= null;
		$file_path 		= null;
		$file_name_data = 'file';
		if (isset($current_obj->$file_name_data) && !empty($current_obj->$file_name_data) ) {
			
			$file_name 	= tool_import_bibtex::resolve_filename($current_obj->$file_name_data);
			$file_path 	= TOOL_IMPORT_BIBTEX_UPLOAD_DIR . $file_name;			
		}		

		$added_caption=false;
		$html .= '<table class="table_preview">';		
		foreach ($current_obj as $name => $value) {

			#$current_tipo = array_search($name, $data_map);
			$current_tipo = isset($data_map[$name]) ? $data_map[$name] : null;

			# CAPTION
			if ( !$added_caption ) {
				$html .= '<caption>';

				$checked = "checked";
				

				#
				# PDF FILE				
				if (!$file_path) {
					#$checked = '';
					#$html .= "<span class=\"error\">".label::get_label('sin_fichero')."</span>";
				}

				
				#
				# Checkbox
				$html .= "<input type=\"checkbox\" name=\"import_bibtex_checkbox[]\" value=\"$key\" $checked />";


				#
				# reference
				if (!property_exists($current_obj, 'reference')) throw new Exception("Error Processing Request. reference is manadory", 1);
				$html .= '<strong><span>['.$current_obj->reference.']</span></strong>  ';


				#
				# Title
				if (property_exists($current_obj, 'title')) {
					$html .= '<span>'.$current_obj->title.'</span>';
				}else{
					$html .= '<span> </span>';
				}
				
				
				#
				# Button go_to_file
				$section_id = tool_import_bibtex::get_section_id_from_bibtex_reference($current_obj->reference);
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
			}//end iif ( !$added_caption ) {		

				

			# JSON DATA 
			if (!in_array($name,$ar_excluded_preview) ) {				
			$html .= '<tr>';

				# TH BIB label like 'author'
				$html .= ' <th nowrap>';
				$html .= $name;
				$html .= ' </th>';			
				
				# TD Type (like rsc52)
				if(SHOW_DEBUG) {
					$html .= '<td>';
					if ($current_tipo) {
					$html .= "[$current_tipo]";
					}
					$html .= '</td>';
				}
				
				# TD Name like 'Código'
				if ($current_tipo) {				
					$html .= '<td class="dedalo_label">';
					$html .= RecordObj_dd::get_termino_by_tipo($current_tipo,DEDALO_DATA_LANG,true);				
					$html .= '</td>';
				}else{
					$html .= '<td class="dedalo_label ignored">';
					$html .= '  ';
					$html .= '</td>';
				}
				
				# TD Value
				if ($section_id>0) {
					$html .= '<td class="id_exist">';
				}else{
					$html .= '<td>';
				}
					
					/*
					$prev_value=$value;
					if ($name=='issued' || $name=='accessed') {				             
						$value = tool_import_bibtex::bibtex_date_to_dd_date($value);						
						if(SHOW_DEBUG) {
							$value .= "<br>".to_string($prev_value);
						}
					}
					if ($name=='author' || $name=='editor') {   
						$value = tool_import_bibtex::bibtex_name_to_name($value);
						if(SHOW_DEBUG) {
							$value .= "<br>".to_string($prev_value);
						}
					}
					if ($name==$call_number_name) {
						$value = trim($value).'.pdf';
					}
					*/					
					
					$html .= to_string($value);

					/*
					if ($name=='type') {
						$res = tool_import_bibtex::get_tipologia_from_bibtex_type($value);
						if (empty($res)) {
							$html .=" <span class=\"warning\">Warning: This typology is not defined in Dédalo (ignored info)</span>";
						}
					}
					*/

				$html .= '</td>';

			$html .= '</tr>';
			}//end if (!in_array($name,$ar_excluded_preview) ) {

		}#end foreach ($current_obj as $name => $value)
		
		$html .= '</table><br>';			
	}#end foreach ((array)$file_data as $key => $current_obj)


	#
	# Form elements (buttons etc)
	$html .= "<div class=\"form_elements\">";	
	$html .= "	<input type=\"button\" class=\"css_button_generic submit_import\" data-button_tipo=\"$button_tipo\" value=\" ". strtoupper( label::get_label('procesar') )." \" onclick=\"tool_import_bibtex.process_file(this)\">";
	$html .= "</div>";

	
	$html .= "</form>"; //form




echo $html;

	
?>