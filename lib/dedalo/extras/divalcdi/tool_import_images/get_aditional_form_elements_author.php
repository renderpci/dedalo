<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))).'/config/config4.php');
#require_once(DEDALO_LIB_BASE_PATH.'/extras/mupreva/tool_import_images/import_imagenes_catalogo.php');

	$html='';

	#
	# FOTÓGRAFO SELECT
	$author_tipo = isset($_REQUEST['author_tipo']) ? safe_xss($_REQUEST['author_tipo']) : RESOURCE_COMPONENT_TIPO_AUTHOR; //'rsc52';	# component_autocomplete (Media recursos : Fotógrafo)

	# REFERENCED_SECTION_TIPO
	$ar_terminos_relacionados =	RecordObj_dd::get_ar_terminos_relacionados($author_tipo, $cache=false, $simple=true);
	foreach ($ar_terminos_relacionados as $current_tipo) {
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo);
		if ($modelo_name=='section') {
			$referenced_section_tipo = $current_tipo;
			break;
		}
	}



	$modelo_name 		  	= 'component_autocomplete';
	$component 			  	= component_common::get_instance($modelo_name,$author_tipo,null,'list',DEDALO_DATA_NOLAN, $referenced_section_tipo);
	$all_component_values 	= $component->get_ar_list_of_values( DEDALO_DATA_LANG, null );	
	#$html .= $component->get_html();

	$html .=" Autor: ";
	$html .= '<div id="wrap_author_select" style="display:inline-block;padding-left:5px;padding-right:5px;">';
		
		$author_html  = '';		
		$author_html .= "<select name=\"author\" id=\"author\">";
		$author_html .= " <option value=\"\" ></option>";
		foreach ($all_component_values->result as $author_id => $nombre) {

			#$author_id = urlencode($author_id);

			$author_html .= " <option value='$author_id' >";
			$author_html .= $nombre;
			if(SHOW_DEBUG) {
				$author_html .= " [$author_id]";
			}
			$author_html .= "</option>";
		}
		$author_html .= "</select>";
		

	$html .= $author_html ;
	$html .= " <a href=\"?t=$referenced_section_tipo&m=list\" target=\"_blank\">Edit</a> ";
	$html .= " - <a href=\"javascript:;\" onclick=\"reload_aditional_form_elements()\">Reload</a> ";
	$html .= '</div>';


	echo $html;

?>
<script>
function reload_aditional_form_elements() {
	$('#wrap_author_select').html(" <em>Updating fotógrafo selection list.. please wait..</em> ");
	setTimeout(function(){
		var url = DEDALO_LIB_BASE_URL + "/extras/mupreva/tool_import_images/get_aditional_form_elements_author.php?author_tipo=<?php echo $author_tipo ?>&referenced_section_tipo=<?php echo $referenced_section_tipo ?>";
		//console.log(url);
		$("#wrap_author_select").load(url+" #wrap_author_select",""); //>*
	}, 10)
}
</script>
