<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
$start_time= start_time();

$html = '
 <div class="page">
 <div id="oh33" class="draggable component_box ui-draggable ui-draggable-handle ui-resizable" style="position: relative; left: 1px; top: -6px;">
  <div class="print_label component_radio_button_print_label">Cesión de imagen</div>
  <div class="print_content component_radio_button_print_content">No</div>
  <div class="ui-resizable-handle ui-resizable-e" style="z-index: 90;"></div>
  <div class="ui-resizable-handle ui-resizable-s" style="z-index: 90;"></div>
  <div class="ui-resizable-handle ui-resizable-se ui-icon ui-icon-gripsmall-diagonal-se" style="z-index: 90;"></div>
 </div>
  <div id="oh35" class="draggable component_box ui-draggable ui-draggable-handle ui-resizable" style="position: relative; left: 1px; top: -7px;">
  <div class="print_label component_radio_button_print_label">Acta de cesión</div>
  <div class="print_content component_radio_button_print_content">Si</div>
  <div class="ui-resizable-handle ui-resizable-e" style="z-index: 90;"></div>
  <div class="ui-resizable-handle ui-resizable-s" style="z-index: 90;"></div>
  <div class="ui-resizable-handle ui-resizable-se ui-icon ui-icon-gripsmall-diagonal-se" style="z-index: 90;"></div>
 </div>
 </div>';
 $html ='<div id="page1" class="page fixed" ondrop="Drop(event)" ondragover="dragOver(event)" ondragenter="dragEnter(event)" ondragleave="dragLeave(event)" style="border: none;">
 <div class="page_close_button" onclick="removePage(this)"></div>
 <div id="oh35" class="draggable component_box" style="position: absolute; left: 220px; top: 132px;"><div id="close" class="close" style="display: block;" onclick="javascript:returnLeft(oh35)"></div>
 <div class="print_label component_radio_button_print_label">Acta de cesión</div>
 <div class="print_content component_radio_button_print_content">Si</div>
 </div>
 </div>';
  dump( htmlentities($html), ' html');

  $html_template = component_layout::build_html_template($html);
    dump( htmlentities($html_template), ' html_template');

  $parent = 47;
  $render_template = component_layout::render_template( $html_template, $parent );
    dump( htmlentities($render_template), ' rendered_template');


if(SHOW_DEBUG) {
  $exec_time    = exec_time_unit($start_time, $unit='ms', 6);
  $memory_usage   = tools::get_memory_usage(false); 
  echo "$img <div class=\"info_line\">$exec_time $unit - memory_usage:$memory_usage</div>";
}
die();




$filename = DEDALO_LIB_BASE_PATH.'/ts/maps/political_map.csv';
/*
$csv = array_map('str_getcsv', file($filename));
	#dump($csv," csv");

function csv_to_array($filename='', $delimiter=';')
{
    if(!file_exists($filename) || !is_readable($filename))
        return FALSE;

    $header = NULL;
    $data = array();
    if (($handle = fopen($filename, 'r')) !== FALSE)
    {
        while (($row = fgetcsv($handle, 1000, $delimiter)) !== FALSE)
        {
            if(!$header) {
                $header = $row; 			 	#dump($header," header");
            }else{

            	$current_row = array_combine($header, $row);		#dump($row[0]," row");	dump($row," row");
            		#dump($current_row," current_row");
            	
            	# Convert string value to array value
            	foreach ($current_row as $key => $value) {            		
            		$current_row[$key] = explode(',', $value);
            		# Trim every element for possibles spaces 
            		#foreach ($current_row[$key] as $sub_key => $current_str_value) {
	           		#	$current_row[$key][$sub_key] = trim($current_str_value);
	           		#}          		           		
            	}

            	$current_row 	= array_slice($current_row, 1); 
            	$data[$row[0]] 	= $current_row; 	#dump($current_row," current_row");
            	
            	
            }
                
        }
        fclose($handle);
    }
    return $data;
}
$csv = csv_to_array($filename, ';');
*/
$csv = Tesauro::get_ar_ts_map('political_map');
	dump($csv," csv 2");
/**/
/*
$row = 1;
$ar_data=array();
if (($handle = fopen($filename, "r")) !== FALSE) {
    while (($data = fgetcsv($handle, 1000, ";")) !== FALSE) {
        $num = count($data);
        echo "<p> $num fields in line $row: <br /></p>\n";
        $row++;
        for ($c=0; $c < $num; $c++) {
           # echo $data[$c] . "<br />\n";
            $ar_data[$row][]=$data[$c];
        }
    }
    fclose($handle);
}
	dump($ar_data," ar_data 3");
*/



die();


	




echo MAGICK_PATH;




die();
		#
		# FOTÓGRAFO SELECT
		$fotografo_tipo 		= 'rsc52';	# component_autocomplete (Media recursos : Fotógrafo)
		$fotografo_target_tipo 	= 'rsc85';	# component_input_text (Informantes / Participantes / Contactos : Nombre)

		$arguments=array();
		$arguments["datos#>>'{components, $fotografo_target_tipo, dato, ".DEDALO_DATA_NOLAN."}':!="] = 'null';
		$matrix_table			= common::get_matrix_table_from_tipo($fotografo_target_tipo);
		$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table,NULL);
		$ar_result				= (array)$JSON_RecordObj_matrix->search($arguments);
				dump($ar_result," ");

		
		foreach ($ar_result as $fotografo_id) {
			$component_input_text = component_common::get_instance('component_input_text',$fotografo_target_tipo,$fotografo_id,'list',DEDALO_DATA_NOLAN);
			$nombre = $component_input_text->get_dato();
				#dump($nombre," nombre");
			$ar_final[$fotografo_id] = ucfirst($nombre);
		}
		asort($ar_final, SORT_LOCALE_STRING);
		#dump( $ar_final );
		
		$fotografo_html  = '';
		$fotografo_html .= "<select>";
		$fotografo_html .= " <option value=\"\" ></option>";
		foreach ($ar_final as $fotografo_id => $nombre) {
			$fotografo_html .= " <option value=\"$fotografo_id\" >";
			$fotografo_html .= $nombre;
			if(SHOW_DEBUG) {
				$fotografo_html .= " [$fotografo_id]";
			}
			$fotografo_html .= "</option>";
		}
		$fotografo_html .= "</select>";

		echo $fotografo_html;
die();



$test = $_REQUEST['test'];
$test = json_handler::decode($test);

$options = new stdClass();
	$options->test = $test;
		dump($options,"options");

$options_encoded = json_handler::encode($options);
		dump($options_encoded,"");

$options_decoded = json_handler::decode($options_encoded);
		dump($options_decoded->test,"options_decoded");

die();



$options = new stdClass();
$options->to_find = "225041.0.0";
if (isset($_REQUEST['to_find'])) {
	$options->to_find = $_REQUEST['to_find'];
}
if (isset($_REQUEST['filter_by_modelo_name'])) {
	$options->filter_by_modelo_name = $_REQUEST['filter_by_modelo_name'];
}
$options->tipo 		= "dd12";

$references = common::get_references($options);
	dump($references,"references");


#dump($TIMER,"timer");;

die();

$component_tipo='dd88';

$component_global_dato 						= new stdClass();
$component_global_dato->$component_tipo 	= new stdClass();
#$component_global_dato	= $obj_global_dato->$component_tipo ;


/*
# INFO : Creamos la info del componente actual
$component_global_dato->info = new stdClass();
$component_global_dato->info->modelo = RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
$component_global_dato->info->label  = RecordObj_dd::get_termino_by_tipo($component_tipo);
*/

dump($component_global_dato,"component_global_dato");
die();





	$myvar = array( 
		'dd452' => array('"72":"2"','"73":"2"')
		);

	echo json_encode($myvar);


?>
<html>



<?php
#echo "<div style=\"margin:30px;\">".phpinfo()."</div>";


echo"<pre>";
echo"</pre>";


#ob_flush(html_page::get_html);
#echo html_page::get_html(ob_flush())
?>

</html>