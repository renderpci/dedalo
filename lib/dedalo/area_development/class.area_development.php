<?php
/**
* AREA_DEVELOPMENT
*
*
*/
class area_development extends area {



	/**
	* get_ar_widgets
	* @return array $data_items
	*	Array of objects
	*/
	public function get_ar_widgets() {

		$ar_widgets = [];

		// update_structure
			$item = new stdClass();
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('actualizar_estructura');
				$item->info 	= 'Click to update structure from remote master server';
				$item->body 	= (defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true && !empty(STRUCTURE_SERVER_URL)) ?
					'Current: ' . RecordObj_dd::get_termino_by_tipo(DEDALO_ROOT_TIPO,'lg-spa') .
					'<br>TLD: ' . implode(', ', unserialize(DEDALO_PREFIX_TIPOS)) :
					label::get_label('actualizar_estructura')." is a disabled for ".DEDALO_ENTITY;
				$item->trigger 	= (object)[
					'class_name' => get_class($this),
					'method' 	 => 'update_structure',
					'options' 	 => null
				];
			$ar_widgets[] = $item;


		// register_tools
			$item = new stdClass();
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('registrar_herramientas');
				$item->info 	= 'Click to read tools folder and update the tools register in database';
				$item->body 	= ' ';
				$item->trigger 	= (object)[
					'class_name' => 'tools_register',
					'method' 	 => 'import_tools',
					'options' 	 => null
				];
			$ar_widgets[] = $item;


		// build_structure_css
			$item = new stdClass();
				$item->typo 	= 'widget';
				$item->tipo 	= $this->tipo;
				$item->parent 	= $this->tipo;
				$item->label 	= label::get_label('build_structure_css');
				$item->info 	= 'Click to regenerate css from actual structure';
				$item->body 	= ' ';
				$item->trigger 	= (object)[
					'class_name' => 'css',
					'method' 	 => 'build_structure_css',
					'options' 	 => null
				];
			$ar_widgets[] = $item;



		return $ar_widgets;
	}//end get_ar_widgets



	/**
	* UPDATE_STRUCTURE
	* @return object $response
	*/
	public static function update_structure() {
		$start_time=microtime(1);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		# Remote server case
		if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {

			# Check remote server status before begins
			$remote_server_status = (object)backup::check_remote_server();
			if ($remote_server_status->result===true) {
				$response->msg 		.= $remote_server_status->msg;
			}else{
				$response->msg 		.= $remote_server_status->msg;
				$response->result 	= false;
				return (object)$response;
			}
		}

		# EXPORT. Before import, EXPORT ;-)
			$db_name = 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
			$res_export_structure = (object)backup::export_structure($db_name, $exclude_tables=false);	// Full backup
			if ($res_export_structure->result===false) {
				$response->msg = $res_export_structure->msg;
				return $response;
			}else{
				# Append msg
				$response->msg .= $res_export_structure->msg;
				# Exec time
				$export_exec_time	= exec_time_unit($start_time,'ms')." ms";
				$prev_time 			= microtime(1);
			}

		# IMPORT
			$res_import_structure = backup::import_structure();

			if ($res_import_structure->result===false) {
				$response->msg .= $res_import_structure->msg;
				return $response;
			}else{
				$response->msg .= $res_import_structure->msg;
				# Exec time
				$import_exec_time = exec_time_unit($prev_time,'ms')." ms";
			}


		# Delete session config (force to recalculate)
		#unset($_SESSION['dedalo4']['config']);

		# Delete session permissions table (force to recalculate)
		#unset($_SESSION['dedalo4']['auth']['permissions_table']);

		# Delete all session data except auth
			foreach ($_SESSION['dedalo4'] as $key => $value) {
				if ($key==='auth') continue;
				unset($_SESSION['dedalo4'][$key]);
			}


		#
		# UPDATE JAVASCRIPT LABELS
			$ar_langs 	 = (array)unserialize(DEDALO_APPLICATION_LANGS);
			foreach ($ar_langs as $lang => $label) {
				$label_path  = '/common/js/lang/' . $lang . '.js';
				$ar_label 	 = label::get_ar_label($lang); // Get all properties
					#dump($ar_label, ' ar_label');

				file_put_contents( DEDALO_LIB_BASE_PATH.$label_path, 'var get_label='.json_encode($ar_label,JSON_UNESCAPED_UNICODE).'');
				debug_log(__METHOD__." Generated js labels file for lang: $lang - $label_path ".to_string(), logger::DEBUG);
			}

		#
		# UPDATE STRUCTURE CSS
			$build_structure_css_response = (object)css::build_structure_css();
			if ($build_structure_css_response->result===false) {
				debug_log(__METHOD__." Error on build_structure_css: ".to_string($build_structure_css_response), logger::ERROR);
			}

		return $response;
	}//end update_structure



}//end area_development
